const config = require("../config");

/**
 * Protects `/api/admin/*`. Set `ADMIN_API_KEY` to a long random secret; send `X-Nestpage-Admin-Key: <key>`.
 */
function requireAdminApiKey(req, res, next) {
  const expected = config.adminApiKey;
  if (!expected) {
    res.status(503).json({ error: "Admin API is not configured (set ADMIN_API_KEY)" });
    return;
  }
  const sent = String(req.headers["x-nestpage-admin-key"] || "").trim();
  if (!sent || sent !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

module.exports = { requireAdminApiKey };
