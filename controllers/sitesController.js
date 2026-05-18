const mongoose = require("mongoose");
const config = require("../config");
const {
  queueProvisionPlatformSubdomain,
  provisionPlatformSubdomainForPublish,
} = require("../services/hostingerProvisionQueue");
const { platformFqdnForSubdomain } = require("../services/hostingerIntegration");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const User = require("../models/User");
const { entitlementLimits } = require("../lib/entitlements");
const FormSubmission = require("../models/FormSubmission");
const { newId, sanitizeSubdomain } = require("../lib/ids");
const { DEFAULT_BLOCKS } = require("../defaults/blocks");
const {
  migrateLegacySiteToPages,
  summarizeSiteListing,
  serializePage,
  sitePublishedTimestamp,
  isBlocks,
  stripEditorOnlyFromBlocks,
} = require("../services/sitePages");
const { sanitizeRedirectList, validateRedirectRules } = require("../lib/redirectPaths");
const {
  sanitizeOgTitle,
  sanitizeOgDescription,
  sanitizeOgImage,
  sanitizeTwitterCard,
  sanitizeHttpUrlOptional,
  sanitizeOrganizationName,
} = require("../lib/socialMeta");
const { sanitizeAnalyticsHeadHtml } = require("../lib/analyticsSnippet");
const { sanitizeFormWebhookSecret } = require("../lib/formWebhookDispatch");
const { sanitizeRobotsTxtPayload } = require("../lib/robotsTxt");
const { sanitizeContentLanguage, sanitizeGeoRegion } = require("../lib/seoLocale");
const PublishRevision = require("../models/PublishRevision");

function platformPublishHostnameForSubdomain(subdomain) {
  const sub = String(subdomain || "").trim().toLowerCase();
  const apex = String(config.platformPublishDomain || "citematch.com").trim() || "citematch.com";
  return sub ? `${sub}.${apex}` : null;
}
const TemplateCatalog = require("../models/Template");
const { recordPublishRevision, applyRevisionSnapshotToSite } = require("../services/publishHistory");
const {
  getTemplateDefinition,
  buildSitePagesFromTemplate,
  sanitizeTemplateSlug,
} = require("../lib/siteTemplates");

function slugifyPageSegment(raw) {
  const s = String(raw || "").toLowerCase();
  const cleaned = s.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || null;
}

function sanitizeBloomNavField(v) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, 120);
}

function bloomNavFromDoc(site) {
  return {
    bloomNavJournalLabel: sanitizeBloomNavField(site.bloomNavJournalLabel),
    bloomNavAboutLabel: sanitizeBloomNavField(site.bloomNavAboutLabel),
    bloomNavSubscribeLabel: sanitizeBloomNavField(site.bloomNavSubscribeLabel),
    bloomNavIssueChip: sanitizeBloomNavField(site.bloomNavIssueChip),
    bloomNavSearchLabel: sanitizeBloomNavField(site.bloomNavSearchLabel),
    bloomNavMenuLabel: sanitizeBloomNavField(site.bloomNavMenuLabel),
    bloomNavSubBarAside: sanitizeBloomNavField(site.bloomNavSubBarAside),
  };
}

function sanitizeNewPageSlug(raw) {
  const cleaned = slugifyPageSegment(raw);
  if (!cleaned || cleaned === "home" || cleaned.length < 2) return null;
  return cleaned;
}

async function loadWritableSite(req, res) {
  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  let siteId;
  try {
    siteId = new mongoose.Types.ObjectId(req.params.siteId);
  } catch {
    res.status(404).json({ error: "Site not found" });
    return null;
  }

  const site = await Site.findOne({ _id: siteId, userId: userObjectId });
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return null;
  }
  return site;
}

function rejectIfSiteSuspended(site, res) {
  if (site.disabled) {
    res.status(403).json({
      error:
        "This site is suspended. Publishing and live restores are disabled until an administrator re-enables the site.",
      code: "SITE_SUSPENDED",
    });
    return true;
  }
  return false;
}

