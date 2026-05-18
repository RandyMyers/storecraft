const Template = require("../models/Template");
const { SITE_TEMPLATES } = require("../data/siteTemplates");

/**
 * Upsert catalog rows from code registry so GET /api/templates is DB-backed.
 * Leave thumbnailUrl empty until admin uploads or set PUBLIC_TEMPLATE_THUMB_BASE.
 */
async function seedDefaultTemplates() {
  const thumbBase = String(process.env.PUBLIC_TEMPLATE_THUMB_BASE || "").trim().replace(/\/+$/, "");
  const defs = Object.values(SITE_TEMPLATES).filter((t) => t && t.isActive);
  for (const def of defs) {
    const thumbnailUrl =
      thumbBase !== "" ? `${thumbBase}/${encodeURIComponent(def.slug)}.jpg` : "";
    await Template.updateOne(
      { slug: def.slug },
      {
        $set: {
          slug: def.slug,
          label: def.label,
          description: def.description || "",
          version: def.version || "1",
          thumbnailUrl,
          category: "Starter",
          isActive: true,
          sortOrder: typeof def.sortOrder === "number" ? def.sortOrder : 0,
        },
      },
      { upsert: true },
    );
  }
}

module.exports = { seedDefaultTemplates };
