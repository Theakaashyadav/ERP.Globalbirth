const mongoose = require("mongoose");

const callAttemptSchema = new mongoose.Schema(
  {
    calledAt: {
      type: Date,
      required: true
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    connected: {
      type: Boolean,
      default: false
    },
    callStatus: {
      type: String,
      enum: ["Connected", "Not Connected"],
      default: "Not Connected"
    },
    externalCallId: {
      type: String,
      default: "",
      trim: true
    },
    source: {
      type: String,
      default: "manual",
      trim: true
    },
    remark: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: false
  }
);

const followUpHistorySchema = new mongoose.Schema(
  {
    employeeId: { type: String, default: "", trim: true },
    status: { type: String, default: "", trim: true },
    remark: { type: String, required: true, trim: true },
    nextFollowUpDate: { type: Date, default: null },
    meetingDate: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const leadSchema = new mongoose.Schema(
  {
    leadId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      default: "",
      trim: true
    },
    source: {
      type: String,
      default: "Admin",
      trim: true
    },
    assignedEmployeeId: {
      type: String,
      default: "",
      trim: true
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    marketingAssignedTlId: { type: String, default: "", trim: true },
    assignmentStage: { type: String, default: "TL", trim: true },
    firstCallDeadline: { type: Date, default: null },
    firstCallAt: { type: Date, default: null },
    securedAt: { type: Date, default: null },
    securedByEmployeeId: { type: String, default: "", trim: true },
    returnedToMarketingAt: { type: Date, default: null },
    status: {
      type: String,
      default: "New",
      trim: true
    },
    lastRemark: {
      type: String,
      default: "",
      trim: true
    },
    nextFollowUpDate: {
      type: Date,
      default: null
    },
    meetingDate: {
      type: Date,
      default: null
    },
    followUpHistory: {
      type: [followUpHistorySchema],
      default: []
    },
    attempts: {
      type: [callAttemptSchema],
      default: []
    },
    archivedByEmployee: {
      type: Boolean,
      default: false
    },
    archivedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

leadSchema.index({ assignedEmployeeId: 1, archivedAt: 1, assignedAt: -1 });
leadSchema.index({ phone: 1, assignedEmployeeId: 1 });

module.exports = mongoose.models.Lead || mongoose.model("Lead", leadSchema);
