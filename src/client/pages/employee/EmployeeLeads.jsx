import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, PhoneCall, Search, UserRoundCheck } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { getLoggedInUser, normalize } from "../../utils";

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function EmployeeLeads() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [limits, setLimits] = useState({ maxActiveLeads: 50, dailyCallTarget: 3, callDaysTarget: 4, connectedFollowUpHours: 48 });
  const employee = getLoggedInUser();
  const toast = useToast();

  useEffect(() => {
    if (employee?.employeeId) loadLeads();
  }, []);

  async function loadLeads() {
    try {
      const result = await AttendanceApi.getEmployeeLeads(employee.employeeId);
      if (result.success) {
        setLeads(Array.isArray(result.data) ? result.data : []);
        setLimits(result.limits || limits);
      }
    } catch (error) {
      toast.error(error.message || "Leads loading failed.");
    }
  }

  const filtered = useMemo(() => {
    const needle = normalize(search);
    return leads.filter(lead => {
      return normalize(lead.name).includes(needle) || String(lead.phone || "").includes(needle);
    });
  }, [leads, search]);

  const todayPending = leads.filter(lead => lead.stats?.todayRemainingAttempts > 0).length;

  if (!employee?.employeeId) {
    return (
      <main className="centerScreen">
        <section className="panel authBox">
          <div className="authLogo">
            <div className="authIcon"><UserRoundCheck size={38} /></div>
            <h1>Login Required</h1>
            <p>Login from this Employee portal to fetch your assigned leads.</p>
          </div>
          <Link className="btn full" to="/">
            <LogIn size={18} /> Go to Employee Login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <div className="wide">
        <PageHeader
          icon={UserRoundCheck}
          title="New Leads"
          subtitle={`${leads.length}/${limits.maxActiveLeads} active leads. ${todayPending} need more calls today.`}
          tone="cyan"
        />

        <section className="panel">
          <div className="toolbar">
            <div className="field">
              <label>Search by name or no.</label>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or phone number" />
            </div>
          </div>

          <div className="leadGrid">
            {filtered.length === 0 && <div className="emptyState">No leads found</div>}
            {filtered.map(lead => (
              <article className="leadCard" key={lead.leadId}>
                <div>
                  <div className="leadTopline">
                    <h2>{lead.name}</h2>
                    <span className={"status " + (lead.stats.archiveEligible ? "active" : "leave")}>
                      {lead.stats.callMode === "connected_48h" ? "1 call / 48h" : `${lead.stats.completedDays}/${limits.callDaysTarget} days`}
                    </span>
                  </div>
                  <p className="leadPhone"><PhoneCall size={16} /> {lead.phone}</p>
                  <p className="muted">Last call: {formatDateTime(lead.stats.lastCallAt)}</p>
                  <p className="muted">Last connect: {formatDateTime(lead.stats.lastConnectedAt)}</p>
                </div>
                <div className="leadFooter">
                  <span className="miniMetric">{lead.stats.callMode === "connected_48h" ? lead.stats.requirementSummary : `${lead.stats.todayAttempts}/${limits.dailyCallTarget} today`}</span>
                  <Link className="btn" to={`/employee/leads/${lead.leadId}`}>
                    <Search size={18} /> Details
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
