const replyInboxService = require("../services/replyInboxService");
const whatsappSessionManager = require("../services/whatsappSessionManager");
const { normalizeNumber } = require("../utils/phone");

function parseLimit(rawValue, fallback, max) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

async function listConversations(req, res) {
  const limit = parseLimit(req.query?.limit, 200, 500);
  const conversations = await replyInboxService.listConversations(req.user._id, limit);
  return res.json({ conversations });
}

async function listConversationMessages(req, res) {
  const contactNumber = normalizeNumber(String(req.params?.contactNumber || ""));
  if (!contactNumber) {
    return res.status(400).json({ message: "Valid contactNumber is required." });
  }

  const limit = parseLimit(req.query?.limit, 500, 2000);
  const messages = await replyInboxService.listConversationMessages(req.user._id, contactNumber, limit);
  return res.json({ contactNumber, messages });
}

async function markConversationRead(req, res) {
  const contactNumber = normalizeNumber(String(req.params?.contactNumber || ""));
  if (!contactNumber) {
    return res.status(400).json({ message: "Valid contactNumber is required." });
  }

  const modifiedCount = await replyInboxService.markConversationRead(req.user._id, contactNumber);
  return res.json({ contactNumber, modifiedCount });
}

async function sendConversationReply(req, res) {
  const contactNumber = normalizeNumber(String(req.params?.contactNumber || ""));
  if (!contactNumber) {
    return res.status(400).json({ message: "Valid contactNumber is required." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ message: "Reply text is required." });
  }

  const requestedAccountId = req.body?.accountId ? String(req.body.accountId) : "";

  const senderContext = await replyInboxService.resolveConversationSenderContext(
    req.user._id,
    contactNumber,
  );

  if (!senderContext.accountId) {
    return res.status(400).json({
      message:
        "No linked sender session found for this chat. Send the first message from the desired session, then reply.",
    });
  }

  if (requestedAccountId && requestedAccountId !== senderContext.accountId) {
    return res.status(400).json({
      message: `Reply must be sent from ${senderContext.senderMobileNumber || "the linked sender session"} for this chat.`,
    });
  }

  const account = senderContext.account;
  if (!account) {
    return res.status(400).json({
      message: `Linked sender session ${senderContext.senderMobileNumber || ""} is missing. Please relogin that number and try again.`,
    });
  }

  if (!account.isActive || account.status !== "authenticated") {
    return res.status(400).json({
      message: `Linked sender session ${account.phoneNumber || senderContext.senderMobileNumber || ""} is not authenticated. Please relogin that number and try again.`,
    });
  }

  try {
    const delivery = await whatsappSessionManager.sendTextMessageDetailed(
      account._id,
      contactNumber,
      text,
    );

    const saved = await replyInboxService.recordOutboundReply({
      ownerId: req.user._id,
      accountId: account._id,
      contactNumber,
      text,
      status: "sent",
      providerMessageId: delivery?.providerMessageId || null,
      providerChatId: delivery?.providerChatId || null,
      senderMobileNumber: account.phoneNumber || null,
      recipientMobileNumber: contactNumber,
      sentAt: new Date(),
    });

    return res.status(201).json({ message: saved });
  } catch (error) {
    const failed = await replyInboxService.recordOutboundReply({
      ownerId: req.user._id,
      accountId: account._id,
      contactNumber,
      text,
      status: "failed",
      senderMobileNumber: account.phoneNumber || null,
      recipientMobileNumber: contactNumber,
      error: error.message,
      sentAt: new Date(),
    });

  return res.status(400).json({
      message: error.message || "Failed to send reply message.",
      failedMessage: failed,
    });
  }
}

async function deleteConversation(req, res) {
  const contactNumber = normalizeNumber(String(req.params?.contactNumber || ""));
  if (!contactNumber) {
    return res.status(400).json({ message: "Valid contactNumber is required." });
  }

  const deletedCount = await replyInboxService.deleteConversation(req.user._id, contactNumber);
  return res.json({ contactNumber, deletedCount });
}

module.exports = {
  listConversations,
  listConversationMessages,
  markConversationRead,
  sendConversationReply,
  deleteConversation,
};
