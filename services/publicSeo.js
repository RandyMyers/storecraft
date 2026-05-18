const Domain = require("../models/Domain");
const { normalizeHostname } = require("../lib/domains");

function pagePathFromSlug(slug) {
  const s = slug === "home" ? "" : `/${slug}`;
  return s || "/";
}

/**
 * Builds canonical absolute URL + sets payload.canonicalUrl
 */
async function attachCanonicalToPayload(payload, siteMongoId, config) {
  if (!payload) return null;

  const proto = String(process.env.PUBLIC_URL_PROTO || "https").toLowerCase().startsWith("http:")
    ? "http"
    : "https";

  const path = pagePathFromSlug(payload.pageSlug);
  let canonicalUrl;

  const baseUrl = typeof process.env.PUBLIC_BASE_URL === "string" ? process.env.PUBLIC_BASE_URL.trim() : "";

  const primary = await Domain.findOne({
    siteId: siteMongoId,
    is_primary: true,
    verification_status: "active",
  })
    .select("hostname")
    .lean();

  if (baseUrl) {
    canonicalUrl = `${baseUrl.replace(/\/+$/, "")}${path}`;
  } else if (primary && primary.hostname) {
    canonicalUrl = `${proto}://${primary.hostname}${path}`;
  } else {
    const domain = config.platformPublishDomain || "nestpage.app";
    canonicalUrl = `${proto}://${payload.subdomain}.${domain}${path}`;
  }

  return { ...payload, canonicalUrl };
}

/**
 * When the viewer hostname differs from the verified primary domain, suggest a client-side navigation
 * to `canonicalUrl` (already computed with primary host).
 */
async function attachBrowserCanonicalRedirectIfNeeded(requestHostname, siteMongoId, payload) {
  if (!payload || !requestHostname || !payload.canonicalUrl) return payload;

  const h = normalizeHostname(requestHostname);
  if (!h) return payload;

  const primary = await Domain.findOne({
    siteId: siteMongoId,
    is_primary: true,
    verification_status: "active",
  })
    .select("hostname")
    .lean();

  if (!primary?.hostname) return payload;
  if (normalizeHostname(primary.hostname) === h) return payload;

  return {
    ...payload,
    browserCanonicalRedirect: { url: payload.canonicalUrl, code: 301 },
  };
}

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = {
  attachCanonicalToPayload,
  attachBrowserCanonicalRedirectIfNeeded,
  pagePathFromSlug,
  escapeXml,
};
