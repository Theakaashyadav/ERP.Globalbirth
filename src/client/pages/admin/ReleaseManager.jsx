import { useEffect, useState } from "react";
import { GitBranch, PackageCheck, Rocket, Send, ShieldCheck } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";

const config = window.ATTENDANCE_DB_CONFIG || {};
const apiKey = config.apiKey || localStorage.getItem("attendanceApiKey") || "";
function dashboardToken(){try{return JSON.parse(localStorage.getItem("dashboardSession")||"null")?.token||""}catch{return ""}}
function headers() { const value=apiKey ? { Authorization: `Bearer ${apiKey}` } : {}; const token=dashboardToken(); if(token)value["X-Dashboard-Session"]=token; return value; }
function size(value) { const bytes=Number(value)||0; return bytes>1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`; }

export default function ReleaseManager() {
  const [latest,setLatest]=useState(null); const [versionCode,setVersionCode]=useState("");
  const [versionName,setVersionName]=useState(""); const [notes,setNotes]=useState("");
  const [publishing,setPublishing]=useState(false); const toast=useToast();
  async function load(){try{const response=await fetch("/api/app-update/latest",{headers:headers()});const data=await response.json();setLatest(data.available?data.release:null)}catch(error){toast.error(error.message)}}
  useEffect(()=>{load()},[]);
  async function publish(event){event.preventDefault();setPublishing(true);try{const response=await fetch("/api/app-update/publish",{method:"POST",headers:{...headers(),"Content-Type":"application/json"},body:JSON.stringify({versionCode:Number(versionCode),versionName,notes})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||"Alert failed.");toast.success("Mandatory update alert sent.");await load()}catch(error){toast.error(error.message||"Could not send update alert.")}finally{setPublishing(false)}}
  return <main className="screen"><div className="wide"><PageHeader icon={Rocket} title="Android Release Alerts" subtitle="Send mandatory update alerts for the APK already published in GitHub." tone="cyan" />
    <section className="releaseGrid"><section className="panel releaseFormPanel"><div className="releasePanelHeading"><Send size={26}/><div><span className="eyebrow">NEW MANDATORY ALERT</span><h2>Release GitHub APK</h2></div></div><form onSubmit={publish}>
      <div className="releaseSecurity"><GitBranch size={20}/><div><b>APK source: GitHub</b><span>No file upload is needed. The server fetches and verifies public/downloads/GlobalOne-Employee.apk from the main branch.</span></div></div>
      <div className="releaseFieldRow"><div className="field"><label>Version Code</label><input type="number" min="1" required value={versionCode} onChange={e=>setVersionCode(e.target.value)} placeholder="Example: 3"/></div><div className="field"><label>Version Name</label><input required value={versionName} onChange={e=>setVersionName(e.target.value)} placeholder="Example: 1.2.0"/></div></div>
      <div className="field"><label>Release Notes</label><textarea rows="5" maxLength="1000" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What changed in this version?"/></div>
      <div className="releaseSecurity"><ShieldCheck size={20}/><div><b>Administrator session verified</b><span>Your active Admin Dashboard session authorizes this publication.</span></div></div>
      <button className="btn full cyan" disabled={publishing}><Send size={18}/>{publishing?"Checking GitHub & Sending...":"Send Mandatory Update Alert"}</button>
    </form></section>
    <aside className="panel latestRelease"><div className="releasePanelHeading"><PackageCheck size={26}/><div><span className="eyebrow">CURRENT ALERT</span><h2>Latest GitHub release alert</h2></div></div>{latest?<><div className="versionHero"><b>v{latest.versionName}</b><span>Build {latest.versionCode}</span></div><dl><div><dt>Released</dt><dd>{new Date(latest.releasedAt).toLocaleString()}</dd></div><div><dt>GitHub APK size</dt><dd>{size(latest.sizeBytes)}</dd></div><div><dt>Policy</dt><dd><span className="mandatoryBadge">Mandatory</span></dd></div><div><dt>SHA-256</dt><dd className="checksum">{latest.sha256}</dd></div></dl><div className="releaseNotes"><b>Release notes</b><p>{latest.notes||"No release notes."}</p></div></>:<div className="releaseEmpty"><PackageCheck size={40}/><b>No alert published</b><span>Enter the GitHub APK version and send the first mandatory update alert.</span></div>}</aside></section>
    <div className="releaseWarning"><ShieldCheck size={20}/><p><b>Release order:</b> First replace the APK in GitHub, then enter its version here and send the alert. Employee apps download the verified APK from GitHub.</p></div>
  </div></main>
}
