const Plan = require("../models/Plan");
const { normalizeAllowedBillingIntervals } = require("../lib/billingIntervals");

function publicShape(p) {
  const bullets = Array.isArray(p.featureBullets) ? p.featureBullets : [];
  const rows = Array.isArray(p.comparisonRows) ? p.comparisonRows : [];
  return {
    id: p._id.toString(),
    slug: p.slug,
    label: p.label,
    tagline: p.tagline || "",
    highlightBadge: p.highlightBadge || "",
    description: p.description || "",
    featureBullets: bullets.map((x) => String(x)),
    comparisonRows: rows.map((r) => ({
      key: String(r.key || ""),
      label: String(r.label || ""),
      value: String(r.value || ""),
    })),
    ctaLabel: p.ctaLabel || "",
    ctaSublabel: p.ctaSublabel || "",
    showOnLanding: p.showOnLanding !== false,
    priceHintBank: p.priceHintBank || "",
    priceHintUsdt: p.priceHintUsdt || "",
    maxSites: p.maxSites,
    maxPagesPerSite: p.maxPagesPerSite,
    maxCustomDomainsPerSite: p.maxCustomDomainsPerSite,
    requiresPaymentSubscription: !!p.requiresPaymentSubscription,
    allowedBillingIntervals: normalizeAllowedBillingIntervals(p.allowedBillingIntervals, {
      requiresPayment: !!p.requiresPaymentSubscription,
    }),
    sortOrder: p.sortOrder ?? 0,
  };
}

const publicPlanFilter = { isActive: true, showOnLanding: { $ne: false } };

/** GET /api/plans — active tiers shown on marketing / pricing (landing). */
exports.list = async (_req, res) => {
  const rows = await Plan.find(publicPlanFilter).sort({ sortOrder: 1, slug: 1 }).lean();
  res.json({ plans: rows.map(publicShape) });
};

/** GET /api/plans/:slug — single tier if active */
exports.getBySlug = async (req, res) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const p = await Plan.findOne({ slug, ...publicPlanFilter }).lean();
  if (!p) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json({ plan: publicShape(p) });
};
