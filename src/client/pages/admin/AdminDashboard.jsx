import { Link, useNavigate } from "react-router-dom";
import { BarChart3, BellRing, Database, KeyRound, LogOut, Megaphone, Rocket, Settings2, ShieldCheck, Users, Wifi } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { logout } from "../../auth.js";

const dashboards = [
  { title: "Employee Alerts", description: "Send company-wide alerts and review previous messages.", path: "/alerts/manage", icon: BellRing, tone: "orange" },
  { title: "Office Wi-Fi Access", description: "Configure approved Wi-Fi devices for attendance across multiple offices.", path: "/admin/office-wifi", icon: Wifi, tone: "green" },
  { title: "Dashboard Credentials", description: "Reset Admin, HR and Marketing login IDs and passwords securely.", path: "/admin/credentials", icon: KeyRound, tone: "purple" },
  {
    title: "Database Analysis",
    description: "Live MongoDB health, connection, storage utilization, indexes and record totals.",
    path: "/admin/database",
    icon: Database,
    tone: "blue"
  },
  {
    title: "Mobile Feature Access",
    description: "Control Attendance, Leads and Profile visibility for TLs, Executives, HR and Backend employees.",
    path: "/admin/mobile-features",
    icon: Settings2,
    tone: "orange"
  },
  {
    title: "HR Dashboard",
    description: "Employees, attendance, reports, call activity and salary management.",
    path: "/hr",
    icon: Users,
    tone: "blue"
  },
  {
    title: "Marketing Dashboard",
    description: "Manage leads, assignments, team leaders and sales follow-ups.",
    path: "/marketing",
    icon: Megaphone,
    tone: "purple"
  },
  {
    title: "Android Releases",
    description: "Publish and manage mandatory employee-app updates.",
    path: "/admin/releases",
    icon: Rocket,
    tone: "green"
  }
];

export default function AdminDashboard() {
  const navigate = useNavigate();

  function signOut() {
    logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <main className="screen adminHubScreen">
      <div className="wide">
        <div className="adminHubTopbar">
          <PageHeader icon={ShieldCheck} title="Admin Control Center" subtitle="One secure login for every management dashboard." tone="cyan" />
          <button className="btn danger adminSignOut" onClick={signOut}><LogOut size={17} /> Sign Out</button>
        </div>

        <section className="adminWelcome panel">
          <div><span className="eyebrow">MANAGEMENT OVERVIEW</span><h2>Choose a dashboard</h2><p>Open any management area without entering another password.</p></div>
          <BarChart3 size={54} />
        </section>

        <section className="adminDashboardGrid">
          {dashboards.map(({ title, description, path, icon: Icon, tone }) => (
            <Link className={`adminDashboardCard ${tone}`} to={path} key={path}>
              <span className="adminCardIcon"><Icon size={28} /></span>
              <div><h2>{title}</h2><p>{description}</p></div>
              <span className="adminOpenLabel">Open dashboard →</span>
            </Link>
          ))}
        </section>

        <p className="adminEmployeeNotice"><ShieldCheck size={16} /> Employee dashboard is intentionally excluded from admin access.</p>
      </div>
    </main>
  );
}
