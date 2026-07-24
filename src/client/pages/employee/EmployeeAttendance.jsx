import { useEffect, useState } from "react";
import { Fingerprint, LocateFixed } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { useToast } from "../../components/Toast.jsx";
import { AttendanceApi } from "../../api";
import { getCurrentTime12, getLoggedInUser, getTodayISODate, normalize } from "../../utils";

const OFFICE_CONFIG = {
  officeLat: 28.50281482302745,
  officeLng: 77.41009481827919,
  allowedRadiusMeter: 100,
  maxGpsAccuracyMeter: 100
};

function distanceMeter(lat1, lon1, lat2, lon2) {
  const radius = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function EmployeeAttendance() {
  const [employee, setEmployee] = useState(null);
  const [gps, setGps] = useState({ verified: false, message: "Checking office radius..." });
  const [status, setStatus] = useState("Attendance Status: Ready");
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setEmployee(getLoggedInUser());
    verifyLocation();
  }, []);

  function verifyLocation() {
    setGps({ verified: false, message: "Checking office radius..." });

    if (!navigator.geolocation) {
      setGps({ verified: false, message: "GPS not supported in this browser." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 9999;
        const distance = distanceMeter(lat, lng, OFFICE_CONFIG.officeLat, OFFICE_CONFIG.officeLng);
        const verified = distance <= OFFICE_CONFIG.allowedRadiusMeter && accuracy <= OFFICE_CONFIG.maxGpsAccuracyMeter;

        setGps({
          verified,
          lat,
          lng,
          accuracy: Math.round(accuracy),
          distance: Math.round(distance),
          message: `${verified ? "In" : "Out of"} office radius. Distance: ${Math.round(distance)}m | Accuracy: ${Math.round(accuracy)}m`
        });
      },
      () => setGps({ verified: false, message: "GPS permission denied or unavailable." }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function getTodayAttendanceStatus(employeeId) {
    const result = await AttendanceApi.getEmployeeAttendance(employeeId);
    if (!result.success || !Array.isArray(result.data)) return "";
    const row = result.data.find(item => String(item.employeeId) === String(employeeId));
    return String(row?.[getTodayISODate()] || "").trim();
  }

  async function saveAttendance() {
    if (!employee?.employeeId) {
      toast.error("Please login first.");
      return;
    }

    if (normalize(employee.status) !== "active") {
      toast.error("Employee inactive.");
      return;
    }

    if (!gps.verified) {
      toast.error("Out of office radius.");
      return;
    }

    setSaving(true);

    try {
      const existing = normalize(await getTodayAttendanceStatus(employee.employeeId));

      if (existing && existing !== "pending leave" && existing !== "rejected leave") {
        setStatus("Attendance Status: Already marked");
        toast.warning("Attendance already marked for today.");
        return;
      }

      const time = getCurrentTime12();
      const result = await AttendanceApi.saveAttendance([{
        employeeId: employee.employeeId,
        date: getTodayISODate(),
        time,
        gpsVerified: gps.verified ? "Yes" : "No",
        gpsLatitude: gps.lat || "",
        gpsLongitude: gps.lng || "",
        gpsAccuracy: gps.accuracy || "",
        officeDistanceMeter: gps.distance || "",
        allowedRadiusMeter: OFFICE_CONFIG.allowedRadiusMeter,
        officeVerified: gps.verified ? "Yes" : "No",
        attendanceSource: "web-gps"
      }]);

      if (result.success) {
        setStatus("Attendance Status: Marked");
        toast.success("Attendance marked at " + time + ".");
      } else {
        toast.error(result.message || "Attendance not saved.");
      }
    } catch (error) {
      toast.error(error.message || "Attendance not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="screen">
      <div className="narrow">
        <PageHeader icon={LocateFixed} title="Self Attendance" subtitle="Mark your attendance from office location." />
        <section className="panel">
          <h2>{new Date().toLocaleTimeString("en-IN")}</h2>
          <p className="muted">{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>

          <div className="panel" style={{ boxShadow: "none", margin: "18px 0" }}>
            <h3>{employee?.fullName || employee?.name || "Employee not logged in"}</h3>
            <p><b>Employee ID:</b> {employee?.employeeId || "-"}</p>
            <p><b>Department:</b> {employee?.department || "-"}</p>
            <p><b>Designation:</b> {employee?.designation || "-"}</p>
          </div>

          <div className={"alert " + (gps.verified ? "ok" : "")} style={gps.verified ? { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" } : null}>{gps.message}</div>
          <div className="panel" style={{ boxShadow: "none", padding: 14, marginBottom: 16, fontWeight: 900 }}>{status}</div>

          <button className="btn full green" onClick={saveAttendance} disabled={saving || status.includes("Marked")}>
            <Fingerprint size={18} /> {saving ? "Saving..." : "Mark My Attendance"}
          </button>
        </section>
      </div>
    </main>
  );
}
