const mongoose = require("mongoose");

const messageTemplateSchema = new mongoose.Schema(
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
      maxlength: 80,
    },
    body: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4096,
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MessageTemplate", messageTemplateSchema);
