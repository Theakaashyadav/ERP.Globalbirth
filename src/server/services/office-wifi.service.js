const crypto = require("crypto");
const OfficeWifiPolicy = require("../models/OfficeWifiPolicy");
const { connectDatabase } = require("../db/connection");

const clean = value => String(value || "").trim();
const cleanSsid = value => clean(value).replace(/^"|"$/g, "");
const cleanBssid = value => clean(value).toLowerCase();

function normalizeOffice(item = {}) {
  const office = {
    officeId: clean(item.officeId) || crypto.randomUUID(),
    name: clean(item.name),
    ssid: cleanSsid(item.ssid),
    bssid: cleanBssid(item.bssid),
    ipPrefix: clean(item.ipPrefix),
    active: item.active !== false
  };
  if (!office.name) throw new Error("Every office needs a name.");
  if (!office.ssid && !office.bssid && !office.ipPrefix) throw new Error(`${office.name} needs an SSID, router BSSID or IP prefix.`);
  if (office.bssid && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(office.bssid)) throw new Error(`${office.name} has an invalid router BSSID.`);
  if (office.ipPrefix && !/^\d{1,3}(\.\d{1,3}){1,3}\.?$/.test(office.ipPrefix)) throw new Error(`${office.name} has an invalid IP prefix.`);
  return office;
}

function defaultOffices() {
  const ipPrefix = clean(process.env.DEFAULT_OFFICE_WIFI_IP_PREFIX || "192.168.1.");
  return [{ officeId: "main-office", name: "Main Office", ssid: "", bssid: "", ipPrefix, active: true }];
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

async function getEmployeeOfficeWifiSettings() {
  await connectDatabase();
  const policy = await readPolicy();
  return { success: true, data: { offices: (policy.offices || []).filter(office => office.active) } };
}

async function isActiveOffice(officeId) {
  await connectDatabase();
  const policy = await readPolicy();
  return (policy.offices || []).some(office => office.active && office.officeId === clean(officeId));
}

module.exports = { getOfficeWifiSettings, updateOfficeWifiSettings, getEmployeeOfficeWifiSettings, isActiveOffice };
