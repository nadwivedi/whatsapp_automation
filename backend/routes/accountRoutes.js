const express = require("express");
const {
  listAccounts,
  createAccount,
  startAccountSession,
  stopAccountSession,
  updateDailyLimit,
  getAccountQr,
  deleteAccount,
  deleteDummyAccounts,
} = require("../controllers/accountController");

const router = express.Router();

router.get("/", listAccounts);
router.post("/", createAccount);
router.post("/:accountId/start", startAccountSession);
router.post("/:accountId/stop", stopAccountSession);
router.patch("/:accountId/daily-limit", updateDailyLimit);
router.get("/:accountId/qr", getAccountQr);
router.delete("/dummy/all", deleteDummyAccounts);
router.delete("/:accountId", deleteAccount);

module.exports = router;
