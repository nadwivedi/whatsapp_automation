const mongoose = require("mongoose");

const CAMPAIGN_STATUSES = ["queued", "running", "paused", "completed", "failed"];

const campaignSchema = new mongoose.Schema(
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
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MessageTemplate",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    messageBody: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4096,
    },
    status: {
      type: String,
      enum: CAMPAIGN_STATUSES,
      default: "queued",
      index: true,
    },
    totalRecipients: {
      type: Number,
      required: true,
      min: 1,
    },
    queuedCount: {
      type: Number,
      required: true,
      min: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, createdAt: 1 });

module.exports = {
  Campaign: mongoose.model("Campaign", campaignSchema),
  CAMPAIGN_STATUSES,
};
