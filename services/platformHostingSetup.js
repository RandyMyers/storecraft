/**
 * Recommended gen-1 platform hosting: wildcard + per-tenant CNAME DNS,
 * list separate Hostinger "websites" that block the shared public_html app.
 */

const Site = require("../models/Site");
const config = require("../config");
const { getHostingerCredentials, getPlatformPublishDomain, platformFqdnForSubdomain } = require("./hostingerIntegration");
const { listHostingWebsites } = require("./integrations/hostingerApi");
const { ensurePlatformTenantDns, ensureWildcardTenantDns } = require("./platformTenantDns");
const { probePublishLiveUrl } = require("./publishLiveProbe");

/**
 * Hostinger "websites" for tenant hosts (e.g. site-2-2.citematch.com) that use a separate docroot.
 * These should be removed in hPanel so DNS routes to the main public_html app.
 *
 * @param {string} token
 * @param {string} [apex]
 */
async function listConflictingAddonWebsites(token, apex) {
  const zone = String(apex || getPlatformPublishDomain()).trim().toLowerCase();
  const listed = await listHostingWebsites(token, { per_page: 100 });
  if (!listed.ok) {
    return { ok: false, status: listed.status, message: listed.message, websites: [] };
  }

  const suffix = `.${zone}`;
  const conflicts = (listed.websites || []).filter((w) => {
    const d = String(w.domain || "").trim().toLowerCase();
    if (!d || d === zone || d === `www.${zone}`) return false;
    return d.endsWith(suffix);
  });

  return {
    ok: true,
    apex: zone,
    websites: conflicts.map((w) => ({
      domain: w.domain,
      vhost_type: w.vhost_type,
      is_enabled: w.is_enabled,
      order_id: w.order_id,
      root_directory: w.root_directory || "",
      action: "Delete this website in hPanel → Websites, OR set document root to same public_html as citematch.com",
    })),
  };
}

/**
 * Run recommended platform setup: wildcard CNAME, all tenant CNAMEs, live probes.
 * @returns {Promise<object>}
 */
async function runPlatformPublishSetup() {
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    return {
      ok: false,
      status: 503,
      message: "Hostinger API token not configured (admin Integrations → hostinger)",
    };
  }

  const apex = getPlatformPublishDomain();
  const token = creds.token;
  const result = {
    ok: true,
    apex,
    provisionMode: config.hostingerProvisionMode || "parent_website",
    wildcard: null,
    tenants: [],
    conflicts: null,
    summary: { live: 0, hosting_pending: 0, failed: 0 },
  };

  result.wildcard = await ensureWildcardTenantDns(token, apex);
  result.conflicts = await listConflictingAddonWebsites(token, apex);

  const sites = await Site.find({ disabled: { $ne: true } }).select(
    "subdomain name hostingerSubdomainStatus hostingerSubdomainNote",
  );

  for (const site of sites) {
    const sub = String(site.subdomain || "").trim().toLowerCase();
    if (!sub) continue;
    const fqdn = platformFqdnForSubdomain(sub);
    const row = { siteId: String(site._id), subdomain: sub, fqdn, dns: null, probe: null };

    row.dns = await ensurePlatformTenantDns(token, sub, apex);
    row.probe = await probePublishLiveUrl(fqdn);

    if (row.probe.live) {
      site.hostingerSubdomainStatus = "live";
      site.hostingerSubdomainNote = "Live URL serves your published site.";
      result.summary.live += 1;
    } else if (row.probe.isHostingerDefault) {
      site.hostingerSubdomainStatus = "hosting_pending";
      site.hostingerSubdomainNote =
        "Remove separate Hostinger website for this host in hPanel (Websites), then Publish again.";
      result.summary.hosting_pending += 1;
    } else if (row.dns.ok) {
      site.hostingerSubdomainStatus = "hosting_pending";
      site.hostingerSubdomainNote = "DNS updated; live URL not ready yet — wait or fix hPanel.";
      result.summary.hosting_pending += 1;
    } else {
      site.hostingerSubdomainStatus = "failed";
      site.hostingerSubdomainNote = String(row.dns.message || "DNS setup failed").slice(0, 500);
      result.summary.failed += 1;
    }
    site.hostingerSubdomainAt = new Date();
    await site.save();
    result.tenants.push(row);
  }

  const conflictCount = result.conflicts?.websites?.length || 0;
  result.message =
    conflictCount > 0
      ? `DNS applied. Delete ${conflictCount} separate website(s) in hPanel (listed below), then Publish each tenant again.`
      : `Platform DNS setup complete. ${result.summary.live} live, ${result.summary.hosting_pending} pending.`;

  if (conflictCount > 0 && result.summary.live === 0) {
    result.ok = true;
    result.needsHpanelCleanup = true;
  }

  return result;
}

module.exports = {
  listConflictingAddonWebsites,
  runPlatformPublishSetup,
};
