const mongoose = require("mongoose");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const User = require("../models/User");
const { entitlementLimits } = require("../lib/entitlements");
const { normalizeHostname, isPlausibleHostname, newVerificationToken } = require("../lib/domains");
const { verifyDomainDocument } = require("../services/domainVerification");
const { promoteSslIfReady } = require("../services/domainSslPromotion");
const { applyDomainVerificationTxt } = require("../services/hostingerIntegration");

async function loadWritableSite(siteIdStr, userIdStr, res) {
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(siteIdStr);
  } catch {
    res.status(404).json({ error: "Site not found" });
    return null;
  }
  const userObjectId = new mongoose.Types.ObjectId(userIdStr);
  const site = await Site.findOne({ _id: siteId, userId: userObjectId });
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return null;
  }
  return site;
}

function serializeDomain(d) {
  const o = d.toObject ? d.toObject({ flattenMaps: true }) : d;
  const id = (o._id || o.id).toString();
  return {
    id,
    siteId: (o.siteId || o.site_id)?.toString?.() ?? String(o.siteId),
    hostname: o.hostname,
    type: o.type,
    verification_method: o.verification_method,
    verification_token: o.verification_token,
    verification_status: o.verification_status,
    ssl_status: o.ssl_status,
    is_primary: !!o.is_primary,
    last_checked_at: o.last_checked_at ? new Date(o.last_checked_at).getTime() : null,
    failure_reason: o.failure_reason || "",
    hostingerTxtApplied: !!o.hostingerTxtApplied,
    hostingerTxtLastError: o.hostingerTxtLastError || "",
    createdAt: o.createdAt ? new Date(o.createdAt).getTime() : null,
    updatedAt: o.updatedAt ? new Date(o.updatedAt).getTime() : null,
  };
}

/** Best-effort Hostinger TXT when token + zone are available; never throws. */
async function tryAutoApplyHostingerTxt(domain) {
  try {
    const out = await applyDomainVerificationTxt(domain);
    if (out.ok) {
      domain.hostingerTxtApplied = true;
      domain.hostingerTxtLastError = "";
      await domain.save();
      return {
        applied: true,
        message: "Verification TXT applied via Hostinger DNS",
        zone: out.zone,
      };
    }
    if (out.status === 503) {
      return { applied: false, skipped: "not_configured" };
    }
    const msg = out.message || "Hostinger DNS apply failed";
    domain.hostingerTxtLastError = msg;
    await domain.save();
    return { applied: false, message: msg };
  } catch (err) {
    const msg = err?.message || "Hostinger DNS apply failed";
    domain.hostingerTxtLastError = msg;
    await domain.save();
    return { applied: false, message: msg };
  }
}

exports.list = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  const rows = await Domain.find({ siteId: site._id }).sort({ createdAt: -1 }).lean();
  const domains = rows.map((r) => serializeDomain(r));
  res.json({ domains });
};

exports.create = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  const hostname = normalizeHostname(req.body.hostname);
  if (!isPlausibleHostname(hostname)) {
    res.status(400).json({ error: "Enter a valid hostname (e.g. www.example.com)" });
    return;
  }

  const owner = await User.findById(req.userId).lean();
  if (owner) {
    const { limits, effectivePlan } = await entitlementLimits(owner);
    if (limits.maxCustomDomainsPerSite <= 0) {
      res.status(403).json({
        error: "Custom domains require a paid plan (bank transfer or USDT — request upgrade from Plan & billing).",
        code: "PLAN_LIMIT",
      });
      return;
    }
    const existingCount = await Domain.countDocuments({ siteId: site._id });
    if (existingCount >= limits.maxCustomDomainsPerSite) {
      res.status(403).json({
        error: `Custom domain limit reached for this site on the ${effectivePlan} plan (${limits.maxCustomDomainsPerSite} max).`,
        code: "PLAN_LIMIT",
      });
      return;
    }
  }

  const existing = await Domain.findOne({ hostname }).lean();
  if (existing) {
    res.status(409).json({ error: "That hostname is already registered" });
    return;
  }

  const domain = await Domain.create({
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
    hostname,
    type: "custom_domain",
    verification_token: newVerificationToken(),
    verification_status: "pending",
    ssl_status: "pending",
    is_primary: false,
  });

  const hostinger = await tryAutoApplyHostingerTxt(domain);
  res.status(201).json({ domain: serializeDomain(domain), hostinger });
};

