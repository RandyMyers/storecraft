const mongoose = require("mongoose");

/**
 * Internal operator accounts for `/api/admin/*` (separate from end-user `User`).
 */
const adminAccountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

adminAccountSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.models.AdminAccount || mongoose.model("AdminAccount", adminAccountSchema);
