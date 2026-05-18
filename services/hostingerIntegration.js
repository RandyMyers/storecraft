const config = require("../config");
const IntegrationSecret = require("../models/IntegrationSecret");
const { decryptSecret } = require("./secretCrypto");
const { challengeHostName } = require("./dnsVerify");

const PROVISION_LOG = "[hostinger-provision]";

/** @param {"log"|"error"} level @param {...unknown} args */
function logProvision(level, ...args) {
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(PROVISION_LOG, ...args);
  } else {
    // eslint-disable-next-line no-console
    console.log(PROVISION_LOG, ...args);
  }
}
const {
  getDnsRecords,
  updateDnsRecords,
  validateDnsRecords,
  listHostingOrders,
  listHostingWebsites,
  createHostingWebsite,
  verifyDomainOwnership,
} = require("./integrations/hostingerApi");
const { ensurePlatformTenantDns, ensureWildcardTenantDns } = require("./platformTenantDns");
const { probePublishLiveUrl } = require("./publishLiveProbe");

/**
 * Load active Hostinger API token from encrypted admin secret (provider: hostinger).
 * @returns {Promise<{ token: string, secretId: string, metadata: Record<string, unknown> } | null>}
 */
async function getHostingerCredentials() {
  if (!config.secretsMasterKey) return null;
  const doc = await IntegrationSecret.findOne({
    provider: "hostinger",
    status: "active",
  })
    .sort({ updatedAt: -1 })
    .lean();
  if (!doc) return null;
  try {
    const token = decryptSecret(doc, config.secretsMasterKey);
    return {
      token: String(token || "").trim(),
      secretId: String(doc._id),
      metadata: doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} hostname
 * @returns {string|null} DNS zone apex
 */
function dnsZoneApexFromHostname(hostname) {
  const h = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!h || !h.includes(".")) return null;
  const parts = h.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

/**
 * Relative record name inside a zone (Hostinger API `name` field).
 * @param {string} fqdn
 * @param {string} zone
 */
function relativeDnsName(fqdn, zone) {
  const f = String(fqdn || "").trim().toLowerCase().replace(/\.$/, "");
  const z = String(zone || "").trim().toLowerCase().replace(/\.$/, "");
  if (f === z) return "@";
  const suffix = `.${z}`;
  if (f.endsWith(suffix)) {
    const rel = f.slice(0, -suffix.length);
    return rel || "@";
  }
  return null;
}

/**
 * Append or replace TXT at `recordName` without overwriting the whole zone.
 * Uses Hostinger `overwrite: false` (merge).
 *
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.zone
 * @param {string} params.recordName e.g. _nestpage-challenge.www
 * @param {string} params.txtValue
 */
async function upsertTxtRecord({ token, zone, recordName, txtValue }) {
  const zoneNorm = String(zone || "").trim().toLowerCase();
  const name = recordName === "@" ? "@" : String(recordName || "").trim();
  const content = String(txtValue || "").trim();
  if (!zoneNorm || !name || !content) {
    return { ok: false, status: 400, message: "zone, recordName, and txtValue are required" };
  }

  const body = {
    overwrite: false,
    zone: [
      {
        name,
        type: "TXT",
        ttl: 300,
        records: [{ content }],
      },
    ],
  };

  const validation = await validateDnsRecords(token, zoneNorm, body);
  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status || 422,
      message: validation.message || "DNS validation failed",
    };
  }

  return updateDnsRecords(token, zoneNorm, body);
}

/**
 * Apply Nestpage verification TXT for a custom domain hostname.
 * @param {import("mongoose").Document} domainDoc
 */
