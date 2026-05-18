/**
 * Single DNS verification batch — use with cron (e.g. every 5 min on Render/Railway).
 */
require("dotenv").config();

const { connectDb, mongoose } = require("../lib/db");
const { runTick } = require("../workers/dnsVerificationWorker");

async function main() {
  await connectDb();
  const summary = await runTick();
  // eslint-disable-next-line no-console
  console.log("[dns-worker-once]", summary);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[dns-worker-once] fatal:", err);
  process.exit(1);
});
