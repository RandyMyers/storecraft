const PLANS = require("../config/plans");
const Plan = require("../models/Plan");

/** @returns {'free'|'string'} */
function effectiveSubscriptionPlan(storedPlan, subscriptionPaidThrough) {
  const tier = storedPlan && typeof storedPlan === "string" ? storedPlan.toLowerCase().trim() : "free";
  if (tier === "free") return "free";
  if (!subscriptionPaidThrough) return "free";
  const end = new Date(subscriptionPaidThrough).getTime();
  if (Number.isNaN(end) || end < Date.now()) return "free";
  return tier;
}

function staticLimitsForSlug(slug) {
  const s = slug && PLANS[slug] ? slug : "free";
  return PLANS[s] || PLANS.free;
}

/** Limits object: label + numeric caps (matches old `config/plans` shape). */
async function limitsForEffectivePlan(effectivePlanSlug) {
  const slug = effectivePlanSlug || "free";
  try {
    const doc = await Plan.findOne({ slug, isActive: true }).lean();
    if (doc) {
      return {
        label: doc.label,
        maxSites: doc.maxSites,
        maxPagesPerSite: doc.maxPagesPerSite,
        maxCustomDomainsPerSite: doc.maxCustomDomainsPerSite,
      };
    }
  } catch {
    /* DB not ready in rare smoke paths — fall through */
  }
  return staticLimitsForSlug(slug);
}

/**
 * @param {import("../models/User") | Record<string, unknown>} user — doc or lean with subscription fields
 */
async function entitlementLimits(user) {
  const stored =
    typeof user.subscriptionPlan === "string" ? user.subscriptionPlan.toLowerCase().trim() : "free";
  const paidThrough = user.subscriptionPaidThrough || null;
  const effective = effectiveSubscriptionPlan(stored, paidThrough);
  const limits = await limitsForEffectivePlan(effective);
  return { effectivePlan: effective, limits, storedPlan: stored };
}

module.exports = {
  effectiveSubscriptionPlan,
  limitsForEffectivePlan,
  entitlementLimits,
  staticLimitsForSlug,
  PLANS,
};
