const mongoose = require("mongoose");
const config = require("../config");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const User = require("../models/User");
const { appendAudit } = require("../services/auditLog");
const {
  getHostingerCredentials,
  applyDomainVerificationTxt,
  applyPlatformWildcardA,
  getPlatformPublishDomain,
  platformFqdnForSubdomain,
  resolveHostingOrderId,
  provisionPlatformSubdomain,
} = require("../services/hostingerIntegration");
const {
  listPortfolioDomains,
  getDnsRecords,
  listHostingOrders,
  listHostingWebsites,
  generateFreeSubdomain,
} = require("../services/integrations/hostingerApi");

function clientIp(req) {
  return String(req.ip || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
}

exports.status = async (req, res) => {
  const creds = await getHostingerCredentials();
  const apex = getPlatformPublishDomain();
  let hostingOrderId = null;
  if (creds?.token) {
    hostingOrderId = await resolveHostingOrderId(creds, apex);
  }
  res.json({
    configured: Boolean(config.secretsMasterKey),
    tokenPresent: Boolean(creds?.token),
    platformPublishDomain: apex,
    secretsMasterKey: Boolean(config.secretsMasterKey),
    hostingOrderId,
    hostingOrderIdFromEnv: config.hostingerHostingOrderId || null,
    autoProvisionSubdomain: Boolean(config.hostingerAutoProvisionSubdomain),
    notes:
      "Tenant URLs: {sub}." +
      apex +
      " via POST /api/hosting/v1/websites (shared plan order_id). Confirm same public_html in hPanel. DNS TXT API for custom domains.",
  });
};

exports.listHostingOrders = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const out = await listHostingOrders(creds.token, { per_page: 50 });
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }
  res.json({ orders: out.orders || [] });
};

exports.listHostingWebsites = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const domain = String(req.query.domain || "").trim().toLowerCase();
  const query = { per_page: 50 };
  if (domain) query.domain = domain;
  const out = await listHostingWebsites(creds.token, query);
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }
  res.json({ websites: out.websites || [] });
};

/** GET ?status=manual_required|provisioned|failed|all&limit= — tenant sites for Hostinger ops table */
exports.listTenantSites = async (req, res) => {
  const statusFilter = String(req.query.status || "all").trim();
  const limitRaw = Number(req.query.limit || 150);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 150;

  const query = {};
  if (statusFilter && statusFilter !== "all") {
    query.hostingerSubdomainStatus = statusFilter;
  }

  const rows = await Site.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
  const ownerIds = [...new Set(rows.map((s) => String(s.userId)))];
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } })
        .select("email")
        .lean()
    : [];
  const emailById = Object.fromEntries(owners.map((u) => [String(u._id), u.email]));

  const apex = getPlatformPublishDomain();
  const sites = rows.map((s) => ({
    id: String(s._id),
    name: s.name,
    subdomain: s.subdomain,
    platformUrl: `https://${s.subdomain}.${apex}`,
    hostingerSubdomainStatus: s.hostingerSubdomainStatus || "manual_required",
    hostingerSubdomainNote: s.hostingerSubdomainNote || "",
    hostingerSubdomainAt: s.hostingerSubdomainAt
      ? new Date(s.hostingerSubdomainAt).toISOString()
      : null,
    ownerEmail: emailById[String(s.userId)] || null,
    disabled: !!s.disabled,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : null,
  }));

  const counts = {
    manual_required: await Site.countDocuments({ hostingerSubdomainStatus: "manual_required" }),
    provisioned: await Site.countDocuments({ hostingerSubdomainStatus: "provisioned" }),
    hosting_pending: await Site.countDocuments({ hostingerSubdomainStatus: "hosting_pending" }),
    live: await Site.countDocuments({ hostingerSubdomainStatus: "live" }),
    failed: await Site.countDocuments({ hostingerSubdomainStatus: "failed" }),
    total: await Site.countDocuments({}),
  };

  res.json({ sites, counts });
};

/** GET ?verification=pending|all&limit= — custom domains for DNS TXT tab */
exports.listCustomDomains = async (req, res) => {
  const verification = String(req.query.verification || "all").trim();
  const limitRaw = Number(req.query.limit || 150);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 150;

  const query = { type: "custom_domain" };
  if (verification === "pending") {
    query.verification_status = { $in: ["pending", "verifying", "failed"] };
  }

  const rows = await Domain.find(query).sort({ updatedAt: -1 }).limit(limit).lean();
  const siteIds = [...new Set(rows.map((d) => String(d.siteId)))];
  const sites = siteIds.length
    ? await Site.find({ _id: { $in: siteIds } })
        .select("subdomain name")
        .lean()
    : [];
  const siteById = Object.fromEntries(sites.map((s) => [String(s._id), s]));

  const domains = rows.map((d) => {
    const site = siteById[String(d.siteId)];
    return {
      id: String(d._id),
      siteId: String(d.siteId),
      siteSubdomain: site?.subdomain || "",
      siteName: site?.name || "",
      hostname: d.hostname,
      verification_status: d.verification_status,
      ssl_status: d.ssl_status,
      hostingerTxtApplied: !!d.hostingerTxtApplied,
      hostingerTxtLastError: d.hostingerTxtLastError || "",
      is_primary: !!d.is_primary,
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
    };
  });

  res.json({
    domains,
    counts: {
      pendingTxt: await Domain.countDocuments({
        type: "custom_domain",
        verification_status: { $in: ["pending", "verifying", "failed"] },
      }),
      txtApplied: await Domain.countDocuments({ type: "custom_domain", hostingerTxtApplied: true }),
    },
  });
};

