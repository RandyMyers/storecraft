const Plan = require("../models/Plan");
const User = require("../models/User");
const { normalizeFeatureBullets, normalizeComparisonRows, marketingSlice } = require("../lib/planMarketing");
const { normalizeAllowedBillingIntervals } = require("../lib/billingIntervals");

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;

function adminShape(p) {
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
    isActive: !!p.isActive,
    sortOrder: p.sortOrder ?? 0,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
  };
}

/** GET /api/admin/plans — all rows (inactive included) */
exports.listAll = async (_req, res) => {
  const rows = await Plan.find({}).sort({ sortOrder: 1, slug: 1 }).lean();
  res.json({ plans: rows.map(adminShape) });
};

/** GET /api/admin/plans/:slug — one plan (admin shape) */
exports.getBySlug = async (req, res) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const plan = await Plan.findOne({ slug }).lean();
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  res.json({ plan: adminShape(plan) });
};

/**
 * POST /api/admin/plans
 * Body: { slug, label, description?, priceHintBank?, priceHintUsdt?, maxSites?, maxPagesPerSite?,
 *         maxCustomDomainsPerSite?, requiresPaymentSubscription?, isActive?, sortOrder? }
 */
exports.create = async (req, res) => {
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const slug = String(b.slug || "")
    .toLowerCase()
    .trim();
  if (!slug || !SLUG_RE.test(slug)) {
    res.status(400).json({ error: "Invalid slug (lowercase letters, digits, hyphen; must start with a letter)" });
    return;
  }
  const label = String(b.label || "").trim();
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }

  const exists = await Plan.findOne({ slug }).lean();
  if (exists) {
    res.status(409).json({ error: "A plan with this slug already exists" });
    return;
  }

  const maxSites = Math.max(0, Math.floor(Number(b.maxSites ?? 1)));
  const maxPagesPerSite = Math.max(0, Math.floor(Number(b.maxPagesPerSite ?? 5)));
  const maxCustomDomainsPerSite = Math.max(0, Math.floor(Number(b.maxCustomDomainsPerSite ?? 0)));
  const sortOrder = Math.floor(Number(b.sortOrder ?? 0));

  const doc = await Plan.create({
    slug,
    label,
    tagline: marketingSlice(b.tagline, 400),
    highlightBadge: marketingSlice(b.highlightBadge, 80),
    description: marketingSlice(b.description, 4000),
    featureBullets: normalizeFeatureBullets(b.featureBullets),
    comparisonRows: normalizeComparisonRows(b.comparisonRows),
    ctaLabel: marketingSlice(b.ctaLabel, 120),
    ctaSublabel: marketingSlice(b.ctaSublabel, 240),
    showOnLanding: b.showOnLanding === undefined ? true : Boolean(b.showOnLanding),
    priceHintBank: marketingSlice(b.priceHintBank, 4000),
    priceHintUsdt: marketingSlice(b.priceHintUsdt, 4000),
    maxSites,
    maxPagesPerSite,
    maxCustomDomainsPerSite,
    requiresPaymentSubscription: Boolean(b.requiresPaymentSubscription),
    allowedBillingIntervals: normalizeAllowedBillingIntervals(b.allowedBillingIntervals, {
      requiresPayment: Boolean(b.requiresPaymentSubscription),
    }),
    isActive: b.isActive === undefined ? true : Boolean(b.isActive),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  });

  res.status(201).json({ plan: adminShape(doc.toObject({ flattenMaps: true })) });
};

/** DELETE /api/admin/plans/:slug — only if no user references this subscriptionPlan */
exports.removeBySlug = async (req, res) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const plan = await Plan.findOne({ slug });
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  if (slug === "free") {
    res.status(400).json({ error: "Cannot delete the built-in free tier" });
    return;
  }

  const subscribers = await User.countDocuments({ subscriptionPlan: slug });
  if (subscribers > 0) {
    res.status(409).json({
      error: `Cannot delete: ${subscribers} user(s) have subscriptionPlan "${slug}". Reassign them first.`,
    });
    return;
  }

  await Plan.deleteOne({ _id: plan._id });
  res.status(204).end();
};

/**
 * PATCH /api/admin/plans/:slug
 * Body: partial { label, description, priceHintBank, priceHintUsdt, maxSites, maxPagesPerSite,
 *         maxCustomDomainsPerSite, requiresPaymentSubscription, isActive, sortOrder }
 */
exports.patchBySlug = async (req, res) => {
  const slug = String(req.params.slug || "")
    .toLowerCase()
    .trim();
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const plan = await Plan.findOne({ slug });
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  const allowed = [
    "label",
    "tagline",
    "highlightBadge",
    "description",
    "featureBullets",
    "comparisonRows",
    "ctaLabel",
    "ctaSublabel",
    "showOnLanding",
    "priceHintBank",
    "priceHintUsdt",
    "maxSites",
    "maxPagesPerSite",
    "maxCustomDomainsPerSite",
    "requiresPaymentSubscription",
    "allowedBillingIntervals",
    "isActive",
    "sortOrder",
  ];

  for (const key of allowed) {
    if (b[key] === undefined) continue;
    if (key === "maxSites" || key === "maxPagesPerSite" || key === "maxCustomDomainsPerSite" || key === "sortOrder") {
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < 0) {
        res.status(400).json({ error: `Invalid ${key}` });
        return;
      }
      plan[key] = key === "sortOrder" ? Math.floor(n) : Math.floor(n);
    } else if (key === "requiresPaymentSubscription" || key === "isActive" || key === "showOnLanding") {
      plan[key] = Boolean(b[key]);
    } else if (key === "allowedBillingIntervals") {
      plan[key] = normalizeAllowedBillingIntervals(b[key], { requiresPayment: !!plan.requiresPaymentSubscription });
    } else if (key === "featureBullets") {
      plan[key] = normalizeFeatureBullets(b[key]);
    } else if (key === "comparisonRows") {
      plan[key] = normalizeComparisonRows(b[key]);
    } else if (key === "tagline") {
      plan[key] = marketingSlice(b[key], 400);
    } else if (key === "highlightBadge") {
      plan[key] = marketingSlice(b[key], 80);
    } else if (key === "ctaLabel") {
      plan[key] = marketingSlice(b[key], 120);
    } else if (key === "ctaSublabel") {
      plan[key] = marketingSlice(b[key], 240);
    } else {
      plan[key] = String(b[key] ?? "").trim().slice(0, 4000);
    }
  }

  if (!plan.requiresPaymentSubscription) {
    plan.allowedBillingIntervals = [];
  }

  await plan.save();
  res.json({ plan: adminShape(plan.toObject({ flattenMaps: true })) });
};
