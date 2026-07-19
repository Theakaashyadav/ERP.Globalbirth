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
    gpsVerified: {
      type: Boolean,
      default: false
    },
    gpsLatitude: {
      type: Number,
      default: null
    },
    gpsLongitude: {
      type: Number,
      default: null
    },
    gpsAccuracy: {
      type: Number,
      default: null
    },
    officeDistanceMeter: {
      type: Number,
      default: null
    },
    allowedRadiusMeter: {
      type: Number,
      default: null
    },
    officeVerified: {
      type: Boolean,
      default: false
    },
    attendanceSource: {
      type: String,
      default: "web-gps",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

attendanceRecordSchema.index({ employeeId: 1, attendanceDate: 1 }, { unique: true });

module.exports = mongoose.models.AttendanceRecord || mongoose.model("AttendanceRecord", attendanceRecordSchema);
