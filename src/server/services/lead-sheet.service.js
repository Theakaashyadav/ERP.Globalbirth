const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Employee = require("../models/Employee");
const Lead = require("../models/Lead");
const LeadSheetSettings = require("../models/LeadSheetSettings");
const { connectDatabase } = require("../db/connection");
const { sendLeadAssignment } = require("./push-notification.service");

const SETTINGS_KEY = "lead-sheet";
const ASSIGNEE_HEADER = "Assigned Employee";
const ASSIGNEE_ID_HEADER = "Assigned Employee ID";
const LEAD_ID_HEADER = "GlobalOne Lead ID";
let tokenCache = null;
let syncPromise = null;
const rowCache = new Map();
const ROW_CACHE_MS = 5 * 60 * 1000;

function clean(value) { return String(value ?? "").trim(); }

function parseSheetUrl(value) {
  const sheetUrl = clean(value);
  if (!sheetUrl) return { sheetUrl: "", spreadsheetId: "", sheetTabId: null };
  let url;
  try { url = new URL(sheetUrl); } catch { throw new Error("Paste a valid Google Sheets link."); }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new Error("Paste a Google Sheets link from docs.google.com.");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("The link does not contain a spreadsheet ID.");
  // The hash tracks the tab currently open in Google Sheets. Shared links can
  // also contain an older query gid, so prefer the visible tab in the hash.
  const gid = new URLSearchParams(url.hash.slice(1)).get("gid") || url.searchParams.get("gid");
  if (gid && (!/^\d+$/.test(gid) || !Number.isSafeInteger(Number(gid)))) throw new Error("The sheet tab ID in the link is invalid.");
  return { sheetUrl, spreadsheetId: match[1], sheetTabId: gid ? Number(gid) : null };
}

function serviceAccount() {
  const encoded = clean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  let raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : clean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (raw.startsWith("\\{")) raw = raw.slice(1);
  if (raw.endsWith("\\}")) raw = `${raw.slice(0, -2)}}`;
  if (!raw) {
    const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : path.resolve("firebase-service-account.json");
    if (fs.existsSync(file)) raw = fs.readFileSync(file, "utf8");
  }
  if (!raw) return null;
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error("The server service account is incomplete.");
  return account;
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const account = serviceAccount();
  if (!account) throw new Error("Configure a Firebase service account on the server before connecting a Sheet.");
  const now = Math.floor(Date.now() / 1000);
  const base64url = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT" })}.${base64url({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  })}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), account.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error("Google did not authorize the Sheet service account. Check its credentials and Sheets API access.");
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Math.max(Number(body.expires_in || 3600) - 30, 60) * 1000 };
  return tokenCache.value;
}