exports.list = async (req, res) => {
  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const rows = await Site.find({ userId: userObjectId }).sort({ updatedAt: -1 }).lean();

  /** @type {Record<string, number>} */
  let submissionCountBySiteId = {};
  if (rows.length > 0) {
    const siteIds = rows.map((s) => s._id);
    const agg = await FormSubmission.aggregate([
      { $match: { siteId: { $in: siteIds } } },
      { $group: { _id: "$siteId", submissionCount: { $sum: 1 } } },
    ]);
    submissionCountBySiteId = Object.fromEntries(
      agg.map((row) => [row._id.toString(), row.submissionCount]),
    );
  }

  const sites = rows.map((s) => {
    const sum = summarizeSiteListing(s);
    const idStr = s._id.toString();
    return {
      id: idStr,
      name: s.name,
      subdomain: s.subdomain,
      hostingerSubdomainStatus: s.hostingerSubdomainStatus || "manual_required",
      platformPublishHostname: platformPublishHostnameForSubdomain(s.subdomain),
      disabled: !!s.disabled,
      updatedAt: sum.updatedAt ? new Date(sum.updatedAt).getTime() : undefined,
      publishedAt: sum.publishedAt,
      status: sum.status,
      pageCount: sum.pageCount,
      submissionCount: submissionCountBySiteId[idStr] ?? 0,
      templateSlug: typeof s.templateSlug === "string" && s.templateSlug ? s.templateSlug : "default",
    };
  });
  res.json({ sites });
};

exports.create = async (req, res) => {
  const name = String(req.body.name || "Untitled").trim() || "Untitled";
  let sub = sanitizeSubdomain(req.body.subdomain || "");
  if (!sub) {
    sub = sanitizeSubdomain(name.replace(/\s+/g, "-")) || newId("s").slice(0, 8);
  }

  let candidate = sub;
  let n = 0;
  while (await Site.findOne({ subdomain: candidate }).lean()) {
    n += 1;
    candidate = `${sub}-${n}`;
  }

  const userObjectId = new mongoose.Types.ObjectId(req.userId);
  const owner = await User.findById(userObjectId).lean();
  if (owner) {
    const { limits, effectivePlan } = await entitlementLimits(owner);
    const count = await Site.countDocuments({ userId: userObjectId });
    if (count >= limits.maxSites) {
      res.status(403).json({
        error: `Site limit reached for the ${effectivePlan} plan (${limits.maxSites} max). Upgrade or remove a site.`,
        code: "PLAN_LIMIT",
      });
      return;
    }
  }

  const tplSlug = sanitizeTemplateSlug(req.body.templateSlug);
  const tplCatalog = await TemplateCatalog.findOne({ slug: tplSlug, isActive: true }).lean();
  if (!tplCatalog) {
    res.status(400).json({ error: "Unknown or inactive template", code: "BAD_TEMPLATE" });
    return;
  }
  const tpl = getTemplateDefinition(tplSlug);
  if (!tpl) {
    res.status(400).json({
      error: "Template catalog exists but starter definition is missing — redeploy server seeds.",
      code: "BAD_TEMPLATE",
    });
    return;
  }
  const seedPages = buildSitePagesFromTemplate(tpl);
  const site = await Site.create({
    userId: userObjectId,
    name,
    subdomain: candidate,
    templateSlug: tpl.slug,
    templateVersion: tpl.version,
    pages: seedPages,
    publishedAt: null,
  });

  queueProvisionPlatformSubdomain(site._id.toString());

  res.status(201).json({
    site: {
      id: site._id.toString(),
      name,
      subdomain: candidate,
      templateSlug: tpl.slug,
      templateVersion: tpl.version,
      pages: seedPages.map((p) => serializePage(p)),
      analyticsHeadHtml:
        typeof site.analyticsHeadHtml === "string" ? site.analyticsHeadHtml : "",
      organizationName:
        typeof site.organizationName === "string" ? site.organizationName : "",
      organizationUrl:
        typeof site.organizationUrl === "string" ? site.organizationUrl : "",
      organizationLogoUrl:
        typeof site.organizationLogoUrl === "string" ? site.organizationLogoUrl : "",
      formWebhookUrl: typeof site.formWebhookUrl === "string" ? site.formWebhookUrl : "",
      formWebhookSecret:
        typeof site.formWebhookSecret === "string" ? site.formWebhookSecret : "",
      robotsTxtPolicy:
        site.robotsTxtPolicy === "disallow_with_allow" ? "disallow_with_allow" : "allow_with_disallow",
      robotsTxtPaths: Array.isArray(site.robotsTxtPaths) ? [...site.robotsTxtPaths] : [],
      primaryPublishHostname: null,
      platformPublishHostname: platformPublishHostnameForSubdomain(candidate),
      previewPath: `/s/${candidate}`,
      tagline: typeof site.tagline === "string" ? site.tagline : "",
      contentLanguage:
        typeof site.contentLanguage === "string" ? sanitizeContentLanguage(site.contentLanguage) : "en",
      geoRegion: typeof site.geoRegion === "string" ? sanitizeGeoRegion(site.geoRegion) : "",
      canRollbackPublish: false,
      status: "Draft",
      updatedAt: site.updatedAt ? site.updatedAt.getTime() : Date.now(),
      publishedAt: null,
    },
  });
};