async function applyDomainVerificationTxt(domainDoc) {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    return {
      ok: false,
      status: 503,
      message: "Hostinger API token not configured (add hostinger secret in admin Integrations)",
    };
  }

  const hostname = String(domainDoc.hostname || "").trim().toLowerCase();
  const zone = dnsZoneApexFromHostname(hostname);
  if (!zone) {
    return { ok: false, status: 400, message: "Could not determine DNS zone for hostname" };
  }

  const portfolioCheck = await getDnsRecords(creds.token, zone);
  if (!portfolioCheck.ok) {
    return {
      ok: false,
      status: portfolioCheck.status || 400,
      message:
        portfolioCheck.message ||
        `DNS zone not manageable via Hostinger API for ${zone}. Add TXT manually in hPanel.`,
    };
  }

  const fqdn = challengeHostName(hostname);
  const relName = relativeDnsName(fqdn, zone);
  if (relName == null) {
    return { ok: false, status: 400, message: "Hostname does not belong to DNS zone" };
  }

  const result = await upsertTxtRecord({
    token: creds.token,
    zone,
    recordName: relName,
    txtValue: domainDoc.verification_token,
  });

  return {
    ...result,
    zone,
    fqdn,
    recordName: relName,
  };
}

/**
 * Add wildcard + apex A records for VPS gen-2 (optional admin action).
 * @param {{ token: string, zone: string, ipv4: string, includeApex?: boolean }} params
 */
async function applyPlatformWildcardA({ token, zone, ipv4, includeApex = true }) {
  const zoneNorm = String(zone || "").trim().toLowerCase();
  const ip = String(ipv4 || "").trim();
  if (!zoneNorm || !ip) {
    return { ok: false, status: 400, message: "zone and ipv4 are required" };
  }

  const entries = [
    {
      name: "*",
      type: "A",
      ttl: 14400,
      records: [{ content: ip }],
    },
  ];
  if (includeApex) {
    entries.push({
      name: "@",
      type: "A",
      ttl: 14400,
      records: [{ content: ip }],
    });
  }

  const body = { overwrite: false, zone: entries };
  const validation = await validateDnsRecords(token, zoneNorm, body);
  if (!validation.ok) {
    return { ok: false, status: validation.status || 422, message: validation.message };
  }
  return updateDnsRecords(token, zoneNorm, body);
}

function getPlatformPublishDomain() {
  return String(config.platformPublishDomain || "citematch.com").trim() || "citematch.com";
}

function platformFqdnForSubdomain(subdomain) {
  const sub = String(subdomain || "").trim().toLowerCase();
  const apex = getPlatformPublishDomain();
  return sub ? `${sub}.${apex}` : apex;
}

/**
 * @param {{ metadata?: Record<string, unknown> }} creds
 * @param {string} [apex]
 */
async function resolveHostingOrderId(creds, apex) {
  const meta = creds?.metadata && typeof creds.metadata === "object" ? creds.metadata : {};
  const fromMeta = Number(meta.hostingOrderId);
  if (Number.isFinite(fromMeta) && fromMeta > 0) {
    return Math.floor(fromMeta);
  }
  if (config.hostingerHostingOrderId) {
    return config.hostingerHostingOrderId;
  }
  const token = creds?.token;
  if (!token) return null;

  const apexNorm = String(apex || getPlatformPublishDomain()).trim().toLowerCase();
  const sites = await listHostingWebsites(token, { domain: apexNorm, per_page: 50 });
  if (sites.ok && sites.websites?.length) {
    const main =
      sites.websites.find((w) => String(w.vhost_type || "").toLowerCase() === "main") ||
      sites.websites[0];
    const oid = Number(main?.order_id);
    if (Number.isFinite(oid) && oid > 0) return Math.floor(oid);
  }

  const orders = await listHostingOrders(token, { per_page: 50 });
  if (orders.ok && orders.orders?.length) {
    const oid = Number(orders.orders[0]?.id ?? orders.orders[0]?.order_id);
    if (Number.isFinite(oid) && oid > 0) return Math.floor(oid);
  }
  return null;
}

function usesWebsitesApiProvision() {
  const mode = config.hostingerProvisionMode || "dns_cname";
  return mode === "websites_api" || mode === "both";
}

function usesDnsCnameProvision() {
  const mode = config.hostingerProvisionMode || "dns_cname";
  return mode === "dns_cname" || mode === "both" || mode === "";
}

