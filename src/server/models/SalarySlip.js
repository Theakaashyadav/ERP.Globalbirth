const mongoose = require("mongoose");

const salarySlipSchema = new mongoose.Schema({
  slipNumber: { type: String, required: true, unique: true, index: true },
  values: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  removedFields: { type: [String], default: [] },
  totals: {
    totalEarning: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 }
  },
  generatedBy: { type: String, default: "HR" }
}, { timestamps: true });

module.exports = mongoose.models.SalarySlip || mongoose.model("SalarySlip", salarySlipSchema);
