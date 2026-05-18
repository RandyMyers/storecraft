const crypto = require("crypto");

const MAX_LEN = 128;

/**
 * Assigns `req.requestId` and echoes `X-Request-ID` (accepts incoming `X-Request-ID` / `X-Correlation-ID`).
 */
function requestCorrelationId(req, res, next) {
  const raw =
    req.get("X-Request-ID") || req.get("X-Correlation-ID") || req.get("X-Request-Id");
  let id =
    typeof raw === "string" && raw.trim()
      ? raw.trim().slice(0, MAX_LEN)
      : crypto.randomUUID();
  if (!id) id = crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}

module.exports = { requestCorrelationId };
