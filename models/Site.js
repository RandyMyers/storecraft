const mongoose = require("mongoose");

const redirectSchema = new mongoose.Schema(
  {
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    code: { type: Number, enum: [301, 302], default: 301 },
  },
  { _id: false },
);

const pageSchema = new mongoose.Schema(
  {
    pageId: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: String, default: "Home", trim: true },
    /** Short summary for SERP snippets (SEO §9 MVP). Max 320 in API; no hard schema max. */
    metaDescription: { type: String, default: "", trim: true },
    ogTitle: { type: String, default: "", trim: true },
    ogDescription: { type: String, default: "", trim: true },
    /** Absolute https URL or root-relative path; resolved against canonical when published. */
    ogImage: { type: String, default: "", trim: true },
    twitterCard: { type: String, default: "", trim: true },
    draft: { type: mongoose.Schema.Types.Mixed, default: [] },
    published: { type: mongoose.Schema.Types.Mixed, default: null },
    publishedAt: { type: Date, default: null },
    /** One-level rollback: snapshot before last publish (§10 MVP). */
    publishedPrevious: { type: mongoose.Schema.Types.Mixed, default: null },
    publishedPreviousAt: { type: Date, default: null },
  },
  { _id: false },
);

const siteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },

    /** Starter from `GET /api/templates` — snapshot at creation. */
    templateSlug: { type: String, default: "default", lowercase: true, trim: true },
    templateVersion: { type: String, default: "1", trim: true },

    /** Short subtitle for masthead templates (Bloom, etc.). */
    tagline: { type: String, default: "", trim: true },

    /** Bloom template header chrome — optional overrides (empty = template default copy). */
    bloomNavJournalLabel: { type: String, default: "", trim: true },
    bloomNavAboutLabel: { type: String, default: "", trim: true },
    bloomNavSubscribeLabel: { type: String, default: "", trim: true },
    bloomNavIssueChip: { type: String, default: "", trim: true },
    bloomNavSearchLabel: { type: String, default: "", trim: true },
    bloomNavMenuLabel: { type: String, default: "", trim: true },
    bloomNavSubBarAside: { type: String, default: "", trim: true },

    /** BCP 47 language for `<html lang>` + hreflang groundwork (default en). */
    contentLanguage: { type: String, default: "en", trim: true },

    /** ISO 3166-1 alpha-2 region code for `<meta name="geo.region">` when set (e.g. PT, JP). */
    geoRegion: { type: String, default: "", trim: true },

    pages: { type: [pageSchema], default: [] },

    /** @deprecated Migrate into pages[0] — retained for backwards compatibility on old documents. */
    draft: { type: mongoose.Schema.Types.Mixed },
    published: { type: mongoose.Schema.Types.Mixed },

    /** Last full-site publish (max of pages); also used for dashboard when pages exist. */
    publishedAt: { type: Date, default: null },

    /**
     * Gen-1 shared hosting: `{subdomain}` on PLATFORM_PUBLISH_DOMAIN.
     * live = publish URL serves platform SPA + theme; hosting_pending = DNS ok but wrong vhost/docroot.
     */
    hostingerSubdomainStatus: {
      type: String,
      enum: ["manual_required", "provisioned", "hosting_pending", "live", "failed"],
      default: "manual_required",
    },
    hostingerSubdomainNote: { type: String, default: "", trim: true },
    hostingerSubdomainAt: { type: Date, default: null },

    /** Path redirects (published paths only — see public redirect resolver). Max ~30 enforced in API. */
    redirects: { type: [redirectSchema], default: [] },

    /**
     * Optional HTML pasted by owner (typically external analytics script tags — integrations MVP).
     * Injected only on published viewer routes; sanitized for length/NUL bytes only.
     */
    analyticsHeadHtml: { type: String, default: "" },

    /** Optional Organization entity for JSON-LD (schema.org) on published pages. */
    organizationName: { type: String, default: "", trim: true },
    organizationUrl: { type: String, default: "", trim: true },
    organizationLogoUrl: { type: String, default: "", trim: true },

    /** POST JSON on Form block submissions (§7 integrations MVP). Not exposed on public site JSON. */
    formWebhookUrl: { type: String, default: "", trim: true },
    formWebhookSecret: { type: String, default: "", trim: true },

    /**
     * Published robots.txt (Phase 9). Safe presets + bounded path list — see server/lib/robotsTxt.js.
     */
    robotsTxtPolicy: {
      type: String,
      enum: ["allow_with_disallow", "disallow_with_allow"],
      default: "allow_with_disallow",
    },
    robotsTxtPaths: { type: [String], default: [] },

    /** When true, published viewer, forms, sitemap, and redirects return errors (Phase 12 admin). */
    disabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

siteSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Site || mongoose.model("Site", siteSchema);
