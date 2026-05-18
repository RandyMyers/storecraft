const { maybeProvisionPlatformSubdomain } = require("./hostingerIntegration");
const Site = require("../models/Site");

/**
 * Fire-and-forget Hostinger subdomain provision (signup / site create).
 * @param {string} siteId
 */
function queueProvisionPlatformSubdomain(siteId) {
  setImmediate(async () => {
    try {
      const site = await Site.findById(siteId);
      if (!site) return;
      await maybeProvisionPlatformSubdomain(site);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[hostinger] auto-provision failed", siteId, err?.message || err);
    }
  });
}

/**
 * Await provision (used on publish for page-builder style go-live).
 * @param {import("mongoose").Document} siteDoc
 */
async function provisionPlatformSubdomainForPublish(siteDoc) {
  return maybeProvisionPlatformSubdomain(siteDoc);
}

module.exports = { queueProvisionPlatformSubdomain, provisionPlatformSubdomainForPublish };
