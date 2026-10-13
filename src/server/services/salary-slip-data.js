const detailKeys = ["companyName", "address1", "address2", "monthYear", "empCode", "empName", "employeeAddress", "fhName", "designation", "department", "pfNo", "panNo", "bankNo", "esiNo", "doj", "uan", "paidDays", "leaveDays"];
const earningKeys = ["basic", "hra", "convey", "perAllo", "fuel", "uniform", "books", "driver", "arr1", "arr2", "arr3", "bonus", "dwage", "overtime"];
const deductionKeys = ["epf", "esic", "advance", "itax", "lwfee", "ptax", "recot", "loan"];
const fieldKeys = [...detailKeys, ...earningKeys, ...deductionKeys];
const monthlyKeys = new Set(["monthYear", "paidDays", "leaveDays", ...deductionKeys]);
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function period(month, year) {
  month = Number(month); year = Number(year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 9999) return null;
  return { month, year, monthYear: `${months[month - 1]} ${year}`, key: `${year}-${String(month).padStart(2, "0")}` };
}

function slipPeriod(item) {
  if (item.month && item.year) return period(item.month, item.year);
  const text = String(item.values?.monthYear || "").trim();
  let match = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (match) return period(match[2], match[1]);
  match = text.match(/^(\d{1,2})[-/](\d{4})$/);
  if (match) return period(match[1], match[2]);
  match = text.match(/^([a-z]+)[\s,/-]+(\d{4})$/i);
  if (!match) { const reversed = text.match(/^(\d{4})[\s,/-]+([a-z]+)$/i); if (reversed) match = [reversed[0], reversed[2], reversed[1]]; }
  if (!match) return null;
  const month = months.findIndex(name => name.toLowerCase() === match[1].toLowerCase() || name.slice(0, 3).toLowerCase() === match[1].toLowerCase());
  return period(month + 1, match[2]);
}

function cleanValues(input = {}) {
  return Object.fromEntries(fieldKeys.map(key => [key, String(input?.[key] ?? "").trim().slice(0, 500)]));
}

function cleanRemovedFields(input) {
  return [...new Set((Array.isArray(input) ? input : []).filter(key => fieldKeys.includes(key) && key !== "monthYear"))];
}

function amount(value, label) {
  const number = value === "" || value == null ? 0 : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e9 || Math.abs(number * 100 - Math.round(number * 100)) > 0.001) throw new Error(`${label} must be a non-negative amount with at most two decimal places (maximum 1,000,000,000).`);
  return Math.round(number * 100);
}

function cleanDeductions(input = []) {
  if (!Array.isArray(input) || input.length > 50) throw new Error("Add up to 50 additional deductions.");
  return input.map((row, index) => {
    const label = String(row?.label || "").trim().slice(0, 160);
    if (!label) throw new Error(`Enter a label for deduction ${index + 1}.`);
    return { label, amount: amount(row?.amount, label) / 100 };
  });
}

function calculateTotals(values, removedFields = [], customDeductions = []) {
  const removed = new Set(removedFields);
  const sum = keys => keys.filter(key => !removed.has(key)).reduce((total, key) => total + amount(values[key], key), 0);
  const earned = sum(earningKeys);
  const deducted = sum(deductionKeys) + customDeductions.reduce((total, row) => total + amount(row.amount, row.label), 0);
  return { totalEarning: earned / 100, totalDeduction: deducted / 100, netPay: (earned - deducted) / 100 };
}

function profileValues(values) {
  return Object.fromEntries(Object.entries(cleanValues(values)).filter(([key]) => !monthlyKeys.has(key)));
}

function employeeDefaults(employee, profile, selectedPeriod) {
  return {
    ...cleanValues(), empCode: employee.employeeId, empName: employee.fullName || "",
    employeeAddress: employee.address || "", designation: employee.designation || "", department: employee.department || "",
    doj: employee.joiningDate ? new Date(employee.joiningDate).toISOString().slice(0, 10) : "", basic: String(employee.salary ?? ""),
    ...Object.fromEntries(Object.entries(profileValues(profile?.values || {})).filter(([key]) => profile?.values && Object.hasOwn(profile.values, key))),
    monthYear: selectedPeriod.monthYear, paidDays: String(new Date(selectedPeriod.year, selectedPeriod.month, 0).getDate()), leaveDays: "0"
  };
}

module.exports = { fieldKeys, earningKeys, deductionKeys, period, slipPeriod, cleanValues, cleanRemovedFields, cleanDeductions, calculateTotals, profileValues, employeeDefaults };
