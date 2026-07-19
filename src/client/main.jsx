import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import EmployeeLogin from "./pages/employee/EmployeeLogin.jsx";
import EmployeeRegister from "./pages/employee/EmployeeRegister.jsx";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard.jsx";
import EmployeeAttendance from "./pages/employee/EmployeeAttendance.jsx";
import EmployeeProfile from "./pages/employee/EmployeeProfile.jsx";
import HrDashboard from "./pages/hr/HrDashboard.jsx";
import Employees from "./pages/hr/Employees.jsx";
import Reports from "./pages/hr/Reports.jsx";
import SalarySlip from "./pages/hr/SalarySlip.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<EmployeeLogin />} />
          <Route path="/employee/register" element={<EmployeeRegister />} />
          <Route path="/employee/dashboard" element={<EmployeeDashboard />} />
          <Route path="/employee/attendance" element={<EmployeeAttendance />} />
          <Route path="/employee/profile" element={<EmployeeProfile />} />
          <Route path="/hr" element={<HrDashboard />} />
          <Route path="/hr/employees" element={<Employees />} />
          <Route path="/hr/reports" element={<Reports />} />
          <Route path="/hr/salary-slip" element={<SalarySlip />} />
          <Route path="/HR/Dashboard.html" element={<Navigate to="/hr" replace />} />
          <Route path="/HR/employees.html" element={<Navigate to="/hr/employees" replace />} />
          <Route path="/HR/reports.html" element={<Navigate to="/hr/reports" replace />} />
          <Route path="/HR/salaryslip.html" element={<Navigate to="/hr/salary-slip" replace />} />
          <Route path="/employee/dashboard.html" element={<Navigate to="/employee/dashboard" replace />} />
          <Route path="/employee/attendance.html" element={<Navigate to="/employee/attendance" replace />} />
          <Route path="/employee/profile.html" element={<Navigate to="/employee/profile" replace />} />
          <Route path="/employee/register.html" element={<Navigate to="/employee/register" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
