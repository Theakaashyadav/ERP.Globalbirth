const { randomUUID } = require("node:crypto");
const SalarySlip = require("../models/SalarySlip");
const SalaryProfile = require("../models/SalaryProfile");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");
const { period, slipPeriod, cleanValues, cleanRemovedFields, cleanDeductions, calculateTotals, profileValues, employeeDefaults } = require("./salary-slip-data");

const employeeFilter = employeeId => ({ $or: [{ employeeId }, { employeeId: { $exists: false }, "values.empCode": employeeId }, { employeeId: "", "values.empCode": employeeId }] });

function serialize(item) {
  const selected = slipPeriod(item);
  return {
    id: String(item._id), slipNumber: item.slipNumber, employeeId: item.employeeId || item.values?.empCode || "",
    month: selected?.month || null, year: selected?.year || null,
    values: item.values || {}, removedFields: item.removedFields || [], customDeductions: item.customDeductions || [],
    totals: item.totals || {}, generatedBy: item.generatedBy, createdAt: item.createdAt, updatedAt: item.updatedAt
  };
}

async function employeeSlips(employeeId) {
  return SalarySlip.find(employeeFilter(employeeId)).sort({ updatedAt: -1, _id: -1 }).lean();
}

async function getSalarySlips(payload = {}) {
  await connectDatabase();
  const items = await SalarySlip.find(payload.employeeId ? employeeFilter(String(payload.employeeId).trim()) : {}).sort({ updatedAt: -1 }).lean();
  return { success: true, data: items.map(serialize) };
}

async function getSalarySlipWorkspace(payload = {}) {
  const employeeId = String(payload.employeeId || "").trim();
  const selected = period(payload.month, payload.year);
  if (!employeeId || !selected) return { success: false, message: "Select an employee and a valid month and year." };
  await connectDatabase();
  const employee = await Employee.findOne({ employeeId }).lean();
  if (!employee) return { success: false, message: "Employee was not found in the employee list." };
  const [savedProfile, items] = await Promise.all([SalaryProfile.findOne({ employeeId }).lean(), employeeSlips(employeeId)]);
  const slip = items.find(item => slipPeriod(item)?.key === selected.key);
  const profile = savedProfile || items[0];
  const values = employeeDefaults(employee, profile, selected);
  return { success: true, data: {
    defaults: { values, removedFields: cleanRemovedFields(profile?.removedFields), customDeductions: [] },
    hasSavedDetails: Boolean(profile), slip: slip ? serialize(slip) : null, history: items.map(serialize)
  } };
}

async function saveSalarySlip(payload = {}) {
  const employeeId = String(payload.employeeId || "").trim();
  const selected = period(payload.month, payload.year);
  if (!employeeId || !selected) return { success: false, message: "Select an employee and a valid month and year." };
  let values, removedFields, customDeductions, totals;
  try {
    values = { ...cleanValues(payload.values), monthYear: selected.monthYear };
    removedFields = cleanRemovedFields(payload.removedFields);
    customDeductions = cleanDeductions(payload.customDeductions);
    totals = calculateTotals(values, removedFields, customDeductions);
    for (const key of ["paidDays", "leaveDays"]) {
      if (!removedFields.includes(key) && (Number(values[key]) < 0 || !Number.isFinite(Number(values[key])))) throw new Error("Paid days and leave must be non-negative numbers.");
    }
  } catch (error) { return { success: false, message: error.message }; }
  await connectDatabase();
  if (!await Employee.findOne({ employeeId }).lean()) return { success: false, message: "Employee was not found in the employee list." };
  await SalarySlip.init();
  const items = await employeeSlips(employeeId);
  const existing = items.find(item => slipPeriod(item)?.key === selected.key);
  const session = payload._dashboardSession || {};
  const update = {
    employeeId, month: selected.month, year: selected.year, periodKey: `${employeeId}:${selected.key}`,
    values, removedFields, customDeductions, totals,
    generatedBy: String(session.name || session.username || session.role || "HR").slice(0, 100)
  };
  let item;
  if (payload.slipId) {
    if (!/^[a-f\d]{24}$/i.test(String(payload.slipId))) return { success: false, message: "Saved salary slip was not found." };
    const target = items.find(row => String(row._id) === payload.slipId);
    if (!target) return { success: false, message: "This salary slip does not belong to the selected employee." };
    const targetPeriod = slipPeriod(target);
    if ((targetPeriod && targetPeriod.key !== selected.key) || (existing && String(existing._id) !== payload.slipId)) return { success: false, message: "Select the original month to edit this slip. A different month needs its own slip." };
    try {
      item = await SalarySlip.findOneAndUpdate({ _id: payload.slipId, ...employeeFilter(employeeId) }, { $set: update }, { new: true, runValidators: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      return { success: false, message: "A salary slip already exists for this month. Reload it before editing." };
    }
    if (!item) return { success: false, message: "Saved salary slip was not found." };
  } else {
    if (existing) return { success: true, message: "A slip already exists for this month. Its saved details have been opened for editing.", data: serialize(existing) };
    const slipNumber = `SAL-${selected.key}-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      item = await SalarySlip.findOneAndUpdate({ periodKey: update.periodKey }, { $setOnInsert: { ...update, slipNumber } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;
      item = await SalarySlip.findOne({ periodKey: update.periodKey }).lean();
      if (!item) throw error;
    }
    if (item.slipNumber !== slipNumber) return { success: true, message: "A slip was just generated for this month. Its saved details have been opened for editing.", data: serialize(item) };
  }
  try {
    await SalaryProfile.findOneAndUpdate({ employeeId }, { $set: { values: profileValues(values), removedFields } }, { upsert: true, runValidators: true });
  } catch (error) {
    return { success: true, message: "Salary slip saved. Employee defaults could not be updated; save again to retry.", data: serialize(item) };
  }
  return { success: true, message: "Salary slip and employee details saved successfully.", data: serialize(item) };
}

module.exports = { getSalarySlips, getSalarySlipWorkspace, saveSalarySlip };
