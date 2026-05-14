const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const requireAuth = require("../middleware/requireAuth");
const requireAdmin = require("../middleware/requireAdmin");

router.use(requireAuth);
router.use(requireAdmin);

router.get("/users", adminController.getAllUsers);
router.post("/users", adminController.createUser);
router.put("/users/:userId", adminController.updateUser);
router.delete("/users/:userId", adminController.deleteUser);
router.post("/users/reset-password", adminController.resetPassword);
router.patch("/users/:userId/toggle-status", adminController.toggleUserStatus);
router.get("/security-alerts", adminController.getSecurityAlerts);

module.exports = router;