exports.addPage = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;

  await migrateLegacySiteToPages(site);

  const owner = await User.findById(req.userId).lean();
  if (owner) {
    const { limits, effectivePlan } = await entitlementLimits(owner);
    const pageCount = Array.isArray(site.pages) ? site.pages.length : 0;
    if (pageCount >= limits.maxPagesPerSite) {
      res.status(403).json({
        error: `Page limit reached for the ${effectivePlan} plan (${limits.maxPagesPerSite} pages per site).`,
        code: "PLAN_LIMIT",
      });
      return;
    }
  }

  const slug = sanitizeNewPageSlug(req.body.slug);
  const rawTitle = String(req.body.title || "").trim();
  const title = rawTitle || (slug ? slug.slice(0, 1).toUpperCase() + slug.slice(1) : "Page");

  if (!slug) {
    res.status(400).json({
      error: "Slug required: 2+ characters, letters/numbers/hyphens (cannot reserve 'home').",
    });
    return;
  }

  const exists = site.pages.some((p) => p.slug === slug);
  if (exists) {
    res.status(409).json({ error: "Page slug already exists" });
    return;
  }

  const page = {
    pageId: newId("p"),
    slug,
    title,
    metaDescription: "",
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    twitterCard: "",
    draft: [...DEFAULT_BLOCKS],
    published: null,
    publishedAt: null,
  };

  site.pages.push(page);
  site.markModified("pages");
  await site.save();

  res.status(201).json({ page: serializePage(page) });
};

exports.removePage = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;

  await migrateLegacySiteToPages(site);

  const pid = req.params.pageId;
  const idx = site.pages.findIndex((p) => p.pageId === pid);
  if (idx === -1) {
    res.status(404).json({ error: "Page not found" });
    return;
  }
  const page = site.pages[idx];
  if (page.slug === "home") {
    res.status(400).json({ error: "Cannot delete the Home page" });
    return;
  }
  if (site.pages.length <= 1) {
    res.status(400).json({ error: "Site must keep at least one page" });
    return;
  }

  site.pages.splice(idx, 1);
  site.markModified("pages");
  await site.save();
  res.json({ ok: true });
};

