const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    userId: {
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

contactSchema.index({ userId: 1, name: 1, mobile: 1 });

module.exports = {
  Contact: mongoose.model("Contact", contactSchema),
};
