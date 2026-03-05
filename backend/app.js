const express = require("express");
const cors = require("cors");
const accountRoutes = require("./routes/accountRoutes");
const templateRoutes = require("./routes/templateRoutes");
const campaignRoutes = require("./routes/campaignRoutes");

const app = express();
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || localOriginPattern.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    now: new Date().toISOString(),
  });
});

app.use("/api/accounts", accountRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/campaigns", campaignRoutes);

app.use((err, _req, res, _next) => {
  const message = err?.message || "Unexpected server error.";
  res.status(500).json({ message });
});

module.exports = app;
