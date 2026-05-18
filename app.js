const config = require("./config");
const { createApp } = require("./createApp");
const { connectDb } = require("./lib/db");
const { ensureCloudinaryConfigured } = require("./config/cloudinary");

async function main() {
  await connectDb();
  await ensureCloudinaryConfigured();
  const { app } = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[HTTP] listening on http://localhost:${config.port} (GET /health for readiness)`);
  });
  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[HTTP] listen error:", err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

