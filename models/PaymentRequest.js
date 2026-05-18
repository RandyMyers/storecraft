const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedPlan: { type: String, required: true, lowercase: true, trim: true },
    /** Billing term the user selected (drives default extension on admin approve). */
    billingInterval: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      default: "monthly",
      index: true,
    },
    method: { type: String, enum: ["bank_transfer", "usdt"], required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    /** Payer reference: tx hash, wire ref, etc. */
    payerReference: { type: String, default: "", trim: true },
    /** Internal note from reviewer */
    adminNote: { type: String, default: "", trim: true },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentRequestSchema.set("toJSON", {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports =
  mongoose.models.PaymentRequest || mongoose.model("PaymentRequest", paymentRequestSchema);
