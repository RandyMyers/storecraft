/**
 * Normalize URL path segment for redirect matching (leading slash, no trailing slash except root).
 * @returns {string | null} null if invalid (e.g. contains ..)
 */
function normalizePath(raw) {
  let p = String(raw || "").trim();
  if (!p) return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p.includes("..") || p.includes("\\")) return null;
  return p;
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

/**
 * @param {{ from: unknown, to: unknown, code?: unknown }} r
 * @returns {{ from: string, to: string, code: 301 | 302 } | null}
 */
function sanitizeRedirectRule(r) {
  if (!r || typeof r !== "object") return null;
  const from = normalizePath(r.from);
  if (!from) return null;
  const toRaw = String(r.to || "").trim();
  if (!toRaw) return null;

  let to;
  if (isHttpUrl(toRaw)) {
    try {
      const u = new URL(toRaw);
      if (!["http:", "https:"].includes(u.protocol)) return null;
      to = u.toString();
    } catch {
      return null;
    }
  } else {
    const np = normalizePath(toRaw);
    if (!np) return null;
    to = np;
  }

  const code = Number(r.code) === 302 ? 302 : 301;
  return { from, to, code };
}

/**
 * @param {unknown} arr
 * @param {{ max?: number }} opts
 * @returns {{ from: string, to: string, code: 301 | 302 }[]}
 */
function sanitizeRedirectList(arr, opts = {}) {
  const max = opts.max ?? 30;
  if (!Array.isArray(arr)) return [];
  /** Last rule for a given `from` wins */
  const map = new Map();
  for (const item of arr) {
    const row = sanitizeRedirectRule(item);
    if (!row) continue;
    map.set(row.from, row);
  }
  return Array.from(map.values()).slice(0, max);
}

function hasDirectedCyclePathGraph(adj, allNodes) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();

  function dfs(u) {
    color.set(u, GRAY);
    for (const v of adj.get(u) || []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }

  for (const u of allNodes) {
    if ((color.get(u) ?? WHITE) === WHITE) {
      if (dfs(u)) return true;
    }
  }
  return false;
}

/**
 * Reject self-loops and cycles among **path-only** redirect targets (single-hop rules still ping-pong if cyclic).
 */
function validateRedirectRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return { ok: true };

  const adj = new Map();
  const allNodes = new Set();

  for (const r of rules) {
    const from = normalizePath(r.from);
    const toRaw = String(r.to || "").trim();
    if (!from || !toRaw) continue;

    if (toRaw.startsWith("/")) {
      const toPath = normalizePath(toRaw);
      if (!toPath) {
        return { ok: false, error: `Invalid redirect target path for rule starting at ${from}` };
      }
      if (from === toPath) {
        return { ok: false, error: `Redirect cannot map ${from} to itself` };
      }
      allNodes.add(from);
      allNodes.add(toPath);
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from).push(toPath);
    }
  }

  if (hasDirectedCyclePathGraph(adj, allNodes)) {
    return { ok: false, error: "Path redirects form a cycle — adjust rules." };
  }

  return { ok: true };
}

module.exports = { normalizePath, sanitizeRedirectList, isHttpUrl, validateRedirectRules };
