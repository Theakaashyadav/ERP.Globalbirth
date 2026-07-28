import { Link, useNavigate } from "react-router-dom";
import { BarChart3, BellRing, Bug, Database, KeyRound, LogOut, Megaphone, PhoneCall, Rocket, Settings2, ShieldCheck, Users, Wifi } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { logout } from "../../auth.js";

const dashboardGroups = [
  { title:"Communication & Support", subtitle:"Employee messages and reported app issues", items:[
    { title:"Employee Alerts", description:"Send company-wide alerts and review previous messages.", path:"/alerts/manage?sender=admin", icon:BellRing, tone:"orange" },
    { title:"Mobile App Feedback", description:"Review reported errors, attempted actions and device context.", path:"/admin/app-feedback", icon:Bug, tone:"orange" }
  ]},
  { title:"Workforce Operations", subtitle:"People, attendance and sales management", items:[
    { title:"HR Dashboard", description:"Employees, attendance, reports, call activity and salary management.", path:"/hr", icon:Users, tone:"blue" },
    { title:"Marketing Dashboard", description:"Manage leads, assignments, team leaders and sales follow-ups.", path:"/marketing", icon:Megaphone, tone:"purple" },
    { title:"Realtime Call Activity", description:"Fetch temporary daily call totals from TL and Executive phones.", path:"/admin/call-activity", icon:PhoneCall, tone:"green" }
  ]},
  { title:"Mobile App & Attendance", subtitle:"Employee app controls and office access", items:[
    { title:"Mobile Feature Access", description:"Control feature visibility for every employee role.", path:"/admin/mobile-features", icon:Settings2, tone:"orange" },
    { title:"Office Wi-Fi Access", description:"Configure approved Wi-Fi devices across offices.", path:"/admin/office-wifi", icon:Wifi, tone:"green" },
    { title:"Android Releases", description:"Publish and manage mandatory employee-app updates.", path:"/admin/releases", icon:Rocket, tone:"green" }
  ]},
  { title:"System & Security", subtitle:"Credentials, database health and infrastructure", items:[
    { title:"Dashboard Credentials", description:"Reset management login IDs and passwords securely.", path:"/admin/credentials", icon:KeyRound, tone:"purple" },
    { title:"Database Analysis", description:"Monitor MongoDB health, storage, indexes and records.", path:"/admin/database", icon:Database, tone:"blue" }
  ]}
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
          <div><span className="eyebrow">9 SECURE MODULES</span><h2>Everything under control</h2><p>Select a workspace to manage your organization.</p></div>
          <BarChart3 size={38} />
        </section>

        <section className="adminGroupList">{dashboardGroups.map(group=><section className="adminModuleGroup" key={group.title}><header><div><h2>{group.title}</h2><p>{group.subtitle}</p></div><span>{group.items.length} modules</span></header><div className="adminDashboardGrid">{group.items.map(({title,description,path,icon:Icon,tone})=><Link className={`adminDashboardCard ${tone}`} to={path} key={path}><div className="adminCardTop"><span className="adminCardIcon"><Icon size={22}/></span><span className="adminCardArrow">→</span></div><div className="adminCardCopy"><h2>{title}</h2><p>{description}</p></div><span className="adminOpenLabel">Open module</span></Link>)}</div></section>)}</section>

        <p className="adminEmployeeNotice"><ShieldCheck size={16} /> Employee dashboard is intentionally excluded from admin access.</p>
      </div>
    </main>
  );
}
