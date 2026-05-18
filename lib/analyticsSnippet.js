/** Allowed size for pasted GTM / analytics fragments (§17 integrations MVP). */
const MAX_ANALYTICS_HEAD_HTML = 16384;

/**
 * Minimal cleanup: strip NULs and cap length. Content is intentionally executable HTML
 * owned by the site author.
 */
function sanitizeAnalyticsHeadHtml(raw) {
  let s = String(raw ?? "").replace(/\u0000/g, "");
  if (s.length > MAX_ANALYTICS_HEAD_HTML) {
    s = s.slice(0, MAX_ANALYTICS_HEAD_HTML);
  }
  return s.trimEnd();
}

module.exports = {
  sanitizeAnalyticsHeadHtml,
  MAX_ANALYTICS_HEAD_HTML,
};
