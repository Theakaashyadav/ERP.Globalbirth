const crypto = require("crypto");
const OfficeWifiPolicy = require("../models/OfficeWifiPolicy");
const Employee = require("../models/Employee");
const mobileFeatures = require("./mobile-feature.service");
const { connectDatabase } = require("../db/connection");

const clean = value => String(value || "").trim();
const cleanSsid = value => clean(value).replace(/^"|"$/g, "");
const cleanBssid = value => clean(value).toLowerCase();

function normalizeOffice(item = {}) {
  const active = item.active === true;
  const office = {
    officeId: clean(item.officeId) || crypto.randomUUID(),
    name: clean(item.name),
    ssid: cleanSsid(item.ssid),
    bssid: cleanBssid(item.bssid),
    privateIp: clean(item.privateIp),
    ipPrefix: clean(item.ipPrefix),
    active,
    status: active ? "approved" : (clean(item.status).toLowerCase() === "rejected" ? "rejected" : "pending"),
    submittedByEmployeeId: clean(item.submittedByEmployeeId),
    submittedAt: item.submittedAt || null,
    reviewedAt: active || clean(item.status).toLowerCase() === "rejected" ? new Date() : null
  };
  if (!office.name) throw new Error("Every office needs a name.");
  if (!office.ssid && !office.bssid && !office.ipPrefix) throw new Error(`${office.name} needs an SSID, router BSSID or IP prefix.`);
  if (office.bssid && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(office.bssid)) throw new Error(`${office.name} has an invalid router BSSID.`);
  if (office.ipPrefix && !/^\d{1,3}(\.\d{1,3}){1,3}\.?$/.test(office.ipPrefix)) throw new Error(`${office.name} has an invalid IP prefix.`);
  return office;
}

function defaultOffices() {
  const ipPrefix = clean(process.env.DEFAULT_OFFICE_WIFI_IP_PREFIX || "192.168.1.");
  return [{ officeId: "main-office", name: "Main Office", ssid: "", bssid: "", privateIp: "", ipPrefix, active: true, status: "approved", submittedByEmployeeId: "", submittedAt: null, reviewedAt: new Date() }];
}

async function readPolicy() {
  let policy = await OfficeWifiPolicy.findOne({ policyKey: "office-wifi" }).lean();
  if (!policy) {
    policy = await OfficeWifiPolicy.findOneAndUpdate(
      { policyKey: "office-wifi" },
      { $setOnInsert: { policyKey: "office-wifi", offices: defaultOffices() } },
      { upsert: true, new: true, lean: true }
    );
  }
  return policy;
}

async function getOfficeWifiSettings() {
  await connectDatabase();
  const policy = await readPolicy();
  return { success: true, data: { offices: policy.offices || [], updatedAt: policy.updatedAt } };
}

async function updateOfficeWifiSettings(payload) {
  await connectDatabase();
  const offices = (Array.isArray(payload.offices) ? payload.offices : []).map(normalizeOffice);
  const ids = new Set();
  for (const office of offices) {
    if (ids.has(office.officeId)) office.officeId = crypto.randomUUID();
    ids.add(office.officeId);
  }
  const policy = await OfficeWifiPolicy.findOneAndUpdate(
    { policyKey: "office-wifi" }, { $set: { offices }, $setOnInsert: { policyKey: "office-wifi" } },
    { upsert: true, new: true, lean: true, runValidators: true }
  );
  return { success: true, data: { offices: policy.offices, updatedAt: policy.updatedAt }, message: "Office Wi-Fi settings updated." };
}

async function getEmployeeOfficeWifiSettings(payload) {
  await connectDatabase();
  const policy = await readPolicy();
  const employeeId = clean(payload.employeeId);
  return { success: true, data: { offices: (policy.offices || []).filter(office => office.active && (office.status === "approved" || !office.status)), wifiVerificationExempt: (policy.exemptEmployeeIds || []).includes(employeeId) } };
}

async function getAttendanceWifiExemptions() {
  await connectDatabase();
  const [policy, employees] = await Promise.all([
    readPolicy(),
    Employee.find({ status: "Active" }).select("employeeId fullName department designation").sort({ fullName: 1 }).lean()
  ]);
  return { success: true, data: { exemptEmployeeIds: policy.exemptEmployeeIds || [], employees: employees.map(item => ({ employeeId: item.employeeId, fullName: item.fullName, department: item.department || "Unassigned", designation: item.designation || "" })) } };
}

