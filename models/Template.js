const mongoose = require("mongoose");

/**
 * Gallery + entitlement metadata for site starters (seed pages still live in `data/siteTemplates.js` until moved).
 */
const templateSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    version: { type: String, default: "1", trim: true },
    /** HTTPS URL or site-relative path e.g. `/templates/default/thumb.svg` */
    thumbnailUrl: { type: String, default: "", trim: true },
    category: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Template || mongoose.model("Template", templateSchema);
