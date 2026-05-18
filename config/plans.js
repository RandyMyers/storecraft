/**
 * Plan limits — enforced via `server/lib/entitlements.js`.
 * Paid tiers are activated after manual payment verification (bank / USDT), not card gateways.
 */
module.exports = {
  free: {
    label: "Free",
    maxSites: 3,
    maxPagesPerSite: 5,
    maxCustomDomainsPerSite: 0,
  },
  pro: {
    label: "Pro",
    maxSites: 10,
    maxPagesPerSite: 50,
    maxCustomDomainsPerSite: 3,
  },
  studio: {
    label: "Studio",
    maxSites: 50,
    maxPagesPerSite: 200,
    maxCustomDomainsPerSite: 10,
  },
};
