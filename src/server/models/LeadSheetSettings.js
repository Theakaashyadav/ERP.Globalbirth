const mongoose = require("mongoose");

const leadSheetSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "lead-sheet" },
  sheetUrl: { type: String, default: "" },
  spreadsheetId: { type: String, default: "" },
  sheetTabId: { type: Number, default: null },
  employeeIds: { type: [String], default: [] },
  webhookSecret: { type: String, default: "" },
  nextEmployeeIndex: { type: Number, default: 0 },
  lastWebhookAt: { type: Date, default: null },
  lastWebhookStatus: { type: String, default: "" },
  lastSyncAt: { type: Date, default: null },
  lastError: { type: String, default: "" },
  lastImportedCount: { type: Number, default: 0 },
  lastPendingCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.LeadSheetSettings || mongoose.model("LeadSheetSettings", leadSheetSettingsSchema);
