import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api";
import { getLoggedInUser, normalize } from "../../utils";

export default function EmployeeProfile() {
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const loggedUser = getLoggedInUser();

      if (!loggedUser?.employeeId) {
        setError("Please login first.");
        return;
      }

      try {
        const result = await AttendanceApi.getEmployeeProfile(loggedUser.employeeId);
        if (result.success && result.data) setEmployee(result.data);
        else setError(result.message || "Profile details not found.");
      } catch (err) {
        setError(err.message || "Failed to load profile details.");
      }
    }

    load();
  }, []);

  function logout() {
    localStorage.removeItem("loggedInUser");
    navigate("/");
  }

  const details = [
    ["Employee ID", employee?.employeeId],
    ["Phone", employee?.phone],
    ["Email", employee?.email],
    ["Date of Birth", employee?.dob],
    ["Gender", employee?.gender],
    ["Department", employee?.department],
    ["Designation", employee?.designation],
    ["Joining Date", employee?.joiningDate],
    ["Address", employee?.address]
  ];

  return (
    <main className="screen">
      <div className="narrow">
        <PageHeader icon={User} title="Employee Profile" subtitle="View your employee details." />
        {error && <div className="alert">{error}</div>}

        <section className="panel">
          <h2>{employee?.fullName || "Loading..."}</h2>
          <p className="muted">{employee?.designation || "-"}</p>
          <span className={"status " + (normalize(employee?.status) === "active" ? "active" : "inactive")}>{employee?.status || "Status"}</span>

          <div className="grid" style={{ marginTop: 22 }}>
            {details.map(([label, value]) => (
              <div className="panel" style={{ boxShadow: "none", padding: 16 }} key={label}>
                <strong className="muted">{label}</strong>
                <div style={{ marginTop: 8, fontWeight: 800 }}>{value || "-"}</div>
              </div>
            ))}
          </div>

          <button className="btn dark" style={{ marginTop: 22 }} onClick={logout}><LogOut size={18} /> Logout</button>
        </section>
      </div>
    </main>
  );
}
