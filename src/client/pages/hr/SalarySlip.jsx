import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Printer, RotateCcw, Save, Search, X } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import { amountInWords, attendanceFields, calculateTotals, deductions, detailFields, earnings, emptyForm, labels, money, months } from "./salary-slip-utils.mjs";
import "../../salary-slip-management.css";

export default function SalarySlip() {
  const now = new Date();
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeError, setEmployeeError] = useState("");
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [removedFields, setRemovedFields] = useState([]);
  const [customDeductions, setCustomDeductions] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const toast = useToast();
  const selectedEmployee = employees.find(item => item.employeeId === employeeId);
  const validYear = /^\d{4}$/.test(year) && Number(year) >= 1900;
  const monthYear = `${months[month - 1]} ${year}`;
  const removed = useMemo(() => new Set(removedFields), [removedFields]);
  const totals = useMemo(() => calculateTotals(form, removedFields, customDeductions), [form, removedFields, customDeductions]);
  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return employees.filter(item => [item.employeeId, item.fullName, item.phone, item.department].join(" ").toLowerCase().includes(needle));
  }, [employees, search]);

  async function loadEmployees() {
    setLoadingEmployees(true); setEmployeeError("");
    try {
      const result = await AttendanceApi.getEmployees();
      if (!result.success) throw new Error(result.message);
      setEmployees(result.data || []);
    } catch (failure) { setEmployeeError(failure.message || "Employees could not be loaded."); }
    finally { setLoadingEmployees(false); }
  }
  useEffect(() => { loadEmployees(); }, []);

  function fillEditor(slip) {
    setForm({ ...emptyForm(), ...slip.values });
    setRemovedFields((slip.removedFields || []).filter(key => key !== "monthYear" && labels[key]));
    setCustomDeductions((slip.customDeductions || []).map(row => ({ ...row, key: crypto.randomUUID() })));
    setEditingId(slip.id || ""); setDirty(false); setEditorOpen(true);
  }

  useEffect(() => {
    let cancelled = false;
    setWorkspace(null); setEditorOpen(false); setEditingId(""); setDirty(false); setError("");
    if (!employeeId || !validYear) { setLoading(false); return; }
    setLoading(true);
    AttendanceApi.getSalarySlipWorkspace(employeeId, month, Number(year)).then(result => {
      if (cancelled) return;
      if (!result.success) throw new Error(result.message);
      setWorkspace(result.data);
      if (result.data.slip) fillEditor(result.data.slip);
    }).catch(failure => { if (!cancelled) setError(failure.message || "Salary details could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId, month, year, reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changeSelection(action) {
    if (saving || (dirty && !window.confirm("Discard unsaved salary-slip changes?"))) return;
    setDirty(false); setEditorOpen(false); setWorkspace(null); action();
  }
  function update(key, value) { setDirty(true); setForm(current => ({ ...current, [key]: value })); }
  function removeField(key) { setDirty(true); setRemovedFields(current => [...new Set([...current, key])]); }
  function restoreField(key) { setDirty(true); setRemovedFields(current => current.filter(item => item !== key)); }
  function updateDeduction(key, field, value) {
    setDirty(true); setCustomDeductions(current => current.map(row => row.key === key ? { ...row, [field]: value } : row));
  }

  async function saveSlip({ print = false } = {}) {
    if (!editorRef.current?.reportValidity() || saving) return;
    setSaving(true);
    try {
      const result = await AttendanceApi.saveSalarySlip(editingId, form, removedFields, {
        employeeId, month, year: Number(year), customDeductions: customDeductions.map(({ label, amount }) => ({ label, amount }))
      });
      if (!result.success) throw new Error(result.message);
      fillEditor(result.data);
      setWorkspace(current => ({ ...current, slip: result.data, hasSavedDetails: true,
        history: [result.data, ...(current?.history || []).filter(item => item.id !== result.data.id)] }));
      toast.success(result.message);
      if (print) {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.print();
      }
    } catch (failure) { toast.error(failure.message || "Salary slip could not be saved."); }
    finally { setSaving(false); }
  }

  function renderFields(fields, numeric = false) {
    return <div className="formGrid salaryFieldGrid">{fields.filter(([key]) => !removed.has(key)).map(([key, label]) => <div className="field salaryRemovableField" key={key}>
      <label htmlFor={`salary-${key}`}>{label}</label>
      <button type="button" className="salaryRemoveField" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => removeField(key)}><X size={14}/></button>
      <input id={`salary-${key}`} type={numeric ? "number" : "text"} min={numeric ? "0" : undefined} max={numeric ? "1000000000" : undefined} step={numeric ? "0.01" : undefined} maxLength={numeric ? undefined : 500} value={form[key]} onChange={event => update(key, event.target.value)} />
    </div>)}</div>;
  }

  const visibleEarnings = earnings.filter(([key]) => !removed.has(key)).map(([key, label]) => ({ label, amount: form[key] }));
  const visibleDeductions = [...deductions.filter(([key]) => !removed.has(key)).map(([key, label]) => ({ label, amount: form[key] })), ...customDeductions];
  const payRows = Array.from({ length: Math.max(visibleEarnings.length, visibleDeductions.length, 1) });
  const leftDetails = detailFields.filter(([key]) => ["empCode", "empName", "fhName", "designation", "department", "employeeAddress"].includes(key) && !removed.has(key));
  const rightDetails = detailFields.filter(([key]) => ["pfNo", "panNo", "bankNo", "esiNo", "doj", "uan"].includes(key) && !removed.has(key));

  return <main className="screen salarySlipPage"><div className="wide">
    <div className="noPrint">
      <PageHeader icon={FileText} title="Salary Slips" subtitle="Choose an employee and month. Save details once, then reuse and edit them for future slips." />
      <section className="panel salarySelectionPanel">
        <div className="salarySectionTitle"><span>1</span><div><h2>Select employee</h2><p>Search the employee list by name, code, phone or department.</p></div></div>
        <div className="field salaryEmployeeSearch"><label htmlFor="salary-employee-search"><Search size={16}/> Search employees</label><input id="salary-employee-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, employee code, phone or department" /></div>
        {loadingEmployees ? <p role="status">Loading employees...</p> : employeeError ? <div role="alert" className="salaryLoadError">{employeeError}<button className="btn" onClick={loadEmployees}>Retry</button></div> : <div className="salaryEmployeeList" aria-label="Employee list">{filteredEmployees.length ? filteredEmployees.map(employee => <button type="button" key={employee.employeeId} disabled={saving} className={`salaryEmployeeOption${employeeId === employee.employeeId ? " selected" : ""}`} aria-pressed={employeeId === employee.employeeId} onClick={() => employeeId !== employee.employeeId && changeSelection(() => setEmployeeId(employee.employeeId))}>
          <b>{employee.fullName}</b><small>{employee.employeeId} · {employee.department || "No department"}</small>
        </button>) : <p>No employees match your search.</p>}</div>}
      </section>

      {selectedEmployee && <section className="panel salarySelectionPanel">
        <div className="salarySectionTitle"><span>2</span><div><h2>{selectedEmployee.fullName}</h2><p>{selectedEmployee.employeeId} · Choose the salary month and year.</p></div></div>
        <div className="salaryPeriodFields">
          <div className="field"><label htmlFor="salary-month">Month</label><select id="salary-month" disabled={saving} value={month} onChange={event => changeSelection(() => setMonth(Number(event.target.value)))}>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></div>
          <div className="field"><label htmlFor="salary-year">Year</label><input id="salary-year" type="number" min="1900" max="9999" step="1" disabled={saving} value={year} onChange={event => changeSelection(() => setYear(event.target.value))} /></div>
          <button className="btn" type="button" disabled={saving || loading || !validYear} onClick={() => changeSelection(() => setReload(current => current + 1))}><RotateCcw size={16}/> Reload</button>
        </div>
        {!validYear && <p role="alert">Enter a four-digit year from 1900 to 9999.</p>}
        {loading && <p role="status">Checking saved slip for {monthYear}...</p>}
        {error && <p role="alert" className="salaryLoadError">{error}</p>}
        {workspace && !editorOpen && <div className="salaryGeneratePrompt"><div><b>No salary slip for {monthYear}</b><p>{workspace.hasSavedDetails ? "Your saved employee details and earnings are ready. Enter this month's deductions after generating." : "Start with this employee's details, then edit and save them for future months."}</p></div><button className="btn green" type="button" onClick={() => fillEditor(workspace.defaults)}><Plus size={18}/> Generate salary slip</button></div>}
      </section>}

      {editorOpen && <form ref={editorRef} className="panel salaryFormPanel" onSubmit={event => { event.preventDefault(); saveSlip(); }}>
        <fieldset disabled={saving}>
          <div className="salaryEditorHeading"><div><span>{editingId ? "EDITING SAVED SLIP" : "NEW SLIP · NOT YET SAVED"}</span><h2>{monthYear}</h2><p>{editingId ? workspace?.slip?.slipNumber : selectedEmployee?.fullName}{dirty ? " · Unsaved changes" : ""}</p></div></div>
          <div className="salaryEditorSection"><h3>Employee & company details</h3><p>These details and earnings are reused for future months when you save. All fields remain editable.</p>{renderFields(detailFields)}</div>
          <div className="salaryEditorSection"><h3>Attendance for {monthYear}</h3>{renderFields(attendanceFields, true)}</div>
          <div className="salaryEditorSection"><h3>Earnings</h3>{renderFields(earnings, true)}</div>
          <div className="salaryEditorSection"><h3>Deductions for {monthYear}</h3><p>Deductions are saved only for this month and subtracted from the net salary.</p>{renderFields(deductions, true)}
            <div className="salaryCustomDeductions">{customDeductions.map((row, index) => <div className="salaryDeductionRow" key={row.key}>
              <div className="field"><label htmlFor={`deduction-label-${row.key}`}>Deduction {index + 1} label</label><input id={`deduction-label-${row.key}`} required maxLength={160} value={row.label} placeholder="e.g. Late arrival or advance recovery" onChange={event => updateDeduction(row.key, "label", event.target.value)} /></div>
              <div className="field"><label htmlFor={`deduction-amount-${row.key}`}>Amount (₹)</label><input id={`deduction-amount-${row.key}`} required type="number" min="0" max="1000000000" step="0.01" value={row.amount} onChange={event => updateDeduction(row.key, "amount", event.target.value)} /></div>
              <button type="button" className="btn red" aria-label={`Remove deduction ${index + 1}`} onClick={() => { setDirty(true); setCustomDeductions(current => current.filter(item => item.key !== row.key)); }}><X size={16}/></button>
            </div>)}</div>
            <button type="button" className="btn" disabled={customDeductions.length >= 50} onClick={() => { setDirty(true); setCustomDeductions(current => [...current, { key: crypto.randomUUID(), label: "", amount: "" }]); }}><Plus size={16}/> Add deduction</button>
          </div>
          {removedFields.length > 0 && <div className="removedSalaryFields"><div><RotateCcw size={17}/><span>Removed fields</span><small>Select a field to restore it.</small></div><section>{removedFields.map(key => <button type="button" key={key} onClick={() => restoreField(key)}><Plus size={13}/>{labels[key]}</button>)}</section></div>}
          <div className="salaryTotals" aria-live="polite"><div><small>Gross salary</small><b>₹{money(totals.totalEarning)}</b></div><div><small>Total deductions</small><b>₹{money(totals.totalDeduction)}</b></div><div><small>Net salary</small><b data-testid="net-salary">₹{money(totals.netPay)}</b></div></div>
          <div className="salaryFormActions"><button className="btn green" type="submit"><Save size={18}/>{saving ? "Saving..." : editingId ? "Save changes & employee details" : "Save slip & employee details"}</button><button className="btn" type="button" onClick={() => saveSlip({ print: true })}><Printer size={18}/> Save & print salary slip</button></div>
        </fieldset>
      </form>}
    </div>

    {editorOpen && <div className="salaryPrintPreview"><p className="noPrint salaryPreviewLabel">PRINT PREVIEW · A4</p><section className="salarySlip" aria-label="Salary slip print preview">
      <header className="salaryCompanyHeader">{["companyName", "address1", "address2"].filter(key => !removed.has(key)).map(key => key === "companyName" ? <h2 key={key}>{form[key] || "\u00a0"}</h2> : <p key={key}>{form[key] || "\u00a0"}</p>)}</header>
      <div className="salaryPrintTitle"><h1>Salary Slip</h1><p>For the month of <b>{monthYear}</b></p>{workspace?.slip && editingId && <small>{workspace.slip.slipNumber}</small>}</div>
      <div className="salaryPrintDetails">{[leftDetails, rightDetails].map((group, index) => <dl key={index}>{group.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{form[key] || "—"}</dd></div>)}</dl>)}</div>
      {attendanceFields.some(([key]) => !removed.has(key)) && <div className="salaryPrintAttendance">{attendanceFields.filter(([key]) => !removed.has(key)).map(([key, label]) => <span key={key}>{label}: <b>{form[key] || "0"}</b></span>)}</div>}
      <table className="salaryPayTable"><colgroup><col style={{ width: "34%" }}/><col style={{ width: "16%" }}/><col style={{ width: "34%" }}/><col style={{ width: "16%" }}/></colgroup>
        <thead><tr><th>Earnings</th><th className="salaryAmount">Amount (₹)</th><th>Deductions</th><th className="salaryAmount">Amount (₹)</th></tr></thead>
        <tbody>{payRows.map((_, index) => <tr key={index}><td>{visibleEarnings[index]?.label || "\u00a0"}</td><td className="salaryAmount">{visibleEarnings[index] ? money(visibleEarnings[index].amount) : ""}</td><td>{visibleDeductions[index]?.label || "\u00a0"}</td><td className="salaryAmount">{visibleDeductions[index] ? money(visibleDeductions[index].amount) : ""}</td></tr>)}</tbody>
        <tbody className="salaryPrintSummary"><tr><th>Gross salary</th><th className="salaryAmount">{money(totals.totalEarning)}</th><th>Total deductions</th><th className="salaryAmount">{money(totals.totalDeduction)}</th></tr><tr className="salaryNetPay"><th colSpan="3">Net payable for {monthYear}</th><th className="salaryAmount">₹{money(totals.netPay)}</th></tr><tr><td colSpan="4"><b>{amountInWords(totals.netPay)}</b></td></tr></tbody>
      </table>
      <p className="salaryPrintNote">This is a computer generated statement and does not require a signature.</p>
    </section></div>}

    {workspace && workspace.history.length > 0 && <section className="noPrint savedSalarySection"><div className="savedSalaryHeading"><div><span>EMPLOYEE HISTORY</span><h2>Saved slips for {selectedEmployee?.fullName}</h2><p>Select a month to reopen its saved details and deductions.</p></div></div><div className="savedSalaryGrid">{workspace.history.map(item => <button type="button" disabled={saving || !item.month || !item.year} className={`savedSalaryCard${item.id === editingId ? " editing" : ""}`} key={item.id} onClick={() => { if (Number(item.month) === month && String(item.year) === year) return; changeSelection(() => { setMonth(item.month); setYear(String(item.year)); }); }}><span>{item.slipNumber}</span><b>{item.month ? `${months[item.month - 1]} ${item.year}` : item.values?.monthYear || "Month missing"}</b><strong>₹{money(item.totals?.netPay)}</strong><small>{item.month ? "Open for editing" : "Legacy slip: month could not be identified"}</small></button>)}</div></section>}
  </div></main>;
}
