const { normalizeHostname } = require("./domains");

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Trusted hostname for public resolution ( strips port ).
 * Query ?hostname= is allowed only when `allowHostQuery` is true (typically local dev).
 */
function resolvePublishHostname(req, { allowHostQuery }) {
  if (allowHostQuery) {
    const qRaw = req.query && (req.query.hostname ?? req.query.host);
    const q = normalizeHostname(qRaw || "");
    if (q && !LOOPBACK.has(q)) return q;
  }

  const fwd = req.get("x-forwarded-host");
  const first = fwd ? fwd.split(",")[0].trim() : "";
  const rawHost = first || req.get("host") || "";
  const h = normalizeHostname(rawHost);
  if (!h || LOOPBACK.has(h)) return "";
  return h;
}

module.exports = { resolvePublishHostname, LOOPBACK };
