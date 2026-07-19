import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Edit3, Plus, Save, Trash2, UsersRound, X } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { normalize } from "../../utils";

const blankEmployee = {
  employeeId: "",
  fullName: "",
  phone: "",
  email: "",
  department: "Sales",
  designation: "",
  joiningDate: "",
  salary: "",
  shift: "Morning Shift",
  status: "Active",
  address: ""
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    try {
      const result = await AttendanceApi.getEmployees();
      setEmployees(result.success && Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error(error.message || "Employees loading failed.");
    }
  }

  const filtered = useMemo(() => {
    return employees.filter(emp => {
      const haystack = [emp.employeeId, emp.fullName, emp.phone, emp.department, emp.designation, emp.status].map(normalize).join(" ");
      return haystack.includes(normalize(search));
    });
  }, [employees, search]);

  async function saveEdit(event) {
    event.preventDefault();

    try {
      const result = await AttendanceApi.updateEmployee(editing);

      if (!result.success) {
        toast.error(result.message || "Employee update failed.");
        return;
      }

      toast.success("Employee updated successfully.");
      setEditing(null);
      loadEmployees();
    } catch (error) {
      toast.error(error.message || "Database update failed.");
    }
  }

  async function removeEmployee(employeeId) {
    if (!window.confirm("Delete this employee and related attendance records?")) return;

    try {
      const result = await AttendanceApi.deleteEmployee(employeeId);
      if (result.success) {
        toast.success("Employee deleted successfully.");
        setEmployees(current => current.filter(emp => emp.employeeId !== employeeId));
      } else {
        toast.error(result.message || "Employee delete failed.");
      }
    } catch (error) {
      toast.error(error.message || "Database delete failed.");
    }
  }

  function updateEditing(name, value) {
    setEditing(current => ({ ...current, [name]: value }));
  }

  return (
    <main className="screen">
      <div className="wide">
        <PageHeader
          icon={UsersRound}
          title="All Employees"
          subtitle="View, update and delete employee records."
          tone="purple"
          action={<Link className="btn green" to="/employee/register"><Plus size={18} /> Add Employee</Link>}
        />

        <section className="panel">
          <div className="toolbar">
            <div className="field">
              <label>Search Employee</label>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, phone, department..." />
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Joining Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan="8" style={{ textAlign: "center", padding: 30 }}>No employees found</td></tr>}
                {filtered.map(emp => (
                  <tr key={emp.employeeId}>
                    <td>{emp.employeeId || "-"}</td>
                    <td>{emp.fullName || "-"}</td>
                    <td>{emp.phone || "-"}</td>
                    <td>{emp.department || "-"}</td>
                    <td>{emp.designation || "-"}</td>
                    <td>{emp.joiningDate || "-"}</td>
                    <td><span className={"status " + (normalize(emp.status) === "active" ? "active" : normalize(emp.status) === "on leave" ? "leave" : "inactive")}>{emp.status || "Active"}</span></td>
                    <td>
                      <button className="btn" onClick={() => setEditing({ ...blankEmployee, ...emp })} title="Edit"><Edit3 size={16} /></button>{" "}
                      <button className="btn red" onClick={() => removeEmployee(emp.employeeId)} title="Delete"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && (
        <div className="modalBackdrop">
          <section className="panel modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2>Edit Employee</h2>
              <button className="btn red" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>

            <form className="formGrid" onSubmit={saveEdit}>
              <div className="field"><label>Employee ID</label><input value={editing.employeeId} readOnly /></div>
              <div className="field"><label>Full Name</label><input value={editing.fullName} onChange={e => updateEditing("fullName", e.target.value)} /></div>
              <div className="field"><label>Phone Number</label><input value={editing.phone} onChange={e => updateEditing("phone", e.target.value)} /></div>
              <div className="field"><label>Email</label><input value={editing.email} onChange={e => updateEditing("email", e.target.value)} /></div>
              <div className="field"><label>Department</label><select value={editing.department} onChange={e => updateEditing("department", e.target.value)}><option>Sales</option><option>Marketing</option><option>HR</option><option>Accounts</option><option>Admin</option><option>IT</option><option>Operations</option></select></div>
              <div className="field"><label>Designation</label><input value={editing.designation} onChange={e => updateEditing("designation", e.target.value)} /></div>
              <div className="field"><label>Joining Date</label><input type="date" value={editing.joiningDate} onChange={e => updateEditing("joiningDate", e.target.value)} /></div>
              <div className="field"><label>Salary</label><input type="number" value={editing.salary} onChange={e => updateEditing("salary", e.target.value)} /></div>
              <div className="field"><label>Work Shift</label><select value={editing.shift} onChange={e => updateEditing("shift", e.target.value)}><option>Morning Shift</option><option>Evening Shift</option><option>Night Shift</option><option>Flexible Shift</option></select></div>
              <div className="field"><label>Status</label><select value={editing.status} onChange={e => updateEditing("status", e.target.value)}><option>Active</option><option>Inactive</option><option>On Leave</option></select></div>
              <div className="field fullSpan"><label>Address</label><textarea value={editing.address} onChange={e => updateEditing("address", e.target.value)} /></div>
              <button className="btn full fullSpan"><Save size={18} /> Update Employee</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
