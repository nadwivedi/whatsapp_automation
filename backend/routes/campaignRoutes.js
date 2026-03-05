const express = require("express");
const {
  listCampaigns,
  listCampaignMessages,
  createCampaign,
  pauseCampaign,
  resumeCampaign,
  updateCampaign,
} = require("../controllers/campaignController");

const router = express.Router();

router.get("/", listCampaigns);
router.get("/:campaignId/messages", listCampaignMessages);
router.post("/", createCampaign);
router.patch("/:campaignId", updateCampaign);
router.post("/:campaignId/pause", pauseCampaign);
router.post("/:campaignId/resume", resumeCampaign);

module.exports = router;
