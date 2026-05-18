const mongoose = require("mongoose");

/**
 * Append-only operational trail (admin API, later user/auth events).
 * Keep `meta` small — no full payloads.
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    source: { type: String, default: "admin_api", trim: true },
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", default: null, index: true },
    domainId: { type: mongoose.Schema.Types.ObjectId, ref: "Domain", default: null, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: "", trim: true },
    clientIp: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);
