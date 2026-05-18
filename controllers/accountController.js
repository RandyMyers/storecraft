const mongoose = require("mongoose");
const User = require("../models/User");
const Site = require("../models/Site");
const Domain = require("../models/Domain");
const FormSubmission = require("../models/FormSubmission");
const PublishRevision = require("../models/PublishRevision");
const PaymentRequest = require("../models/PaymentRequest");

function toIso(d) {
  if (!d) return null;
  const x = new Date(d).getTime();
  return Number.isNaN(x) ? null : new Date(d).toISOString();
}

function serializePageExport(p) {
  if (!p || typeof p !== "object") return p;
  return {
    pageId: p.pageId,
    slug: p.slug,
    title: p.title,
    metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : "",
    ogTitle: typeof p.ogTitle === "string" ? p.ogTitle : "",
    ogDescription: typeof p.ogDescription === "string" ? p.ogDescription : "",
    ogImage: typeof p.ogImage === "string" ? p.ogImage : "",
    twitterCard: typeof p.twitterCard === "string" ? p.twitterCard : "",
    draft: p.draft,
    published: p.published,
    publishedAt: toIso(p.publishedAt),
    publishedPrevious: p.publishedPrevious ?? null,
    publishedPreviousAt: toIso(p.publishedPreviousAt),
  };
}

function serializeSiteExport(s) {
  return {
    id: s._id.toString(),
    name: s.name,
    subdomain: s.subdomain,
    templateSlug: typeof s.templateSlug === "string" ? s.templateSlug : "",
    templateVersion: typeof s.templateVersion === "string" ? s.templateVersion : "",
    pages: Array.isArray(s.pages) ? s.pages.map(serializePageExport) : [],
    redirects: Array.isArray(s.redirects) ? s.redirects : [],
    analyticsHeadHtml: typeof s.analyticsHeadHtml === "string" ? s.analyticsHeadHtml : "",
    organizationName: typeof s.organizationName === "string" ? s.organizationName : "",
    organizationUrl: typeof s.organizationUrl === "string" ? s.organizationUrl : "",
    organizationLogoUrl: typeof s.organizationLogoUrl === "string" ? s.organizationLogoUrl : "",
    tagline: typeof s.tagline === "string" ? s.tagline : "",
    contentLanguage: typeof s.contentLanguage === "string" ? s.contentLanguage : "",
    geoRegion: typeof s.geoRegion === "string" ? s.geoRegion : "",
    formWebhookUrl: typeof s.formWebhookUrl === "string" ? s.formWebhookUrl : "",
    formWebhookSecret: typeof s.formWebhookSecret === "string" ? s.formWebhookSecret : "",
    publishedAt: toIso(s.publishedAt),
    createdAt: toIso(s.createdAt),
    updatedAt: toIso(s.updatedAt),
    legacyDraft: s.draft !== undefined ? s.draft : undefined,
    legacyPublished: s.published !== undefined ? s.published : undefined,
  };
}

function serializeDomainExport(d) {
  return {
    id: d._id.toString(),
    siteId: d.siteId.toString(),
    hostname: d.hostname,
    type: d.type,
    verification_method: d.verification_method,
    verification_token: d.verification_token,
    verification_status: d.verification_status,
    ssl_status: d.ssl_status,
    is_primary: Boolean(d.is_primary),
    last_checked_at: toIso(d.last_checked_at),
    failure_reason: d.failure_reason || "",
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function serializeSubmissionExport(r) {
  return {
    id: r._id.toString(),
    siteId: r.siteId.toString(),
    subdomain: r.subdomain,
    pageSlug: r.pageSlug,
    email: r.email,
    message: r.message,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

/**
 * GET — downloadable JSON of account-owned data (Phase G §21 export path).
 */
exports.exportData = async (req, res) => {
  const userOid = new mongoose.Types.ObjectId(req.userId);
  const user = await User.findById(userOid).lean();
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sites = await Site.find({ userId: userOid }).lean();
  const siteIds = sites.map((s) => s._id);

  const domains =
    siteIds.length > 0 ? await Domain.find({ siteId: { $in: siteIds } }).lean() : [];
  const formSubmissions =
    siteIds.length > 0
      ? await FormSubmission.find({ siteId: { $in: siteIds } }).sort({ createdAt: -1 }).limit(2000).lean()
      : [];

  const payload = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    product: "Nestpage",
    user: {
      id: user._id.toString(),
      email: user.email,
      subscriptionPlan: typeof user.subscriptionPlan === "string" ? user.subscriptionPlan : "free",
      subscriptionPaidThrough: toIso(user.subscriptionPaidThrough),
      createdAt: toIso(user.createdAt),
      updatedAt: toIso(user.updatedAt),
    },
    sites: sites.map(serializeSiteExport),
    domains: domains.map(serializeDomainExport),
    formSubmissions: formSubmissions.map(serializeSubmissionExport),
  };

  const safeName = String(user.email || "export")
    .replace(/[^a-z0-9@-_.]/gi, "_")
    .slice(0, 48);
  const filename = `nestpage-export-${safeName}-${Date.now()}.json`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`${JSON.stringify(payload, null, 2)}\n`);
};

/**
 * DELETE — remove user and owned data (Phase 11). Retention: none for listed collections;
 * API logs / CDN caches outside Mongo are out of scope.
 */
exports.deleteAccount = async (req, res) => {
  const userOid = new mongoose.Types.ObjectId(req.userId);
  const user = await User.findById(userOid).lean();
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sites = await Site.find({ userId: userOid }).select("_id").lean();
  const siteIds = sites.map((s) => s._id);

  await PaymentRequest.deleteMany({ userId: userOid });

  if (siteIds.length > 0) {
    await PublishRevision.deleteMany({
      $or: [{ siteId: { $in: siteIds } }, { userId: userOid }],
    });
    await FormSubmission.deleteMany({ siteId: { $in: siteIds } });
    await Domain.deleteMany({ siteId: { $in: siteIds } });
    await Site.deleteMany({ userId: userOid });
  }

  await User.deleteOne({ _id: userOid });

  res.json({ ok: true });
};
