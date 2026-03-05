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
      default: "",
      trim: true,
      maxlength: 4096,
    },
    maxMessages: {
      type: Number,
      default: null,
      min: 1,
      max: 5000,
    },
    dailyMessageLimit: {
      type: Number,
      default: null,
      min: 1,
      max: 5000,
    },
    dateFrom: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD"],
    },
    dateTo: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD"],
    },
    sentToday: {
      type: Number,
      default: 0,
      min: 0,
    },
    sentOn: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", null],
      default: null,
    },
    mediaMimeType: {
      type: String,
      default: null,
      maxlength: 120,
    },
    mediaData: {
      type: String,
      default: null,
      maxlength: 12 * 1024 * 1024,
    },
    mediaFileName: {
      type: String,
      default: null,
      maxlength: 180,
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
