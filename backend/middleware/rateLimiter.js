const { rateLimit } = require("express-rate-limit");

/**
 * Strict rate limiter for authentication routes.
 * Limits failed attempts to 2 per 24-hour window.
 */
const authRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 2, // limit each IP to 2 requests per windowMs
  message: {
    message: "Too many failed login attempts. You are blocked for 24 hours.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: true, // Only count failed attempts (non-2xx responses)
});

module.exports = { authRateLimiter };
