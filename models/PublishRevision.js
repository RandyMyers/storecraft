const mongoose = require("mongoose");

/**
 * Immutable snapshot of all pages’ published payloads after a successful site publish (Phase 7).
 */
const publishRevisionSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Array of plain objects: pageId, slug, SEO fields, published blocks, publishedAt ISO */
    pagesSnapshot: { type: [mongoose.Schema.Types.Mixed], required: true },
  },
  { timestamps: true },
);

publishRevisionSchema.index({ siteId: 1, createdAt: -1 });

publishRevisionSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.PublishRevision || mongoose.model("PublishRevision", publishRevisionSchema);
