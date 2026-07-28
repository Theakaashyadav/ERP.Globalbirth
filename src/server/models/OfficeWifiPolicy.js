const mongoose = require("mongoose");

const officeSchema = new mongoose.Schema({
  officeId: { type: String, required: true },
  name: { type: String, required: true },
  ssid: { type: String, default: "" },
  bssid: { type: String, default: "" },
  privateIp: { type: String, default: "" },
  ipPrefix: { type: String, default: "" },
  active: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  submittedByEmployeeId: { type: String, default: "" },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null }
}, { _id: false });

const officeWifiPolicySchema = new mongoose.Schema({
  policyKey: { type: String, unique: true, default: "office-wifi" },
  offices: { type: [officeSchema], default: [] },
  exemptEmployeeIds: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.OfficeWifiPolicy || mongoose.model("OfficeWifiPolicy", officeWifiPolicySchema);
