const IntegrationSecret = require("../models/IntegrationSecret");
const config = require("../config");
const { decryptSecret } = require("./secretCrypto");

/**
 * Latest active encrypted row for a provider (used at runtime with env fallback).
 * @param {string} provider
 * @returns {Promise<object|null>}
 */
async function findLatestActiveSecretLean(provider) {
  if (!config.secretsMasterKey) return null;
  const p = String(provider || "").trim().toLowerCase();
  if (!p) return null;
  return IntegrationSecret.findOne({ provider: p, status: "active" }).sort({ updatedAt: -1 }).lean();
}

/**
 * @param {string} provider
 * @returns {Promise<string|null>}
 */
async function getPlainSecretForProvider(provider) {
  const doc = await findLatestActiveSecretLean(provider);
  if (!doc) return null;
  try {
    return decryptSecret(doc, config.secretsMasterKey);
  } catch {
    return null;
  }
}

/**
 * Cloudinary credentials from a single JSON secret value:
 * `{"cloud_name":"…","api_key":"…","api_secret":"…"}`
 * @returns {Promise<{ cloud_name: string, api_key: string, api_secret: string } | null>}
 */
async function getCloudinaryCredentialsFromDatabase() {
  const plain = await getPlainSecretForProvider("cloudinary");
  if (!plain) return null;
  const trimmed = plain.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const j = JSON.parse(trimmed);
    const cloud_name = String(j.cloud_name || "").trim();
    const api_key = String(j.api_key || "").trim();
    const api_secret = String(j.api_secret || "").trim();
    if (!cloud_name || !api_key || !api_secret) return null;
    return { cloud_name, api_key, api_secret };
  } catch {
    return null;
  }
}

module.exports = {
  findLatestActiveSecretLean,
  getPlainSecretForProvider,
  getCloudinaryCredentialsFromDatabase,
};
