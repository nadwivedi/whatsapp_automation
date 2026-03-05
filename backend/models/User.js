const mongoose = require("mongoose");

const USER_ROLES = ["member", "admin"];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "member",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = {
  User: mongoose.model("User", userSchema),
  USER_ROLES,
};
