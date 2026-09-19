const CONTROL_HEADERS = [
  "Assigned Employee",
  "Assigned Employee ID",
  "GlobalOne Lead ID",
  "GlobalOne Sharing Status",
  "GlobalOne Notification Status",
  "GlobalOne Synced Hash"
];

// Meta's export columns describe the advert and the submission, not the
// customer's answers. Everything else is kept so new form questions appear
// without a deployment or a question-name allowlist.
const META_TRACKING_HEADERS = [
  "id", "lead_id", "meta_lead_id", "facebook_lead_id", "created_time",
  "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id",
  "campaign_name", "form_id", "form_name", "is_organic", "platform",
  "page_id", "page_name", "account_id", "account_name"
];

function normalizeSheetHeader(value) {
  return String(value ?? "").trim().replace(/\s*\(\d+\)$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const controlNames = new Set(CONTROL_HEADERS.map(normalizeSheetHeader));
const trackingNames = new Set(META_TRACKING_HEADERS.map(normalizeSheetHeader));

function isControlHeader(header) { return controlNames.has(normalizeSheetHeader(header)); }
function isEmployeeVisibleHeader(header) {
  const normalized = normalizeSheetHeader(header);
  return Boolean(normalized) && !controlNames.has(normalized) && !trackingNames.has(normalized);
}

function employeeSheetData(fields, fieldOrder) {
  const allFields = fields instanceof Map ? Object.fromEntries(fields) : (fields || {});
  const allOrder = Array.isArray(fieldOrder) && fieldOrder.length ? fieldOrder : Object.keys(allFields);
  const order = [...new Set([...allOrder, ...Object.keys(allFields)])]
    .filter(header => Object.hasOwn(allFields, header) && isEmployeeVisibleHeader(header));
  return {
    sheetFields: Object.fromEntries(order.map(header => [header, allFields[header]])),
    sheetFieldOrder: order
  };
}

module.exports = { CONTROL_HEADERS, isControlHeader, employeeSheetData };