exports.getById = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;

  await migrateLegacySiteToPages(site);

  const pages = site.pages.map((p) => serializePage(p));
  const publishedAtTs = sitePublishedTimestamp(site.toObject({ flattenMaps: true }));
  const anyPub = pages.some((p) => p.published != null);
  const redirects = Array.isArray(site.redirects)
    ? site.redirects.map((r) => ({ from: r.from, to: r.to, code: r.code === 302 ? 302 : 301 }))
    : [];
  const analyticsHeadHtml =
    typeof site.analyticsHeadHtml === "string" ? site.analyticsHeadHtml : "";
  const organizationName =
    typeof site.organizationName === "string" ? site.organizationName : "";
  const organizationUrl =
    typeof site.organizationUrl === "string" ? site.organizationUrl : "";
  const organizationLogoUrl =
    typeof site.organizationLogoUrl === "string" ? site.organizationLogoUrl : "";
  const formWebhookUrl = typeof site.formWebhookUrl === "string" ? site.formWebhookUrl : "";
  const formWebhookSecret =
    typeof site.formWebhookSecret === "string" ? site.formWebhookSecret : "";
  const robotsTxtPolicy =
    site.robotsTxtPolicy === "disallow_with_allow" ? "disallow_with_allow" : "allow_with_disallow";
  const robotsTxtPaths = Array.isArray(site.robotsTxtPaths) ? [...site.robotsTxtPaths] : [];

  const primaryDomain = await Domain.findOne({
    siteId: site._id,
    is_primary: true,
    verification_status: "active",
  })
    .select("hostname")
    .lean();
  const primaryPublishHostname =
    primaryDomain && typeof primaryDomain.hostname === "string" ? primaryDomain.hostname.trim() : null;

  const canRollbackPublish = site.pages.some(
    (p) => p.publishedPrevious != null && isBlocks(p.publishedPrevious),
  );

  const bloomNav = bloomNavFromDoc(site);

  res.json({
    site: {
      id: site._id.toString(),
      name: site.name,
      subdomain: site.subdomain,
      disabled: !!site.disabled,
      templateSlug: typeof site.templateSlug === "string" && site.templateSlug ? site.templateSlug : "default",
      templateVersion:
        typeof site.templateVersion === "string" && site.templateVersion ? site.templateVersion : "1",
      tagline: typeof site.tagline === "string" ? site.tagline : "",
      contentLanguage:
        typeof site.contentLanguage === "string" ? sanitizeContentLanguage(site.contentLanguage) : "en",
      geoRegion: typeof site.geoRegion === "string" ? sanitizeGeoRegion(site.geoRegion) : "",
      ...bloomNav,
      pages,
      canRollbackPublish,
      redirects,
      analyticsHeadHtml,
      organizationName,
      organizationUrl,
      organizationLogoUrl,
      formWebhookUrl,
      formWebhookSecret,
      robotsTxtPolicy,
      robotsTxtPaths,
      primaryPublishHostname,
      platformPublishHostname: platformPublishHostnameForSubdomain(site.subdomain),
      previewPath: `/s/${site.subdomain}`,
      hostingerSubdomainStatus: site.hostingerSubdomainStatus || "manual_required",
      hostingerSubdomainNote: site.hostingerSubdomainNote || "",
      hostingerSubdomainAt: site.hostingerSubdomainAt ? site.hostingerSubdomainAt.getTime() : null,
      updatedAt: site.updatedAt ? site.updatedAt.getTime() : undefined,
      publishedAt: publishedAtTs,
      status: anyPub ? "Published" : "Draft",
    },
  });
};

