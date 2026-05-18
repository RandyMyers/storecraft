const Site = require("../models/Site");
const Domain = require("../models/Domain");
const config = require("../config");
const { pickPublishedForPublic, migrateLegacySiteToPages } = require("../services/sitePages");
const { resolvePublishHostname } = require("../lib/publicHost");
const {
  attachCanonicalToPayload,
  attachBrowserCanonicalRedirectIfNeeded,
  escapeXml,
  pagePathFromSlug,
} = require("../services/publicSeo");
const { normalizePath } = require("../lib/redirectPaths");
const { buildRobotsTxtBody } = require("../lib/robotsTxt");

async function materializeSiteLean(rawLean) {
  if (!rawLean) return null;
  const needsMigrate =
    !rawLean.pages?.length &&
    (rawLean.draft !== undefined || rawLean.published !== undefined);
  if (!needsMigrate) return rawLean;

  const doc = await Site.findById(rawLean._id);
  if (!doc) return null;
  await migrateLegacySiteToPages(doc);
  return doc.toObject({ flattenMaps: true });
}

async function findSiteLeanByPublishHostname(hostname) {
  const domainDoc = await Domain.findOne({
    hostname,
    verification_status: "active",
  }).lean();

  if (domainDoc) {
    return Site.findById(domainDoc.siteId).lean();
  }

  if (config.platformPublishDomain) {
    const suffix = `.${config.platformPublishDomain}`;
    if (hostname.endsWith(suffix)) {
      const sub = hostname.slice(0, -suffix.length);
      if (sub.length > 0 && !sub.includes(".")) {
        return Site.findOne({ subdomain: sub }).lean();
      }
    }
  }

  return null;
}

async function sendPublishedResponse(res, rawLean, pageSlug, publishRequestHostname = null) {
  const siteLean = await materializeSiteLean(rawLean);
  if (!siteLean) {
    res.status(404).json({ error: "Site unavailable", code: "site_error" });
    return;
  }
  if (siteLean.disabled) {
    res.status(403).json({ error: "This site is suspended.", code: "site_disabled" });
    return;
  }
  const payloadRaw = pickPublishedForPublic(siteLean, pageSlug);
  if (!payloadRaw) {
    const fallback = pickPublishedForPublic(siteLean, "404");
    if (fallback) {
      let payload = await attachCanonicalToPayload(fallback, siteLean._id, config);
      if (publishRequestHostname) {
        payload = await attachBrowserCanonicalRedirectIfNeeded(
          publishRequestHostname,
          siteLean._id,
          payload,
        );
      }
      if (payload.canonicalUrl) {
        res.setHeader("Link", `<${payload.canonicalUrl}>; rel="canonical"`);
      }
      res.status(404).json({ code: "page_not_found", site: payload });
      return;
    }
    res.status(404).json({ error: "Page not found", code: "page_not_found" });
    return;
  }
  let payload = await attachCanonicalToPayload(payloadRaw, siteLean._id, config);
  if (publishRequestHostname) {
    payload = await attachBrowserCanonicalRedirectIfNeeded(
      publishRequestHostname,
      siteLean._id,
      payload,
    );
  }
  if (payload.canonicalUrl) {
    res.setHeader("Link", `<${payload.canonicalUrl}>; rel="canonical"`);
  }
  res.json({ site: payload });
}

exports.getPublished = async (req, res) => {
  const subdomain = String(req.params.subdomain || "").toLowerCase();
  const pageSlug = req.params.pageSlug != null ? String(req.params.pageSlug) : "home";

  const raw = await Site.findOne({ subdomain }).lean();
  if (!raw) {
    res.status(404).json({ error: "Site not found", code: "site_not_found" });
    return;
  }

  await sendPublishedResponse(res, raw, pageSlug, null);
};

exports.getPublishedByHost = async (req, res) => {
  const pageSlug =
    req.params.pageSlug != null ? String(req.params.pageSlug) : String(req.query.page || "home");

  const hostname = resolvePublishHostname(req, {
    allowHostQuery: config.allowPublicHostQuery,
  });

  if (!hostname) {
    res.status(400).json({
      error:
        "Could not determine hostname. Send Host / X-Forwarded-Host through your proxy, or use ?hostname= when development mode allows it.",
    });
    return;
  }

  const raw = await findSiteLeanByPublishHostname(hostname);

  if (!raw) {
    res.status(404).json({ error: "Site not found", code: "site_not_found" });
    return;
  }

  await sendPublishedResponse(res, raw, pageSlug, hostname);
};

/** Same redirect rules as `/sites/:subdomain/redirect`, resolved by publish hostname. */
exports.redirectMatchByHost = async (req, res) => {
  const hostname = resolvePublishHostname(req, {
    allowHostQuery: config.allowPublicHostQuery,
  });
  const pathWant = normalizePath(req.query.path ?? req.query.from ?? "/");
  if (!hostname) {
    res.status(400).json({
      error:
        "Could not determine hostname. Send Host / X-Forwarded-Host through your proxy, or use ?hostname= when allowed.",
    });
    return;
  }
  if (!pathWant) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const raw = await findSiteLeanByPublishHostname(hostname);
  if (!raw?._id) {
    res.status(404).json({ error: "Site not found", code: "site_not_found" });
    return;
  }
  if (raw.disabled) {
    res.status(403).json({ error: "This site is suspended.", code: "site_disabled" });
    return;
  }

  const site = await Site.findById(raw._id).select("redirects").lean();
  if (!site?.redirects?.length) {
    res.status(204).end();
    return;
  }

  const rule = site.redirects.find((r) => normalizePath(r.from) === pathWant);
  if (!rule) {
    res.status(204).end();
    return;
  }

  res.json({
    to: rule.to,
    code: Number(rule.code) === 302 ? 302 : 301,
  });
};

