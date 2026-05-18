const mongoose = require("mongoose");
const config = require("../config");
const IntegrationSecret = require("../models/IntegrationSecret");
const { appendAudit } = require("../services/auditLog");
const { encryptSecret, decryptSecret, last4FromPlain } = require("../services/secretCrypto");
const { verifyVercelToken } = require("../services/integrations/vercelApi");
const { notifyIntegrationSecretAudit } = require("../services/slackAdminNotify");

const { verifyHostingerToken } = require("../services/integrations/hostingerApi");

const ALLOWED_PROVIDERS = new Set(["vercel", "cloudinary", "turnstile", "sentry", "hostinger", "other"]);

function clientIp(req) {
  return String(req.ip || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
}

/** Express route label for audit (Phase A: per-route context). */
function auditRoute(req) {
  const base = String(req.baseUrl || "");
  const path = String(req.path || "");
  return `${req.method} ${base}${path}`.replace(/\s+/g, " ").trim();
}

function requireSecretsKey(res) {
  if (!config.secretsMasterKey) {
    res.status(503).json({ error: "Integration secrets are not configured (set SECRETS_MASTER_KEY)" });
    return false;
  }
  return true;
}

function toPublic(doc) {
  return {
    id: String(doc._id),
    provider: doc.provider,
    name: doc.name,
    environment: doc.environment,
    scope: doc.scope,
    status: doc.status,
    last4: doc.last4 || "",
    metadata: doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    rotatedAt: doc.rotatedAt || doc.updatedAt,
    testStatus: doc.testStatus || "",
    testCheckedAt: doc.testCheckedAt || null,
  };
}

async function listSecrets(req, res) {
  if (!config.secretsMasterKey) {
    res.json({ secrets: [], configured: false });
    return;
  }
  const rows = await IntegrationSecret.find({}).sort({ updatedAt: -1 }).lean();
  res.json({ secrets: rows.map(toPublic), configured: true });
}

async function createSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const provider = String(body.provider || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const environment = String(body.environment || "production").trim() || "production";
  const value = String(body.value || "");
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};

  if (!ALLOWED_PROVIDERS.has(provider)) {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }
  if (!name || name.length > 120) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  if (!value) {
    res.status(400).json({ error: "Missing value" });
    return;
  }

  const enc = encryptSecret(value, config.secretsMasterKey);
  const doc = await IntegrationSecret.create({
    provider,
    name,
    environment,
    encryptedValue: enc.encryptedValue,
    iv: enc.iv,
    authTag: enc.authTag,
    keyVersion: config.secretsKeyVersion,
    last4: last4FromPlain(value),
    metadata,
    status: "active",
    rotatedAt: new Date(),
    createdBy: "admin_api",
    updatedBy: "admin_api",
  });

  await appendAudit({
    action: "integration_secret_create",
    source: "admin_api",
    meta: { provider, name, environment, id: String(doc._id), route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  void notifyIntegrationSecretAudit("create", {
    provider,
    name,
    environment,
    id: String(doc._id),
  });

  res.status(201).json(toPublic(doc.toObject()));
}

async function updateSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const doc = await IntegrationSecret.findById(id);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};

  if (body.metadata && typeof body.metadata === "object") {
    doc.metadata = { ...(doc.metadata || {}), ...body.metadata };
  }
  if (typeof body.name === "string" && body.name.trim()) {
    doc.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.environment === "string" && body.environment.trim()) {
    doc.environment = body.environment.trim().slice(0, 64);
  }
  if (typeof body.scope === "string" && body.scope.trim()) {
    doc.scope = body.scope.trim().slice(0, 64);
  }
  if (typeof body.value === "string" && body.value) {
    const enc = encryptSecret(body.value, config.secretsMasterKey);
    doc.encryptedValue = enc.encryptedValue;
    doc.iv = enc.iv;
    doc.authTag = enc.authTag;
    doc.keyVersion = config.secretsKeyVersion;
    doc.last4 = last4FromPlain(body.value);
    doc.rotatedAt = new Date();
  }
  doc.updatedBy = "admin_api";

  await doc.save();

  await appendAudit({
    action: "integration_secret_update",
    source: "admin_api",
    meta: { id: String(doc._id), provider: doc.provider, route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  res.json(toPublic(doc.toObject()));
}

async function rotateSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const doc = await IntegrationSecret.findById(id);
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const value = String((req.body && req.body.value) || "");
  if (!value) {
    res.status(400).json({ error: "Missing value" });
    return;
  }
  const enc = encryptSecret(value, config.secretsMasterKey);
  doc.encryptedValue = enc.encryptedValue;
  doc.iv = enc.iv;
  doc.authTag = enc.authTag;
  doc.keyVersion = config.secretsKeyVersion;
  doc.last4 = last4FromPlain(value);
  doc.rotatedAt = new Date();
  doc.updatedBy = "admin_api";
  await doc.save();

  await appendAudit({
    action: "integration_secret_rotate",
    source: "admin_api",
    meta: { id: String(doc._id), provider: doc.provider, route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  void notifyIntegrationSecretAudit("rotate", { id: String(doc._id), provider: doc.provider });

  res.json(toPublic(doc.toObject()));
}

async function runProviderTest(doc, plain) {
  const provider = String(doc.provider || "").toLowerCase();
  if (provider === "vercel") {
    return verifyVercelToken(plain);
  }
  if (provider === "hostinger") {
    return verifyHostingerToken(plain);
  }
  if (provider === "cloudinary") {
    const trimmed = plain.trim();
    if (!trimmed.startsWith("{")) {
      return { ok: false, status: 400, message: "Cloudinary secret must be JSON with cloud_name, api_key, api_secret" };
    }
    try {
      const j = JSON.parse(trimmed);
      const cloud_name = String(j.cloud_name || "").trim();
      const api_key = String(j.api_key || "").trim();
      const api_secret = String(j.api_secret || "").trim();
      if (!cloud_name || !api_key || !api_secret) {
        return { ok: false, status: 400, message: "Cloudinary JSON missing cloud_name, api_key, or api_secret" };
      }
      return {
        ok: true,
        status: 200,
        message: "Cloudinary credential JSON OK (upload in editor verifies live access).",
      };
    } catch (e) {
      return { ok: false, status: 400, message: e.message || "Invalid Cloudinary JSON" };
    }
  }
  if (provider === "turnstile") {
    const s = plain.trim();
    if (s.length < 8) {
      return { ok: false, status: 400, message: "Turnstile secret looks too short" };
    }
    return { ok: true, status: 200, message: "Turnstile secret present (use live form submit to verify)." };
  }
  if (provider === "sentry") {
    return { ok: true, status: 200, message: "Sentry token stored (provider-specific verify not implemented)." };
  }
  return { ok: true, status: 200, message: "Secret decrypts successfully." };
}

async function testSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const doc = await IntegrationSecret.findById(id).lean();
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let plain;
  try {
    plain = decryptSecret(doc, config.secretsMasterKey);
  } catch {
    await IntegrationSecret.findByIdAndUpdate(id, {
      $set: {
        testStatus: "error: decrypt",
        testCheckedAt: new Date(),
      },
    });
    res.status(500).json({ error: "Secret could not be decrypted (wrong key or corrupted data)" });
    return;
  }

  const result = await runProviderTest(doc, plain);
  const statusLabel = result.ok ? `ok: ${result.message}` : `error: ${result.message}`;

  await IntegrationSecret.findByIdAndUpdate(id, {
    $set: {
      testStatus: statusLabel.slice(0, 500),
      testCheckedAt: new Date(),
    },
  });

  await appendAudit({
    action: "integration_secret_test",
    source: "admin_api",
    meta: { id: String(doc._id), provider: doc.provider, ok: result.ok, route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  if (!result.ok) {
    res.status(result.status >= 400 ? result.status : 502).json({
      ok: false,
      message: result.message,
    });
    return;
  }

  res.json({ ok: true, message: result.message });
}

async function disableSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const doc = await IntegrationSecret.findByIdAndUpdate(
    id,
    { status: "disabled", updatedBy: "admin_api" },
    { new: true },
  ).lean();
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await appendAudit({
    action: "integration_secret_disable",
    source: "admin_api",
    meta: { id: String(doc._id), provider: doc.provider, route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  void notifyIntegrationSecretAudit("disable", { id: String(doc._id), provider: doc.provider });

  res.json(toPublic(doc));
}

async function enableSecret(req, res) {
  if (!requireSecretsKey(res)) return;
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const doc = await IntegrationSecret.findByIdAndUpdate(
    id,
    { status: "active", updatedBy: "admin_api" },
    { new: true },
  ).lean();
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await appendAudit({
    action: "integration_secret_enable",
    source: "admin_api",
    meta: { id: String(doc._id), provider: doc.provider, route: auditRoute(req) },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  void notifyIntegrationSecretAudit("enable", { id: String(doc._id), provider: doc.provider });

  res.json(toPublic(doc));
}

module.exports = {
  listSecrets,
  createSecret,
  updateSecret,
  rotateSecret,
  testSecret,
  disableSecret,
  enableSecret,
};
