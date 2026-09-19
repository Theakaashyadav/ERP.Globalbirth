const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fakeUtilities() {
  return {
    getUuid: () => "12345678-90ab-cdef-1111-222222222222",
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest: (_algorithm, value) => [...crypto.createHash("sha256").update(value).digest()]
  };
}

function generateScript(sheetUrl = "https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=42") {
  const file = path.join(__dirname, "../src/client/pages/admin/leadSheetScript.js");
  const source = fs.readFileSync(file, "utf8").replace("export function buildLeadSheetScript", "function buildLeadSheetScript");
  const context = { URL, URLSearchParams, module: { exports: {} } };
  vm.runInNewContext(`${source}\nmodule.exports = { buildLeadSheetScript };`, context);
  return context.module.exports.buildLeadSheetScript({
    sheetUrl,
    webhookUrl: "https://example.com/api/lead-sheet/webhook",
    webhookSecret: "test-secret"
  });
}

test("generated Apps Script parses, installs triggers, and sends a lead row", () => {
  const source = generateScript();
  new vm.Script(source);
  const cells = [
    ["Full Name", "Phone"],
    ["Ada Example", "9876543210"]
  ];
  const installedTriggers = [];
  const requests = [];
  const savedProperties = new Map();
  const sheet = {
    getSheetId: () => 42,
    getLastColumn: () => Math.max(...cells.map(row => row.length)),
    getMaxColumns: () => 10,
    getLastRow: () => cells.length,
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getDisplayValues: () => Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => String(cells[row - 1 + r]?.[column - 1 + c] || ""))),
        getDisplayValue: () => String(cells[row - 1]?.[column - 1] || ""),
        setValue(value) { cells[row - 1] ||= []; cells[row - 1][column - 1] = String(value); }
      };
    }
  };
  const spreadsheet = { getSheets: () => [sheet] };
  const context = {
    SpreadsheetApp: { openById: id => { assert.equal(id, "testSheet123"); return spreadsheet; } },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger(handler) {
        const trigger = { handler, cadence: "" };
        const builder = {
          timeBased() { return this; },
          everyMinutes(minutes) { trigger.cadence = `every ${minutes} minute(s)`; return this; },
          forSpreadsheet() { return this; },
          onEdit() { trigger.cadence = "onEdit"; return this; },
          onFormSubmit() { trigger.cadence = "onFormSubmit"; return this; },
          create() { installedTriggers.push(trigger); }
        };
        return builder;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: fakeUtilities(),
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => savedProperties.get(key),
      setProperty: (key, value) => savedProperties.set(key, value)
    }) },
    UrlFetchApp: { fetch(url, options) {
      requests.push({ url, options });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true, data: {
          status: "assigned", leadId: "SHEET1234567890ABCDEF", assignedEmployeeId: "EMP1", assignedEmployeeName: "Sales One",
          sharingStatus: "Done", notificationStatus: "Accepted"
        } })
      };
    } }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  vm.runInContext("setupGlobalOneLeadSync()", context);

  assert.deepEqual(installedTriggers.map(trigger => trigger.cadence), ["every 1 minute(s)", "onEdit", "onFormSubmit"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.com/api/lead-sheet/webhook");
  assert.equal(requests[0].options.method, "post");
  assert.deepEqual(JSON.parse(requests[0].options.payload), {
    secret: "test-secret",
    spreadsheetId: "testSheet123",
    sheetTabId: 42,
    rowNumber: 2,
    headers: ["Full Name", "Phone", "Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID", "GlobalOne Sharing Status", "GlobalOne Notification Status", "GlobalOne Synced Hash"],
    values: ["Ada Example", "9876543210", "", "", "SHEET1234567890ABCDEF", "Not Done", "Pending", ""]
  });
  const expectedHash = crypto.createHash("sha256").update(JSON.stringify([["Full Name", "Ada Example"], ["Phone", "9876543210"]])).digest("hex");
  assert.deepEqual(cells[1].slice(2), ["Sales One", "EMP1", "SHEET1234567890ABCDEF", "Done", "Accepted", expectedHash]);
  vm.runInContext("sendNewLeadsToGlobalOne()", context);
  assert.equal(requests.length, 1, "assigned rows are not sent twice");
  cells.push(["External Lead", "9123456789", "Other Sales", "", ""]);
  vm.runInContext("sendNewLeadsToGlobalOne()", context);
  assert.equal(requests.length, 1, "rows already assigned outside GlobalOne are preserved");
  assert.deepEqual(cells[2].slice(2), ["Other Sales", "", "", "Not Done"]);
});

