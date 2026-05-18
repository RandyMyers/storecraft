require("dotenv").config();

const { connectDb } = require("../lib/db");
const Domain = require("../models/Domain");
const { promoteSslIfReady } = require("../services/domainSslPromotion");

const INTERVAL_MS = Number(process.env.SSL_WORKER_INTERVAL_MS || 180000);
const BATCH = Math.min(100, Math.max(1, Number(process.env.SSL_WORKER_BATCH || 15)));
const TIMEOUT_MS = Number(process.env.SSL_PROBE_TIMEOUT_MS || 12000);

async function fetchCandidates() {
  return Domain.find({
    type: "custom_domain",
    verification_status: "active",
    ssl_status: "ssl_pending",
  })
    .sort({ updatedAt: 1 })
    .limit(BATCH)
    .exec();
}

async function runTick() {
  const rows = await fetchCandidates();
  let promoted = 0;
  for (const domain of rows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await promoteSslIfReady(domain, TIMEOUT_MS);
      if (out.promoted) {
        promoted += 1;
        // eslint-disable-next-line no-console
        console.log(`[ssl-worker] ${domain.hostname} ssl_pending → active`);
      } else if (!out.skipped) {
        // eslint-disable-next-line no-console
        console.log(`[ssl-worker] ${domain.hostname} still pending (${out.error || out.skipped})`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[ssl-worker] ${domain.hostname}:`, err.message || err);
    }
  }
  return { candidates: rows.length, promoted };
}

async function runLoop() {
  // eslint-disable-next-line no-console
  console.log(`[ssl-worker] loop every ${INTERVAL_MS}ms, batch ${BATCH}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await runTick();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

async function main() {
  if (process.env.SSL_WORKER_ENABLED !== "true") {
    // eslint-disable-next-line no-console
    console.error("[ssl-worker] Set SSL_WORKER_ENABLED=true to run the loop.");
    process.exit(1);
  }

  await connectDb();
  await runLoop();
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[ssl-worker] fatal:", err);
    process.exit(1);
  });
}

module.exports = { runTick, fetchCandidates };
