import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ClipboardList, Plus, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { normalize, onlyDigits } from "../../utils";

const blankLead = {
  employeeId: "",
  name: "",
  phone: "",
  city: "",
  source: "Marketing Manager",
  remark: ""
};

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function MarketingDashboard() {
  const [employees, setEmployees] = useState([]);
  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(blankLead);
  const [search, setSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const result = await AttendanceApi.getMarketingLeadDashboard();
      if (result.success) {
        setEmployees(result.data.employees || []);
        setLeads(result.data.leads || []);
        if (!form.employeeId && result.data.employees?.[0]?.employeeId) {
          setForm(current => ({ ...current, employeeId: result.data.employees[0].employeeId }));
        }
      }
    } catch (error) {
      toast.error(error.message || "Marketing leads loading failed.");
    }
  }

  function updateForm(name, value) {
    setForm(current => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();

    try {
      const result = await AttendanceApi.assignLead(form);

      if (!result.success) {
        toast.error(result.message || "Lead assignment failed.");
        return;
      }

      toast.success("Lead assigned successfully.");
      setForm(current => ({ ...blankLead, employeeId: current.employeeId }));
      loadDashboard();
    } catch (error) {
      toast.error(error.message || "Lead assignment failed.");
    }
  }

  const filteredLeads = useMemo(() => {
    const needle = normalize(search);
    return leads.filter(lead => {
      if (!lead.assignedEmployeeId || lead.archivedAt) return false;
      return [
        lead.name,
        lead.phone,
        lead.assignedEmployeeName,
        lead.assignedEmployeeId,
        lead.status
      ].some(value => normalize(value).includes(needle));
    });
  }, [leads, search]);

  const activeLeads = leads.filter(lead => !lead.archivedAt);

  return (
    <main className="screen">
      <div className="wide">
        <PageHeader
          icon={ClipboardList}
          title="Marketing Manager Dashboard"
          subtitle={`${activeLeads.length} assigned leads. Assignments stay with the receiving employee.`}
          tone="purple"
          action={<div className="headerActions"><Link className="btn dark" to="/marketing"><ArrowLeft size={18}/> Dashboard</Link><Link className="btn cyan" to="/marketing/analysis"><BarChart3 size={18}/> Lead Analysis</Link><button className="btn dark" onClick={loadDashboard}><RefreshCcw size={18} /> Refresh</button></div>}
        />

        <section className="leadDetailsLayout">
          <div className="panel">
            <h2>Assign Lead</h2>
            <form className="formGrid" onSubmit={submit}>
              <div className="field fullSpan">
                <label>Assign to Sales TL</label>
                <select value={form.employeeId} onChange={event => updateForm("employeeId", event.target.value)}>
                  {employees.map(employee => (
                    <option value={employee.employeeId} key={employee.employeeId}>
                      {employee.fullName} ({employee.employeeId}) - {employee.activeLeadCount} assigned
                    </option>
                  ))}
                </select>
              </div>
              <div className="field"><label>Lead Name</label><input value={form.name} onChange={event => updateForm("name", event.target.value)} required /></div>
              <div className="field"><label>Phone No.</label><input value={form.phone} onChange={event => updateForm("phone", onlyDigits(event.target.value, 10))} required /></div>
              <div className="field"><label>City</label><input value={form.city} onChange={event => updateForm("city", event.target.value)} /></div>
              <div className="field fullSpan"><label>Opening Remark</label><textarea value={form.remark} onChange={event => updateForm("remark", event.target.value)} /></div>
              <button className="btn green fullSpan"><Plus size={18} /> Assign Lead</button>
            </form>
          </div>

          <div className="panel">
            <h2>Current Lead Ownership</h2>
            <div className="employeeCapacityList">
              {employees.map(employee => (
                <div className="capacityRow" key={employee.employeeId}>
                  <div>
                    <b>{employee.fullName}</b>
                    <span>{employee.employeeId} - {employee.department || "Department"}</span>
                  </div>
                  <div>
                    <span className="miniMetric">{employee.activeLeadCount} assigned</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <div className="toolbar">
            <div className="field">
              <label>Search leads</label>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, no., employee, status..." />
            </div>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Phone</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Calls</th>
                  <th>Remark</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 && <tr><td colSpan="7" style={{ textAlign: "center", padding: 30 }}>No assigned leads found</td></tr>}
                {filteredLeads.map(lead => (
                  <tr key={lead.leadId}>
                    <td>
                      <b>{lead.name}</b>
                      <div className="muted">{lead.city || "No city"}</div>
                      <Link className="analysisLink" to={`/marketing/analysis?lead=${lead.leadId}`}>Analyse lead</Link>
                    </td>
                    <td>{lead.phone}</td>
                    <td>{lead.assignedEmployeeName || "Marketing Queue"}<div className="muted">{lead.assignmentStage}</div></td>
                    <td><span className="status active">{lead.status}</span></td>
                    <td>{lead.stats?.totalAttempts || 0}</td>
                    <td>{lead.lastRemark || "-"}</td>
                    <td>{formatDate(lead.assignedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
