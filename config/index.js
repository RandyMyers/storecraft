require("dotenv").config();

function required(name, fallback) {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env: ${name}`);
}

const { validateSecretsMasterKeyStrength } = require("../services/secretCrypto");

const jwtSecret = required("JWT_SECRET", "dev-only-change-me");

/** Browser origins always permitted (local CRA + production marketing). */
const STATIC_CORS_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://citematch.com",
  "https://www.citematch.com",
];

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  /** Comma-separated extra browser origins for CORS (merged with STATIC_CORS_ORIGINS). */
  additionalCorsOrigins: [
    ...new Set([
      ...STATIC_CORS_ORIGINS,
      ...String(process.env.ADDITIONAL_CORS_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ],
  mongoUri: required("MONGODB_URI"),
  /** Dev only: skips real TXT lookups and marks custom domains verified. */
  skipDnsVerify: process.env.SKIP_DNS_VERIFY === "true",
  /** e.g. acme.platform.com → treat label `acme` as Site.subdomain */
  platformPublishDomain: String(process.env.PLATFORM_PUBLISH_DOMAIN || "citematch.com")
    .toLowerCase()
    .trim(),
  /**
   * When true, `/api/public/by-host?hostname=` is accepted (local previews + split deploy where
   * the browser calls the API on another origin). Set TRUST_PUBLISH_HOSTNAME_QUERY=true in production
   * when SPA lives on customer/platform hosts and API on api.*.
   */
  allowPublicHostQuery:
    process.env.PUBLIC_HOST_QUERY === "true" ||
    process.env.TRUST_PUBLISH_HOSTNAME_QUERY === "true" ||
    process.env.NODE_ENV !== "production",
  /** If true, verified domains stay ssl_pending until an external SSL worker runs. */
  strictSslLifecycle: process.env.STRICT_SSL_LIFECYCLE === "true",

  /**
   * Express `trust proxy` — set to 1+ behind Railway/Render/Vercel proxy so `req.ip` uses X-Forwarded-For.
   * Use **false** locally if you do not want forwarded headers trusted.
   */
  trustProxy: (() => {
    if (process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false") return false;
    const n = Number(process.env.TRUST_PROXY);
    if (process.env.TRUST_PROXY != null && process.env.TRUST_PROXY !== "" && !Number.isNaN(n)) {
      return n;
    }
    return process.env.NODE_ENV === "production" ? 1 : false;
  })(),

  /** Public form POST rate limit (sliding window per IP + subdomain). */
  formRateLimitWindowMs: (() => {
    const n = Number(process.env.FORM_RATE_LIMIT_WINDOW_MS || 60_000);
    return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 60_000;
  })(),
  formRateLimitMax: (() => {
    const n = Number(process.env.FORM_RATE_LIMIT_MAX || 12);
    return Number.isFinite(n) ? Math.max(1, Math.min(120, Math.floor(n))) : 12;
  })(),

  /** Cloudflare Turnstile secret — when set, `/form` requires a valid widget token. */
  turnstileSecretKey: String(process.env.TURNSTILE_SECRET_KEY || "").trim(),

  /** Protects `POST/GET /api/admin/*`. Omit to disable admin routes (503). */
  adminApiKey: String(process.env.ADMIN_API_KEY || "").trim(),

  /** Signs short-lived admin session JWTs (`POST /api/admin/auth/token`). Defaults to `JWT_SECRET` if unset. */
  adminJwtSecret: String(process.env.ADMIN_JWT_SECRET || "").trim() || jwtSecret,
  adminJwtExpiresSeconds: (() => {
    const n = Number(process.env.ADMIN_JWT_EXPIRES_SECONDS || 900);
    if (!Number.isFinite(n)) return 900;
    return Math.min(86_400, Math.max(300, Math.floor(n)));
  })(),

  /**
   * Defaults for the first auto-created operator (non-production only, when the collection is empty).
   * Set `DISABLE_AUTO_ADMIN=true` to skip auto-creation.
   */
  seedAdminEmail: String(process.env.SEED_ADMIN_EMAIL || "admin@nestpage.local").trim().toLowerCase(),
  seedAdminPassword: String(process.env.SEED_ADMIN_PASSWORD || "NestpageDev1!"),

  /** Slack-compatible incoming webhook URL — optional alerts on integration-secret changes. */
  adminSlackWebhookUrl: String(process.env.ADMIN_SLACK_WEBHOOK_URL || "").trim(),

  /** AES-256-GCM master for `IntegrationSecret` payloads (admin integration keys). */
  secretsMasterKey: String(process.env.SECRETS_MASTER_KEY || "").trim(),
  secretsKeyVersion: String(process.env.SECRETS_KEY_VERSION || "v1").trim(),

  /** Shown on `GET /api/account/plan` for pay-by-invoice flows (plain text). */
  paymentInstructionsBank: String(process.env.PAYMENT_INSTRUCTIONS_BANK || "").trim(),
  paymentInstructionsUsdt: String(process.env.PAYMENT_INSTRUCTIONS_USDT || "").trim(),

  /** Hostinger shared plan order id for POST /api/hosting/v1/websites (optional if stored in integration metadata). */
  hostingerHostingOrderId: (() => {
    const n = Number(process.env.HOSTINGER_HOSTING_ORDER_ID || "");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  })(),

  /** After signup / site create, call Hostinger API to add `{subdomain}.PLATFORM_PUBLISH_DOMAIN`. */
  hostingerAutoProvisionSubdomain: process.env.HOSTINGER_AUTO_PROVISION_SUBDOMAIN === "true",

  /**
   * How tenant `{sub}.PLATFORM_PUBLISH_DOMAIN` is wired on publish:
   * - dns_cname (default): CNAME to main site CDN — same app as citematch.com
   * - websites_api: legacy POST /api/hosting/v1/websites (often empty docroot)
   * - both: DNS + websites API
   */
  hostingerProvisionMode: String(process.env.HOSTINGER_PROVISION_MODE || "dns_cname")
    .trim()
    .toLowerCase(),

  /** Override CNAME target for tenant labels (default: inferred from apex/www DNS). */
  hostingerTenantCnameTarget: String(process.env.HOSTINGER_TENANT_CNAME_TARGET || "").trim(),

  /** One-time add *.apex CNAME when provisioning (if zone API allows). */
  hostingerEnsureWildcardCname: process.env.HOSTINGER_ENSURE_WILDCARD_CNAME === "true",
};

validateSecretsMasterKeyStrength(module.exports.secretsMasterKey, process.env.NODE_ENV || "");
