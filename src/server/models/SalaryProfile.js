const mongoose = require("mongoose");

const salaryProfileSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true, index: true },
  values: { type: mongoose.Schema.Types.Mixed, default: {} },
  removedFields: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.models.SalaryProfile || mongoose.model("SalaryProfile", salaryProfileSchema);
