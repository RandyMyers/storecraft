const ROW_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

function normalizeFeatureBullets(input) {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => String(x ?? "").trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 24);
  }
  if (typeof input === "string") {
    return input
      .split(/\r?\n/)
      .map((l) => l.trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 24);
  }
  return [];
}

/**
 * @param {unknown} input
 * @returns {{ key: string, label: string, value: string }[]}
 */
function normalizeComparisonRows(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const rawKey = String(row.key || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const key = rawKey.slice(0, 40);
    if (!key || !ROW_KEY_RE.test(key)) continue;
    const label = String(row.label || "").trim().slice(0, 160);
    if (!label) continue;
    const value = String(row.value ?? "").trim().slice(0, 400);
    out.push({ key, label, value });
    if (out.length >= 40) break;
  }
  return out;
}

function marketingSlice(s, max) {
  return String(s ?? "").trim().slice(0, max);
}

module.exports = {
  normalizeFeatureBullets,
  normalizeComparisonRows,
  marketingSlice,
};
