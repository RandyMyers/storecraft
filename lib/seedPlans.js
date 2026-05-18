const Plan = require("../models/Plan");
const PLANS = require("../config/plans");

/**
 * Upsert default tiers from `config/plans.js` so limits always exist in Mongo.
 * Marketing fields use `$setOnInsert` only so operator edits are not overwritten on restart.
 */
async function seedDefaultPlans() {
  const rows = [
    {
      slug: "free",
      label: PLANS.free.label,
      description: "Get started — platform subdomain, core editor.",
      maxSites: PLANS.free.maxSites,
      maxPagesPerSite: PLANS.free.maxPagesPerSite,
      maxCustomDomainsPerSite: PLANS.free.maxCustomDomainsPerSite,
      requiresPaymentSubscription: false,
      allowedBillingIntervals: [],
      isActive: true,
      sortOrder: 0,
      onInsert: {
        tagline: "For exploring ideas and small projects.",
        highlightBadge: "",
        featureBullets: [
          "Nestpage subdomain",
          "Core editor & templates",
          `Up to ${PLANS.free.maxSites} sites`,
          `Up to ${PLANS.free.maxPagesPerSite} pages per site`,
        ],
        comparisonRows: [
          { key: "sites", label: "Sites", value: String(PLANS.free.maxSites) },
          { key: "pages_per_site", label: "Pages per site", value: String(PLANS.free.maxPagesPerSite) },
          { key: "custom_domains", label: "Custom domains / site", value: String(PLANS.free.maxCustomDomainsPerSite) },
          { key: "payment", label: "Paid upgrade path", value: "Optional" },
        ],
        ctaLabel: "Get started",
        ctaSublabel: "No card required",
        showOnLanding: true,
      },
    },
    {
      slug: "pro",
      label: PLANS.pro.label,
      description: "Custom domains and higher limits.",
      maxSites: PLANS.pro.maxSites,
      maxPagesPerSite: PLANS.pro.maxPagesPerSite,
      maxCustomDomainsPerSite: PLANS.pro.maxCustomDomainsPerSite,
      requiresPaymentSubscription: true,
      isActive: true,
      sortOrder: 10,
      onInsert: {
        tagline: "For makers shipping real work.",
        highlightBadge: "Popular",
        featureBullets: [
          `Up to ${PLANS.pro.maxSites} sites`,
          `Up to ${PLANS.pro.maxPagesPerSite} pages per site`,
          `Up to ${PLANS.pro.maxCustomDomainsPerSite} custom domains per site`,
          "Form submissions & integrations",
        ],
        comparisonRows: [
          { key: "sites", label: "Sites", value: String(PLANS.pro.maxSites) },
          { key: "pages_per_site", label: "Pages per site", value: String(PLANS.pro.maxPagesPerSite) },
          { key: "custom_domains", label: "Custom domains / site", value: String(PLANS.pro.maxCustomDomainsPerSite) },
          { key: "payment", label: "Paid upgrade path", value: "Bank / USDT" },
        ],
        ctaLabel: "Upgrade to Pro",
        ctaSublabel: "Manual verification",
        showOnLanding: true,
        allowedBillingIntervals: ["monthly", "quarterly", "yearly"],
      },
    },
    {
      slug: "studio",
      label: PLANS.studio.label,
      description: "Teams and scale — highest default limits.",
      maxSites: PLANS.studio.maxSites,
      maxPagesPerSite: PLANS.studio.maxPagesPerSite,
      maxCustomDomainsPerSite: PLANS.studio.maxCustomDomainsPerSite,
      requiresPaymentSubscription: true,
      isActive: true,
      sortOrder: 20,
      onInsert: {
        tagline: "For teams and agencies.",
        highlightBadge: "",
        featureBullets: [
          `Up to ${PLANS.studio.maxSites} sites`,
          `Up to ${PLANS.studio.maxPagesPerSite} pages per site`,
          `Up to ${PLANS.studio.maxCustomDomainsPerSite} custom domains per site`,
          "Highest default platform limits",
        ],
        comparisonRows: [
          { key: "sites", label: "Sites", value: String(PLANS.studio.maxSites) },
          { key: "pages_per_site", label: "Pages per site", value: String(PLANS.studio.maxPagesPerSite) },
          { key: "custom_domains", label: "Custom domains / site", value: String(PLANS.studio.maxCustomDomainsPerSite) },
          { key: "payment", label: "Paid upgrade path", value: "Bank / USDT" },
        ],
        ctaLabel: "Talk to us",
        ctaSublabel: "Manual verification",
        showOnLanding: true,
        allowedBillingIntervals: ["monthly", "quarterly", "yearly"],
      },
    },
  ];

  for (const row of rows) {
    const { onInsert, ...core } = row;
    await Plan.updateOne(
      { slug: row.slug },
      {
        $set: core,
        $setOnInsert: onInsert,
      },
      { upsert: true },
    );
  }
}

module.exports = { seedDefaultPlans };
