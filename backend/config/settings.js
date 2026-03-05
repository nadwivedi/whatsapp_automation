module.exports = {
  port: 5000,
  mongoUri: "mongodb://127.0.0.1:27017/wa-web-bulk",
  frontendOrigins: ["http://localhost:5173", "http://localhost:5174"],
  authDataPath: ".wwebjs_auth",
  queueIntervalMs: 3000,
  minGapPerAccountMs: 4000,
};
