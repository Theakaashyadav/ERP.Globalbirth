const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function generateScript() {
  const file = path.join(__dirname, "../src/client/pages/admin/leadSheetScript.js");
  const source = fs.readFileSync(file, "utf8").replace("export function buildLeadSheetScript", "function buildLeadSheetScript");
  const context = { URL, URLSearchParams, module: { exports: {} } };
  vm.runInNewContext(`${source}\nmodule.exports = { buildLeadSheetScript };`, context);
  return context.module.exports.buildLeadSheetScript({
    sheetUrl: "https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=42",
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
    getMaxColumns: () => 6,
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
    Utilities: { getUuid: () => "12345678-90ab-cdef-1111-222222222222" },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => savedProperties.get(key),
      setProperty: (key, value) => savedProperties.set(key, value)
    }) },
    UrlFetchApp: { fetch(url, options) {
      requests.push({ url, options });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ success: true, data: {
          status: "assigned", leadId: "SHEET1234567890ABCDEF", assignedEmployeeId: "EMP1", assignedEmployeeName: "Sales One"
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
    headers: ["Full Name", "Phone", "Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID"],
    values: ["Ada Example", "9876543210", "", "", "SHEET1234567890ABCDEF"]
  });
  assert.deepEqual(cells[1].slice(2), ["Sales One", "EMP1", "SHEET1234567890ABCDEF"]);
  vm.runInContext("sendNewLeadsToGlobalOne()", context);
  assert.equal(requests.length, 1, "assigned rows are not sent twice");
  cells.push(["External Lead", "9123456789", "Other Sales", "", ""]);
  vm.runInContext("sendNewLeadsToGlobalOne()", context);
  assert.equal(requests.length, 1, "rows already assigned outside GlobalOne are preserved");
  assert.deepEqual(cells[2].slice(2), ["Other Sales", "", ""]);
});
