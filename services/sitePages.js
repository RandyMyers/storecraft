const { newId } = require("../lib/ids");
const { DEFAULT_BLOCKS } = require("../defaults/blocks");
const { sanitizeContentLanguage, sanitizeGeoRegion } = require("../lib/seoLocale");

function isBlocks(v) {
  return Array.isArray(v);
}

function pickBloomNavForPublic(siteLean) {
  const clip = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
  return {
    bloomNavJournalLabel: clip(siteLean.bloomNavJournalLabel),
    bloomNavAboutLabel: clip(siteLean.bloomNavAboutLabel),
    bloomNavSubscribeLabel: clip(siteLean.bloomNavSubscribeLabel),
    bloomNavIssueChip: clip(siteLean.bloomNavIssueChip),
    bloomNavSearchLabel: clip(siteLean.bloomNavSearchLabel),
    bloomNavMenuLabel: clip(siteLean.bloomNavMenuLabel),
    bloomNavSubBarAside: clip(siteLean.bloomNavSubBarAside),
  };
}

/** Remove editor-only keys before writing `published` (never expose in live HTML JSON). */
function stripEditorOnlyFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((b) => {
    if (!b || typeof b !== "object") return b;
    const { editorHidden, editorLocked, ...rest } = b;
    if (rest.type === "container" && Array.isArray(rest.children)) {
      return { ...rest, children: stripEditorOnlyFromBlocks(rest.children) };
    }
    if (
      (rest.type === "twoColumn" || rest.type === "threeColumn") &&
      Array.isArray(rest.columnChildren)
    ) {
      return {
        ...rest,
        columnChildren: rest.columnChildren.map((col) =>
          Array.isArray(col) ? stripEditorOnlyFromBlocks(col) : col,
        ),
      };
    }
    return rest;
  });
}

/**
 * Migrate legacy flat draft/published onto a single `home` page. Mutates mongoose doc + saves.
 */
async function migrateLegacySiteToPages(siteDoc) {
  if (siteDoc.pages && siteDoc.pages.length > 0) return siteDoc;

  const draft =
    siteDoc.draft != null && isBlocks(siteDoc.draft) && siteDoc.draft.length > 0
      ? [...siteDoc.draft]
      : [...DEFAULT_BLOCKS];
  const published = siteDoc.published != null && isBlocks(siteDoc.published) ? siteDoc.published : null;
  const publishedAtPage = published && siteDoc.publishedAt ? siteDoc.publishedAt : null;

  siteDoc.pages = [
    {
      pageId: newId("p"),
      slug: "home",
      title: "Home",
      metaDescription: "",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      twitterCard: "",
      draft,
      published,
      publishedAt: publishedAtPage,
    },
  ];

  siteDoc.set("draft", undefined);
  siteDoc.set("published", undefined);

  siteDoc.markModified("pages");
  await siteDoc.save();
  return siteDoc;
}

function summarizeSiteListing(sLean) {
  if (sLean.pages?.length) {
    const anyPub = sLean.pages.some((p) => p.published != null && Array.isArray(p.published));
    let maxTs = sLean.publishedAt ? new Date(sLean.publishedAt).getTime() : 0;
    for (const p of sLean.pages) {
      const t = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
      if (t > maxTs) maxTs = t;
    }
    return {
      updatedAt: sLean.updatedAt,
      publishedAt: anyPub ? maxTs || null : null,
      status: anyPub ? "Published" : "Draft",
      pageCount: sLean.pages.length,
    };
  }
  const anyPubLegacy = sLean.published != null && isBlocks(sLean.published);
  return {
    updatedAt: sLean.updatedAt,
    publishedAt: sLean.publishedAt ? new Date(sLean.publishedAt).getTime() : null,
    status: anyPubLegacy ? "Published" : "Draft",
    pageCount: sLean.draft != null || sLean.published != null ? 1 : 0,
  };
}

function siteStatusFromDoc(siteDocPlain) {
  if (siteDocPlain.pages?.length) {
    const anyPub = siteDocPlain.pages.some((p) => p.published != null && Array.isArray(p.published));
    return anyPub ? "Published" : "Draft";
  }
  return siteDocPlain.published != null && Array.isArray(siteDocPlain.published) ? "Published" : "Draft";
}

/** Last publish timestamp for dashboard ribbon. */
function sitePublishedTimestamp(siteDocPlain) {
  let maxTs = siteDocPlain.publishedAt ? new Date(siteDocPlain.publishedAt).getTime() : 0;
  if (siteDocPlain.pages?.length) {
    for (const p of siteDocPlain.pages) {
      const t = p.publishedAt ? new Date(p.publishedAt).getTime() : 0;
      if (t > maxTs) maxTs = t;
    }
  }
  return maxTs || null;
}

