const cron = require("node-cron");
const { WaAccount } = require("../models/WaAccount");
const whatsappSessionManager = require("./whatsappSessionManager");

/**
 * Nightly Health Check Job
 * Runs at 3:00 AM IST (21:30 UTC)
 */
async function runHealthCheck() {
  console.log("[HEALTH-CHECK] Starting nightly session health check...");

  const accounts = await WaAccount.find({
    isActive: true,
    status: "authenticated",
  }).select("_id phoneNumber name");

  console.log(`[HEALTH-CHECK] Found ${accounts.length} accounts to check.`);

  for (const account of accounts) {
    let attempts = 0;
    let isHealthy = false;
    let lastError = null;

    while (attempts < 2 && !isHealthy) {
      attempts++;
      try {
        console.log(`[HEALTH-CHECK] Checking account: ${account.phoneNumber || account.name} (Attempt ${attempts})...`);

        // 1. Start session
        const startedAccount = await whatsappSessionManager.startSession(account._id);

        // 2. Check if it's authenticated
        if (startedAccount.status === "authenticated") {
          isHealthy = true;
          console.log(`[HEALTH-CHECK] Account ${account.phoneNumber || account.name} is healthy.`);
        } else {
          lastError = `Status is ${startedAccount.status}`;
          console.warn(`[HEALTH-CHECK] Account ${account.phoneNumber || account.name} attempt ${attempts} failed: ${lastError}`);
        }
      } catch (error) {
        lastError = error.message;
        console.error(`[HEALTH-CHECK] Error checking account ${account.phoneNumber || account.name} attempt ${attempts}:`, lastError);
      } finally {
        // Sleep after a small delay to allow WhatsApp internal sync to finish
        // This prevents the "Target closed" / "Protocol error" crash
        try {
          if (isHealthy) {
            console.log(`[HEALTH-CHECK] Waiting 5s for ${account.phoneNumber || account.name} to sync before closing...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          await whatsappSessionManager.sleepSession(account._id);
          console.log(`[HEALTH-CHECK] Session for ${account.phoneNumber || account.name} closed.`);
        } catch (_err) { /* ignore */ }
      }

      // If failed first attempt, wait a bit before retry
      if (!isHealthy && attempts < 2) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    // If still not healthy after 2 attempts, mark as disconnected
    if (!isHealthy) {
      console.error(`[HEALTH-CHECK] Account ${account.phoneNumber || account.name} failed after 2 attempts. Marking as disconnected.`);
      await WaAccount.findByIdAndUpdate(account._id, {
        status: "disconnected",
        lastError: `Nightly health check failed after 2 attempts: ${lastError}`,
      });
    }

    // Brief pause between different accounts
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // 4. Force close all sessions in the last to be absolutely sure RAM is freed
  console.log("[HEALTH-CHECK] Performing final cleanup (force close all sessions)...");
  try {
    const activeAccounts = await WaAccount.find({ isActive: true }).select("_id");
    for (const acc of activeAccounts) {
      await whatsappSessionManager.sleepSession(acc._id);
    }
  } catch (err) {
    console.error("[HEALTH-CHECK] Error during final cleanup:", err.message);
  }

  console.log("[HEALTH-CHECK] Nightly health check completed.");
}

function initHealthCheckJob() {
  // IST 3:00 AM is UTC 21:30 (9:30 PM previous day)
  // Cron format: minute hour day month day-of-week
  // "30 21 * * *" runs at 21:30 UTC
  // runHealthCheck() - Removed to prevent run on startup
  cron.schedule("30 21 * * *", () => {
    runHealthCheck().catch(err => console.error("[HEALTH-CHECK] Fatal error in job:", err));
  }, {
    timezone: "UTC"
  });

  console.log("[HEALTH-CHECK] Scheduled nightly check for 3:00 AM IST (21:30 UTC).");
}

module.exports = { initHealthCheckJob, runHealthCheck };
