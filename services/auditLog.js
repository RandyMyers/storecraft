const AuditLog = require("../models/AuditLog");

/**
 * Best-effort append; never throws to callers (logs on failure).
 * @param {object} entry
 * @param {string} entry.action
 * @param {string} [entry.source]
 * @param {import("mongoose").Types.ObjectId|string|null} [entry.siteId]
 * @param {import("mongoose").Types.ObjectId|string|null} [entry.domainId]
 * @param {object} [entry.meta]
 * @param {string} [entry.requestId]
 * @param {string} [entry.clientIp]
 */
async function appendAudit(entry) {
  try {
    await AuditLog.create({
      action: entry.action,
      source: entry.source || "admin_api",
      siteId: entry.siteId || undefined,
      domainId: entry.domainId || undefined,
      meta: entry.meta && typeof entry.meta === "object" ? entry.meta : {},
      requestId: entry.requestId || "",
      clientIp: entry.clientIp || "",
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[auditLog] append failed:", e.message);
  }
}

module.exports = { appendAudit };
