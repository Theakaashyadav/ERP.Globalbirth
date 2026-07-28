const mongoose = require("mongoose");
const resultSchema = new mongoose.Schema({
  employeeId: String, name: String, department: String, designation: String,
  status: { type: String, enum: ["Pending", "Received", "Unavailable"], default: "Pending" }, message: { type: String, default: "" },
  totalCalls: { type: Number, default: 0 }, outgoingCalls: { type: Number, default: 0 }, incomingCalls: { type: Number, default: 0 }, missedCalls: { type: Number, default: 0 }, totalDurationSeconds: { type: Number, default: 0 },
  permissionAllowed: { type: Number, default: 0 }, permissionTotal: { type: Number, default: 11 }, receivedAt: Date
}, { _id: false });
const schema = new mongoose.Schema({ requestId: { type: String, required: true, unique: true }, date: { type: String, required: true }, results: { type: [resultSchema], default: [] }, expiresAt: { type: Date, required: true } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ "results.employeeId": 1, "results.status": 1, expiresAt: 1 });
module.exports = mongoose.models.CallLogRequest || mongoose.model("CallLogRequest", schema);
