const { probeTls } = require("./sslProbe");

/**
 * If DNS is verified and SSL is waiting (`ssl_pending`), probe HTTPS and promote to `active`.
 *
 * @param {import("mongoose").Document} domain
 * @returns {Promise<{ promoted: boolean; ok?: boolean; error?: string; skipped?: string }>}
 */
async function promoteSslIfReady(domain, timeoutMs = 12000) {
  if (domain.verification_status !== "active") {
    return { promoted: false, skipped: "verification_not_active" };
  }
  if (domain.ssl_status !== "ssl_pending") {
    return { promoted: false, skipped: `ssl_status_${domain.ssl_status}` };
  }

  const result = await probeTls(domain.hostname, timeoutMs);
  if (!result.ok) {
    return { promoted: false, ok: false, error: result.error };
  }

  domain.ssl_status = "active";
  await domain.save();
  return { promoted: true, ok: true };
}

module.exports = { promoteSslIfReady };
