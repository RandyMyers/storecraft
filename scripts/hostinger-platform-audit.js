/**
 * Hostinger + platform readiness audit for citematch.com (read-only).
 *
 * Uses Hostinger API endpoints from repo `hostinger.json`:
 *   GET  /api/domains/v1/portfolio
 *   GET  /api/hosting/v1/orders
 *   GET  /api/hosting/v1/websites
 *   GET  /api/dns/v1/zones/{zone}
 *   POST /api/hosting/v1/domains/verify-ownership
 *
 * Token: HOSTINGER_API_TOKEN env, or encrypted secret in Mongo (Integrations → hostinger).
 *
 * Usage (from server/):
 *   node scripts/hostinger-platform-audit.js
 *   AUDIT_DOMAIN=citematch.com node scripts/hostinger-platform-audit.js
 *
 * Output: docs/ops/CITEMATCH_HOSTINGER_AUDIT.md (override with AUDIT_OUTPUT)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;

const { connectDb, mongoose } = require("../lib/db");
const config = require("../config");
const { getHostingerCredentials, resolveHostingOrderId } = require("../services/hostingerIntegration");
const {
  HOSTINGER_API_BASE,
  verifyHostingerToken,
  listPortfolioDomains,
  listHostingOrders,
  listHostingWebsites,
  getDnsRecords,
  verifyDomainOwnership,
} = require("../services/integrations/hostingerApi");

const APEX = String(process.env.AUDIT_DOMAIN || config.platformPublishDomain || "citematch.com")
  .trim()
  .toLowerCase();
const WWW = `www.${APEX}`;
const DEFAULT_OUT = path.join(__dirname, "../../docs/ops/CITEMATCH_HOSTINGER_AUDIT.md");
const OUT_PATH = path.resolve(process.env.AUDIT_OUTPUT || DEFAULT_OUT);

/** @type {Array<{ id: string, ok: boolean, title: string, detail?: string }>} */
const checks = [];

/** @type {Record<string, unknown>} */
const data = {};

function check(id, ok, title, detail = "") {
  checks.push({ id, ok, title, detail });
}

function mdEscape(s) {
  return String(s || "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function mdTable(headers, rows) {
  if (!rows.length) return "_No rows._\n\n";
  const head = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;
  const body = rows.map((r) => `| ${r.map(mdEscape).join(" | ")} |`).join("\n");
  return head + body + "\n\n";
}

async function resolveToken() {
  const fromEnv = String(process.env.HOSTINGER_API_TOKEN || "").trim();
  if (fromEnv) {
    return { source: "HOSTINGER_API_TOKEN (env)", token: fromEnv, metadata: {} };
  }

  if (!config.secretsMasterKey) {
    return {
      source: null,
      token: null,
      error:
        "No HOSTINGER_API_TOKEN and SECRETS_MASTER_KEY unset — cannot load Integrations secret from Mongo.",
    };
  }

  await connectDb();
  const creds = await getHostingerCredentials();
  if (!creds?.token) {
    return {
      source: null,
      token: null,
      error: "No active hostinger IntegrationSecret in Mongo (admin → Integrations).",
    };
  }
  return {
    source: "Mongo IntegrationSecret (provider: hostinger)",
    token: creds.token,
    metadata: creds.metadata || {},
  };
}

async function publicDnsLookup(name, type) {
  try {
    if (type === "A") return await dns.resolve4(name);
    if (type === "AAAA") return await dns.resolve6(name);
    if (type === "CNAME") return await dns.resolveCname(name);
    if (type === "NS") return await dns.resolveNs(name);
    if (type === "TXT") return await dns.resolveTxt(name);
    if (type === "MX") return await dns.resolveMx(name);
    return [];
  } catch (e) {
    return { error: e.code || e.message };
  }
}

function summarizeDnsRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const byType = {};
  for (const r of list) {
    const type = String(r.type || "?").toUpperCase();
    if (!byType[type]) byType[type] = [];
    const vals = (r.records || []).map((x) => x.content || x.value || JSON.stringify(x));
    byType[type].push({ name: r.name ?? "@", ttl: r.ttl, values: vals });
  }
  return byType;
}

