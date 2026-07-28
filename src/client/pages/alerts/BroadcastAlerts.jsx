import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, BellRing, Clock3, Send, Trash2 } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";
import RecipientSelector, { emptyAudience } from "../../components/RecipientSelector.jsx";

export default function BroadcastAlerts() {
  const [params] = useSearchParams();
  const requested = params.get("sender")?.toLowerCase();
  const senderRole = ["admin", "hr", "marketing"].includes(requested) ? requested : "admin";
  const dashboardPath = senderRole === "admin" ? "/admin" : senderRole === "hr" ? "/hr" : "/marketing";
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState([]);
  const [sending, setSending] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [audience, setAudience] = useState(emptyAudience);
  const toast = useToast();

  async function load() {
    try {
      const [result, recipients] = await Promise.all([AttendanceApi.getBroadcastAlerts(senderRole), AttendanceApi.getAlertRecipients()]);
      if (!result.success || !recipients.success) throw new Error(result.message || recipients.message);
      setItems(result.data || []); setEmployees(recipients.data || []);
    } catch (error) {
      toast.error(error.message);
    }
  }

  useEffect(() => { load(); }, [senderRole]);

  async function remove(item) {
    if (!window.confirm(`Delete "${item.subject}"? Employees will no longer see this alert.`)) return;
    try {
      const result = await AttendanceApi.deleteBroadcastAlert(item.id, senderRole);
      if (!result.success) throw new Error(result.message);
      toast.success(result.message);
      setItems(current => current.filter(alert => alert.id !== item.id));
    } catch (error) {
      toast.error(error.message || "Could not delete alert.");
    }
  }

  async function send(event) {
    event.preventDefault();
    if (!audience.allEmployees && !audience.targetDepartments.length && !audience.targetEmployeeIds.length) { toast.warning("Select at least one department or employee."); return; }
    setSending(true);
    try {
      const result = await AttendanceApi.sendBroadcastAlert(subject, message, senderRole, audience);
      if (!result.success) throw new Error(result.message);
      toast.success(`${result.message} ${result.data?.notifiedDevices || 0} push notification(s) delivered.`);
      setSubject("");
      setMessage("");
      setAudience(emptyAudience);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not send alert.");
    } finally {
      setSending(false);
    }
  }

  return <main className="screen commonAlertManager"><div className="wide">
    <PageHeader icon={BellRing} title="Employee Alerts" subtitle={`Sending from the ${senderRole.toUpperCase()} dashboard to every active employee app.`} tone="orange" action={<Link className="btn secondary" to={dashboardPath}><ArrowLeft size={18}/> Dashboard</Link>}/>
    <section className="commonAlertLayout">
      <form className="panel commonAlertComposer" onSubmit={send}>
        <span className="eyebrow">NEW {senderRole.toUpperCase()} ALERT</span><h2>Compose alert</h2>
        <div className="commonAlertSender">Sent by <b>{senderRole.toUpperCase()}</b></div>
        <div className="field"><label>Subject</label><input required maxLength="150" value={subject} onChange={event => setSubject(event.target.value)} placeholder="Important announcement"/></div>
        <div className="field"><label>Full message</label><textarea required rows="8" maxLength="5000" value={message} onChange={event => setMessage(event.target.value)} placeholder="Write the complete message employees should receive..."/></div>
        <RecipientSelector employees={employees} value={audience} onChange={setAudience} accent="#ea580c"/>
        <button className="btn full orange" disabled={sending}><Send size={18}/>{sending ? "Sending..." : audience.allEmployees ? "Send Alert to All Employees" : "Send Alert to Selected Recipients"}</button>
      </form>
      <section className="panel commonAlertHistory">
        <span className="eyebrow">{senderRole.toUpperCase()} ALERTS ONLY</span><h2>Sent history</h2>
        <p className="muted">Alerts automatically expire after 48 hours. You can also delete them immediately.</p>
        <div>{items.length ? items.map(item => <article className="commonAlertHistoryItem" key={item.id}><div><div><b>{item.subject}</b><span>Sent by {item.sentByRole?.toUpperCase()} · {item.allEmployees ? "All employees" : `${item.targetDepartments?.length || 0} department(s), ${item.targetEmployeeIds?.length || 0} employee(s)`}</span></div><button type="button" className="commonAlertDelete" onClick={() => remove(item)} title="Delete alert"><Trash2 size={16}/> Delete</button></div><p>{item.message}</p><small><Clock3 size={13}/>{new Date(item.createdAt).toLocaleString()}</small></article>) : <p className="muted">No {senderRole.toUpperCase()} alerts have been sent.</p>}</div>
      </section>
    </section>
  </div></main>;
}
