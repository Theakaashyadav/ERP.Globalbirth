import { useEffect, useState } from "react";
import { BellRing, Check, CheckCircle2, Download, Fingerprint, MapPin, ShieldCheck, Smartphone, Sparkles, UserRoundCheck, Wifi } from "lucide-react";

const features = [
  { icon: MapPin, title: "Smart attendance", text: "Secure office Wi-Fi attendance with accurate daily records.", tone: "emerald" },
  { icon: UserRoundCheck, title: "Lead workspace", text: "Receive, call and update assigned leads from one place.", tone: "violet" },
  { icon: BellRing, title: "Instant alerts", text: "Stay informed with company, HR and marketing notifications.", tone: "amber" },
  { icon: Fingerprint, title: "Protected access", text: "Biometric or 4-digit PIN login tied to your registered device.", tone: "blue" }
];

export default function AppDownloadPage() {
  const [release, setRelease] = useState(null);
  useEffect(() => { fetch("/api/app-update/latest").then(response => response.json()).then(data => { if (data.available) setRelease(data.release); }).catch(() => {}); }, []);
  const version = release?.versionName || "1.20.6";
  const size = release?.sizeBytes ? `${(release.sizeBytes / 1048576).toFixed(1)} MB` : "17.7 MB";
  const apkUrl = "/downloads/GlobalOne-Employee.apk?v=31";

  return <main className="appDownloadPage">
    <nav className="downloadNav">
      <div className="downloadBrand"><span>G</span><div><b>Global Birth</b><small>Employee Workspace</small></div></div>
      <span className="downloadSecure"><ShieldCheck size={16}/> Official distribution</span>
    </nav>

    <section className="downloadHero">
      <div className="downloadHeroCopy">
        <span className="downloadEyebrow"><Sparkles size={15}/> GLOBAL ONE FOR ANDROID</span>
        <h1>Your workday,<br/><em>connected.</em></h1>
        <p>Attendance, assigned leads, important alerts and your employee profile—securely available wherever your work takes you.</p>
        <a className="downloadPrimary" href={apkUrl} download>
          <span className="downloadPrimaryIcon"><Download size={24}/></span>
          <span><b>Download Android App</b><small>Version {version} · {size} · APK</small></span>
        </a>
        <div className="downloadTrust"><span><Check size={15}/> Verified APK</span><span><Check size={15}/> Secure login</span><span><Check size={15}/> Mandatory updates</span></div>
      </div>

      <div className="downloadVisual" aria-hidden="true">
        <span className="downloadGlow one"/><span className="downloadGlow two"/>
        <div className="downloadPhone">
          <div className="downloadPhoneBar"/><div className="downloadPhoneHeader"><div className="downloadAppMark">G</div><div><b>Good morning</b><small>Employee dashboard</small></div><span>●</span></div>
          <div className="downloadWelcome"><small>WELCOME BACK</small><b>Everything you need,<br/>in one place.</b></div>
          <div className="downloadPhoneGrid"><span><MapPin/>Attendance</span><span><UserRoundCheck/>Leads</span><span><BellRing/>Alerts<i>3</i></span><span><Fingerprint/>Profile</span></div>
          <div className="downloadPhoneStatus"><Wifi size={16}/><div><b>Background sync active</b><small>Connected securely</small></div><CheckCircle2 size={17}/></div>
        </div>
        <div className="downloadFloatCard alert"><BellRing/><span><b>New Alert</b><small>Company update received</small></span></div>
        <div className="downloadFloatCard secure"><ShieldCheck/><span><b>Device secured</b><small>Biometric protection</small></span></div>
      </div>
    </section>

    <section className="downloadFeatureSection">
      <div className="downloadSectionTitle"><span>BUILT FOR YOUR WORKDAY</span><h2>One app. Everything important.</h2><p>A focused mobile workspace designed for speed, security and clear communication.</p></div>
      <div className="downloadFeatureGrid">{features.map(({ icon: Icon, title, text, tone }) => <article className={`downloadFeature ${tone}`} key={title}><span><Icon size={22}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
    </section>

    <section className="downloadInstall">
      <div><span>QUICK INSTALLATION</span><h2>Ready in three simple steps.</h2><p>The app is distributed directly by Global Birth for authorized employees.</p></div>
      <ol>
        <li><b>1</b><span><strong>Download the APK</strong><small>Tap the green download button above.</small></span></li>
        <li><b>2</b><span><strong>Allow installation</strong><small>Approve “Install unknown apps” if Android asks.</small></span></li>
        <li><b>3</b><span><strong>Sign in securely</strong><small>Use your registered phone and 4-digit PIN.</small></span></li>
      </ol>
    </section>

    <section className="downloadCta"><div><Smartphone size={30}/><span><b>Global One Employee App</b><small>Official Android release · Version {version}</small></span></div><a href={apkUrl} download><Download size={19}/> Download now</a></section>
    <footer className="downloadFooter"><div className="downloadBrand"><span>G</span><div><b>Global Birth</b><small>Employee Workspace</small></div></div><p>Secure internal employee application · Android 11 or newer</p></footer>
  </main>;
}
