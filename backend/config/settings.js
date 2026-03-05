module.exports = {
  port: 5000,
  mongoUri: "mongodb://127.0.0.1:27017/wa-web-bulk",
  frontendOrigins: ["http://localhost:5173", "http://localhost:5174"],
  authDataPath: ".wwebjs_auth",
  authSecret: process.env.AUTH_SECRET || "change-this-secret-in-production",
  authTokenTtlSeconds: Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7),
  queueIntervalMs: 3000,
  minGapPerAccountMs: 4000,
};
