const config = require("../config");

function escapeSlack(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Best-effort Slack (or Slack-compatible) incoming webhook for admin integration-secret events.
 * Never includes secret values — only action + non-sensitive metadata.
 */
async function notifyIntegrationSecretAudit(action, fields) {
  const url = config.adminSlackWebhookUrl;
  if (!url) return;
  const lines = [`*Nestpage admin* — integration secret \`${escapeSlack(action)}\``];
  for (const [k, v] of Object.entries(fields || {})) {
    if (v === undefined || v === null || v === "") continue;
    lines.push(`• ${escapeSlack(k)}: \`${escapeSlack(String(v))}\``);
  }
  const text = lines.join("\n");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[slackAdminNotify] webhook HTTP", res.status);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[slackAdminNotify]", e.message);
  }
}

module.exports = { notifyIntegrationSecretAudit };
