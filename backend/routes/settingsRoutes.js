const express = require("express");
const { getSettings, updateSettings, migrateMobileNumbers } = require("../controllers/settingsController");

const router = express.Router();

router.get("/", getSettings);
router.patch("/", updateSettings);
router.post("/migrate", migrateMobileNumbers);

module.exports = router;