exports.getRobotsTxt = async (req, res) => {
  const subdomain = String(req.params.subdomain || "").toLowerCase();
  const raw = await Site.findOne({ subdomain }).select("_id disabled robotsTxtPolicy robotsTxtPaths").lean();
  if (!raw) {
    res.type("text/plain").status(404).send("# Unknown site\n");
    return;
  }
  if (raw.disabled) {
    res.type("text/plain").status(403).send("# Site unavailable\n");
    return;
  }
  const policy =
    raw.robotsTxtPolicy === "disallow_with_allow" ? "disallow_with_allow" : "allow_with_disallow";
  const paths = Array.isArray(raw.robotsTxtPaths) ? raw.robotsTxtPaths.filter((x) => typeof x === "string") : [];
  let text = buildRobotsTxtBody(policy, paths);

  const base = typeof process.env.PUBLIC_BASE_URL === "string" ? process.env.PUBLIC_BASE_URL.trim() : "";
  if (base) {
    const sb = encodeURIComponent(subdomain);
    text += `\nSitemap: ${base.replace(/\/+$/, "")}/api/public/sites/${sb}/sitemap.xml\n`;
  } else {
    text += "\n# Set PUBLIC_BASE_URL in the API env for an absolute sitemap URL\n";
  }
  res.type("text/plain").send(text);
};

exports.getSitemapXml = async (req, res) => {
  const subdomain = String(req.params.subdomain || "").toLowerCase();
  const raw = await Site.findOne({ subdomain }).lean();
  if (!raw) {
    res.status(404).type("application/xml").send("");
    return;
  }
  if (raw.disabled) {
    res.status(403).type("application/xml").send("");
    return;
  }

  const siteLean = await materializeSiteLean(raw);
  if (!siteLean) {
    res.status(404).type("application/xml").send("");
    return;
  }

  const proto =
    String(process.env.PUBLIC_URL_PROTO || "https").toLowerCase().startsWith("http:") ? "http" : "https";

  let origin;
  const baseEnv = typeof process.env.PUBLIC_BASE_URL === "string" ? process.env.PUBLIC_BASE_URL.trim() : "";
  if (baseEnv) {
    origin = baseEnv.replace(/\/+$/, "");
  } else {
    const primary = await Domain.findOne({
      siteId: siteLean._id,
      is_primary: true,
      verification_status: "active",
    })
      .select("hostname")
      .lean();

    if (primary && primary.hostname) {
      origin = `${proto}://${primary.hostname}`;
    } else {
      const d = config.platformPublishDomain || "nestpage.app";
      origin = `${proto}://${siteLean.subdomain}.${d}`;
    }
  }

  const entries = [];

  /** @param {string} slug */
  function pathForSlug(slug) {
    return pagePathFromSlug(slug);
  }

  if (siteLean.pages?.length) {
    for (const p of siteLean.pages) {
      if (p.published != null && Array.isArray(p.published)) {
        const ts = p.publishedAt ? new Date(p.publishedAt).getTime() : null;
        const loc = `${origin}${pathForSlug(p.slug)}`;
        entries.push({
          loc,
          ts,
        });
      }
    }
  } else if (siteLean.published != null && Array.isArray(siteLean.published)) {
    const ts = siteLean.publishedAt ? new Date(siteLean.publishedAt).getTime() : null;
    entries.push({ loc: `${origin}/`, ts });
  }

  const urls = entries
    .map(
      (e) =>
        `<url><loc>${escapeXml(e.loc)}</loc>${
          e.ts ? `<lastmod>${new Date(e.ts).toISOString().split("T")[0]}</lastmod>` : ""
        }</url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  res.type("application/xml").send(xml);
};

/** Query: ?path=/foo or ?from=/foo — returns JSON { to, code } or 204 when no rule. */
exports.redirectMatch = async (req, res) => {
  const subdomain = String(req.params.subdomain || "").toLowerCase();
  const pathWant = normalizePath(req.query.path ?? req.query.from ?? "/");
  if (!pathWant) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }

  const site = await Site.findOne({ subdomain }).select("redirects disabled").lean();
  if (site?.disabled) {
    res.status(403).json({ error: "This site is suspended.", code: "site_disabled" });
    return;
  }
  if (!site?.redirects?.length) {
    res.status(204).end();
    return;
  }

  const rule = site.redirects.find((r) => normalizePath(r.from) === pathWant);
  if (!rule) {
    res.status(204).end();
    return;
  }

  res.json({
    to: rule.to,
    code: Number(rule.code) === 302 ? 302 : 301,
  });
};
