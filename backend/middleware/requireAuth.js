const { User } = require("../models/User");
const { readAuthTokenFromRequest, verifyAuthToken } = require("../utils/auth");

async function requireAuth(req, res, next) {
  try {
    const token = readAuthTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub).select("-passwordHash");
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    req.user = user;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Unauthorized." });
  }
}

module.exports = requireAuth;
