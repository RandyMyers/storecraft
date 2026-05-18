const { Sentry, sentryEnabled } = require("./instrument");
require("express-async-errors");
const express = require("express");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const sitesRoutes = require("./routes/sites");
const publicRoutes = require("./routes/public");
const mediaRoutes = require("./routes/media");
const healthRoutes = require("./routes/health");
const accountRoutes = require("./routes/account");
const adminBillingRoutes = require("./routes/adminBilling");
const adminOpsRoutes = require("./routes/adminOps");
const adminSecretsRoutes = require("./routes/adminSecrets");
const adminHostingerRoutes = require("./routes/adminHostinger");
const plansRoutes = require("./routes/plans");
const adminPlansRoutes = require("./routes/adminPlans");
const adminTemplatesRoutes = require("./routes/adminTemplates");
const adminAuthRoutes = require("./routes/adminAuth");
const templatesRoutes = require("./routes/templates");
const { errorHandler } = require("./middleware/errorHandler");
const { requestCorrelationId } = require("./middleware/requestCorrelationId");

/** @returns {{ app: import("express").Express }} */
function createApp() {
  const app = express();

  if (config.trustProxy) {
    app.set("trust proxy", config.trustProxy);
  }

  const corsAllowedOrigins = [
    ...new Set([config.clientOrigin, ...config.additionalCorsOrigins].filter(Boolean)),
  ];
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        if (corsAllowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(requestCorrelationId);

  app.use(healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/plans", plansRoutes);
  app.use("/api/templates", templatesRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/admin/plans", adminPlansRoutes);
  app.use("/api/admin/templates", adminTemplatesRoutes);
  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin", adminBillingRoutes);
  app.use("/api/admin", adminOpsRoutes);
  app.use("/api/admin", adminSecretsRoutes);
  app.use("/api/admin", adminHostingerRoutes);
  app.use("/api/sites", sitesRoutes);
  app.use("/api/public", publicRoutes);
  app.use("/api/media", mediaRoutes);

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  if (sentryEnabled) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use(errorHandler);

  return { app };
}

module.exports = { createApp };
