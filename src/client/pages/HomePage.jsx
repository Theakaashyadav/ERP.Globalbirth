import { ArrowRight, Download, HeartPulse, Megaphone, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Link } from "react-router-dom";

const portals = [
  { title: "Admin Portal", description: "System controls, dashboard access, app releases and database health.", path: "/admin-login", icon: ShieldCheck, tone: "admin" },
  { title: "HR Portal", description: "Employees, attendance reports, call activity and workforce records.", path: "/hr/login", icon: Users, tone: "hr" },
  { title: "Marketing Portal", description: "Lead assignment, team oversight, follow-ups and performance analysis.", path: "/marketing/login", icon: Megaphone, tone: "marketing" }
];

export default function HomePage() {
  return <main className="erpHome">
    <nav className="erpNav"><Link className="erpBrand" to="/"><span>G</span><div><b>Global Birth</b><small>ERP Workspace</small></div></Link><a className="erpNavDownload" href="/downloads/GlobalOne-Employee.apk" download><Download size={17}/> Download Employee App</a></nav>
    <section className="erpHero">
      <div className="erpHeroCopy"><span className="erpEyebrow"><HeartPulse size={15}/> ONE CONNECTED WORKSPACE</span><h1>Manage people, attendance and leads from one secure ERP.</h1><p>Choose your authorized management portal or install the Global One Employee App for attendance, lead calls, alerts and follow-ups.</p><div className="erpHeroActions"><a className="erpPrimary" href="#portals">Open a dashboard <ArrowRight size={18}/></a><a className="erpSecondary" href="/downloads/GlobalOne-Employee.apk" download><Smartphone size={18}/> Download Android App</a></div></div>
      <div className="erpPhone"><div className="erpPhoneTop"/><div className="erpPhoneLogo">G</div><b>Global One</b><small>Employee App</small><div className="erpMiniGrid"><span>Attendance</span><span>Leads</span><span>Alerts</span><span>Profile</span></div><a href="/downloads/GlobalOne-Employee.apk" download><Download size={17}/> Download APK</a></div>
    </section>
    <section className="erpPortalSection" id="portals"><div className="erpSectionTitle"><span>AUTHORIZED ACCESS</span><h2>Select your dashboard</h2><p>Use the portal assigned to your role. Admin users can open every management dashboard after one login.</p></div><div className="erpPortalGrid">{portals.map(({title,description,path,icon:Icon,tone})=><Link className={`erpPortalCard ${tone}`} to={path} key={path}><span className="erpPortalIcon"><Icon size={27}/></span><div><h3>{title}</h3><p>{description}</p></div><span className="erpPortalOpen">Secure login <ArrowRight size={17}/></span></Link>)}</div></section>
    <section className="erpAppBand"><div><span>ANDROID EMPLOYEE APP</span><h2>Attendance and sales work in your pocket.</h2><p>Install the official APK directly. Mandatory future releases are delivered securely inside the app.</p></div><a href="/downloads/GlobalOne-Employee.apk" download><Download size={20}/><span><b>Download APK</b><small>Android employee application</small></span></a></section>
    <footer className="erpFooter"><div className="erpBrand"><span>G</span><div><b>Global Birth</b><small>ERP Workspace</small></div></div><p>Internal business management system · Authorized users only</p></footer>
  </main>;
}
