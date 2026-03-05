const MessageTemplate = require("../models/MessageTemplate");
const { Campaign } = require("../models/Campaign");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const campaignQueue = require("../services/campaignQueue");
const MAX_PER_RECIPIENT_MESSAGE_LIMIT = 20;
const DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT = 1;

function uniqueRecipients(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function buildRecipientSendPlan(recipientPool, maxMessages, perRecipientMessageLimit) {
  const pool = uniqueRecipients(recipientPool);
  const capPerRecipient = Number.isFinite(Number(perRecipientMessageLimit))
    ? Math.max(1, Math.floor(Number(perRecipientMessageLimit)))
    : DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT;
  const hardCapByRecipient = pool.length * capPerRecipient;
  const targetTotal = Number.isFinite(Number(maxMessages))
    ? Math.min(Math.floor(Number(maxMessages)), hardCapByRecipient)
    : hardCapByRecipient;

  const plan = [];
  for (let round = 0; round < capPerRecipient && plan.length < targetTotal; round += 1) {
    for (const recipient of pool) {
      if (plan.length >= targetTotal) break;
      plan.push(recipient);
    }
  }
  return plan;
}

function mapCountByRecipient(recipients = []) {
  const counts = new Map();
  for (const recipient of recipients) {
    counts.set(recipient, (counts.get(recipient) || 0) + 1);
  }
  return counts;
}

function toAccountIdList(campaign) {
  if (Array.isArray(campaign.accounts) && campaign.accounts.length) {
    return campaign.accounts.map((value) => String(value));
  }
  if (campaign.account) {
    return [String(campaign.account)];
  }
  return [];
}

async function rebalancePendingMessagesForRecipientLimit(campaign, ownerId) {
  const allMessages = await CampaignMessage.find({
    owner: ownerId,
    campaign: campaign._id,
  })
    .sort({ createdAt: 1 })
    .select("_id recipient recipientMobileNumber status account");

  const fallbackPool = uniqueRecipients(allMessages.map((message) => message.recipient));
  const recipientPool = uniqueRecipients(campaign.recipientPool?.length ? campaign.recipientPool : fallbackPool);
  if (!recipientPool.length) {
    return;
  }

  const desiredPlan = buildRecipientSendPlan(
    recipientPool,
    campaign.maxMessages,
    campaign.perRecipientMessageLimit || DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT,
  );
  const desiredCounts = mapCountByRecipient(desiredPlan);

  const currentCounts = new Map();
  const pendingByRecipient = new Map();

  for (const message of allMessages) {
    const recipient = message.recipient;
    currentCounts.set(recipient, (currentCounts.get(recipient) || 0) + 1);
    if (message.status === "pending") {
      if (!pendingByRecipient.has(recipient)) pendingByRecipient.set(recipient, []);
      pendingByRecipient.get(recipient).push(message);
    }
  }

  const idsToDelete = [];
  for (const recipient of recipientPool) {
    const desired = desiredCounts.get(recipient) || 0;
    const current = currentCounts.get(recipient) || 0;
    if (current <= desired) continue;

    const removable = Math.min(current - desired, (pendingByRecipient.get(recipient) || []).length);
    if (!removable) continue;

    const pendingMessages = (pendingByRecipient.get(recipient) || []).slice().reverse();
    for (let i = 0; i < removable; i += 1) {
      const candidate = pendingMessages[i];
      if (!candidate) break;
      idsToDelete.push(candidate._id);
    }
    currentCounts.set(recipient, current - removable);
  }

  if (idsToDelete.length) {
    await CampaignMessage.deleteMany({
      owner: ownerId,
      campaign: campaign._id,
      _id: { $in: idsToDelete },
      status: "pending",
    });
  }

  const accountIds = toAccountIdList(campaign);
  if (!accountIds.length) {
    throw new Error("Campaign has no sending account configured.");
  }

  const docsToInsert = [];
  let accountCursor = 0;
  for (const recipient of recipientPool) {
    const desired = desiredCounts.get(recipient) || 0;
    const current = currentCounts.get(recipient) || 0;
    const toAdd = Math.max(0, desired - current);

    for (let i = 0; i < toAdd; i += 1) {
      docsToInsert.push({
        owner: ownerId,
        campaign: campaign._id,
        account: accountIds[accountCursor % accountIds.length],
        recipient,
        recipientMobileNumber: recipient,
        text: campaign.messageBody || "",
        status: "pending",
      });
      accountCursor += 1;
    }
  }

  if (docsToInsert.length) {
    await CampaignMessage.insertMany(docsToInsert);
  }

  const [totalRecipients, queuedCount, sentCount, failedCount] = await Promise.all([
    CampaignMessage.countDocuments({ owner: ownerId, campaign: campaign._id }),
    CampaignMessage.countDocuments({ owner: ownerId, campaign: campaign._id, status: "pending" }),
    CampaignMessage.countDocuments({ owner: ownerId, campaign: campaign._id, status: "sent" }),
    CampaignMessage.countDocuments({ owner: ownerId, campaign: campaign._id, status: "failed" }),
  ]);

  campaign.totalRecipients = totalRecipients;
  campaign.queuedCount = queuedCount;
  campaign.sentCount = sentCount;
  campaign.failedCount = failedCount;
}

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
    .populate("account", "phoneNumber")
    .sort({ createdAt: 1 })
    .limit(2000);

  const normalizedMessages = messages.map((message) => {
    const item = message.toObject();
    return {
      ...item,
      senderMobileNumber: item.senderMobileNumber || item.account?.phoneNumber || null,
      recipientMobileNumber: item.recipientMobileNumber || item.recipient || null,
    };
  });

  res.json({ messages: normalizedMessages });
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
  const perRecipientMessageLimit =
    req.body?.perRecipientMessageLimit == null || req.body?.perRecipientMessageLimit === ""
      ? DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT
      : Number(req.body.perRecipientMessageLimit);
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
  if (!templateId) {
    return res.status(400).json({ message: "templateId is required." });
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

  const template = await MessageTemplate.findOne({
    _id: templateId,
    owner: req.user._id,
  });
  if (!template || !template.isActive) {
    return res.status(400).json({ message: "Selected template is invalid or inactive." });
  }
  messageBody = template.body;
  mediaData = template.mediaData || null;
  mediaType = template.mediaType || null;
  mediaMimeType = template.mediaMimeType || null;
  mediaFileName = template.mediaFileName || null;

  const normalizedBody = typeof messageBody === "string" ? messageBody.trim() : "";
  if (!normalizedBody && !mediaData) {
    return res.status(400).json({ message: "Campaign needs message text or media." });
  }
  if (!Number.isFinite(maxMessages) || maxMessages < 1 || maxMessages > 5000) {
    return res.status(400).json({ message: "maxMessages must be between 1 and 5000." });
  }
  if (
    !Number.isFinite(perRecipientMessageLimit) ||
    perRecipientMessageLimit < 1 ||
    perRecipientMessageLimit > MAX_PER_RECIPIENT_MESSAGE_LIMIT
  ) {
    return res.status(400).json({
      message: `perRecipientMessageLimit must be between 1 and ${MAX_PER_RECIPIENT_MESSAGE_LIMIT}.`,
    });
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
    perRecipientMessageLimit: Math.floor(perRecipientMessageLimit),
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

async function updateCampaign(req, res) {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    owner: req.user._id,
  });
  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found." });
  }
  if (!["queued", "paused", "running"].includes(campaign.status)) {
    return res.status(400).json({ message: "Only queued, paused, or running campaigns can be edited." });
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const messageBody =
    typeof req.body?.messageBody === "string" ? req.body.messageBody.trim() : "";
  const perRecipientMessageLimit =
    req.body?.perRecipientMessageLimit == null || req.body?.perRecipientMessageLimit === ""
      ? null
      : Number(req.body.perRecipientMessageLimit);
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

  if (!title) {
    return res.status(400).json({ message: "title is required." });
  }
  if (!messageBody && !campaign.mediaData) {
    return res.status(400).json({ message: "Campaign needs message text or media." });
  }
  if (
    perRecipientMessageLimit != null &&
    (!Number.isFinite(perRecipientMessageLimit) ||
      perRecipientMessageLimit < 1 ||
      perRecipientMessageLimit > MAX_PER_RECIPIENT_MESSAGE_LIMIT)
  ) {
    return res.status(400).json({
      message: `perRecipientMessageLimit must be between 1 and ${MAX_PER_RECIPIENT_MESSAGE_LIMIT}.`,
    });
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
    (!Number.isFinite(perNumberDailySafeguard) ||
      perNumberDailySafeguard < 1 ||
      perNumberDailySafeguard > 500)
  ) {
    return res
      .status(400)
      .json({ message: "perNumberDailySafeguard must be between 1 and 500." });
  }
  if (
    perNumberHourlySafeguard != null &&
    (!Number.isFinite(perNumberHourlySafeguard) ||
      perNumberHourlySafeguard < 1 ||
      perNumberHourlySafeguard > 100)
  ) {
    return res
      .status(400)
      .json({ message: "perNumberHourlySafeguard must be between 1 and 100." });
  }

  const nextPerRecipientMessageLimit =
    perRecipientMessageLimit == null
      ? campaign.perRecipientMessageLimit || DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT
      : Math.floor(perRecipientMessageLimit);
  const recipientLimitChanged =
    nextPerRecipientMessageLimit !==
    (campaign.perRecipientMessageLimit || DEFAULT_PER_RECIPIENT_MESSAGE_LIMIT);

  campaign.title = title;
  campaign.messageBody = messageBody;
  campaign.perRecipientMessageLimit = nextPerRecipientMessageLimit;
  campaign.dateFrom = dateFrom;
  campaign.dateTo = dateTo;
  campaign.perNumberDailySafeguard = perNumberDailySafeguard || 20;
  campaign.perNumberHourlySafeguard = perNumberHourlySafeguard || 2;
  if (recipientLimitChanged) {
    await rebalancePendingMessagesForRecipientLimit(campaign, req.user._id);
  }

  await CampaignMessage.updateMany(
    { owner: req.user._id, campaign: campaign._id, status: "pending" },
    { $set: { text: messageBody } },
  );

  if (
    campaign.queuedCount === 0 &&
    ["queued", "running", "paused"].includes(campaign.status)
  ) {
    campaign.status = campaign.sentCount > 0 ? "completed" : "failed";
    campaign.completedAt = new Date();
  }

  await campaign.save();

  const hydrated = await Campaign.findById(campaign._id)
    .populate("account", "name phoneNumber status dailyLimit sentToday")
    .populate("accounts", "name phoneNumber status dailyLimit sentToday")
    .populate("template", "name body mediaType mediaFileName");

  return res.json({ campaign: hydrated });
}

async function deleteCampaign(req, res) {
  const campaign = await Campaign.findOne({
    _id: req.params.campaignId,
    owner: req.user._id,
  });
  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found." });
  }

  await CampaignMessage.deleteMany({
    owner: req.user._id,
    campaign: campaign._id,
  });

  await campaign.deleteOne();
  return res.json({ message: "Campaign deleted." });
}

module.exports = {
  listCampaigns,
  listCampaignMessages,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  updateCampaign,
  deleteCampaign,
};
