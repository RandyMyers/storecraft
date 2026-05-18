const dns = require("dns").promises;

/**
 * TXT name we ask customers to create (see domainsController verify response).
 */
function challengeHostName(hostname) {
  return `_nestpage-challenge.${String(hostname).toLowerCase().trim()}`;
}

/**
 * Normalize Node's resolveTxt output: each answer is string[] (chunks), join then trim.
 */
function flattenTxtAnswers(rows) {
  if (!rows || !rows.length) return [];
  return rows.map((parts) => (Array.isArray(parts) ? parts.join("") : String(parts)).trim());
}

/**
 * @returns {Promise<'match' | 'no_match' | 'transient_error' | 'permanent_dns_error'>}
 */
async function verifyNestpageTxtToken(hostname, expectedToken) {
  const fqdn = challengeHostName(hostname);
  const want = String(expectedToken || "").trim();
  if (!want) return "no_match";

  let rows;
  try {
    rows = await dns.resolveTxt(fqdn);
  } catch (err) {
    const code = err && err.code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") {
      return "no_match";
    }
    if (code === "ESERVFAIL" || code === "ETIMEOUT" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
      return "transient_error";
    }
    return "permanent_dns_error";
  }

  const values = flattenTxtAnswers(rows).map((s) => s.replace(/^"(.*)"$/, "$1").trim());
  return values.some((v) => v === want) ? "match" : "no_match";
}

module.exports = {
  challengeHostName,
  verifyNestpageTxtToken,
};
