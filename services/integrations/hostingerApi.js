/**
 * Hostinger API client — see repo `hostinger.json` (OpenAPI v0.11.7).
 * Base: https://developers.hostinger.com
 */

const HOSTINGER_API_BASE = "https://developers.hostinger.com";
const LOG_PREFIX = "[hostinger-api]";

/** @param {unknown} value @param {number} [maxLen] */
function safeJson(value, maxLen = 2500) {
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return String(value);
  }
}

/** @param {unknown} data */
function summarizeResponseData(data) {
  if (data == null) return "null";
  if (Array.isArray(data)) return `array(${data.length})`;
  if (Array.isArray(data?.data)) return `data[${data.data.length}]`;
  if (typeof data.domain === "string") return `domain=${data.domain}`;
  if (typeof data.is_accessible === "boolean") {
    return `is_accessible=${data.is_accessible}`;
  }
  return safeJson(data, 800);
}

/**
 * @param {"log"|"error"} level
 * @param {...unknown} args
 */
function logHostinger(level, ...args) {
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(LOG_PREFIX, ...args);
  } else {
    // eslint-disable-next-line no-console
    console.log(LOG_PREFIX, ...args);
  }
}

/**
 * @param {string} token
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [opts]
 */
async function hostingerRequest(token, path, opts = {}) {
  const t = String(token || "").trim();
  if (!t) {
    logHostinger("error", "request skipped — empty API token", { path });
    return { ok: false, status: 400, message: "Empty Hostinger API token" };
  }
  const method = opts.method || "GET";
  const url = `${HOSTINGER_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: `Bearer ${t}`,
    Accept: "application/json",
  };
  if (opts.body != null) {
    headers["Content-Type"] = "application/json";
  }

  logHostinger("log", "→", method, path, opts.body != null ? { body: opts.body } : "");

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (data && typeof data.error === "string" && data.error) ||
        (data && typeof data.message === "string" && data.message) ||
        `Hostinger API HTTP ${res.status}`;
      logHostinger("error", "←", method, path, res.status, msg, safeJson(data));
      return { ok: false, status: res.status, message: msg, data };
    }
    logHostinger("log", "←", method, path, res.status, summarizeResponseData(data));
    return { ok: true, status: res.status, data };
  } catch (e) {
    const msg = e.message || "Hostinger request failed";
    logHostinger("error", "←", method, path, "network/error", msg);
    return { ok: false, status: 0, message: msg };
  }
}

/**
 * @param {string} token
 * @returns {Promise<{ ok: boolean, status: number, message: string, domainCount?: number }>}
 */
async function verifyHostingerToken(token) {
  const out = await hostingerRequest(token, "/api/domains/v1/portfolio");
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message };
  }
  const list = Array.isArray(out.data) ? out.data : out.data?.data;
  const count = Array.isArray(list) ? list.length : 0;
  return {
    ok: true,
    status: out.status,
    message: `Hostinger API OK (${count} domain${count === 1 ? "" : "s"} in portfolio)`,
    domainCount: count,
  };
}

/**
 * @param {string} token
 * @returns {Promise<{ ok: boolean, status: number, message: string, domains?: unknown[] }>}
 */
async function listPortfolioDomains(token) {
  const out = await hostingerRequest(token, "/api/domains/v1/portfolio");
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message };
  }
  const domains = Array.isArray(out.data) ? out.data : out.data?.data || [];
  return { ok: true, status: out.status, message: "OK", domains };
}

/**
 * @param {string} token
 * @param {string} zone Apex domain (e.g. citematch.com)
 */
async function getDnsRecords(token, zone) {
  const z = encodeURIComponent(String(zone || "").trim().toLowerCase());
  const out = await hostingerRequest(token, `/api/dns/v1/zones/${z}`);
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message };
  }
  const records = Array.isArray(out.data) ? out.data : out.data?.zone || out.data?.data || [];
  return { ok: true, status: out.status, records };
}

/**
 * @param {string} token
 * @param {string} zone
 * @param {{ overwrite?: boolean, zone: Array<{ name: string, type: string, ttl?: number, records: Array<{ content: string }> }> }} body
 */
async function updateDnsRecords(token, zone, body) {
  const z = encodeURIComponent(String(zone || "").trim().toLowerCase());
  const out = await hostingerRequest(token, `/api/dns/v1/zones/${z}`, {
    method: "PUT",
    body,
  });
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message, data: out.data };
  }
  return { ok: true, status: out.status, message: "DNS zone updated" };
}

/**
 * @param {string} token
 * @param {string} zone
 * @param {{ overwrite?: boolean, zone: unknown[] }} body
 */
async function validateDnsRecords(token, zone, body) {
  const z = encodeURIComponent(String(zone || "").trim().toLowerCase());
  const out = await hostingerRequest(token, `/api/dns/v1/zones/${z}/validate`, {
    method: "POST",
    body,
  });
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message, data: out.data };
  }
  return { ok: true, status: out.status, message: "Validation passed" };
}

/**
 * @param {string} token
 * @param {string} domain
 */
async function verifyDomainOwnership(token, domain) {
  const out = await hostingerRequest(token, "/api/hosting/v1/domains/verify-ownership", {
    method: "POST",
    body: { domain: String(domain || "").trim().toLowerCase() },
  });
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message, data: out.data };
  }
  return { ok: true, status: out.status, data: out.data };
}

function extractCollection(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/**
 * @param {string} token
 * @param {Record<string, string|number|boolean>} [query]
 */
async function listHostingOrders(token, query = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const path = `/api/hosting/v1/orders${qs.toString() ? `?${qs}` : ""}`;
  const out = await hostingerRequest(token, path);
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message };
  }
  return { ok: true, orders: extractCollection(out.data) };
}

/**
 * @param {string} token
 * @param {{ domain?: string, order_id?: number, page?: number, per_page?: number }} [query]
 */
async function listHostingWebsites(token, query = {}) {
  const qs = new URLSearchParams();
  if (query.domain) qs.set("domain", String(query.domain).trim().toLowerCase());
  if (query.order_id != null) qs.set("order_id", String(query.order_id));
  if (query.page != null) qs.set("page", String(query.page));
  if (query.per_page != null) qs.set("per_page", String(query.per_page));
  const path = `/api/hosting/v1/websites${qs.toString() ? `?${qs}` : ""}`;
  const out = await hostingerRequest(token, path);
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message };
  }
  return { ok: true, websites: extractCollection(out.data) };
}

/**
 * Create website / subdomain vhost on shared hosting (async on Hostinger side).
 * @param {string} token
 * @param {{ domain: string, order_id: number }} body
 */
async function createHostingWebsite(token, body) {
  const domain = String(body?.domain || "").trim().toLowerCase();
  const orderId = Number(body?.order_id);
  if (!domain || !Number.isFinite(orderId) || orderId <= 0) {
    logHostinger("error", "createHostingWebsite validation failed", { domain, orderId });
    return { ok: false, status: 400, message: "domain and order_id are required" };
  }
  logHostinger("log", "createHostingWebsite (subdomain vhost)", { domain, order_id: Math.floor(orderId) });
  const out = await hostingerRequest(token, "/api/hosting/v1/websites", {
    method: "POST",
    body: { domain, order_id: Math.floor(orderId) },
  });
  if (!out.ok) {
    logHostinger("error", "createHostingWebsite failed", domain, out.status, out.message);
    return { ok: false, status: out.status, message: out.message, data: out.data };
  }
  logHostinger("log", "createHostingWebsite OK — Hostinger is provisioning async", domain);
  return { ok: true, status: out.status, message: "Website creation requested on Hostinger" };
}

/** Random `*.hostingersite.com` (staging only). */
async function generateFreeSubdomain(token) {
  const out = await hostingerRequest(token, "/api/hosting/v1/domains/free-subdomains", {
    method: "POST",
  });
  if (!out.ok) {
    return { ok: false, status: out.status, message: out.message, data: out.data };
  }
  const domain =
    (out.data && typeof out.data.domain === "string" && out.data.domain) ||
    (out.data?.data && typeof out.data.data.domain === "string" && out.data.data.domain) ||
    "";
  return { ok: true, domain, data: out.data };
}

module.exports = {
  HOSTINGER_API_BASE,
  hostingerRequest,
  verifyHostingerToken,
  listPortfolioDomains,
  getDnsRecords,
  updateDnsRecords,
  validateDnsRecords,
  verifyDomainOwnership,
  listHostingOrders,
  listHostingWebsites,
  createHostingWebsite,
  generateFreeSubdomain,
};
