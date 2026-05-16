const mongoose = require("mongoose");
const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const { Contact } = require("../models/contact");
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

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Message Spinning: replaces {option1|option2|option3} with a random pick.
 * Supports multiple spin groups in the same message.
 * Example: "{Hi|Hello|Hey} {friend|buddy}, how are you?" → "Hello buddy, how are you?"
 */
function spinMessage(text) {
  if (!text) return text;
  return text.replace(/\{([^{}]+)\}/g, (_match, group) => {
    if (!group.includes("|")) return _match;
    const options = group.split("|").map((s) => s.trim()).filter(Boolean);
    if (!options.length) return "";
    return options[Math.floor(Math.random() * options.length)];
  });
}

function renderContactVariables(text, contact, recipient) {
  if (!text) return text;

  const contactName = String(contact?.name || "").trim();
  const firstName = contactName ? contactName.split(/\s+/)[0] : "Customer";
  const replacements = {
    name: contactName || "Customer",
    contact_name: contactName || "Customer",
    business_name: contactName || "Customer",
    first_name: firstName,
    mobile: String(recipient || "").trim(),
  };

  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, token) => {
    const key = String(token || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(replacements, key)
      ? replacements[key]
      : match;
  });
}

/**
 * Calculate warm-up daily limit for an account based on its age.
 * Linear ramp from warmUpStartLimit to the full dailyLimit over warmUpDays.
 */
function getWarmUpDailyLimit(account, fullDailyLimit, antiBot) {
  if (!antiBot.antiBotEnabled || !antiBot.warmUpEnabled) {
    return fullDailyLimit;
  }

  const firstSentAt = account.firstCampaignSentAt
    ? new Date(account.firstCampaignSentAt).getTime()
    : 0;

  // Never sent before — use start limit
  if (!firstSentAt) {
    return antiBot.warmUpStartLimit || DEFAULT_ANTI_BOT.warmUpStartLimit;
  }

  const daysSinceFirst = (Date.now() - firstSentAt) / DAILY_WINDOW_MS;
  const warmUpDays = antiBot.warmUpDays || DEFAULT_ANTI_BOT.warmUpDays;
  const startLimit = antiBot.warmUpStartLimit || DEFAULT_ANTI_BOT.warmUpStartLimit;

  if (daysSinceFirst >= warmUpDays) {
    return fullDailyLimit; // Warm-up complete
  }

  // Linear interpolation: startLimit → fullDailyLimit over warmUpDays
  const progress = daysSinceFirst / warmUpDays;
  const warmUpLimit = Math.round(startLimit + (fullDailyLimit - startLimit) * progress);
  return Math.max(startLimit, Math.min(fullDailyLimit, warmUpLimit));
}

/**
 * Check if current time is within business hours.
 */
function isWithinBusinessHours(antiBot) {
  if (!antiBot.antiBotEnabled || !antiBot.businessHoursEnabled) {
    return true; // feature off = always OK
  }

  const now = new Date();
  const currentHour = now.getHours();
  const start = antiBot.businessHoursStart ?? DEFAULT_ANTI_BOT.businessHoursStart;
  const end = antiBot.businessHoursEnd ?? DEFAULT_ANTI_BOT.businessHoursEnd;

  if (start <= end) {
    // Normal range: e.g. 9-21
    return currentHour >= start && currentHour < end;
  }
  // Wrapping range: e.g. 22-6 (night shift)
  return currentHour >= start || currentHour < end;
}

class CampaignQueue {
  constructor() {
    this.timer = null;
    this.isTickRunning = false;
    this.accountCooldowns = new Map();
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch(() => { });
    }, QUEUE_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isAccountThrottled(accountId) {
    const key = String(accountId);
    const cooldown = this.accountCooldowns.get(key);
    if (!cooldown) {
      return false;
    }
    return Date.now() < cooldown.nextAllowedAt;
  }

