const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const test = require("node:test");

test("Sheet sync assigns each valid row once, preserves every column, and writes the owner back", async () => {
  const originalLoad = Module._load;
  const originalFetch = global.fetch;
  const originalCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sheet-bot@example.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" })
  });
  let settings = {
    key: "lead-sheet", sheetUrl: "https://docs.google.com/spreadsheets/d/test123/edit#gid=0",
    spreadsheetId: "test123", sheetTabId: 0, employeeIds: ["EMP1", "EMP2"], nextEmployeeIndex: 0
  };
  const people = [
    { employeeId: "EMP1", fullName: "Asha", department: "Sales", designation: "Executive", status: "Active", teamLeadId: "" },
    { employeeId: "EMP2", fullName: "Ravi", department: "Sales", designation: "TL", status: "Active", teamLeadId: "" }
  ];
  const leads = [];
  let leadFindCount = 0;
  let leadUpdateCount = 0;
  let sheetPostCount = 0;
  const rows = [
    ["full_name", "phone_number", "lead_id", "Campaign Name", ""],
    ["Customer One", "9876543210", "META-1", "September Campaign", "extra value"],
    ["Customer Two", "+91 98765 43211", "META-2", "September Campaign", ""],
    ["Customer Three", "9876543212", "1234567890123456800", "September Campaign", ""],
    ["Customer Four", "9876543213", "1234567890123456800", "September Campaign", ""],
    ["Bad Number", "123", "META-3", "September Campaign", ""]
  ];
  const query = value => ({
    select() { return this; }, sort() { return this; },
    lean: async () => structuredClone(value)
  });
  const mocks = {
    "../models/Employee": {
      find: criteria => query(people.filter(person =>
        (!criteria.employeeId || criteria.employeeId.$in.includes(person.employeeId)) &&
        (!criteria.status || person.status === criteria.status))),
      findOne: criteria => query(people.find(person => person.employeeId === criteria.employeeId) || null)
    },
    "../models/Lead": {
      findOne: criteria => { leadFindCount += 1; return query(leads.find(lead => Object.entries(criteria).every(([key, value]) => lead[key] === value)) || null); },
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
      },
      create: async values => {
        if (leads.some(lead => lead.sheetSourceKey === values.sheetSourceKey)) throw Object.assign(new Error("duplicate"), { code: 11000 });
        const lead = { ...values, _id: `${leads.length + 1}` };
        leads.push(lead);
        return { toObject: () => structuredClone(lead) };
      },
      updateOne: async (criteria, update) => { leadUpdateCount += 1; Object.assign(leads.find(lead => lead._id === criteria._id), update.$set); }
    },
    "../models/LeadSheetSettings": {
      findOne: () => query(settings),
      findOneAndUpdate: (criteria, update, options) => {
        const previous = structuredClone(settings);
        settings = { ...settings, ...update.$set, nextEmployeeIndex: settings.nextEmployeeIndex + (update.$inc?.nextEmployeeIndex || 0) };
        return query(options?.new === false ? previous : settings);
      },
      updateOne: async (criteria, update) => { settings = { ...settings, ...update.$set }; }
    },
    "../db/connection": { connectDatabase: async () => {} },
    "./push-notification.service": { sendLeadAssignment: async () => true }
  };
  Module._load = function(request, parent, isMain) {
    if (parent?.filename.endsWith("lead-sheet.service.js") && mocks[request]) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  const columnIndex = letters => [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  global.fetch = async (url, options) => {
    if (String(url).includes("oauth2.googleapis.com")) return { ok: true, json: async () => ({ access_token: "test-token", expires_in: 3600 }) };
    if (options?.method === "POST") {
      sheetPostCount += 1;
      for (const item of JSON.parse(options.body).data) {
        const match = item.range.match(/!([A-Z]+)(\d+)$/);
        rows[Number(match[2]) - 1][columnIndex(match[1])] = item.values[0][0];
      }
      return { ok: true, json: async () => ({}) };
    }
    if (String(url).includes("?fields=")) return { ok: true, json: async () => ({ sheets: [{ properties: { sheetId: 0, title: "Meta Leads" } }] }) };
    return { ok: true, json: async () => ({ values: structuredClone(rows) }) };
  };
  try {
    const { syncLeadSheet } = require("../src/server/services/lead-sheet.service");
    const first = await syncLeadSheet();
    assert.equal(first.success, true, first.message);
    assert.equal(first.data.importedCount, 4);
    assert.equal(first.data.pendingCount, 1);
    assert.equal(leads.length, 4);
    assert.equal(leads[0].assignedEmployeeId, "EMP1");
    assert.equal(leads[1].assignedEmployeeId, "EMP2");
    assert.equal(leads[1].phone, "9876543211");
    assert.notEqual(leads[2].sheetSourceKey, leads[3].sheetSourceKey);
    assert.equal(leads[0].sheetFields["Campaign Name"], "September Campaign");
    assert.equal(leads[0].sheetFields["Column 5"], "extra value");
    assert.equal(rows[1][5], "Asha");
    assert.equal(rows[1][6], "EMP1");
    assert.equal(rows[1][7], leads[0].leadId);
    assert.equal(sheetPostCount, 2, "header and all row writebacks should use two Sheet requests");
    const readsAfterFirst = leadFindCount;
    const updatesAfterFirst = leadUpdateCount;
    const second = await syncLeadSheet();
    assert.equal(second.success, true, second.message);
    assert.equal(second.data.importedCount, 0);
    assert.equal(leads.length, 4);
    assert.equal(leadFindCount, readsAfterFirst, "unchanged rows should not query MongoDB");
    assert.equal(leadUpdateCount, updatesAfterFirst, "unchanged rows should not update MongoDB");
    const originalOwner = leads[0].assignedEmployeeId;
    rows.splice(1, 0, ["Inserted Lead", "9876543214", "1234567890123456800", "September Campaign", ""]);
    const inserted = await syncLeadSheet({ _dashboardSession: true });
    assert.equal(inserted.success, true, inserted.message);
    assert.equal(inserted.data.importedCount, 1, "a row inserted above an existing lead must be imported separately");
    assert.equal(leads.length, 5);
    assert.equal(leads[0].assignedEmployeeId, originalOwner);
    assert.equal(leads[0].name, "Customer One", "the inserted row must not overwrite the old row-number occupant");
    const insertedId = rows[1][7];
    assert.ok(insertedId);
    [rows[2], rows[3]] = [rows[3], rows[2]];
    const sorted = await syncLeadSheet({ _dashboardSession: true });
    assert.equal(sorted.success, true, sorted.message);
    assert.equal(sorted.data.importedCount, 0, "sorting rows with GlobalOne IDs must not create new leads");
    assert.equal(leads[0].assignedEmployeeId, originalOwner);
    assert.equal(rows[1][7], insertedId);
    rows.unshift(["Meta export information; lead headings are on the next row"]);
    rows.push(["Header Shifted Lead", "9876543215", "META-4", "October Campaign", ""]);
    const shifted = await syncLeadSheet({ _dashboardSession: true });
    assert.equal(shifted.success, true, shifted.message);
    assert.equal(shifted.data.importedCount, 1, "a lead below a non-first header row must be imported");
    assert.equal(rows[0].length, 1, "manual sync must not write control headers into an introductory row");
    assert.equal(rows[1][5], "Assigned Employee", "manual sync must keep control headers on the actual lead header row");
    assert.equal(rows.at(-1)[5], "Ravi", "the new lead owner must be written to its actual row");
    assert.equal(leads[0].assignedEmployeeId, originalOwner, "moving the header row must preserve existing ownership");
  } finally {
    Module._load = originalLoad;
    global.fetch = originalFetch;
    if (originalCredentials === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalCredentials;
  }
});
