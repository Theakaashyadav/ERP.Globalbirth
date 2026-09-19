const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const Lead = require("../models/Lead");
const { connectDatabase } = require("../db/connection");
const { sendLeadAssignment } = require("./push-notification.service");

// This action is for the single, explicitly requested September 2026 cleanup.
// Remove its controller registration after production execution and verification.
const TARGET = Object.freeze({
  leadId: "SHEET92B4F1A6BDC64100",
  name: "suren",
  phone: "9953820028",
  employeeId: "EMP497248",
  employeeName: "Govind Kumar"
});
const MAX_EXPECTED_COUNT = 10000;

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function folded(value) {
  return String(value || "").trim().toLowerCase();
}

function validRequest(payload) {
  return payload && payload.leadId === TARGET.leadId &&
    folded(payload.name) === TARGET.name && digits(payload.phone) === TARGET.phone &&
    payload.employeeId === TARGET.employeeId && Number.isSafeInteger(payload.expectedCount) &&
    payload.expectedCount >= 2 && payload.expectedCount <= MAX_EXPECTED_COUNT &&
    (payload.dryRun === true || payload.confirmation === `DELETE ${payload.expectedCount - 1} LEADS KEEP ${TARGET.leadId}`);
}

async function readAndValidate(expectedCount, session) {
  const leadQuery = Lead.find({});
  if (session) leadQuery.session(session);
  const leads = await leadQuery.lean();
  if (leads.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} leads; found ${leads.length}. No leads were changed.`);
  }
  const matchingPeople = leads.filter(lead => folded(lead.name) === TARGET.name && digits(lead.phone) === TARGET.phone);
  const matchingIds = leads.filter(lead => lead.leadId === TARGET.leadId);
  if (matchingPeople.length !== 1 || matchingIds.length !== 1 || matchingPeople[0]._id.toString() !== matchingIds[0]._id.toString()) {
    throw new Error("Suren's lead ID, name, and phone do not identify exactly one record. No leads were changed.");
  }
  const employeeQuery = Employee.findOne({ employeeId: TARGET.employeeId, status: "Active", department: "Sales", designation: "Executive" });
  if (session) employeeQuery.session(session);
  const employee = await employeeQuery.lean();
  if (!employee || folded(employee.fullName) !== folded(TARGET.employeeName)) {
    throw new Error("Govind Kumar is not an active Sales Executive with the expected employee ID. No leads were changed.");
  }
  return { lead: matchingIds[0], employee, count: leads.length };
}

function preview({ lead, employee, count }) {
  return {
    before: count,
    wouldDelete: count - 1,
    keeperLeadId: lead.leadId,
    keeperName: lead.name,
    keeperPhone: digits(lead.phone),
    previousEmployeeId: lead.assignedEmployeeId || "",
    assignedEmployeeId: employee.employeeId,
    assignedEmployeeName: employee.fullName,
    sheetSpreadsheetId: lead.sheetSpreadsheetId || "",
    sheetTabId: lead.sheetTabId ?? null,
    sheetRowNumber: lead.sheetRowNumber ?? null
  };
}

async function retainSurenAndAssignGovind(payload = {}) {
  if (!validRequest(payload)) {
    return { success: false, message: "Exact lead and employee, expectedCount from 2 to 10000, and matching execution confirmation are required." };
  }
  await connectDatabase();
  if (payload.dryRun === true) {
    try {
      return { success: true, data: { ...preview(await readAndValidate(payload.expectedCount)), dryRun: true }, message: "Dry run passed; no records were changed." };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // MongoDB transactions are required here. If the deployment does not support
  // them, fail closed instead of risking a partially deleted collection.
  let committed;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const state = await readAndValidate(payload.expectedCount, session);
      const { lead, employee } = state;
      const assignedAt = new Date();
      const sheetFields = lead.sheetFields instanceof Map ? Object.fromEntries(lead.sheetFields) : { ...(lead.sheetFields || {}) };
      sheetFields["Assigned Employee"] = employee.fullName;
      sheetFields["Assigned Employee ID"] = employee.employeeId;
      sheetFields["GlobalOne Sharing Status"] = "Done";
      sheetFields["GlobalOne Notification Status"] = "Pending";
      const sheetFieldOrder = [...new Set([...(lead.sheetFieldOrder || []), ...Object.keys(sheetFields)])];
      const changes = {
        assignedEmployeeId: employee.employeeId,
        marketingAssignedTlId: employee.teamLeadId || "",
        assignmentStage: "Executive",
        assignedAt,
        archivedAt: null,
        archivedByEmployee: false,
        sharingStatus: "Done",
        notificationStatus: "Pending",
        notificationAttemptedAt: null,
        notificationAcceptedAt: null,
        sheetFields,
        sheetFieldOrder
      };
      const update = await Lead.updateOne(
        { _id: lead._id, leadId: TARGET.leadId, assignedEmployeeId: lead.assignedEmployeeId },
        { $set: changes },
        { session }
      );
      if (update.matchedCount !== 1) throw new Error("Suren's lead changed during cleanup. The transaction was cancelled.");
      const deleted = await Lead.deleteMany({ _id: { $ne: lead._id } }, { session });
      if (deleted.deletedCount !== payload.expectedCount - 1) {
        throw new Error("The deleted lead count changed during cleanup. The transaction was cancelled.");
      }
      const remainingQuery = Lead.find({});
      remainingQuery.session(session);
      const remaining = await remainingQuery.lean();
      if (remaining.length !== 1 || remaining[0].leadId !== TARGET.leadId ||
          remaining[0].assignedEmployeeId !== TARGET.employeeId) {
        throw new Error("Post-cleanup verification failed. The transaction was cancelled.");
      }
      committed = {
        ...preview(state),
        deleted: deleted.deletedCount,
        after: remaining.length,
        dryRun: false,
        lead: { ...lead, ...changes },
        employee
      };
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    return { success: false, message: error.message || "Cleanup transaction failed; no leads were changed." };
  } finally {
    await session.endSession();
  }

  const { lead: updatedLead, employee: assignedEmployee, ...resultData } = committed;
  const attemptedAt = new Date();
  let pushAccepted = false;
  try { pushAccepted = await sendLeadAssignment(assignedEmployee, updatedLead, "Admin"); }
  catch (error) { console.error("Govind lead reassignment push failed:", error); }
  const notificationStatus = pushAccepted ? "Accepted" : "Failed";
  try {
    const statusWrite = await Lead.updateOne(
      { _id: updatedLead._id, assignedEmployeeId: TARGET.employeeId },
      { $set: {
        notificationStatus,
        notificationAttemptedAt: attemptedAt,
        notificationAcceptedAt: pushAccepted ? new Date() : null,
        "sheetFields.GlobalOne Notification Status": notificationStatus
      } }
    );
    if (statusWrite.matchedCount !== 1) throw new Error("The retained lead could not be found for notification status update.");
  } catch (error) {
    return { success: true, data: { ...resultData,
      notificationStatus: "Pending", pushAccepted, sheetNeedsReconciliation: Boolean(updatedLead.sheetSpreadsheetId) },
    message: `Lead cleanup and reassignment committed, but notification status could not be saved: ${error.message}` };
  }
  return { success: true, data: { ...resultData,
    notificationStatus, pushAccepted, sheetNeedsReconciliation: Boolean(updatedLead.sheetSpreadsheetId) },
  message: "All other leads were deleted and Suren was assigned to Govind Kumar. Reconcile the Sheet owner columns if this lead came from Google Sheets." };
}

module.exports = { retainSurenAndAssignGovind };
