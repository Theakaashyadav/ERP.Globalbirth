const attendance = require("../services/attendance.service");
const { hasAdminAccess } = require("../middleware/api-key");

const handlers = {
  getEmployees: attendance.getEmployees,
  addEmployee: attendance.addEmployee,
  webLoginEmployee: attendance.loginEmployee,
  updateEmployee: attendance.updateEmployee,
  deleteEmployee: attendance.deleteEmployee,
  getEmployeeProfile: attendance.getEmployeeProfile,
  saveAttendance: attendance.saveAttendance,
  getAttendance: attendance.getAttendance
};

async function handleAttendanceAction(req, res) {
  const action = String(req.body.action || "").trim();
  const adminActions = new Set(["updateEmployee", "deleteEmployee"]);

  if (adminActions.has(action) && !hasAdminAccess(req)) {
    res.status(401).json({
      success: false,
      message: "Unauthorized."
    });
    return;
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
