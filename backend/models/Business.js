const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    owner: {
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
      maxlength: 120,
    },
    district: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    pincode: {
      type: String,
      default: "",
      trim: true,
      maxlength: 20,
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

businessSchema.index({ owner: 1, businessName: 1, mobile: 1 });

module.exports = {
  Business: mongoose.model("Business", businessSchema),
};
