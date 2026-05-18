const { createApp } = require("../createApp");
const { connectDb } = require("../lib/db");
const { ensureCloudinaryConfigured } = require("../config/cloudinary");

let bootstrapPromise;

async function bootstrap() {
  await connectDb();
  await ensureCloudinaryConfigured();
  return createApp();
}

/**
 * Vercel serverless entry — all routes rewrite to this handler.
 * @type {import("@vercel/node").VercelApiHandler}
 */
module.exports = async (req, res) => {
  try {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrap();
    }
    const { app } = await bootstrapPromise;
    return app(req, res);
  } catch (err) {
    bootstrapPromise = null;
    // eslint-disable-next-line no-console
    console.error("[Vercel] bootstrap failed:", err);
    if (!res.headersSent) {
      res.status(503).json({ error: "Service unavailable", code: "bootstrap_error" });
    }
  }
};
