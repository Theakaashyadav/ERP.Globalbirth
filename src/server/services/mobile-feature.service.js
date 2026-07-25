const Employee = require("../models/Employee");
const MobileFeaturePolicy = require("../models/MobileFeaturePolicy");
const { connectDatabase } = require("../db/connection");

const FEATURES = ["attendance", "leads", "alerts", "profile", "officeWifi"];
const DEFAULT_ROLES = {
  tl: [...FEATURES],
  executive: [...FEATURES],
  hr: [...FEATURES],
  backend: [...FEATURES]
};

function employeeRole(employee) {
  const department = String(employee?.department || "").trim().toLowerCase();
  const designation = String(employee?.designation || "").trim().toLowerCase();
  if (department === "sales" && designation === "tl") return "tl";
  if (department === "sales" && designation === "executive") return "executive";
  if (department === "hr") return "hr";
  return "backend";
}

function normalizeRoles(roles = []) {
  const saved = new Map(roles.map(item => [item.role, item.features]));
  return Object.entries(DEFAULT_ROLES).map(([role, defaults]) => ({
    role,
    features: (saved.get(role) || defaults).filter(feature => FEATURES.includes(feature))
  }));
}

async function readPolicy() {
  const policy = await MobileFeaturePolicy.findOne({ policyKey: "mobile-dashboard" }).lean();
  return normalizeRoles(policy?.roles);
}

async function getMobileFeatureSettings() {
  await connectDatabase();
  return { success: true, data: { features: FEATURES, roles: await readPolicy() } };
}

async function updateMobileFeatureSettings(payload) {
  await connectDatabase();
  const roles = normalizeRoles(Array.isArray(payload.roles) ? payload.roles : []);
  await MobileFeaturePolicy.updateOne(
    { policyKey: "mobile-dashboard" },
    { $set: { roles }, $setOnInsert: { policyKey: "mobile-dashboard" } },
    { upsert: true }
  );
  return { success: true, data: { features: FEATURES, roles }, message: "Mobile feature access updated." };
}

async function getEmployeeMobileFeatures(payload) {
  await connectDatabase();
  const employeeId = String(payload.employeeId || "").trim();
  const androidId = String(payload.androidId || "").trim();
  const employee = await Employee.findOne({ employeeId }).lean();
  if (!employee) return { success: false, message: "Employee not found." };
  if (String(employee.status || "").toLowerCase() !== "active") return { success: false, message: "Employee account is inactive." };
  if (!androidId || String(employee.registeredAndroidId || "") !== androidId) return { success: false, message: "Android device verification failed." };
  const role = employeeRole(employee);
  const roles = await readPolicy();
  return { success: true, data: { role, features: roles.find(item => item.role === role)?.features || [] } };
}

async function hasEmployeeFeature(employee, feature) {
  const roles = await readPolicy();
  const role = employeeRole(employee);
  return Boolean(roles.find(item => item.role === role)?.features.includes(feature));
}

module.exports = { getMobileFeatureSettings, updateMobileFeatureSettings, getEmployeeMobileFeatures, hasEmployeeFeature };
