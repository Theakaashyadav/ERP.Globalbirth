const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");
const data = require("../src/server/services/salary-slip-data");

function fixture(initial = []) {
  const slips = structuredClone(initial), profiles = [];
  let writes = 0;
  const employees = [{ employeeId: "EMP1", fullName: "Asha Sharma", address: "Noida", department: "Sales", designation: "Executive", salary: 45000, joiningDate: "2025-04-15" }, { employeeId: "EMP2", fullName: "Vijay Singh", salary: 20000 }];
  const match = (item, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === "$or") return value.some(condition => match(item, condition));
    const actual = key.split(".").reduce((object, part) => object?.[part], item);
    return value && typeof value === "object" && "$exists" in value ? (actual !== undefined) === value.$exists : actual === value;
  });
  const query = run => ({ sort() { return this; }, async lean() { return structuredClone(run()); } });
  const model = rows => ({
    init: async () => {},
    find: filter => query(() => rows.filter(row => match(row, filter)).slice().reverse()),
    findOne: filter => query(() => rows.find(row => match(row, filter)) || null),
    findOneAndUpdate(filter, update, options = {}) {
      return query(() => {
        let item = rows.find(row => match(row, filter));
        if (!item && options.upsert) {
          item = { _id: String(rows.length + 1).padStart(24, "0"), ...filter, ...update.$setOnInsert };
          rows.push(item); writes++;
        }
        if (item && update.$set) { Object.assign(item, update.$set); writes++; }
        return item || null;
      });
    }
  });
  const salaryModel = model(slips), profileModel = model(profiles);
  // Mongoose queries are thenable even when lean() is not requested.
  const originalUpdate = profileModel.findOneAndUpdate;
  profileModel.findOneAndUpdate = (...args) => originalUpdate(...args).lean();
  const originalLoad = Module._load;
  const servicePath = require.resolve("../src/server/services/salary-slip.service");
  delete require.cache[servicePath];
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === servicePath) {
      if (request === "../models/SalarySlip") return salaryModel;
      if (request === "../models/SalaryProfile") return profileModel;
      if (request === "../models/Employee") return model(employees);
      if (request === "../db/connection") return { connectDatabase: async () => {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let service;
  try { service = require(servicePath); } finally { Module._load = originalLoad; }
  const payload = (overrides = {}) => ({ employeeId: "EMP1", month: 1, year: 2027, values: { empCode: "EMP1", empName: "Asha Sharma", basic: "45000.10", epf: "100.10", employeeAddress: "Sector 62, Noida" }, customDeductions: [{ label: "Food recovery", amount: "200.25" }], ...overrides });
  return { service, slips, profiles, payload, writes: () => writes };
}

test("employee details seed the first slip; future months reuse edits without copying deductions", async () => {
  const { service, payload, profiles } = fixture();
  let workspace = await service.getSalarySlipWorkspace({ employeeId: "EMP1", month: 1, year: 2027 });
  assert.equal(workspace.data.slip, null);
  assert.equal(workspace.data.defaults.values.empName, "Asha Sharma");
  assert.equal(workspace.data.defaults.values.basic, "45000");
  assert.equal(workspace.data.defaults.values.employeeAddress, "Noida");
  const saved = await service.saveSalarySlip(payload());
  assert.equal(saved.success, true);
  assert.equal(saved.data.totals.netPay, 44699.75);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].values.employeeAddress, "Sector 62, Noida");
  assert.equal(profiles[0].values.epf, undefined);
  workspace = await service.getSalarySlipWorkspace({ employeeId: "EMP1", month: 2, year: 2027 });
  assert.equal(workspace.data.defaults.values.employeeAddress, "Sector 62, Noida");
  assert.equal(workspace.data.defaults.values.basic, "45000.10");
  assert.equal(workspace.data.defaults.values.paidDays, "28");
  assert.equal(workspace.data.defaults.values.epf, "");
  assert.deepEqual(workspace.data.defaults.customDeductions, []);
  const original = await service.getSalarySlipWorkspace({ employeeId: "EMP1", month: 1, year: 2027 });
  assert.equal(original.data.slip.id, saved.data.id);
  assert.equal(original.data.slip.customDeductions[0].amount, 200.25);
  const other = await service.getSalarySlipWorkspace({ employeeId: "EMP2", month: 2, year: 2027 });
  assert.equal(other.data.defaults.values.empName, "Vijay Singh");
  assert.deepEqual(other.data.history, []);
});

