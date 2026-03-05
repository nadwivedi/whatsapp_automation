const MessageTemplate = require("../models/MessageTemplate");
const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const campaignQueue = require("../services/campaignQueue");

async function listCampaigns(req, res) {
  const campaigns = await Campaign.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .populate("account", "name phoneNumber status dailyLimit sentToday")
    .populate("template", "name body")
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

  if (!accountId) {
    return res.status(400).json({ message: "accountId is required." });
  }

  const account = await WaAccount.findOne({
    _id: accountId,
    owner: req.user._id,
  }).select("_id");
  if (!account) {
    return res.status(400).json({ message: "Selected WhatsApp account is invalid." });
  }

  if (templateId && !messageBody) {
    const template = await MessageTemplate.findOne({
      _id: templateId,
      owner: req.user._id,
    });
    if (!template || !template.isActive) {
      return res.status(400).json({ message: "Selected template is invalid or inactive." });
    }
    messageBody = template.body;
  }

  if (!messageBody || typeof messageBody !== "string") {
    return res.status(400).json({ message: "Message body is required." });
  }

  const campaign = await campaignQueue.enqueueCampaign({
    ownerId: req.user._id,
    title,
    accountId,
    templateId: templateId || null,
    messageBody,
    recipientsText: recipientsText || "",
  });

  const hydrated = await Campaign.findById(campaign._id)
    .populate("account", "name phoneNumber status dailyLimit sentToday")
    .populate("template", "name body");

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
