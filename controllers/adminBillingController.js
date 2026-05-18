const mongoose = require("mongoose");
const PaymentRequest = require("../models/PaymentRequest");
const User = require("../models/User");
const Plan = require("../models/Plan");
const { effectiveSubscriptionPlan } = require("../lib/entitlements");
const { intervalToMonths, normalizeInterval } = require("../lib/billingIntervals");

function addMonths(fromDate, months) {
  const d = new Date(fromDate.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function shapePaymentRequestRow(p) {
  return {
    id: p._id.toString(),
    userId: p.userId?._id?.toString?.() ?? String(p.userId),
    userEmail: p.userId?.email ?? "",
    requestedPlan: p.requestedPlan,
    billingInterval: normalizeInterval(p.billingInterval),
    method: p.method,
    status: p.status,
    payerReference: p.payerReference || "",
    adminNote: p.adminNote || "",
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    decidedAt: p.decidedAt ? new Date(p.decidedAt).toISOString() : null,
  };
}

/** GET /api/admin/payment-requests?status=pending|approved|rejected|all */
exports.listPaymentRequests = async (req, res) => {
  const raw = String(req.query.status || "pending").toLowerCase();
  const allowed = ["pending", "approved", "rejected", "all"];
  if (!allowed.includes(raw)) {
    res.status(400).json({ error: "status must be pending, approved, rejected, or all" });
    return;
  }

  const q = {};
  if (raw !== "all") {
    q.status = raw;
  }

  const rows = await PaymentRequest.find(q).sort({ createdAt: -1 }).limit(400).populate("userId", "email").lean();

  res.json({
    requests: rows.map(shapePaymentRequestRow),
  });
};

/** Backward-compatible alias */
exports.listPendingPaymentRequests = exports.listPaymentRequests;

/** GET /api/admin/billing/overview */
exports.getBillingOverview = async (_req, res) => {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const ago30 = new Date(now.getTime() - 30 * 86400000);

  const [
    pendingPaymentRequests,
    activePaidSubscriptions,
    subscriptionsExpiringWithin7Days,
    storedTierExpired,
    paymentRequestsApprovedLast30Days,
  ] = await Promise.all([
    PaymentRequest.countDocuments({ status: "pending" }),
    User.countDocuments({
      subscriptionPlan: { $ne: "free" },
      subscriptionPaidThrough: { $gt: now },
    }),
    User.countDocuments({
      subscriptionPlan: { $ne: "free" },
      subscriptionPaidThrough: { $gt: now, $lte: in7 },
    }),
    User.countDocuments({
      subscriptionPlan: { $ne: "free" },
      subscriptionPaidThrough: { $lte: now },
    }),
    PaymentRequest.countDocuments({ status: "approved", decidedAt: { $gte: ago30 } }),
  ]);

  res.json({
    pendingPaymentRequests,
    activePaidSubscriptions,
    subscriptionsExpiringWithin7Days,
    storedPaidPlanButExpired: storedTierExpired,
    paymentRequestsApprovedLast30Days,
    generatedAt: now.toISOString(),
  });
};

/** GET /api/admin/billing/subscriptions */
exports.listSubscriptions = async (_req, res) => {
  const now = Date.now();
  const in7 = now + 7 * 86400000;

  const users = await User.find({})
    .select("email subscriptionPlan subscriptionPaidThrough subscriptionBillingInterval updatedAt")
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean();

  const rows = users.map((u) => {
    const stored = typeof u.subscriptionPlan === "string" ? u.subscriptionPlan.toLowerCase().trim() : "free";
    const pt = u.subscriptionPaidThrough ? new Date(u.subscriptionPaidThrough).getTime() : null;
    const effective = effectiveSubscriptionPlan(stored, u.subscriptionPaidThrough);
    const paidThroughIso = u.subscriptionPaidThrough ? new Date(u.subscriptionPaidThrough).toISOString() : null;

    const hasFuturePaid = pt != null && !Number.isNaN(pt) && pt > now;
    const expiringSoon = hasFuturePaid && pt <= in7 && effective !== "free";
    let subscriptionStatus = "free";
    if (stored !== "free" && hasFuturePaid && effective !== "free") {
      subscriptionStatus = expiringSoon ? "active_expiring" : "active";
    } else if (stored !== "free" && !hasFuturePaid) {
      subscriptionStatus = "expired_or_lapsed";
    }

    return {
      id: u._id.toString(),
      email: u.email,
      subscriptionPlan: stored,
      effectivePlan: effective,
      subscriptionPaidThrough: paidThroughIso,
      subscriptionBillingInterval: u.subscriptionBillingInterval || null,
      subscriptionStatus,
      expiringWithin7Days: expiringSoon,
      updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : null,
    };
  });

  res.json({ subscriptions: rows });
};

/**
 * Body: { decision: 'approve'|'reject', monthsValid?: number, paidThrough?: ISO string optional, adminNote?: string }
 * If monthsValid omitted on approve, uses billing interval on the request (1 / 3 / 12 months from now).
 */
exports.decidePaymentRequest = async (req, res) => {
  let requestId;
  try {
    requestId = new mongoose.Types.ObjectId(req.params.id);
  } catch {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const decision = String(req.body.decision || "").toLowerCase();
  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ error: "decision must be approve or reject" });
    return;
  }

  const adminNote = String(req.body.adminNote || "").trim().slice(0, 2000);
  const monthsValidExplicit = req.body.monthsValid;
  let paidThroughDate = null;
  if (req.body.paidThrough) {
    paidThroughDate = new Date(String(req.body.paidThrough));
    if (Number.isNaN(paidThroughDate.getTime())) {
      res.status(400).json({ error: "Invalid paidThrough date" });
      return;
    }
  }

  const doc = await PaymentRequest.findById(requestId);
  if (!doc || doc.status !== "pending") {
    res.status(404).json({ error: "Pending payment request not found" });
    return;
  }

  if (decision === "reject") {
    doc.status = "rejected";
    doc.decidedAt = new Date();
    doc.adminNote = adminNote;
    await doc.save();
    res.json({ ok: true, request: { id: doc._id.toString(), status: doc.status } });
    return;
  }

  const user = await User.findById(doc.userId);
  if (!user) {
    res.status(400).json({ error: "User missing" });
    return;
  }

  const planDoc = await Plan.findOne({
    slug: doc.requestedPlan,
    isActive: true,
    requiresPaymentSubscription: true,
  }).lean();
  if (!planDoc) {
    res.status(400).json({ error: "Requested plan slug is not a payable active tier in Plan catalog" });
    return;
  }

  let monthsValid = intervalToMonths(doc.billingInterval);
  if (monthsValidExplicit !== undefined && monthsValidExplicit !== null && String(monthsValidExplicit) !== "") {
    const n = Number(monthsValidExplicit);
    if (Number.isFinite(n) && n > 0 && n <= 120) {
      monthsValid = Math.floor(n);
    }
  }

  const interval = normalizeInterval(doc.billingInterval);
  const through = paidThroughDate || addMonths(new Date(), monthsValid);
  user.subscriptionPlan = doc.requestedPlan;
  user.subscriptionPaidThrough = through;
  user.subscriptionBillingInterval = interval;
  await user.save();

  doc.status = "approved";
  doc.decidedAt = new Date();
  doc.adminNote = adminNote;
  await doc.save();

  res.json({
    ok: true,
    request: { id: doc._id.toString(), status: doc.status },
    user: {
      id: user._id.toString(),
      subscriptionPlan: user.subscriptionPlan,
      subscriptionPaidThrough: through.toISOString(),
      subscriptionBillingInterval: user.subscriptionBillingInterval,
      monthsGranted: monthsValid,
    },
  });
};
