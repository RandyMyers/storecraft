/**
 * Post-deploy smoke: GET /health on a live API (no DB writes).
 *
 * Usage:
 *   SMOKE_API_BASE_URL=https://api.example.com node scripts/smoke-production-health.js
 *   node scripts/smoke-production-health.js https://api.example.com
 */
const baseArg = process.argv[2] || String(process.env.SMOKE_API_BASE_URL || "").trim().replace(/\/+$/, "");

if (!baseArg) {
  // eslint-disable-next-line no-console
  console.error(
    "[smoke-production-health] Set SMOKE_API_BASE_URL or pass base URL as first argument.\n" +
      "Example: SMOKE_API_BASE_URL=https://api.yourdomain.com node scripts/smoke-production-health.js",
  );
  process.exit(2);
}

const url = `${baseArg}/health`;

async function main() {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  // eslint-disable-next-line no-console
  console.log(`[smoke-production-health] ${res.status} ${url}`);

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error("[smoke-production-health] Unexpected status:", body);
    process.exit(1);
  }

  if (!body || body.ok !== true) {
    // eslint-disable-next-line no-console
    console.error("[smoke-production-health] Body missing ok:true:", body);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log("[smoke-production-health] ok", { db: body.db, requestId: body.requestId });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[smoke-production-health] fatal:", err.message);
  process.exit(1);
});
