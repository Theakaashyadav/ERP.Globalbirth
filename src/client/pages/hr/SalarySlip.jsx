import { useEffect, useMemo, useState } from "react";
import { Edit3, FileText, Plus, Printer, RotateCcw, Save, X } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { canAccessRole } from "../../auth.js";
import { useToast } from "../../components/Toast.jsx";
import "../../salary-slip-management.css";

const fields = [
  ["companyName", "Company Name"], ["address1", "Address Line 1"], ["address2", "Address Line 2"], ["monthYear", "Month & Year"],
  ["empCode", "Employee Code"], ["empName", "Employee Name"], ["fhName", "F/H Name"], ["designation", "Designation"],
  ["department", "Department"], ["pfNo", "P.F. Number"], ["panNo", "PAN No."], ["bankNo", "Bank A/c No."],
  ["esiNo", "ESI Number"], ["doj", "D.O.J."], ["uan", "UAN#"], ["paidDays", "Paid Days"], ["leaveDays", "Leave"]
];
const earnings = [["basic", "Basic Salary"], ["hra", "House Rent Allowance (HRA)"], ["perAllo", "Special Allowance"], ["convey", "Conveyance Allowance"], ["fuel", "FUEL"], ["uniform", "UNIFORM"], ["books", "BOOKS"], ["driver", "DRIVER S"], ["arr1", "ARR-1"], ["arr2", "ARR-2"], ["arr3", "ARR-3"], ["bonus", "BONUS"], ["dwage", "D.WAGE"], ["overtime", "OVERTIME"]];
const deductions = [["epf", "Employee EPF Contribution (Included in CTC)"], ["esic", "E.S.I.C."], ["advance", "ADVANCE"], ["itax", "I.TAX"], ["lwfee", "LWFEE"], ["ptax", "P.TAX"], ["recot", "REC-OT"], ["loan", "LOAN"]];
const allInputs = [...fields, ...earnings, ...deductions];
const labels = Object.fromEntries(allInputs);
const emptyForm = () => Object.fromEntries(allInputs.map(([key]) => [key, ""]));

function numberToWords(number) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = Math.round(Math.abs(number)); if (n === 0) return "Zero";
  function words(value) { if (value < 20) return a[value]; if (value < 100) return b[Math.floor(value / 10)] + (value % 10 ? " " + a[value % 10] : ""); if (value < 1000) return a[Math.floor(value / 100)] + " Hundred" + (value % 100 ? " " + words(value % 100) : ""); if (value < 100000) return words(Math.floor(value / 1000)) + " Thousand" + (value % 1000 ? " " + words(value % 1000) : ""); if (value < 10000000) return words(Math.floor(value / 100000)) + " Lakh" + (value % 100000 ? " " + words(value % 100000) : ""); return words(Math.floor(value / 10000000)) + " Crore" + (value % 10000000 ? " " + words(value % 10000000) : ""); }
  return words(n);
}

