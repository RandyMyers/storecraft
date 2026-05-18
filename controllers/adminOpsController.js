const mongoose = require("mongoose");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const { normalizeHostname } = require("../lib/domains");
const { verifyDomainDocument } = require("../services/domainVerification");
const { appendAudit } = require("../services/auditLog");

function adminAuditContext(req) {
  return {
    requestId: req.requestId || "",
    clientIp: typeof req.ip === "string" ? req.ip : String(req.ip || ""),
  };
}

/** GET ?subdomain= — site + owner + domain summary for support (no Mongo shell). */
exports.lookupSite = async (req, res) => {
  const subdomain = String(req.query.subdomain || "")
    .toLowerCase()
    .trim();
  if (!subdomain) {
    res.status(400).json({ error: "Query subdomain is required" });
    return;
  }

  const site = await Site.findOne({ subdomain }).lean();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const owner = await User.findById(site.userId).select("email subscriptionPlan").lean();
  const customDomainCount = await Domain.countDocuments({ siteId: site._id });
  const primary = await Domain.findOne({ siteId: site._id, is_primary: true })
    .select("hostname verification_status ssl_status is_primary")
    .lean();

  res.json({
    siteId: site._id.toString(),
    name: site.name,
    subdomain: site.subdomain,
    disabled: !!site.disabled,
    userId: site.userId.toString(),
    ownerEmail: owner?.email ?? null,
    ownerPlan: owner?.subscriptionPlan ?? null,
    templateSlug: typeof site.templateSlug === "string" && site.templateSlug ? site.templateSlug : "default",
    updatedAt: site.updatedAt ? new Date(site.updatedAt).toISOString() : null,
    publishedAt: site.publishedAt ? new Date(site.publishedAt).toISOString() : null,
    pageCount: Array.isArray(site.pages) ? site.pages.length : 0,
    customDomainCount,
    hostingerSubdomainStatus: site.hostingerSubdomainStatus || "manual_required",
    hostingerSubdomainNote: site.hostingerSubdomainNote || "",
    hostingerSubdomainAt: site.hostingerSubdomainAt
      ? new Date(site.hostingerSubdomainAt).toISOString()
      : null,
    primaryDomain: primary
      ? {
          hostname: primary.hostname,
          verification_status: primary.verification_status,
          ssl_status: primary.ssl_status,
        }
      : null,
  });
};

/** GET ?hostname= — domain row + owning site (for stuck DNS / SSL triage). */
exports.lookupDomain = async (req, res) => {
  const hostname = normalizeHostname(req.query.hostname);
  if (!hostname) {
    res.status(400).json({ error: "Query hostname is required" });
    return;
  }

  const domain = await Domain.findOne({ hostname }).lean();
  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const site = await Site.findById(domain.siteId).lean();
  const owner = site ? await User.findById(site.userId).select("email").lean() : null;

  res.json({
    domain: {
      id: domain._id.toString(),
      siteId: domain.siteId.toString(),
      hostname: domain.hostname,
      is_primary: !!domain.is_primary,
      verification_status: domain.verification_status,
      ssl_status: domain.ssl_status,
      hostingerTxtApplied: !!domain.hostingerTxtApplied,
      hostingerTxtLastError: domain.hostingerTxtLastError || "",
      failure_reason: domain.failure_reason || "",
      last_checked_at: domain.last_checked_at ? new Date(domain.last_checked_at).toISOString() : null,
    },
    site: site
      ? {
          id: site._id.toString(),
          name: site.name,
          subdomain: site.subdomain,
          disabled: !!site.disabled,
          ownerEmail: owner?.email ?? null,
        }
      : null,
    warning: site ? undefined : "Domain references a missing site document",
  });
};

/** GET ?limit= (default 50, max 200) — recent admin API audit rows (newest first). */
exports.listAudit = async (req, res) => {
  const rawLimit = Number(req.query.limit || 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50));
  const rows = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
  res.json({
    entries: rows.map((r) => ({
      id: r._id.toString(),
      action: r.action,
      source: r.source,
      siteId: r.siteId ? r.siteId.toString() : null,
      domainId: r.domainId ? r.domainId.toString() : null,
      meta: r.meta && typeof r.meta === "object" ? r.meta : {},
      requestId: r.requestId || "",
      clientIp: r.clientIp || "",
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
  });
};

/**
 * Force DNS TXT verification for a domain (ops). Same logic as dashboard “Check DNS / verify”.
 * Header: X-Nestpage-Admin-Key (see ADMIN_API_KEY).
 */
exports.verifyDomain = async (req, res) => {
  let domainId;
  try {
    domainId = new mongoose.Types.ObjectId(req.params.domainId);
  } catch {
    res.status(400).json({ error: "Invalid domain id" });
    return;
  }

  const domain = await Domain.findById(domainId);
  if (!domain) {
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const result = await verifyDomainDocument(domain);

  const ctx = adminAuditContext(req);
  await appendAudit({
    action: "admin.domain.verify",
    siteId: domain.siteId,
    domainId: domain._id,
    meta: {
      outcome: result.outcome,
      verified: result.verified,
      hostname: domain.hostname,
      verification_status: domain.verification_status,
      ssl_status: domain.ssl_status,
    },
    ...ctx,
  });

  res.json({
    ok: true,
    outcome: result.outcome,
    verified: result.verified,
    domainId: domain._id.toString(),
    siteId: domain.siteId.toString(),
    hostname: domain.hostname,
    verification_status: domain.verification_status,
    ssl_status: domain.ssl_status,
    message: result.message || domain.failure_reason || undefined,
  });
};

/** Suspend public access (viewer, forms, SEO files, redirect JSON). */
exports.disableSite = async (req, res) => {
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(req.params.siteId);
  } catch {
    res.status(400).json({ error: "Invalid site id" });
    return;
  }

  const site = await Site.findByIdAndUpdate(siteId, { $set: { disabled: true } }, { new: true }).lean();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const ctx = adminAuditContext(req);
  await appendAudit({
    action: "admin.site.disable",
    siteId: site._id,
    meta: { subdomain: site.subdomain, name: site.name },
    ...ctx,
  });

  res.json({ ok: true, siteId: site._id.toString(), disabled: true });
};

exports.enableSite = async (req, res) => {
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(req.params.siteId);
  } catch {
    res.status(400).json({ error: "Invalid site id" });
    return;
  }

  const site = await Site.findByIdAndUpdate(siteId, { $set: { disabled: false } }, { new: true }).lean();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const ctx = adminAuditContext(req);
  await appendAudit({
    action: "admin.site.enable",
    siteId: site._id,
    meta: { subdomain: site.subdomain, name: site.name },
    ...ctx,
  });

  res.json({ ok: true, siteId: site._id.toString(), disabled: false });
};
