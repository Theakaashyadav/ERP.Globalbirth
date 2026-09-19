const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

test("employee actions reject missing or mismatched identities before reaching lead handlers", async () => {
  const originalLoad = Module._load;
  let handlerCalls = 0;
  const attendance = {
    getLeadDetails: async () => { handlerCalls += 1; return { success: true }; },
    getTeamLeadWorkspaceLeads: async () => { handlerCalls += 1; return { success: true }; },
    saveAttendance: async () => { handlerCalls += 1; return { success: true }; }
  };
  const emptyService = {};
  Module._load = function(request, parent, isMain) {
    if (parent?.filename.endsWith("attendance.controller.js")) {
      if (request === "../services/attendance.service") return attendance;
      if (request.startsWith("../services/")) return emptyService;
      if (request === "../models/Employee") return {};
      if (request === "../db/connection") return { connectDatabase: async () => {} };
      if (request === "../security/dashboard-session") return {
        readDashboardSession: () => null,
        readEmployeeSession: () => ({ employeeId: "EMP1", androidId: "" }),
        canAccessDashboardRole: () => false
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { handleAttendanceAction } = require("../src/server/controllers/attendance.controller");
    const call = async body => {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.body = data; } };
      await handleAttendanceAction({ body }, res);
      return res;
    };
    const missing = await call({ action: "getLeadDetails", leadId: "LEAD1", records: [{ employeeId: "EMP1" }] });
    assert.equal(missing.code, 401);
    const crossTeam = await call({ action: "getTeamLeadWorkspaceLeads", employeeId: "EMP1", teamLeadId: "OTHER" });
    assert.equal(crossTeam.code, 403);
    const mixedAttendance = await call({ action: "saveAttendance", records: [{ employeeId: "EMP1" }, { employeeId: "OTHER" }] });
    assert.equal(mixedAttendance.code, 403);
    assert.equal(handlerCalls, 0);
  } finally {
    Module._load = originalLoad;
  }
});
