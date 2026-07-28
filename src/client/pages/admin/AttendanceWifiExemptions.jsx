import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Save, Search, ShieldCheck, UserCheck, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";

export default function AttendanceWifiExemptions() {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const departments = useMemo(() => [...new Set(employees.map(item => item.department || "Unassigned"))].sort(), [employees]);
  const visible = useMemo(() => employees.filter(item => (department === "all" || item.department === department) && (!query.trim() || `${item.fullName} ${item.employeeId} ${item.department} ${item.designation}`.toLowerCase().includes(query.trim().toLowerCase()))), [employees, query, department]);

  async function load() {
    try {
      const result = await AttendanceApi.getAttendanceWifiExemptions();
      if (!result.success) throw new Error(result.message);
      setEmployees(result.data.employees || []); setSelected(result.data.exemptEmployeeIds || []);
    } catch (error) { toast.error(error.message || "Could not load Wi-Fi exemptions."); }
  }
  useEffect(() => { load(); }, []);
  function toggle(employeeId) { setSelected(current => current.includes(employeeId) ? current.filter(id => id !== employeeId) : [...current, employeeId]); }
  function toggleVisible() {
    const visibleIds = visible.map(item => item.employeeId); const allSelected = visibleIds.length && visibleIds.every(id => selected.includes(id));
    setSelected(current => allSelected ? current.filter(id => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  }
  async function save() {
    setSaving(true);
    try {
      const result = await AttendanceApi.updateAttendanceWifiExemptions(selected);
      if (!result.success) throw new Error(result.message);
      setSelected(result.data.exemptEmployeeIds || []); toast.success(result.message);
    } catch (error) { toast.error(error.message || "Could not save Wi-Fi exemptions."); }
    finally { setSaving(false); }
  }

  return <main className="screen adminHubScreen"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={WifiOff} title="Attendance Wi-Fi Exemptions" subtitle="Allow selected employees to mark attendance without connecting to approved office Wi-Fi." tone="orange"/><Link className="btn dark adminSignOut" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link></div>
    <div className="wifiExemptionNotice"><ShieldCheck size={22}/><div><b>Attendance controls remain protected</b><span>Only office Wi-Fi verification is skipped. Active status, authenticated device, one attendance per day, date and time rules remain enforced.</span></div></div>
    <section className="panel wifiExemptionPanel">
      <header><div><span className="eyebrow">SELECTED EMPLOYEES</span><h2>{selected.length} Wi-Fi exemption{selected.length === 1 ? "" : "s"}</h2></div><button type="button" className="btn secondary" onClick={toggleVisible}><UserCheck size={17}/> Toggle visible</button></header>
      <div className="wifiExemptionFilters"><label><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, employee ID or designation"/></label><select value={department} onChange={event => setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map(value => <option value={value} key={value}>{value}</option>)}</select></div>
      <div className="wifiExemptionList">{visible.map(employee => { const checked = selected.includes(employee.employeeId); return <button type="button" className={`wifiExemptionEmployee ${checked ? "selected" : ""}`} onClick={() => toggle(employee.employeeId)} key={employee.employeeId}><span className="wifiExemptionCheck">{checked && <Check size={16}/>}</span><span><b>{employee.fullName}</b><small>{employee.employeeId} · {employee.department}{employee.designation ? ` · ${employee.designation}` : ""}</small></span><em>{checked ? "Wi-Fi not required" : "Office Wi-Fi required"}</em></button>})}{!visible.length && <p className="muted">No active employees match these filters.</p>}</div>
    </section>
    <div className="featureSaveBar"><button className="btn green" disabled={saving} onClick={save}><Save size={18}/>{saving ? "Saving..." : "Save Wi-Fi Exemptions"}</button></div>
  </div></main>;
}