exports.generateFreeSubdomain = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const out = await generateFreeSubdomain(creds.token);
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }
  res.json({ ok: true, domain: out.domain, message: "Staging-only *.hostingersite.com subdomain" });
};

exports.provisionSubdomain = async (req, res) => {
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(req.params.siteId);
  } catch {
    res.status(400).json({ error: "Invalid site id" });
    return;
  }

  const site = await Site.findById(siteId);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const out = await provisionPlatformSubdomain(site);
  if (!out.ok) {
    res.status(out.status || 502).json({
      error: out.message,
      fqdn: out.fqdn,
      manualFallback: out.manualFallback,
    });
    return;
  }

  await appendAudit({
    action: "hostinger_provision_subdomain",
    source: "admin_api",
    meta: {
      siteId: String(siteId),
      subdomain: site.subdomain,
      fqdn: out.fqdn,
      orderId: out.orderId,
      alreadyExists: !!out.alreadyExists,
    },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  res.json({
    ok: true,
    message: out.message,
    fqdn: out.fqdn,
    orderId: out.orderId,
    alreadyExists: !!out.alreadyExists,
    async: !!out.async,
    site: {
      id: String(site._id),
      subdomain: site.subdomain,
      hostingerSubdomainStatus: site.hostingerSubdomainStatus,
      hostingerSubdomainNote: site.hostingerSubdomainNote,
      hostingerSubdomainAt: site.hostingerSubdomainAt,
      platformUrl: platformFqdnForSubdomain(site.subdomain)
        ? `https://${platformFqdnForSubdomain(site.subdomain)}`
        : null,
    },
  });
};

exports.listPortfolio = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const out = await listPortfolioDomains(creds.token);
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }
  res.json({ domains: out.domains || [] });
};

exports.getDnsZone = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const zone = String(req.params.zone || "").trim().toLowerCase();
  if (!zone) {
    res.status(400).json({ error: "Invalid zone" });
    return;
  }
  const out = await getDnsRecords(creds.token, zone);
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }
  res.json({ zone, records: out.records || [] });
};

exports.applyWildcardDns = async (req, res) => {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    res.status(503).json({ error: "Hostinger API token not configured" });
    return;
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const zone = String(body.zone || getPlatformPublishDomain()).trim().toLowerCase();
  const ipv4 = String(body.ipv4 || "").trim();
  const includeApex = body.includeApex !== false;

  const out = await applyPlatformWildcardA({
    token: creds.token,
    zone,
    ipv4,
    includeApex,
  });
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message });
    return;
  }

  await appendAudit({
    action: "hostinger_wildcard_dns",
    source: "admin_api",
    meta: { zone, ipv4, includeApex },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  res.json({ ok: true, message: out.message, zone, ipv4 });
};

exports.applyDomainTxt = async (req, res) => {
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

  const out = await applyDomainVerificationTxt(domain);
  if (!out.ok) {
    res.status(out.status || 502).json({ error: out.message, details: out });
    return;
  }

  domain.hostingerTxtApplied = true;
  domain.hostingerTxtLastError = "";
  await domain.save();

  await appendAudit({
    action: "hostinger_apply_domain_txt",
    source: "admin_api",
    meta: { domainId: String(domainId), hostname: domain.hostname, zone: out.zone },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  res.json({
    ok: true,
    message: "Verification TXT applied via Hostinger DNS API",
    zone: out.zone,
    fqdn: out.fqdn,
    recordName: out.recordName,
    domain: {
      id: String(domain._id),
      hostname: domain.hostname,
      hostingerTxtApplied: domain.hostingerTxtApplied,
    },
  });
};

exports.markSubdomainProvisioned = async (req, res) => {
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(req.params.siteId);
  } catch {
    res.status(400).json({ error: "Invalid site id" });
    return;
  }

  const site = await Site.findById(siteId);
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const status = String(body.status || "provisioned").trim();
  const allowed = new Set(["manual_required", "provisioned", "hosting_pending", "live", "failed"]);
  if (!allowed.has(status)) {
    res.status(400).json({
      error: "status must be manual_required, provisioned, hosting_pending, live, or failed",
    });
    return;
  }

  site.hostingerSubdomainStatus = status;
  site.hostingerSubdomainNote = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  site.hostingerSubdomainAt = new Date();
  await site.save();

  await appendAudit({
    action: "hostinger_subdomain_status",
    source: "admin_api",
    meta: { siteId: String(siteId), subdomain: site.subdomain, status },
    requestId: req.requestId || "",
    clientIp: clientIp(req),
  });

  res.json({
    ok: true,
    site: {
      id: String(site._id),
      subdomain: site.subdomain,
      hostingerSubdomainStatus: site.hostingerSubdomainStatus,
      hostingerSubdomainNote: site.hostingerSubdomainNote,
      hostingerSubdomainAt: site.hostingerSubdomainAt,
      platformUrl: `https://${site.subdomain}.${getPlatformPublishDomain()}`,
    },
  });
};