/**
 * Apply live probe result to site document.
 * @param {import("mongoose").Document} siteDoc
 * @param {{ live: boolean, reason: string, isHostingerDefault?: boolean }} probe
 * @param {string} fqdn
 */
async function applyLiveProbeToSite(siteDoc, probe, fqdn) {
  if (probe.live) {
    siteDoc.hostingerSubdomainStatus = "live";
    siteDoc.hostingerSubdomainNote = "Live URL serves your published site.";
    siteDoc.hostingerSubdomainAt = new Date();
    await siteDoc.save();
    return {
      ok: true,
      live: true,
      fqdn,
      message: `Your site is live at https://${fqdn}`,
    };
  }

  if (probe.isHostingerDefault) {
    siteDoc.hostingerSubdomainStatus = "hosting_pending";
    siteDoc.hostingerSubdomainNote =
      "DNS is set but Hostinger still shows the default page. In hPanel, remove the separate website for this subdomain OR set its document root to the same public_html as citematch.com.";
    siteDoc.hostingerSubdomainAt = new Date();
    await siteDoc.save();
    return {
      ok: true,
      live: false,
      hostingPending: true,
      fqdn,
      message:
        "Published. Preview works now. Live URL still shows Hostinger’s empty site — fix document root in hPanel (see admin note).",
    };
  }

  siteDoc.hostingerSubdomainStatus = "hosting_pending";
  siteDoc.hostingerSubdomainNote = `Live URL not ready yet (${probe.reason}). Use preview; try again in a few minutes.`;
  siteDoc.hostingerSubdomainAt = new Date();
  await siteDoc.save();
  return {
    ok: true,
    live: false,
    fqdn,
    message: "Published. Your design is saved — live URL may take a few minutes to show the theme.",
  };
}

/**
 * Legacy: POST /api/hosting/v1/websites (separate vhost — often wrong docroot).
 * @param {import("mongoose").Document} siteDoc
 * @param {{ token: string, metadata?: object }} creds
 * @param {string} fqdn
 * @param {number} orderId
 */
async function provisionWebsitesApiVhost(siteDoc, creds, fqdn, orderId) {
  const listed = await listHostingWebsites(creds.token, { domain: fqdn, per_page: 10 });
  if (listed.ok && listed.websites?.length) {
    return {
      ok: true,
      skipped: true,
      alreadyExists: true,
      message: `${fqdn} already listed in Hostinger websites`,
    };
  }

  const verify = await verifyDomainOwnership(creds.token, fqdn);
  if (!verify.ok) {
    logProvision("error", "verify-ownership failed", { fqdn, message: verify.message });
  }

  const created = await createHostingWebsite(creds.token, { domain: fqdn, order_id: orderId });
  if (!created.ok) {
    siteDoc.hostingerSubdomainStatus = "failed";
    siteDoc.hostingerSubdomainNote = String(created.message || "Hostinger create website failed").slice(0, 500);
    siteDoc.hostingerSubdomainAt = new Date();
    await siteDoc.save();
    return { ok: false, status: created.status || 502, message: created.message, fqdn, orderId };
  }

  return {
    ok: true,
    async: true,
    message: `Hostinger website create requested for ${fqdn}`,
  };
}

/**
 * Provision `{subdomain}.{PLATFORM_PUBLISH_DOMAIN}` — DNS CNAME to platform CDN + live URL verify.
 * @param {import("mongoose").Document} siteDoc
 */
