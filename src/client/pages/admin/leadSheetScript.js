const ASSIGNMENT_HEADERS = ["Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID"];

function sheetIdentity(sheetUrl) {
  const url = new URL(sheetUrl);
  const spreadsheetId = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!spreadsheetId) throw new Error("Save a valid Google Sheet link before copying the script.");
  const gid = url.searchParams.get("gid") || new URLSearchParams(url.hash.slice(1)).get("gid");
  return { spreadsheetId, sheetTabId: gid ? Number(gid) : null };
}

export function buildLeadSheetScript({ sheetUrl, webhookUrl, webhookSecret }) {
  if (!webhookSecret) throw new Error("Save the Sheet connection before copying the script.");
  const { spreadsheetId, sheetTabId } = sheetIdentity(sheetUrl);
  const url = new URL(webhookUrl);
  if (url.protocol !== "https:") throw new Error("The web API must use HTTPS before connecting Apps Script.");

  return `// GlobalOne lead connection. Paste this into Extensions > Apps Script in your Google Sheet.
// After saving, run setupGlobalOneLeadSync once and approve Google's permissions.
// Meta/API additions are checked every minute because Google does not fire edit triggers for API writes.
const GLOBALONE_SPREADSHEET_ID = ${JSON.stringify(spreadsheetId)};
const GLOBALONE_SHEET_TAB_ID = ${JSON.stringify(sheetTabId)};
const GLOBALONE_WEBHOOK_URL = ${JSON.stringify(url.href)};
const GLOBALONE_WEBHOOK_SECRET = ${JSON.stringify(webhookSecret)};
const GLOBALONE_ASSIGNMENT_HEADERS = ${JSON.stringify(ASSIGNMENT_HEADERS)};
const GLOBALONE_HANDLER = "sendNewLeadsToGlobalOne";

function setupGlobalOneLeadSync() {
  const spreadsheet = SpreadsheetApp.openById(GLOBALONE_SPREADSHEET_ID);
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === GLOBALONE_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(GLOBALONE_HANDLER).timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger(GLOBALONE_HANDLER).forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger(GLOBALONE_HANDLER).forSpreadsheet(spreadsheet).onFormSubmit().create();
  sendNewLeadsToGlobalOne();
}

function globalOneHeaderIndex_(headers, name) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return headers.findIndex(function(header) {
    return String(header).toLowerCase().replace(/[^a-z0-9]/g, "") === normalized;
  });
}

function globalOneSheet_() {
  const spreadsheet = SpreadsheetApp.openById(GLOBALONE_SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  const sheet = GLOBALONE_SHEET_TAB_ID === null ? sheets[0] : sheets.find(function(item) {
    return item.getSheetId() === GLOBALONE_SHEET_TAB_ID;
  });
  if (!sheet) throw new Error("The selected Sheet tab was not found. Save its new link in GlobalOne and copy the updated script.");
  return sheet;
}

function globalOneHeaders_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  if (!headers.some(function(value) { return String(value).trim(); })) {
    throw new Error("Row 1 must contain the lead column names.");
  }
  GLOBALONE_ASSIGNMENT_HEADERS.forEach(function(name) {
    if (globalOneHeaderIndex_(headers, name) < 0) headers.push(name);
  });
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  GLOBALONE_ASSIGNMENT_HEADERS.forEach(function(name) {
    const index = globalOneHeaderIndex_(headers, name);
    if (sheet.getRange(1, index + 1).getDisplayValue() !== name) {
      sheet.getRange(1, index + 1).setValue(name);
    }
    headers[index] = name;
  });
  return headers;
}

function globalOneSendRow_(sheet, headers, allRows, rowNumber) {
  const values = allRows[rowNumber - 2];
  if (!values) return false;
  const assignmentIndexes = GLOBALONE_ASSIGNMENT_HEADERS.map(function(name) {
    return globalOneHeaderIndex_(headers, name);
  });
  const sourceIndexes = headers.map(function(_, index) { return index; }).filter(function(index) {
    return assignmentIndexes.indexOf(index) < 0;
  });
  if (!sourceIndexes.some(function(index) { return String(values[index] || "").trim(); })) return false;
  if (assignmentIndexes.every(function(index) { return String(values[index] || "").trim(); })) return false;
  // Keep any owner already entered outside GlobalOne untouched.
  if (!values[assignmentIndexes[2]] && (values[assignmentIndexes[0]] || values[assignmentIndexes[1]])) return false;
  // A stable ID prevents row inserts and sorts from changing which lead this row represents.
  if (!values[assignmentIndexes[2]]) {
    const beforeWrite = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
    if (beforeWrite[assignmentIndexes[2]] ||
        sourceIndexes.some(function(index) { return beforeWrite[index] !== values[index]; })) return false;
    values[assignmentIndexes[2]] = "SHEET" + Utilities.getUuid().replace(/-/g, "").slice(0, 16).toUpperCase();
    sheet.getRange(rowNumber, assignmentIndexes[2] + 1).setValue(values[assignmentIndexes[2]]);
  }

  let response;
  try {
    response = UrlFetchApp.fetch(GLOBALONE_WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        secret: GLOBALONE_WEBHOOK_SECRET,
        spreadsheetId: GLOBALONE_SPREADSHEET_ID,
        sheetTabId: sheet.getSheetId(),
        rowNumber: rowNumber,
        headers: headers,
        values: values
      }),
      muteHttpExceptions: true
    });
  } catch (error) {
    error.globalOneFatal = true;
    throw error;
  }
  let body;
  try { body = JSON.parse(response.getContentText()); }
  catch (error) {
    const invalidResponse = new Error("GlobalOne returned an invalid response for row " + rowNumber + ".");
    invalidResponse.globalOneFatal = true;
    throw invalidResponse;
  }
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || body.success !== true) {
    const failure = new Error("GlobalOne rejected row " + rowNumber + ": " + (body.message || "HTTP " + response.getResponseCode()));
    failure.globalOneFatal = [401, 403, 429].indexOf(response.getResponseCode()) >= 0 || response.getResponseCode() >= 500;
    throw failure;
  }
  const data = body.data || {};
  if (data.status === "pending" || data.status === "external") return true;
  if (!data.assignedEmployeeName || !data.assignedEmployeeId || !data.leadId) {
    throw new Error("GlobalOne did not return assignment details for row " + rowNumber + ".");
  }

  // If a row was edited or sorted while the API call ran, retry it on the next scan.
  const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
  if (currentValues[assignmentIndexes[2]] !== values[assignmentIndexes[2]] ||
      sourceIndexes.some(function(index) { return currentValues[index] !== values[index]; })) return true;
  [data.assignedEmployeeName, data.assignedEmployeeId, data.leadId].forEach(function(value, index) {
    sheet.getRange(rowNumber, assignmentIndexes[index] + 1).setValue(value);
  });
  return true;
}

function sendNewLeadsToGlobalOne(event) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const sheet = globalOneSheet_();
    if (event && event.range && event.range.getSheet().getSheetId() !== sheet.getSheetId()) return;
    const headers = globalOneHeaders_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const allRows = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
    const seen = {};
    let sent = 0;
    function attempt(rowNumber) {
      if (rowNumber < 2 || rowNumber > lastRow || seen[rowNumber] || sent >= 40) return false;
      seen[rowNumber] = true;
      try {
        if (globalOneSendRow_(sheet, headers, allRows, rowNumber)) sent += 1;
      } catch (error) {
        sent += 1;
        console.error("GlobalOne lead row " + rowNumber + ": " + error.message);
        if (error.globalOneFatal) throw error;
      }
      return true;
    }

    // Manual edits and Google Form submissions can be delivered as soon as their trigger runs.
    if (event && event.range) {
      const end = Math.min(event.range.getLastRow(), event.range.getRow() + 9);
      for (let row = Math.max(event.range.getRow(), 2); row <= end; row += 1) attempt(row);
    }
    // Give new Meta/API rows priority, then rotate through older unassigned rows for retries.
    const recentStart = Math.max(2, lastRow - 19);
    for (let row = lastRow; row >= recentStart && sent < 10; row -= 1) attempt(row);
    const properties = PropertiesService.getScriptProperties();
    let cursor = Number(properties.getProperty("globalOneNextRow")) || lastRow;
    if (cursor < 2 || cursor > lastRow) cursor = lastRow;
    for (let checked = 0; checked < lastRow - 1 && sent < 40; checked += 1) {
      attempt(cursor);
      cursor = cursor > 2 ? cursor - 1 : lastRow;
    }
    properties.setProperty("globalOneNextRow", String(cursor));
  } finally {
    lock.releaseLock();
  }
}
`;
}
