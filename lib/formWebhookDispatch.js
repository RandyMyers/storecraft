const crypto = require("crypto");

const WEBHOOK_TIMEOUT_MS = 12000;

function sanitizeFormWebhookSecret(raw) {
  return String(raw ?? "").replace(/\u0000/g, "").trim().slice(0, 512);
}

/**
 * POST JSON to owner-configured URL after a form submission is stored.
 * Failures are swallowed — caller should not await for user-facing latency.
 *
 * @param {string} url absolute http(s) URL (already sanitized at save time)
 * @param {string} secret optional shared secret for verification
 * @param {Record<string, unknown>} payload
 */
async function dispatchFormWebhook(url, secret, payload) {
  if (!url || !/^https?:\/\//i.test(url)) return;

  const body = JSON.stringify(payload);
  /** @type {Record<string, string>} */
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "NestpageFormWebhook/1.0",
  };

  const sec = typeof secret === "string" ? secret.trim() : "";
  if (sec) {
    headers["X-Nestpage-Webhook-Secret"] = sec;
    const digest = crypto.createHmac("sha256", sec).update(body).digest("hex");
    headers["X-Nestpage-Signature"] = `sha256=${digest}`;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { dispatchFormWebhook, sanitizeFormWebhookSecret };
