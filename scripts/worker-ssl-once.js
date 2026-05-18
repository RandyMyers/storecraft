/**
 * Single SSL probe batch — cron-friendly (promotes ssl_pending → active when TLS validates).
 */
require("dotenv").config();

const { connectDb, mongoose } = require("../lib/db");
const { runTick } = require("../workers/sslStatusWorker");

async function main() {
  await connectDb();
  const summary = await runTick();
  // eslint-disable-next-line no-console
  console.log("[ssl-worker-once]", summary);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[ssl-worker-once] fatal:", err);
  process.exit(1);
});
