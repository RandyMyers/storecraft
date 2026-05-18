const mongoose = require("mongoose");
const User = require("../models/User");
const PaymentRequest = require("../models/PaymentRequest");
const config = require("../config");
const Plan = require("../models/Plan");
const { entitlementLimits } = require("../lib/entitlements");
const { normalizeInterval, normalizeAllowedBillingIntervals } = require("../lib/billingIntervals");

exports.getPlan = async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { effectivePlan, limits, storedPlan } = await entitlementLimits(user);
  const paidThrough = user.subscriptionPaidThrough ? new Date(user.subscriptionPaidThrough).toISOString() : null;
  const subscriptionBillingInterval = user.subscriptionBillingInterval || null;

  const pending = await PaymentRequest.find({
    userId: user._id,
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  res.json({
    subscriptionPlan: storedPlan,
    effectivePlan,
    subscriptionPaidThrough: paidThrough,
    subscriptionBillingInterval,
    limits,
    planCatalog: (
      await Plan.find({ isActive: true })
        .sort({ sortOrder: 1, slug: 1 })
        .lean()
    ).map((p) => ({
      slug: p.slug,
      label: p.label,
      description: p.description || "",
      maxSites: p.maxSites,
      maxPagesPerSite: p.maxPagesPerSite,
      maxCustomDomainsPerSite: p.maxCustomDomainsPerSite,
      requiresPaymentSubscription: !!p.requiresPaymentSubscription,
      allowedBillingIntervals: normalizeAllowedBillingIntervals(p.allowedBillingIntervals, {
        requiresPayment: !!p.requiresPaymentSubscription,
      }),
      priceHintBank: p.priceHintBank || "",
      priceHintUsdt: p.priceHintUsdt || "",
    })),
    paymentInstructions: {
      bankTransfer: config.paymentInstructionsBank || null,
      usdt: config.paymentInstructionsUsdt || null,
    },
    pendingPaymentRequests: pending.map((p) => ({
      id: p._id.toString(),
      requestedPlan: p.requestedPlan,
      billingInterval: normalizeInterval(p.billingInterval),
      method: p.method,
      status: p.status,
      payerReference: p.payerReference || "",
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    })),
  });
};

exports.createPaymentRequest = async (req, res) => {
  const requestedPlan = String(req.body.requestedPlan || "")
    .toLowerCase()
    .trim();
  const method = String(req.body.method || "").toLowerCase();
  const payerReference = String(req.body.payerReference || "").trim().slice(0, 2000);
  const billingInterval = normalizeInterval(req.body.billingInterval);

  const tier = await Plan.findOne({
    slug: requestedPlan,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!tier) {
    res.status(400).json({ error: "Invalid or unavailable plan for upgrade requests" });
    return;
  }
  if (method !== "bank_transfer" && method !== "usdt") {
    res.status(400).json({ error: "method must be bank_transfer or usdt" });
    return;
  }

  const allowed = normalizeAllowedBillingIntervals(tier.allowedBillingIntervals, {
    requiresPayment: true,
  });
  if (!allowed.includes(billingInterval)) {
    res.status(400).json({ error: `billingInterval must be one of: ${allowed.join(", ")}` });
    return;
  }

  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  await PaymentRequest.create({
    userId: user._id,
    requestedPlan,
    billingInterval,
    method,
    payerReference,
    status: "pending",
  });

  res.status(201).json({ ok: true });
};

exports.listMyPaymentRequests = async (req, res) => {
  const userOid = new mongoose.Types.ObjectId(req.userId);
  const rows = await PaymentRequest.find({ userId: userOid }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({
    requests: rows.map((p) => ({
      id: p._id.toString(),
      requestedPlan: p.requestedPlan,
      billingInterval: normalizeInterval(p.billingInterval),
      method: p.method,
      status: p.status,
      payerReference: p.payerReference || "",
      adminNote: p.adminNote || "",
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      decidedAt: p.decidedAt ? new Date(p.decidedAt).toISOString() : null,
    })),
  });
};
