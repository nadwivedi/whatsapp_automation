const mongoose = require("mongoose");

const failedLoginSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    index: true,
  },
  mobileNumber: {
    type: String,
    index: true,
  },
  attemptedAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // 24 hours
  },
});

module.exports = mongoose.model("FailedLogin", failedLoginSchema);
