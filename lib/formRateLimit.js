/** Sliding-window counter per IP + scope (e.g. subdomain). */

const config = require("../config");

/** @type {Map<string, { start: number, n: number }>} */
const hits = new Map();

/**
 * @param {string} ip
 * @param {string} [scopeKey] subdomain or site key — isolates buckets per published site
 */
function allowFormSubmit(ip, scopeKey = "") {
  const WINDOW_MS = config.formRateLimitWindowMs;
  const MAX_REQUESTS = config.formRateLimitMax;

  const key = `${String(ip || "unknown")}|${String(scopeKey || "global").slice(0, 120)}`;
  const now = Date.now();
  let row = hits.get(key);
  if (!row || now - row.start > WINDOW_MS) {
    row = { start: now, n: 0 };
  }
  row.n += 1;
  hits.set(key, row);

  const ok = row.n <= MAX_REQUESTS;

  if (hits.size > 8000) hits.clear();

  return ok;
}

module.exports = { allowFormSubmit };
