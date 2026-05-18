const { getMongoConnectionLabel } = require("../lib/db");

exports.health = (req, res) => {
  const db = getMongoConnectionLabel();
  const ok = db === "connected";
  const body = {
    ok,
    db,
    uptimeSeconds: Math.floor(process.uptime()),
    ...(req.requestId ? { requestId: req.requestId } : {}),
  };
  if (!ok) {
    res.status(503).json(body);
    return;
  }
  res.json(body);
};
