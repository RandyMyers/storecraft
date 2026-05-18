const jwt = require("jsonwebtoken");
const config = require("../config");
const { requireAdminApiKey } = require("./requireAdminApiKey");

/**
 * Accepts `Authorization: Bearer <admin JWT>` (preferred) or legacy `X-Nestpage-Admin-Key`.
 */
function requireAdminAuth(req, res, next) {
  const auth = String(req.headers.authorization || "").trim();
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!config.adminJwtSecret) {
      res.status(503).json({ error: "Admin JWT is not configured" });
      return;
    }
    try {
      const payload = jwt.verify(token, config.adminJwtSecret);
      if (payload.typ !== "admin") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.adminAuth = {
        via: "jwt",
        sub: typeof payload.sub === "string" ? payload.sub : null,
        email: typeof payload.email === "string" ? payload.email : null,
      };
      next();
      return;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (!config.adminApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  requireAdminApiKey(req, res, next);
}

module.exports = { requireAdminAuth };
