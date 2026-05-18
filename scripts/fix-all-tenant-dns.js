/**
 * One-time: add tenant CNAME DNS for every site (dns_cname provision mode).
 * Usage: cd server && node scripts/fix-all-tenant-dns.js
 */
require("dotenv").config();
const { connectDb, mongoose } = require("../lib/db");
const Site = require("../models/Site");
const { getHostingerCredentials, platformFqdnForSubdomain } = require("../services/hostingerIntegration");
const { ensurePlatformTenantDns } = require("../services/platformTenantDns");
const { probePublishLiveUrl } = require("../services/publishLiveProbe");

async function main() {
  await connectDb();

  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    // eslint-disable-next-line no-console
    console.error("No Hostinger token — configure Integrations first.");
    process.exit(1);
  }
  const sites = await Site.find({ disabled: { $ne: true } }).select("subdomain hostingerSubdomainStatus");
  // eslint-disable-next-line no-console
  console.log(`Processing ${sites.length} site(s)...`);

  for (const site of sites) {
    const sub = String(site.subdomain || "").trim().toLowerCase();
    if (!sub) continue;
    const fqdn = platformFqdnForSubdomain(sub);
    const dns = await ensurePlatformTenantDns(creds.token, sub);
    const probe = await probePublishLiveUrl(fqdn);
    if (probe.live) {
      site.hostingerSubdomainStatus = "live";
      site.hostingerSubdomainNote = "Live URL serves your published site.";
    } else if (probe.isHostingerDefault) {
      site.hostingerSubdomainStatus = "hosting_pending";
      site.hostingerSubdomainNote =
        "Remove separate Hostinger website for this host or set same public_html as citematch.com.";
    } else if (dns.ok) {
      site.hostingerSubdomainStatus = "hosting_pending";
      site.hostingerSubdomainNote = "DNS updated; waiting for live URL.";
    }
    site.hostingerSubdomainAt = new Date();
    await site.save();
    // eslint-disable-next-line no-console
    console.log(sub, dns.ok ? "dns-ok" : "dns-fail", probe.live ? "LIVE" : probe.reason);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
