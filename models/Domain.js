const mongoose = require("mongoose");

const domainSchema = new mongoose.Schema(
  {
    siteId: { type: mongoose.Schema.Types.ObjectId, ref: "Site", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hostname: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["platform_subdomain", "custom_domain"],
      default: "custom_domain",
    },
    verification_method: { type: String, default: "dns_txt", trim: true },
    verification_token: { type: String, required: true, trim: true },
    verification_status: {
      type: String,
      enum: ["pending", "verifying", "active", "failed"],
      default: "pending",
    },
    ssl_status: {
      type: String,
      enum: ["pending", "ssl_pending", "active", "failed"],
      default: "pending",
    },
    is_primary: { type: Boolean, default: false },
    /** Set when verification TXT was pushed via Hostinger DNS API */
    hostingerTxtApplied: { type: Boolean, default: false },
    hostingerTxtLastError: { type: String, default: "", trim: true },
    last_checked_at: { type: Date, default: null },
    failure_reason: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

domainSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.models.Domain || mongoose.model("Domain", domainSchema);