function filterWebsitesForPlatform(websites) {
  const apex = APEX.toLowerCase();
  return (websites || []).filter((w) => {
    const d = String(w.domain || "").toLowerCase();
    return d === apex || d === `www.${apex}` || d.endsWith(`.${apex}`);
  });
}

async function runHostingerChecks(token, metadata) {
  const verify = await verifyHostingerToken(token);
  data.apiVerify = verify;
  check("api_token", verify.ok, "Hostinger API token valid", verify.message);

  if (!verify.ok) return;

  const portfolio = await listPortfolioDomains(token);
  data.portfolio = portfolio;
  check(
    "portfolio",
    portfolio.ok,
    "Domain portfolio (GET /api/domains/v1/portfolio)",
    portfolio.ok ? `${(portfolio.domains || []).length} domain(s)` : portfolio.message,
  );

  const domains = portfolio.ok ? portfolio.domains || [] : [];
  const apexRow = domains.find((d) => {
    const name = String(d.domain || d.name || "").toLowerCase();
    return name === APEX;
  });
  data.apexPortfolio = apexRow || null;
  check(
    "portfolio_apex",
    Boolean(apexRow),
    `${APEX} in Hostinger portfolio`,
    apexRow
      ? `status=${apexRow.status || apexRow.state || "—"}, expires=${apexRow.expires_at || apexRow.expiry_date || "—"}`
      : "Not found in portfolio list",
  );

  const orders = await listHostingOrders(token, { per_page: 50 });
  data.orders = orders;
  check(
    "hosting_orders",
    orders.ok,
    "Hosting orders (GET /api/hosting/v1/orders)",
    orders.ok ? `${(orders.orders || []).length} order(s)` : orders.message,
  );

  const websitesAll = await listHostingWebsites(token, { per_page: 100 });
  data.websitesAll = websitesAll;
  const platformSites = websitesAll.ok ? filterWebsitesForPlatform(websitesAll.websites) : [];
  data.platformWebsites = platformSites;
  check(
    "hosting_websites",
    websitesAll.ok,
    "Hosting websites list (GET /api/hosting/v1/websites)",
    websitesAll.ok
      ? `${(websitesAll.websites || []).length} total; ${platformSites.length} matching *${APEX}`
      : websitesAll.message,
  );

  const websitesApex = await listHostingWebsites(token, { domain: APEX, per_page: 50 });
  data.websitesApex = websitesApex;
  const apexVhost =
    websitesApex.ok &&
    (websitesApex.websites || []).find((w) => String(w.domain || "").toLowerCase() === APEX);
  const mainSite =
    websitesApex.ok &&
    (websitesApex.websites || []).find((w) => String(w.vhost_type || "").toLowerCase() === "main");
  const hostingSite = mainSite || apexVhost;
  check(
    "hosting_apex_vhost",
    Boolean(hostingSite),
    `Hosting vhost for ${APEX}`,
    hostingSite
      ? `vhost_type=${hostingSite.vhost_type}, order_id=${hostingSite.order_id}, enabled=${hostingSite.is_enabled}, username=${hostingSite.username || "—"}`
      : "No website row for apex in Hostinger",
  );

  const orderId = await resolveHostingOrderId(
    { token, metadata },
    APEX,
  );
  data.resolvedOrderId = orderId;
  check(
    "resolved_order_id",
    Boolean(orderId),
    "Resolvable hosting order_id (for subdomain create)",
    orderId
      ? String(orderId)
      : "Set hostingOrderId in integration metadata or HOSTINGER_HOSTING_ORDER_ID",
  );

  const dns = await getDnsRecords(token, APEX);
  data.dnsZone = dns;
  const dnsSummary = dns.ok ? summarizeDnsRecords(dns.records) : null;
  data.dnsSummary = dnsSummary;
  check(
    "dns_zone_api",
    dns.ok,
    `DNS zone via API (GET /api/dns/v1/zones/${APEX})`,
    dns.ok ? Object.keys(dnsSummary || {}).join(", ") || "empty zone" : dns.message,
  );

  if (dns.ok && dnsSummary) {
    const aRecords = dnsSummary.A || [];
    const wildcardA = aRecords.find((r) => r.name === "*");
    const apexA = aRecords.filter((r) => r.name === "@" || r.name === APEX);
    data.dnsApexA = apexA;
    data.dnsWildcard = wildcardA || null;
    const aliasAt = (dnsSummary.ALIAS || []).find((r) => r.name === "@");
    check(
      "dns_apex_a",
      apexA.length > 0 || Boolean(aliasAt),
      "Apex points to hosting (A or ALIAS @)",
      apexA.length
        ? apexA.map((r) => r.values.join(", ")).join("; ")
        : aliasAt
          ? `ALIAS @ → ${aliasAt.values.join(", ")}`
          : "none",
    );
    check(
      "dns_wildcard_a",
      Boolean(wildcardA),
      "Wildcard A record (*.apex) in Hostinger DNS",
      wildcardA ? wildcardA.values.join(", ") : "none — tenant subdomains may need DNS or hPanel",
    );
  }

  const verifyApex = await verifyDomainOwnership(token, APEX);
  data.verifyApex = verifyApex;
  const apexAccessible =
    verifyApex.ok && verifyApex.data && verifyApex.data.is_accessible === true;
  check(
    "verify_ownership_apex",
    verifyApex.ok,
    `Ownership API (POST verify-ownership) — ${APEX}`,
    verifyApex.ok
      ? `is_accessible=${verifyApex.data?.is_accessible} (false is normal when site already on account; create-website still works)`
      : verifyApex.message,
  );

  // Hostinger API rejects domains starting with www. (see hostinger.json CreateWebsiteRequest).
  check(
    "verify_ownership_www",
    true,
    `Ownership check — ${WWW}`,
    "Skipped — Hostinger verify-ownership does not accept www. prefixes; use apex only",
  );
}

