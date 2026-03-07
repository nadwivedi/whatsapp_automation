const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const {
  UserSetting,
  DEFAULT_PER_MOBILE_DAILY_LIMIT,
  DEFAULT_PER_MOBILE_HOURLY_LIMIT,
  DEFAULT_ANTI_BOT,
} = require("../models/UserSetting");
const whatsappSessionManager = require("./whatsappSessionManager");
const { parseRecipients } = require("../utils/phone");

const QUEUE_INTERVAL_MS = Number(process.env.QUEUE_INTERVAL_MS || 3000);
const MIN_GAP_PER_ACCOUNT_MS = Number(process.env.MIN_GAP_PER_ACCOUNT_MS || 4000);
const SAFEGUARD_PER_NUMBER_DAILY = Number(process.env.SAFEGUARD_PER_NUMBER_DAILY || 20);
const SAFEGUARD_PER_NUMBER_HOURLY = Number(process.env.SAFEGUARD_PER_NUMBER_HOURLY || 2);
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

class CampaignQueue {
  constructor() {
    this.timer = null;
    this.isTickRunning = false;
    // Tracks per-account: { lastSentAt, nextAllowedAt }
    this.accountCooldowns = new Map();
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

  /**
   * Per-account throttle: each account has its own cooldown.
   * When anti-bot is ON, a random delay (minDelayMs–maxDelayMs) is assigned
   * per-account after each send. Other accounts are NOT affected.
   * When anti-bot is OFF, the fixed MIN_GAP_PER_ACCOUNT_MS is used.
   */
  isAccountThrottled(accountId) {
    const key = String(accountId);
    const cooldown = this.accountCooldowns.get(key);
    if (!cooldown) {
      return false;
    }
    return Date.now() < cooldown.nextAllowedAt;
  }

  /**
   * After sending a message, set the per-account cooldown.
   * - Anti-bot ON: random delay between minDelayMs and maxDelayMs
   * - Anti-bot OFF: fixed MIN_GAP_PER_ACCOUNT_MS
   */
  markAccountSent(accountId, antiBot) {
    const now = Date.now();
    let cooldownMs;

    if (antiBot && antiBot.antiBotEnabled) {
      const minDelay = antiBot.minDelayMs || DEFAULT_ANTI_BOT.minDelayMs;
      const maxDelay = antiBot.maxDelayMs || DEFAULT_ANTI_BOT.maxDelayMs;
      cooldownMs = randomBetween(minDelay, maxDelay);

      // Occasional long pause (per-account)
      if (
        antiBot.longPauseEnabled &&
        Math.random() < (antiBot.longPauseChance || DEFAULT_ANTI_BOT.longPauseChance)
      ) {
        cooldownMs += randomBetween(
          antiBot.longPauseMinMs || DEFAULT_ANTI_BOT.longPauseMinMs,
          antiBot.longPauseMaxMs || DEFAULT_ANTI_BOT.longPauseMaxMs,
        );
      }
    } else {
      cooldownMs = MIN_GAP_PER_ACCOUNT_MS;
    }

    this.accountCooldowns.set(String(accountId), {
      lastSentAt: now,
      nextAllowedAt: now + cooldownMs,
    });
  }

  resetCampaignDailyWindowIfNeeded(campaign) {
    const now = Date.now();
    const dayStart = campaign.dayWindowStart ? new Date(campaign.dayWindowStart).getTime() : 0;

    if (!dayStart) {
      if ((Number(campaign.sentToday) || 0) !== 0) {
        campaign.dayWindowStart = new Date();
      }
      return;
    }

    if (now - dayStart >= DAILY_WINDOW_MS) {
      campaign.dayWindowStart = null;
      campaign.sentOn = null;
      campaign.sentToday = 0;
    }
  }

  getPerNumberDailySafeguard(campaign) {
    return campaign.perNumberDailySafeguard || SAFEGUARD_PER_NUMBER_DAILY;
  }

  getPerNumberHourlySafeguard(campaign) {
    return campaign.perNumberHourlySafeguard || SAFEGUARD_PER_NUMBER_HOURLY;
  }

  async getOwnerSettings(ownerId) {
    try {
      const settings = await UserSetting.getOrCreate(ownerId);
      return {
        perMobileDailyLimit: settings.perMobileDailyLimit || DEFAULT_PER_MOBILE_DAILY_LIMIT,
        perMobileHourlyLimit: settings.perMobileHourlyLimit || DEFAULT_PER_MOBILE_HOURLY_LIMIT,
        // Anti-Bot fields
        antiBotEnabled: settings.antiBotEnabled ?? DEFAULT_ANTI_BOT.antiBotEnabled,
        minDelayMs: settings.minDelayMs ?? DEFAULT_ANTI_BOT.minDelayMs,
        maxDelayMs: settings.maxDelayMs ?? DEFAULT_ANTI_BOT.maxDelayMs,
        typingSimulation: settings.typingSimulation ?? DEFAULT_ANTI_BOT.typingSimulation,
        typingDurationMs: settings.typingDurationMs ?? DEFAULT_ANTI_BOT.typingDurationMs,
        shuffleRecipients: settings.shuffleRecipients ?? DEFAULT_ANTI_BOT.shuffleRecipients,
        longPauseEnabled: settings.longPauseEnabled ?? DEFAULT_ANTI_BOT.longPauseEnabled,
        longPauseChance: settings.longPauseChance ?? DEFAULT_ANTI_BOT.longPauseChance,
        longPauseMinMs: settings.longPauseMinMs ?? DEFAULT_ANTI_BOT.longPauseMinMs,
        longPauseMaxMs: settings.longPauseMaxMs ?? DEFAULT_ANTI_BOT.longPauseMaxMs,
      };
    } catch (_error) {
      return {
        perMobileDailyLimit: DEFAULT_PER_MOBILE_DAILY_LIMIT,
        perMobileHourlyLimit: DEFAULT_PER_MOBILE_HOURLY_LIMIT,
        ...DEFAULT_ANTI_BOT,
      };
    }
  }

  buildRecipientSendPlan(recipients, maxMessages, perRecipientMessageLimit) {
    const capPerRecipient = Number.isFinite(Number(perRecipientMessageLimit))
      ? Math.max(1, Math.floor(Number(perRecipientMessageLimit)))
      : 1;
    const hardCapByRecipient = recipients.length * capPerRecipient;
    const targetTotal = Number.isFinite(Number(maxMessages))
      ? Math.min(Math.floor(Number(maxMessages)), hardCapByRecipient)
      : hardCapByRecipient;

    const plan = [];
    for (let round = 0; round < capPerRecipient && plan.length < targetTotal; round += 1) {
      for (const recipient of recipients) {
        if (plan.length >= targetTotal) break;
        plan.push(recipient);
      }
    }
    return plan;
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
    const perRecipientMessageLimit = Number.isFinite(Number(payload.perRecipientMessageLimit))
      ? Math.max(1, Math.floor(Number(payload.perRecipientMessageLimit)))
      : 1;
    const recipientSendPlan = this.buildRecipientSendPlan(
      recipients,
      payload.maxMessages,
      perRecipientMessageLimit,
    );
    if (!recipientSendPlan.length) {
      throw new Error("No messages can be queued with current per person message limit.");
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
      perRecipientMessageLimit,
      recipientPool: recipients,
      dateFrom: payload.dateFrom || null,
      dateTo: payload.dateTo || null,
      perNumberDailySafeguard:
        payload.perNumberDailySafeguard || SAFEGUARD_PER_NUMBER_DAILY,
      perNumberHourlySafeguard:
        payload.perNumberHourlySafeguard || SAFEGUARD_PER_NUMBER_HOURLY,
      status: "queued",
      totalRecipients: recipientSendPlan.length,
      queuedCount: recipientSendPlan.length,
    });

    const docs = recipientSendPlan.map((recipient, index) => ({
      owner: payload.ownerId,
      campaign: campaign._id,
      account: accountIds[index % accountIds.length],
      recipient,
      recipientMobileNumber: recipient,
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
      const ownerSettings = await this.getOwnerSettings(campaign.owner);
      const antiBot = ownerSettings;

      let messages = await CampaignMessage.find({
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

      // ── Anti-Bot: Shuffle pending messages ──
      if (antiBot.antiBotEnabled && antiBot.shuffleRecipients && messages.length > 1) {
        messages = shuffleArray(messages);
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
        const accountDailyLimit = Number(account.dailyLimit);
        const effectiveDailyCap =
          Number.isFinite(accountDailyLimit) && accountDailyLimit > 0
            ? Math.floor(accountDailyLimit)
            : ownerSettings.perMobileDailyLimit;
        const effectiveHourlyCap = ownerSettings.perMobileHourlyLimit;
        if (account.sentToday >= effectiveDailyCap) {
          await account.save();
          lastBlockReason = `Daily safeguard reached (${effectiveDailyCap}/24h) for one or more selected sessions.`;
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

        // Per-account throttle: only THIS account is checked for cooldown.
        // Other accounts can send freely even if this one is cooling down.
        if (this.isAccountThrottled(account._id)) {
          const cooldown = this.accountCooldowns.get(String(account._id));
          const remainingSec = cooldown
            ? Math.ceil((cooldown.nextAllowedAt - Date.now()) / 1000)
            : 0;
          lastBlockReason = antiBot.antiBotEnabled
            ? `Anti-bot: account ${account.phoneNumber || account.name || ""} cooling down (${remainingSec}s). Other accounts may still send.`
            : "Selected sessions are cooling down. Retrying shortly.";
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
        // ── Anti-Bot: Typing simulation (per-account, before send) ──
        if (antiBot.antiBotEnabled && antiBot.typingSimulation) {
          try {
            await whatsappSessionManager.simulateTyping(
              selectedAccount._id,
              selectedMessage.recipient,
              antiBot.typingDurationMs || DEFAULT_ANTI_BOT.typingDurationMs,
            );
          } catch (_typingError) {
            // Typing simulation failure should not block message delivery.
          }
        }

        const delivery = campaign.mediaData
          ? await whatsappSessionManager.sendMediaMessageDetailed(
            selectedAccount._id,
            selectedMessage.recipient,
            {
              mediaData: campaign.mediaData,
              mediaMimeType: campaign.mediaMimeType,
              mediaFileName: campaign.mediaFileName,
            },
            selectedMessage.text,
          )
          : await whatsappSessionManager.sendTextMessageDetailed(
            selectedAccount._id,
            selectedMessage.recipient,
            selectedMessage.text,
          );

        selectedMessage.status = "sent";
        selectedMessage.sentAt = new Date();
        selectedMessage.providerMessageId = delivery?.providerMessageId || null;
        selectedMessage.providerChatId = delivery?.providerChatId || null;
        selectedMessage.senderMobileNumber = selectedAccount.phoneNumber || null;
        selectedMessage.recipientMobileNumber =
          selectedMessage.recipientMobileNumber || selectedMessage.recipient;
        selectedMessage.tryCount += 1;
        selectedMessage.error = null;

        campaign.sentCount += 1;
        campaign.queuedCount -= 1;
        campaign.sentToday += 1;
        if (!campaign.dayWindowStart) {
          campaign.dayWindowStart = new Date();
        }
        campaign.lastError = null;

        selectedAccount.sentToday += 1;
        if (!selectedAccount.dayWindowStart) {
          selectedAccount.dayWindowStart = new Date();
        }
        selectedAccount.sentThisHour += 1;
        selectedAccount.hourWindowStart = new Date();

        // Per-account cooldown: set random delay for THIS account only.
        // Other accounts remain unaffected and can send immediately.
        this.markAccountSent(selectedAccount._id, antiBot);

        await Promise.all([selectedMessage.save(), campaign.save(), selectedAccount.save()]);
      } catch (error) {
        selectedMessage.status = "failed";
        selectedMessage.senderMobileNumber = selectedAccount.phoneNumber || null;
        selectedMessage.recipientMobileNumber =
          selectedMessage.recipientMobileNumber || selectedMessage.recipient;
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
