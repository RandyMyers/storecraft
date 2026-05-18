/**
 * One-time: add tenant CNAME DNS for every site (dns_cname provision mode).
 * Usage: cd server && node scripts/fix-all-tenant-dns.js
 */
require("dotenv").config();
const { connectDb, mongoose } = require("../lib/db");
const { runPlatformPublishSetup } = require("../services/platformHostingSetup");

async function main() {
  await connectDb();

  const out = await runPlatformPublishSetup();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));

  if (out.conflicts?.websites?.length) {
    // eslint-disable-next-line no-console
    console.log("\nDelete these in hPanel → Websites:\n");
    for (const w of out.conflicts.websites) {
      // eslint-disable-next-line no-console
      console.log(`  - ${w.domain} (${w.vhost_type})`);
    }
  }

  await mongoose.disconnect();
  process.exit(out.ok ? 0 : 1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
