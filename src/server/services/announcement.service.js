const Announcement = require("../models/Announcement");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");
const { sendCommonAlert } = require("./push-notification.service");
const clean = value => String(value || "").trim();
const map = item => ({ id: String(item._id), subject: item.subject, message: item.message, sentByRole: item.sentByRole, sentByName: item.sentByName, createdAt: item.createdAt });
const roles = ["admin", "hr", "marketing"];
const cutoff = () => new Date(Date.now() - 48 * 60 * 60 * 1000);
async function purgeExpired() { await Announcement.deleteMany({ createdAt: { $lt: cutoff() } }); }
function dashboardRole(payload) {
  const sessionRole = clean(payload?._dashboardSession?.role).toLowerCase();
  const requestedRole = clean(payload?.senderRole).toLowerCase();
  if (sessionRole === "admin" && roles.includes(requestedRole)) return requestedRole;
  if (roles.includes(sessionRole) && (!requestedRole || requestedRole === sessionRole)) return sessionRole;
  return "";
}
async function sendBroadcastAlert(payload) {
  await connectDatabase();
  await purgeExpired();
  const subject = clean(payload.subject), message = clean(payload.message), session = payload._dashboardSession || {};
  if (!subject || !message) return { success: false, message: "Subject and full message are required." };
  if (subject.length > 150 || message.length > 5000) return { success: false, message: "Alert content is too long." };
  const authenticatedRole = clean(session.role).toLowerCase();
  const role = dashboardRole(payload);
  if (!role) return { success: false, message: "Sender role does not match this dashboard session." };
  const item = await Announcement.create({ subject, message, sentByRole: role, sentByName: role === authenticatedRole ? clean(session.name || session.username) : "" });
  const employees = await Employee.find({ status: "Active", pushToken: { $nin: [null, ""] } }).select("pushToken").lean();
  let notifiedDevices = 0;
  try {
    notifiedDevices = await sendCommonAlert(employees.map(employee => employee.pushToken), item);
  } catch (error) {
    console.error("Broadcast alert push delivery failed:", error.message);
  }
  return { success: true, data: { ...map(item), notifiedDevices }, message: "Alert sent to all active employees." };
}
async function getBroadcastAlerts(payload) {
  await connectDatabase(); await purgeExpired(); const role = dashboardRole(payload);
  if (!role) return { success: false, message: "Dashboard authorization failed." };
  return { success: true, data: (await Announcement.find({ sentByRole: role }).sort({ createdAt: -1 }).limit(200).lean()).map(map) };
}
async function deleteBroadcastAlert(payload) {
  await connectDatabase(); await purgeExpired(); const role = dashboardRole(payload), alertId = clean(payload.alertId);
  if (!role || !alertId) return { success: false, message: "Alert and dashboard authorization are required." };
  const result = await Announcement.deleteOne({ _id: alertId, sentByRole: role });
  return { success: result.deletedCount === 1, message: result.deletedCount === 1 ? "Alert deleted." : "Alert not found in this dashboard." };
}
async function getEmployeeAlerts(payload) {
  await connectDatabase(); await purgeExpired(); const employeeId = clean(payload.employeeId);
  const items = await Announcement.find({}).sort({ createdAt: -1 }).limit(200).lean();
  return { success: true, data: items.map(item => ({ ...map(item), isRead: (item.readByEmployeeIds || []).includes(employeeId) })) };
}
async function markAlertRead(payload) {
  await connectDatabase(); const employeeId = clean(payload.employeeId), alertId = clean(payload.alertId);
  const item = await Announcement.findByIdAndUpdate(alertId, { $addToSet: { readByEmployeeIds: employeeId } }, { new: true }).lean();
  return { success: Boolean(item), message: item ? "Alert marked as read." : "Alert not found." };
}
module.exports = { sendBroadcastAlert, getBroadcastAlerts, deleteBroadcastAlert, getEmployeeAlerts, markAlertRead };
