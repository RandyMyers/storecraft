const Template = require("../models/Template");
const { SITE_TEMPLATES } = require("../data/siteTemplates");

exports.list = async (_req, res) => {
  const rows = await Template.find({ isActive: true }).sort({ sortOrder: 1, slug: 1 }).lean();
  const templates = rows.map((doc) => {
    const seed = SITE_TEMPLATES[doc.slug];
    const pageCount = seed?.pages?.length ?? 0;
    return {
      slug: doc.slug,
      label: doc.label,
      description: typeof doc.description === "string" ? doc.description : "",
      version: typeof doc.version === "string" ? doc.version : "1",
      sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
      category: typeof doc.category === "string" ? doc.category : "",
      thumbnailUrl: typeof doc.thumbnailUrl === "string" ? doc.thumbnailUrl : "",
      pageCount,
    };
  });
  res.json({ templates });
};