exports.patch = async (req, res) => {
  const payload = req.body;
  const hasDraft = payload.draft_json !== undefined || payload.draft !== undefined;
  const hasRedirects =
    payload.redirects !== undefined && payload.redirects !== null && typeof payload.redirects === "object";
  const hasAnalytics = typeof payload.analyticsHeadHtml === "string";
  const hasOrgFields =
    typeof payload.organizationName === "string" ||
    typeof payload.organizationUrl === "string" ||
    typeof payload.organizationLogoUrl === "string";
  const hasFormWebhook =
    typeof payload.formWebhookUrl === "string" || typeof payload.formWebhookSecret === "string";
  const hasRobotsTxt =
    payload.robotsTxtPolicy !== undefined || payload.robotsTxtPaths !== undefined;
  const hasLocale =
    payload.contentLanguage !== undefined ||
    payload.geoRegion !== undefined ||
    payload.tagline !== undefined;
  const hasPagesOrder = Array.isArray(payload.pagesOrder);
  const bloomNavPatchKeys = [
    "bloomNavJournalLabel",
    "bloomNavAboutLabel",
    "bloomNavSubscribeLabel",
    "bloomNavIssueChip",
    "bloomNavSearchLabel",
    "bloomNavMenuLabel",
    "bloomNavSubBarAside",
  ];
  const hasBloomNav = bloomNavPatchKeys.some((k) => payload[k] !== undefined);
  if (
    !hasDraft &&
    payload.name === undefined &&
    !payload.pageMeta &&
    !hasRedirects &&
    !hasAnalytics &&
    !hasOrgFields &&
    !hasFormWebhook &&
    !hasRobotsTxt &&
    !hasLocale &&
    !hasPagesOrder &&
    !hasBloomNav
  ) {
    res.status(400).json({ error: "No updates" });
    return;
  }

  const site = await loadWritableSite(req, res);
  if (!site) return;

  await migrateLegacySiteToPages(site);

  if (payload.name !== undefined) {
    const nextName = String(payload.name).trim() || site.name;
    site.name = nextName;
  }

  if (payload.tagline !== undefined) {
    site.tagline = String(payload.tagline).trim().slice(0, 240);
    site.markModified("tagline");
  }

  if (hasBloomNav) {
    for (const k of bloomNavPatchKeys) {
      if (payload[k] !== undefined) {
        site[k] = sanitizeBloomNavField(payload[k]);
        site.markModified(k);
      }
    }
  }
  if (payload.contentLanguage !== undefined) {
    site.contentLanguage = sanitizeContentLanguage(payload.contentLanguage);
    site.markModified("contentLanguage");
  }
  if (payload.geoRegion !== undefined) {
    site.geoRegion = sanitizeGeoRegion(payload.geoRegion);
    site.markModified("geoRegion");
  }

  if (hasAnalytics) {
    site.analyticsHeadHtml = sanitizeAnalyticsHeadHtml(payload.analyticsHeadHtml);
    site.markModified("analyticsHeadHtml");
  }

  if (hasOrgFields) {
    if (typeof payload.organizationName === "string") {
      site.organizationName = sanitizeOrganizationName(payload.organizationName);
      site.markModified("organizationName");
    }
    if (typeof payload.organizationUrl === "string") {
      site.organizationUrl = sanitizeHttpUrlOptional(payload.organizationUrl);
      site.markModified("organizationUrl");
    }
    if (typeof payload.organizationLogoUrl === "string") {
      site.organizationLogoUrl = sanitizeOgImage(payload.organizationLogoUrl);
      site.markModified("organizationLogoUrl");
    }
  }

  if (hasFormWebhook) {
    if (typeof payload.formWebhookUrl === "string") {
      site.formWebhookUrl = sanitizeHttpUrlOptional(payload.formWebhookUrl);
      site.markModified("formWebhookUrl");
    }
    if (typeof payload.formWebhookSecret === "string") {
      site.formWebhookSecret = sanitizeFormWebhookSecret(payload.formWebhookSecret);
      site.markModified("formWebhookSecret");
    }
  }

  if (hasRobotsTxt) {
    const policyIn =
      typeof payload.robotsTxtPolicy === "string"
        ? payload.robotsTxtPolicy
        : site.robotsTxtPolicy || "allow_with_disallow";
    const pathsIn = Array.isArray(payload.robotsTxtPaths)
      ? payload.robotsTxtPaths
      : Array.isArray(site.robotsTxtPaths)
        ? site.robotsTxtPaths
        : [];
    const rv = sanitizeRobotsTxtPayload({ policy: policyIn, paths: pathsIn });
    site.robotsTxtPolicy = rv.policy;
    site.robotsTxtPaths = rv.paths;
    site.markModified("robotsTxtPolicy");
    site.markModified("robotsTxtPaths");
  }

  if (hasRedirects) {
    if (!Array.isArray(payload.redirects)) {
      res.status(400).json({ error: "redirects must be an array" });
      return;
    }
    if (payload.redirects.length > 30) {
      res.status(400).json({ error: "At most 30 redirect rules" });
      return;
    }
    const sanitizedRedirects = sanitizeRedirectList(payload.redirects, { max: 30 });
    const rv = validateRedirectRules(sanitizedRedirects);
    if (!rv.ok) {
      res.status(400).json({ error: rv.error });
      return;
    }
    site.redirects = sanitizedRedirects;
    site.markModified("redirects");
  }

  if (hasPagesOrder) {
    const wanted = payload.pagesOrder.map((x) => String(x));
    const currentIds = site.pages.map((p) => String(p.pageId));
    if (wanted.length !== currentIds.length || new Set(wanted).size !== wanted.length) {
      res.status(400).json({ error: "pagesOrder must list each page id exactly once" });
      return;
    }
    const byId = new Map(site.pages.map((p) => [String(p.pageId), p]));
    const next = [];
    for (const id of wanted) {
      const pg = byId.get(id);
      if (!pg) {
        res.status(400).json({ error: "Invalid page id in pagesOrder" });
        return;
      }
      next.push(pg);
    }
    site.pages = next;
    site.markModified("pages");
  }

  if (payload.pageMeta) {
    const {
      pageId,
      title,
      slug: nextSlug,
      metaDescription: nextMeta,
      ogTitle: ogT,
      ogDescription: ogD,
      ogImage: ogI,
      twitterCard: twC,
    } = payload.pageMeta;
    const page = pageId ? site.pages.find((p) => p.pageId === pageId) : null;
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    if (title !== undefined) {
      page.title = String(title).trim() || page.title;
    }
    if (nextMeta !== undefined) {
      page.metaDescription = String(nextMeta).trim().slice(0, 320);
    }
    if (ogT !== undefined) page.ogTitle = sanitizeOgTitle(ogT);
    if (ogD !== undefined) page.ogDescription = sanitizeOgDescription(ogD);
    if (ogI !== undefined) page.ogImage = sanitizeOgImage(ogI);
    if (twC !== undefined) page.twitterCard = sanitizeTwitterCard(twC);
    if (nextSlug !== undefined) {
      let sl = null;
      const core = slugifyPageSegment(nextSlug);
      if (page.slug === "home") {
        if (core !== "home") {
          res.status(400).json({ error: "Home page slug cannot be changed" });
          return;
        }
        sl = "home";
      } else if (core === "home") {
        sl = null;
      } else if (core && core.length >= 2) {
        sl = core;
      }
      if (!sl) {
        res.status(400).json({ error: "Invalid slug (use 2+ letters or numbers)" });
        return;
      }
      const taken = site.pages.some((p) => p.slug === sl && p.pageId !== page.pageId);
      if (taken) {
        res.status(409).json({ error: "Slug already in use" });
        return;
      }
      page.slug = sl;
    }
    site.markModified("pages");
  }

  if (hasDraft) {
    let nextDraft;
    if (payload.draft !== undefined) {
      if (!Array.isArray(payload.draft)) {
        res.status(400).json({ error: "draft must be an array" });
        return;
      }
      nextDraft = payload.draft;
    } else {
      const raw =
        typeof payload.draft_json === "string"
          ? payload.draft_json
          : JSON.stringify(payload.draft_json);
      try {
        nextDraft = JSON.parse(raw);
      } catch {
        res.status(400).json({ error: "draft_json must be valid JSON" });
        return;
      }
      if (!Array.isArray(nextDraft)) {
        res.status(400).json({ error: "draft must be an array JSON" });
        return;
      }
    }

    const pid = payload.pageId;
    const page = pid ? site.pages.find((p) => p.pageId === pid) : site.pages.find((p) => p.slug === "home");

    const target = page || site.pages[0];
    target.draft = nextDraft;
    site.markModified("pages");
  }

  await site.save();
  res.json({ ok: true, updatedAt: site.updatedAt ? site.updatedAt.getTime() : Date.now() });
};

