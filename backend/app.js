const express = require("express");
const cors = require("cors");
const requireAuth = require("./middleware/requireAuth");
const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const templateRoutes = require("./routes/templateRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const businessCategoryRoutes = require("./routes/businessCategoryRoutes");
const businessRoutes = require("./routes/businessRoutes");
const replyRoutes = require("./routes/replyRoutes");

const app = express();
const localOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (localOriginPattern.test(origin)) return true;
  return configuredCorsOrigins.includes(origin);
}

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    now: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/accounts", requireAuth, accountRoutes);
app.use("/api/templates", requireAuth, templateRoutes);
app.use("/api/campaigns", requireAuth, campaignRoutes);
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/contact-categories", requireAuth, businessCategoryRoutes);
app.use("/api/contacts", requireAuth, businessRoutes);
app.use("/api/business-categories", requireAuth, businessCategoryRoutes);
app.use("/api/businesses", requireAuth, businessRoutes);
app.use("/api/replies", requireAuth, replyRoutes);

app.use((err, _req, res, _next) => {
  const message = err?.message || "Unexpected server error.";
  res.status(500).json({ message });
});

module.exports = app;
