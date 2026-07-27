import { Navigate } from "react-router-dom";
import { canAccessRole } from "../auth";

export default function ProtectedRoute({ role, children }) {
  const hasAccess = Array.isArray(role) ? role.some(canAccessRole) : canAccessRole(role);
  if (!hasAccess) {
    const loginPaths = {
      employee: "/employee/login",
      hr: "/hr/login",
      marketing: "/marketing/login"
    };
    const sessionRole = (() => { try { return JSON.parse(localStorage.getItem("dashboardSession") || "null")?.role; } catch { return ""; } })();
    localStorage.removeItem("dashboardSession");
    const requestedRole = Array.isArray(role) ? role[0] : role;
    return <Navigate to={sessionRole === "admin" || requestedRole === "admin" ? "/admin/login" : (loginPaths[requestedRole] || "/admin/login")} replace />;
  }

  return children;
}
