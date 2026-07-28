const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  releaseKey: { type: String, unique: true, default: "latest-android" },
  versionCode: { type: Number, required: true }, versionName: { type: String, required: true }, notes: { type: String, default: "" },
  mandatory: { type: Boolean, default: true }, sizeBytes: { type: Number, required: true }, sha256: { type: String, required: true },
  sourceUrl: { type: String, required: true }, releasedAt: { type: Date, required: true },
  allEmployees: { type: Boolean, default: true }, targetDepartments: { type: [String], default: [] }, targetEmployeeIds: { type: [String], default: [] }
}, { timestamps: true });
module.exports = mongoose.models.AppRelease || mongoose.model("AppRelease", schema);
