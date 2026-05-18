const crypto = require("crypto");

function newId(prefix) {
  const raw = crypto.randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${raw}` : raw;
}

function sanitizeSubdomain(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = { newId, sanitizeSubdomain };
