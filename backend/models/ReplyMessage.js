const mongoose = require("mongoose");

const REPLY_DIRECTIONS = ["inbound", "outbound"];
const REPLY_STATUSES = ["received", "sent", "failed"];

const replyMessageSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WaAccount",
      required: true,
      index: true,
    },
    contactNumber: {
      type: String,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: REPLY_DIRECTIONS,
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      maxlength: 4096,
    },
    status: {
      type: String,
      enum: REPLY_STATUSES,
      required: true,
      index: true,
    },
    senderMobileNumber: {
      type: String,
      default: null,
    },
    recipientMobileNumber: {
      type: String,
      default: null,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    providerChatId: {
      type: String,
      default: null,
      index: true,
    },
    messageType: {
      type: String,
      default: "text",
      maxlength: 32,
    },
    error: {
      type: String,
      default: null,
      maxlength: 500,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

replyMessageSchema.index({ owner: 1, contactNumber: 1, createdAt: 1 });
replyMessageSchema.index({ owner: 1, direction: 1, readAt: 1 });

module.exports = {
  ReplyMessage: mongoose.model("ReplyMessage", replyMessageSchema),
  REPLY_DIRECTIONS,
  REPLY_STATUSES,
};
