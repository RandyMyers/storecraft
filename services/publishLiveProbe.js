/**
 * Detect whether a tenant publish URL serves the platform SPA + API vs Hostinger default page.
 */

const HOSTINGER_PLACEHOLDER_MARKERS = [
  "you are all set to go",
  "upload your website files",
  "default.php",
  "hostinger",
  "all you have to do now is upload",
];

const PLATFORM_APP_MARKERS = [
  "id=\"root\"",
  "id='root'",
  "/static/js/",
  "citematch",
  "nestpage",
];

/**
 * @param {string} html
 */
function htmlLooksLikeHostingerPlaceholder(html) {
  const h = String(html || "").toLowerCase();
  if (!h) return false;
  return HOSTINGER_PLACEHOLDER_MARKERS.some((m) => h.includes(m)) && !PLATFORM_APP_MARKERS.some((m) => h.includes(m));
}

/**
 * @param {string} html
 */
function htmlLooksLikePlatformSpa(html) {
  const h = String(html || "").toLowerCase();
  if (!h) return false;
  return PLATFORM_APP_MARKERS.some((m) => h.includes(m));
}

/**
 * @param {string} fqdn
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ live: boolean, fqdn: string, status?: number, reason: string, isHostingerDefault?: boolean }>}
 */
async function probePublishLiveUrl(fqdn, opts = {}) {
  const host = String(fqdn || "").trim().toLowerCase();
  const timeoutMs = opts.timeoutMs ?? 18_000;
  if (!host || !host.includes(".")) {
    return { live: false, fqdn: host, reason: "invalid_hostname" };
  }

  const url = `https://${host}/`;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const html = await res.text();
    const snippet = html.slice(0, 12_000);

    if (htmlLooksLikePlatformSpa(snippet)) {
      return {
        live: true,
        fqdn: host,
        status: res.status,
        reason: "platform_spa",
      };
    }

    if (htmlLooksLikeHostingerPlaceholder(snippet)) {
      return {
        live: false,
        fqdn: host,
        status: res.status,
        reason: "hostinger_default_page",
        isHostingerDefault: true,
      };
    }

    if (res.ok && res.status < 400) {
      return {
        live: false,
        fqdn: host,
        status: res.status,
        reason: "unknown_html",
      };
    }

    return {
      live: false,
      fqdn: host,
      status: res.status,
      reason: `http_${res.status}`,
    };
  } catch (e) {
    return {
      live: false,
      fqdn: host,
      reason: e?.name === "TimeoutError" ? "timeout" : "fetch_error",
    };
  }
}

module.exports = {
  probePublishLiveUrl,
  htmlLooksLikeHostingerPlaceholder,
  htmlLooksLikePlatformSpa,
};
