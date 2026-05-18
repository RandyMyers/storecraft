require("dotenv").config();

const config = require("../config");
const { connectDb } = require("../lib/db");
const Domain = require("../models/Domain");
const { verifyDomainDocument } = require("../services/domainVerification");

const INTERVAL_MS = Number(process.env.DNS_WORKER_INTERVAL_MS || 120000);
const BATCH = Math.min(100, Math.max(1, Number(process.env.DNS_WORKER_BATCH || 25)));
const MIN_RETRY_MS = Number(process.env.DNS_WORKER_MIN_RETRY_MS || 120000);

async function fetchCandidateDomains() {
  const cutoff = new Date(Date.now() - MIN_RETRY_MS);
  return Domain.find({
    type: "custom_domain",
    verification_status: { $in: ["pending", "verifying"] },
    $or: [{ last_checked_at: null }, { last_checked_at: { $lt: cutoff } }],
  })
    .sort({ last_checked_at: 1 })
    .limit(BATCH)
    .exec();
}

async function runTick() {
  if (config.skipDnsVerify) {
    // eslint-disable-next-line no-console
    console.warn("[dns-worker] SKIP_DNS_VERIFY=true — skipping tick.");
    return { skipped: true, processed: 0 };
  }

  const rows = await fetchCandidateDomains();
  let processed = 0;
  for (const domain of rows) {
    try {
      const before = domain.verification_status;
      // eslint-disable-next-line no-await-in-loop
      const result = await verifyDomainDocument(domain);
      processed += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[dns-worker] ${domain.hostname} ${before} → ${domain.verification_status} (${result.outcome})`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[dns-worker] ${domain.hostname}:`, err.message || err);
    }
  }
  return { skipped: false, processed, candidates: rows.length };
}

async function runLoop() {
  // eslint-disable-next-line no-console
  console.log(
    `[dns-worker] loop every ${INTERVAL_MS}ms, batch ${BATCH}, min retry ${MIN_RETRY_MS}ms`,
  );
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    await runTick();
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

async function main() {
  if (process.env.DNS_WORKER_ENABLED !== "true") {
    // eslint-disable-next-line no-console
    console.error("[dns-worker] Set DNS_WORKER_ENABLED=true to run the loop.");
    process.exit(1);
  }

  await connectDb();
  await runLoop();
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[dns-worker] fatal:", err);
    process.exit(1);
  });
}

module.exports = { runTick, fetchCandidateDomains };