async function updateAttendanceWifiExemptions(payload) {
  await connectDatabase();
  const requested = [...new Set((Array.isArray(payload.employeeIds) ? payload.employeeIds : []).map(clean).filter(Boolean))];
  const activeEmployees = requested.length ? await Employee.find({ employeeId: { $in: requested }, status: "Active" }).select("employeeId").lean() : [];
  const exemptEmployeeIds = activeEmployees.map(item => item.employeeId);
  await OfficeWifiPolicy.findOneAndUpdate(
    { policyKey: "office-wifi" },
    { $set: { exemptEmployeeIds }, $setOnInsert: { policyKey: "office-wifi", offices: defaultOffices() } },
    { upsert: true, new: true, runValidators: true }
  );
  return { success: true, data: { exemptEmployeeIds }, message: `${exemptEmployeeIds.length} employee(s) can mark attendance without office Wi-Fi.` };
}

async function isEmployeeExempt(employeeId) {
  await connectDatabase();
  const policy = await readPolicy();
  return (policy.exemptEmployeeIds || []).includes(clean(employeeId));
}

async function submitOfficeWifi(payload) {
  await connectDatabase();
  const employeeId = clean(payload.employeeId);
  const employee = await Employee.findOne({ employeeId, status: "Active" }).lean();
  if (!employee || !(await mobileFeatures.hasEmployeeFeature(employee, "officeWifi"))) return { success: false, message: "Set Office Wi-Fi is not enabled for your role." };
  if (!cleanSsid(payload.ssid) || !cleanBssid(payload.bssid) || !clean(payload.privateIp) || !clean(payload.ipPrefix)) return { success: false, message: "Complete Wi-Fi name, BSSID and private IP details are required." };
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(clean(payload.privateIp))) return { success: false, message: "The captured private IPv4 address is invalid." };
  const office = normalizeOffice({
    officeId: crypto.randomUUID(), name: payload.name, ssid: payload.ssid,
    bssid: payload.bssid, privateIp: payload.privateIp, ipPrefix: payload.ipPrefix, active: false,
    status: "pending", submittedByEmployeeId: employeeId, submittedAt: new Date()
  });
  office.active = false; office.status = "pending"; office.submittedAt = new Date(); office.reviewedAt = null;
  const policy = await readPolicy();
  const duplicate = (policy.offices || []).find(item =>
    cleanSsid(item.ssid).toLowerCase() === office.ssid.toLowerCase() && cleanBssid(item.bssid) === office.bssid && clean(item.ipPrefix) === office.ipPrefix
  );
  if (duplicate) return { success: false, message: duplicate.active ? "This Wi-Fi is already approved." : "This Wi-Fi is already waiting for admin approval." };
  await OfficeWifiPolicy.updateOne({ policyKey: "office-wifi" }, { $push: { offices: office } });
  return { success: true, data: office, message: "Wi-Fi submitted. Admin approval is required before attendance can use it." };
}

async function getEmployeeWifiSubmissions(payload) {
  await connectDatabase();
  const policy = await readPolicy();
  return { success: true, data: { offices: (policy.offices || []).filter(item => item.submittedByEmployeeId === clean(payload.employeeId)) } };
}

async function isActiveOffice(officeId) {
  await connectDatabase();
  const policy = await readPolicy();
  return (policy.offices || []).some(office => office.active && office.officeId === clean(officeId));
}

async function verifyActiveOfficeNetwork(officeId, network = {}) {
  await connectDatabase();
  const policy = await readPolicy();
  const office = (policy.offices || []).find(item => item.active && item.officeId === clean(officeId));
  if (!office) return false;
  const ssid = cleanSsid(network.ssid).toLowerCase(), bssid = cleanBssid(network.bssid), privateIp = clean(network.privateIp);
  if (!ssid && !bssid && !privateIp) return true;
  const ssidMatches = Boolean(cleanSsid(office.ssid)) && ssid === cleanSsid(office.ssid).toLowerCase();
  const bssidMatches = Boolean(cleanBssid(office.bssid)) && bssid === cleanBssid(office.bssid);
  const networkMatches = Boolean(clean(office.ipPrefix)) && privateIp.startsWith(clean(office.ipPrefix));
  return bssidMatches || (ssidMatches && (!clean(office.ipPrefix) || networkMatches)) || (!cleanSsid(office.ssid) && networkMatches);
}

module.exports = { getOfficeWifiSettings, updateOfficeWifiSettings, getEmployeeOfficeWifiSettings, getAttendanceWifiExemptions, updateAttendanceWifiExemptions, isEmployeeExempt, submitOfficeWifi, getEmployeeWifiSubmissions, isActiveOffice, verifyActiveOfficeNetwork };