async function googleRequest(method, spreadsheetId, suffix, body) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}${suffix}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (response.status === 429 || response.status >= 500) {
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Google Sheets is temporarily busy (HTTP ${response.status}). The server will retry on the next sync.`);
    }
    if (response.status === 403 || response.status === 404) throw new Error("Cannot access this Sheet. Share it with the service account as Editor and enable the Google Sheets API.");
    throw new Error(`Google Sheets request failed (HTTP ${response.status}): ${clean(data.error?.message || "Unknown error")}`);
  }
}

function quotedTab(title) { return `'${title.replace(/'/g, "''")}'`; }
function columnName(index) {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
function normalizeHeader(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function headerIndex(headers, target) { return headers.findIndex(header => normalizeHeader(header) === normalizeHeader(target)); }

function uniqueHeaders(rawHeaders) {
  const counts = new Map();
  return rawHeaders.map((raw, index) => {
    const name = clean(raw) || `Column ${index + 1}`;
    const count = (counts.get(name.toLowerCase()) || 0) + 1;
    counts.set(name.toLowerCase(), count);
    return count === 1 ? name : `${name} (${count})`;
  });
}

function fieldsForRow(headers, row) {
  const fields = {};
  headers.forEach((header, index) => { fields[header] = clean(row[index]); });
  return fields;
}

function leadData(fields) {
  const entries = Object.entries(fields);
  const find = patterns => entries.find(([label, value]) => value && patterns.some(pattern => pattern.test(normalizeHeader(label))))?.[1] || "";
  const name = find([/^fullname$/, /^leadname$/, /^name$/, /^customername$/, /^firstname$/]);
  const lastName = find([/^lastname$/]);
  const phone = find([/^phonenumber$/, /^phone$/, /^phoneno$/, /^mobilenumber$/, /^mobile$/, /^mobileno$/, /^contactnumber$/, /^contact$/, /^contactno$/, /^whatsappnumber$/, /^whatsapp$/, /^whatsappno$/]);
  const city = find([/^city$/, /^location$/]);
  return { name: clean(`${name} ${lastName}`) || "Lead", phone: clean(phone).replace(/\D/g, "").slice(-10), city };
}

function sourceKey(settings, rowNumber, fields) {
  const id = clean(Object.entries(fields).find(([label]) => normalizeHeader(label) === normalizeHeader(LEAD_ID_HEADER))?.[1]);
  if (id) return `${settings.spreadsheetId}:${settings.sheetTabId}:globalone:${id}`;
  const metaId = Object.entries(fields).find(([label, value]) => value && /^(leadid|metaleadid|facebookleadid)$/.test(normalizeHeader(label)))?.[1];
  // Sheets may round long numeric Meta IDs, so only use clearly textual IDs as identity.
  if (metaId && /[a-z]/i.test(metaId) && /^[a-z0-9_-]+$/i.test(metaId)) {
    return `${settings.spreadsheetId}:${settings.sheetTabId}:meta:${metaId}`;
  }
  return `${settings.spreadsheetId}:${settings.sheetTabId}:row:${rowNumber}`;
}

function sourceFields(fields) {
  return Object.entries(fields).filter(([label]) => ![ASSIGNEE_HEADER, ASSIGNEE_ID_HEADER, LEAD_ID_HEADER]
    .some(control => normalizeHeader(label) === normalizeHeader(control)));
}

function sameSourceFields(lead, fields) {
  const previous = lead.sheetFields instanceof Map ? Object.fromEntries(lead.sheetFields) : (lead.sheetFields || {});
  const current = sourceFields(fields);
  return current.some(([, value]) => clean(value)) && current.every(([label, value]) =>
    Object.hasOwn(previous, label) && clean(previous[label]) === clean(value));
}

function changedRowKey(key, fields) {
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(sourceFields(fields))).digest("hex").slice(0, 24);
  return `${key}:content:${fingerprint}`;
}

async function findSheetLead(settings, rowNumber, fields) {
  const key = sourceKey(settings, rowNumber, fields);
  const globalId = clean(Object.entries(fields).find(([label]) => normalizeHeader(label) === normalizeHeader(LEAD_ID_HEADER))?.[1]);
  // A row number can point to a different person after a Sheet sort. The written-back
  // GlobalOne ID identifies the owner, even when the row has moved.
  if (globalId) {
    if (!/^SHEET[A-F0-9]{16}$/.test(globalId)) return { lead: null, key, globalId, conflict: true };
    const byId = await Lead.findOne({ leadId: globalId }).lean();
    if (byId) {
      const incoming = leadData(fields);
      return { lead: byId, key, globalId, conflict:
        byId.sheetSpreadsheetId !== settings.spreadsheetId ||
        (byId.sheetTabId != null && byId.sheetTabId !== settings.sheetTabId) ||
        Boolean(incoming.phone && byId.phone && incoming.phone !== byId.phone && incoming.name !== byId.name) ||
        (byId.sheetRowNumber !== rowNumber && !sameSourceFields(byId, fields)) };
    }
    return { lead: null, key, globalId, conflict: false };
  }
  const byKey = await Lead.findOne({ sheetSourceKey: key }).lean();
  const assignedId = clean(Object.entries(fields).find(([label]) => normalizeHeader(label) === normalizeHeader(ASSIGNEE_ID_HEADER))?.[1]);
  if (byKey && assignedId && assignedId !== byKey.assignedEmployeeId) {
    return { lead: null, key, globalId, conflict: true };
  }
  if (byKey && key.endsWith(`:row:${rowNumber}`) && !sameSourceFields(byKey, fields)) {
    const alternateKey = changedRowKey(key, fields);
    const alternate = await Lead.findOne({ sheetSourceKey: alternateKey }).lean();
    return { lead: alternate, key: alternateKey, globalId, conflict: false };
  }
  return { lead: byKey, key, globalId, conflict: false };
}

async function activeSelectedEmployees(employeeIds) {
  if (!employeeIds?.length) return [];
  const employees = await Employee.find({ employeeId: { $in: employeeIds }, status: "Active", department: "Sales", designation: { $in: ["TL", "Executive"] } }).lean();
  const byId = new Map(employees.map(employee => [employee.employeeId, employee]));
  return employeeIds.map(id => byId.get(id)).filter(Boolean);
}

async function publicSettings(settings, extras = {}) {
  let account = null;
  try { account = serviceAccount(); } catch { /* Apps Script connections do not need Google service-account credentials. */ }
  const employees = await Employee.find({ department: "Sales", designation: { $in: ["TL", "Executive"] }, status: "Active" })
    .select({ employeeId: 1, fullName: 1, department: 1, designation: 1, status: 1, _id: 0 }).sort({ fullName: 1 }).lean();
  return {
    sheetUrl: settings?.sheetUrl || "",
    employeeIds: settings?.employeeIds || [],
    webhookSecret: settings?.webhookSecret || "",
    serviceAccountEmail: account?.client_email || "",
    status: !settings?.spreadsheetId ? "not_configured" : settings.lastError ? "error" : settings.lastWebhookAt ? "connected" : "waiting_for_first_webhook",
    lastWebhookAt: settings?.lastWebhookAt?.toISOString?.() || "",
    lastWebhookStatus: settings?.lastWebhookStatus || "",
    lastSyncAt: settings?.lastSyncAt?.toISOString?.() || "",
    lastError: settings?.lastError || "",
    lastImportedCount: settings?.lastImportedCount || 0,
    lastPendingCount: settings?.lastPendingCount || 0,
    employees,
    ...extras
  };
}

async function getLeadSheetSettings() {
  await connectDatabase();
  const settings = await LeadSheetSettings.findOne({ key: SETTINGS_KEY }).lean();
  return { success: true, data: await publicSettings(settings) };
}

async function updateLeadSheetSettings(payload) {
  await connectDatabase();
  let parsed;
  try { parsed = parseSheetUrl(payload.sheetUrl); }
  catch (error) { return { success: false, message: error.message }; }
  const requestedIds = Array.isArray(payload.employeeIds) ? [...new Set(payload.employeeIds.map(clean).filter(Boolean))] : [];
  const employees = await activeSelectedEmployees(requestedIds);
  if (employees.length !== requestedIds.length) return { success: false, message: "Select only active Sales TLs or Executives." };
  const previous = await LeadSheetSettings.findOne({ key: SETTINGS_KEY }).lean();
  const changedSheet = previous?.spreadsheetId !== parsed.spreadsheetId || previous?.sheetTabId !== parsed.sheetTabId;
  const changedEmployees = JSON.stringify(previous?.employeeIds || []) !== JSON.stringify(requestedIds);
  const webhookSecret = changedSheet || !previous?.webhookSecret ? crypto.randomBytes(32).toString("hex") : previous.webhookSecret;
  if (changedSheet || changedEmployees) rowCache.clear();
  const settings = await LeadSheetSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { ...parsed, employeeIds: requestedIds, webhookSecret,
      ...(changedSheet ? { nextEmployeeIndex: 0, lastSyncAt: null, lastWebhookAt: null, lastWebhookStatus: "", lastError: "", lastImportedCount: 0, lastPendingCount: 0 } : {}) },
      $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true, new: true }
  ).lean();
  return { success: true, data: await publicSettings(settings), message: "Lead Sheet settings saved." };
}

