const crypto = require("crypto");
const Employee = require("../models/Employee");
const CallLogRequest = require("../models/CallLogRequest");
const { connectDatabase } = require("../db/connection");
const { sendCallLogRequest } = require("./push-notification.service");

const REQUEST_TTL_MS = 5 * 60 * 1000;
const clean = value => String(value || "").trim();
const today = () => new Date().toISOString().slice(0, 10);
function serialize(request) {
  const item = request.toObject ? request.toObject() : request;
  return { requestId: item.requestId, date: item.date, createdAt: item.createdAt, expiresAt: item.expiresAt, complete: item.results.every(row => row.status !== "Pending"), results: item.results };
}

async function requestCallLogStats(payload) {
  await connectDatabase();
  const ids = [...new Set((Array.isArray(payload.employeeIds) ? payload.employeeIds : []).map(clean).filter(Boolean))];
  if (!ids.length) return { success: false, message: "Select at least one employee." };
  const employees = await Employee.find({ employeeId: { $in: ids }, status: "Active" }).lean();
  const employeeMap = new Map(employees.map(employee => [employee.employeeId, employee]));
  const requestId = crypto.randomUUID();
  const results = ids.map(employeeId => {
    const employee = employeeMap.get(employeeId);
    return employee ? { employeeId, name: employee.fullName, department: employee.department || "-", designation: employee.designation || "-", status: "Pending", message: employee.pushToken ? "Waiting for phone" : "Waiting for background sync" } : { employeeId, name: employeeId, department: "-", designation: "-", status: "Unavailable", message: "Active employee not found" };
  });
  const request = await CallLogRequest.create({ requestId, date: clean(payload.date) || today(), results, expiresAt: new Date(Date.now() + REQUEST_TTL_MS) });
  await Promise.all(employees.filter(employee => employee.pushToken).map(async employee => {
    if (!(await sendCallLogRequest(employee, requestId, request.date))) await CallLogRequest.updateOne({ requestId, "results.employeeId": employee.employeeId }, { $set: { "results.$.message": "Waiting for background sync" } });
  }));
  return { success: true, data: serialize(await CallLogRequest.findOne({ requestId }).lean()) };
}

async function submitCallLogStats(payload) {
  await connectDatabase();
  const requestId = clean(payload.requestId), employeeId = clean(payload.employeeId), androidId = clean(payload.androidId);
  const employee = await Employee.findOne({ employeeId, registeredAndroidId: androidId, status: "Active" }).select("_id").lean();
  if (!employee) return { success: false, message: "Employee device verification failed." };
  const stats = payload.stats || {}, error = clean(payload.error);
  const result = await CallLogRequest.updateOne({ requestId, expiresAt: { $gt: new Date() }, results: { $elemMatch: { employeeId, status: "Pending" } } }, { $set: {
    "results.$.status": error ? "Unavailable" : "Received", "results.$.message": error,
    "results.$.totalCalls": Math.max(0, Number(stats.totalCalls) || 0), "results.$.outgoingCalls": Math.max(0, Number(stats.outgoingCalls) || 0),
    "results.$.incomingCalls": Math.max(0, Number(stats.incomingCalls) || 0), "results.$.missedCalls": Math.max(0, Number(stats.missedCalls) || 0),
    "results.$.totalDurationSeconds": Math.max(0, Number(stats.totalDurationSeconds) || 0), "results.$.receivedAt": new Date()
  } });
  return { success: result.modifiedCount === 1, message: result.modifiedCount === 1 ? "Call totals received." : "Realtime request expired, completed, or was not found." };
}

async function getCallLogStatsRequest(payload) {
  await connectDatabase(); const request = await CallLogRequest.findOne({ requestId: clean(payload.requestId), expiresAt: { $gt: new Date() } }).lean();
  return request ? { success: true, data: serialize(request) } : { success: false, message: "Realtime request expired or was not found." };
}

async function getPendingCallLogRequests(payload) {
  await connectDatabase(); const employeeId = clean(payload.employeeId);
  const requests = await CallLogRequest.find({ expiresAt: { $gt: new Date() }, results: { $elemMatch: { employeeId, status: "Pending" } } }).select("requestId date expiresAt").lean();
  return { success: true, data: requests.map(request => ({ requestId: request.requestId, date: request.date, expiresAt: request.expiresAt })) };
}

module.exports = { requestCallLogStats, submitCallLogStats, getCallLogStatsRequest, getPendingCallLogRequests };
