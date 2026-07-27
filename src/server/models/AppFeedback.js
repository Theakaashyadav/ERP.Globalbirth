const mongoose = require("mongoose");

const appFeedbackSchema = new mongoose.Schema({
  employeeId: { type: String, default: "", trim: true, index: true },
  androidId: { type: String, default: "", trim: true },
  errorMessage: { type: String, required: true, trim: true, maxlength: 3000 },
  screen: { type: String, default: "Unknown screen", trim: true, maxlength: 150 },
  actionAttempted: { type: String, default: "Unknown action", trim: true, maxlength: 250 },
  appVersion: { type: String, default: "", trim: true, maxlength: 50 },
  deviceModel: { type: String, default: "", trim: true, maxlength: 150 },
  occurredAt: { type: Date, default: Date.now }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.AppFeedback || mongoose.model("AppFeedback", appFeedbackSchema);
