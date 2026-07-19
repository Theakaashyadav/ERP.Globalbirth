const config = window.ATTENDANCE_DB_CONFIG || {};
const apiBaseUrl = (config.apiBaseUrl || "/api").replace(/\/+$/, "");
const apiKey = config.apiKey || localStorage.getItem("attendanceApiKey") || "";

async function request(action, payload = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = "Bearer " + apiKey;
  }

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
  getEmployees: () => request("getEmployees"),
  saveAttendance: records => request("saveAttendance", { records }),
  addEmployee: employee => request("addEmployee", employee),
  loginEmployee: (phone, pin) => request("webLoginEmployee", { phone, pin }),
  updateEmployee: employee => request("updateEmployee", employee),
  deleteEmployee: employeeId => request("deleteEmployee", { employeeId }),
  getEmployeeProfile: employeeId => request("getEmployeeProfile", { employeeId })
};
