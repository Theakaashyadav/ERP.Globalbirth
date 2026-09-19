const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");
const { employeeSheetData } = require("../src/server/services/lead-sheet-fields");

test("employee projection keeps changing questions and hides only Meta tracking and GlobalOne controls", () => {
  const fields = {
    id: "123", created_time: "2026-09-19", campaign_name: "Autumn", form_name: "Homes",
    full_name: "Asha Customer", phone_number: "9876543210", city: "Delhi", lead_status: "New",
    "You are looking for this property for?": "Family",
    "Preferred budget range": "50-70 lakh", "A new question without punctuation": "Yes",
    "Assigned Employee": "Sales One", "GlobalOne Sharing Status": "Done",
    "GlobalOne Notification Status": "Accepted", "GlobalOne Synced Hash": "abc",
    "campaign_name (2)": "Duplicate Meta column", "GlobalOne Sharing Status (2)": "Done"
  };
  const result = employeeSheetData(fields, Object.keys(fields));
  assert.deepEqual(result.sheetFieldOrder, [
    "full_name", "phone_number", "city", "lead_status",
    "You are looking for this property for?", "Preferred budget range", "A new question without punctuation"
  ]);
  assert.equal(result.sheetFields["Preferred budget range"], "50-70 lakh");
  assert.equal(result.sheetFields.id, undefined);
  assert.equal(result.sheetFields["GlobalOne Synced Hash"], undefined);
});

test("employee lead API shows questions while marketing retains the complete source row", async () => {
  const originalLoad = Module._load;
  const employee = { employeeId: "EMP1", fullName: "Asha", status: "Active", department: "Sales", designation: "Executive" };
  const sheetFields = {
    id: "meta-1", campaign_name: "Autumn", full_name: "Customer One", phone_number: "9876543210",
    "What property use?": "Family", "A new question": "Yes", "Assigned Employee": "Asha",
    "GlobalOne Sharing Status": "Done", "GlobalOne Notification Status": "Accepted"
  };
  const lead = { leadId: "SHEETAAAAAAAAAAAAAAAA", name: "Customer One", phone: "9876543210",
    assignedEmployeeId: "EMP1", assignedAt: new Date(), archivedAt: null, sheetFields,
    sheetFieldOrder: Object.keys(sheetFields), sheetSourceKey: "sheet:row:2", sharingStatus: "Done", notificationStatus: "Accepted",
    attempts: [], followUpHistory: [] };
  const query = value => ({ select() { return this; }, sort() { return this; }, lean: async () => structuredClone(value) });
  const mocks = {
    "../models/Employee": { findOne: () => query(employee), find: () => query([employee]) },
    "../models/Lead": { find: () => query([lead]) },
    "../models/AttendanceRecord": {},
    "../db/connection": { connectDatabase: async () => {} },
    "../security/dashboard-session": {},
    "./dashboard-credential.service": {},
    "./office-wifi.service": {},
    "./push-notification.service": {},
    "./mobile-feature.service": { hasEmployeeFeature: async () => true }
  };
  Module._load = function(request, parent, isMain) {
    if (parent?.filename.endsWith("attendance.service.js") && mocks[request]) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { getEmployeeLeads, getMarketingLeadDashboard } = require("../src/server/services/attendance.service");
    const employeeResult = await getEmployeeLeads({ employeeId: "EMP1" });
    assert.equal(employeeResult.success, true);
    assert.deepEqual(employeeResult.data[0].sheetFieldOrder, ["full_name", "phone_number", "What property use?", "A new question"]);
    assert.equal(employeeResult.data[0].sheetFields.id, undefined);
    const marketingResult = await getMarketingLeadDashboard();
    assert.equal(marketingResult.success, true);
    assert.equal(marketingResult.data.leads[0].sheetFields.id, "meta-1");
    assert.equal(marketingResult.data.leads[0].sheetFields["GlobalOne Sharing Status"], "Done");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../src/server/services/attendance.service")];
  }
});

