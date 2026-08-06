const mongoose = require("mongoose");
const announcementSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  sentByRole: { type: String, required: true, enum: ["admin", "hr", "marketing", "ceo"] },
  sentByName: { type: String, default: "" },
  allEmployees: { type: Boolean, default: true },
  targetDepartments: { type: [String], default: [] },
  targetEmployeeIds: { type: [String], default: [] },
  readByEmployeeIds: { type: [String], default: [] }
}, { timestamps: true });
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });
module.exports = mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
