const crypto = require("crypto");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");
const { sendCallLogRequest } = require("./push-notification.service");

const requests = new Map();
const REQUEST_TTL_MS = 5 * 60 * 1000;

function clean(value) { return String(value || "").trim(); }
function today() { return new Date().toISOString().slice(0, 10); }
function cleanup() {
  const cutoff = Date.now() - REQUEST_TTL_MS;
  for (const [id, request] of requests) if (request.createdAt < cutoff) requests.delete(id);
}
function serialize(request) {
  return {
    requestId: request.requestId,
    date: request.date,
    createdAt: new Date(request.createdAt).toISOString(),
    expiresAt: new Date(request.createdAt + REQUEST_TTL_MS).toISOString(),
    complete: Array.from(request.results.values()).every(row => row.status !== "Pending"),
    results: Array.from(request.results.values())
  };
}

async function requestCallLogStats(payload) {
  await connectDatabase();
  cleanup();
  const ids = [...new Set((Array.isArray(payload.employeeIds) ? payload.employeeIds : []).map(clean).filter(Boolean))];
  if (!ids.length) return { success: false, message: "Select at least one employee." };
  const employees = await Employee.find({ employeeId: { $in: ids }, status: "Active" }).lean();
  const requestId = crypto.randomUUID();
  const request = { requestId, date: clean(payload.date) || today(), createdAt: Date.now(), results: new Map() };
  for (const employee of employees) {
    request.results.set(employee.employeeId, {
      employeeId: employee.employeeId, name: employee.fullName, department: employee.department || "-",
      designation: employee.designation || "-", status: "Pending",
      message: employee.pushToken ? "Waiting for phone" : "Waiting for background sync",
      totalCalls: 0, outgoingCalls: 0, incomingCalls: 0, missedCalls: 0, totalDurationSeconds: 0
    });
  }
  for (const id of ids) if (!request.results.has(id)) request.results.set(id, { employeeId: id, name: id, department: "-", designation: "-", status: "Unavailable", message: "Active employee not found", totalCalls: 0, outgoingCalls: 0, incomingCalls: 0, missedCalls: 0, totalDurationSeconds: 0 });
  requests.set(requestId, request);
  await Promise.all(employees.filter(item => item.pushToken).map(async employee => {
    if (!(await sendCallLogRequest(employee, requestId, request.date))) request.results.get(employee.employeeId).message = "Waiting for background sync";
  }));
  return { success: true, data: serialize(request) };
}

async function submitCallLogStats(payload) {
  await connectDatabase();
  cleanup();
  const request = requests.get(clean(payload.requestId));
  const employeeId = clean(payload.employeeId);
  const androidId = clean(payload.androidId);
  if (!request || !request.results.has(employeeId)) return { success: false, message: "Realtime request expired or was not found." };
  const employee = await Employee.findOne({ employeeId, registeredAndroidId: androidId, status: "Active" }).lean();
  if (!employee) return { success: false, message: "Employee device verification failed." };
  const stats = payload.stats || {};
  const row = request.results.get(employeeId);
  Object.assign(row, {
    status: clean(payload.error) ? "Unavailable" : "Received", message: clean(payload.error),
    totalCalls: Math.max(0, Number(stats.totalCalls) || 0), outgoingCalls: Math.max(0, Number(stats.outgoingCalls) || 0),
    incomingCalls: Math.max(0, Number(stats.incomingCalls) || 0), missedCalls: Math.max(0, Number(stats.missedCalls) || 0),
    totalDurationSeconds: Math.max(0, Number(stats.totalDurationSeconds) || 0), receivedAt: new Date().toISOString()
  });
  return { success: true };
}

async function getCallLogStatsRequest(payload) {
  cleanup();
  const request = requests.get(clean(payload.requestId));
  return request ? { success: true, data: serialize(request) } : { success: false, message: "Realtime request expired or was not found." };
}

async function getPendingCallLogRequests(payload) {
  cleanup(); const employeeId = clean(payload.employeeId);
  const pending = [];
  for (const request of requests.values()) {
    const row = request.results.get(employeeId);
    if (row?.status === "Pending") pending.push({ requestId: request.requestId, date: request.date, expiresAt: new Date(request.createdAt + REQUEST_TTL_MS).toISOString() });
  }
  return { success: true, data: pending };
}

module.exports = { requestCallLogStats, submitCallLogStats, getCallLogStatsRequest, getPendingCallLogRequests };