  markAccountSent(accountId, antiBot) {
    const now = Date.now();
    let cooldownMs;

    if (antiBot && antiBot.antiBotEnabled) {
      const minDelay = antiBot.minDelayMs || DEFAULT_ANTI_BOT.minDelayMs;
      const maxDelay = antiBot.maxDelayMs || DEFAULT_ANTI_BOT.maxDelayMs;
      cooldownMs = randomBetween(minDelay, maxDelay);

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

  async cleanupIdleSessions() {
    const activeAccountIds = Array.from(whatsappSessionManager.clients.keys());
    if (activeAccountIds.length === 0) return;

    for (const accountId of activeAccountIds) {
      const account = await WaAccount.findById(accountId);
      if (!account) continue;

      // Don't cleanup if user is currently authenticating/scanning
      if (["initializing", "qr_ready"].includes(account.status)) {
        continue;
      }

      // 1. Check if limit reached
      const ownerSettings = await this.getOwnerSettings(account.owner);
      const antiBot = ownerSettings;
      const checkDailyCap = getWarmUpDailyLimit(account,
        (Number.isFinite(Number(account.dailyLimit)) && account.dailyLimit > 0
          ? Math.floor(account.dailyLimit)
          : ownerSettings.perMobileDailyLimit),
        antiBot);
      const checkHourlyCap = ownerSettings.perMobileHourlyLimit;

      if (account.sentToday >= checkDailyCap || account.sentThisHour >= checkHourlyCap) {
        console.log(`[QUEUE] Account ${account.phoneNumber || account._id} has reached its limit. Destroying session in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await whatsappSessionManager.sleepSession(accountId).catch(() => { });
        continue;
      }

      // 2. Is there ANY pending message for this account in ANY running/queued campaign?
      // Use explicit ObjectId casting to ensure query matches
      const hasWork = await CampaignMessage.exists({
        account: new mongoose.Types.ObjectId(accountId),
        status: "pending",
      });

      if (!hasWork) {
        console.log(`[QUEUE] Account ${account.phoneNumber || account._id} has no more work. Destroying session in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        await whatsappSessionManager.sleepSession(accountId).catch(() => { });
      }
    }
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
        // Phase 1
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
        // Phase 2
        messageSpinning: settings.messageSpinning ?? DEFAULT_ANTI_BOT.messageSpinning,
        businessHoursEnabled: settings.businessHoursEnabled ?? DEFAULT_ANTI_BOT.businessHoursEnabled,
        businessHoursStart: settings.businessHoursStart ?? DEFAULT_ANTI_BOT.businessHoursStart,
        businessHoursEnd: settings.businessHoursEnd ?? DEFAULT_ANTI_BOT.businessHoursEnd,
        warmUpEnabled: settings.warmUpEnabled ?? DEFAULT_ANTI_BOT.warmUpEnabled,
        warmUpDays: settings.warmUpDays ?? DEFAULT_ANTI_BOT.warmUpDays,
        warmUpStartLimit: settings.warmUpStartLimit ?? DEFAULT_ANTI_BOT.warmUpStartLimit,
        readReceiptsBeforeSend: settings.readReceiptsBeforeSend ?? DEFAULT_ANTI_BOT.readReceiptsBeforeSend,
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
    const pendingCount = await CampaignMessage.countDocuments({
      campaign: campaign._id,
      status: "pending",
    });

    if (pendingCount > 0) {
      if (campaign.queuedCount !== pendingCount) {
        campaign.queuedCount = pendingCount;
        await campaign.save();
      }
      return campaign;
    }

    const finalStatus = campaign.sentCount > 0 ? "completed" : "failed";
    campaign.status = finalStatus;
    campaign.queuedCount = 0;
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
      // ── Auto-Retry: Reset transiently failed messages back to pending ──
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const retryResult = await CampaignMessage.updateMany(
        {
          status: "failed",
          updatedAt: { $gte: startOfDay },
          error: { $regex: /not initialized|paused|State: null|State: undefined|Target closed|Session closed|Protocol error|Protocol error \(Page.printToPDF\)|Execution context was destroyed/i }
        },
        {
          $set: {
            status: "pending",
            error: null
          },
          $inc: { tryCount: -1 }
        }
      );
      if (retryResult.modifiedCount > 0) {
        console.log(`[QUEUE] Reset ${retryResult.modifiedCount} transiently failed messages for retry.`);
      }

      const contactCache = new Map();

      const activeCampaigns = await Campaign.find({
        status: { $in: ["queued", "running"] },
      }).sort({ createdAt: 1 }).limit(5);

      if (!activeCampaigns.length) {
        await this.cleanupIdleSessions();
        return;
      }

      let selectedCampaignDoc = null;
      let selectedMessage = null;
      let selectedAccount = null;
      let selectedAntiBot = null;
      let globalLastBlockReason = "No eligible campaign can proceed right now.";

      for (const campaign of activeCampaigns) {
        if (campaign.status === "queued") {
          campaign.status = "running";
          campaign.startedAt = new Date();
          await campaign.save();
        }

        const today = new Date().toISOString().slice(0, 10);
        if (campaign.dateFrom && today < campaign.dateFrom) {
          campaign.lastError = `Campaign is scheduled from ${campaign.dateFrom}.`;
          await campaign.save();
          continue;
        }
        if (campaign.dateTo && today > campaign.dateTo) {
          const pendingCount = await CampaignMessage.countDocuments({
            owner: campaign.owner,
            campaign: campaign._id,
            status: "pending",
          });
          campaign.failedCount = (campaign.failedCount || 0) + pendingCount;
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
          continue;
        }

        this.resetCampaignDailyWindowIfNeeded(campaign);
        const ownerSettings = await this.getOwnerSettings(campaign.owner);
        const antiBot = ownerSettings;

        // ── Business Hours check ──
        if (!isWithinBusinessHours(antiBot)) {
          const start = antiBot.businessHoursStart ?? 9;
          const end = antiBot.businessHoursEnd ?? 21;
          campaign.lastError = `Outside business hours (${start}:00–${end}:00). Will resume during business hours.`;
          await campaign.save();
          continue;
        }

        let messages = await CampaignMessage.find({
          owner: campaign.owner,
          campaign: campaign._id,
          status: "pending",
        })
          .sort({ createdAt: 1 })
          .limit(50);

        if (!messages.length) {
          await this.finishCampaignIfDone(campaign);
          continue;
        }

        // ── Anti-Bot: Shuffle pending messages ──
        if (antiBot.antiBotEnabled && antiBot.shuffleRecipients && messages.length > 1) {
          messages = shuffleArray(messages);
        }

        const accountCache = new Map();
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
            continue;
          }

          if (String(account.owner) !== String(campaign.owner) || !account.isActive) {
            candidate.status = "failed";
            candidate.tryCount += 1;
            candidate.error = "Campaign ownership mismatch.";
            campaign.failedCount += 1;
            campaign.queuedCount -= 1;
            campaign.lastError = "One of the selected accounts is invalid.";
            await Promise.all([candidate.save(), campaign.save()]);
            continue;
          }

          WaAccount.resetDailyWindowIfNeeded(account);
          WaAccount.resetHourlyWindowIfNeeded(account);

          const accountDailyLimit = Number(account.dailyLimit);
          const rawDailyCap =
            Number.isFinite(accountDailyLimit) && accountDailyLimit > 0
              ? Math.floor(accountDailyLimit)
              : antiBot.perMobileDailyLimit;

          const effectiveDailyCap = getWarmUpDailyLimit(account, rawDailyCap, antiBot);
          const effectiveHourlyCap = antiBot.perMobileHourlyLimit;

          // ── Rule 2 & 3: Check limits BEFORE opening session ──
          if (account.sentToday >= effectiveDailyCap) {
            // If a session is open for this account, close it immediately
            if (whatsappSessionManager.hasClient(account._id)) {
              console.log(`[QUEUE] Account ${account.phoneNumber || account._id} hit daily limit (${account.sentToday}/${effectiveDailyCap}). Closing session immediately.`);
              whatsappSessionManager.sleepSession(account._id).catch(() => {});
            }
            const isWarmingUp = antiBot.antiBotEnabled && antiBot.warmUpEnabled && effectiveDailyCap < rawDailyCap;
            lastBlockReason = isWarmingUp
              ? `Warm-up limit reached (${effectiveDailyCap}/${rawDailyCap} daily) for ${account.phoneNumber || account.name || "account"}. Limit increases daily.`
              : `Daily limit reached (${account.sentToday}/${effectiveDailyCap}) for ${account.phoneNumber || account.name || "account"}.`;
            await account.save();
            continue;
          }
          if (account.sentThisHour >= effectiveHourlyCap) {
            if (whatsappSessionManager.hasClient(account._id)) {
              console.log(`[QUEUE] Account ${account.phoneNumber || account._id} hit hourly limit (${account.sentThisHour}/${effectiveHourlyCap}). Closing session immediately.`);
              whatsappSessionManager.sleepSession(account._id).catch(() => {});
            }
            lastBlockReason = `Hourly limit reached (${account.sentThisHour}/${effectiveHourlyCap}) for ${account.phoneNumber || account.name || "account"}.`;
            await account.save();
            continue;
          }

          // ── Rule 1 & 4: Only open session if limits are free AND there's work ──
          if (!whatsappSessionManager.hasClient(account._id)) {
            // Fire session startup in the BACKGROUND — do NOT await.
            // Awaiting blocks isTickRunning for 20-30s (Puppeteer startup time).
            // The next tick (3s later) will see the session is ready and send immediately.
            const alreadyStarting = whatsappSessionManager.startingSessions.has(String(account._id));
            if (!alreadyStarting) {
              console.log(`[QUEUE] Starting session for ${account.phoneNumber || account._id} in background...`);
              whatsappSessionManager.startSession(account._id).catch(err => {
                console.error(`[QUEUE] Background session start failed for ${account.phoneNumber || account._id}:`, err.message);
              });
            }
            lastBlockReason = `Session for ${account.phoneNumber || account._id} is starting up. Will send on next tick.`;
            continue; // Don't block — check next candidate or next campaign
          }

          // Always re-fetch account from DB to get the TRUE current status.
          account = await WaAccount.findById(account._id);
          if (!account) {
            lastBlockReason = "Account disappeared from DB.";
            continue;
          }
          accountCache.set(String(account._id), account);

          // ── Rule 6: After opening, verify the session is actually authenticated ──
          if (account.status !== "authenticated") {
            // If it's actively initializing or scanning QR, give it time — don't penalize
            if (account.status === "initializing" || account.status === "qr_ready") {
              lastBlockReason = `Session for ${account.phoneNumber || account._id} is starting up (${account.status}). Waiting...`;
              continue;
            }

            // Any other non-authenticated state = Unable to Connect — mark it and skip
            console.warn(`[QUEUE] Account ${account.phoneNumber || account._id} is not authenticated (status: ${account.status}). Marking as disconnected — requires re-login.`);
            await WaAccount.findByIdAndUpdate(account._id, {
              status: "disconnected",
              lastError: `Session could not authenticate (was: ${account.status}). Please scan QR to reconnect.`,
              qrCodeDataUrl: null,
            });
            whatsappSessionManager.sleepSession(account._id).catch(() => {});
            lastBlockReason = `Account ${account.phoneNumber || account._id} is disconnected. Needs re-login.`;
            continue;
          }

          if (this.isAccountThrottled(account._id)) {
            const cooldown = this.accountCooldowns.get(String(account._id));
            const remainingSec = cooldown
              ? Math.ceil((cooldown.nextAllowedAt - Date.now()) / 1000)
              : 0;
            lastBlockReason = antiBot.antiBotEnabled
              ? `Anti-bot: ${account.phoneNumber || account.name || ""} cooling down (${remainingSec}s remaining).`
              : "Session is cooling down between messages. Retrying shortly.";
            continue;
          }

          selectedMessage = candidate;
          selectedAccount = account;
          selectedAntiBot = antiBot;
          break; // Found message for THIS campaign
        }

        if (selectedMessage && selectedAccount) {
          selectedCampaignDoc = campaign;
          break; // Found message to send! Exit campaign loop
        } else {
          campaign.lastError = lastBlockReason;
          globalLastBlockReason = lastBlockReason;
          await campaign.save();
          // continue to next campaign
        }
      }

      if (!selectedMessage || !selectedAccount || !selectedCampaignDoc) {
        return;
      }

      const campaign = selectedCampaignDoc;
      const antiBot = selectedAntiBot;

      try {
        // ── Anti-Bot: Read receipts (mark chat as read before sending) ──
        if (antiBot.antiBotEnabled && antiBot.readReceiptsBeforeSend) {
          try {
            await whatsappSessionManager.markChatRead(
              selectedAccount._id,
              selectedMessage.recipient,
            );
          } catch (_readError) {
            // Non-fatal
          }
        }

        // ── Anti-Bot: Typing simulation ──
        if (antiBot.antiBotEnabled && antiBot.typingSimulation) {
          try {
            await whatsappSessionManager.simulateTyping(
              selectedAccount._id,
              selectedMessage.recipient,
              antiBot.typingDurationMs || DEFAULT_ANTI_BOT.typingDurationMs,
            );
          } catch (_typingError) {
            // Non-fatal
          }
        }

        // Render contact variables before optional message spinning.
        let contact = contactCache.get(selectedMessage.recipient);
        if (contact === undefined) {
          contact = await Contact.findOne({
            userId: campaign.owner,
            mobile: selectedMessage.recipient,
          }).select("name mobile");
          contactCache.set(selectedMessage.recipient, contact || null);
        }

        let messageText = renderContactVariables(
          selectedMessage.text,
          contact,
          selectedMessage.recipient,
        );
        
        // Always run spinning if user included the {a|b} syntax
        messageText = spinMessage(messageText);

        const delivery = campaign.mediaData
          ? await whatsappSessionManager.sendMediaMessageDetailed(
            selectedAccount._id,
            selectedMessage.recipient,
            {
              mediaData: campaign.mediaData,
              mediaMimeType: campaign.mediaMimeType,
              mediaFileName: campaign.mediaFileName,
            },
            messageText,
          )
          : await whatsappSessionManager.sendTextMessageDetailed(
            selectedAccount._id,
            selectedMessage.recipient,
            messageText,
          );

        selectedMessage.status = "sent";
        selectedMessage.sentAt = new Date();
        selectedMessage.text = messageText; // Store the spun version
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
        if (!selectedAccount.hourWindowStart) {
          selectedAccount.hourWindowStart = new Date();
        }

        // ── Warm-Up: track first campaign send time ──
        if (!selectedAccount.firstCampaignSentAt) {
          selectedAccount.firstCampaignSentAt = new Date();
        }

        this.markAccountSent(selectedAccount._id, antiBot);

        const contactUpdate = Contact.updateOne(
          { userId: campaign.owner, mobile: selectedMessage.recipient },
          { $inc: { messagesSent: 1 } }
        ).exec().catch(err => console.error("Error updating messagesSent:", err));

        await Promise.all([selectedMessage.save(), campaign.save(), selectedAccount.save(), contactUpdate]);

        // ── Rule 3 & 6: Close session after limit hit or no more work ──
        // IMPORTANT: We wait 3 seconds before closing the session.
        // whatsapp-web.js resolves sendMessage() when the message is queued in the browser,
        // not when it is transmitted to WhatsApp servers. Closing Puppeteer immediately
        // kills the transmission mid-flight, marking messages as "sent" but never delivering them.
        const DELIVERY_BUFFER_MS = 3000;

        const checkDailyCap = getWarmUpDailyLimit(selectedAccount,
          (Number.isFinite(Number(selectedAccount.dailyLimit)) && selectedAccount.dailyLimit > 0
            ? Math.floor(selectedAccount.dailyLimit)
            : antiBot.perMobileDailyLimit),
          antiBot);
        const checkHourlyCap = antiBot.perMobileHourlyLimit;

        if (selectedAccount.sentToday >= checkDailyCap) {
          console.log(`[QUEUE] ✓ Sent. Account ${selectedAccount.phoneNumber || selectedAccount._id} hit daily limit (${selectedAccount.sentToday}/${checkDailyCap}). Closing session in ${DELIVERY_BUFFER_MS / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, DELIVERY_BUFFER_MS));
          await whatsappSessionManager.sleepSession(selectedAccount._id).catch(() => {});
        } else if (selectedAccount.sentThisHour >= checkHourlyCap) {
          console.log(`[QUEUE] ✓ Sent. Account ${selectedAccount.phoneNumber || selectedAccount._id} hit hourly limit (${selectedAccount.sentThisHour}/${checkHourlyCap}). Closing session in ${DELIVERY_BUFFER_MS / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, DELIVERY_BUFFER_MS));
          await whatsappSessionManager.sleepSession(selectedAccount._id).catch(() => {});
        } else {
          // Check if this account has ANY remaining pending messages across all campaigns
          const hasMoreWork = await CampaignMessage.exists({
            account: new mongoose.Types.ObjectId(selectedAccount._id),
            status: "pending",
          });
          if (!hasMoreWork) {
            console.log(`[QUEUE] ✓ Sent. Account ${selectedAccount.phoneNumber || selectedAccount._id} has no more pending work. Closing session in ${DELIVERY_BUFFER_MS / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, DELIVERY_BUFFER_MS));
            await whatsappSessionManager.sleepSession(selectedAccount._id).catch(() => {});
          }
        }
      } catch (error) {
        console.error(`[QUEUE] Tick error:`, error);
        if (selectedMessage) {
          selectedMessage.status = "failed";
          selectedMessage.senderMobileNumber = selectedAccount?.phoneNumber || null;
          selectedMessage.recipientMobileNumber =
            selectedMessage.recipientMobileNumber || selectedMessage.recipient;
          selectedMessage.tryCount += 1;
          selectedMessage.error = error.message;
          await selectedMessage.save().catch(() => {});
        }
        
        if (campaign) {
          campaign.failedCount = (campaign.failedCount || 0) + (selectedMessage ? 1 : 0);
          campaign.queuedCount = Math.max(0, (campaign.queuedCount || 0) - (selectedMessage ? 1 : 0));
          campaign.lastError = error.message;
          await campaign.save().catch(() => {});
        }
      }

      await this.finishCampaignIfDone(campaign);
    } finally {
      this.isTickRunning = false;
      await this.cleanupIdleSessions().catch(() => { });
    }
  }
}

module.exports = new CampaignQueue();
