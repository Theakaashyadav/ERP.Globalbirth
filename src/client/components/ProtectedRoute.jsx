import { Navigate } from "react-router-dom";
import { canAccessRole } from "../auth";

export default function ProtectedRoute({ role, children }) {
  if (!canAccessRole(role)) {
    const loginPaths = {
      employee: "/employee/login",
      hr: "/hr/login",
      marketing: "/marketing/login"
    };
    const sessionRole = (() => { try { return JSON.parse(localStorage.getItem("dashboardSession") || "null")?.role; } catch { return ""; } })();
    localStorage.removeItem("dashboardSession");
    return <Navigate to={sessionRole === "admin" || role === "admin" ? "/admin/login" : (loginPaths[role] || "/admin/login")} replace />;
  }

  return children;
}
