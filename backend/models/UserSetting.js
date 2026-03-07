const mongoose = require("mongoose");

const DEFAULT_PER_MOBILE_DAILY_LIMIT = 20;
const DEFAULT_PER_MOBILE_HOURLY_LIMIT = 2;

const DEFAULT_ANTI_BOT = {
  antiBotEnabled: false,
  minDelayMs: 5000,
  maxDelayMs: 15000,
  typingSimulation: true,
  typingDurationMs: 3000,
  shuffleRecipients: true,
  longPauseEnabled: true,
  longPauseChance: 0.1,
  longPauseMinMs: 30000,
  longPauseMaxMs: 120000,
};

const userSettingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    perMobileDailyLimit: {
      type: Number,
      default: DEFAULT_PER_MOBILE_DAILY_LIMIT,
      min: 1,
      max: 500,
    },
    perMobileHourlyLimit: {
      type: Number,
      default: DEFAULT_PER_MOBILE_HOURLY_LIMIT,
      min: 1,
      max: 100,
    },

    // ── Anti-Bot Detection ──
    antiBotEnabled: {
      type: Boolean,
      default: false,
    },
    minDelayMs: {
      type: Number,
      default: DEFAULT_ANTI_BOT.minDelayMs,
      min: 2000,
      max: 60000,
    },
    maxDelayMs: {
      type: Number,
      default: DEFAULT_ANTI_BOT.maxDelayMs,
      min: 3000,
      max: 120000,
    },
    typingSimulation: {
      type: Boolean,
      default: true,
    },
    typingDurationMs: {
      type: Number,
      default: DEFAULT_ANTI_BOT.typingDurationMs,
      min: 1000,
      max: 10000,
    },
    shuffleRecipients: {
      type: Boolean,
      default: true,
    },
    longPauseEnabled: {
      type: Boolean,
      default: true,
    },
    longPauseChance: {
      type: Number,
      default: DEFAULT_ANTI_BOT.longPauseChance,
      min: 0,
      max: 1,
    },
    longPauseMinMs: {
      type: Number,
      default: DEFAULT_ANTI_BOT.longPauseMinMs,
      min: 5000,
      max: 300000,
    },
    longPauseMaxMs: {
      type: Number,
      default: DEFAULT_ANTI_BOT.longPauseMaxMs,
      min: 10000,
      max: 600000,
    },
  },
  { timestamps: true },
);

userSettingSchema.statics.getOrCreate = async function getOrCreate(ownerId) {
  const existing = await this.findOne({ owner: ownerId });
  if (existing) return existing;

  try {
    return await this.create({ owner: ownerId });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const duplicate = await this.findOne({ owner: ownerId });
    if (!duplicate) throw error;
    return duplicate;
  }
};

module.exports = {
  UserSetting: mongoose.model("UserSetting", userSettingSchema),
  DEFAULT_PER_MOBILE_DAILY_LIMIT,
  DEFAULT_PER_MOBILE_HOURLY_LIMIT,
  DEFAULT_ANTI_BOT,
};
