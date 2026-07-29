const SalarySlip = require("../models/SalarySlip");
const { connectDatabase } = require("../db/connection");

const fieldKeys = [
  "companyName", "address1", "address2", "monthYear", "empCode", "empName", "fhName", "designation", "department",
  "pfNo", "panNo", "bankNo", "esiNo", "doj", "uan", "paidDays", "leaveDays",
  "basic", "hra", "convey", "perAllo", "fuel", "uniform", "books", "driver", "arr1", "arr2", "arr3", "bonus", "dwage", "overtime",
  "epf", "esic", "advance", "itax", "lwfee", "ptax", "recot", "loan"
];
const earningKeys = ["basic", "hra", "convey", "perAllo", "fuel", "uniform", "books", "driver", "arr1", "arr2", "arr3", "bonus", "dwage", "overtime"];
const deductionKeys = ["epf", "esic", "advance", "itax", "lwfee", "ptax", "recot", "loan"];

function cleanValues(input = {}) {
  return Object.fromEntries(fieldKeys.map(key => [key, String(input[key] ?? "").trim().slice(0, 500)]));
}

function calculateTotals(values, removedFields) {
  const removed = new Set(removedFields);
  const sum = keys => keys.filter(key => !removed.has(key)).reduce((total, key) => total + (Number(values[key]) || 0), 0);
  const totalEarning = sum(earningKeys), totalDeduction = sum(deductionKeys);
  return { totalEarning, totalDeduction, netPay: totalEarning - totalDeduction };
}

function serialize(item) {
  return { id:String(item._id), slipNumber:item.slipNumber, values:item.values || {}, removedFields:item.removedFields || [], totals:item.totals || {}, generatedBy:item.generatedBy, createdAt:item.createdAt, updatedAt:item.updatedAt };
}

async function getSalarySlips() {
  await connectDatabase();
  const items = await SalarySlip.find({}).sort({ updatedAt:-1 }).lean();
  return { success:true, data:items.map(serialize) };
}

async function saveSalarySlip(payload = {}) {
  await connectDatabase();
  const values = cleanValues(payload.values);
  const removedFields = [...new Set((Array.isArray(payload.removedFields) ? payload.removedFields : []).filter(key => fieldKeys.includes(key)))];
  const totals = calculateTotals(values, removedFields);
  const session = payload._dashboardSession || {};
  const update = { values, removedFields, totals, generatedBy:String(session.name || session.username || session.role || "HR").slice(0, 100) };
  let item;
  if (payload.slipId) {
    item = await SalarySlip.findByIdAndUpdate(payload.slipId, { $set:update }, { new:true, runValidators:true }).lean();
    if (!item) return { success:false, message:"Saved salary slip was not found." };
  } else {
    const slipNumber = `SAL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    item = (await SalarySlip.create({ ...update, slipNumber })).toObject();
  }
  return { success:true, message:payload.slipId ? "Salary slip updated successfully." : "Salary slip generated and saved successfully.", data:serialize(item) };
}

module.exports = { getSalarySlips, saveSalarySlip };