export default function SalarySlip() {
  const [form, setForm] = useState(emptyForm);
  const [removedFields, setRemovedFields] = useState([]);
  const [savedSlips, setSavedSlips] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const toast = useToast();
  const canManage = canAccessRole("hr");
  const removed = useMemo(() => new Set(removedFields), [removedFields]);

  async function loadSaved() {
    if (!canManage) return;
    setLoadingSaved(true);
    try { const result = await AttendanceApi.getSalarySlips(); if (!result.success) throw new Error(result.message); setSavedSlips(result.data || []); }
    catch (error) { toast.error(error.message || "Saved salary slips could not be loaded."); }
    finally { setLoadingSaved(false); }
  }
  useEffect(() => { loadSaved(); }, []);

  function update(key, value) { setForm(current => ({ ...current, [key]: value })); }
  function removeField(key) { setRemovedFields(current => current.includes(key) ? current : [...current, key]); }
  function restoreField(key) { setRemovedFields(current => current.filter(item => item !== key)); }
  function startNew() { setForm(emptyForm()); setRemovedFields([]); setEditingId(""); window.scrollTo({ top:0, behavior:"smooth" }); }
  function editSlip(item) { setForm({ ...emptyForm(), ...(item.values || {}) }); setRemovedFields(item.removedFields || []); setEditingId(item.id); window.scrollTo({ top:0, behavior:"smooth" }); toast.info(`Editing ${item.slipNumber}`); }

  const totals = useMemo(() => {
    const num = key => removed.has(key) ? 0 : Number(form[key]) || 0;
    const totalEarning = earnings.reduce((sum, [key]) => sum + num(key), 0), totalDeduction = deductions.reduce((sum, [key]) => sum + num(key), 0);
    return { totalEarning, totalDeduction, netPay:totalEarning-totalDeduction };
  }, [form, removed]);

  async function generateAndSave({ silent = false } = {}) {
    if (!canManage) { toast.warning("Sign in to the HR dashboard to save salary slips."); return false; }
    setSaving(true);
    try {
      const result = await AttendanceApi.saveSalarySlip(editingId, form, removedFields);
      if (!result.success) throw new Error(result.message);
      setEditingId(result.data.id); if (!silent) toast.success(result.message); await loadSaved(); return true;
    } catch (error) { toast.error(error.message || "Salary slip could not be saved."); return false; }
    finally { setSaving(false); }
  }
  async function printSlip() { if (!canManage || await generateAndSave({ silent:true })) window.print(); }

  const visibleEarnings = earnings.filter(([key]) => !removed.has(key));
  const visibleDeductions = deductions.filter(([key]) => !removed.has(key));
  const payRows = Array.from({ length:Math.max(visibleEarnings.length, visibleDeductions.length) });
  const leftDetails = [["empCode", "Employee Code"], ["empName", "Employee Name"], ["fhName", "F/H Name"], ["designation", "Designation"], ["department", "Department"]].filter(([key]) => !removed.has(key));
  const rightDetails = [["pfNo", "P.F. Number"], ["panNo", "PAN No."], ["bankNo", "Bank A/c No."], ["esiNo", "ESI Number"], ["doj", "D.O.J."], ["uan", "UAN#"]].filter(([key]) => !removed.has(key));

  return <main className="screen"><div className="wide">
    <div className="noPrint">
      <PageHeader icon={FileText} title="Salary Slip Generator" subtitle="Remove unnecessary fields, save generated slips and reopen them for editing." />
      <section className="panel salaryFormPanel">
        <div className="salaryEditorHeading"><div><span>{editingId ? "EDITING SAVED SLIP" : "NEW SALARY SLIP"}</span><h2>{editingId ? (savedSlips.find(item => item.id === editingId)?.slipNumber || "Saved salary slip") : "Enter salary details"}</h2></div>{editingId && <button className="btn" onClick={startNew}><Plus size={17}/> New Slip</button>}</div>
        <div className="formGrid salaryFieldGrid">{allInputs.filter(([key]) => !removed.has(key)).map(([key, label]) => <div className="field salaryRemovableField" key={key}><label>{label}</label><button type="button" className="salaryRemoveField" title={`Remove ${label}`} onClick={() => removeField(key)}><X size={14}/></button><input type={[...earnings,...deductions].some(([item]) => item === key) ? "number" : "text"} value={form[key]} onChange={event => update(key, event.target.value)} /></div>)}</div>
        {removedFields.length > 0 && <div className="removedSalaryFields"><div><RotateCcw size={17}/><span>Removed fields</span><small>Click a field to restore it.</small></div><section>{removedFields.map(key => <button type="button" key={key} onClick={() => restoreField(key)}><Plus size={13}/>{labels[key]}</button>)}</section></div>}
        <div className="salaryFormActions"><button className="btn green" disabled={saving} onClick={generateAndSave}><Save size={18}/>{saving ? "Saving..." : editingId ? "Save Changes" : "Generate & Save Slip"}</button><button className="btn" disabled={saving} onClick={printSlip}><Printer size={18}/> Print Salary Slip</button></div>
      </section>
    </div>

    <section className="salarySlip">
      <div style={{ textAlign:"right", marginBottom:26, lineHeight:1.4 }}>
        {!removed.has("companyName") && <><b>{form.companyName || "\u00a0"}</b><br/></>}
        {!removed.has("address1") && <><span>{form.address1 || "\u00a0"}</span><br/></>}
        {!removed.has("address2") && <span>{form.address2 || "\u00a0"}</span>}
      </div>
      {!removed.has("monthYear") && <p style={{textAlign:"center"}}>Salary Slip for the month of <b>{form.monthYear || "__________"}</b></p>}
      <table><tbody>
        {(leftDetails.length > 0 || rightDetails.length > 0) && <tr><td colSpan="3">{leftDetails.map(([key,label]) => <span className="salaryDetailLine" key={key}>{label}: {key === "empName" ? <b>{form[key]}</b> : form[key]}</span>)}</td><td colSpan="2">{rightDetails.map(([key,label]) => <span className="salaryDetailLine" key={key}>{label}: {form[key]}</span>)}</td></tr>}
        {(!removed.has("paidDays") || !removed.has("leaveDays")) && <tr>{!removed.has("paidDays") && <><td>Paid Days</td><td colSpan={removed.has("leaveDays") ? 4 : 1}>{form.paidDays}</td></>}{!removed.has("leaveDays") && <><td>Leave</td><td colSpan={removed.has("paidDays") ? 4 : 2}>{form.leaveDays}</td></>}</tr>}
        {payRows.length > 0 && <tr><th></th><th>Rate</th><th>Earnings</th><th>Deductions</th><th></th></tr>}
        {payRows.map((_, index) => { const earn=visibleEarnings[index] || ["",""]; const ded=visibleDeductions[index] || ["",""]; return <tr key={index}><td>{earn[1]}</td><td style={{textAlign:"right"}}>{form[earn[0]]}</td><td style={{textAlign:"right"}}>{form[earn[0]]}</td><td>{ded[1]}</td><td style={{textAlign:"right"}}>{form[ded[0]]}</td></tr>; })}
        {payRows.length > 0 && <><tr><td>Gross Salary</td><td style={{textAlign:"right"}}><b>{totals.totalEarning.toFixed(2)}</b></td><td style={{textAlign:"right"}}><b>{totals.totalEarning.toFixed(0)}</b></td><td>Total Deductions</td><td style={{textAlign:"right"}}><b>{totals.totalDeduction.toFixed(2)}</b></td></tr><tr><td colSpan="3"><b>Net Payable{!removed.has("monthYear") ? ` for the Month ${form.monthYear || "__________"}` : ""}</b></td><td colSpan="2" style={{textAlign:"center"}}><b>{totals.netPay.toFixed(2)}</b></td></tr><tr><td colSpan="5"><b>(Rupees {numberToWords(totals.netPay)} Only)</b></td></tr></>}
        <tr><td colSpan="5"><b><i>Note : This is computer generated statement and does not require signature</i></b></td></tr>
      </tbody></table>
    </section>

    {canManage && <section className="noPrint savedSalarySection"><div className="savedSalaryHeading"><div><span>SAVED IN DATABASE</span><h2>Generated salary slips</h2><p>Open any saved slip to refill its values and preserve its removed fields.</p></div><button className="btn" onClick={loadSaved} disabled={loadingSaved}><RotateCcw size={16}/>{loadingSaved ? "Loading..." : "Refresh"}</button></div>{loadingSaved && !savedSlips.length ? <div className="salarySavedEmpty">Loading saved salary slips...</div> : !savedSlips.length ? <div className="salarySavedEmpty">No salary slips have been saved yet.</div> : <div className="savedSalaryGrid">{savedSlips.map(item => <article className={editingId === item.id ? "savedSalaryCard editing" : "savedSalaryCard"} key={item.id}><header><div><span>{item.slipNumber}</span><h3>{item.values?.empName || "Unnamed employee"}</h3><small>{item.values?.empCode || "No employee code"} · {item.values?.monthYear || "No month"}</small></div><b>₹{Number(item.totals?.netPay||0).toFixed(2)}</b></header><div className="savedSalaryMeta"><span>{item.values?.department || "No department"}</span><span>{item.removedFields?.length || 0} fields removed</span><span>Updated {new Date(item.updatedAt).toLocaleString()}</span></div><footer><small>Generated by {item.generatedBy || "HR"}</small><button className="btn" onClick={() => editSlip(item)}><Edit3 size={16}/> Edit Slip</button></footer></article>)}</div>}</section>}
  </div></main>;
}
