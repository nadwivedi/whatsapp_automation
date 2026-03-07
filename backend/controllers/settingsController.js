const { WaAccount } = require("../models/WaAccount");
const { UserSetting, DEFAULT_ANTI_BOT } = require("../models/UserSetting");

function serializeSettings(settings) {
  return {
    id: settings._id,
    owner: settings.owner,
    perMobileDailyLimit: settings.perMobileDailyLimit,
    perMobileHourlyLimit: settings.perMobileHourlyLimit,
    // Anti-Bot Detection
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
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

async function buildCapacity(ownerId, perMobileDailyLimit, perMobileHourlyLimit) {
  const activeConnectedAccounts = await WaAccount.find({
    owner: ownerId,
    isActive: true,
    status: "authenticated",
  }).select("dailyLimit sentToday dayWindowStart sentThisHour hourWindowStart");

  const updates = [];
  for (const account of activeConnectedAccounts) {
    const prevSentToday = account.sentToday;
    const prevDayWindowStart = account.dayWindowStart
      ? new Date(account.dayWindowStart).getTime()
      : 0;
    const prevSentThisHour = account.sentThisHour;
    const prevHourWindowStart = account.hourWindowStart
      ? new Date(account.hourWindowStart).getTime()
      : 0;

    WaAccount.resetDailyWindowIfNeeded(account);
    WaAccount.resetHourlyWindowIfNeeded(account);

    const nextDayWindowStart = account.dayWindowStart
      ? new Date(account.dayWindowStart).getTime()
      : 0;
    const nextHourWindowStart = account.hourWindowStart
      ? new Date(account.hourWindowStart).getTime()
      : 0;
    const hasChanged =
      prevSentToday !== account.sentToday ||
      prevDayWindowStart !== nextDayWindowStart ||
      prevSentThisHour !== account.sentThisHour ||
      prevHourWindowStart !== nextHourWindowStart;

    if (hasChanged) {
      updates.push(account.save());
    }
  }

  if (updates.length) {
    await Promise.all(updates);
  }

  const activeConnectedCount = activeConnectedAccounts.length;
  const perAccountDailyCaps = activeConnectedAccounts.map((account) => {
    const accountDailyLimit = Number(account.dailyLimit);
    if (Number.isFinite(accountDailyLimit) && accountDailyLimit > 0) {
      return Math.floor(accountDailyLimit);
    }
    return perMobileDailyLimit;
  });
  const maxMessagesNext24Hours = perAccountDailyCaps.reduce((sum, cap) => sum + cap, 0);
  const maxMessagesNextHour = activeConnectedCount * perMobileHourlyLimit;

  const remainingMessagesToday = activeConnectedAccounts.reduce((sum, account) => {
    const accountDailyLimit = Number(account.dailyLimit);
    const effectiveDailyLimit =
      Number.isFinite(accountDailyLimit) && accountDailyLimit > 0
        ? Math.floor(accountDailyLimit)
        : perMobileDailyLimit;
    const sentToday = Number(account.sentToday) || 0;
    return sum + Math.max(0, effectiveDailyLimit - sentToday);
  }, 0);

  const remainingMessagesThisHour = activeConnectedAccounts.reduce((sum, account) => {
    const sentThisHour = Number(account.sentThisHour) || 0;
    return sum + Math.max(0, perMobileHourlyLimit - sentThisHour);
  }, 0);

  return {
    activeConnectedAccounts: activeConnectedCount,
    maxMessagesNext24Hours,
    maxMessagesNextHour,
    remainingMessagesToday,
    remainingMessagesThisHour,
  };
}

async function getSettings(req, res) {
  const settings = await UserSetting.getOrCreate(req.user._id);
  const capacity = await buildCapacity(
    req.user._id,
    settings.perMobileDailyLimit,
    settings.perMobileHourlyLimit,
  );

  return res.json({
    settings: serializeSettings(settings),
    capacity,
  });
}

function validateNumberField(body, field, min, max) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, field)) {
    return null;
  }
  const value = Number(body[field]);
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${field} must be between ${min} and ${max}.`;
  }
  return null;
}

async function updateSettings(req, res) {
  const body = req.body || {};
  const hasDailyLimit = Object.prototype.hasOwnProperty.call(body, "perMobileDailyLimit");
  const hasHourlyLimit = Object.prototype.hasOwnProperty.call(body, "perMobileHourlyLimit");
  const hasAntiBot = Object.prototype.hasOwnProperty.call(body, "antiBotEnabled");

  const hasAnyAntiBotField =
    hasAntiBot ||
    Object.prototype.hasOwnProperty.call(body, "minDelayMs") ||
    Object.prototype.hasOwnProperty.call(body, "maxDelayMs") ||
    Object.prototype.hasOwnProperty.call(body, "typingSimulation") ||
    Object.prototype.hasOwnProperty.call(body, "typingDurationMs") ||
    Object.prototype.hasOwnProperty.call(body, "shuffleRecipients") ||
    Object.prototype.hasOwnProperty.call(body, "longPauseEnabled") ||
    Object.prototype.hasOwnProperty.call(body, "longPauseChance") ||
    Object.prototype.hasOwnProperty.call(body, "longPauseMinMs") ||
    Object.prototype.hasOwnProperty.call(body, "longPauseMaxMs");

  if (!hasDailyLimit && !hasHourlyLimit && !hasAnyAntiBotField) {
    return res.status(400).json({
      message: "At least one setting field is required.",
    });
  }

  const settings = await UserSetting.getOrCreate(req.user._id);

  // ── Message Limits ──
  if (hasDailyLimit) {
    const perMobileDailyLimit = Number(body.perMobileDailyLimit);
    if (!Number.isFinite(perMobileDailyLimit) || perMobileDailyLimit < 1 || perMobileDailyLimit > 500) {
      return res.status(400).json({ message: "perMobileDailyLimit must be between 1 and 500." });
    }
    settings.perMobileDailyLimit = Math.floor(perMobileDailyLimit);
  }

  if (hasHourlyLimit) {
    const perMobileHourlyLimit = Number(body.perMobileHourlyLimit);
    if (!Number.isFinite(perMobileHourlyLimit) || perMobileHourlyLimit < 1 || perMobileHourlyLimit > 100) {
      return res.status(400).json({ message: "perMobileHourlyLimit must be between 1 and 100." });
    }
    settings.perMobileHourlyLimit = Math.floor(perMobileHourlyLimit);
  }

  // ── Anti-Bot Detection ──
  if (hasAntiBot) {
    settings.antiBotEnabled = Boolean(body.antiBotEnabled);
  }

  const numberValidations = [
    ["minDelayMs", 2000, 60000],
    ["maxDelayMs", 3000, 120000],
    ["typingDurationMs", 1000, 10000],
    ["longPauseChance", 0, 1],
    ["longPauseMinMs", 5000, 300000],
    ["longPauseMaxMs", 10000, 600000],
  ];

  for (const [field, min, max] of numberValidations) {
    const error = validateNumberField(body, field, min, max);
    if (error) {
      return res.status(400).json({ message: error });
    }
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      settings[field] = Number(body[field]);
    }
  }

  const booleanFields = ["typingSimulation", "shuffleRecipients", "longPauseEnabled"];
  for (const field of booleanFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      settings[field] = Boolean(body[field]);
    }
  }

  // Cross-validate: minDelayMs must be <= maxDelayMs
  if (settings.minDelayMs > settings.maxDelayMs) {
    return res.status(400).json({
      message: "minDelayMs must be less than or equal to maxDelayMs.",
    });
  }

  // Cross-validate: longPauseMinMs must be <= longPauseMaxMs
  if (settings.longPauseMinMs > settings.longPauseMaxMs) {
    return res.status(400).json({
      message: "longPauseMinMs must be less than or equal to longPauseMaxMs.",
    });
  }

  await settings.save();
  const capacity = await buildCapacity(
    req.user._id,
    settings.perMobileDailyLimit,
    settings.perMobileHourlyLimit,
  );

  return res.json({
    settings: serializeSettings(settings),
    capacity,
  });
}

module.exports = {
  getSettings,
  updateSettings,
};
