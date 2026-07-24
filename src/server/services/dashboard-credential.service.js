const bcrypt = require("bcryptjs");
const DashboardCredential = require("../models/DashboardCredential");
const { dashboardUsers } = require("../config");
const { connectDatabase } = require("../db/connection");
const ROLES = ["admin", "hr", "marketing"];

async function ensureCredentials() {
  await connectDatabase();
  const existingRoles = new Set((await DashboardCredential.find({ role: { $in: ROLES } }).select("role").lean()).map(item => item.role));
  for (const role of ROLES.filter(value => !existingRoles.has(value))) {
    const configured = dashboardUsers[role];
    await DashboardCredential.updateOne({ role }, { $setOnInsert: { role, username: configured.username, passwordHash: await bcrypt.hash(configured.password, 10), displayName: configured.name } }, { upsert: true });
  }
}
async function authenticate(role, username, password) {
  await ensureCredentials();
  const item = await DashboardCredential.findOne({ role, username: String(username || "").trim() }).select("+passwordHash").lean();
  if (!item || !(await bcrypt.compare(String(password || ""), item.passwordHash))) return null;
  return { role: item.role, username: item.username, name: item.displayName };
}
async function getDashboardCredentials() {
  await ensureCredentials();
  const records = await DashboardCredential.find({ role: { $in: ROLES } }).select("role username displayName updatedAt").lean();
  const byRole = new Map(records.map(item => [item.role, item]));
  return { success: true, data: ROLES.map(role => ({ role, username: byRole.get(role)?.username || "", displayName: byRole.get(role)?.displayName || "", updatedAt: byRole.get(role)?.updatedAt || null })) };
}
async function updateDashboardCredential(payload) {
  await ensureCredentials();
  const role = String(payload.role || "").trim().toLowerCase(), username = String(payload.username || "").trim(), password = String(payload.password || "");
  if (!ROLES.includes(role)) return { success: false, message: "Invalid dashboard role." };
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) return { success: false, message: "Login ID must be 3-50 characters and use only letters, numbers, dot, underscore or hyphen." };
  if (password && password.length < 8) return { success: false, message: "New password must contain at least 8 characters." };
  if (await DashboardCredential.exists({ username, role: { $ne: role } })) return { success: false, message: "This login ID is already used by another dashboard." };
  const update = { username }; if (password) update.passwordHash = await bcrypt.hash(password, 10);
  const item = await DashboardCredential.findOneAndUpdate({ role }, { $set: update }, { new: true }).lean();
  return { success: Boolean(item), data: item ? { role, username: item.username, displayName: item.displayName, updatedAt: item.updatedAt } : null, message: item ? `${role.toUpperCase()} credentials updated.` : "Dashboard account not found." };
}
module.exports = { authenticate, getDashboardCredentials, updateDashboardCredential };
