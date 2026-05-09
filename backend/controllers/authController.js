const { Campaign } = require("../models/Campaign");
const { User } = require("../models/User");
const { WaAccount } = require("../models/WaAccount");
const {
  attachAuthCookie,
  clearAuthCookie,
  hashPassword,
  signAuthToken,
  verifyPassword,
} = require("../utils/auth");

const AUTH_RATE_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000);
const AUTH_RATE_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_MAX_ATTEMPTS || 10);
const authAttempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function getAuthAttemptKey(req, normalizedMobile) {
  return `${getClientIp(req)}:${normalizedMobile || "unknown"}`;
}

function isRateLimited(key) {
  const entry = authAttempts.get(key);
  if (!entry) {
    return false;
  }

  const now = Date.now();
  if (now - entry.firstAttemptAt > AUTH_RATE_WINDOW_MS) {
    authAttempts.delete(key);
    return false;
  }

  return entry.count >= AUTH_RATE_MAX_ATTEMPTS;
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const entry = authAttempts.get(key);

  if (!entry || now - entry.firstAttemptAt > AUTH_RATE_WINDOW_MS) {
    authAttempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  authAttempts.set(key, {
    count: entry.count + 1,
    firstAttemptAt: entry.firstAttemptAt,
  });
}

function clearFailedAttempts(key) {
  authAttempts.delete(key);
}

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
  const attemptKey = getAuthAttemptKey(req, normalizedMobile);

  if (isRateLimited(attemptKey)) {
    return res.status(429).json({ message: "Too many auth attempts. Please wait and try again." });
  }

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    recordFailedAttempt(attemptKey);
    return res.status(400).json({ message: "Name must be at least 2 characters." });
  }

  if (!/^\+?\d{8,15}$/.test(normalizedMobile)) {
    recordFailedAttempt(attemptKey);
    return res
      .status(400)
      .json({ message: "Mobile number must be valid and contain 8 to 15 digits." });
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    recordFailedAttempt(attemptKey);
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  const existing = await User.findOne({ mobileNumber: normalizedMobile });
  if (existing) {
    recordFailedAttempt(attemptKey);
    return res.status(409).json({ message: "Mobile number is already registered." });
  }

  const user = await User.create({
    name: name.trim(),
    mobileNumber: normalizedMobile,
    passwordHash: hashPassword(password),
  });

  const token = signAuthToken({ sub: String(user._id), role: user.role });
  attachAuthCookie(res, token);
  clearFailedAttempts(attemptKey);

  const stats = await buildStats(user._id);
  return res.status(201).json({
    user: sanitizeUser(user),
    stats,
  });
}

const FailedLogin = require("../models/FailedLogin");

async function login(req, res) {
  const { mobileNumber, password } = req.body || {};
  const normalizedMobile = normalizeMobile(mobileNumber);
  const clientIp = getClientIp(req);
  const attemptKey = getAuthAttemptKey(req, normalizedMobile);

  // 1. Memory-based rate limit (existing)
  if (isRateLimited(attemptKey)) {
    return res.status(429).json({ message: "Too many auth attempts. Please wait and try again." });
  }

  // 2. Strict IP-based blocking (2 failures in 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const ipFailures = await FailedLogin.countDocuments({
    ip: clientIp,
    attemptedAt: { $gte: oneDayAgo },
  });

  if (ipFailures >= 2) {
    return res.status(403).json({
      message: "This IP address is temporarily blocked due to multiple failed login attempts. Please try again later.",
    });
  }

  if (!normalizedMobile || !password) {
    recordFailedAttempt(attemptKey);
    return res.status(400).json({ message: "Mobile number and password are required." });
  }

  const user = await User.findOne({ mobileNumber: normalizedMobile });
  
  if (!user || !verifyPassword(password, user.passwordHash)) {
    // Record failed attempt in DB for IP blocking
    await FailedLogin.create({
      ip: clientIp,
      mobileNumber: normalizedMobile,
    });

    recordFailedAttempt(attemptKey);
    return res.status(401).json({ message: "Invalid mobile number or password." });
  }

  if (!user.isActive) {
    return res.status(403).json({ message: "This account has been deactivated." });
  }

  const token = signAuthToken({ sub: String(user._id), role: user.role });
  attachAuthCookie(res, token);
  clearFailedAttempts(attemptKey);
  
  // Optional: clear IP failures on successful login? 
  // Usually, we don't clear IP failures if it's meant to be strict, 
  // but if they finally got it right, maybe we should. 
  // The prompt says "2 wrong password in a day", so I'll keep them.

  const stats = await buildStats(user._id);
  return res.json({
    user: sanitizeUser(user),
    stats,
  });
}


async function logout(_req, res) {
  clearAuthCookie(res);
  return res.json({ message: "Logged out." });
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
  logout,
  me,
};
