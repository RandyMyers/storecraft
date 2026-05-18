/**
 * Central error logger + JSON response for thrown errors and rejected async handlers
 * (requires `express-async-errors` loaded in app.js).
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = Number(err.status ?? err.statusCode) || 500;
  const safeLog = err.message || String(err);

  const rid = req.requestId ? ` id=${req.requestId}` : "";
  // eslint-disable-next-line no-console
  console.error(`[API]${rid} ${req.method} ${req.originalUrl} → ${status} ${safeLog}`);
  if (process.env.NODE_ENV !== "production" && err.stack) {
    // eslint-disable-next-line no-console
    console.error(err.stack);
  }

  const clientMessage =
    status >= 500 && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : typeof err.message === "string" && err.message.trim()
        ? err.message
        : "Request failed";

  const body = { error: clientMessage };
  if (req.requestId) body.requestId = req.requestId;
  res.status(status).json(body);
}

module.exports = { errorHandler };