async function readSheet(settings) {
  const metadata = await googleRequest("GET", settings.spreadsheetId, "?fields=sheets(properties(sheetId,title))");
  const tab = settings.sheetTabId == null
    ? metadata.sheets?.[0]?.properties
    : metadata.sheets?.find(sheet => sheet.properties.sheetId === settings.sheetTabId)?.properties;
  if (!tab) throw new Error("The selected Sheet tab was not found. Paste a link to an existing tab.");
  const tabName = quotedTab(tab.title);
  const result = await googleRequest("GET", settings.spreadsheetId,
    `/values/${encodeURIComponent(tabName)}?valueRenderOption=FORMATTED_VALUE`);
  return { tab, tabName, rows: result.values || [] };
}

async function writeCells(settings, tabName, rowNumber, cells) {
  const data = cells.map(([columnIndex, value]) => ({
    range: `${tabName}!${columnName(columnIndex)}${rowNumber}`,
    values: [[value]]
  }));
  await googleRequest("POST", settings.spreadsheetId, "/values:batchUpdate", {
    valueInputOption: "RAW", data
  });
}

async function writeRows(settings, tabName, items) {
  const data = items.flatMap(item => item.cells.map(([columnIndex, value]) => ({
    range: `${tabName}!${columnName(columnIndex)}${item.rowNumber}`,
    values: [[value]]
  })));
  if (data.length) await googleRequest("POST", settings.spreadsheetId, "/values:batchUpdate", { valueInputOption: "RAW", data });
}