function sheetFixture(id, name, cells) {
  return {
    getSheetId: () => id,
    getName: () => name,
    getLastColumn: () => Math.max(0, ...cells.map(row => row.length)),
    getMaxColumns: () => 20,
    getLastRow: () => cells.length,
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getDisplayValues: () => Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => String(cells[row - 1 + r]?.[column - 1 + c] || ""))),
        getDisplayValue: () => String(cells[row - 1]?.[column - 1] || ""),
        setValue(value) { cells[row - 1] ||= []; cells[row - 1][column - 1] = String(value); }
      };
    }
  };
}

function runSetup(source, sheets, oldTriggers = [], responseForCall = () => ({
  status: "assigned", leadId: "SHEET1234567890ABCDEF", assignedEmployeeId: "EMP1", assignedEmployeeName: "Sales One",
  sharingStatus: "Done", notificationStatus: "Accepted"
})) {
  const requests = [];
  const triggers = [];
  const properties = new Map();
  const context = {
    SpreadsheetApp: { openById: () => ({ getSheets: () => sheets }) },
    ScriptApp: {
      getProjectTriggers: () => [...oldTriggers],
      deleteTrigger(trigger) { oldTriggers.splice(oldTriggers.indexOf(trigger), 1); },
      newTrigger() {
        const builder = {
          timeBased() { return this; }, everyMinutes() { return this; },
          forSpreadsheet() { return this; }, onEdit() { return this; },
          onFormSubmit() { return this; }, create() { triggers.push(1); }
        };
        return builder;
      }
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: fakeUtilities(),
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value) }) },
    UrlFetchApp: { fetch(url, options) {
      requests.push({ url, options });
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ success: true, data: responseForCall(requests.length) }) };
    } }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    run: () => vm.runInContext("setupGlobalOneLeadSync()", context),
    scan: () => vm.runInContext("sendNewLeadsToGlobalOne()", context),
    requests, triggers
  };
}

test("finds the lead tab and headings below blank rows when the URL has no gid", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit");
  const blankTab = sheetFixture(0, "Dashboard", []);
  const leadCells = [[], ["Meta export"], ["Full Name", "Phone"], ["Ada Example", "9876543210"]];
  const leads = sheetFixture(42, "Leads", leadCells);
  const fixture = runSetup(source, [blankTab, leads]);
  fixture.run();

  assert.equal(fixture.triggers.length, 3);
  assert.equal(fixture.requests.length, 1);
  assert.equal(JSON.parse(fixture.requests[0].options.payload).sheetTabId, 42);
  assert.equal(JSON.parse(fixture.requests[0].options.payload).rowNumber, 4);
  assert.deepEqual(leadCells[2].slice(2), ["Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID", "GlobalOne Sharing Status", "GlobalOne Notification Status", "GlobalOne Synced Hash"]);
  assert.deepEqual(leadCells[3].slice(2, 7), ["Sales One", "EMP1", "SHEET1234567890ABCDEF", "Done", "Accepted"]);
});

test("explicit gid never switches to another tab and setup leaves no failing triggers", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=0");
  const blankTab = sheetFixture(0, "Dashboard", [["Overview"]]);
  const leads = sheetFixture(42, "Leads", [["Full Name", "Phone"], ["Ada", "9876543210"]]);
  const oldTriggers = Array.from({ length: 3 }, () => ({ getHandlerFunction: () => "sendNewLeadsToGlobalOne" }));
  const fixture = runSetup(source, [blankTab, leads], oldTriggers);
  assert.throws(fixture.run, /Dashboard.*gid=0.*phone\/mobile.*rows 1/);
  assert.equal(fixture.triggers.length, 0);
  assert.equal(oldTriggers.length, 0, "old failing triggers are removed even when setup rejects the tab");
  assert.equal(fixture.requests.length, 0);
});

test("an empty selected tab cannot hide another tab with lead headings", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=0");
  const blankTab = sheetFixture(0, "Dashboard", []);
  const leads = sheetFixture(42, "Leads", [["Full Name", "Phone"], ["Ada", "9876543210"]]);
  const fixture = runSetup(source, [blankTab, leads]);
  assert.throws(fixture.run, /Dashboard.*gid=0.*Leads.*gid=42/);
  assert.equal(fixture.triggers.length, 0);
});

