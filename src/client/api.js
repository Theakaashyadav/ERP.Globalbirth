const config = window.ATTENDANCE_DB_CONFIG || {};
const apiBaseUrl = (config.apiBaseUrl || "/api").replace(/\/+$/, "");
const apiKey = config.apiKey || localStorage.getItem("attendanceApiKey") || "";

function dashboardToken() {
  try { return JSON.parse(localStorage.getItem("dashboardSession") || "null")?.token || ""; }
  catch { return ""; }
}

function employeeToken() {
  try { return JSON.parse(localStorage.getItem("loggedInUser") || "null")?.token || ""; }
  catch { return ""; }
}

async function request(action, payload = {}) {
  const employeeActions = new Set(["getEmployeeProfile", "getEmployeeAttendance", "saveAttendance", "getEmployeeLeads", "getTeamLeadWorkspaceLeads", "getLeadDetails", "getTeamExecutives", "assignLeadToExecutive", "recordLeadCall", "updateLeadRemark", "archiveEmployeeLead", "getEmployeeMobileFeatures", "getEmployeeOfficeWifiSettings", "submitOfficeWifi", "getEmployeeWifiSubmissions", "getEmployeeAlerts", "markAlertRead", "submitCallLogStats"]);
  if (employeeActions.has(action) && !payload.androidId) {
    payload = { ...payload, androidId: localStorage.getItem("backupDeviceId") || "" };
  }
  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = "Bearer " + apiKey;
  }
  const token = dashboardToken();
  if (token) headers["X-Dashboard-Session"] = token;
  const employeeSession = employeeToken();
  if (employeeSession) headers["X-Employee-Session"] = employeeSession;

  const response = await fetch(apiBaseUrl + "/attendance", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: "Invalid server response."
  }));

  if (!response.ok) {
    throw new Error(data.message || "API request failed.");
  }

  return data;
}

export const AttendanceApi = {
  request,
  getAttendance: () => request("getAttendance"),
  getEmployeeAttendance: employeeId => request("getEmployeeAttendance", { employeeId }),
  updateAttendanceRemark: (employeeId, date, status, remark) => request("updateAttendanceRemark", { employeeId, date, status, remark }),
  getEmployees: () => request("getEmployees"),
  saveAttendance: records => request("saveAttendance", { records }),
  addEmployee: employee => request("addEmployee", employee),
  loginEmployee: (phone, pin) => request("webLoginEmployee", { phone, pin }),
  loginDashboardUser: (role, username, password) => request("loginDashboardUser", { role, username, password }),
  updateEmployee: employee => request("updateEmployee", employee),
  deleteEmployee: employeeId => request("deleteEmployee", { employeeId }),
  getEmployeeProfile: employeeId => request("getEmployeeProfile", { employeeId }),
  getEmployeeLeads: (employeeId, search = "") => request("getEmployeeLeads", { employeeId, search }),
  getLeadDetails: (leadId, employeeId = "") => request("getLeadDetails", { leadId, employeeId }),
  getTeamExecutives: teamLeadId => request("getTeamExecutives", { teamLeadId }),
  assignLeadToExecutive: (leadId, teamLeadId, executiveId) => request("assignLeadToExecutive", { leadId, teamLeadId, executiveId }),
  reassignReturnedLead: (leadId, teamLeadId) => request("reassignReturnedLead", { leadId, teamLeadId }),
  assignLead: lead => request("assignLead", lead),
  recordLeadCall: call => request("recordLeadCall", call),
  updateLeadRemark: lead => request("updateLeadRemark", lead),
  archiveEmployeeLead: (leadId, employeeId) => request("archiveEmployeeLead", { leadId, employeeId }),
  getMarketingLeadDashboard: () => request("getMarketingLeadDashboard")
  ,getMobileFeatureSettings: () => request("getMobileFeatureSettings")
  ,updateMobileFeatureSettings: roles => request("updateMobileFeatureSettings", { roles })
  ,requestCallLogStats: (employeeIds, date) => request("requestCallLogStats", { employeeIds, date })
  ,getCallLogStatsRequest: requestId => request("getCallLogStatsRequest", { requestId })
  ,getDatabaseAnalysis: () => request("getDatabaseAnalysis")
  ,getDashboardCredentials: () => request("getDashboardCredentials")
  ,updateDashboardCredential: (role, username, password) => request("updateDashboardCredential", { role, username, password })
  ,getOfficeWifiSettings: () => request("getOfficeWifiSettings")
  ,updateOfficeWifiSettings: offices => request("updateOfficeWifiSettings", { offices })
  ,sendBroadcastAlert: (subject, message) => request("sendBroadcastAlert", { subject, message })
  ,getBroadcastAlerts: () => request("getBroadcastAlerts")
};