test("Apps Script webhook authenticates the configured Sheet and assigns each row once", async () => {
  const originalLoad = Module._load;
  const originalCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let settings = null;
  const leads = [];
  const notifications = [];
  let pushSucceeds = true;
  const people = [
    { employeeId: "EMP1", fullName: "Asha", department: "Sales", designation: "Executive", status: "Active", teamLeadId: "" },
    { employeeId: "EMP2", fullName: "Ravi", department: "Sales", designation: "TL", status: "Active", teamLeadId: "" }
  ];
  const query = value => ({
    select() { return this; }, sort() { return this; }, lean: async () => structuredClone(value)
  });
  const mocks = {
    "../models/Employee": {
      find: criteria => query(people.filter(person =>
        (!criteria.employeeId || criteria.employeeId.$in.includes(person.employeeId)) &&
        (!criteria.status || criteria.status === person.status))),
      findOne: criteria => query(people.find(person => person.employeeId === criteria.employeeId) || null)
    },
    "../models/Lead": {
      findOne: criteria => query(leads.find(lead => Object.entries(criteria).every(([key, value]) => lead[key] === value)) || null),
      create: async values => {
        if (leads.some(lead => lead.sheetSourceKey === values.sheetSourceKey)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        const lead = { ...structuredClone(values), _id: String(leads.length + 1) };
        leads.push(lead);
        return { toObject: () => structuredClone(lead) };
      },
      updateOne: async (criteria, update) => Object.assign(leads.find(lead => lead._id === criteria._id), update.$set)
    },
    "../models/LeadSheetSettings": {
      findOne: () => query(settings),
      findOneAndUpdate: (criteria, update, options) => {
        const previous = structuredClone(settings);
        settings = { ...settings, ...update.$set, nextEmployeeIndex: (settings?.nextEmployeeIndex || 0) + (update.$inc?.nextEmployeeIndex || 0) };
        return query(options?.new === false ? previous : settings);
      },
      updateOne: async (criteria, update) => { settings = { ...settings, ...update.$set }; }
    },
    "../db/connection": { connectDatabase: async () => {} },
    "./push-notification.service": { sendLeadAssignment: async employee => { notifications.push(employee.employeeId); return pushSucceeds; } }
  };
  Module._load = function(request, parent, isMain) {
    if (parent?.filename.endsWith("lead-sheet.service.js") && mocks[request]) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { updateLeadSheetSettings, getLeadSheetSettings, receiveLeadSheetWebhook } = require("../src/server/services/lead-sheet.service");
    const saved = await updateLeadSheetSettings({ sheetUrl: "https://docs.google.com/spreadsheets/d/test123/edit?gid=0#gid=42", employeeIds: ["EMP1", "EMP2"] });
    assert.equal(saved.success, true);
    assert.equal(settings.sheetTabId, 42, "the visible tab in #gid takes precedence over an older query gid");
    assert.match(saved.data.webhookSecret, /^[a-f0-9]{64}$/);
    assert.equal((await getLeadSheetSettings()).data.webhookSecret, saved.data.webhookSecret);
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "{invalid-json";
    assert.equal((await getLeadSheetSettings()).success, true, "Apps Script settings cannot require a Google service account");
    if (originalCredentials === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalCredentials;
    const payload = {
      secret: saved.data.webhookSecret, spreadsheetId: "test123", sheetTabId: 42, rowNumber: 2,
      headers: ["full_name", "phone_number", "Campaign", "Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID"],
      values: ["Customer One", "+91 98765 43210", "Meta September", "", "", "SHEETAAAAAAAAAAAAAAAA"]
    };
    assert.equal((await receiveLeadSheetWebhook({ ...payload, secret: "0".repeat(64) })).statusCode, 401);
    assert.equal((await receiveLeadSheetWebhook({ ...payload, spreadsheetId: "another" })).statusCode, 403);
    assert.equal(settings.lastWebhookStatus, "error");
    assert.ok(settings.lastWebhookAt instanceof Date);
    assert.equal((await receiveLeadSheetWebhook({ ...payload, sheetTabId: 43 })).statusCode, 403);
    assert.equal(leads.length, 0);
    const first = await receiveLeadSheetWebhook(payload);
    assert.equal(first.success, true);
    assert.equal(first.data.status, "assigned");
    assert.equal(first.data.sharingStatus, "Done");
    assert.equal(first.data.notificationStatus, "Accepted");
    assert.equal(first.data.assignedEmployeeId, "EMP1");
    assert.equal(first.data.assignedEmployeeName, "Asha");
    assert.equal(first.data.leadId, "SHEETAAAAAAAAAAAAAAAA", "the script's prewritten ID becomes the saved lead ID");
    assert.equal(leads[0].sheetSourceKey, "test123:42:globalone:SHEETAAAAAAAAAAAAAAAA");
    assert.equal(leads[0].phone, "9876543210");
    assert.equal(leads[0].sheetFields.Campaign, "Meta September");
    assert.equal(leads[0].sheetFields["Assigned Employee"], "Asha");
    assert.equal(leads[0].sheetFields["GlobalOne Sharing Status"], "Done");
    assert.equal(leads[0].sharingStatus, "Done");
    assert.equal(leads[0].notificationStatus, "Accepted");
    assert.equal(leads[0].sheetFieldOrder.length, payload.headers.length + 2);
    assert.equal(settings.lastWebhookStatus, "assigned");
    assert.ok(settings.lastWebhookAt instanceof Date);
    const second = await receiveLeadSheetWebhook(payload);
    assert.equal(second.data.status, "existing");
    assert.equal(second.data.assignedEmployeeId, "EMP1");
    const writtenBack = await receiveLeadSheetWebhook({ ...payload, values: ["Customer One", "+91 98765 43210", "Meta September", "Asha", "EMP1", first.data.leadId] });
    assert.equal(writtenBack.data.status, "existing");
    assert.equal(writtenBack.data.leadId, first.data.leadId);
    assert.equal(leads.length, 1);
    assert.deepEqual(notifications, ["EMP1"]);
    const nextValues = ["Customer Two", "+91 98765 43211", "Meta September", "", "", "SHEETBBBBBBBBBBBBBBBB"];
    const next = await receiveLeadSheetWebhook({ ...payload, rowNumber: 3, values: nextValues });
    assert.equal(next.data.assignedEmployeeId, "EMP2");
    assert.equal(next.data.leadId, "SHEETBBBBBBBBBBBBBBBB");
    const movedFirst = await receiveLeadSheetWebhook({ ...payload, rowNumber: 3, values: ["Customer One", "+91 98765 43210", "Meta September", "Asha", "EMP1", first.data.leadId] });
    const movedSecond = await receiveLeadSheetWebhook({ ...payload, rowNumber: 2, values: ["Customer Two", "+91 98765 43211", "Meta September", "Ravi", "EMP2", next.data.leadId] });
    assert.equal(movedFirst.data.assignedEmployeeId, "EMP1", "sorts must preserve the first lead's owner");
    assert.equal(movedSecond.data.assignedEmployeeId, "EMP2", "sorts must preserve the second lead's owner");
    assert.equal(leads[0].sheetRowNumber, 3);
    assert.equal(leads[1].sheetRowNumber, 2);
    const copiedId = await receiveLeadSheetWebhook({ ...payload, rowNumber: 2, values: ["Wrong Customer", "+91 98765 43219", "Meta September", "", "", first.data.leadId] });
    assert.equal(copiedId.statusCode, 409, "a copied ID cannot overwrite another person's saved lead");
    const movedEdited = await receiveLeadSheetWebhook({ ...payload, rowNumber: 9, values: ["Changed Customer", "+91 98765 43210", "Meta September", "", "", first.data.leadId] });
    assert.equal(movedEdited.statusCode, 409, "a moved row must retain the same original source values");
    assert.equal(leads[0].name, "Customer One");
    const correctedPhone = await receiveLeadSheetWebhook({ ...payload, rowNumber: 3, values: ["Customer One", "+91 98765 43333", "Meta September", "Asha", "EMP1", first.data.leadId] });
    assert.equal(correctedPhone.data.status, "existing", "a same-row phone correction should update the same lead");
    assert.equal(leads[0].phone, "9876543333");
    const inserted = await receiveLeadSheetWebhook({ ...payload, rowNumber: 2, values: ["Inserted Customer", "+91 98765 43212", "Meta September", "", "", "SHEETCCCCCCCCCCCCCCCC"] });
    assert.equal(inserted.data.status, "assigned");
    assert.equal(inserted.data.leadId, "SHEETCCCCCCCCCCCCCCCC");
    assert.equal(leads[0].assignedEmployeeId, "EMP1");
    assert.equal(leads[1].assignedEmployeeId, "EMP2");
    assert.equal(leads.length, 3);
    leads.push({ _id: "legacy", leadId: "SHEETEEEEEEEEEEEEEEEE", sheetSourceKey: "test123:42:row:8", sheetSpreadsheetId: "test123", sheetTabId: 42, sheetRowNumber: 8,
      sheetFields: { full_name: "Legacy Customer", phone_number: "9876543200", Campaign: "Old" }, phone: "9876543200", name: "Legacy Customer", assignedEmployeeId: "EMP1", sheetFieldOrder: ["full_name", "phone_number", "Campaign"] });
    const insertedWithoutId = await receiveLeadSheetWebhook({ ...payload, rowNumber: 8, values: ["Another Customer", "9876543201", "New Campaign", "", "", ""] });
    assert.equal(insertedWithoutId.data.status, "assigned", "a new row must not inherit a former row occupant's owner");
    assert.notEqual(insertedWithoutId.data.leadId, "SHEETEEEEEEEEEEEEEEEE");
    assert.equal(leads.find(lead => lead._id === "legacy").name, "Legacy Customer");
    assert.match(leads.find(lead => lead.leadId === insertedWithoutId.data.leadId).sheetSourceKey, /:row:8:content:/);
    assert.equal((await receiveLeadSheetWebhook({ ...payload, rowNumber: 5, values: ["Wrong ID", "+91 98765 43214", "Meta September", "", "", "NOT-A-GLOBALONE-ID"] })).statusCode, 409);
    leads.push({ _id: "cross-sheet", leadId: "SHEETDDDDDDDDDDDDDDDD", sheetSpreadsheetId: "another", sheetTabId: 42, sheetFields: {}, assignedEmployeeId: "EMP1" });
    assert.equal((await receiveLeadSheetWebhook({ ...payload, rowNumber: 5, values: ["Wrong Sheet", "+91 98765 43214", "Meta September", "", "", "SHEETDDDDDDDDDDDDDDDD"] })).statusCode, 409);
    const invalidPhone = await receiveLeadSheetWebhook({ ...payload, rowNumber: 4, values: ["Customer Three", "123", "Meta September", "", "", ""] });
    assert.equal(invalidPhone.data.status, "pending");
    assert.equal(invalidPhone.data.sharingStatus, "Not Done");
    assert.equal(leads.length, 6);
    const changedQuestionHeaders = [...payload.headers, "What property use?", "When can you visit?", "GlobalOne Sharing Status", "GlobalOne Notification Status", "GlobalOne Synced Hash"];
    const changedQuestion = await receiveLeadSheetWebhook({ ...payload, rowNumber: 3,
      headers: changedQuestionHeaders,
      values: ["Customer One", "+91 98765 43333", "Meta September", "Asha", "EMP1", first.data.leadId, "Family", "Sunday", "Done", "Accepted", "new-hash"] });
    assert.equal(changedQuestion.data.status, "existing");
    assert.equal(changedQuestion.data.assignedEmployeeId, "EMP1");
    assert.equal(leads[0].sheetFields["When can you visit?"], "Sunday");
    assert.deepEqual(leads[0].sheetFieldOrder.slice(-5), changedQuestionHeaders.slice(-5));
    assert.deepEqual(notifications, ["EMP1", "EMP2", "EMP1", "EMP2"], "question changes must not resend accepted notifications");
    pushSucceeds = false;
    const failedPush = await receiveLeadSheetWebhook({ ...payload, rowNumber: 10,
      values: ["Customer Four", "9876543215", "Meta September", "", "", "SHEETFFFFFFFFFFFFFFFF"] });
    assert.equal(failedPush.data.sharingStatus, "Done", "a saved assignment is shared even when FCM fails");
    assert.equal(failedPush.data.notificationStatus, "Failed");
    const failedLead = leads.find(item => item.leadId === failedPush.data.leadId);
    assert.equal(failedLead.sharingStatus, "Done");
    assert.equal(failedLead.notificationStatus, "Failed");
    const attemptsBeforeCooldown = notifications.length;
    const immediateRetry = await receiveLeadSheetWebhook({ ...payload, rowNumber: 10,
      values: ["Customer Four", "9876543215", "Meta September", "", "", "SHEETFFFFFFFFFFFFFFFF"] });
    assert.equal(immediateRetry.data.status, "existing");
    assert.equal(immediateRetry.data.assignedEmployeeId, failedPush.data.assignedEmployeeId);
    assert.equal(notifications.length, attemptsBeforeCooldown, "a one-minute script retry cannot spam FCM");
    failedLead.notificationAttemptedAt = new Date(Date.now() - 6 * 60 * 1000);
    pushSucceeds = true;
    const recoveredPush = await receiveLeadSheetWebhook({ ...payload, rowNumber: 10,
      values: ["Customer Four", "9876543215", "Meta September", "", "", "SHEETFFFFFFFFFFFFFFFF"] });
    assert.equal(recoveredPush.data.notificationStatus, "Accepted");
    assert.equal(recoveredPush.data.assignedEmployeeId, failedPush.data.assignedEmployeeId);
    assert.equal(notifications.length, attemptsBeforeCooldown + 1);
    await receiveLeadSheetWebhook({ ...payload, rowNumber: 10,
      values: ["Customer Four", "9876543215", "Meta September", "", "", "SHEETFFFFFFFFFFFFFFFF"] });
    assert.equal(notifications.length, attemptsBeforeCooldown + 1, "accepted FCM notification is idempotent");
    const replaced = await updateLeadSheetSettings({ sheetUrl: "https://docs.google.com/spreadsheets/d/new-sheet/edit#gid=42", employeeIds: ["EMP1", "EMP2"] });
    assert.notEqual(replaced.data.webhookSecret, saved.data.webhookSecret);
    assert.equal((await receiveLeadSheetWebhook(payload)).statusCode, 401, "old script secrets must stop working after a Sheet change");
  } finally {
    Module._load = originalLoad;
    if (originalCredentials === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalCredentials;
    delete require.cache[require.resolve("../src/server/services/lead-sheet.service")];
  }
});
