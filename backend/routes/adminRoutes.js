const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");

router.use(requireAuth);
router.use(requireAdmin);

router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.createUser);
router.post("/users/reset-password", adminController.resetPassword);
router.patch("/users/:userId/toggle-status", adminController.toggleUserStatus);

module.exports = router;
