/**
 * Load before other server modules so @sentry/node can instrument dependencies (Phase 10).
 */
require("dotenv").config();
const Sentry = require("@sentry/node");

const dsn = String(process.env.SENTRY_DSN || "").trim();
const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  const traces = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0);
  Sentry.init({
    dsn,
    environment: String(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development").trim(),
    tracesSampleRate: Number.isFinite(traces) ? Math.min(1, Math.max(0, traces)) : 0,
    integrations: [Sentry.expressIntegration()],
  });
}

module.exports = { Sentry, sentryEnabled };
