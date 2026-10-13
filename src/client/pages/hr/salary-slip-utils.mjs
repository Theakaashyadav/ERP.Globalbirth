export const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const detailFields = [["companyName", "Company Name"], ["address1", "Company Address Line 1"], ["address2", "Company Address Line 2"], ["empCode", "Employee Code"], ["empName", "Employee Name"], ["employeeAddress", "Employee Address"], ["fhName", "F/H Name"], ["designation", "Designation"], ["department", "Department"], ["pfNo", "P.F. Number"], ["panNo", "PAN No."], ["bankNo", "Bank A/c No."], ["esiNo", "ESI Number"], ["doj", "Date of Joining"], ["uan", "UAN#"]];
export const attendanceFields = [["paidDays", "Paid Days"], ["leaveDays", "Leave Days"]];
export const earnings = [["basic", "Basic Salary"], ["hra", "House Rent Allowance (HRA)"], ["perAllo", "Special Allowance"], ["convey", "Conveyance Allowance"], ["fuel", "Fuel"], ["uniform", "Uniform"], ["books", "Books"], ["driver", "Driver"], ["arr1", "ARR-1"], ["arr2", "ARR-2"], ["arr3", "ARR-3"], ["bonus", "Bonus"], ["dwage", "D.Wage"], ["overtime", "Overtime"]];
export const deductions = [["epf", "Employee EPF Contribution (Included in CTC)"], ["esic", "E.S.I.C."], ["advance", "Advance"], ["itax", "I.Tax"], ["lwfee", "LWF"], ["ptax", "P.Tax"], ["recot", "REC-OT"], ["loan", "Loan"]];
export const allFields = [...detailFields, ...attendanceFields, ...earnings, ...deductions];
export const labels = Object.fromEntries(allFields);
export const emptyForm = () => Object.fromEntries([...allFields, ["monthYear"]].map(([key]) => [key, ""]));
export const money = value => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function calculateTotals(form, removedFields, customDeductions) {
  const removed = new Set(removedFields);
  const paise = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0;
  const sum = fields => fields.reduce((total, [key]) => total + (removed.has(key) ? 0 : paise(form[key])), 0);
  const earned = sum(earnings), deducted = sum(deductions) + customDeductions.reduce((total, row) => total + paise(row.amount), 0);
  return { totalEarning: earned / 100, totalDeduction: deducted / 100, netPay: (earned - deducted) / 100 };
}

export function amountInWords(number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function words(value) {
    if (value < 20) return a[value];
    if (value < 100) return b[Math.floor(value / 10)] + (value % 10 ? " " + a[value % 10] : "");
    const divisor = value < 1000 ? 100 : value < 100000 ? 1000 : value < 10000000 ? 100000 : 10000000;
    const label = divisor === 100 ? "Hundred" : divisor === 1000 ? "Thousand" : divisor === 100000 ? "Lakh" : "Crore";
    return words(Math.floor(value / divisor)) + " " + label + (value % divisor ? " " + words(value % divisor) : "");
  }
  const paise = Math.round(Math.abs(number) * 100);
  return `${number < 0 ? "Minus " : ""}Rupees ${words(Math.floor(paise / 100)) || "Zero"}${paise % 100 ? ` and ${words(paise % 100)} Paise` : ""} Only`;
}
