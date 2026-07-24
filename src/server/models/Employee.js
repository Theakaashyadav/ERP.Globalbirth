const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    pinHash: {
      type: String,
      required: true
    },
    email: {
      type: String,
      default: "",
      trim: true
    },
    dob: {
      type: Date,
      default: null
    },
    gender: {
      type: String,
      default: "",
      trim: true
    },
    address: {
      type: String,
      default: "",
      trim: true
    },
    department: {
      type: String,
      default: "",
      trim: true
    },
    designation: {
      type: String,
      default: "",
      trim: true
    },
    teamLeadId: {
      type: String,
      default: "",
      trim: true
    },
    joiningDate: {
      type: Date,
      default: null
    },
    salary: {
      type: Number,
      default: null
    },
    shift: {
      type: String,
      default: "",
      trim: true
    },
    status: {
      type: String,
      default: "Inactive",
      trim: true
    },
    registeredAndroidId: {
      type: String,
      default: "",
      trim: true
    },
    pushToken: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Employee || mongoose.model("Employee", employeeSchema);
