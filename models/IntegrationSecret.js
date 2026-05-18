const mongoose = require("mongoose");

const integrationSecretSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    environment: { type: String, default: "production", trim: true },
    scope: { type: String, default: "platform", trim: true },
    encryptedValue: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: String, default: "v1", trim: true },
    last4: { type: String, default: "", trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ["active", "disabled"], default: "active", index: true },
    rotatedAt: { type: Date, default: null },
    testStatus: { type: String, default: "", trim: true },
    testCheckedAt: { type: Date, default: null },
    createdBy: { type: String, default: "", trim: true },
    updatedBy: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

integrationSecretSchema.index({ provider: 1, name: 1, environment: 1 });

module.exports =
  mongoose.models.IntegrationSecret || mongoose.model("IntegrationSecret", integrationSecretSchema);
