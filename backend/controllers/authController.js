const { Campaign } = require("../models/Campaign");
const { User } = require("../models/User");
const { WaAccount } = require("../models/WaAccount");
const { hashPassword, signAuthToken, verifyPassword } = require("../utils/auth");

function normalizeMobile(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  return raw.trim().replace(/[^\d+]/g, "");
}

function sanitizeUser(userDoc) {
  return {
    id: userDoc._id,
    name: userDoc.name,
    mobileNumber: userDoc.mobileNumber,
    role: userDoc.role,
    createdAt: userDoc.createdAt,
  };
}

async function buildStats(userId) {
  const [accountsCount, campaignsCount, sentAggregate] = await Promise.all([
    WaAccount.countDocuments({ owner: userId }),
    Campaign.countDocuments({ owner: userId }),
    Campaign.aggregate([
      { $match: { owner: userId } },
      { $group: { _id: null, totalSent: { $sum: "$sentCount" } } },
    ]),
  ]);

  return {
    accountsCount,
    campaignsCount,
    totalSentMessages: sentAggregate[0]?.totalSent || 0,
  };
}

async function register(req, res) {
  const { name, mobileNumber, password } = req.body || {};
  const normalizedMobile = normalizeMobile(mobileNumber);

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ message: "Name must be at least 2 characters." });
  }

  if (!/^\+?\d{8,15}$/.test(normalizedMobile)) {
    return res
      .status(400)
      .json({ message: "Mobile number must be valid and contain 8 to 15 digits." });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const existing = await User.findOne({ mobileNumber: normalizedMobile });
  if (existing) {
    return res.status(409).json({ message: "Mobile number is already registered." });
  }

  const user = await User.create({
    name: name.trim(),
    mobileNumber: normalizedMobile,
    passwordHash: hashPassword(password),
  });

  const token = signAuthToken({ sub: String(user._id), role: user.role });
  const stats = await buildStats(user._id);
  return res.status(201).json({
    token,
    user: sanitizeUser(user),
    stats,
  });
}

async function login(req, res) {
  const { mobileNumber, password } = req.body || {};
  const normalizedMobile = normalizeMobile(mobileNumber);

  if (!normalizedMobile || !password) {
    return res.status(400).json({ message: "Mobile number and password are required." });
  }

  const user = await User.findOne({ mobileNumber: normalizedMobile });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: "Invalid mobile number or password." });
  }

  const token = signAuthToken({ sub: String(user._id), role: user.role });
  const stats = await buildStats(user._id);
  return res.json({
    token,
    user: sanitizeUser(user),
    stats,
  });
}

async function me(req, res) {
  const stats = await buildStats(req.user._id);
  return res.json({
    user: sanitizeUser(req.user),
    stats,
  });
}

module.exports = {
  register,
  login,
  me,
};
