const mongoose = require("mongoose");
const { ReplyMessage } = require("../models/ReplyMessage");
const { CampaignMessage } = require("../models/CampaignMessage");
const { WaAccount } = require("../models/WaAccount");
const { normalizeNumber } = require("../utils/phone");
const { emitReplyMessage } = require("./replyEvents");

function normalizeContact(contactNumber) {
  const normalized = normalizeNumber(String(contactNumber || ""));
  return normalized || null;
}

function normalizeProviderChatId(chatId) {
  const raw = String(chatId || "").trim();
  if (!raw) {
    return null;
  }
  return raw.toLowerCase();
}

function getMessageMoment(message) {
  return new Date(message.sentAt || message.createdAt || Date.now());
}

function mapReplyRow(row) {
  const moment = getMessageMoment(row);
  return {
    _id: String(row._id),
    source: "reply",
    direction: row.direction,
    status: row.status,
    text: row.text || "",
    contactNumber: row.contactNumber,
    senderMobileNumber: row.senderMobileNumber || row.account?.phoneNumber || null,
    recipientMobileNumber: row.recipientMobileNumber || null,
    providerMessageId: row.providerMessageId || null,
    providerChatId: row.providerChatId || null,
    messageType: row.messageType || "text",
    error: row.error || null,
    readAt: row.readAt || null,
    account: row.account
      ? {
          _id: String(row.account._id),
          phoneNumber: row.account.phoneNumber || null,
          name: row.account.name || null,
        }
      : null,
    sentAt: row.sentAt || null,
    createdAt: row.createdAt || null,
    messageAt: moment.toISOString(),
  };
}

function mapCampaignRow(row, normalizedContact) {
  const moment = getMessageMoment(row);
  const recipientNumber = row.recipientMobileNumber || row.recipient || normalizedContact;
  return {
    _id: String(row._id),
    source: "campaign",
    direction: "outbound",
    status: row.status,
    text: row.text || "",
    contactNumber: normalizedContact,
    senderMobileNumber: row.senderMobileNumber || row.account?.phoneNumber || null,
    recipientMobileNumber: recipientNumber,
    providerMessageId: row.providerMessageId || null,
    messageType: "text",
    error: row.error || null,
    readAt: null,
    account: row.account
      ? {
          _id: String(row.account._id),
          phoneNumber: row.account.phoneNumber || null,
          name: row.account.name || null,
        }
      : null,
    sentAt: row.sentAt || null,
    createdAt: row.createdAt || null,
    messageAt: moment.toISOString(),
  };
}

function mergeConversationPreview(target, candidate) {
  if (!target) {
    return candidate;
  }
  const targetAt = new Date(target.lastMessageAt).getTime();
  const candidateAt = new Date(candidate.lastMessageAt).getTime();
  const combinedUnread = (target.unreadCount || 0) + (candidate.unreadCount || 0);
  const combinedInbound = (target.inboundMessageCount || 0) + (candidate.inboundMessageCount || 0);
  const resolvedSessionMobileNumber =
    candidate.sessionMobileNumber || target.sessionMobileNumber || null;
  if (candidateAt > targetAt) {
    return {
      ...candidate,
      unreadCount: combinedUnread,
      inboundMessageCount: combinedInbound,
      sessionMobileNumber: resolvedSessionMobileNumber,
    };
  }
  return {
    ...target,
    unreadCount: combinedUnread,
    inboundMessageCount: combinedInbound,
    sessionMobileNumber: resolvedSessionMobileNumber,
  };
}

function mergeSessionCandidate(target, candidate) {
  if (!candidate?.contactNumber) {
    return target || null;
  }
  if (!target) {
    return candidate;
  }

  const targetAt = new Date(target.messageAt || 0).getTime();
  const candidateAt = new Date(candidate.messageAt || 0).getTime();

  if (candidateAt > targetAt && candidate.sessionMobileNumber) {
    return candidate;
  }

  if (!target.sessionMobileNumber && candidate.sessionMobileNumber) {
    return candidate;
  }

  return target;
}

