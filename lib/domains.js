const crypto = require("crypto");

function normalizeHostname(raw) {
  let h = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");
  return h;
}

/** Basic hostname sanity — must look like a public FQDN (not localhost). */
function isPlausibleHostname(h) {
  if (!h || h.length > 253 || h.length < 4) return false;
  if (h.startsWith(".") || h.endsWith(".") || h.includes("..")) return false;
  if (!h.includes(".")) return false;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(h)) return false;
  return true;
}

function newVerificationToken() {
  return crypto.randomBytes(16).toString("hex");
}

module.exports = { normalizeHostname, isPlausibleHostname, newVerificationToken };
