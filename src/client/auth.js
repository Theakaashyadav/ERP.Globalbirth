const DASHBOARD_SESSION_KEY = "dashboardSession";
const EMPLOYEE_SESSION_KEY = "loggedInUser";

export function saveEmployeeSession(employee) {
  localStorage.setItem(EMPLOYEE_SESSION_KEY, JSON.stringify(employee));
  localStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({
    role: "employee",
    name: employee.fullName || employee.name || "Employee",
    employeeId: employee.employeeId
  }));
}

export function getEmployeeSession() {
  try {
    return JSON.parse(localStorage.getItem(EMPLOYEE_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveDashboardSession(session) {
  localStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify(session));
}

export function getDashboardSession() {
  try {
    return JSON.parse(localStorage.getItem(DASHBOARD_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function hasUsableSignedToken(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    return Number(payload.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function canAccessRole(role) {
  const dashboardSession = getDashboardSession();
  if (role === "employee") {
    const employee = getEmployeeSession();
    return dashboardSession?.role !== "admin" && Boolean(employee?.employeeId) && hasUsableSignedToken(employee?.token);
  }

  if (!hasUsableSignedToken(dashboardSession?.token)) return false;
  if (dashboardSession?.role === "admin") return true;

  return Boolean(dashboardSession && (dashboardSession.allowedRole === role || dashboardSession.role === role));
}

export function logout() {
  localStorage.removeItem(DASHBOARD_SESSION_KEY);
  localStorage.removeItem(EMPLOYEE_SESSION_KEY);
}