async function provisionPlatformSubdomain(siteDoc) {
  const siteId = siteDoc._id ? String(siteDoc._id) : "(unknown)";
  const subdomain = String(siteDoc.subdomain || "").trim().toLowerCase();

  logProvision("log", "start", { siteId, subdomain });

  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    logProvision("error", "no Hostinger token in Integrations", { siteId, subdomain });
    return {
      ok: false,
      status: 503,
      message: "Hostinger API token not configured (admin Integrations → hostinger)",
    };
  }

  const apex = getPlatformPublishDomain();
  const fqdn = platformFqdnForSubdomain(siteDoc.subdomain);
  logProvision("log", "resolved fqdn", { siteId, fqdn, apex });

  let orderId = null;
  if (usesWebsitesApiProvision()) {
    orderId = await resolveHostingOrderId(creds, apex);
    if (!orderId) {
      logProvision("error", "could not resolve hosting order_id", { siteId, fqdn, apex });
      return {
        ok: false,
        status: 400,
        message:
          "Could not resolve hosting order_id. Set hostingOrderId in the hostinger integration metadata, or HOSTINGER_HOSTING_ORDER_ID, or ensure your main site exists in Hostinger websites.",
      };
    }
  }
  const results = { fqdn, orderId, dns: null, websites: null, wildcard: null };

  if (usesDnsCnameProvision()) {
    logProvision("log", "ensure wildcard DNS (optional)", { apex });
    results.wildcard = await ensureWildcardTenantDns(creds.token, apex);

    logProvision("log", "ensure tenant CNAME DNS", { label: subdomain, apex });
    results.dns = await ensurePlatformTenantDns(creds.token, subdomain, apex);
    if (!results.dns.ok) {
      logProvision("error", "tenant DNS failed", results.dns);
      siteDoc.hostingerSubdomainStatus = "failed";
      siteDoc.hostingerSubdomainNote = String(results.dns.message || "DNS setup failed").slice(0, 500);
      siteDoc.hostingerSubdomainAt = new Date();
      await siteDoc.save();
      return {
        ok: false,
        status: results.dns.status || 502,
        message: results.dns.message,
        fqdn,
        dns: results.dns,
      };
    }
  }

  if (usesWebsitesApiProvision()) {
    logProvision("log", "websites API provision", { fqdn, orderId });
    results.websites = await provisionWebsitesApiVhost(siteDoc, creds, fqdn, orderId);
    if (results.websites && !results.websites.ok) {
      return { ...results.websites, fqdn, dns: results.dns };
    }
  }

  logProvision("log", "probing live URL", { fqdn });
  const probe = await probePublishLiveUrl(fqdn);
  logProvision("log", "live probe", { fqdn, ...probe });

  const liveResult = await applyLiveProbeToSite(siteDoc, probe, fqdn);

  return {
    ...liveResult,
    fqdn,
    orderId,
    dns: results.dns,
    websites: results.websites,
    liveProbe: probe,
  };
}

/**
 * Provision tenant host when not already marked provisioned (publish / signup).
 * @param {import("mongoose").Document} siteDoc
 */
async function maybeProvisionPlatformSubdomain(siteDoc) {
  const fqdn = platformFqdnForSubdomain(siteDoc.subdomain);

  if (siteDoc.hostingerSubdomainStatus === "live") {
    const probe = await probePublishLiveUrl(fqdn);
    if (probe.live) {
      logProvision("log", "skip — already live", { fqdn });
      return {
        ok: true,
        skipped: true,
        live: true,
        fqdn,
        message: `Your site is live at https://${fqdn}`,
        liveProbe: probe,
      };
    }
    logProvision("log", "was live but probe failed — re-provision", { fqdn, reason: probe.reason });
  }

  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    logProvision("log", "skip — no token (publish still OK)", { fqdn });
    return {
      ok: false,
      skipped: true,
      reason: "no_token",
      fqdn,
      message:
        "Published. Add a Hostinger API token in admin Integrations to auto-create your subdomain, or create it in hPanel.",
    };
  }
  return provisionPlatformSubdomain(siteDoc);
}

module.exports = {
  getHostingerCredentials,
  dnsZoneApexFromHostname,
  relativeDnsName,
  upsertTxtRecord,
  applyDomainVerificationTxt,
  applyPlatformWildcardA,
  getPlatformPublishDomain,
  platformFqdnForSubdomain,
  resolveHostingOrderId,
  provisionPlatformSubdomain,
  maybeProvisionPlatformSubdomain,
};