exports.remove = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const deleted = await Domain.findOneAndDelete({
    _id: domainId,
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
  });

  if (!deleted) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }
  res.json({ ok: true });
};

exports.setPrimary = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const domain = await Domain.findOne({
    _id: domainId,
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
  });

  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  await Domain.updateMany({ siteId: site._id }, { $set: { is_primary: false } });
  domain.is_primary = true;
  await domain.save();

  res.json({ domain: serializeDomain(domain) });
};

exports.requestVerify = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const domain = await Domain.findOne({
    _id: domainId,
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
  });

  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const result = await verifyDomainDocument(domain);

  if (result.outcome === "skipped_dev") {
    res.json({
      ok: true,
      verified: true,
      skippedDns: true,
      domain: serializeDomain(domain),
      dns_txt: result.dns_txt,
      dns_txt_value: result.dns_txt_value,
      message:
        "DNS check skipped (SKIP_DNS_VERIFY=true). Domain marked verified for local development.",
    });
    return;
  }

  if (result.verified) {
    res.json({
      ok: true,
      verified: true,
      domain: serializeDomain(domain),
      message: "Domain verified successfully via DNS TXT.",
    });
    return;
  }

  if (result.outcome === "transient_error") {
    res.status(503).json({
      ok: false,
      verified: false,
      error: domain.failure_reason,
      domain: serializeDomain(domain),
      dns_txt: result.dns_txt,
      dns_txt_value: result.dns_txt_value,
    });
    return;
  }

  res.json({
    ok: true,
    verified: false,
    domain: serializeDomain(domain),
    message: result.message || domain.failure_reason,
    dns_txt: result.dns_txt,
    dns_txt_value: result.dns_txt_value,
  });
};

/** POST — push verification TXT via Hostinger DNS API when zone is on Hostinger. */
exports.applyHostingerTxt = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const domain = await Domain.findOne({
    _id: domainId,
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
  });

  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const out = await applyDomainVerificationTxt(domain);
  if (!out.ok) {
    domain.hostingerTxtLastError = out.message || "Hostinger DNS apply failed";
    await domain.save();
    res.status(out.status || 502).json({ error: out.message, code: "hostinger_dns" });
    return;
  }

  domain.hostingerTxtApplied = true;
  domain.hostingerTxtLastError = "";
  await domain.save();

  res.json({
    ok: true,
    message: "Verification TXT applied via Hostinger. Run verify after DNS propagates.",
    zone: out.zone,
    fqdn: out.fqdn,
    domain: serializeDomain(domain),
  });
};

/** POST — probe HTTPS (TLS) and move ssl_pending → active when cert validates. */
exports.requestSslCheck = async (req, res) => {
  const site = await loadWritableSite(req.params.siteId, req.userId, res);
  if (!site) return;

  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const domain = await Domain.findOne({
    _id: domainId,
    siteId: site._id,
    userId: new mongoose.Types.ObjectId(req.userId),
  });

  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const timeoutMs = Number(process.env.SSL_PROBE_TIMEOUT_MS || 12000);
  const out = await promoteSslIfReady(domain, timeoutMs);

  if (out.promoted) {
    res.json({
      ok: true,
      sslActive: true,
      domain: serializeDomain(domain),
      message: "HTTPS certificate detected — SSL marked active.",
    });
    return;
  }

  if (out.skipped === "verification_not_active") {
    res.status(400).json({ error: "Verify DNS before checking SSL." });
    return;
  }

  if (out.skipped === "ssl_status_active") {
    res.json({
      ok: true,
      sslActive: true,
      domain: serializeDomain(domain),
      message: "SSL is already active.",
    });
    return;
  }

  res.json({
    ok: true,
    sslActive: false,
    probeError: out.error || null,
    domain: serializeDomain(domain),
    message:
      out.error === "timeout"
        ? "Timed out connecting to HTTPS — provisioning may still be in progress."
        : `HTTPS check did not succeed yet${out.error ? `: ${out.error}` : ""}.`,
  });
};
