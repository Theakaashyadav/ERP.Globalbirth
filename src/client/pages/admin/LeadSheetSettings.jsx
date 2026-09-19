import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clipboard, FileCode2, FileSpreadsheet, Save } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api.js";
import { buildLeadSheetScript } from "./leadSheetScript.js";

function readableTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString("en-IN");
}

function statusLabel(status) {
  return ({ connected: "Receiving leads", error: "Needs attention", waiting_for_first_sync: "Waiting for first lead", waiting_for_first_webhook: "Waiting for first lead", not_configured: "Not connected" })[status] || "Waiting for first lead";
}

export default function LeadSheetSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [employeeIds, setEmployeeIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const sheetChanged = settings && sheetUrl.trim() !== (settings.sheetUrl || "");
  const changed = settings && (sheetChanged || [...employeeIds].sort().join("|") !== [...(settings.employeeIds || [])].sort().join("|"));
  const webhookUrl = `${window.location.origin}/api/lead-sheet/webhook`;
  const script = useMemo(() => {
    if (!settings?.sheetUrl || !settings?.webhookSecret) return { code: "", error: "Save the Sheet link and employees to generate the script." };
    try { return { code: buildLeadSheetScript({ sheetUrl: settings.sheetUrl, webhookUrl, webhookSecret: settings.webhookSecret }), error: "" }; }
    catch (error) { return { code: "", error: error.message }; }
  }, [settings?.sheetUrl, settings?.webhookSecret, webhookUrl]);
  const canCopyScript = !loading && !saving && !changed && Boolean(script.code);

  function toggleEmployee(id) {
    setEmployeeIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  async function copyScript() {
    if (!canCopyScript) return;
    try {
      await navigator.clipboard.writeText(script.code);
      setCopied(true);
      toast.success("Apps Script copied. Paste it into the connected Sheet's Apps Script editor.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy the script. Select the code below and copy it manually.");
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await AttendanceApi.updateLeadSheetSettings(sheetUrl.trim(), employeeIds);
      if (!result.success) throw new Error(result.message || "Could not save Sheet settings.");
      applySettings(result.data);
      setCopied(false);
      toast.success(sheetChanged ? "New Sheet saved. Copy and install the updated script in that Sheet." : "Lead Sheet settings saved.");
    } catch (error) {
      toast.error(error.message || "Could not save Sheet settings.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="screen leadSheetPage"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={FileSpreadsheet} title="Lead Sheet Connection" subtitle="Send new Sheet leads to selected employees and track assignment status in the Sheet." tone="green" /><Link className="btn dark" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link></div>

    <section className="panel leadSheetInstructions">
      <h2>Connect your Google Sheet</h2>
      <ol>
        <li>Open the tab where Meta saves leads, then paste its full Google Sheet URL here (including <b>#gid=...</b> when shown). Keep a header row with a phone or mobile column near the top.</li>
        <li>Select the employees who should receive leads, then save the connection.</li>
        <li>Copy the Apps Script below. In the connected Sheet, open <b>Extensions &gt; Apps Script</b>, replace the code in <b>Code.gs</b>, and save it.</li>
        <li>Choose <b>setupGlobalOneLeadSync</b> in the Apps Script function menu, click <b>Run</b>, and approve Google's permissions once. The script then starts sending leads automatically.</li>
      </ol>
      <p className="muted">Google Form submissions and manual Sheet edits can run right away. Meta and other API writes do not fire Google Sheet edit triggers, so the script checks for them every minute.</p>
      <p className="muted">Meta's custom question columns are sent with each lead automatically. You can add or rename question columns in the same tab without changing the script.</p>
      <p className="muted"><b>GlobalOne Sharing Status</b> shows <b>Done</b> after the employee assignment is saved, or <b>Not Done</b> while a row waits. <b>GlobalOne Notification Status</b> tracks whether the push service accepted the alert; it does not confirm that the employee's phone displayed it.</p>
      <p className="muted">A completely empty lead tab can be connected before the first Meta lead arrives. The script waits for Meta to add its column headings.</p>
      <p className="muted">If setup cannot find the lead columns, check that the saved URL points to the lead tab. If Meta moves leads to another tab, save that tab's link, copy the new script, and run setup again.</p>
    </section>

    <form className="panel leadSheetForm" onSubmit={save}>
      <label className="field"><span>Google Sheet link</span><input type="url" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" disabled={loading || saving} required /></label>
      <div className="leadSheetEmployees">
        <h2>Employees to receive new leads</h2>
        <p className="muted">New rows are shared evenly across these active Sales employees. Once assigned, a lead stays with that employee.</p>
        {loading ? <p>Loading employees...</p> : employees.length ? <div className="leadSheetEmployeeGrid">{employees.map(employee => <label className="leadSheetEmployee" key={employee.employeeId}><input type="checkbox" checked={employeeIds.includes(employee.employeeId)} onChange={() => toggleEmployee(employee.employeeId)} /><span><b>{employee.fullName}</b><small>{employee.employeeId} - {employee.designation || "Sales"}</small></span></label>)}</div> : <p>No active Sales employees are available.</p>}
      </div>
      <div className="leadSheetActions"><button className="btn green" type="submit" disabled={loading || saving || employeeIds.length === 0}><Save size={17}/> {saving ? "Saving..." : "Save connection"}</button></div>
      {sheetChanged && <p className="muted leadSheetChangedNote">After saving a different Sheet link, copy and install the updated script in the new Sheet. Changing employees alone does not require reinstalling it.</p>}
    </form>

    <section className="panel leadSheetScriptPanel">
      <div className="leadSheetScriptHeading"><div><h2>Apps Script for this Sheet</h2><p className="muted">Copy this code after saving your Sheet link. It sends every lead column to the web API and writes the employee name, sharing status, and notification status into the Sheet. Sharing status becomes <b>Done</b> only after the assignment is saved.</p></div><button className="btn dark" type="button" onClick={copyScript} disabled={!canCopyScript}>{copied ? <Check size={17}/> : <Clipboard size={17}/>} {copied ? "Copied" : "Copy Apps Script"}</button></div>
      {changed ? <p className="leadSheetScriptNotice">Save your changes before copying the script. A new Sheet link creates a new connection key.</p> : script.error ? <p className="leadSheetScriptNotice">{script.error}</p> : <details className="leadSheetScriptPreview"><summary><FileCode2 size={16}/> Show generated code</summary><textarea readOnly value={script.code} onFocus={event => event.target.select()} aria-label="Generated Google Apps Script" /></details>}
      {window.location.protocol !== "https:" && <p className="leadSheetScriptNotice">Open the hosted HTTPS admin dashboard to copy the script. Google Apps Script cannot call a local or HTTP web address.</p>}
    </section>

    <section className="panel leadSheetStatus"><h2>Connection status</h2><div><span>Status</span><b>{statusLabel(settings?.status)}</b></div><div><span>Last Sheet API call</span><b>{readableTime(settings?.lastWebhookAt)}</b></div>{settings?.lastWebhookStatus && <div><span>Last API result</span><b>{settings.lastWebhookStatus}</b></div>}{settings?.lastImportedCount != null && <div><span>Leads assigned in last check</span><b>{settings.lastImportedCount}</b></div>}{settings?.lastPendingCount != null && <div><span>Rows waiting for a valid phone number</span><b>{settings.lastPendingCount}</b></div>}{settings?.lastError && <p className="leadSheetError">{settings.lastError}</p>}</section>
  </div></main>;
}
