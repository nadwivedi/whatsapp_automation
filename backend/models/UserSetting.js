const mongoose = require("mongoose");

const DEFAULT_PER_MOBILE_DAILY_LIMIT = 20;
const DEFAULT_PER_MOBILE_HOURLY_LIMIT = 2;

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
};
