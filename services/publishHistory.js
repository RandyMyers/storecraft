const PublishRevision = require("../models/PublishRevision");
const { stripEditorOnlyFromBlocks } = require("./sitePages");

const DEFAULT_MAX = 50;

function snapshotPagesFromSite(site) {
  const pages = Array.isArray(site.pages) ? site.pages : [];
  return pages.map((p) => ({
    pageId: p.pageId,
    slug: p.slug,
    title: p.title,
    metaDescription: typeof p.metaDescription === "string" ? p.metaDescription : "",
    ogTitle: typeof p.ogTitle === "string" ? p.ogTitle : "",
    ogDescription: typeof p.ogDescription === "string" ? p.ogDescription : "",
    ogImage: typeof p.ogImage === "string" ? p.ogImage : "",
    twitterCard: typeof p.twitterCard === "string" ? p.twitterCard : "",
    published: p.published != null ? stripEditorOnlyFromBlocks(structuredClone(p.published)) : null,
    publishedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : null,
  }));
}

/**
 * Persist post-publish snapshot and trim oldest rows beyond PUBLISH_HISTORY_MAX.
 */
async function recordPublishRevision(siteId, userId, siteMongooseDoc) {
  const pagesSnapshot = snapshotPagesFromSite(siteMongooseDoc);
  await PublishRevision.create({
    siteId,
    userId,
    pagesSnapshot,
  });

  const max = Math.min(200, Math.max(5, Number(process.env.PUBLISH_HISTORY_MAX || DEFAULT_MAX)));
  const overflow = await PublishRevision.find({ siteId })
    .sort({ createdAt: -1 })
    .skip(max)
    .select("_id")
    .lean();

  if (overflow.length > 0) {
    await PublishRevision.deleteMany({ _id: { $in: overflow.map((x) => x._id) } });
  }
}

/**
 * Apply a revision snapshot to a writable Site document (matched by pageId).
 */
function applyRevisionSnapshotToSite(site, revisionLean) {
  const snap = Array.isArray(revisionLean.pagesSnapshot) ? revisionLean.pagesSnapshot : [];
  const byPageId = new Map(snap.map((row) => [row.pageId, row]));

  let maxTs = 0;
  for (const p of site.pages) {
    const row = byPageId.get(p.pageId);
    if (!row) continue;

    p.published =
      row.published != null ? stripEditorOnlyFromBlocks(structuredClone(row.published)) : null;
    p.publishedAt = row.publishedAt ? new Date(row.publishedAt) : null;
    p.publishedPrevious = null;
    p.publishedPreviousAt = null;

    const t = p.publishedAt ? p.publishedAt.getTime() : 0;
    if (t > maxTs) maxTs = t;
  }

  site.publishedAt = maxTs ? new Date(maxTs) : site.publishedAt;
  site.markModified("pages");
}

module.exports = {
  snapshotPagesFromSite,
  recordPublishRevision,
  applyRevisionSnapshotToSite,
};
