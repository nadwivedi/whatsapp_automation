const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contactName: {
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
    contactCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContactCategory",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

contactSchema.index({ userId: 1, contactName: 1, mobile: 1 });

const Contact = mongoose.model("Contact", contactSchema);

module.exports = {
  Contact,
  // Backward-compatible export alias for legacy imports.
  Business: Contact,
};
