const { verifyUserToken } = require("../lib/tokens");

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function requireAuth(req, res, next) {
  const token = getBearer(req);
  const userId = token ? verifyUserToken(token) : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

module.exports = { requireAuth };
