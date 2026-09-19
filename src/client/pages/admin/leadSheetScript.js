const CONTROL_HEADERS = ["Assigned Employee", "Assigned Employee ID", "GlobalOne Lead ID", "GlobalOne Sharing Status", "GlobalOne Notification Status", "GlobalOne Synced Hash"];

function sheetIdentity(sheetUrl) {
  const url = new URL(sheetUrl);
  const spreadsheetId = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!spreadsheetId) throw new Error("Save a valid Google Sheet link before copying the script.");
  const gid = new URLSearchParams(url.hash.slice(1)).get("gid") || url.searchParams.get("gid");
  if (gid !== null && (!/^\d+$/.test(gid) || !Number.isSafeInteger(Number(gid)))) {
    throw new Error("The Sheet tab ID in the link is invalid.");
  }
  return { spreadsheetId, sheetTabId: gid === null ? null : Number(gid) };
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
const GLOBALONE_CONTROL_HEADERS = ${JSON.stringify(CONTROL_HEADERS)};
const GLOBALONE_HANDLER = "sendNewLeadsToGlobalOne";
const GLOBALONE_PHONE_HEADERS = ["Phone Number", "Phone", "Phone No", "Mobile Number", "Mobile", "Mobile No", "Contact Number", "Contact", "Contact No", "WhatsApp Number", "WhatsApp", "WhatsApp No"];
const GLOBALONE_NAME_HEADERS = ["Full Name", "Lead Name", "Name", "Customer Name", "First Name"];

function setupGlobalOneLeadSync() {
  const spreadsheet = SpreadsheetApp.openById(GLOBALONE_SPREADSHEET_ID);
  // Clear triggers left by earlier setup attempts, including ones installed before
  // header validation was added. A bad link must not keep failing every minute.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === GLOBALONE_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  const selected = globalOneSheet_(true);
  if (selected.headerRow !== null) globalOneHeaders_(selected.sheet, selected.headerRow);
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("globalOneConfiguredSpreadsheetId", GLOBALONE_SPREADSHEET_ID);
  properties.setProperty("globalOneConfiguredTabId", String(GLOBALONE_SHEET_TAB_ID));
  properties.setProperty("globalOneSelectedTabId", String(selected.sheet.getSheetId()));
  properties.setProperty("globalOneSelectedHeaderRow", selected.headerRow === null ? "" : String(selected.headerRow));
  properties.setProperty("globalOneNextRow", "");
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

function globalOneHasPhoneHeader_(headers) {
  return headers.some(function(header) {
    const normalized = String(header).toLowerCase().replace(/[^a-z0-9]/g, "");
    return GLOBALONE_PHONE_HEADERS.some(function(name) {
      return normalized === name.toLowerCase().replace(/[^a-z0-9]/g, "");
    }) || /phone|mobile|whatsapp|contactnumber/.test(normalized);
  });
}

function globalOneHeaderCandidate_(sheet) {
  const scanRows = Math.min(sheet.getLastRow(), 10);
  if (scanRows < 1) return null;
  const width = Math.max(sheet.getLastColumn(), 1);
  const rows = sheet.getRange(1, 1, scanRows, width).getDisplayValues();
  let best = null;
  rows.forEach(function(headers, index) {
    if (!globalOneHasPhoneHeader_(headers)) return;
    const hasName = GLOBALONE_NAME_HEADERS.some(function(name) {
      return globalOneHeaderIndex_(headers, name) >= 0;
    });
    const score = (hasName ? 100 : 0) + headers.filter(function(value) {
      return String(value).trim();
    }).length;
    if (!best || score > best.score) best = { sheet: sheet, headerRow: index + 1, score: score };
  });
  return best;
}

function globalOneSheet_(fresh) {
  const spreadsheet = SpreadsheetApp.openById(GLOBALONE_SPREADSHEET_ID);
  const sheets = spreadsheet.getSheets();
  const properties = PropertiesService.getScriptProperties();
  const sameConnection = !fresh &&
    properties.getProperty("globalOneConfiguredSpreadsheetId") === GLOBALONE_SPREADSHEET_ID &&
    properties.getProperty("globalOneConfiguredTabId") === String(GLOBALONE_SHEET_TAB_ID);
  const pinnedIdText = sameConnection ? properties.getProperty("globalOneSelectedTabId") : "";
  const pinnedId = pinnedIdText ? Number(pinnedIdText) : NaN;
  const pinnedRow = sameConnection ? Number(properties.getProperty("globalOneSelectedHeaderRow")) : NaN;
  const pinnedSheet = Number.isSafeInteger(pinnedId) ? sheets.find(function(item) {
    return item.getSheetId() === pinnedId;
  }) : null;
  if (pinnedSheet) {
    if (Number.isSafeInteger(pinnedRow) && pinnedRow > 0) {
      const width = Math.max(pinnedSheet.getLastColumn(), 1);
      const headers = pinnedSheet.getRange(pinnedRow, 1, 1, width).getDisplayValues()[0];
      if (!globalOneHasPhoneHeader_(headers)) throw new Error("The lead headings moved in tab '" + pinnedSheet.getName() + "'. Run setupGlobalOneLeadSync again to select the header row.");
      return { sheet: pinnedSheet, headerRow: pinnedRow };
    }
    const discovered = globalOneHeaderCandidate_(pinnedSheet);
    if (discovered) return discovered;
    if (pinnedSheet.getLastRow() === 0) return { sheet: pinnedSheet, headerRow: null };
    throw new Error("Tab '" + pinnedSheet.getName() + "' has content but no phone/mobile column heading in rows 1-10. Add the lead headings and run setupGlobalOneLeadSync again.");
  }
  if (GLOBALONE_SHEET_TAB_ID !== null) {
    const sheet = sheets.find(function(item) { return item.getSheetId() === GLOBALONE_SHEET_TAB_ID; });
    if (!sheet) throw new Error("Sheet tab ID " + GLOBALONE_SHEET_TAB_ID + " was not found. Open the lead tab, save its URL in GlobalOne, and copy the updated script.");
    const selected = globalOneHeaderCandidate_(sheet);
    if (!selected && sheet.getLastRow() === 0) {
      const alternatives = sheets.filter(function(item) { return item.getSheetId() !== sheet.getSheetId(); })
        .map(globalOneHeaderCandidate_).filter(function(candidate) { return candidate; });
      if (alternatives.length) throw new Error("Selected tab '" + sheet.getName() + "' (gid=" + sheet.getSheetId() + ") is empty, while " + alternatives.map(function(candidate) {
        return "'" + candidate.sheet.getName() + "' (gid=" + candidate.sheet.getSheetId() + ")";
      }).join(", ") + " has lead headings. Open the lead tab, save its URL with #gid in GlobalOne, and copy the updated script.");
      return { sheet: sheet, headerRow: null };
    }
    if (!selected) throw new Error("Tab '" + sheet.getName() + "' (gid=" + sheet.getSheetId() + ") has no recognized phone/mobile column heading in rows 1-10. Open the lead tab, save its URL with #gid in GlobalOne, and copy the updated script.");
    return selected;
  }
  const candidates = sheets.map(globalOneHeaderCandidate_).filter(function(candidate) { return candidate; });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new Error("Several tabs look like lead tabs: " + candidates.map(function(candidate) {
      return "'" + candidate.sheet.getName() + "' (gid=" + candidate.sheet.getSheetId() + ", headings on row " + candidate.headerRow + ")";
    }).join(", ") + ". Open the correct tab, save its URL with #gid in GlobalOne, and copy the updated script.");
  }
  if (sheets.length === 1 && sheets[0].getLastRow() === 0) return { sheet: sheets[0], headerRow: null };
  throw new Error("No unique lead tab has a recognized phone/mobile heading in rows 1-10. Open the lead tab, save its URL with #gid in GlobalOne, and copy the updated script.");
}

