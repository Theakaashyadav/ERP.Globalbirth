const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

test("one-time cleanup checks all identities, preserves Suren, and notifies Govind only after commit", async () => {
  const originalLoad = Module._load;
  const targetId = "SHEET92B4F1A6BDC64100";
  const employee = { employeeId: "EMP497248", fullName: "Govind Kumar", department: "Sales", designation: "Executive", status: "Active", teamLeadId: "EMP730253", pushToken: "token" };
  const leads = [
    { _id: "keep", leadId: targetId, name: "Suren", phone: "+919953820028", assignedEmployeeId: "EMP524098",
      sheetSpreadsheetId: "sheet-id", sheetTabId: 42, sheetRowNumber: 7,
      sheetFields: { full_name: "Suren", phone_number: "+919953820028", "Assigned Employee": "Old Employee", "GlobalOne Notification Status": "Accepted" },
      sheetFieldOrder: ["full_name", "phone_number", "Assigned Employee", "GlobalOne Notification Status"],
      attempts: [{ connected: true }], followUpHistory: [{ remark: "Called" }], archivedAt: null },
    ...Array.from({ length: 60 }, (_, index) => ({ _id: `remove-${index}`, leadId: `OTHER${index}`, name: "Other", phone: "9876543210" }))
  ];
  let pushCount = 0;
  let committed = false;
  let startSessionCount = 0;
  const query = value => ({ session() { return this; }, lean: async () => structuredClone(value()) });
  const mocks = {
    mongoose: { startSession: async () => {
      startSessionCount += 1;
      return { withTransaction: async callback => { await callback(); committed = true; }, endSession: async () => {} };
    } },
    "../models/Lead": {
      find: () => query(() => leads),
      updateOne: async (filter, update) => {
        const lead = leads.find(item => item._id === filter._id && item.assignedEmployeeId === filter.assignedEmployeeId);
        if (!lead) return { matchedCount: 0 };
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.startsWith("sheetFields.")) lead.sheetFields[key.slice("sheetFields.".length)] = value;
          else lead[key] = structuredClone(value);
        }
        return { matchedCount: 1 };
      },
      deleteMany: async filter => {
        const previous = leads.length;
        for (let index = leads.length - 1; index >= 0; index -= 1) if (leads[index]._id !== filter._id.$ne) leads.splice(index, 1);
        return { deletedCount: previous - leads.length };
      }
    },
    "../models/Employee": { findOne: criteria => query(() =>
      Object.entries(criteria).every(([key, value]) => employee[key] === value) ? employee : null) },
    "../db/connection": { connectDatabase: async () => {} },
    "./push-notification.service": { sendLeadAssignment: async (recipient, lead) => {
      assert.equal(committed, true, "push must wait until the transaction commits");
      assert.equal(recipient.employeeId, "EMP497248");
      assert.equal(lead.assignedEmployeeId, "EMP497248");
      pushCount += 1;
      return true;
    } }
  };
  Module._load = function(request, parent, isMain) {
    if (parent?.filename.endsWith("lead-cleanup.service.js") && Object.hasOwn(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { retainSurenAndAssignGovind } = require("../src/server/services/lead-cleanup.service");
    const request = { leadId: targetId, name: "suren", phone: "9953820028", employeeId: "EMP497248", expectedCount: 61 };
    const preview = await retainSurenAndAssignGovind({ ...request, dryRun: true });
    assert.equal(preview.success, true);
    assert.equal(preview.data.wouldDelete, 60);
    assert.equal(preview.data.sheetRowNumber, 7);
    assert.equal(leads.length, 61);
    assert.equal(startSessionCount, 0);
    assert.equal(pushCount, 0);

    const temporary = leads.pop();
    const countDrift = await retainSurenAndAssignGovind({ ...request, dryRun: true });
    assert.equal(countDrift.success, false);
    assert.match(countDrift.message, /found 60/);
    leads.push(temporary);
    temporary.name = "Suren";
    temporary.phone = "9953820028";
    const duplicateCustomer = await retainSurenAndAssignGovind({ ...request, dryRun: true });
    assert.equal(duplicateCustomer.success, false);
    assert.match(duplicateCustomer.message, /exactly one record/);
    temporary.name = "Other";
    temporary.phone = "9876543210";
    employee.status = "Inactive";
    const inactiveEmployee = await retainSurenAndAssignGovind({ ...request, dryRun: true });
    assert.equal(inactiveEmployee.success, false);
    employee.status = "Active";

    const wrongCount = await retainSurenAndAssignGovind({ ...request, expectedCount: 60, confirmation: `DELETE 60 LEADS KEEP ${targetId}` });
    assert.equal(wrongCount.success, false);
    assert.equal(leads.length, 61);
    const wrongIdentity = await retainSurenAndAssignGovind({ ...request, leadId: "OTHER0", confirmation: `DELETE 60 LEADS KEEP ${targetId}` });
    assert.equal(wrongIdentity.success, false);
    assert.equal(leads.length, 61);

    const result = await retainSurenAndAssignGovind({ ...request, confirmation: `DELETE 60 LEADS KEEP ${targetId}` });
    assert.equal(result.success, true);
    assert.equal(result.data.deleted, 60);
    assert.equal(result.data.after, 1);
    assert.equal(result.data.previousEmployeeId, "EMP524098");
    assert.equal(result.data.sheetTabId, 42);
    assert.equal(result.data.notificationStatus, "Accepted");
    assert.equal(result.data.sheetNeedsReconciliation, true);
    assert.equal(leads.length, 1);
    assert.equal(leads[0].leadId, targetId);
    assert.equal(leads[0].assignedEmployeeId, "EMP497248");
    assert.equal(leads[0].marketingAssignedTlId, "EMP730253");
    assert.equal(leads[0].assignmentStage, "Executive");
    assert.equal(leads[0].sheetFields["Assigned Employee"], "Govind Kumar");
    assert.equal(leads[0].sheetFields["GlobalOne Notification Status"], "Accepted");
    assert.equal(leads[0].attempts.length, 1);
    assert.equal(leads[0].followUpHistory.length, 1);
    assert.equal(pushCount, 1);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../src/server/services/lead-cleanup.service")];
  }
});