async function runPublicChecks() {
  for (const [host, types] of [
    [APEX, ["A", "AAAA", "NS", "TXT", "MX"]],
    [WWW, ["A", "CNAME"]],
  ]) {
    for (const type of types) {
      const key = `public_${host}_${type}`;
      const result = await publicDnsLookup(host, type);
      data[key] = result;
      const ok = !(result && result.error);
      const optional = type === "TXT" || type === "MX";
      const detail =
        result && result.error
          ? result.error
          : Array.isArray(result)
            ? result.flat().join("; ").slice(0, 200)
            : String(result);
      const pass = ok || (optional && result?.error === "ENODATA");
      check(
        key,
        pass,
        `Public DNS ${type} — ${host}`,
        pass && result?.error === "ENODATA" ? "none (optional)" : detail || "—",
      );
    }
  }

  try {
    const res = await fetch(`https://${APEX}/`, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    data.httpsHead = { status: res.status, url: res.url };
    check("https_apex", res.ok || res.status < 400, `HTTPS HEAD https://${APEX}/`, `HTTP ${res.status}`);
  } catch (e) {
    data.httpsHead = { error: e.message };
    check("https_apex", false, `HTTPS HEAD https://${APEX}/`, e.message);
  }
}

function renderMarkdown(report) {
  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const lines = [
    "# Citematch.com — Hostinger & platform audit",
    "",
    `_Generated: ${report.generatedAt}_`,
    "",
    "## Summary",
    "",
    `- **Domain audited:** \`${APEX}\``,
    `- **Platform publish domain (config):** \`${report.platformPublishDomain}\``,
    `- **Hostinger API base:** \`${HOSTINGER_API_BASE}\``,
    `- **Token source:** ${report.tokenSource || "_none_"}`,
    `- **Checks:** ${passed}/${total} passed`,
    "",
    report.tokenError
      ? `> **Token error:** ${report.tokenError}\n`
      : "",
    "### Checklist",
    "",
    mdTable(
      ["ID", "Status", "Check", "Detail"],
      checks.map((c) => [c.id, c.ok ? "PASS" : "FAIL", c.title, c.detail || ""]),
    ),
    "## Hostinger API",
    "",
  ];

  if (report.tokenError) {
    lines.push(
      "Could not call Hostinger API. Set `HOSTINGER_API_TOKEN` or configure Integrations in Mongo with `SECRETS_MASTER_KEY`.\n",
    );
  } else {
    if (data.apiVerify) {
      lines.push(`**Token test:** ${data.apiVerify.message}\n\n`);
    }
    if (data.apexPortfolio) {
      lines.push("### Portfolio row (apex)\n\n", "```json\n", JSON.stringify(data.apexPortfolio, null, 2), "\n```\n\n");
    }
    if (data.resolvedOrderId) {
      lines.push(`**Resolved order_id for subdomain create:** \`${data.resolvedOrderId}\`\n\n`);
    }
    if (Array.isArray(data.platformWebsites) && data.platformWebsites.length) {
      lines.push(
        "### Websites matching platform domain\n\n",
        mdTable(
          ["Domain", "vhost_type", "enabled", "order_id", "username"],
          data.platformWebsites.map((w) => [
            w.domain,
            w.vhost_type,
            String(w.is_enabled),
            String(w.order_id ?? ""),
            w.username || "",
          ]),
        ),
      );
    }
    if (data.dnsSummary) {
      lines.push("### DNS zone summary (Hostinger API)\n\n");
      for (const [type, rows] of Object.entries(data.dnsSummary)) {
        lines.push(`**${type}**\n\n`);
        lines.push(
          mdTable(
            ["Name", "TTL", "Values"],
            rows.map((r) => [r.name, String(r.ttl ?? ""), (r.values || []).join(", ")]),
          ),
        );
      }
    }
    if (data.verifyApex?.data) {
      lines.push(
        "### verify-ownership (apex)\n\n",
        "```json\n",
        JSON.stringify(data.verifyApex.data, null, 2),
        "\n```\n\n",
      );
    }
  }

  lines.push("## Public DNS (resolver)\n\n");
  for (const c of checks.filter((x) => x.id.startsWith("public_"))) {
    const key = c.id;
    const val = data[key];
    lines.push(`- **${c.title}:** ${c.ok ? "OK" : "FAIL"} — ${mdEscape(c.detail)}\n`);
  }

  if (data.httpsHead) {
    lines.push("\n## HTTPS probe\n\n", "```json\n", JSON.stringify(data.httpsHead, null, 2), "\n```\n\n");
  }

  lines.push(
    "## Config reference (server)\n\n",
    mdTable(
      ["Variable", "Value"],
      [
        ["PLATFORM_PUBLISH_DOMAIN", report.platformPublishDomain],
        ["HOSTINGER_HOSTING_ORDER_ID", report.hostingerHostingOrderId || "—"],
        ["HOSTINGER_AUTO_PROVISION_SUBDOMAIN", String(report.hostingerAutoProvisionSubdomain)],
        ["SECRETS_MASTER_KEY", report.secretsConfigured ? "set" : "missing"],
      ],
    ),
    "## How to re-run\n\n",
    "```bash\n",
    "cd server\n",
    "node scripts/hostinger-platform-audit.js\n",
    "# optional:\n",
    "# HOSTINGER_API_TOKEN=... node scripts/hostinger-platform-audit.js\n",
    "# AUDIT_DOMAIN=citematch.com AUDIT_OUTPUT=../docs/ops/CITEMATCH_HOSTINGER_AUDIT.md\n",
    "```\n",
  );

  return lines.join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[hostinger-audit] Auditing ${APEX} → ${OUT_PATH}`);

  const tokenInfo = await resolveToken();
  data.tokenSource = tokenInfo.source;

  if (tokenInfo.token) {
    await runHostingerChecks(tokenInfo.token, tokenInfo.metadata || {});
  } else {
    check("api_token", false, "Hostinger API token", tokenInfo.error || "missing");
  }

  await runPublicChecks();

  const report = {
    generatedAt,
    platformPublishDomain: config.platformPublishDomain,
    hostingerHostingOrderId: config.hostingerHostingOrderId,
    hostingerAutoProvisionSubdomain: config.hostingerAutoProvisionSubdomain,
    secretsConfigured: Boolean(config.secretsMasterKey),
    tokenSource: tokenInfo.source,
    tokenError: tokenInfo.error || null,
  };

  const md = renderMarkdown(report);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, md, "utf8");

  // eslint-disable-next-line no-console
  console.log(`[hostinger-audit] Wrote ${OUT_PATH}`);
  const passed = checks.filter((c) => c.ok).length;
  // eslint-disable-next-line no-console
  console.log(`[hostinger-audit] ${passed}/${checks.length} checks passed`);

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  process.exit(checks.some((c) => !c.ok) ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[hostinger-audit] fatal:", err);
  process.exit(1);
});