function globalOneHeaders_(sheet, headerRow) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(headerRow, 1, 1, width).getDisplayValues()[0];
  GLOBALONE_CONTROL_HEADERS.forEach(function(name) {
    if (globalOneHeaderIndex_(headers, name) < 0) headers.push(name);
  });
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  GLOBALONE_CONTROL_HEADERS.forEach(function(name) {
    const index = globalOneHeaderIndex_(headers, name);
    if (sheet.getRange(headerRow, index + 1).getDisplayValue() !== name) {
      sheet.getRange(headerRow, index + 1).setValue(name);
    }
    headers[index] = name;
  });
  return headers;
}

function globalOneSourceHash_(headers, values, controlIndexes) {
  const source = headers.map(function(header, index) {
    return controlIndexes.indexOf(index) < 0 ? [String(header), String(values[index] || "")] : null;
  }).filter(function(item) { return item !== null; });
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(source), Utilities.Charset.UTF_8)
    .map(function(byte) { return ("0" + (byte & 255).toString(16)).slice(-2); }).join("");
}

function globalOneSendRow_(sheet, headers, allRows, rowNumber, headerRow) {
  const values = allRows[rowNumber - headerRow - 1];
  if (!values) return false;
  const assignmentIndexes = GLOBALONE_CONTROL_HEADERS.map(function(name) {
    return globalOneHeaderIndex_(headers, name);
  });
  const sourceIndexes = headers.map(function(_, index) { return index; }).filter(function(index) {
    return assignmentIndexes.indexOf(index) < 0;
  });
  if (!sourceIndexes.some(function(index) { return String(values[index] || "").trim(); })) return false;
  const sourceHash = globalOneSourceHash_(headers, values, assignmentIndexes);
  if (assignmentIndexes.slice(0, 3).every(function(index) { return String(values[index] || "").trim(); }) &&
      values[assignmentIndexes[3]] === "Done" && values[assignmentIndexes[4]] === "Accepted" &&
      values[assignmentIndexes[5]] === sourceHash) return false;
  // Keep any owner already entered outside GlobalOne untouched.
  if (!values[assignmentIndexes[2]] && (values[assignmentIndexes[0]] || values[assignmentIndexes[1]])) {
    if (!values[assignmentIndexes[3]]) sheet.getRange(rowNumber, assignmentIndexes[3] + 1).setValue("Not Done");
    return false;
  }
  // A stable ID prevents row inserts and sorts from changing which lead this row represents.
  if (!values[assignmentIndexes[2]]) {
    const beforeWrite = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
    if (beforeWrite[assignmentIndexes[2]] ||
        sourceIndexes.some(function(index) { return beforeWrite[index] !== values[index]; })) return false;
    values[assignmentIndexes[2]] = "SHEET" + Utilities.getUuid().replace(/-/g, "").slice(0, 16).toUpperCase();
    sheet.getRange(rowNumber, assignmentIndexes[2] + 1).setValue(values[assignmentIndexes[2]]);
    values[assignmentIndexes[3]] = "Not Done";
    values[assignmentIndexes[4]] = "Pending";
    sheet.getRange(rowNumber, assignmentIndexes[3] + 1).setValue(values[assignmentIndexes[3]]);
    sheet.getRange(rowNumber, assignmentIndexes[4] + 1).setValue(values[assignmentIndexes[4]]);
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
  // If a row was edited or sorted while the API call ran, retry it on the next scan.
  const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0];
  if (currentValues[assignmentIndexes[2]] !== values[assignmentIndexes[2]] ||
      sourceIndexes.some(function(index) { return currentValues[index] !== values[index]; })) return true;
  if (data.status === "external") {
    if (!currentValues[assignmentIndexes[3]]) sheet.getRange(rowNumber, assignmentIndexes[3] + 1).setValue("Not Done");
    return true;
  }
  if (data.status === "pending") {
    sheet.getRange(rowNumber, assignmentIndexes[3] + 1).setValue("Not Done");
    sheet.getRange(rowNumber, assignmentIndexes[4] + 1).setValue(data.notificationStatus || "Pending");
    return true;
  }
  if (!data.assignedEmployeeName || !data.assignedEmployeeId || !data.leadId || data.sharingStatus !== "Done") {
    throw new Error("GlobalOne did not confirm a saved assignment for row " + rowNumber + ".");
  }
  [data.assignedEmployeeName, data.assignedEmployeeId, data.leadId, "Done", data.notificationStatus || "Pending", sourceHash].forEach(function(value, index) {
    sheet.getRange(rowNumber, assignmentIndexes[index] + 1).setValue(value);
  });
  return true;
}

