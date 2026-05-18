require("dotenv").config({ override: false });

const cloudinary = require("cloudinary").v2;

let configured = false;

function configureCloudinary() {
  const cloud_name = process.env.CLOUDINARY_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    console.warn(
      "[cloudinary] Missing CLOUDINARY_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_SECRET — image uploads disabled.",
    );
    configured = false;
    return false;
  }

  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
  });
  configured = true;
  return true;
}

/**
 * Prefer latest active `IntegrationSecret` (provider `cloudinary`); JSON value:
 * {"cloud_name":"…","api_key":"…","api_secret":"…"}. If none / invalid, fall back to
 * `configureCloudinary()` (CLOUDINARY_* in `.env` via this config module).
 */
async function ensureCloudinaryConfigured() {
  if (configured) return true;
  try {
    const { getCloudinaryCredentialsFromDatabase } = require("../services/integrationSecretsResolve");
    const creds = await getCloudinaryCredentialsFromDatabase();
    if (creds) {
      cloudinary.config(creds);
      configured = true;
      // eslint-disable-next-line no-console
      console.warn("[cloudinary] Configured from IntegrationSecret (provider cloudinary).");
      return true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[cloudinary] integration secret configure failed:", e.message);
  }
  return configureCloudinary();
}

function cloudinaryEnabled() {
  return configured;
}

module.exports = {
  cloudinary,
  configureCloudinary,
  ensureCloudinaryConfigured,
  cloudinaryEnabled,
};
