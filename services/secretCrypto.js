const crypto = require("crypto");

function deriveKey(master) {
  return crypto.createHash("sha256").update(String(master), "utf8").digest();
}

/**
 * @param {string} plain
 * @param {string} masterKey
 * @returns {{ encryptedValue: string, iv: string, authTag: string }}
 */
function encryptSecret(plain, masterKey) {
  const key = deriveKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * @param {{ encryptedValue: string, iv: string, authTag: string }} doc
 * @param {string} masterKey
 * @returns {string}
 */
function decryptSecret(doc, masterKey) {
  const key = deriveKey(masterKey);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(doc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(doc.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(doc.encryptedValue, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function last4FromPlain(plain) {
  const s = String(plain).replace(/\s/g, "");
  if (!s) return "";
  return s.length <= 4 ? s : s.slice(-4);
}

/** Display-only mask (same as last4 suffix convention). */
function maskSecret(plain) {
  const s = String(plain || "").replace(/\s/g, "");
  if (!s) return "";
  const last4 = last4FromPlain(s);
  return `****${last4}`;
}

/**
 * Warn if master key is weak (does not block startup).
 * @param {string} master
 * @param {string} nodeEnv
 */
function validateSecretsMasterKeyStrength(master, nodeEnv) {
  const m = String(master || "").trim();
  if (!m) return;
  if (m.length < 16 && nodeEnv === "production") {
    // eslint-disable-next-line no-console
    console.warn("[secrets] SECRETS_MASTER_KEY is short — use a longer random value in production.");
  }
}

module.exports = {
  encryptSecret,
  decryptSecret,
  last4FromPlain,
  maskSecret,
  validateSecretsMasterKeyStrength,
};
