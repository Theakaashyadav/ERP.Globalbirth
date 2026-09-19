import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, FileSpreadsheet, RefreshCcw, Save } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api.js";

function readableTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString("en-IN");
}

function statusLabel(status) {
  return ({ connected: "Connected", error: "Needs attention", waiting_for_first_sync: "Waiting for first check", not_configured: "Not connected" })[status] || "Not connected";
}

export default function LeadSheetSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [employeeIds, setEmployeeIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  function applySettings(data) {
    setSettings(data);
    setSheetUrl(data.sheetUrl || "");
    setEmployeeIds(data.employeeIds || []);
  }

  useEffect(() => {
    AttendanceApi.getLeadSheetSettings()
      .then(result => {
        if (!result.success) throw new Error(result.message || "Could not load Sheet settings.");
        applySettings(result.data);
      })
      .catch(error => toast.error(error.message || "Could not load Sheet settings."))
      .finally(() => setLoading(false));
  }, []);

  const employees = useMemo(() => (settings?.employees || []).filter(employee => employee.status === "Active" && employee.department === "Sales"), [settings]);
  const changed = settings && (sheetUrl.trim() !== (settings.sheetUrl || "") || [...employeeIds].sort().join("|") !== [...(settings.employeeIds || [])].sort().join("|"));

  function toggleEmployee(id) {
    setEmployeeIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(settings.serviceAccountEmail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the email. Select and copy it manually.");
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await AttendanceApi.updateLeadSheetSettings(sheetUrl.trim(), employeeIds);
      if (!result.success) throw new Error(result.message || "Could not save Sheet settings.");
      applySettings(result.data);
      toast.success("Lead Sheet settings saved. New rows will be checked automatically.");
    } catch (error) {
      toast.error(error.message || "Could not save Sheet settings.");
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await AttendanceApi.syncLeadSheet();
      if (!result.success) throw new Error(result.message || "Sheet check failed.");
      setSettings(current => ({ ...current, ...result.data }));
      toast.success(`${result.data.importedCount || 0} new lead(s) assigned.`);
    } catch (error) {
      toast.error(error.message || "Sheet check failed.");
    } finally {
      setSyncing(false);
    }
  }

  return <main className="screen leadSheetPage"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={FileSpreadsheet} title="Lead Sheet Connection" subtitle="Assign new Sheet leads to selected employees and write their names back to the Sheet." tone="green" /><Link className="btn dark" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link></div>

    <section className="panel leadSheetInstructions">
      <h2>Connect your Google Sheet</h2>
      <ol>
        <li>Paste the Google Sheet link below. The first row of the selected tab must contain column names.</li>
        <li>Share the Sheet with the server account below as <b>Editor</b>. A private Sheet cannot be connected by its link alone.</li>
        <li>Select the employees who should receive new leads, then save. The server checks for new rows about every 10 seconds.</li>
      </ol>
      {settings?.serviceAccountEmail ? <div className="leadSheetShare"><span>Share with</span><code>{settings.serviceAccountEmail}</code><button className="btn dark" type="button" onClick={copyEmail}>{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? "Copied" : "Copy email"}</button></div> : <p className="leadSheetError">The server account is not configured yet. Add Google/Firebase service account credentials on the server before connecting a Sheet.</p>}
      <p className="muted">No Apps Script code is needed for this connection. Google Sheets access comes from sharing with the server account.</p>
    </section>

    <form className="panel leadSheetForm" onSubmit={save}>
      <label className="field"><span>Google Sheet link</span><input type="url" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" disabled={loading || saving} required /></label>
      <div className="leadSheetEmployees">
        <h2>Employees to receive new leads</h2>
        <p className="muted">New rows are shared evenly across these active Sales employees. Once assigned, a lead stays with that employee.</p>
        {loading ? <p>Loading employees...</p> : employees.length ? <div className="leadSheetEmployeeGrid">{employees.map(employee => <label className="leadSheetEmployee" key={employee.employeeId}><input type="checkbox" checked={employeeIds.includes(employee.employeeId)} onChange={() => toggleEmployee(employee.employeeId)} /><span><b>{employee.fullName}</b><small>{employee.employeeId} · {employee.designation || "Sales"}</small></span></label>)}</div> : <p>No active Sales employees are available.</p>}
      </div>
      <div className="leadSheetActions"><button className="btn green" type="submit" disabled={loading || saving || !settings?.serviceAccountEmail || employeeIds.length === 0}><Save size={17}/> {saving ? "Saving..." : "Save connection"}</button><button className="btn cyan" type="button" onClick={syncNow} disabled={loading || syncing || !settings?.sheetUrl || changed}><RefreshCcw size={17}/> {syncing ? "Checking..." : "Check Sheet now"}</button></div>
    </form>

    <section className="panel leadSheetStatus"><h2>Connection status</h2><div><span>Status</span><b>{statusLabel(settings?.status)}</b></div><div><span>Last checked</span><b>{readableTime(settings?.lastSyncAt)}</b></div><div><span>New leads in last check</span><b>{settings?.lastImportedCount ?? 0}</b></div><div><span>Rows waiting for a valid phone number</span><b>{settings?.lastPendingCount ?? 0}</b></div>{settings?.lastError && <p className="leadSheetError">{settings.lastError}</p>}</section>
  </div></main>;
}