test("an empty selected tab waits for Meta to add headings and a lead", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=42");
  const cells = [];
  const leads = sheetFixture(42, "Leads", cells);
  const fixture = runSetup(source, [leads]);
  fixture.run();
  assert.equal(fixture.triggers.length, 3);
  assert.equal(fixture.requests.length, 0);
  cells.push(["Full Name", "Phone"]);
  cells.push(["Ada Example", "9876543210"]);
  fixture.scan();
  assert.equal(fixture.requests.length, 1);
  assert.equal(JSON.parse(fixture.requests[0].options.payload).sheetTabId, 42);
  assert.deepEqual(cells[1].slice(2, 7), ["Sales One", "EMP1", "SHEET1234567890ABCDEF", "Done", "Accepted"]);
});

test("a link without gid reports ambiguous lead tabs instead of choosing one", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit");
  const first = sheetFixture(1, "Leads A", [["Name", "Phone"]]);
  const second = sheetFixture(2, "Leads B", [["Name", "Mobile"]]);
  const fixture = runSetup(source, [first, second]);
  assert.throws(fixture.run, /Several tabs.*Leads A.*Leads B.*#gid/);
  assert.equal(fixture.triggers.length, 0);
});

test("the active fragment gid overrides a stale query gid", () => {
  const source = generateScript("https://docs.google.com/spreadsheets/d/testSheet123/edit?gid=0#gid=42");
  const blankTab = sheetFixture(0, "Dashboard", []);
  const leads = sheetFixture(42, "Leads", [["Full Name", "Phone"], ["Ada", "9876543210"]]);
  const fixture = runSetup(source, [blankTab, leads]);
  fixture.run();
  assert.equal(JSON.parse(fixture.requests[0].options.payload).sheetTabId, 42);
});

test("changed Meta question headers and answers are resent without changing the owner", () => {
  const source = generateScript();
  const cells = [["Full Name", "Your phone number", "Which product do you want?"], ["Ada", "9876543210", "Product A"]];
  const fixture = runSetup(source, [sheetFixture(42, "Meta Leads", cells)]);
  fixture.run();
  const firstPayload = JSON.parse(fixture.requests[0].options.payload);
  assert.equal(firstPayload.headers[2], "Which product do you want?");
  assert.equal(firstPayload.values[2], "Product A");
  const firstHash = cells[1][8];

  cells[0][2] = "Which service do you need?";
  cells[1][2] = "Service B";
  fixture.scan();
  assert.equal(fixture.requests.length, 2);
  const updatedPayload = JSON.parse(fixture.requests[1].options.payload);
  assert.equal(updatedPayload.headers[2], "Which service do you need?");
  assert.equal(updatedPayload.values[2], "Service B");
  assert.equal(cells[1][3], "Sales One");
  assert.equal(cells[1][6], "Done");
  assert.notEqual(cells[1][8], firstHash, "source hash changes when Meta questions change");
  fixture.scan();
  assert.equal(fixture.requests.length, 2, "unchanged assigned row stays quiet");
});

test("Done sharing status waits for a saved assignment while notification retries", () => {
  const source = generateScript();
  const cells = [["Full Name", "Phone"], ["Ada", "9876543210"]];
  const fixture = runSetup(source, [sheetFixture(42, "Meta Leads", cells)], [], call => call === 1
    ? { status: "pending", sharingStatus: "Not Done", notificationStatus: "Pending" }
    : { status: "assigned", leadId: "SHEET1234567890ABCDEF", assignedEmployeeId: "EMP1", assignedEmployeeName: "Sales One", sharingStatus: "Done", notificationStatus: call === 2 ? "Failed" : "Accepted" });
  fixture.run();
  assert.equal(cells[1][5], "Not Done");
  assert.equal(cells[1][2] || "", "");
  fixture.scan();
  assert.equal(cells[1][5], "Done");
  assert.equal(cells[1][6], "Failed");
  assert.equal(cells[1][2], "Sales One");
  fixture.scan();
  assert.equal(cells[1][6], "Accepted");
  fixture.scan();
  assert.equal(fixture.requests.length, 3, "Accepted notification and unchanged source stop retries");
});
