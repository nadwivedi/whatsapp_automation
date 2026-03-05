const app = require("./app");
const settings = require("./config/settings");
const connectMongo = require("./db/connectMongo");
const campaignQueue = require("./services/campaignQueue");
const whatsappSessionManager = require("./services/whatsappSessionManager");

async function startServer() {
  await connectMongo();
  campaignQueue.start();
  await whatsappSessionManager.restoreActiveSessions();

  const server = app.listen(settings.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend started on http://localhost:${settings.port}`);
  });

  const shutdown = async () => {
    campaignQueue.stop();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start backend:", error);
  process.exit(1);
});
