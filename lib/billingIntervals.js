const BILLING_INTERVALS = ["monthly", "quarterly", "yearly"];

/** @param {string} interval */
function intervalToMonths(interval) {
  const i = String(interval || "monthly").toLowerCase();
  if (i === "yearly") return 12;
  if (i === "quarterly") return 3;
  return 1;
}

/** @param {unknown} v */
function normalizeInterval(v) {
  const s = String(v || "monthly").toLowerCase().trim();
  return BILLING_INTERVALS.includes(s) ? s : "monthly";
}

/**
 * @param {unknown} input
 * @param {{ requiresPayment?: boolean }} [opts]
 */
function normalizeAllowedBillingIntervals(input, opts = {}) {
  const { requiresPayment = true } = opts;
  if (!requiresPayment) return [];
  if (!Array.isArray(input) || input.length === 0) {
    return [...BILLING_INTERVALS];
  }
  const set = new Set(BILLING_INTERVALS);
  const picked = [...new Set(input.map((x) => String(x || "").toLowerCase().trim()).filter((x) => set.has(x)))];
  if (!picked.length) return [...BILLING_INTERVALS];
  return BILLING_INTERVALS.filter((x) => picked.includes(x));
}

module.exports = {
  BILLING_INTERVALS,
  intervalToMonths,
  normalizeInterval,
  normalizeAllowedBillingIntervals,
};
