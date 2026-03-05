const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const whatsappSessionManager = require("./whatsappSessionManager");
const settings = require("../config/settings");
const { parseRecipients } = require("../utils/phone");

class CampaignQueue {
  constructor() {
    this.timer = null;
    this.isTickRunning = false;
    this.lastSendByAccount = new Map();
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch(() => {
        // Avoid process crash, errors are persisted in DB.
      });
    }, settings.queueIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isAccountThrottled(accountId) {
    const lastSentAt = this.lastSendByAccount.get(String(accountId));
    if (!lastSentAt) {
      return false;
    }
    return Date.now() - lastSentAt < settings.minGapPerAccountMs;
  }

  markAccountSent(accountId) {
    this.lastSendByAccount.set(String(accountId), Date.now());
  }

  async enqueueCampaign(payload) {
    const recipients = parseRecipients(payload.recipientsText || "");
    if (!recipients.length) {
      throw new Error("No valid recipient numbers were found.");
    }

    if (recipients.length > 5000) {
      throw new Error("Recipient list too large. Keep it <= 5000 numbers per campaign.");
    }

    const account = await WaAccount.findById(payload.accountId);
    if (!account || !account.isActive) {
      throw new Error("Selected WhatsApp account does not exist.");
    }

    const messageBody = (payload.messageBody || "").trim();
    if (!messageBody) {
      throw new Error("Message body is required.");
    }

    const title = (payload.title || "").trim() || `Campaign ${new Date().toLocaleString()}`;

    const campaign = await Campaign.create({
      account: account._id,
      template: payload.templateId || null,
      title,
      messageBody,
      status: "queued",
      totalRecipients: recipients.length,
      queuedCount: recipients.length,
    });

    const docs = recipients.map((recipient) => ({
      campaign: campaign._id,
      account: account._id,
      recipient,
      text: messageBody,
      status: "pending",
    }));

    await CampaignMessage.insertMany(docs);
    return campaign;
  }

  async finishCampaignIfDone(campaign) {
    if (campaign.queuedCount > 0) {
      return campaign;
    }

    const finalStatus = campaign.sentCount > 0 ? "completed" : "failed";
    campaign.status = finalStatus;
    campaign.completedAt = new Date();
    await campaign.save();
    return campaign;
  }

  async tick() {
    if (this.isTickRunning) {
      return;
    }
    this.isTickRunning = true;

    try {
      const campaign = await Campaign.findOne({
        status: { $in: ["queued", "running"] },
      }).sort({ createdAt: 1 });

      if (!campaign) {
        return;
      }

      if (campaign.status === "queued") {
        campaign.status = "running";
        campaign.startedAt = new Date();
        await campaign.save();
      }

      const account = await WaAccount.findById(campaign.account);
      if (!account) {
        campaign.status = "failed";
        campaign.lastError = "Source WhatsApp account is missing.";
        campaign.completedAt = new Date();
        await campaign.save();
        await CampaignMessage.updateMany(
          { campaign: campaign._id, status: "pending" },
          { $set: { status: "failed", error: "Account not found." } },
        );
        return;
      }

      WaAccount.resetDailyWindowIfNeeded(account);
      if (account.sentToday >= account.dailyLimit) {
        campaign.lastError = "Daily limit reached for this WhatsApp number.";
        await Promise.all([campaign.save(), account.save()]);
        return;
      }

      if (account.status !== "authenticated") {
        campaign.lastError = "Account not authenticated. Scan QR and wait for connected status.";
        await campaign.save();
        return;
      }

      if (this.isAccountThrottled(account._id)) {
        return;
      }

      const message = await CampaignMessage.findOne({
        campaign: campaign._id,
        status: "pending",
      }).sort({ createdAt: 1 });

      if (!message) {
        await this.finishCampaignIfDone(campaign);
        return;
      }

      try {
        const providerMessageId = await whatsappSessionManager.sendTextMessage(
          account._id,
          message.recipient,
          message.text,
        );

        message.status = "sent";
        message.sentAt = new Date();
        message.providerMessageId = providerMessageId;
        message.tryCount += 1;
        message.error = null;

        campaign.sentCount += 1;
        campaign.queuedCount -= 1;
        campaign.lastError = null;

        account.sentToday += 1;
        this.markAccountSent(account._id);

        await Promise.all([message.save(), campaign.save(), account.save()]);
      } catch (error) {
        message.status = "failed";
        message.tryCount += 1;
        message.error = error.message;
        campaign.failedCount += 1;
        campaign.queuedCount -= 1;
        campaign.lastError = error.message;

        await Promise.all([message.save(), campaign.save()]);
      }

      await this.finishCampaignIfDone(campaign);
    } finally {
      this.isTickRunning = false;
    }
  }
}

module.exports = new CampaignQueue();
