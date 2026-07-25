const attendance = require("../services/attendance.service");
const callLogs = require("../services/call-log.service");
const mobileFeatures = require("../services/mobile-feature.service");
const databaseAnalysis = require("../services/database-analysis.service");
const dashboardCredentials = require("../services/dashboard-credential.service");
const officeWifi = require("../services/office-wifi.service");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");
const { readDashboardSession, readEmployeeSession, canAccessDashboardRole } = require("../security/dashboard-session");

const handlers = {
  getEmployees: attendance.getEmployees,
  addEmployee: attendance.addEmployee,
  webLoginEmployee: attendance.loginEmployee,
  mobileLoginEmployee: attendance.loginMobileEmployee,
  registerPushToken: attendance.registerPushToken,
  validateMobileSession: attendance.validateMobileSession,
  loginDashboardUser: attendance.loginDashboardUser,
  updateEmployee: attendance.updateEmployee,
  deleteEmployee: attendance.deleteEmployee,
  getEmployeeProfile: attendance.getEmployeeProfile,
  saveAttendance: attendance.saveAttendance,
  getAttendance: attendance.getAttendance,
  getEmployeeAttendance: attendance.getEmployeeAttendance,
  updateAttendanceRemark: attendance.updateAttendanceRemark,
  getEmployeeLeads: attendance.getEmployeeLeads,
  getTeamLeadWorkspaceLeads: attendance.getTeamLeadWorkspaceLeads,
  getLeadDetails: attendance.getLeadDetails,
  getTeamExecutives: attendance.getTeamExecutives,
  assignLeadToExecutive: attendance.assignLeadToExecutive,
  reassignReturnedLead: attendance.reassignReturnedLead,
  assignLead: attendance.assignLead,
  recordLeadCall: attendance.recordLeadCall,
  updateLeadRemark: attendance.updateLeadRemark,
  archiveEmployeeLead: attendance.archiveEmployeeLead,
  getMarketingLeadDashboard: attendance.getMarketingLeadDashboard
  ,getMobileFeatureSettings: mobileFeatures.getMobileFeatureSettings
  ,updateMobileFeatureSettings: mobileFeatures.updateMobileFeatureSettings
  ,getEmployeeMobileFeatures: mobileFeatures.getEmployeeMobileFeatures
  ,requestCallLogStats: callLogs.requestCallLogStats
  ,submitCallLogStats: callLogs.submitCallLogStats
  ,getCallLogStatsRequest: callLogs.getCallLogStatsRequest
  ,getDatabaseAnalysis: databaseAnalysis.getDatabaseAnalysis
  ,getDashboardCredentials: dashboardCredentials.getDashboardCredentials
  ,updateDashboardCredential: dashboardCredentials.updateDashboardCredential
  ,getOfficeWifiSettings: officeWifi.getOfficeWifiSettings
  ,updateOfficeWifiSettings: officeWifi.updateOfficeWifiSettings
  ,getEmployeeOfficeWifiSettings: officeWifi.getEmployeeOfficeWifiSettings
  ,submitOfficeWifi: officeWifi.submitOfficeWifi
  ,getEmployeeWifiSubmissions: officeWifi.getEmployeeWifiSubmissions
};

async function handleAttendanceAction(req, res) {
  const action = String(req.body.action || "").trim();
  const rolePolicies = {
    getEmployees: ["hr"], getAttendance: ["hr"], updateAttendanceRemark: ["hr"],
    updateEmployee: ["hr"], deleteEmployee: ["hr"],
    assignLead: ["marketing"], reassignReturnedLead: ["marketing"], getMarketingLeadDashboard: ["marketing"],
    requestCallLogStats: ["hr", "marketing"], getCallLogStatsRequest: ["hr", "marketing"],
    getMobileFeatureSettings: ["admin"], updateMobileFeatureSettings: ["admin"], getDatabaseAnalysis: ["admin"],
    getDashboardCredentials: ["admin"], updateDashboardCredential: ["admin"],
    getOfficeWifiSettings: ["admin"], updateOfficeWifiSettings: ["admin"]
  };
  const allowedRoles = rolePolicies[action];
  if (allowedRoles && !canAccessDashboardRole(readDashboardSession(req), allowedRoles)) {
    res.status(401).json({ success: false, message: "Your dashboard session is missing or expired. Please sign in again." });
    return;
  }

  const employeeActions = new Set([
    "getEmployeeProfile", "getEmployeeAttendance", "saveAttendance", "getEmployeeLeads", "getTeamLeadWorkspaceLeads",
    "getLeadDetails", "getTeamExecutives", "assignLeadToExecutive", "recordLeadCall",
    "updateLeadRemark", "archiveEmployeeLead", "getEmployeeMobileFeatures", "getEmployeeOfficeWifiSettings", "submitOfficeWifi", "getEmployeeWifiSubmissions", "submitCallLogStats"
  ]);
  if (employeeActions.has(action)) {
    const employeeId = String(
      req.body.employeeId || req.body.teamLeadId || req.body.records?.[0]?.employeeId || ""
    ).trim();
    const androidId = String(req.body.androidId || "").trim();
    await connectDatabase();
    const browserSession = readEmployeeSession(req);
    const employee = browserSession?.employeeId === employeeId
      ? { _id: employeeId }
      : employeeId && androidId
      ? await Employee.findOne({ employeeId, registeredAndroidId: androidId, status: "Active" }).select({ _id: 1 }).lean()
      : null;
    if (!employee) {
      res.status(401).json({ success: false, message: "Employee device verification failed. Sign in again or contact HR." });
      return;
    }
  }

  const handler = handlers[action];

  if (!handler) {
    res.status(400).json({
      success: false,
      message: "Unknown action."
    });
    return;
  }

  const result = await handler(req.body);
  res.json(result);
}

module.exports = {
  handleAttendanceAction
};
