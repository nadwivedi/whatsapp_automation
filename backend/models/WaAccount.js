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
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    dayWindowStart: {
      type: Date,
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
  const now = Date.now();
  const dayStart = account.dayWindowStart ? new Date(account.dayWindowStart).getTime() : 0;

  if (!dayStart) {
    if ((Number(account.sentToday) || 0) !== 0) {
      // Keep current usage and start strict 24h tracking from now.
      account.dayWindowStart = new Date();
    }
    return account;
  }

  if (now - dayStart >= DAILY_WINDOW_MS) {
    account.dayWindowStart = null;
    account.sentOn = null;
    account.sentToday = 0;
  }
  return account;
};

waAccountSchema.statics.resetHourlyWindowIfNeeded = function resetHourlyWindowIfNeeded(account) {
  const now = Date.now();
  const hourStart = account.hourWindowStart ? new Date(account.hourWindowStart).getTime() : 0;
  if (!hourStart) {
    if ((Number(account.sentThisHour) || 0) !== 0) {
      account.sentThisHour = 0;
    }
    return account;
  }
  if (now - hourStart >= 60 * 60 * 1000) {
    account.hourWindowStart = null;
    account.sentThisHour = 0;
  }
  return account;
};

module.exports = {
  WaAccount: mongoose.model("WaAccount", waAccountSchema),
  ACCOUNT_STATUSES,
};
