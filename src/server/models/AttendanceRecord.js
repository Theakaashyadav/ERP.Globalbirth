const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true
    },
    attendanceDate: {
      type: Date,
      required: true
    },
    attendanceTime: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["Present", "Late", "Absent", "Leave"],
      default: "Present",
      trim: true
    },
    remark: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    versionKey: false
  }
);

attendanceRecordSchema.index({ employeeId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.models.AttendanceRecord || mongoose.model("AttendanceRecord", attendanceRecordSchema);
