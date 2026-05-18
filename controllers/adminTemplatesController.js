const Template = require("../models/Template");
const Site = require("../models/Site");
const { SITE_TEMPLATES } = require("../data/siteTemplates");
const { getTemplateDefinition, sanitizeTemplateSlug } = require("../lib/siteTemplates");

const SLUG_RE = /^[a-z][a-z0-9-]{0,62}$/;

function sliceStr(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function starterMeta(slug) {
  const def = SITE_TEMPLATES[slug];
  if (!def) return { hasStarterDefinition: false, pageCount: 0 };
  return {
    hasStarterDefinition: def.isActive !== false,
    pageCount: Array.isArray(def.pages) ? def.pages.length : 0,
  };
}

function adminShape(doc, sitesCount) {
  const meta = starterMeta(doc.slug);
  return {
    id: String(doc._id),
    slug: doc.slug,
    label: doc.label,
    description: typeof doc.description === "string" ? doc.description : "",
    version: typeof doc.version === "string" ? doc.version : "1",
    thumbnailUrl: typeof doc.thumbnailUrl === "string" ? doc.thumbnailUrl : "",
    category: typeof doc.category === "string" ? doc.category : "",
    isActive: !!doc.isActive,
    sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    hasStarterDefinition: meta.hasStarterDefinition,
    pageCount: meta.pageCount,
    sitesCount: typeof sitesCount === "number" ? sitesCount : 0,
    isSeededBuiltin: Boolean(SITE_TEMPLATES[doc.slug]),
  };
}

async function sitesCountByTemplateSlug() {
  const rows = await Site.aggregate([
    {
      $project: {
        normSlug: {
          $let: {
            vars: {
              t: {
                $toLower: {
                  $trim: {
                    input: { $ifNull: ["$templateSlug", ""] },
                  },
                },
              },
            },
            in: {
              $cond: [{ $eq: ["$$t", ""] }, "default", "$$t"],
            },
          },
        },
      },
    },
    { $group: { _id: "$normSlug", count: { $sum: 1 } } },
  ]);
  /** @type {Record<string, number>} */
  const map = {};
  for (const row of rows) {
    const k = row._id ? String(row._id) : "default";
    map[k] = row.count;
  }
  return map;
}

/** GET /api/admin/templates */
exports.listAll = async (_req, res) => {
  const rows = await Template.find({}).sort({ sortOrder: 1, slug: 1 }).lean();
  const counts = await sitesCountByTemplateSlug();
  const templates = rows.map((doc) => adminShape(doc, counts[doc.slug] ?? 0));
  const existingSlugs = new Set(rows.map((r) => r.slug));
  const starterSlugsNotInCatalog = Object.keys(SITE_TEMPLATES).filter(
    (s) => SITE_TEMPLATES[s] && !existingSlugs.has(s),
  );
  res.json({ templates, starterSlugsNotInCatalog });
};

/** GET /api/admin/templates/:slug */
exports.getBySlug = async (req, res) => {
  const slug = sanitizeTemplateSlug(req.params.slug);
  const doc = await Template.findOne({ slug }).lean();
  if (!doc) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  const counts = await sitesCountByTemplateSlug();
  res.json({ template: adminShape(doc, counts[slug] ?? 0) });
};

/**
 * POST /api/admin/templates
 * Slug must exist in `SITE_TEMPLATES` so new sites can be provisioned from seeds.
 */
exports.create = async (req, res) => {
  const b = req.body && typeof req.body === "object" ? req.body : {};
  const slug = String(b.slug || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "");
  if (!slug || !SLUG_RE.test(slug)) {
    res.status(400).json({ error: "Invalid slug (lowercase letters, digits, hyphen; must start with a letter)" });
    return;
  }
  const seed = SITE_TEMPLATES[slug];
  if (!seed) {
    res.status(400).json({
      error:
        "No starter definition in server seeds for this slug. Add it to `server/data/siteTemplates.js` (SITE_TEMPLATES) first.",
    });
    return;
  }

  const label = sliceStr(b.label, 200);
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }

  const exists = await Template.findOne({ slug }).lean();
  if (exists) {
    res.status(409).json({ error: "A template with this slug already exists" });
    return;
  }

  const description = sliceStr(b.description, 4000);
  const version = sliceStr(b.version || seed.version || "1", 32);
  const thumbnailUrl = sliceStr(b.thumbnailUrl, 2000);
  const category = sliceStr(b.category, 120);
  const sortOrder = Math.floor(Number(b.sortOrder ?? seed.sortOrder ?? 0));

  const doc = await Template.create({
    slug,
    label,
    description,
    version,
    thumbnailUrl,
    category: category || "Starter",
    isActive: b.isActive === undefined ? true : Boolean(b.isActive),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  });

  res.status(201).json({ template: adminShape(doc.toObject({ flattenMaps: true }), 0) });
};

/** PATCH /api/admin/templates/:slug */
exports.patchBySlug = async (req, res) => {
  const slug = sanitizeTemplateSlug(req.params.slug);
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }
  const doc = await Template.findOne({ slug });
  if (!doc) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  if (b.label !== undefined) {
    const label = sliceStr(b.label, 200);
    if (!label) {
      res.status(400).json({ error: "label cannot be empty" });
      return;
    }
    doc.label = label;
  }
  if (b.description !== undefined) doc.description = sliceStr(b.description, 4000);
  if (b.version !== undefined) doc.version = sliceStr(b.version, 32);
  if (b.thumbnailUrl !== undefined) doc.thumbnailUrl = sliceStr(b.thumbnailUrl, 2000);
  if (b.category !== undefined) doc.category = sliceStr(b.category, 120);
  if (b.isActive !== undefined) doc.isActive = Boolean(b.isActive);
  if (b.sortOrder !== undefined) {
    const n = Math.floor(Number(b.sortOrder));
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "Invalid sortOrder" });
      return;
    }
    doc.sortOrder = n;
  }

  await doc.save();
  const counts = await sitesCountByTemplateSlug();
  res.json({ template: adminShape(doc.toObject({ flattenMaps: true }), counts[slug] ?? 0) });
};

/** DELETE /api/admin/templates/:slug — not allowed for built-in seeds or when sites reference it */
exports.removeBySlug = async (req, res) => {
  const slug = sanitizeTemplateSlug(req.params.slug);
  if (!slug) {
    res.status(400).json({ error: "Invalid slug" });
    return;
  }

  const doc = await Template.findOne({ slug });
  if (!doc) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  if (SITE_TEMPLATES[slug]) {
    res.status(400).json({
      error: "Cannot delete a built-in seeded template. Set isActive to false instead, or remove it from SITE_TEMPLATES and redeploy.",
    });
    return;
  }

  const counts = await sitesCountByTemplateSlug();
  const n = counts[slug] ?? 0;
  if (n > 0) {
    res.status(409).json({ error: `Cannot delete: ${n} site(s) use template "${slug}".` });
    return;
  }

  await Template.deleteOne({ _id: doc._id });
  res.status(204).end();
};
