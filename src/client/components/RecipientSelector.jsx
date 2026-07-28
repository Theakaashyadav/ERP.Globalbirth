import { useMemo, useState } from "react";
import { Building2, Search, UsersRound } from "lucide-react";

export const emptyAudience = { allEmployees: true, targetDepartments: [], targetEmployeeIds: [] };

export default function RecipientSelector({ employees, value, onChange, accent = "#2563eb" }) {
  const [search, setSearch] = useState("");
  const departments = useMemo(() => [...new Set(employees.map(item => item.department || "Unassigned"))].sort(), [employees]);
  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter(item => !query || `${item.fullName} ${item.employeeId} ${item.department} ${item.designation}`.toLowerCase().includes(query));
  }, [employees, search]);
  const setTargeted = () => onChange({ ...value, allEmployees: false });
  const toggle = (key, item) => {
    const values = new Set(value[key]);
    values.has(item) ? values.delete(item) : values.add(item);
    onChange({ ...value, allEmployees: false, [key]: [...values] });
  };

  return <section className="recipientSelector" style={{ "--recipient-accent": accent }}>
    <div className="recipientHeading"><UsersRound size={21}/><div><b>Choose recipients</b><span>Departments and employees are combined, without duplicate notifications.</span></div></div>
    <label className={`recipientAll ${value.allEmployees ? "selected" : ""}`}><input type="radio" checked={value.allEmployees} onChange={() => onChange(emptyAudience)}/><span><b>All active employees</b><small>Send to every active employee with a registered app.</small></span></label>
    <label className={`recipientAll ${!value.allEmployees ? "selected" : ""}`}><input type="radio" checked={!value.allEmployees} onChange={setTargeted}/><span><b>Selected departments or employees</b><small>Choose one or more options below.</small></span></label>
    {!value.allEmployees && <div className="recipientTargetGrid">
      <div><h4><Building2 size={17}/> Departments</h4><div className="recipientChecks">{departments.map(department => <label key={department}><input type="checkbox" checked={value.targetDepartments.includes(department)} onChange={() => toggle("targetDepartments", department)}/><span>{department}</span></label>)}</div></div>
      <div><h4><UsersRound size={17}/> Specific employees</h4><div className="recipientSearch"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, ID or department"/></div><div className="recipientEmployees">{visibleEmployees.map(employee => <label key={employee.employeeId}><input type="checkbox" checked={value.targetEmployeeIds.includes(employee.employeeId)} onChange={() => toggle("targetEmployeeIds", employee.employeeId)}/><span><b>{employee.fullName}</b><small>{employee.employeeId} · {employee.department}{employee.designation ? ` · ${employee.designation}` : ""}</small></span></label>)}</div></div>
    </div>}
    {!value.allEmployees && !value.targetDepartments.length && !value.targetEmployeeIds.length && <p className="recipientWarning">Select at least one department or employee before sending.</p>}
  </section>;
}