exports.publish = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;
  if (rejectIfSiteSuspended(site, res)) return;

  await migrateLegacySiteToPages(site);

  const now = new Date();
  for (const p of site.pages) {
    if (!isBlocks(p.draft)) continue;
    if (p.published != null && isBlocks(p.published)) {
      p.publishedPrevious = structuredClone(p.published);
      p.publishedPreviousAt = p.publishedAt ? new Date(p.publishedAt) : now;
    } else {
      p.publishedPrevious = null;
      p.publishedPreviousAt = null;
    }
    p.published = stripEditorOnlyFromBlocks(structuredClone(p.draft));
    p.publishedAt = now;
  }
  site.publishedAt = now;
  site.markModified("pages");
  await site.save();

  try {
    await recordPublishRevision(site._id, new mongoose.Types.ObjectId(req.userId), site);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[publish] history record failed:", err.message || err);
  }

  let hostinger = null;
  try {
    hostinger = await provisionPlatformSubdomainForPublish(site);
  } catch (err) {
    hostinger = {
      ok: false,
      message: err?.message || "Hostinger subdomain setup failed",
      fqdn: platformFqdnForSubdomain(site.subdomain),
    };
  }

  const fresh = await Site.findById(site._id).lean();

  res.json({
    ok: true,
    publishedAt: now.getTime(),
    canRollbackPublish: site.pages.some(
      (p) => p.publishedPrevious != null && isBlocks(p.publishedPrevious),
    ),
    hostinger,
    liveUrl: fresh ? `https://${platformFqdnForSubdomain(fresh.subdomain)}` : null,
    previewUrl: fresh ? `/s/${fresh.subdomain}` : null,
    hostingerSubdomainStatus: fresh?.hostingerSubdomainStatus || site.hostingerSubdomainStatus,
    hostingerSubdomainNote: fresh?.hostingerSubdomainNote || "",
  });
};

