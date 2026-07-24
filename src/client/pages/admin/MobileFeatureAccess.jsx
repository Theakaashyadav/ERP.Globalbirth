import { useEffect, useState } from "react";
import { ArrowLeft, Check, Save, Settings2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";

const roleLabels = { tl: "Sales Team Leader", executive: "Sales Executive", hr: "HR Employee", backend: "Backend Employee" };
const featureLabels = {
  attendance: ["Attendance", "Mark and review personal attendance"],
  leads: ["Assigned Leads", "Call, delegate and update assigned leads"],
  alerts: ["Lead Alerts", "Follow-ups, pending attempts and lead reminders"],
  profile: ["My Profile", "View personal and employment information"]
};

export default function MobileFeatureAccess() {
  const [roles, setRoles] = useState([]);
  const [features, setFeatures] = useState([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const result = await AttendanceApi.getMobileFeatureSettings();
      if (result.success) { setRoles(result.data.roles || []); setFeatures(result.data.features || []); }
    } catch (error) { toast.error(error.message || "Could not load mobile access settings."); }
  }

  useEffect(() => { load(); }, []);

  function toggle(role, feature) {
    setRoles(current => current.map(item => item.role !== role ? item : {
      ...item,
      features: item.features.includes(feature) ? item.features.filter(value => value !== feature) : [...item.features, feature]
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await AttendanceApi.updateMobileFeatureSettings(roles);
      if (!result.success) throw new Error(result.message);
      setRoles(result.data.roles || []);
      toast.success("Mobile app feature access updated.");
    } catch (error) { toast.error(error.message || "Could not save access settings."); }
    finally { setSaving(false); }
  }

  return <main className="screen adminHubScreen"><div className="wide">
    <div className="adminHubTopbar">
      <PageHeader icon={Settings2} title="Mobile Feature Access" subtitle="Choose which dashboard features each employee role can use." tone="cyan" />
      <Link className="btn dark adminSignOut" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link>
    </div>
    <div className="featurePolicyNotice"><ShieldCheck size={20}/><div><b>Server-controlled access</b><span>Changes appear when employees reopen or return to the app dashboard. Sign Out is always available.</span></div></div>
    <section className="featureRoleGrid">
      {roles.map(item => <article className="panel featureRoleCard" key={item.role}>
        <div className="featureRoleHeading"><span>{roleLabels[item.role]}</span><small>{item.features.length} enabled</small></div>
        <div className="featureToggleList">
          {features.map(feature => {
            const checked = item.features.includes(feature);
            return <button type="button" className={`featureToggle ${checked ? "selected" : ""}`} onClick={() => toggle(item.role, feature)} key={feature}>
              <span className="featureCheck">{checked && <Check size={16}/>}</span>
              <span><b>{featureLabels[feature]?.[0] || feature}</b><small>{featureLabels[feature]?.[1]}</small></span>
            </button>;
          })}
        </div>
      </article>)}
    </section>
    <div className="featureSaveBar"><button className="btn green" disabled={saving || !roles.length} onClick={save}><Save size={18}/>{saving ? "Saving..." : "Save Feature Access"}</button></div>
  </div></main>;
}
