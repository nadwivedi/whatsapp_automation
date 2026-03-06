const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      index: true,
    },
    email: {
      type: String,
      default: null,
      trim: true,
      maxlength: 180,
    },
    state: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    district: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    pincode: {
      type: Number,
      default: null,
      validate: {
        validator(value) {
          if (value == null) return true;
          return Number.isInteger(value) && value >= 100000 && value <= 999999;
        },
        message: "pincode must be a 6-digit number.",
      },
    },
    address: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    businessCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessCategory",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

businessSchema.index({ userId: 1, businessName: 1, mobile: 1 });

module.exports = {
  Business: mongoose.model("Business", businessSchema),
};