async function ensureAssignmentHeaders(settings, tabName, rawHeaders) {
  const headers = [...rawHeaders];
  const added = [];
  for (const name of [ASSIGNEE_HEADER, ASSIGNEE_ID_HEADER, LEAD_ID_HEADER]) {
    if (headerIndex(headers, name) < 0) { added.push([headers.length, name]); headers.push(name); }
  }
  if (added.length) await writeCells(settings, tabName, 1, added);
  return headers;
}

function validWebhookSecret(received, expected) {
  const supplied = Buffer.from(clean(received));
  const stored = Buffer.from(clean(expected));
  return supplied.length === 64 && stored.length === 64 && crypto.timingSafeEqual(supplied, stored);
}

async function receiveLeadSheetWebhook(payload = {}) {
  await connectDatabase();
  const settings = await LeadSheetSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!settings?.spreadsheetId || !validWebhookSecret(payload.secret, settings.webhookSecret)) {
    return { success: false, statusCode: 401, message: "Invalid Lead Sheet connection." };
  }
  let result;
  try {
    result = await processLeadSheetWebhook(payload, settings);
  } catch (error) {
    await LeadSheetSettings.updateOne({ key: SETTINGS_KEY }, { $set: {
      lastWebhookAt: new Date(), lastWebhookStatus: "error", lastError: clean(error.message).slice(0, 300)
    } });
    throw error;
  }
  await LeadSheetSettings.updateOne({ key: SETTINGS_KEY }, { $set: {
    lastWebhookAt: new Date(), lastWebhookStatus: result.success ? result.data.status : "error",
    lastError: result.success ? "" : result.message,
    lastImportedCount: result.data?.status === "assigned" ? 1 : 0,
    lastPendingCount: result.data?.status === "pending" ? 1 : 0
  } });
  return result;
}

