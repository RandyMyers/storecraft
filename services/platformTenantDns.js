/**
 * Route tenant hosts to the same Hostinger CDN / docroot as the platform apex via DNS (CNAME).
 * Avoids per-tenant POST /websites empty vhosts when provision mode is dns_cname.
 */

const config = require("../config");
const {
  getDnsRecords,
  validateDnsRecords,
  updateDnsRecords,
  deleteDnsRecords,
} = require("./integrations/hostingerApi");

function getPlatformPublishDomain() {
  return String(config.platformPublishDomain || "citematch.com").trim() || "citematch.com";
}

/**
 * @param {string} content
 */
function normalizeCnameTarget(content) {
  let c = String(content || "").trim().toLowerCase();
  if (!c) return "";
  if (!c.endsWith(".")) c = `${c}.`;
  return c;
}

/**
 * @param {unknown[]} records
 * @param {string} apex
 */
function inferPlatformCnameTarget(records, apex) {
  const list = Array.isArray(records) ? records : [];
  const www = list.find((r) => String(r.name || "").toLowerCase() === "www" && String(r.type || "").toUpperCase() === "CNAME");
  if (www?.records?.[0]?.content) {
    return normalizeCnameTarget(www.records[0].content);
  }
  const at = list.find(
    (r) =>
      (String(r.name || "").toLowerCase() === "@" || String(r.name || "").toLowerCase() === apex) &&
      ["ALIAS", "CNAME"].includes(String(r.type || "").toUpperCase()),
  );
  if (at?.records?.[0]?.content) {
    return normalizeCnameTarget(at.records[0].content);
  }
  return normalizeCnameTarget(`${apex}.cdn.hstgr.net`);
}

/**
 * @param {unknown[]} records
 * @param {string} label
 */
function tenantCnameExists(records, label) {
  const name = String(label || "").trim().toLowerCase();
  const list = Array.isArray(records) ? records : [];
  return list.some(
    (r) =>
      String(r.name || "").toLowerCase() === name &&
      String(r.type || "").toUpperCase() === "CNAME" &&
      (r.records || []).length > 0,
  );
}

/**
 * Ensure `{label}.{apex}` resolves like the main platform site (CNAME to apex CDN target).
 *
 * @param {string} token
 * @param {string} subdomainLabel e.g. bakery
 * @param {string} [apex]
 */
async function ensurePlatformTenantDns(token, subdomainLabel, apex) {
  const label = String(subdomainLabel || "").trim().toLowerCase();
  const zone = String(apex || getPlatformPublishDomain()).trim().toLowerCase();
  if (!label || label.includes(".") || !zone) {
    return { ok: false, status: 400, message: "Invalid subdomain label or zone" };
  }

  const zoneRecords = await getDnsRecords(token, zone);
  if (!zoneRecords.ok) {
    return {
      ok: false,
      status: zoneRecords.status || 502,
      message: zoneRecords.message || `Could not read DNS zone ${zone}`,
    };
  }

  const configured = String(config.hostingerTenantCnameTarget || "").trim();
  const target = configured
    ? normalizeCnameTarget(configured)
    : inferPlatformCnameTarget(zoneRecords.records, zone);

  if (!target) {
    return { ok: false, status: 400, message: "Could not determine CNAME target for tenant DNS" };
  }

  if (tenantCnameExists(zoneRecords.records, label)) {
    return {
      ok: true,
      skipped: true,
      zone,
      label,
      target,
      message: `DNS CNAME ${label}.${zone} already present`,
    };
  }

  const body = {
    overwrite: false,
    zone: [
      {
        name: label,
        type: "CNAME",
        ttl: 300,
        records: [{ content: target }],
      },
    ],
  };

  const validation = await validateDnsRecords(token, zone, body);
  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status || 422,
      message: validation.message || "DNS validation failed for tenant CNAME",
    };
  }

  const updated = await updateDnsRecords(token, zone, body);
  if (!updated.ok) {
    return {
      ok: false,
      status: updated.status || 502,
      message: updated.message || "Failed to add tenant CNAME",
    };
  }

  return {
    ok: true,
    zone,
    label,
    fqdn: `${label}.${zone}`,
    target,
    message: `Added DNS CNAME ${label} → ${target}`,
  };
}

/**
 * Optional one-time wildcard: *.apex → same CDN target (when enabled in env).
 *
 * @param {string} token
 * @param {string} [apex]
 */
async function ensureWildcardTenantDns(token, apex) {
  if (!config.hostingerEnsureWildcardCname) {
    return { ok: true, skipped: true, message: "Wildcard CNAME disabled" };
  }

  const zone = String(apex || getPlatformPublishDomain()).trim().toLowerCase();
  const zoneRecords = await getDnsRecords(token, zone);
  if (!zoneRecords.ok) {
    return { ok: false, status: zoneRecords.status, message: zoneRecords.message };
  }

  if (tenantCnameExists(zoneRecords.records, "*")) {
    return { ok: true, skipped: true, message: `Wildcard CNAME already in ${zone}` };
  }

  const target = String(config.hostingerTenantCnameTarget || "").trim()
    ? normalizeCnameTarget(config.hostingerTenantCnameTarget)
    : inferPlatformCnameTarget(zoneRecords.records, zone);

  const body = {
    overwrite: false,
    zone: [
      {
        name: "*",
        type: "CNAME",
        ttl: 300,
        records: [{ content: target }],
      },
    ],
  };

  const validation = await validateDnsRecords(token, zone, body);
  if (!validation.ok) {
    return { ok: false, status: validation.status, message: validation.message };
  }
  return updateDnsRecords(token, zone, body);
}

/**
 * Remove tenant CNAME (API-added records often show Hostinger "parked domain" without a vhost).
 * @param {string} token
 * @param {string} subdomainLabel
 * @param {string} [apex]
 */
async function removePlatformTenantCname(token, subdomainLabel, apex) {
  const label = String(subdomainLabel || "").trim().toLowerCase();
  const zone = String(apex || getPlatformPublishDomain()).trim().toLowerCase();
  if (!label || !zone) {
    return { ok: false, status: 400, message: "Invalid label or zone" };
  }

  const zoneRecords = await getDnsRecords(token, zone);
  if (!zoneRecords.ok) {
    return { ok: false, status: zoneRecords.status, message: zoneRecords.message };
  }

  const hasCname = tenantCnameExists(zoneRecords.records, label);
  if (!hasCname) {
    return { ok: true, skipped: true, message: `No CNAME to remove for ${label}` };
  }

  const deleted = await deleteDnsRecords(token, zone, {
    filters: [{ name: label, type: "CNAME" }],
  });
  if (!deleted.ok) {
    return deleted;
  }
  return {
    ok: true,
    message: `Removed CNAME ${label}.${zone} (avoids parked-domain page)`,
  };
}

module.exports = {
  ensurePlatformTenantDns,
  ensureWildcardTenantDns,
  removePlatformTenantCname,
  inferPlatformCnameTarget,
};
