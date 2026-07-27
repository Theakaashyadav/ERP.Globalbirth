import { Link, useNavigate } from "react-router-dom";
import { BarChart3, BellRing, ClipboardPlus, LogOut, Megaphone, Route, UsersRound } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { logout } from "../../auth.js";

const modules = [
  { title: "Employee Alerts", description: "Send marketing notices and important messages to every active employee.", path: "/alerts/manage", icon: BellRing, tone: "orange", label: "Open alert center" },
  {
    title: "Assign Leads",
    description: "Create new leads, assign them to Sales TLs, monitor team capacity and reassign expired leads.",
    path: "/marketing/assign",
    icon: ClipboardPlus,
    tone: "purple",
    label: "Open assignment workspace"
  },
  {
    title: "Lead Analysis",
    description: "Analyse TL and Executive performance, statuses, remarks, follow-ups, call attempts and realtime phone activity.",
    path: "/marketing/analysis",
    icon: BarChart3,
    tone: "blue",
    label: "Open intelligence workspace"
  }
];

export default function MarketingHome() {
  const navigate = useNavigate();
  function signOut(){ logout(); navigate("/marketing/login",{replace:true}); }
  return <main className="screen adminHubScreen"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={Megaphone} title="Marketing Dashboard" subtitle="Lead distribution, team oversight and sales intelligence" tone="purple"/><button className="btn danger adminSignOut" onClick={signOut}><LogOut size={17}/> Sign Out</button></div>
    <section className="adminWelcome panel marketingWelcome"><div><span className="eyebrow">MARKETING CONTROL CENTER</span><h2>Manage the complete lead journey</h2><p>Assign opportunities to the right team and analyse every follow-up from one workspace.</p></div><UsersRound size={56}/></section>
    <section className="marketingModuleGrid">{modules.map(({title,description,path,icon:Icon,tone,label})=><Link className={`adminDashboardCard ${tone} marketingModuleCard`} to={path} key={path}><span className="adminCardIcon"><Icon size={30}/></span><div><h2>{title}</h2><p>{description}</p></div><span className="adminOpenLabel">{label} →</span></Link>)}</section>
    <p className="adminEmployeeNotice"><Route size={16}/> Marketing → TL → Executive lead workflow</p>
  </div></main>;
}
