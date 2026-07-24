import { Link } from "react-router-dom";
import { Fingerprint, IdCard, PhoneCall, User } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";

export default function EmployeeDashboard() {
  return (
    <main className="screen">
      <div className="wide">
        <PageHeader icon={User} title="Employee Dashboard" subtitle="Select an option to manage your attendance and profile." />
        <section className="grid">
          <Link className="actionCard green" to="/employee/attendance">
            <div className="iconBox"><Fingerprint size={28} /></div>
            <h2>Mark Attendance</h2>
            <p className="muted">Mark your attendance using GPS location and registered browser verification.</p>
          </Link>
          <Link className="actionCard" to="/employee/profile">
            <div className="iconBox"><IdCard size={28} /></div>
            <h2>My Profile</h2>
            <p className="muted">View your employee ID, department, designation and registered browser status.</p>
          </Link>
          <Link className="actionCard purple" to="/employee/leads">
            <div className="iconBox"><PhoneCall size={28} /></div>
            <h2>New Leads</h2>
            <p className="muted">Open assigned leads, update remarks and track daily call attempts.</p>
          </Link>
        </section>
      </div>
    </main>
  );
}
