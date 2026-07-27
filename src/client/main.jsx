import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import DashboardLogin from "./pages/auth/DashboardLogin.jsx";
import EmployeeLogin from "./pages/employee/EmployeeLogin.jsx";
import EmployeeRegister from "./pages/employee/EmployeeRegister.jsx";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard.jsx";
import EmployeeAttendance from "./pages/employee/EmployeeAttendance.jsx";
import EmployeeProfile from "./pages/employee/EmployeeProfile.jsx";
import EmployeeLeads from "./pages/employee/EmployeeLeads.jsx";
import EmployeeLeadDetails from "./pages/employee/EmployeeLeadDetails.jsx";
import HrDashboard from "./pages/hr/HrDashboard.jsx";
import Employees from "./pages/hr/Employees.jsx";
import Reports from "./pages/hr/Reports.jsx";
import SalarySlip from "./pages/hr/SalarySlip.jsx";
import CallActivity from "./pages/hr/CallActivity.jsx";
import ReleaseManager from "./pages/admin/ReleaseManager.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import MobileFeatureAccess from "./pages/admin/MobileFeatureAccess.jsx";
import DatabaseAnalysis from "./pages/admin/DatabaseAnalysis.jsx";
import DashboardCredentials from "./pages/admin/DashboardCredentials.jsx";
import OfficeWifiSettings from "./pages/admin/OfficeWifiSettings.jsx";
import MarketingDashboard from "./pages/marketing/MarketingDashboard.jsx";
import LeadAnalysis from "./pages/marketing/LeadAnalysis.jsx";
import MarketingHome from "./pages/marketing/MarketingHome.jsx";
import HomePage from "./pages/HomePage.jsx";
import AppDownloadPage from "./pages/AppDownloadPage.jsx";
import "./styles.css";

const appRole = import.meta.env.VITE_ATTENDANCE_ROLE || "combined";
const isEmployeeOnly = appRole === "employee";
const isHrOnly = appRole === "hr";
const isMarketingOnly = appRole === "marketing";
const fallbackPath = isHrOnly ? "/hr" : isMarketingOnly ? "/marketing" : "/";
const adminRedirectPath = "/admin";
const loginElement = isHrOnly
  ? <DashboardLogin role="hr" />
  : isMarketingOnly
    ? <DashboardLogin role="marketing" />
    : <EmployeeLogin />;

function protect(role, element) {
  return <ProtectedRoute role={role}>{element}</ProtectedRoute>;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={isHrOnly || isMarketingOnly ? <Navigate to={fallbackPath} replace /> : <HomePage />} />
          <Route path="/download-app" element={<AppDownloadPage />} />
          <Route path="/employee/login" element={<EmployeeLogin />} />
          <Route path="/login" element={loginElement} />
          <Route path="/hr/login" element={<DashboardLogin role="hr" />} />
          <Route path="/marketing/login" element={<DashboardLogin role="marketing" />} />
          <Route path="/admin/login" element={<DashboardLogin role="admin" redirect={adminRedirectPath} />} />
          <Route path="/admin-login" element={<Navigate to="/admin/login" replace />} />
          <Route path="/admin" element={protect("admin", <AdminDashboard />)} />
          <Route path="/admin/mobile-features" element={protect("admin", <MobileFeatureAccess />)} />
          <Route path="/admin/releases" element={protect("admin", <ReleaseManager />)} />
          <Route path="/admin/database" element={protect("admin", <DatabaseAnalysis />)} />
          <Route path="/admin/credentials" element={protect("admin", <DashboardCredentials />)} />
          <Route path="/admin/office-wifi" element={protect("admin", <OfficeWifiSettings />)} />
          {!isHrOnly && !isMarketingOnly && (
            <>
              <Route path="/employee/register" element={<EmployeeRegister />} />
              <Route path="/employee/dashboard" element={protect("employee", <EmployeeDashboard />)} />
              <Route path="/employee/attendance" element={protect("employee", <EmployeeAttendance />)} />
              <Route path="/employee/profile" element={protect("employee", <EmployeeProfile />)} />
              <Route path="/employee/leads" element={protect("employee", <EmployeeLeads />)} />
              <Route path="/employee/leads/:leadId" element={protect("employee", <EmployeeLeadDetails />)} />
            </>
          )}
          {!isEmployeeOnly && !isMarketingOnly && (
            <>
              {isHrOnly && <Route path="/employee/register" element={<EmployeeRegister />} />}
              <Route path="/hr" element={protect("hr", <HrDashboard />)} />
              <Route path="/hr/employees" element={protect("hr", <Employees />)} />
              <Route path="/hr/reports" element={protect("hr", <Reports />)} />
              <Route path="/hr/salary-slip" element={protect("hr", <SalarySlip />)} />
              <Route path="/hr/call-activity" element={protect("hr", <CallActivity />)} />
            </>
          )}
          {!isEmployeeOnly && !isHrOnly && (
            <>
              <Route path="/marketing" element={protect("marketing", <MarketingHome />)} />
              <Route path="/marketing/assign" element={protect("marketing", <MarketingDashboard />)} />
              <Route path="/marketing/analysis" element={protect("marketing", <LeadAnalysis />)} />
              <Route path="/marketing/leads" element={<Navigate to="/marketing/assign" replace />} />
            </>
          )}
          <Route path="/HR/Dashboard.html" element={<Navigate to="/hr" replace />} />
          <Route path="/HR/employees.html" element={<Navigate to="/hr/employees" replace />} />
          <Route path="/HR/reports.html" element={<Navigate to="/hr/reports" replace />} />
          <Route path="/HR/salaryslip.html" element={<Navigate to="/hr/salary-slip" replace />} />
          <Route path="/hr/leads" element={<Navigate to="/marketing" replace />} />
          <Route path="/employee/dashboard.html" element={<Navigate to="/employee/dashboard" replace />} />
          <Route path="/employee/attendance.html" element={<Navigate to="/employee/attendance" replace />} />
          <Route path="/employee/profile.html" element={<Navigate to="/employee/profile" replace />} />
          <Route path="/employee/register.html" element={<Navigate to="/employee/register" replace />} />
          <Route path="*" element={<Navigate to={fallbackPath} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