async function processLeadSheetWebhook(payload, settings) {
  const spreadsheetId = clean(payload.spreadsheetId);
  const sheetTabId = Number(payload.sheetTabId);
  const rowNumber = Number(payload.rowNumber);
  if (spreadsheetId !== settings.spreadsheetId ||
      !Number.isSafeInteger(sheetTabId) || sheetTabId < 0 ||
      (settings.sheetTabId != null && sheetTabId !== settings.sheetTabId)) {
    return { success: false, statusCode: 403, message: "This Sheet tab is not selected in the dashboard." };
  }
  if (!Number.isSafeInteger(rowNumber) || rowNumber < 2 ||
      !Array.isArray(payload.headers) || !Array.isArray(payload.values) ||
      payload.headers.length < 1 || payload.headers.length > 300 || payload.values.length > 300) {
    return { success: false, statusCode: 400, message: "Send a Sheet row with its header names and row number." };
  }
  const width = Math.max(payload.headers.length, payload.values.length);
  const headers = uniqueHeaders(Array.from({ length: width }, (_, index) => payload.headers[index]));
  const values = Array.from({ length: width }, (_, index) => clean(payload.values[index]));
  const fields = fieldsForRow(headers, values);
  const assignedIndex = headerIndex(headers, ASSIGNEE_HEADER);
  const assignedIdIndex = headerIndex(headers, ASSIGNEE_ID_HEADER);
  const globalIdIndex = headerIndex(headers, LEAD_ID_HEADER);
  const hasLeadData = values.some((value, index) => value && ![assignedIndex, assignedIdIndex, globalIdIndex].includes(index));
  if (!hasLeadData) return { success: true, data: { status: "pending", leadId: "", assignedEmployeeId: "", assignedEmployeeName: "", sheetRowNumber: rowNumber } };

  const lookup = await findSheetLead({ ...settings, sheetTabId }, rowNumber, fields);
  if (lookup.conflict) return { success: false, statusCode: 409, message: "This Sheet row has a GlobalOne ID or assigned employee that does not match its saved lead. Check the row before retrying." };
  const { key, globalId } = lookup;
  let lead = lookup.lead;
  if (!lead && assignedIndex >= 0 && clean(values[assignedIndex])) {
    return { success: true, data: { status: "external", leadId: globalId, assignedEmployeeId: assignedIdIndex < 0 ? "" : clean(values[assignedIdIndex]), assignedEmployeeName: clean(values[assignedIndex]), sheetRowNumber: rowNumber } };
  }

  let status = "existing";
  if (!lead) {
    const person = leadData(fields);
    if (!/^[0-9]{10}$/.test(person.phone)) {
      return { success: true, data: { status: "pending", leadId: "", assignedEmployeeId: "", assignedEmployeeName: "", sheetRowNumber: rowNumber } };
    }
    const employees = await activeSelectedEmployees(settings.employeeIds);
    if (!employees.length) return { success: false, statusCode: 409, message: "Select at least one active Sales employee in the dashboard." };
    const rotation = await LeadSheetSettings.findOneAndUpdate({ key: SETTINGS_KEY }, { $inc: { nextEmployeeIndex: 1 } }, { new: false }).lean();
    const employee = employees[(rotation?.nextEmployeeIndex || 0) % employees.length];
    try {
      const created = await Lead.create({
        leadId: globalId || `SHEET${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
        ...person,
        source: "Google Sheet",
        sheetFields: fields,
        sheetFieldOrder: headers,
        sheetSourceKey: key,
        sheetSpreadsheetId: spreadsheetId,
        sheetTabId,
        sheetRowNumber: rowNumber,
        assignedEmployeeId: employee.employeeId,
        marketingAssignedTlId: employee.designation === "TL" ? employee.employeeId : employee.teamLeadId || "",
        assignmentStage: employee.designation,
        assignedAt: new Date(),
        firstCallDeadline: null,
        returnedToMarketingAt: null,
        status: "New"
      });
      lead = created.toObject();
      status = "assigned";
      await sendLeadAssignment(employee, lead, "Google Sheet").catch(error => console.error("Lead assignment push failed:", error));
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await findSheetLead({ ...settings, sheetTabId }, rowNumber, fields);
      lead = raced.conflict ? null : raced.lead;
      if (!lead) throw error;
    }
  }

  const assignee = await Employee.findOne({ employeeId: lead.assignedEmployeeId })
    .select({ fullName: 1, employeeId: 1 }).lean();
  if (!assignee) return { success: false, statusCode: 409, message: "The assigned employee no longer exists. Restore that employee before retrying." };
  const finalFields = { ...fields,
    [ASSIGNEE_HEADER]: assignee.fullName,
    [ASSIGNEE_ID_HEADER]: assignee.employeeId,
    [LEAD_ID_HEADER]: lead.leadId };
  const person = leadData(finalFields);
  const existingFields = lead.sheetFields instanceof Map ? Object.fromEntries(lead.sheetFields) : (lead.sheetFields || {});
  if (JSON.stringify(existingFields) !== JSON.stringify(finalFields) ||
      JSON.stringify(lead.sheetFieldOrder || []) !== JSON.stringify(Object.keys(finalFields)) ||
      lead.sheetRowNumber !== rowNumber) {
    await Lead.updateOne({ _id: lead._id }, { $set: {
      sheetFields: finalFields, sheetFieldOrder: Object.keys(finalFields), sheetRowNumber: rowNumber,
      name: person.name, ...(person.phone ? { phone: person.phone } : {}), city: person.city
    } });
  }
  return { success: true, data: {
    status, leadId: lead.leadId, assignedEmployeeId: assignee.employeeId,
    assignedEmployeeName: assignee.fullName, sheetRowNumber: rowNumber
  } };
}

function rowFingerprint(headers, row) {
  return crypto.createHash("sha256").update(JSON.stringify([headers, row])).digest("base64url");
}

async function runSync(force = false) {
  await connectDatabase();
  const settings = await LeadSheetSettings.findOne({ key: SETTINGS_KEY }).lean();
  if (!settings?.spreadsheetId || !settings.employeeIds?.length) {
    return { success: false, message: "Save a Sheet link and select at least one employee first." };
  }
  let importedCount = 0;
  let skippedCount = 0;
  let pendingCount = 0;
  try {
    const employees = await activeSelectedEmployees(settings.employeeIds);
    if (!employees.length) throw new Error("None of the selected sales employees is active.");
    const { tab, tabName, rows } = await readSheet(settings);
    if (!rows.length) throw new Error("The Sheet needs a header row before leads can be imported.");
    const sourceWidth = rows.reduce((width, row) => Math.max(width, row.length), 0);
    const sourceHeaders = Array.from({ length: sourceWidth }, (_, index) => rows[0][index] || "");
    const headers = uniqueHeaders(await ensureAssignmentHeaders(settings, tabName, sourceHeaders));
    const assignedIndex = headerIndex(headers, ASSIGNEE_HEADER);
    const assignedIdIndex = headerIndex(headers, ASSIGNEE_ID_HEADER);
    const globalIdIndex = headerIndex(headers, LEAD_ID_HEADER);
    const sourceSettings = { ...settings, sheetTabId: tab.sheetId };
    const assigneeCache = new Map(employees.map(employee => [employee.employeeId, employee]));
    const pendingWrites = [];
    const markHandled = (cacheKey, row, kind = "handled") => rowCache.set(cacheKey, {
      fingerprint: rowFingerprint(headers, row), expiresAt: Date.now() + ROW_CACHE_MS, kind
    });
    const persistRow = async item => {
      const { lead, finalFields, currentLeadData, rowNumber, row, cacheKey } = item;
      const existingFields = lead.sheetFields instanceof Map ? Object.fromEntries(lead.sheetFields) : (lead.sheetFields || {});
      const changes = JSON.stringify(existingFields) !== JSON.stringify(finalFields) ||
        JSON.stringify(lead.sheetFieldOrder || []) !== JSON.stringify(headers) ||
        lead.sheetRowNumber !== rowNumber || lead.name !== currentLeadData.name ||
        (currentLeadData.phone && lead.phone !== currentLeadData.phone) || lead.city !== currentLeadData.city;
      if (changes) await Lead.updateOne({ _id: lead._id }, { $set: {
        sheetFields: finalFields, sheetFieldOrder: headers, sheetRowNumber: rowNumber,
        name: currentLeadData.name,
        ...(currentLeadData.phone ? { phone: currentLeadData.phone } : {}),
        city: currentLeadData.city
      } });
      markHandled(cacheKey, row);
    };
    const flushWrites = async () => {
      if (!pendingWrites.length) return;
      const batch = pendingWrites.splice(0, pendingWrites.length);
      await writeRows(settings, tabName, batch);
      for (const item of batch) {
        for (const [columnIndex, value] of item.cells) item.row[columnIndex] = value;
        await persistRow(item);
      }
    };
    for (let i = 1; i < rows.length; i += 1) {
      const rowNumber = i + 1;
      const row = rows[i];
      const meaningful = row.some((value, index) => clean(value) && ![assignedIndex, assignedIdIndex, globalIdIndex].includes(index));
      if (!meaningful) continue;
      const cacheKey = `${settings.spreadsheetId}:${tab.sheetId}:${rowNumber}`;
      const fingerprint = rowFingerprint(headers, row);
      const cached = rowCache.get(cacheKey);
      if (!force && cached?.fingerprint === fingerprint && cached.expiresAt > Date.now()) {
        if (cached.kind === "pending") pendingCount += 1;
        else skippedCount += 1;
        continue;
      }
      const fields = fieldsForRow(headers, row);
      const lookup = await findSheetLead(sourceSettings, rowNumber, fields);
      if (lookup.conflict) { pendingCount += 1; markHandled(cacheKey, row, "pending"); continue; }
      const { key, globalId } = lookup;
      let lead = lookup.lead;
      if (!lead && clean(row[assignedIndex])) { skippedCount += 1; markHandled(cacheKey, row, "skipped"); continue; }
      if (!lead) {
        const person = leadData(fields);
        if (!/^[0-9]{10}$/.test(person.phone)) { pendingCount += 1; markHandled(cacheKey, row, "pending"); continue; }
        const rotation = await LeadSheetSettings.findOneAndUpdate({ key: SETTINGS_KEY }, { $inc: { nextEmployeeIndex: 1 } }, { new: false }).lean();
        const employee = employees[(rotation?.nextEmployeeIndex || 0) % employees.length];
        try {
          lead = await Lead.create({
            leadId: globalId || `SHEET${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
            ...person,
            source: "Google Sheet",
            sheetFields: fields,
            sheetFieldOrder: headers,
            sheetSourceKey: key,
            sheetSpreadsheetId: settings.spreadsheetId,
            sheetTabId: tab.sheetId,
            sheetRowNumber: rowNumber,
            assignedEmployeeId: employee.employeeId,
            marketingAssignedTlId: employee.designation === "TL" ? employee.employeeId : employee.teamLeadId || "",
            assignmentStage: employee.designation,
            assignedAt: new Date(),
            firstCallDeadline: null,
            returnedToMarketingAt: null,
            status: "New"
          });
          lead = lead.toObject();
          importedCount += 1;
          await sendLeadAssignment(employee, lead, "Google Sheet");
        } catch (error) {
          if (error.code !== 11000) throw error;
          lead = await Lead.findOne({ sheetSourceKey: key }).lean();
          if (!lead) throw error;
        }
      } else skippedCount += 1;
      let assignee = assigneeCache.get(lead.assignedEmployeeId);
      if (!assignee) {
        assignee = await Employee.findOne({ employeeId: lead.assignedEmployeeId }).select({ fullName: 1, employeeId: 1 }).lean();
        if (assignee) assigneeCache.set(lead.assignedEmployeeId, assignee);
      }
      if (!assignee) { pendingCount += 1; markHandled(cacheKey, row, "pending"); continue; }
      const cells = [];
      if (clean(row[assignedIndex]) !== assignee.fullName) cells.push([assignedIndex, assignee.fullName]);
      if (clean(row[assignedIdIndex]) !== assignee.employeeId) cells.push([assignedIdIndex, assignee.employeeId]);
      if (clean(row[globalIdIndex]) !== lead.leadId) cells.push([globalIdIndex, lead.leadId]);
      const finalFields = { ...fields,
        [headers[assignedIndex]]: assignee.fullName,
        [headers[assignedIdIndex]]: assignee.employeeId,
        [headers[globalIdIndex]]: lead.leadId };
      const currentLeadData = leadData(finalFields);
      const item = { lead, finalFields, currentLeadData, rowNumber, row, cacheKey, cells };
      if (cells.length) {
        pendingWrites.push(item);
        if (pendingWrites.length >= 100) await flushWrites();
      } else await persistRow(item);
    }
    await flushWrites();
    const saved = await LeadSheetSettings.findOneAndUpdate({ key: SETTINGS_KEY }, {
      $set: { lastSyncAt: new Date(), lastError: "", lastImportedCount: importedCount, lastPendingCount: pendingCount }
    }, { new: true }).lean();
    return { success: true, data: await publicSettings(saved, { importedCount, skippedCount, pendingCount }), message: `Imported ${importedCount} new lead${importedCount === 1 ? "" : "s"}.` };
  } catch (error) {
    rowCache.clear();
    const message = clean(error.message) || "Lead Sheet sync failed.";
    await LeadSheetSettings.updateOne({ key: SETTINGS_KEY }, { $set: { lastError: message, lastImportedCount: importedCount, lastPendingCount: pendingCount } });
    return { success: false, message, data: { importedCount, skippedCount, pendingCount } };
  }
}

async function syncLeadSheet(payload = {}) {
  if (!syncPromise) syncPromise = runSync(Boolean(payload._dashboardSession)).finally(() => { syncPromise = null; });
  return syncPromise;
}

module.exports = { getLeadSheetSettings, updateLeadSheetSettings, syncLeadSheet, receiveLeadSheetWebhook };
