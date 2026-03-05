const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const whatsappSessionManager = require("./whatsappSessionManager");
const { parseRecipients } = require("../utils/phone");

const QUEUE_INTERVAL_MS = Number(process.env.QUEUE_INTERVAL_MS || 3000);
const MIN_GAP_PER_ACCOUNT_MS = Number(process.env.MIN_GAP_PER_ACCOUNT_MS || 4000);
const SAFEGUARD_PER_NUMBER_DAILY = Number(process.env.SAFEGUARD_PER_NUMBER_DAILY || 20);
const SAFEGUARD_PER_NUMBER_HOURLY = Number(process.env.SAFEGUARD_PER_NUMBER_HOURLY || 2);

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
    }, QUEUE_INTERVAL_MS);
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
    return Date.now() - lastSentAt < MIN_GAP_PER_ACCOUNT_MS;
  }

  markAccountSent(accountId) {
    this.lastSendByAccount.set(String(accountId), Date.now());
  }

  resetCampaignDailyWindowIfNeeded(campaign) {
    const today = new Date().toISOString().slice(0, 10);
    if (campaign.sentOn !== today) {
      campaign.sentOn = today;
      campaign.sentToday = 0;
    }
  }

  getPerNumberDailySafeguard(campaign) {
    return campaign.perNumberDailySafeguard || SAFEGUARD_PER_NUMBER_DAILY;
  }

  getPerNumberHourlySafeguard(campaign) {
    return campaign.perNumberHourlySafeguard || SAFEGUARD_PER_NUMBER_HOURLY;
  }

  async enqueueCampaign(payload) {
    let recipients = parseRecipients(payload.recipientsText || "");
    if (!recipients.length) {
      throw new Error("No valid recipient numbers were found.");
    }

    if (recipients.length > 5000) {
      throw new Error("Recipient list too large. Keep it <= 5000 numbers per campaign.");
    }
    if (payload.maxMessages != null) {
      recipients = recipients.slice(0, payload.maxMessages);
    }

    if (!payload.ownerId) {
      throw new Error("ownerId is required.");
    }

    const accountIds = Array.isArray(payload.accountIds) ? payload.accountIds : [];
    if (!accountIds.length) {
      throw new Error("At least one account is required.");
    }

    const accounts = await WaAccount.find({
      _id: { $in: accountIds },
      owner: payload.ownerId,
      isActive: true,
    }).select("_id");
    if (accounts.length !== accountIds.length) {
      throw new Error("One or more selected WhatsApp accounts are invalid.");
    }

    const messageBody = (payload.messageBody || "").trim();
    const mediaData = payload.mediaData || null;
    if (!messageBody && !mediaData) {
      throw new Error("Campaign needs message text or media.");
    }

    const title = (payload.title || "").trim() || `Campaign ${new Date().toLocaleString()}`;

    const campaign = await Campaign.create({
      owner: payload.ownerId,
      account: accountIds[0],
      accounts: accountIds,
      template: payload.templateId || null,
      title,
      messageBody,
      mediaType: payload.mediaType || null,
      mediaMimeType: payload.mediaMimeType || null,
      mediaData,
      mediaFileName: payload.mediaFileName || null,
      maxMessages: payload.maxMessages || null,
      dailyMessageLimit: payload.dailyMessageLimit || null,
      dateFrom: payload.dateFrom || null,
      dateTo: payload.dateTo || null,
      perNumberDailySafeguard:
        payload.perNumberDailySafeguard || SAFEGUARD_PER_NUMBER_DAILY,
      perNumberHourlySafeguard:
        payload.perNumberHourlySafeguard || SAFEGUARD_PER_NUMBER_HOURLY,
      status: "queued",
      totalRecipients: recipients.length,
      queuedCount: recipients.length,
    });

    const docs = recipients.map((recipient, index) => ({
      owner: payload.ownerId,
      campaign: campaign._id,
      account: accountIds[index % accountIds.length],
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

      const today = new Date().toISOString().slice(0, 10);
      if (campaign.dateFrom && today < campaign.dateFrom) {
        campaign.lastError = `Campaign is scheduled from ${campaign.dateFrom}.`;
        await campaign.save();
        return;
      }
      if (campaign.dateTo && today > campaign.dateTo) {
        const pendingCount = await CampaignMessage.countDocuments({
          owner: campaign.owner,
          campaign: campaign._id,
          status: "pending",
        });
        campaign.failedCount += pendingCount;
        campaign.queuedCount = 0;
        campaign.status = campaign.sentCount > 0 ? "completed" : "failed";
        campaign.completedAt = new Date();
        campaign.lastError = `Campaign window ended on ${campaign.dateTo}.`;
        await Promise.all([
          campaign.save(),
          CampaignMessage.updateMany(
            { owner: campaign.owner, campaign: campaign._id, status: "pending" },
            { $set: { status: "failed", error: `Campaign window ended on ${campaign.dateTo}.` } },
          ),
        ]);
        return;
      }
      this.resetCampaignDailyWindowIfNeeded(campaign);
      if (campaign.dailyMessageLimit && campaign.sentToday >= campaign.dailyMessageLimit) {
        campaign.lastError = `Daily campaign limit reached (${campaign.dailyMessageLimit}/day).`;
        await campaign.save();
        return;
      }

      const messages = await CampaignMessage.find({
        owner: campaign.owner,
        campaign: campaign._id,
        status: "pending",
      })
        .sort({ createdAt: 1 })
        .limit(50);

      if (!messages.length) {
        await this.finishCampaignIfDone(campaign);
        return;
      }

      const accountCache = new Map();
      let selectedMessage = null;
      let selectedAccount = null;
      let lastBlockReason = "No available account can send right now.";

      for (const candidate of messages) {
        const key = String(candidate.account);
        let account = accountCache.get(key);
        if (account === undefined) {
          account = await WaAccount.findById(candidate.account);
          accountCache.set(key, account || null);
        }

        if (!account) {
          candidate.status = "failed";
          candidate.tryCount += 1;
          candidate.error = "Account not found.";
          campaign.failedCount += 1;
          campaign.queuedCount -= 1;
          campaign.lastError = "One of the selected accounts was removed.";
          await Promise.all([candidate.save(), campaign.save()]);
          await this.finishCampaignIfDone(campaign);
          return;
        }

        if (String(account.owner) !== String(campaign.owner) || !account.isActive) {
          candidate.status = "failed";
          candidate.tryCount += 1;
          candidate.error = "Campaign ownership mismatch.";
          campaign.failedCount += 1;
          campaign.queuedCount -= 1;
          campaign.lastError = "One of the selected accounts is invalid.";
          await Promise.all([candidate.save(), campaign.save()]);
          await this.finishCampaignIfDone(campaign);
          return;
        }

        WaAccount.resetDailyWindowIfNeeded(account);
        WaAccount.resetHourlyWindowIfNeeded(account);
        const effectiveDailyCap = Math.min(
          account.dailyLimit,
          this.getPerNumberDailySafeguard(campaign),
        );
        const effectiveHourlyCap = this.getPerNumberHourlySafeguard(campaign);
        if (account.sentToday >= effectiveDailyCap) {
          await account.save();
          lastBlockReason = `Daily safeguard reached (${effectiveDailyCap}/day) for one or more selected sessions.`;
          continue;
        }
        if (account.sentThisHour >= effectiveHourlyCap) {
          await account.save();
          lastBlockReason = `Hourly safeguard reached (${effectiveHourlyCap}/hour) for one or more selected sessions.`;
          continue;
        }
        if (account.status !== "authenticated") {
          lastBlockReason = "One or more selected sessions are not authenticated.";
          continue;
        }
        if (this.isAccountThrottled(account._id)) {
          lastBlockReason = "Selected sessions are cooling down. Retrying shortly.";
          continue;
        }

        selectedMessage = candidate;
        selectedAccount = account;
        break;
      }

      if (!selectedMessage || !selectedAccount) {
        campaign.lastError = lastBlockReason;
        await campaign.save();
        return;
      }

      try {
        const providerMessageId = campaign.mediaData
          ? await whatsappSessionManager.sendMediaMessage(
              selectedAccount._id,
              selectedMessage.recipient,
              {
                mediaData: campaign.mediaData,
                mediaMimeType: campaign.mediaMimeType,
                mediaFileName: campaign.mediaFileName,
              },
              selectedMessage.text,
            )
          : await whatsappSessionManager.sendTextMessage(
              selectedAccount._id,
              selectedMessage.recipient,
              selectedMessage.text,
            );

        selectedMessage.status = "sent";
        selectedMessage.sentAt = new Date();
        selectedMessage.providerMessageId = providerMessageId;
        selectedMessage.tryCount += 1;
        selectedMessage.error = null;

        campaign.sentCount += 1;
        campaign.queuedCount -= 1;
        campaign.sentToday += 1;
        campaign.lastError = null;

        selectedAccount.sentToday += 1;
        selectedAccount.sentThisHour += 1;
        this.markAccountSent(selectedAccount._id);

        await Promise.all([selectedMessage.save(), campaign.save(), selectedAccount.save()]);
      } catch (error) {
        selectedMessage.status = "failed";
        selectedMessage.tryCount += 1;
        selectedMessage.error = error.message;
        campaign.failedCount += 1;
        campaign.queuedCount -= 1;
        campaign.lastError = error.message;

        await Promise.all([selectedMessage.save(), campaign.save()]);
      }

      await this.finishCampaignIfDone(campaign);
    } finally {
      this.isTickRunning = false;
    }
  }
}

module.exports = new CampaignQueue();
