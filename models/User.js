const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** Stored tier slug — must match `Plan.slug` (see `/api/plans`). */
    subscriptionPlan: { type: String, default: "free", lowercase: true, trim: true },
    /** When paid access ends (ISO stored). Null/undefined ⇒ treated as no active paid period for non-free. */
    subscriptionPaidThrough: { type: Date, default: null },
    /** Last activated billing term: `monthly` | `quarterly` | `yearly` or unset. */
    subscriptionBillingInterval: { type: String, default: null, trim: true, lowercase: true },
  },
  { timestamps: true },
);


userSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
