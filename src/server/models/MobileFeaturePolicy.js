const mongoose = require("mongoose");

const rolePolicySchema = new mongoose.Schema({
  role: { type: String, required: true, enum: ["tl", "executive", "hr", "backend"] },
  features: [{ type: String, enum: ["attendance", "leads", "profile"] }]
}, { _id: false });

const mobileFeaturePolicySchema = new mongoose.Schema({
  policyKey: { type: String, unique: true, default: "mobile-dashboard" },
  roles: { type: [rolePolicySchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.MobileFeaturePolicy || mongoose.model("MobileFeaturePolicy", mobileFeaturePolicySchema);