exports.rollbackPublish = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;
  if (rejectIfSiteSuspended(site, res)) return;

  await migrateLegacySiteToPages(site);

  let any = false;
  let maxTs = 0;
  for (const p of site.pages) {
    if (p.publishedPrevious != null && isBlocks(p.publishedPrevious)) {
      any = true;
      p.published = stripEditorOnlyFromBlocks(structuredClone(p.publishedPrevious));
      p.publishedAt = p.publishedPreviousAt ? new Date(p.publishedPreviousAt) : p.publishedAt;
      p.publishedPrevious = null;
      p.publishedPreviousAt = null;
    }
    const t = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
    if (t > maxTs) maxTs = t;
  }

  if (!any) {
    res.status(400).json({ error: "No previous publish to restore" });
    return;
  }

  site.publishedAt = maxTs ? new Date(maxTs) : site.publishedAt;
  site.markModified("pages");
  await site.save();

  res.json({
    ok: true,
    publishedAt: maxTs || Date.now(),
    canRollbackPublish: false,
  });
};

exports.listPublishHistory = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;

  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 30)));
  const rows = await PublishRevision.find({ siteId: site._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("createdAt pagesSnapshot")
    .lean();

  const revisions = rows.map((r) => {
    const pages = Array.isArray(r.pagesSnapshot) ? r.pagesSnapshot : [];
    return {
      id: r._id.toString(),
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : null,
      pageCount: pages.length,
      slugPreview: pages
        .slice(0, 4)
        .map((p) => p.slug)
        .filter(Boolean)
        .join(", "),
    };
  });

  res.json({ revisions });
};

exports.restorePublishRevision = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;
  if (rejectIfSiteSuspended(site, res)) return;

  let revisionId;
  try {
    revisionId = new mongoose.Types.ObjectId(req.params.revisionId);
  } catch {
    res.status(404).json({ error: "Revision not found" });
    return;
  }

  const rev = await PublishRevision.findOne({ _id: revisionId, siteId: site._id }).lean();
  if (!rev) {
    res.status(404).json({ error: "Revision not found" });
    return;
  }

  await migrateLegacySiteToPages(site);
  applyRevisionSnapshotToSite(site, rev);
  await site.save();

  const publishedAtTs = site.publishedAt ? new Date(site.publishedAt).getTime() : Date.now();

  res.json({
    ok: true,
    publishedAt: publishedAtTs,
    canRollbackPublish: site.pages.some(
      (p) => p.publishedPrevious != null && isBlocks(p.publishedPrevious),
    ),
  });
};

exports.listLeads = async (req, res) => {
  const site = await loadWritableSite(req, res);
  if (!site) return;

  const rows = await FormSubmission.find({ siteId: site._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    leads: rows.map((r) => ({
      id: r._id.toString(),
      subdomain: r.subdomain,
      pageSlug: r.pageSlug,
      email: r.email,
      message: r.message,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : null,
    })),
  });
};
