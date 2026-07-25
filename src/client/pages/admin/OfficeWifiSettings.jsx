import { useEffect, useState } from "react";
import { ArrowLeft, Building2, MapPin, Plus, Save, Trash2, Wifi } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";

const blankOffice = () => ({ officeId: crypto.randomUUID(), name: "", ssid: "", bssid: "", ipPrefix: "", active: true });

export default function OfficeWifiSettings() {
  const [offices, setOffices] = useState([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { (async () => { try { const result = await AttendanceApi.getOfficeWifiSettings(); setOffices(result.data?.offices || []); } catch (error) { toast.error(error.message || "Could not load office Wi-Fi settings."); } })(); }, []);
  const change = (officeId, field, value) => setOffices(current => current.map(item => item.officeId === officeId ? { ...item, [field]: value } : item));
  async function save() { setSaving(true); try { const result = await AttendanceApi.updateOfficeWifiSettings(offices); setOffices(result.data?.offices || []); toast.success("Office Wi-Fi settings saved. Employee apps will use them immediately."); } catch (error) { toast.error(error.message || "Could not save office Wi-Fi settings."); } finally { setSaving(false); } }
  return <main className="screen officeWifiPage"><div className="wide">
    <div className="adminHubTopbar"><PageHeader icon={Wifi} title="Office Wi-Fi Access" subtitle="Allow attendance from the approved Wi-Fi router at each office." tone="cyan"/><Link className="btn dark" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link></div>
    <div className="wifiPolicyNotice"><MapPin size={22}/><div><b>Accurate multi-office verification</b><span>Add the exact Wi-Fi name (SSID), router BSSID and/or local IP prefix. Every entered detail must match the employee's current connection. Nothing is stored with attendance.</span></div></div>
    <section className="officeWifiGrid">{offices.map((office, index) => <article className={`panel officeWifiCard ${office.active ? "active" : "inactive"}`} key={office.officeId}>
      <div className="officeWifiHeading"><span><Building2 size={21}/><b>{office.name || `Office ${index + 1}`}</b></span><label className="wifiActive"><input type="checkbox" checked={office.active} onChange={event => change(office.officeId, "active", event.target.checked)}/><span>{office.active ? "Enabled" : "Disabled"}</span></label></div>
      <div className="officeWifiFields"><label><span>Office name *</span><input value={office.name} onChange={event => change(office.officeId, "name", event.target.value)} placeholder="Noida Head Office"/></label><label><span>Wi-Fi name (SSID)</span><input value={office.ssid} onChange={event => change(office.officeId, "ssid", event.target.value)} placeholder="Globalbirth_Office"/></label><label><span>Router BSSID</span><input value={office.bssid} onChange={event => change(office.officeId, "bssid", event.target.value)} placeholder="aa:bb:cc:dd:ee:ff"/></label><label><span>Local IP prefix</span><input value={office.ipPrefix} onChange={event => change(office.officeId, "ipPrefix", event.target.value)} placeholder="192.168.1."/></label></div>
      <button type="button" className="wifiRemove" onClick={() => setOffices(current => current.filter(item => item.officeId !== office.officeId))}><Trash2 size={16}/> Remove office</button>
    </article>)}<button type="button" className="officeAddCard" onClick={() => setOffices(current => [...current, blankOffice()])}><Plus size={27}/><b>Add another office</b><span>Configure its approved Wi-Fi device</span></button></section>
    <div className="featureSaveBar"><button className="btn green" disabled={saving} onClick={save}><Save size={18}/>{saving ? "Saving..." : "Save Office Wi-Fi"}</button></div>
  </div></main>;
}
