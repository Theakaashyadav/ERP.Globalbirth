import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LogIn, PhoneCall, Save } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { getCurrentTime12, getLoggedInUser } from "../../utils";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (!value) return "0s";
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default function EmployeeLeadDetails() {
  const { leadId } = useParams();
  const employee = getLoggedInUser();
  const [lead, setLead] = useState(null);
  const [remark, setRemark] = useState("");
  const [status, setStatus] = useState("No Response");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [connected, setConnected] = useState("No");
  const [durationSeconds, setDurationSeconds] = useState("");
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (employee?.employeeId) loadLead();
  }, [leadId]);

  async function loadLead() {
    try {
      const result = await AttendanceApi.getLeadDetails(leadId, employee.employeeId);
      if (!result.success) {
        toast.error(result.message || "Lead not found.");
        navigate("/employee/leads");
        return;
      }

      setLead(result.data);
      setRemark(result.data.lastRemark || "");
      setStatus(["Interested", "Not Interested", "No Response", "Cold", "Hot", "Wrong No.", "Meeting Fix"].includes(result.data.status) ? result.data.status : "No Response");
      setNextFollowUpDate(result.data.nextFollowUpDate || "");
      setMeetingDate(result.data.meetingDate || "");
    } catch (error) {
      toast.error(error.message || "Lead loading failed.");
    }
  }

  async function saveRemark(event) {
    event.preventDefault();

    if (!remark.trim()) {
      toast.warning("Remark is mandatory.");
      return;
    }

    try {
      const result = await AttendanceApi.updateLeadRemark({
        leadId,
        employeeId: employee.employeeId,
        status,
        remark,
        nextFollowUpDate,
        meetingDate
      });

      if (result.success) {
        setLead(result.data);
        toast.success("Lead remark saved.");
      }
    } catch (error) {
      toast.error(error.message || "Remark save failed.");
    }
  }

  async function addManualAttempt() {
    try {
      const result = await AttendanceApi.recordLeadCall({
        leadId,
        employeeId: employee.employeeId,
        calledAt: new Date().toISOString(),
        durationSeconds,
        connected,
        source: "manual-web",
        remark: remark || `Manual call at ${getCurrentTime12()}`
      });

      if (result.success) {
        setLead(result.data);
        setDurationSeconds("");
        toast.success("Call attempt added.");
      }
    } catch (error) {
      toast.error(error.message || "Call attempt save failed.");
    }
  }

  const attempts = useMemo(() => {
    return (lead?.attempts || []).slice().sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt));
  }, [lead]);
  const fields = lead?.sheetFields || {};
  const sheetColumns = [...new Set([...(lead?.sheetFieldOrder || []), ...Object.keys(fields)])];
  const sheetFields = sheetColumns.map(column => [column, fields[column]]);

  if (!employee?.employeeId) {
    return (
      <main className="centerScreen">
        <section className="panel authBox">
          <div className="authLogo">
            <div className="authIcon"><PhoneCall size={38} /></div>
            <h1>Login Required</h1>
            <p>Login from this Employee portal to open lead details.</p>
          </div>
          <Link className="btn full" to="/">
            <LogIn size={18} /> Go to Employee Login
          </Link>
        </section>
      </main>
    );
  }

  if (!lead) return null;

  return (
    <main className="screen">
      <div className="wide">
        <PageHeader
          icon={PhoneCall}
          title={lead.name}
          subtitle={`${lead.phone || "No phone number"} · ${lead.status || "New"}`}
          tone="cyan"
          action={<Link className="btn dark" to="/employee/leads"><ArrowLeft size={18} /> Back</Link>}
        />

        <section className="panel" style={{ marginBottom: 18 }}>
          <h2>Lead details from Google Sheet</h2>
          {sheetFields.length === 0 ? (
            <p className="muted">No Sheet fields are available for this lead.</p>
          ) : (
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, margin: 0 }}>
              {sheetFields.map(([column, value]) => (
                <div key={column} style={{ minWidth: 0, padding: 14, border: "1px solid #e2e8f0", borderRadius: 14, background: "#f8fafc" }}>
                  <dt className="muted" style={{ fontWeight: 700, marginBottom: 6, overflowWrap: "anywhere" }}>{column}</dt>
                  <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
                    {value === null || value === undefined || String(value).trim() === "" ? "-" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="leadDetailsLayout">
          <div className="panel">
            <div className="detailHero">
              <div>
                <span className="muted">Lead Phone</span>
                <h2>{lead.phone}</h2>
              </div>
              <span className="status active">Assigned to you</span>
            </div>

            <div className="metricGrid">
              <div className="metricBox"><b>{lead.stats?.totalAttempts || 0}</b><span>Total calls</span></div>
              <div className="metricBox"><b>{lead.stats?.connectedAttempts || 0}</b><span>Connected</span></div>
            </div>
            <p className="muted">Assigned: {formatDateTime(lead.assignedAt)}</p>
            {lead.nextFollowUpDate && <p className="muted">Next follow-up: {formatDateTime(lead.nextFollowUpDate)}</p>}
            {lead.meetingDate && <p className="muted">Meeting: {formatDateTime(lead.meetingDate)}</p>}
          </div>

          <div className="panel">
            <form onSubmit={saveRemark}>
              <div className="formGrid">
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={event => setStatus(event.target.value)}>
                    <option>Interested</option>
                    <option>Not Interested</option>
                    <option>No Response</option>
                    <option>Cold</option>
                    <option>Hot</option>
                    <option>Wrong No.</option>
                    <option>Meeting Fix</option>
                  </select>
                </div>
                {["Interested", "Cold", "Hot", "No Response"].includes(status) && (
                  <div className="field"><label>Next Follow-up Date</label><input type="date" value={nextFollowUpDate} onChange={event => setNextFollowUpDate(event.target.value)} required /></div>
                )}
                {status === "Meeting Fix" && (
                  <div className="field"><label>Meeting Date</label><input type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} required /></div>
                )}
                <div className="field">
                  <label>Last call connected</label>
                  <select value={connected} onChange={event => setConnected(event.target.value)}>
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>
                <div className="field">
                  <label>Duration seconds</label>
                  <input type="number" value={durationSeconds} onChange={event => setDurationSeconds(event.target.value)} placeholder="0" />
                </div>
                <div className="field fullSpan">
                  <label>Remark</label>
                  <textarea required value={remark} onChange={event => setRemark(event.target.value)} placeholder="Customer response, objection, or next action..." />
                </div>
              </div>
              <div className="toolbar">
                <button className="btn" type="submit"><Save size={18} /> Save Remark</button>
                <button className="btn green" type="button" onClick={addManualAttempt}><PhoneCall size={18} /> Add Call Attempt</button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 18 }}>
          <h2>Call History</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Connected</th>
                  <th>Duration</th>
                  <th>Source</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {attempts.length === 0 && <tr><td colSpan="5" style={{ textAlign: "center", padding: 30 }}>No call attempts yet</td></tr>}
                {attempts.map((attempt, index) => (
                  <tr key={attempt.calledAt + index}>
                    <td>{formatDateTime(attempt.calledAt)}</td>
                    <td><span className={"status " + (attempt.connected ? "active" : "inactive")}>{attempt.connected ? "Yes" : "No"}</span></td>
                    <td>{formatDuration(attempt.durationSeconds)}</td>
                    <td>{attempt.source}</td>
                    <td>{attempt.remark || "-"}</td>
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
