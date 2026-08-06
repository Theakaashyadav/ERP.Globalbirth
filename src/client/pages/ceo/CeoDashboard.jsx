import { Link, useNavigate } from "react-router-dom";
import { BellRing, CalendarCheck2, Crown, LogOut, ShieldCheck, UsersRound } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { logout } from "../../auth.js";

const modules = [
  { title: "Attendance View", description: "Review daily attendance, status, clock-in time and HR remarks.", path: "/ceo/attendance", icon: CalendarCheck2, tone: "blue" },
  { title: "Employee Alerts", description: "Send targeted company announcements and review CEO alert history.", path: "/alerts/manage?sender=ceo", icon: BellRing, tone: "orange" },
  { title: "All Employees", description: "View current employees, departments, designations and account status.", path: "/ceo/employees", icon: UsersRound, tone: "green" }
];

export default function CeoDashboard() {
  const navigate = useNavigate();
  function signOut() { logout(); navigate("/ceo/login", { replace: true }); }
  return <main className="screen adminHubScreen"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={Crown} title="CEO Executive Dashboard" subtitle="A focused view of people, attendance and company communication." tone="cyan"/><button className="btn danger" onClick={signOut}><LogOut size={17}/> Sign Out</button></div>
    <section className="adminWelcome panel"><div><span className="eyebrow">EXECUTIVE WORKSPACE</span><h2>Company overview at a glance</h2><p>Review workforce information without changing HR-managed records.</p></div><ShieldCheck size={38}/></section>
    <div className="adminDashboardGrid">{modules.map(({title,description,path,icon:Icon,tone})=><Link className={`adminDashboardCard ${tone}`} to={path} key={path}><div className="adminCardTop"><span className="adminCardIcon"><Icon size={22}/></span><span className="adminCardArrow">→</span></div><div className="adminCardCopy"><h2>{title}</h2><p>{description}</p></div><span className="adminOpenLabel">Open module</span></Link>)}</div>
  </div></main>;
}
