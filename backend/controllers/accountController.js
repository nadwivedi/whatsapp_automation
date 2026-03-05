const { WaAccount } = require("../models/WaAccount");
const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const whatsappSessionManager = require("../services/whatsappSessionManager");
const DUMMY_NAME_PATTERN = /\b(dummy|demo|sample|test)\b/i;

async function cleanupCampaignDataForAccounts(ownerId, accountIds) {
  if (!accountIds.length) {
    return { campaignsRemoved: 0, messagesRemoved: 0 };
  }

  const campaigns = await Campaign.find({
    owner: ownerId,
    account: { $in: accountIds },
  }).select("_id");
  const campaignIds = campaigns.map((campaign) => campaign._id);

  let messagesRemoved = 0;
  if (campaignIds.length) {
    const messagesDeleteResult = await CampaignMessage.deleteMany({
      owner: ownerId,
      campaign: { $in: campaignIds },
    });
    messagesRemoved = messagesDeleteResult.deletedCount || 0;
  }

  const campaignsDeleteResult = await Campaign.deleteMany({
    owner: ownerId,
    account: { $in: accountIds },
  });

  return {
    campaignsRemoved: campaignsDeleteResult.deletedCount || 0,
    messagesRemoved,
  };
}

async function listAccounts(req, res) {
  const accounts = await WaAccount.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json({ accounts });
}

async function createAccount(req, res) {
  const { name, dailyLimit, phoneNumber } = req.body || {};
  const cleanedPhone =
    typeof phoneNumber === "string" ? phoneNumber.trim().replace(/[^\d+]/g, "") : "";

  if (cleanedPhone && !/^\+?\d{8,15}$/.test(cleanedPhone)) {
    return res.status(400).json({
      message: "phoneNumber must be a valid mobile number with 8 to 15 digits.",
    });
  }

  const resolvedName =
    typeof name === "string" && name.trim()
      ? name.trim()
      : cleanedPhone
        ? `WA ${cleanedPhone}`
        : "";

  if (!resolvedName) {
    return res.status(400).json({ message: "Account name or mobile number is required." });
  }

  const limit = Number.isFinite(Number(dailyLimit)) ? Number(dailyLimit) : 20;
  if (limit < 1 || limit > 500) {
    return res.status(400).json({ message: "dailyLimit must be between 1 and 500." });
  }

  const account = await WaAccount.create({
    owner: req.user._id,
    name: resolvedName,
    phoneNumber: cleanedPhone || null,
    dailyLimit: limit,
  });

  try {
    await whatsappSessionManager.startSession(account._id);
  } catch (error) {
    await WaAccount.findByIdAndUpdate(account._id, {
      status: "auth_failure",
      lastError: error.message,
    });
  }

  const refreshed = await WaAccount.findById(account._id);
  return res.status(201).json({ account: refreshed });
}

async function startAccountSession(req, res) {
  const { accountId } = req.params;
  const account = await WaAccount.findOne({ _id: accountId, owner: req.user._id });
  if (!account) {
    return res.status(404).json({ message: "Account not found." });
  }

  await whatsappSessionManager.startSession(accountId);
  const refreshed = await WaAccount.findById(accountId);
  return res.json({ account: refreshed });
}

async function stopAccountSession(req, res) {
  const { accountId } = req.params;
  const account = await WaAccount.findOne({ _id: accountId, owner: req.user._id });
  if (!account) {
    return res.status(404).json({ message: "Account not found." });
  }

  const stopped = await whatsappSessionManager.stopSession(accountId);
  return res.json({ account: stopped });
}

async function updateDailyLimit(req, res) {
  const { accountId } = req.params;
  const limit = Number(req.body?.dailyLimit);

  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return res.status(400).json({ message: "dailyLimit must be between 1 and 500." });
  }

  const updated = await WaAccount.findByIdAndUpdate(
    { _id: accountId, owner: req.user._id },
    { dailyLimit: limit },
    { returnDocument: "after" },
  );

  if (!updated) {
    return res.status(404).json({ message: "Account not found." });
  }

  return res.json({ account: updated });
}

async function getAccountQr(req, res) {
  const account = await WaAccount.findOne({
    _id: req.params.accountId,
    owner: req.user._id,
  });
  if (!account) {
    return res.status(404).json({ message: "Account not found." });
  }

  return res.json({
    accountId: account._id,
    status: account.status,
    qrCodeDataUrl: account.qrCodeDataUrl,
    lastError: account.lastError,
  });
}

async function deleteAccount(req, res) {
  const { accountId } = req.params;
  const account = await WaAccount.findOne({ _id: accountId, owner: req.user._id });
  if (!account) {
    return res.status(404).json({ message: "Account not found." });
  }

  await whatsappSessionManager.stopSession(accountId).catch(() => {});
  const cleanup = await cleanupCampaignDataForAccounts(req.user._id, [accountId]);
  await WaAccount.deleteOne({ _id: accountId, owner: req.user._id });

  return res.json({
    deletedAccountId: accountId,
    ...cleanup,
  });
}

async function deleteDummyAccounts(req, res) {
  const dummyAccounts = await WaAccount.find({
    owner: req.user._id,
    name: DUMMY_NAME_PATTERN,
  }).select("_id");
  const ids = dummyAccounts.map((account) => account._id);

  if (!ids.length) {
    return res.json({
      deletedAccounts: 0,
      campaignsRemoved: 0,
      messagesRemoved: 0,
    });
  }

  await Promise.all(ids.map((accountId) => whatsappSessionManager.stopSession(accountId).catch(() => {})));
  const cleanup = await cleanupCampaignDataForAccounts(req.user._id, ids);
  const deleteResult = await WaAccount.deleteMany({ owner: req.user._id, _id: { $in: ids } });

  return res.json({
    deletedAccounts: deleteResult.deletedCount || 0,
    ...cleanup,
  });
}

module.exports = {
  listAccounts,
  createAccount,
  startAccountSession,
  stopAccountSession,
  updateDailyLimit,
  getAccountQr,
  deleteAccount,
  deleteDummyAccounts,
};
