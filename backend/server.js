const fs = require("fs");
const path = require("path");
const http = require("http");

function loadDotEnv() {
  const envPath = path.resolve(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function assertSecurityConfig() {
  const authSecret = process.env.AUTH_SECRET || "";
  if (
    process.env.NODE_ENV === "production" &&
    (!authSecret || authSecret === "change-this-secret-in-production")
  ) {
    throw new Error("AUTH_SECRET must be set to a strong value in production.");
  }
}

assertSecurityConfig();

const app = require("./app");
const connectMongo = require("./db/connectMongo");
const campaignQueue = require("./services/campaignQueue");
const whatsappSessionManager = require("./services/whatsappSessionManager");
const { initializeReplySocketServer } = require("./services/replySocketServer");

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  await connectMongo();
  campaignQueue.start();
  await whatsappSessionManager.restoreActiveSessions();

  const httpServer = http.createServer(app);
  const replySocketServer = initializeReplySocketServer(httpServer);

  const server = httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend started on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    campaignQueue.stop();
    await replySocketServer.close();
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
