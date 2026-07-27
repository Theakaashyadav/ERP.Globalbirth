const AppFeedback = require("../models/AppFeedback");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");

const clean = value => String(value || "").trim();

async function submitAppFeedback(payload) {
  await connectDatabase();
  const errorMessage = clean(payload.errorMessage).slice(0, 3000);
  if (!errorMessage) return { success: false, message: "Error message is required." };
  const feedback = await AppFeedback.create({
    employeeId: clean(payload.employeeId), androidId: clean(payload.androidId), errorMessage,
    screen: clean(payload.screen) || "Unknown screen",
    actionAttempted: clean(payload.actionAttempted) || "Unknown action",
    appVersion: clean(payload.appVersion), deviceModel: clean(payload.deviceModel),
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date()
  });
  return { success: true, data: { id: String(feedback._id) }, message: "Feedback sent to Admin." };
}

async function getAppFeedback() {
  await connectDatabase();
  const [feedback, employees] = await Promise.all([
    AppFeedback.find({}).sort({ occurredAt: -1 }).lean(),
    Employee.find({}).select({ employeeId: 1, fullName: 1, phone: 1 }).lean()
  ]);
  const byId = new Map(employees.map(item => [item.employeeId, item]));
  return { success: true, data: feedback.map(item => {
    const employee = byId.get(item.employeeId);
    return { id: String(item._id), employeeId: item.employeeId, employeeName: employee?.fullName || "Unknown employee", phone: employee?.phone || "", errorMessage: item.errorMessage, screen: item.screen, actionAttempted: item.actionAttempted, appVersion: item.appVersion, deviceModel: item.deviceModel, occurredAt: item.occurredAt, createdAt: item.createdAt };
  }) };
}

async function deleteAllAppFeedback() {
  await connectDatabase();
  const result = await AppFeedback.deleteMany({});
  return { success: true, data: { deletedCount: result.deletedCount }, message: `${result.deletedCount} previous feedback report(s) deleted.` };
}

module.exports = { submitAppFeedback, getAppFeedback, deleteAllAppFeedback };
