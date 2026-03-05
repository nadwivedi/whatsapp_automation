const { WaAccount } = require("../models/WaAccount");
const { UserSetting } = require("../models/UserSetting");

function serializeSettings(settings) {
  return {
    id: settings._id,
    owner: settings.owner,
    perMobileDailyLimit: settings.perMobileDailyLimit,
    perMobileHourlyLimit: settings.perMobileHourlyLimit,
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

async function updateSettings(req, res) {
  const hasDailyLimit = Object.prototype.hasOwnProperty.call(req.body || {}, "perMobileDailyLimit");
  const hasHourlyLimit = Object.prototype.hasOwnProperty.call(req.body || {}, "perMobileHourlyLimit");

  if (!hasDailyLimit && !hasHourlyLimit) {
    return res.status(400).json({
      message: "At least one setting is required: perMobileDailyLimit or perMobileHourlyLimit.",
    });
  }

  const settings = await UserSetting.getOrCreate(req.user._id);

  if (hasDailyLimit) {
    const perMobileDailyLimit = Number(req.body?.perMobileDailyLimit);
    if (!Number.isFinite(perMobileDailyLimit) || perMobileDailyLimit < 1 || perMobileDailyLimit > 500) {
      return res.status(400).json({ message: "perMobileDailyLimit must be between 1 and 500." });
    }
    settings.perMobileDailyLimit = Math.floor(perMobileDailyLimit);
  }

  if (hasHourlyLimit) {
    const perMobileHourlyLimit = Number(req.body?.perMobileHourlyLimit);
    if (
      !Number.isFinite(perMobileHourlyLimit) ||
      perMobileHourlyLimit < 1 ||
      perMobileHourlyLimit > 100
    ) {
      return res.status(400).json({ message: "perMobileHourlyLimit must be between 1 and 100." });
    }
    settings.perMobileHourlyLimit = Math.floor(perMobileHourlyLimit);
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
