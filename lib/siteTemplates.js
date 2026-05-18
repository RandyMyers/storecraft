const { SITE_TEMPLATES } = require("../data/siteTemplates");
const { newId } = require("./ids");

/**
 * @typedef {{ slug: string, title: string, draft: unknown[] }} TemplatePageSeed
 * @typedef {{ slug: string, label: string, description: string, version: string, isActive: boolean, sortOrder: number, pages: TemplatePageSeed[] }} SiteTemplateMeta
 */

function sanitizeTemplateSlug(raw) {
  const s = String(raw || "default")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "");
  return s || "default";
}

function getTemplateDefinition(slug) {
  const key = sanitizeTemplateSlug(slug);
  const def = SITE_TEMPLATES[key];
  if (!def || !def.isActive) return null;
  return def;
}

function listActiveTemplates() {
  return Object.values(SITE_TEMPLATES)
    .filter((t) => t.isActive)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * @param {SiteTemplateMeta} def
 * @returns {object[]} Mongoose-compatible `pages` subdocs
 */
function buildSitePagesFromTemplate(def) {
  return def.pages.map((p) => ({
    pageId: newId("p"),
    slug: String(p.slug || "home").toLowerCase().trim(),
    title: String(p.title || "Page").trim() || "Page",
    metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : "",
    ogTitle: typeof p.ogTitle === "string" ? p.ogTitle : "",
    ogDescription: typeof p.ogDescription === "string" ? p.ogDescription : "",
    ogImage: typeof p.ogImage === "string" ? p.ogImage : "",
    twitterCard: typeof p.twitterCard === "string" ? p.twitterCard : "",
    draft: JSON.parse(JSON.stringify(Array.isArray(p.draft) ? p.draft : [])),
    published: null,
    publishedAt: null,
  }));
}

module.exports = {
  getTemplateDefinition,
  listActiveTemplates,
  buildSitePagesFromTemplate,
  sanitizeTemplateSlug,
};
