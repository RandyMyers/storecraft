const { entitlementLimits } = require("./entitlements");

async function serializeAuthUser(userDocOrLean) {
  if (!userDocOrLean) return null;
  const u = userDocOrLean;
  const { effectivePlan, limits, storedPlan } = await entitlementLimits(u);
  const paidThrough = u.subscriptionPaidThrough ? new Date(u.subscriptionPaidThrough).toISOString() : null;
  return {
    id: u._id.toString(),
    email: u.email,
    createdAt: u.createdAt,
    subscriptionPlan: storedPlan,
    effectivePlan,
    subscriptionPaidThrough: paidThrough,
    limits,
  };
}

module.exports = { serializeAuthUser };
