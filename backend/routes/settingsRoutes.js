const express = require("express");
const { getSettings, updateSettings } = require("../controllers/settingsController");

const router = express.Router();

router.get("/", getSettings);
router.patch("/", updateSettings);

module.exports = router;