function sendNewLeadsToGlobalOne(event) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const selected = globalOneSheet_();
    const sheet = selected.sheet;
    const headerRow = selected.headerRow;
    if (event && event.range && event.range.getSheet().getSheetId() !== sheet.getSheetId()) return;
    if (headerRow === null) return; // An empty Meta tab can be connected before its first lead arrives.
    PropertiesService.getScriptProperties().setProperty("globalOneSelectedHeaderRow", String(headerRow));
    const headers = globalOneHeaders_(sheet, headerRow);
    const lastRow = sheet.getLastRow();
    if (lastRow <= headerRow) return;
    const firstDataRow = headerRow + 1;
    const allRows = sheet.getRange(firstDataRow, 1, lastRow - headerRow, headers.length).getDisplayValues();
    const seen = {};
    let sent = 0;
    function attempt(rowNumber) {
      if (rowNumber < firstDataRow || rowNumber > lastRow || seen[rowNumber] || sent >= 40) return false;
      seen[rowNumber] = true;
      try {
        if (globalOneSendRow_(sheet, headers, allRows, rowNumber, headerRow)) sent += 1;
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
      for (let row = Math.max(event.range.getRow(), firstDataRow); row <= end; row += 1) attempt(row);
    }
    // Give new Meta/API rows priority, then rotate through older unassigned rows for retries.
    const recentStart = Math.max(firstDataRow, lastRow - 19);
    for (let row = lastRow; row >= recentStart && sent < 10; row -= 1) attempt(row);
    const properties = PropertiesService.getScriptProperties();
    let cursor = Number(properties.getProperty("globalOneNextRow")) || lastRow;
    if (cursor < firstDataRow || cursor > lastRow) cursor = lastRow;
    for (let checked = 0; checked < lastRow - headerRow && sent < 40; checked += 1) {
      attempt(cursor);
      cursor = cursor > firstDataRow ? cursor - 1 : lastRow;
    }
    properties.setProperty("globalOneNextRow", String(cursor));
  } finally {
    lock.releaseLock();
  }
}
`;
}
