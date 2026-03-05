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
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4096,
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
