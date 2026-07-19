import { useState } from "react";
import { useNavigate } from "react-router-dom";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { Save, UserPlus } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { onlyDigits } from "../../utils";

const initialForm = {
  fullName: "",
  phone: "",
  pin: "",
  email: "",
  dob: "",
  gender: "",
  address: ""
};

export default function EmployeeRegister() {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  function update(name, value) {
    setForm(current => ({ ...current, [name]: value }));
  }

  async function getPublicIP() {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      return data.ip || "IP_NOT_FOUND";
    } catch {
      return "IP_NOT_FOUND";
    }
  }

  async function getFingerprint() {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      return result.visitorId;
    } catch {
      let id = localStorage.getItem("backupDeviceId");
      if (!id) {
        id = "DEV-" + crypto.randomUUID();
        localStorage.setItem("backupDeviceId", id);
      }
      return id;
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (!form.fullName.trim()) {
      toast.warning("Please enter full name.");
      return;
    }

    if (!/^[0-9]{10}$/.test(form.phone)) {
      toast.warning("Please enter a valid 10 digit phone number.");
      return;
    }

    if (!/^[0-9]{6}$/.test(form.pin)) {
      toast.warning("Please enter a valid 6 digit PIN.");
      return;
    }

    setSaving(true);

    try {
      const [ipAddress, fingerprintId] = await Promise.all([getPublicIP(), getFingerprint()]);
      const employeeId = "EMP" + Date.now().toString().slice(-6);

      const result = await AttendanceApi.addEmployee({
        ...form,
        employeeId,
        status: "Inactive",
        registeredIpAddress: ipAddress,
        registeredFingerprintId: fingerprintId
      });

      if (!result.success) {
        toast.error(result.message || "Employee details not saved.");
        return;
      }

      toast.success("Employee personal details saved successfully.");
      setForm(initialForm);
      navigate("/");
    } catch (error) {
      toast.error(error.message || "Database save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <div className="narrow">
        <PageHeader icon={UserPlus} title="Add Employee" subtitle="Save employee personal details for login and attendance." />

        <section className="panel">
          <form onSubmit={submit} className="formGrid">
            <div className="field"><label>Full Name</label><input value={form.fullName} onChange={e => update("fullName", e.target.value)} /></div>
            <div className="field"><label>Phone Number</label><input value={form.phone} onChange={e => update("phone", onlyDigits(e.target.value, 10))} /></div>
            <div className="field"><label>Create 6 Digit PIN</label><input type="password" value={form.pin} onChange={e => update("pin", onlyDigits(e.target.value, 6))} /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => update("email", e.target.value)} /></div>
            <div className="field"><label>Date of Birth</label><input type="date" value={form.dob} onChange={e => update("dob", e.target.value)} /></div>
            <div className="field"><label>Gender</label><select value={form.gender} onChange={e => update("gender", e.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></div>
            <div className="field fullSpan"><label>Address</label><textarea value={form.address} onChange={e => update("address", e.target.value)} /></div>
            <button className="btn full fullSpan" disabled={saving}><Save size={18} /> {saving ? "Saving..." : "Save Details"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
