const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const ACCOUNT_STATUSES = [
  "new",
  "initializing",
  "qr_ready",
  "authenticated",
  "disconnected",
  "auth_failure",
];

const waAccountSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    clientId: {
      type: String,
      unique: true,
      index: true,
      default: () => `wa_${randomUUID()}`,
    },
    phoneNumber: {
      type: String,
      default: null,
    },
    lastConnectedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "new",
      index: true,
    },
    qrCodeDataUrl: {
      type: String,
      default: null,
    },
    dailyLimit: {
      type: Number,
      default: 20,
      min: 1,
      max: 500,
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
    sentThisHour: {
      type: Number,
      default: 0,
      min: 0,
    },
    hourWindowStart: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

waAccountSchema.statics.resetDailyWindowIfNeeded = function resetDailyWindowIfNeeded(account) {
  const today = new Date().toISOString().slice(0, 10);
  if (account.sentOn !== today) {
    account.sentOn = today;
    account.sentToday = 0;
  }
  return account;
};

waAccountSchema.statics.resetHourlyWindowIfNeeded = function resetHourlyWindowIfNeeded(account) {
  const now = Date.now();
  const hourStart = account.hourWindowStart ? new Date(account.hourWindowStart).getTime() : 0;
  if (!hourStart || now - hourStart >= 60 * 60 * 1000) {
    account.hourWindowStart = new Date();
    account.sentThisHour = 0;
  }
  return account;
};

module.exports = {
  WaAccount: mongoose.model("WaAccount", waAccountSchema),
  ACCOUNT_STATUSES,
};
