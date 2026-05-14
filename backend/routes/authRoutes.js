const express = require("express");
const { login, logout, me, register } = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const { authRateLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/register", register);
router.post("/login", authRateLimiter, login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

module.exports = router;
