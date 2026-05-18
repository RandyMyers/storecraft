/**
 * Simple sliding-window rate limit for admin integration-secret routes (per IP).
 */
const WINDOW_MS = 60_000;
const MAX = 120;
const hits = new Map();

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req.ip || "").trim() || "unknown";
}

function adminIntegrationSecretsRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let arr = hits.get(ip);
  if (!arr) {
    arr = [];
    hits.set(ip, arr);
  }
  const cutoff = now - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
  if (arr.length >= MAX) {
    res.status(429).json({ error: "Too many admin secret requests — try again shortly." });
    return;
  }
  arr.push(now);
  next();
}

module.exports = { adminIntegrationSecretsRateLimit };
