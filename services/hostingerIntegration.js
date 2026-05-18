const config = require("../config");
const IntegrationSecret = require("../models/IntegrationSecret");
const { decryptSecret } = require("./secretCrypto");
const { challengeHostName } = require("./dnsVerify");
const {
  getDnsRecords,
  updateDnsRecords,
  validateDnsRecords,
  listHostingOrders,
  listHostingWebsites,
  createHostingWebsite,
  verifyDomainOwnership,
} = require("./integrations/hostingerApi");

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

/**
 * Provision `{subdomain}.{PLATFORM_PUBLISH_DOMAIN}` via Hostinger POST /api/hosting/v1/websites.
 * @param {import("mongoose").Document} siteDoc
 */
async function provisionPlatformSubdomain(siteDoc) {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    return {
      ok: false,
      status: 503,
      message: "Hostinger API token not configured (admin Integrations → hostinger)",
    };
  }

  const apex = getPlatformPublishDomain();
  const fqdn = platformFqdnForSubdomain(siteDoc.subdomain);
  const orderId = await resolveHostingOrderId(creds, apex);
  if (!orderId) {
    return {
      ok: false,
      status: 400,
      message:
        "Could not resolve hosting order_id. Set hostingOrderId in the hostinger integration metadata, or HOSTINGER_HOSTING_ORDER_ID, or ensure your main site exists in Hostinger websites.",
    };
  }

  const listed = await listHostingWebsites(creds.token, { domain: fqdn, per_page: 10 });
  if (listed.ok && listed.websites?.length) {
    siteDoc.hostingerSubdomainStatus = "provisioned";
    siteDoc.hostingerSubdomainNote = "Already present in Hostinger websites list";
    siteDoc.hostingerSubdomainAt = new Date();
    await siteDoc.save();
    return {
      ok: true,
      fqdn,
      orderId,
      alreadyExists: true,
      message: `${fqdn} is already on your Hostinger account`,
    };
  }

  const verify = await verifyDomainOwnership(creds.token, fqdn);
  const verifyData = verify.ok && verify.data ? verify.data : null;
  if (verifyData && verifyData.is_accessible === false && verifyData.txt_to_verify) {
    siteDoc.hostingerSubdomainNote = `Ownership TXT may be required: ${verifyData.txt_to_verify}`.slice(0, 500);
  }

  const created = await createHostingWebsite(creds.token, { domain: fqdn, order_id: orderId });
  if (!created.ok) {
    siteDoc.hostingerSubdomainStatus = "failed";
    siteDoc.hostingerSubdomainNote = String(created.message || "Hostinger create website failed").slice(0, 500);
    siteDoc.hostingerSubdomainAt = new Date();
    await siteDoc.save();
    return {
      ok: false,
      status: created.status || 502,
      message: created.message,
      fqdn,
      orderId,
      manualFallback: true,
    };
  }

  siteDoc.hostingerSubdomainStatus = "provisioned";
  siteDoc.hostingerSubdomainNote =
    "Hostinger website create requested (may take a few minutes). In hPanel, set document root to the same public_html as your main site if needed; enable SSL.";
  siteDoc.hostingerSubdomainAt = new Date();
  await siteDoc.save();

  return {
    ok: true,
    fqdn,
    orderId,
    async: true,
    message: `Requested Hostinger website for ${fqdn}. Check hPanel → Websites in a few minutes; point docroot to same public_html as ${apex}.`,
    verify: verifyData,
  };
}

/**
 * Provision tenant host when not already marked provisioned (publish / signup).
 * @param {import("mongoose").Document} siteDoc
 */
async function maybeProvisionPlatformSubdomain(siteDoc) {
  const fqdn = platformFqdnForSubdomain(siteDoc.subdomain);
  if (siteDoc.hostingerSubdomainStatus === "provisioned") {
    return {
      ok: true,
      skipped: true,
      fqdn,
      message: `Site is live at https://${fqdn}`,
    };
  }
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
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
