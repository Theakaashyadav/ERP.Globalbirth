const mongoose = require("mongoose");

const salarySlipSchema = new mongoose.Schema({
  slipNumber: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, index: true },
  month: Number,
  year: Number,
  periodKey: String,
  values: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  removedFields: { type: [String], default: [] },
  customDeductions: { type: [{ _id: false, label: String, amount: Number }], default: [] },
  totals: {
    totalEarning: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 }
  },
  generatedBy: { type: String, default: "HR" }
}, { timestamps: true });

// Existing slips without a periodKey remain readable until HR saves them.
salarySlipSchema.index({ periodKey: 1 }, { unique: true, partialFilterExpression: { periodKey: { $type: "string" } } });

module.exports = mongoose.models.SalarySlip || mongoose.model("SalarySlip", salarySlipSchema);
