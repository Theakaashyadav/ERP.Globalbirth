const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

test("verified push-token registration recovers assigned Sheet leads without changing their owner", async () => {
  const originalLoad = Module._load;
  const employee = { employeeId: "EMP497248", fullName: "Govind Kumar", registeredAndroidId: "govind-phone",
    status: "Active", pushToken: "" };
  const recentAttempt = new Date();
  const leads = [
    { _id: "suren", leadId: "SHEETSUREN", phone: "9953820028", assignedEmployeeId: employee.employeeId,
      source: "Google Sheet", sheetSourceKey: "sheet:row:2", notificationStatus: "Failed",
      notificationAttemptedAt: recentAttempt, sheetFields: { "GlobalOne Notification Status": "Failed" } },
    { _id: "manual", leadId: "MANUAL", assignedEmployeeId: employee.employeeId, source: "Admin",
      notificationStatus: "Failed", sheetFields: {} },
    { _id: "other", leadId: "OTHER", assignedEmployeeId: "EMPOTHER", source: "Google Sheet",
      sheetSourceKey: "sheet:row:3", notificationStatus: "Failed", sheetFields: {} }
  ];
  let acceptsPush = false;
  const sent = [];
  const query = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; },
    lean: async () => structuredClone(value) });
  const mocks = {
    "../models/Employee": {
      findOneAndUpdate: (criteria, update) => {
        if (criteria.employeeId !== employee.employeeId || criteria.registeredAndroidId !== employee.registeredAndroidId ||
            criteria.status !== employee.status) return query(null);
        const before = structuredClone(employee);
        employee.pushToken = update.$set.pushToken;
        return query(before);
      }
    },
    "../models/Lead": {
      find: criteria => query(leads.filter(lead => lead.assignedEmployeeId === criteria.assignedEmployeeId &&
        !lead.archivedAt && criteria.notificationStatus.$in.includes(lead.notificationStatus) &&
        (Boolean(lead.sheetSourceKey) || Boolean(lead.sheetSpreadsheetId) || lead.source === "Google Sheet"))),
      findOne: criteria => query(leads.find(lead => lead._id === criteria._id) || null),
      findOneAndUpdate: (criteria, update) => {
        const lead = leads.find(item => item._id === criteria._id && item.assignedEmployeeId === criteria.assignedEmployeeId);
        if (!lead || (criteria.notificationStatus?.$in && !criteria.notificationStatus.$in.includes(lead.notificationStatus))) return query(null);
        if (criteria.notificationAttemptedAt && new Date(lead.notificationAttemptedAt).getTime() !== criteria.notificationAttemptedAt.getTime()) return query(null);
        if (criteria.$or && !criteria.$or.some(condition =>
          (condition.notificationStatus && lead.notificationStatus === condition.notificationStatus) ||
          (condition.notificationAttemptedAt === null && !lead.notificationAttemptedAt) ||
          (condition.notificationAttemptedAt?.$exists === false && lead.notificationAttemptedAt === undefined) ||
          (condition.notificationAttemptedAt?.$lte && lead.notificationAttemptedAt &&
            new Date(lead.notificationAttemptedAt).getTime() <= condition.notificationAttemptedAt.$lte.getTime())
        )) return query(null);
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.startsWith("sheetFields.")) lead.sheetFields[key.slice("sheetFields.".length)] = value;
          else lead[key] = value;
        }
        return query(lead);
      }
    },
    "../db/connection": { connectDatabase: async () => {} },
    "./push-notification.service": {
      sendLeadAssignment: async (recipient, lead) => {
        sent.push({ employeeId: recipient.employeeId, token: recipient.pushToken, leadId: lead.leadId });
        return acceptsPush;
      }
    },
    "../models/AttendanceRecord": {},
    "../security/dashboard-session": {},
    "./dashboard-credential.service": {},
    "./office-wifi.service": {},
    "./mobile-feature.service": {}
  };
  Module._load = function(request, parent, isMain) {
    if ((parent?.filename.endsWith("attendance.service.js") || parent?.filename.endsWith("lead-sheet.service.js")) && mocks[request]) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { registerPushToken } = require("../src/server/services/attendance.service");
    const invalid = await registerPushToken({ employeeId: employee.employeeId, androidId: "wrong-phone", pushToken: "token-1" });
    assert.deepEqual(invalid, { success: false, message: "Device verification failed." });
    assert.equal(employee.pushToken, "");
    assert.equal(sent.length, 0);

    const [first, concurrent] = await Promise.all([
      registerPushToken({ employeeId: employee.employeeId, androidId: "govind-phone", pushToken: "token-1" }),
      registerPushToken({ employeeId: employee.employeeId, androidId: "govind-phone", pushToken: "token-1" })
    ]);
    assert.deepEqual(first, { success: true, message: "Push notifications enabled." });
    assert.deepEqual(concurrent, first);
    assert.deepEqual(sent, [{ employeeId: employee.employeeId, token: "token-1", leadId: "SHEETSUREN" }]);
    assert.equal(leads[0].notificationStatus, "Failed");
    assert.equal(leads[0].sheetFields["GlobalOne Notification Status"], "Failed");
    assert.equal(leads[0].assignedEmployeeId, employee.employeeId);

    await registerPushToken({ employeeId: employee.employeeId, androidId: "govind-phone", pushToken: "token-1" });
    assert.equal(sent.length, 1, "the same token respects the retry cooldown");

    acceptsPush = true;
    await registerPushToken({ employeeId: employee.employeeId, androidId: "govind-phone", pushToken: "token-2" });
    assert.equal(sent.length, 2, "a rotated token can immediately retry a recent failed push");
    assert.equal(sent[1].token, "token-2");
    assert.equal(leads[0].notificationStatus, "Accepted");
    assert.equal(leads[0].sheetFields["GlobalOne Notification Status"], "Accepted");
    assert.ok(leads[0].notificationAcceptedAt instanceof Date);
    assert.equal(leads[0].assignedEmployeeId, employee.employeeId);
    assert.equal(leads[1].notificationStatus, "Failed", "manual leads are outside Sheet recovery");
    assert.equal(leads[2].notificationStatus, "Failed", "another employee's lead is untouched");

    await registerPushToken({ employeeId: employee.employeeId, androidId: "govind-phone", pushToken: "token-3" });
    assert.equal(sent.length, 2, "accepted assignment notifications are never resent");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../src/server/services/attendance.service")];
    delete require.cache[require.resolve("../src/server/services/lead-sheet.service")];
  }
});
