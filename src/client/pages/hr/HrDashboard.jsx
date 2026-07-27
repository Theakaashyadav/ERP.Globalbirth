import { Link } from "react-router-dom";
import { BarChart3, BellRing, FileText, LayoutDashboard, PhoneCall, UsersRound } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";

export default function HrDashboard() {
  return (
    <main className="screen">
      <div className="wide">
        <PageHeader icon={LayoutDashboard} title="Employee Management System" subtitle="Manage attendance, employees, reports and salary details from one dashboard." />
        <section className="grid">
          <Link className="actionCard orange" to="/alerts/manage?sender=hr"><div className="iconBox"><BellRing size={28}/></div><h2>Employee Alerts</h2><p className="muted">Send HR announcements to every active employee app.</p></Link>
          <Link className="actionCard" to="/hr/reports">
            <div className="iconBox"><BarChart3 size={28} /></div>
            <h2>Attendance Reports</h2>
            <p className="muted">Check date-wise attendance, absent days and employee performance.</p>
          </Link>
          <Link className="actionCard purple" to="/hr/employees">
            <div className="iconBox"><UsersRound size={28} /></div>
            <h2>All Employees</h2>
            <p className="muted">View, update, search and delete employee records from one place.</p>
          </Link>
          <Link className="actionCard orange" to="/hr/salary-slip">
            <div className="iconBox"><FileText size={28} /></div>
            <h2>Salary Slip</h2>
            <p className="muted">Generate professional employee salary slips and print instantly.</p>
          </Link>
          <Link className="actionCard green" to="/hr/call-activity">
            <div className="iconBox"><PhoneCall size={28} /></div>
            <h2>Realtime Call Activity</h2>
            <p className="muted">Request today&apos;s call totals directly from selected employee phones without database storage.</p>
          </Link>
        </section>
      </div>
    </main>
  );
}