class ReplyInboxService {
  async resolveContactFromProviderChat(ownerId, accountId, providerChatId) {
    const normalizedChatId = normalizeProviderChatId(providerChatId);
    if (!normalizedChatId) {
      return null;
    }

    const lastReplyOutbound = await ReplyMessage.findOne({
      owner: ownerId,
      account: accountId,
      direction: "outbound",
      providerChatId: normalizedChatId,
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .select("contactNumber");

    const fromReply = normalizeContact(lastReplyOutbound?.contactNumber);
    if (fromReply) {
      return fromReply;
    }

    const lastCampaignOutbound = await CampaignMessage.findOne({
      owner: ownerId,
      account: accountId,
      providerChatId: normalizedChatId,
      status: { $in: ["sent", "failed"] },
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .select("recipient recipientMobileNumber");

    return normalizeContact(
      lastCampaignOutbound?.recipientMobileNumber || lastCampaignOutbound?.recipient,
    );
  }

  async listConversations(ownerId, limit = 200) {
    const ownerObjectId = new mongoose.Types.ObjectId(String(ownerId));
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);

    const [replyBuckets, campaignBuckets, replySessionBuckets, campaignSessionBuckets] = await Promise.all([
      ReplyMessage.aggregate([
        { $match: { owner: ownerObjectId } },
        {
          $project: {
            contactNumber: 1,
            text: 1,
            direction: 1,
            status: 1,
            senderMobileNumber: 1,
            recipientMobileNumber: 1,
            readAt: 1,
            messageAt: { $ifNull: ["$sentAt", "$createdAt"] },
          },
        },
        { $sort: { messageAt: -1 } },
        {
          $group: {
            _id: "$contactNumber",
            last: { $first: "$$ROOT" },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$direction", "inbound"] },
                      { $eq: [{ $ifNull: ["$readAt", null] }, null] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            inboundMessageCount: {
              $sum: {
                $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0],
              },
            },
          },
        },
      ]),
      CampaignMessage.aggregate([
        {
          $match: {
            owner: ownerObjectId,
            status: { $in: ["sent", "failed"] },
          },
        },
        {
          $project: {
            contactNumber: { $ifNull: ["$recipientMobileNumber", "$recipient"] },
            text: 1,
            status: 1,
            senderMobileNumber: 1,
            recipientMobileNumber: { $ifNull: ["$recipientMobileNumber", "$recipient"] },
            messageAt: { $ifNull: ["$sentAt", "$createdAt"] },
          },
        },
        { $sort: { messageAt: -1 } },
        {
          $group: {
            _id: "$contactNumber",
            last: { $first: "$$ROOT" },
          },
        },
      ]),
      ReplyMessage.aggregate([
        {
          $match: {
            owner: ownerObjectId,
            direction: "outbound",
            status: "sent",
          },
        },
        {
          $project: {
            contactNumber: 1,
            sessionMobileNumber: "$senderMobileNumber",
            messageAt: { $ifNull: ["$sentAt", "$createdAt"] },
          },
        },
        { $sort: { messageAt: -1 } },
        {
          $group: {
            _id: "$contactNumber",
            last: { $first: "$$ROOT" },
          },
        },
      ]),
      CampaignMessage.aggregate([
        {
          $match: {
            owner: ownerObjectId,
            status: { $in: ["sent", "failed"] },
          },
        },
        {
          $project: {
            contactNumber: { $ifNull: ["$recipientMobileNumber", "$recipient"] },
            sessionMobileNumber: "$senderMobileNumber",
            messageAt: { $ifNull: ["$sentAt", "$createdAt"] },
          },
        },
        { $sort: { messageAt: -1 } },
        {
          $group: {
            _id: "$contactNumber",
            last: { $first: "$$ROOT" },
          },
        },
      ]),
    ]);

    const merged = new Map();
    const sessionByContact = new Map();

    for (const bucket of replySessionBuckets) {
      const contactNumber = normalizeContact(bucket?._id);
      if (!contactNumber) continue;

      const candidate = {
        contactNumber,
        sessionMobileNumber: normalizeContact(bucket.last?.sessionMobileNumber),
        messageAt: bucket.last?.messageAt || null,
      };

      sessionByContact.set(
        contactNumber,
        mergeSessionCandidate(sessionByContact.get(contactNumber), candidate),
      );
    }

    for (const bucket of campaignSessionBuckets) {
      const contactNumber = normalizeContact(bucket?._id);
      if (!contactNumber) continue;

      const candidate = {
        contactNumber,
        sessionMobileNumber: normalizeContact(bucket.last?.sessionMobileNumber),
        messageAt: bucket.last?.messageAt || null,
      };

      sessionByContact.set(
        contactNumber,
        mergeSessionCandidate(sessionByContact.get(contactNumber), candidate),
      );
    }

    for (const bucket of replyBuckets) {
      const contactNumber = normalizeContact(bucket?._id);
      if (!contactNumber) continue;

      const sessionFromBuckets = sessionByContact.get(contactNumber)?.sessionMobileNumber || null;
      const fallbackSession =
        bucket.last?.direction === "inbound"
          ? normalizeContact(bucket.last?.recipientMobileNumber)
          : normalizeContact(bucket.last?.senderMobileNumber);

      const item = {
        contactNumber,
        lastMessageText: bucket.last?.text || "",
        lastDirection: bucket.last?.direction || "inbound",
        lastStatus: bucket.last?.status || "received",
        lastSource: "reply",
        lastSenderMobileNumber: bucket.last?.senderMobileNumber || null,
        lastRecipientMobileNumber: bucket.last?.recipientMobileNumber || null,
        lastMessageAt: new Date(bucket.last?.messageAt || Date.now()).toISOString(),
        unreadCount: Number(bucket.unreadCount) || 0,
        inboundMessageCount: Number(bucket.inboundMessageCount) || 0,
        sessionMobileNumber: sessionFromBuckets || fallbackSession || null,
      };

      merged.set(contactNumber, mergeConversationPreview(merged.get(contactNumber), item));
    }

    for (const bucket of campaignBuckets) {
      const contactNumber = normalizeContact(bucket?._id);
      if (!contactNumber) continue;

      const sessionFromBuckets =
        sessionByContact.get(contactNumber)?.sessionMobileNumber ||
        normalizeContact(bucket.last?.senderMobileNumber);

      const item = {
        contactNumber,
        lastMessageText: bucket.last?.text || "",
        lastDirection: "outbound",
        lastStatus: bucket.last?.status || "sent",
        lastSource: "campaign",
        lastSenderMobileNumber: bucket.last?.senderMobileNumber || null,
        lastRecipientMobileNumber: bucket.last?.recipientMobileNumber || contactNumber,
        lastMessageAt: new Date(bucket.last?.messageAt || Date.now()).toISOString(),
        unreadCount: 0,
        inboundMessageCount: 0,
        sessionMobileNumber: sessionFromBuckets || null,
      };

      merged.set(contactNumber, mergeConversationPreview(merged.get(contactNumber), item));
    }

    return Array.from(merged.values())
      .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      .slice(0, safeLimit);
  }

  async listConversationMessages(ownerId, contactNumber, limit = 500) {
    const normalizedContact = normalizeContact(contactNumber);
    if (!normalizedContact) {
      throw new Error("Invalid contact number.");
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);

    const [replyMessages, campaignMessages] = await Promise.all([
      ReplyMessage.find({
        owner: ownerId,
        contactNumber: normalizedContact,
      })
        .populate("account", "phoneNumber name")
        .sort({ sentAt: 1, createdAt: 1 })
        .limit(safeLimit),
      CampaignMessage.find({
        owner: ownerId,
        status: { $in: ["sent", "failed"] },
        $or: [{ recipientMobileNumber: normalizedContact }, { recipient: normalizedContact }],
      })
        .populate("account", "phoneNumber name")
        .sort({ sentAt: 1, createdAt: 1 })
        .limit(safeLimit),
    ]);

    const merged = [
      ...replyMessages.map((row) => mapReplyRow(row.toObject())),
      ...campaignMessages.map((row) => mapCampaignRow(row.toObject(), normalizedContact)),
    ];

    merged.sort((a, b) => new Date(a.messageAt) - new Date(b.messageAt));
    return merged.slice(-safeLimit);
  }

  async markConversationRead(ownerId, contactNumber) {
    const normalizedContact = normalizeContact(contactNumber);
    if (!normalizedContact) {
      throw new Error("Invalid contact number.");
    }

    const result = await ReplyMessage.updateMany(
      {
        owner: ownerId,
        contactNumber: normalizedContact,
        direction: "inbound",
        readAt: null,
      },
      { $set: { readAt: new Date() } },
    );

    return result.modifiedCount || 0;
  }

  async resolveSuggestedAccount(ownerId, contactNumber) {
    const context = await this.resolveConversationSenderContext(ownerId, contactNumber);
    return context.account;
  }

  async resolveConversationSenderContext(ownerId, contactNumber) {
    const normalizedContact = normalizeContact(contactNumber);
    if (!normalizedContact) {
      return {
        account: null,
        accountId: null,
        senderMobileNumber: null,
      };
    }

    let accountId = null;
    let senderMobileNumber = null;

    const lastReplyOutbound = await ReplyMessage.findOne({
      owner: ownerId,
      contactNumber: normalizedContact,
      direction: "outbound",
      status: "sent",
    })
      .sort({ sentAt: -1, createdAt: -1 })
      .select("account senderMobileNumber");

    if (lastReplyOutbound?.account) {
      accountId = lastReplyOutbound.account;
      senderMobileNumber = lastReplyOutbound.senderMobileNumber || null;
    } else {
      const lastCampaignOutbound = await CampaignMessage.findOne({
        owner: ownerId,
        $or: [{ recipientMobileNumber: normalizedContact }, { recipient: normalizedContact }],
        status: "sent",
      })
        .sort({ sentAt: -1, createdAt: -1 })
        .select("account senderMobileNumber");

      if (lastCampaignOutbound?.account) {
        accountId = lastCampaignOutbound.account;
        senderMobileNumber = lastCampaignOutbound.senderMobileNumber || null;
      }
    }

    if (!accountId) {
      return {
        account: null,
        accountId: null,
        senderMobileNumber: null,
      };
    }

    const account = await WaAccount.findOne({
      _id: accountId,
      owner: ownerId,
    });

    return {
      account: account || null,
      accountId: String(accountId),
      senderMobileNumber: senderMobileNumber || account?.phoneNumber || null,
    };
  }

  async recordInboundMessage(payload) {
    const normalizedChatId = normalizeProviderChatId(payload.providerChatId);
    let contactNumber = normalizeContact(payload.fromNumber);
    if (!contactNumber && normalizedChatId) {
      contactNumber = await this.resolveContactFromProviderChat(
        payload.ownerId,
        payload.accountId,
        normalizedChatId,
      );
    }
    if (!contactNumber) {
      return null;
    }

    const doc = await ReplyMessage.create({
      owner: payload.ownerId,
      account: payload.accountId,
      contactNumber,
      direction: "inbound",
      status: "received",
      text: String(payload.text || ""),
      senderMobileNumber: payload.fromNumber || contactNumber || null,
      recipientMobileNumber: payload.toNumber || null,
      providerMessageId: payload.providerMessageId || null,
      providerChatId: normalizedChatId,
      messageType: payload.messageType || "text",
      sentAt: payload.sentAt || new Date(),
      readAt: null,
    });

    emitReplyMessage(payload.ownerId, mapReplyRow(doc.toObject()));
    return doc;
  }

  async recordOutboundReply(payload) {
    const contactNumber = normalizeContact(payload.contactNumber);
    if (!contactNumber) {
      throw new Error("Invalid contact number.");
    }

    const normalizedChatId = normalizeProviderChatId(payload.providerChatId);

    const doc = await ReplyMessage.create({
      owner: payload.ownerId,
      account: payload.accountId,
      contactNumber,
      direction: "outbound",
      status: payload.status || "sent",
      text: String(payload.text || ""),
      senderMobileNumber: payload.senderMobileNumber || null,
      recipientMobileNumber: payload.recipientMobileNumber || contactNumber,
      providerMessageId: payload.providerMessageId || null,
      providerChatId: normalizedChatId,
      messageType: payload.messageType || "text",
      error: payload.error || null,
      sentAt: payload.sentAt || new Date(),
      readAt: null,
    });

    emitReplyMessage(payload.ownerId, mapReplyRow(doc.toObject()));
    return doc;
  }

  async deleteConversation(ownerId, contactNumber) {
    const normalizedContact = normalizeContact(contactNumber);
    if (!normalizedContact) {
      throw new Error("Invalid contact number.");
    }

    const result = await ReplyMessage.deleteMany({
      owner: ownerId,
      contactNumber: normalizedContact,
    });

    return result.deletedCount || 0;
  }
}

module.exports = new ReplyInboxService();