/** Response shape for one page into editor/API. */
function serializePage(page) {
  const p = typeof page.toObject === "function" ? page.toObject({ flattenMaps: true }) : page;
  return {
    pageId: p.pageId,
    slug: p.slug,
    title: p.title,
    metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : "",
    ogTitle: typeof p.ogTitle === "string" ? p.ogTitle : "",
    ogDescription: typeof p.ogDescription === "string" ? p.ogDescription : "",
    ogImage: typeof p.ogImage === "string" ? p.ogImage : "",
    twitterCard: typeof p.twitterCard === "string" ? p.twitterCard : "",
    draft: isBlocks(p.draft) ? p.draft : [],
    published: p.published != null && isBlocks(p.published) ? p.published : null,
    publishedAt: p.publishedAt ? new Date(p.publishedAt).getTime() : null,
  };
}

function pickPublishedForPublic(siteLean, slugRequest) {
  const slugWant = String(slugRequest || "home").toLowerCase();
  if (siteLean.pages?.length) {
    const pg =
      siteLean.pages.find((p) => p.slug === slugWant) ||
      siteLean.pages.find((p) => p.slug === "home") ||
      siteLean.pages[0];
    if (!pg || pg.published == null || !Array.isArray(pg.published)) return null;
    const analyticsHeadHtml =
      typeof siteLean.analyticsHeadHtml === "string" ? siteLean.analyticsHeadHtml : "";
    const organizationName =
      typeof siteLean.organizationName === "string" ? siteLean.organizationName : "";
    const organizationUrl =
      typeof siteLean.organizationUrl === "string" ? siteLean.organizationUrl : "";
    const organizationLogoUrl =
      typeof siteLean.organizationLogoUrl === "string" ? siteLean.organizationLogoUrl : "";
    return {
      name: siteLean.name,
      subdomain: siteLean.subdomain,
      templateSlug:
        typeof siteLean.templateSlug === "string" && siteLean.templateSlug
          ? siteLean.templateSlug
          : "default",
      templateVersion:
        typeof siteLean.templateVersion === "string" && siteLean.templateVersion
          ? siteLean.templateVersion
          : "1",
      tagline: typeof siteLean.tagline === "string" ? siteLean.tagline : "",
      contentLanguage: sanitizeContentLanguage(siteLean.contentLanguage),
      geoRegion: sanitizeGeoRegion(siteLean.geoRegion || ""),
      ...pickBloomNavForPublic(siteLean),
      analyticsHeadHtml,
      organizationName,
      organizationUrl,
      organizationLogoUrl,
      pageSlug: pg.slug,
      pageTitle: pg.title || pg.slug,
      metaDescription: typeof pg.metaDescription === "string" ? pg.metaDescription : "",
      ogTitle: typeof pg.ogTitle === "string" ? pg.ogTitle : "",
      ogDescription: typeof pg.ogDescription === "string" ? pg.ogDescription : "",
      ogImage: typeof pg.ogImage === "string" ? pg.ogImage : "",
      twitterCard: typeof pg.twitterCard === "string" ? pg.twitterCard : "",
      blocks: pg.published,
      publishedAt: pg.publishedAt ? new Date(pg.publishedAt).getTime() : null,
    };
  }
  if (
    slugWant === "home" &&
    siteLean.published != null &&
    Array.isArray(siteLean.published)
  ) {
    const analyticsHeadHtml =
      typeof siteLean.analyticsHeadHtml === "string" ? siteLean.analyticsHeadHtml : "";
    const organizationName =
      typeof siteLean.organizationName === "string" ? siteLean.organizationName : "";
    const organizationUrl =
      typeof siteLean.organizationUrl === "string" ? siteLean.organizationUrl : "";
    const organizationLogoUrl =
      typeof siteLean.organizationLogoUrl === "string" ? siteLean.organizationLogoUrl : "";
    return {
      name: siteLean.name,
      subdomain: siteLean.subdomain,
      templateSlug:
        typeof siteLean.templateSlug === "string" && siteLean.templateSlug
          ? siteLean.templateSlug
          : "default",
      templateVersion:
        typeof siteLean.templateVersion === "string" && siteLean.templateVersion
          ? siteLean.templateVersion
          : "1",
      tagline: typeof siteLean.tagline === "string" ? siteLean.tagline : "",
      contentLanguage: sanitizeContentLanguage(siteLean.contentLanguage),
      geoRegion: sanitizeGeoRegion(siteLean.geoRegion || ""),
      ...pickBloomNavForPublic(siteLean),
      analyticsHeadHtml,
      organizationName,
      organizationUrl,
      organizationLogoUrl,
      pageSlug: "home",
      pageTitle: "Home",
      metaDescription: "",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      twitterCard: "",
      blocks: siteLean.published,
      publishedAt: siteLean.publishedAt ? new Date(siteLean.publishedAt).getTime() : null,
    };
  }
  return null;
}

module.exports = {
  migrateLegacySiteToPages,
  summarizeSiteListing,
  siteStatusFromDoc,
  sitePublishedTimestamp,
  serializePage,
  pickPublishedForPublic,
  isBlocks,
  stripEditorOnlyFromBlocks,
};