test("saved slips update in place, and a new month preserves the previous month's salary", async () => {
  const { service, payload, slips } = fixture();
  const first = await service.saveSalarySlip(payload());
  const edit = await service.saveSalarySlip(payload({ slipId: first.data.id, customDeductions: [{ label: "Recovery", amount: 500 }] }));
  assert.equal(edit.data.id, first.data.id);
  assert.equal(edit.data.totals.netPay, 44400);
  const next = await service.saveSalarySlip(payload({ month: 2, customDeductions: [] }));
  assert.notEqual(next.data.id, first.data.id);
  assert.equal(slips.length, 2);
  assert.equal(slips[0].customDeductions[0].amount, 500);
});

test("duplicate and simultaneous generation keep one saved slip without overwriting it", async () => {
  const { service, payload, slips } = fixture();
  const results = await Promise.all([service.saveSalarySlip(payload()), service.saveSalarySlip(payload({ customDeductions: [] }))]);
  assert.equal(slips.length, 1);
  assert.equal(results[0].data.id, results[1].data.id);
  assert.equal(slips[0].customDeductions[0].amount, 200.25);
  const duplicate = await service.saveSalarySlip(payload({ customDeductions: [] }));
  assert.equal(duplicate.data.customDeductions[0].amount, 200.25);
});

test("old slips reopen by employee code and month, retaining their values and removed fields", async () => {
  const legacy = { _id: "000000000000000000000009", slipNumber: "SAL-OLD", values: { empCode: "EMP1", empName: "Saved name", monthYear: "Sep-2026", basic: "100", advance: "25" }, removedFields: ["loan"], totals: { netPay: 75 } };
  const { service, payload, slips } = fixture([legacy]);
  const workspace = await service.getSalarySlipWorkspace({ employeeId: "EMP1", month: 9, year: 2026 });
  assert.equal(workspace.data.slip.id, legacy._id);
  assert.equal(workspace.data.slip.values.advance, "25");
  assert.deepEqual(workspace.data.slip.removedFields, ["loan"]);
  assert.equal(workspace.data.defaults.values.employeeAddress, "Noida");
  const updated = await service.saveSalarySlip(payload({ slipId: legacy._id, month: 9, year: 2026 }));
  assert.equal(updated.success, true);
  assert.equal(slips.length, 1);
  assert.equal(slips[0].periodKey, "EMP1:2026-09");
});

test("slips cannot move between employees or months", async () => {
  const { service, payload } = fixture();
  const saved = await service.saveSalarySlip(payload());
  const crossEmployee = await service.saveSalarySlip(payload({ slipId: saved.data.id, employeeId: "EMP2" }));
  assert.equal(crossEmployee.success, false);
  const crossMonth = await service.saveSalarySlip(payload({ slipId: saved.data.id, month: 2 }));
  assert.equal(crossMonth.success, false);
});

test("invalid amounts, empty deduction labels, invalid periods and missing employees are rejected", async () => {
  const { service, payload, slips } = fixture();
  for (const overrides of [
    { customDeductions: [{ label: "", amount: 2 }] }, { customDeductions: [{ label: "Bad", amount: -1 }] },
    { customDeductions: [{ label: "Bad", amount: "Infinity" }] }, { values: { basic: "1.001" } },
    { values: { basic: "Infinity" } }, { month: 13 }, { year: 2000.5 }, { employeeId: "missing" }
  ]) assert.equal((await service.saveSalarySlip(payload(overrides))).success, false);
  assert.equal(slips.length, 0);
});

test("server and screen totals agree at paise precision and exclude removed fields", async () => {
  const client = await import("../src/client/pages/hr/salary-slip-utils.mjs");
  const values = { basic: "0.10", hra: "0.20", epf: "100", loan: "0.03" };
  const removed = ["epf"], custom = [{ label: "Deduction", amount: 0.02 }];
  const totals = data.calculateTotals(values, removed, custom);
  assert.deepEqual(totals, { totalEarning: 0.3, totalDeduction: 0.05, netPay: 0.25 });
  assert.deepEqual(client.calculateTotals(values, removed, custom), totals);
  assert.equal(client.amountInWords(44699.75), "Rupees Forty Four Thousand Six Hundred Ninety Nine and Seventy Five Paise Only");
  assert.equal(client.amountInWords(-1), "Minus Rupees One Only");
});

test("legacy month formats and leap-year attendance normalize correctly", () => {
  for (const monthYear of ["September 2026", "Sep-2026", "2026-09", "09/2026", "2026 Sep"]) assert.equal(data.slipPeriod({ values: { monthYear } }).key, "2026-09");
  assert.equal(data.slipPeriod({ values: { monthYear: "unknown" } }), null);
  assert.equal(data.employeeDefaults({ employeeId: "E" }, null, data.period(2, 2028)).paidDays, "29");
});
