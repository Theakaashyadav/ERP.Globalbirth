import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { BarChart3, CalendarDays, CheckCircle2, Clock3, Download, Save, Search, Users, UserX, Palmtree } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api";
import { formatDateISO, getDateRange, getTodayISODate, normalize } from "../../utils";
import { useToast } from "../../components/Toast.jsx";

function getStatusFromValue(value) {
  const text = String(value || "").trim();
  const lower = normalize(text);

  if (!text) return "Absent";
  if (["leave", "approved leave", "paid leave"].includes(lower)) return "Leave";
  if (lower === "pending leave") return "Pending Leave";
  if (lower === "rejected leave" || lower === "leave rejected") return "Rejected Leave";
  if (lower === "week off" || lower === "weekoff" || lower === "weekly off") return "Week Off";
  if (lower === "absent") return "Absent";
  if (lower === "late" || lower.includes("(late)") || /\blate\b/i.test(text)) return "Late";
  return "Present";
}

function formatAttendanceTime(value) {
  const text = String(value || "")
    .replace(/\((present|late)\)/ig, "")
    .replace(/\bPresent\b/ig, "")
    .replace(/\bLate\b/ig, "")
    .replace(/\s+/g, " ")
    .trim();

  return text || "-";
}

function formatReportDate(value) {
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function summarize(days) {
  return days.reduce((summary, day) => {
    if (day.status === "Present") summary.present += 1;
    if (day.status === "Late") summary.late += 1;
    if (day.status === "Absent") summary.absent += 1;
    if (["Leave", "Pending Leave", "Rejected Leave"].includes(day.status)) summary.leave += 1;
    return summary;
  }, { present: 0, late: 0, absent: 0, leave: 0 });
}

export default function Reports() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [fromDate, setFromDate] = useState(getTodayISODate());
  const [toDate, setToDate] = useState(getTodayISODate());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [attendanceEdits, setAttendanceEdits] = useState({});
  const [savingCell, setSavingCell] = useState("");
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [employeeResult, attendanceResult] = await Promise.all([
        AttendanceApi.getEmployees(),
        AttendanceApi.getAttendance()
      ]);

      setEmployees(employeeResult.success && Array.isArray(employeeResult.data) ? employeeResult.data : []);
      setAttendance(attendanceResult.success && Array.isArray(attendanceResult.data) ? attendanceResult.data : []);
    } catch (err) {
      setError(err.message || "Failed to load attendance data from database.");
    }
  }

  const dateRange = useMemo(() => getDateRange(fromDate, toDate), [fromDate, toDate]);

  const report = useMemo(() => {
    const map = new Map();

    attendance.forEach(row => {
      const employeeId = String(row.employeeId || "").trim();
      if (!employeeId) return;
      map.set(employeeId, {
        employeeId,
        name: row.name || "-",
        department: row.department || "-",
        designation: row.designation || "-",
        attendanceRow: row
      });
    });

    employees.forEach(emp => {
      const employeeId = String(emp.employeeId || "").trim();
      if (!employeeId) return;
      const old = map.get(employeeId) || {};
      map.set(employeeId, {
        employeeId,
        name: emp.fullName || emp.name || old.name || "-",
        department: emp.department || old.department || "-",
        designation: emp.designation || old.designation || "-",
        attendanceRow: old.attendanceRow || null
      });
    });

    return Array.from(map.values())
      .map(emp => {
        const days = dateRange.map(date => {
          const rawValue = String(emp.attendanceRow?.[date] || "").trim();
          const savedStatus = String(emp.attendanceRow?.statuses?.[date] || "").trim();
          const status = ["Present", "Late", "Absent", "Leave"].includes(savedStatus) ? savedStatus : getStatusFromValue(rawValue);
          return {
            date,
            rawValue,
            status,
            display: status === "Absent" ? "-" : formatAttendanceTime(rawValue),
            remark: String(emp.attendanceRow?.remarks?.[date] || "")
          };
        });

        return { ...emp, days, summary: summarize(days) };
      })
      .filter(emp => normalize(emp.name + " " + emp.employeeId).includes(normalize(search)))
      .map(emp => {
        if (!statusFilter) return emp;
        const days = emp.days.filter(day => day.status === statusFilter);
        return { ...emp, days, summary: summarize(days) };
      })
      .filter(emp => !statusFilter || emp.days.length);
  }, [attendance, employees, dateRange, search, statusFilter]);

  const todayStats = useMemo(() => {
    const today = getTodayISODate();
    const rows = employees.map(emp => {
      const row = attendance.find(item => String(item.employeeId) === String(emp.employeeId));
      const savedStatus = String(row?.statuses?.[today] || "");
      return ["Present", "Late", "Absent", "Leave"].includes(savedStatus) ? savedStatus : getStatusFromValue(row?.[today]);
    });

    return {
      total: employees.length,
      present: rows.filter(status => status === "Present").length,
      late: rows.filter(status => status === "Late").length,
      absent: rows.filter(status => status === "Absent").length,
      leave: rows.filter(status => ["Leave", "Pending Leave", "Rejected Leave"].includes(status)).length
    };
  }, [attendance, employees]);

  function setThisMonth() {
    const today = new Date();
    setFromDate(formatDateISO(new Date(today.getFullYear(), today.getMonth(), 1)));
    setToDate(formatDateISO(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  }

  function updateAttendanceEdit(key, field, value, day) {
    setAttendanceEdits(current => ({
      ...current,
      [key]: { status: day.status || "Absent", remark: day.remark || "", ...(current[key] || {}), [field]: value }
    }));
  }

  async function saveAttendanceDay(employee, day, key) {
    const edit = attendanceEdits[key] || { status: day.status || "Absent", remark: day.remark || "" };
    setSavingCell(key);
    try {
      const result = await AttendanceApi.updateAttendanceRemark(employee.employeeId, day.date, edit.status, edit.remark.trim());
      if (!result.success) {
        toast.error(result.message || "Attendance was not updated.");
        return;
      }
      toast.success(`${employee.name}'s attendance updated for ${day.date}.`);
      setAttendanceEdits(current => { const next = { ...current }; delete next[key]; return next; });
      await loadData();
    } catch (err) {
      toast.error(err.message || "Attendance was not updated.");
    } finally {
      setSavingCell("");
    }
  }

  async function downloadExcel() {
    if (!report.length || !dateRange.length) {
      toast.warning("No data available to download.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance Report");

    sheet.columns = [
      { header: "Employee ID", key: "employeeId", width: 16 },
      { header: "Name", key: "name", width: 25 },
      { header: "Department", key: "department", width: 18 },
      { header: "Designation", key: "designation", width: 22 },
      ...dateRange.map((date, index) => ({ header: date, key: "date_" + index, width: 18 })),
      { header: "Total Present", key: "totalPresent", width: 15 },
      { header: "Total Late", key: "totalLate", width: 15 },
      { header: "Total Absent", key: "totalAbsent", width: 15 },
      { header: "Total Leave", key: "totalLeave", width: 15 }
    ];

    report.forEach(emp => {
      const row = {
        employeeId: emp.employeeId,
        name: emp.name,
        department: emp.department,
        designation: emp.designation,
        totalPresent: emp.summary.present,
        totalLate: emp.summary.late,
        totalAbsent: emp.summary.absent,
        totalLeave: emp.summary.leave
      };

      dateRange.forEach((date, index) => {
        const day = emp.days.find(item => item.date === date);
        row["date_" + index] = day ? `${day.display}\n${day.status}` : "-";
      });

      sheet.addRow(row);
    });

    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance-report-${fromDate}-to-${toDate}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Excel file downloaded successfully.");
  }

  return (
    <main className="screen">
      <div className="wide">
        <PageHeader icon={BarChart3} title="Attendance Reports" subtitle="Admin can view GPS-marked employee attendance date-wise." tone="cyan" />
        {error && <div className="alert">{error}</div>}

        <section className="attendanceStats">
          <Stat icon={Users} label="Total Employees" value={todayStats.total} tone="blue" />
          <Stat icon={CheckCircle2} label="Present Today" value={todayStats.present} tone="green" />
          <Stat icon={Clock3} label="Late Today" value={todayStats.late} tone="amber" />
          <Stat icon={UserX} label="Absent Today" value={todayStats.absent} tone="red" />
          <Stat icon={Palmtree} label="On Leave" value={todayStats.leave} tone="purple" />
        </section>

        <section className="panel attendancePanel">
          <div className="reportIntro">
            <div><span className="eyebrow">REPORT CONTROLS</span><h2>Attendance overview</h2><p>Filter employees and dates, review daily status, and update HR classification.</p></div>
            <button className="btn green" onClick={downloadExcel}><Download size={18} /> Export Excel</button>
          </div>
          <div className="toolbar attendanceToolbar">
            <div className="field"><label>From Date</label><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
            <div className="field"><label>To Date</label><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
            <div className="field searchField"><label>Search Employee</label><div><Search size={17} /><input placeholder="Name or employee ID" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
            <div className="field"><label>Status Filter</label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All Status</option><option>Present</option><option>Late</option><option>Absent</option><option>Leave</option><option>Pending Leave</option><option>Rejected Leave</option><option>Week Off</option></select></div>
            <button className="btn cyan" onClick={() => { setFromDate(getTodayISODate()); setToDate(getTodayISODate()); }}><CalendarDays size={18} /> Today</button>
            <button className="btn cyan" onClick={setThisMonth}>This Month</button>
          </div>

          <div className="reportContext"><b>{report.length}</b> employees <span /> <b>{dateRange.length}</b> selected days <span /> Summary cards represent today</div>

          <div className="tableWrap attendanceTableWrap">
            <table className={"attendanceTable " + (dateRange.length === 1 ? "singleDayTable" : "multiDayTable")}>
              <thead>
                <tr>
                  <th>Employee</th>
                  {dateRange.map(date => <th key={date}><span className="dateHeading">{formatReportDate(date)}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {report.length === 0 && <tr><td colSpan={dateRange.length + 1} style={{ textAlign: "center", padding: 30 }}>No attendance records found</td></tr>}
                {report.map(emp => (
                  <tr key={emp.employeeId}>
                    <td className="employeeColumn">
                      <div className="employeeIdentity"><div className="employeeAvatar">{emp.name.charAt(0).toUpperCase()}</div><div><strong>{emp.name}</strong><small>{emp.employeeId}</small><small>{emp.department} · {emp.designation}</small></div></div>
                      <div className="employeeSummary">
                        <span className="present">P {emp.summary.present}</span><span className="late">L {emp.summary.late}</span><span className="absent">A {emp.summary.absent}</span><span className="leave">LV {emp.summary.leave}</span>
                      </div>
                    </td>
                    {dateRange.map(date => {
                      const day = emp.days.find(item => item.date === date);
                      const safeDay = day || { date, status: "Absent", remark: "", display: "-" };
                      const cellKey = emp.employeeId + "_" + date;
                      const edit = attendanceEdits[cellKey] || { status: safeDay.status, remark: safeDay.remark };
                      return (
                        <td key={date} className={"attendanceDayCell day-" + normalize(edit.status)}>
                          <div className="attendanceCellContent">
                            <div className="attendanceStatusBlock"><label>Status<select className={"dayStatusSelect " + normalize(edit.status)} value={edit.status} onChange={event => updateAttendanceEdit(cellKey, "status", event.target.value, safeDay)}><option>Present</option><option>Late</option><option>Absent</option><option>Leave</option></select></label><div><span>Clock-in</span><b className="attendanceTime">{safeDay.display || "-"}</b></div></div>
                            <label className="dayRemarkField">HR Remark<input maxLength="250" placeholder="Optional daily remark" value={edit.remark} onChange={event => updateAttendanceEdit(cellKey, "remark", event.target.value, safeDay)} /></label>
                            <button className="remarkButton" disabled={savingCell === cellKey} onClick={() => saveAttendanceDay(emp, safeDay, cellKey)}><Save size={14} /> {savingCell === cellKey ? "Saving..." : "Save"}</button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className={"attendanceStat " + tone}>
      <div className="attendanceStatIcon"><Icon size={22} /></div>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}
