const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  role: { type: String, enum: ["admin", "hr", "marketing"], required: true, unique: true, index: true },
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  displayName: { type: String, required: true, trim: true }
}, { timestamps: true });
module.exports = mongoose.model("DashboardCredential", schema);
