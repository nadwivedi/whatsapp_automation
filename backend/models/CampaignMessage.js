const mongoose = require("mongoose");

const MESSAGE_STATUSES = ["pending", "sent", "failed"];

const campaignMessageSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WaAccount",
      required: true,
      index: true,
    },
    recipient: {
      type: String,
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
      enum: MESSAGE_STATUSES,
      default: "pending",
      index: true,
    },
    tryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    providerMessageId: {
      type: String,
      default: null,
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
  },
  { timestamps: true },
);

campaignMessageSchema.index({ campaign: 1, status: 1, createdAt: 1 });

module.exports = {
  CampaignMessage: mongoose.model("CampaignMessage", campaignMessageSchema),
  MESSAGE_STATUSES,
};
