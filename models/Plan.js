const mongoose = require("mongoose");

const comparisonRowSchema = new mongoose.Schema(
  {
    /** Stable id across plans so the landing comparison matrix lines up (e.g. pages, domains). */
    key: { type: String, required: true, trim: true, lowercase: true },
    /** First column label on the marketing comparison table. */
    label: { type: String, required: true, trim: true },
    /** Cell text for this plan (e.g. "5", "Unlimited", "✓", "—"). */
    value: { type: String, default: "", trim: true },
  },
  { _id: false },
);

const planSchema = new mongoose.Schema(
  {
    /** Unique tier id (e.g. free, pro, studio) — matches `User.subscriptionPlan`. */
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    label: { type: String, required: true, trim: true },
    /** Short line under the plan name on pricing cards (landing). */
    tagline: { type: String, default: "", trim: true },
    /** Optional pill on the card, e.g. "Most popular". */
    highlightBadge: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    /** Bullet strings for the plan card feature list (landing). */
    featureBullets: { type: [String], default: [] },
    /** Rows for the comparison matrix; `key` must match across plans for the same row. */
    comparisonRows: { type: [comparisonRowSchema], default: [] },
    /** Primary CTA label on pricing (e.g. "Get started"). */
    ctaLabel: { type: String, default: "", trim: true },
    /** Fine print under the CTA (e.g. "No card required"). */
    ctaSublabel: { type: String, default: "", trim: true },
    /** When false, tier stays billable/active but is hidden from public `GET /api/plans` (landing). */
    showOnLanding: { type: Boolean, default: true },
    /** Shown on marketing / billing UI (plain text). */
    priceHintBank: { type: String, default: "", trim: true },
    priceHintUsdt: { type: String, default: "", trim: true },
    maxSites: { type: Number, required: true, min: 0 },
    maxPagesPerSite: { type: Number, required: true, min: 0 },
    maxCustomDomainsPerSite: { type: Number, required: true, min: 0 },
    /** When true, users may open a payment request for this slug (not used for free). */
    requiresPaymentSubscription: { type: Boolean, default: false },
    /** Subset of `monthly` | `quarterly` | `yearly` offered in dashboard for this tier. */
    allowedBillingIntervals: {
      type: [String],
      default: () => ["monthly", "quarterly", "yearly"],
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

planSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Plan || mongoose.model("Plan", planSchema);
