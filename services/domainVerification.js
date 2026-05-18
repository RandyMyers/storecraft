const config = require("../config");
const { challengeHostName, verifyNestpageTxtToken } = require("./dnsVerify");

/**
 * Run TXT verification for a Domain mongoose document and persist status.
 * Used by POST verify handler and the DNS worker.
 *
 * @param {import("mongoose").Document} domain
 * @returns {Promise<{ outcome: string; verified: boolean; dns_txt?: string; dns_txt_value?: string }>}
 */
async function verifyDomainDocument(domain) {
  const txtFqdn = challengeHostName(domain.hostname);
  const token = domain.verification_token;

  if (config.skipDnsVerify) {
    domain.verification_status = "active";
    domain.ssl_status = config.strictSslLifecycle ? "ssl_pending" : "active";
    domain.failure_reason = "";
    domain.last_checked_at = new Date();
    await domain.save();
    return {
      outcome: "skipped_dev",
      verified: true,
      dns_txt: txtFqdn,
      dns_txt_value: token,
    };
  }

  domain.last_checked_at = new Date();
  domain.failure_reason = "";
  domain.verification_status = "verifying";

  let outcome;
  try {
    outcome = await verifyNestpageTxtToken(domain.hostname, token);
  } catch (_e) {
    outcome = "permanent_dns_error";
  }

  if (outcome === "match") {
    domain.verification_status = "active";
    domain.ssl_status = config.strictSslLifecycle ? "ssl_pending" : "active";
    domain.failure_reason = "";
    await domain.save();
    return {
      outcome: "match",
      verified: true,
      dns_txt: txtFqdn,
      dns_txt_value: token,
    };
  }

  if (outcome === "transient_error") {
    domain.verification_status = "verifying";
    domain.failure_reason =
      "DNS lookup timed out or the resolver was unavailable. Try again in a few minutes.";
    await domain.save();
    return {
      outcome: "transient_error",
      verified: false,
      dns_txt: txtFqdn,
      dns_txt_value: token,
    };
  }

  const reason =
    outcome === "no_match"
      ? `No matching TXT record at ${txtFqdn}. Publish the TXT value below at your DNS host, wait for propagation, then run “Check DNS / verify” again.`
      : "DNS responded with an error for this hostname. Confirm it is spelled correctly and resolvable publicly.";

  domain.verification_status = "failed";
  domain.failure_reason = reason;
  await domain.save();
  return {
    outcome,
    verified: false,
    dns_txt: txtFqdn,
    dns_txt_value: token,
    message: reason,
  };
}

module.exports = { verifyDomainDocument };
