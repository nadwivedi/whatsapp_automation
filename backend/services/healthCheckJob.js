const cron = require("node-cron");
const { WaAccount } = require("../models/WaAccount");
const whatsappSessionManager = require("./whatsappSessionManager");

/**
 * Nightly Session Purge Job
 * Runs at 2:00 AM IST (20:30 UTC previous day)
 * Destroys ALL active sessions to free RAM and remove ghost processes.
 * Sessions will be re-opened on-demand when campaigns need to send.
 */
async function runNightlySessionPurge() {
  console.log("[NIGHTLY-PURGE] Starting 2:00 AM IST session purge...");

  // 1. Force-close every active in-memory session
  const activeIds = Array.from(whatsappSessionManager.clients.keys());
  console.log(`[NIGHTLY-PURGE] Found ${activeIds.length} active sessions to destroy.`);

  for (const accountId of activeIds) {
    try {
      await whatsappSessionManager.sleepSession(accountId);
      console.log(`[NIGHTLY-PURGE] Session destroyed for account ${accountId}.`);
    } catch (err) {
      console.error(`[NIGHTLY-PURGE] Error destroying session ${accountId}:`, err.message);
    }
  }

  // 2. Reset any accounts stuck in transient states
  const stuckAccounts = await WaAccount.find({
    status: { $in: ["initializing", "qr_ready"] },
    isActive: true,
  }).select("_id phoneNumber name");

  if (stuckAccounts.length > 0) {
    console.log(`[NIGHTLY-PURGE] Resetting ${stuckAccounts.length} stuck accounts to 'disconnected'.`);
    await WaAccount.updateMany(
      { _id: { $in: stuckAccounts.map(a => a._id) } },
      { $set: { status: "disconnected", qrCodeDataUrl: null, lastError: "Session reset by nightly purge." } }
    );
  }

  // 3. Clear any ghost activity records in session manager
  whatsappSessionManager.clientActivities.clear();

  console.log(`[NIGHTLY-PURGE] Done. ${activeIds.length} sessions destroyed, ${stuckAccounts.length} accounts reset.`);
}

function initHealthCheckJob() {
  // 2:00 AM IST = 20:30 UTC (previous calendar day)
  cron.schedule("30 20 * * *", () => {
    runNightlySessionPurge().catch(err =>
      console.error("[NIGHTLY-PURGE] Fatal error in purge job:", err)
    );
  }, {
    timezone: "UTC"
  });

  console.log("[NIGHTLY-PURGE] Scheduled nightly session purge for 2:00 AM IST (20:30 UTC).");
}

module.exports = { initHealthCheckJob, runHealthCheck: runNightlySessionPurge };
