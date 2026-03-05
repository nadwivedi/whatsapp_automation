const MessageTemplate = require("../models/MessageTemplate");
const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const campaignQueue = require("../services/campaignQueue");

async function listCampaigns(req, res) {
  const campaigns = await Campaign.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .populate("account", "name phoneNumber status dailyLimit sentToday")
    .populate("accounts", "name phoneNumber status dailyLimit sentToday")
    .populate("template", "name body mediaType mediaFileName")
    .limit(100);
  res.json({ campaigns });
}

async function listCampaignMessages(req, res) {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    owner: req.user._id,
  }).select("_id");

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found." });
  }

  const messages = await CampaignMessage.find({
    owner: req.user._id,
    campaign: campaign._id,
  })
    .sort({ createdAt: 1 })
    .limit(2000);

  res.json({ messages });
}

async function createCampaign(req, res) {
  const { title, accountId, templateId, recipientsText } = req.body || {};
  let { messageBody } = req.body || {};
  let mediaData = null;
  let mediaType = null;
  let mediaMimeType = null;
  let mediaFileName = null;
  const maxMessages =
    req.body?.maxMessages == null || req.body?.maxMessages === ""
      ? null
      : Number(req.body.maxMessages);
  const dailyMessageLimit =
    req.body?.dailyMessageLimit == null || req.body?.dailyMessageLimit === ""
      ? null
      : Number(req.body.dailyMessageLimit);
  const dateFrom = req.body?.dateFrom ? String(req.body.dateFrom) : null;
  const dateTo = req.body?.dateTo ? String(req.body.dateTo) : null;
  const perNumberDailySafeguard =
    req.body?.perNumberDailySafeguard == null || req.body?.perNumberDailySafeguard === ""
      ? null
      : Number(req.body.perNumberDailySafeguard);
  const perNumberHourlySafeguard =
    req.body?.perNumberHourlySafeguard == null || req.body?.perNumberHourlySafeguard === ""
      ? null
      : Number(req.body.perNumberHourlySafeguard);

  const inputAccountIds = Array.isArray(req.body?.accountIds)
    ? req.body.accountIds.filter(Boolean)
    : accountId
      ? [accountId]
      : [];
  const uniqueAccountIds = [...new Set(inputAccountIds.map((id) => String(id)))];

  if (!uniqueAccountIds.length) {
    return res.status(400).json({ message: "At least one account is required." });
  }
  if (maxMessages == null) {
    return res.status(400).json({ message: "maxMessages is required." });
  }

  const accounts = await WaAccount.find({
    _id: { $in: uniqueAccountIds },
    owner: req.user._id,
    isActive: true,
    status: "authenticated",
  }).select("_id");
  if (accounts.length !== uniqueAccountIds.length) {
    return res.status(400).json({
      message: "One or more selected WhatsApp accounts are not active/authenticated.",
    });
  }

  if (templateId) {
    const template = await MessageTemplate.findOne({
      _id: templateId,
      owner: req.user._id,
    });
    if (!template || !template.isActive) {
      return res.status(400).json({ message: "Selected template is invalid or inactive." });
    }
    if (!messageBody) {
      messageBody = template.body;
    }
    mediaData = template.mediaData || null;
    mediaType = template.mediaType || null;
    mediaMimeType = template.mediaMimeType || null;
    mediaFileName = template.mediaFileName || null;
  }

  const normalizedBody = typeof messageBody === "string" ? messageBody.trim() : "";
  if (!normalizedBody && !mediaData) {
    return res.status(400).json({ message: "Campaign needs message text or media." });
  }
  if (!Number.isFinite(maxMessages) || maxMessages < 1 || maxMessages > 5000) {
    return res.status(400).json({ message: "maxMessages must be between 1 and 5000." });
  }
  if (
    dailyMessageLimit != null &&
    (!Number.isFinite(dailyMessageLimit) || dailyMessageLimit < 1 || dailyMessageLimit > 5000)
  ) {
    return res.status(400).json({ message: "dailyMessageLimit must be between 1 and 5000." });
  }
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return res.status(400).json({ message: "dateFrom must be in YYYY-MM-DD format." });
  }
  if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return res.status(400).json({ message: "dateTo must be in YYYY-MM-DD format." });
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return res.status(400).json({ message: "dateFrom cannot be later than dateTo." });
  }
  if (
    perNumberDailySafeguard != null &&
    (!Number.isFinite(perNumberDailySafeguard) || perNumberDailySafeguard < 1 || perNumberDailySafeguard > 500)
  ) {
    return res.status(400).json({ message: "perNumberDailySafeguard must be between 1 and 500." });
  }
  if (
    perNumberHourlySafeguard != null &&
    (!Number.isFinite(perNumberHourlySafeguard) || perNumberHourlySafeguard < 1 || perNumberHourlySafeguard > 100)
  ) {
    return res.status(400).json({ message: "perNumberHourlySafeguard must be between 1 and 100." });
  }

  const campaign = await campaignQueue.enqueueCampaign({
    ownerId: req.user._id,
    title,
    accountIds: uniqueAccountIds,
    templateId: templateId || null,
    messageBody: normalizedBody,
    mediaData,
    mediaType,
    mediaMimeType,
    mediaFileName,
    maxMessages,
    dailyMessageLimit,
    dateFrom,
    dateTo,
    perNumberDailySafeguard,
    perNumberHourlySafeguard,
    recipientsText: recipientsText || "",
  });

  const hydrated = await Campaign.findById(campaign._id)
    .populate("account", "name phoneNumber status dailyLimit sentToday")
    .populate("accounts", "name phoneNumber status dailyLimit sentToday")
    .populate("template", "name body mediaType mediaFileName");

  return res.status(201).json({ campaign: hydrated });
}

async function pauseCampaign(req, res) {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    owner: req.user._id,
  });
  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found." });
  }
  if (!["queued", "running"].includes(campaign.status)) {
    return res.status(400).json({ message: "Campaign cannot be paused in its current status." });
  }

  campaign.status = "paused";
  await campaign.save();
  return res.json({ campaign });
}

async function resumeCampaign(req, res) {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    owner: req.user._id,
  });
  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found." });
  }
  if (campaign.status !== "paused") {
    return res.status(400).json({ message: "Only paused campaigns can be resumed." });
  }

  campaign.status = "running";
  campaign.lastError = null;
  await campaign.save();
  return res.json({ campaign });
}

module.exports = {
  listCampaigns,
  listCampaignMessages,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
};
