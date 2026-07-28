import { useEffect, useMemo, useRef, useState } from "react";
import ExcelJS from "exceljs";
import { CheckSquare, Clock3, Download, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw, Users } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api";
import { getTodayISODate, normalize } from "../../utils";
import { useToast } from "../../components/Toast.jsx";

function duration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60;
  return hours ? `${hours}h ${minutes}m ${rest}s` : minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

export default function CallActivity() {
  const [employees, setEmployees] = useState([]); const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState(""); const [date, setDate] = useState(getTodayISODate());
  const [request, setRequest] = useState(null); const [loading, setLoading] = useState(false);
  const timer = useRef(null); const toast = useToast();
  useEffect(() => { AttendanceApi.getEmployees().then(result => setEmployees((result.data || []).filter(item => normalize(item.status) === "active" && ["tl", "executive"].includes(normalize(item.designation))))).catch(error => toast.error(error.message)); return () => clearInterval(timer.current); }, []);
  const visible = useMemo(() => employees.filter(item => normalize(`${item.fullName} ${item.employeeId} ${item.department}`).includes(normalize(search))), [employees, search]);
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.includes(item.employeeId));
  function toggleAll() { const ids = visible.map(item => item.employeeId); setSelected(current => allVisibleSelected ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])]); }
  function toggle(id) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  async function fetchStats() {
    if (!selected.length) return toast.warning("Select at least one employee.");
    clearInterval(timer.current); setLoading(true); setRequest(null);
    try {
      const result = await AttendanceApi.requestCallLogStats(selected, date);
      if (!result.success) throw new Error(result.message);
      setRequest(result.data); setLoading(false);
      timer.current = setInterval(async () => {
        try { const next = await AttendanceApi.getCallLogStatsRequest(result.data.requestId); if (next.success) { setRequest(next.data); if (next.data.complete) clearInterval(timer.current); } }
        catch { clearInterval(timer.current); }
      }, 2000);
    } catch (error) { setLoading(false); toast.error(error.message || "Could not request call activity."); }
  }
  const rows = request?.results || [];
  const totals = rows.filter(row => row.status === "Received").reduce((sum, row) => ({ total: sum.total + row.totalCalls, outgoing: sum.outgoing + row.outgoingCalls, incoming: sum.incoming + row.incomingCalls, missed: sum.missed + row.missedCalls, seconds: sum.seconds + row.totalDurationSeconds }), { total:0, outgoing:0, incoming:0, missed:0, seconds:0 });
  async function generateReport() {
    if (!rows.length) return toast.warning("Fetch employee call activity before generating a report.");
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Global One ERP"; workbook.created = new Date();
      const sheet = workbook.addWorksheet("Call Activity", { views:[{ state:"frozen", ySplit:5 }] });
      sheet.mergeCells("A1:M1"); sheet.getCell("A1").value = "GLOBAL ONE ERP - EMPLOYEE CALL ACTIVITY";
      sheet.getCell("A2").value = "Activity date"; sheet.getCell("B2").value = request?.date || date;
      sheet.getCell("D2").value = "Generated at"; sheet.getCell("E2").value = new Date(); sheet.getCell("E2").numFmt = "dd-mmm-yyyy hh:mm AM/PM";
      sheet.getCell("G2").value = "Employees"; sheet.getCell("H2").value = rows.length;
      sheet.mergeCells("A3:M3"); sheet.getCell("A3").value = "Realtime phone data; this report does not store call logs in the database.";
      const headers = ["S.No.", "Employee ID", "Employee Name", "Department", "Designation", "Connection", "Message", "Total Calls", "Outgoing", "Incoming", "Missed", "Total Duration", "Permissions"];
      sheet.addRow([]); sheet.addRow(headers);
      rows.forEach((row, index) => sheet.addRow([index + 1, row.employeeId || "", row.name || "", row.department || "", row.designation || "", row.status || "", row.message || "", Number(row.totalCalls)||0, Number(row.outgoingCalls)||0, Number(row.incomingCalls)||0, Number(row.missedCalls)||0, duration(row.totalDurationSeconds), `${row.permissionAllowed||0}/${row.permissionTotal||11}`]));
      const totalRow = sheet.addRow(["", "", "TOTALS", "", "", "", "", totals.total, totals.outgoing, totals.incoming, totals.missed, duration(totals.seconds), ""]);
      sheet.columns = [{width:9},{width:17},{width:24},{width:17},{width:17},{width:16},{width:34},{width:13},{width:12},{width:12},{width:11},{width:18},{width:14}];
      sheet.getRow(1).height = 28; sheet.getCell("A1").font = { bold:true, size:16, color:{argb:"FFFFFFFF"} }; sheet.getCell("A1").alignment = { horizontal:"center", vertical:"middle" }; sheet.getCell("A1").fill = { type:"pattern", pattern:"solid", fgColor:{argb:"FF123B62"} };
      sheet.getRow(3).font = { italic:true, color:{argb:"FF64748B"} };
      const headerRow = sheet.getRow(5); headerRow.font = { bold:true, color:{argb:"FFFFFFFF"} }; headerRow.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"FF087E8B"} }; headerRow.alignment = { horizontal:"center", vertical:"middle" }; headerRow.height = 24;
      for (let rowNumber=6; rowNumber<totalRow.number; rowNumber+=1) { const excelRow=sheet.getRow(rowNumber); if(rowNumber%2===0) excelRow.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF1F7FA"}}; excelRow.alignment={vertical:"middle"}; }
      totalRow.font = { bold:true, color:{argb:"FFFFFFFF"} }; totalRow.fill = { type:"pattern", pattern:"solid", fgColor:{argb:"FF123B62"} };
      sheet.autoFilter = { from:"A5", to:"M5" };
      sheet.eachRow({includeEmpty:false}, excelRow => excelRow.eachCell({includeEmpty:true}, cell => { cell.border={top:{style:"thin",color:{argb:"FFD8E2EA"}},left:{style:"thin",color:{argb:"FFD8E2EA"}},bottom:{style:"thin",color:{argb:"FFD8E2EA"}},right:{style:"thin",color:{argb:"FFD8E2EA"}}}; }));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href=url; anchor.download=`call-activity-${request?.date||date}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
      toast.success("Call activity Excel report generated.");
    } catch (error) { toast.error(error.message || "Could not generate the Excel report."); }
  }
  return <main className="screen"><div className="wide">
    <PageHeader icon={PhoneCall} title="Realtime Call Activity" subtitle="On-demand daily call totals from employee phones. Results are temporary and never stored in the database." tone="cyan" />
    <section className="callActivityLayout">
      <aside className="panel callEmployeePicker"><div className="pickerHeader"><div><span className="eyebrow">SALES CALL TEAM</span><h2>Select TLs or Executives</h2></div><span className="selectionCount">{selected.length} selected</span></div>
        <input className="employeeSearch" placeholder="Search employee, ID or department" value={search} onChange={event => setSearch(event.target.value)} />
        <button className="selectAllButton" onClick={toggleAll}><CheckSquare size={17} /> {allVisibleSelected ? "Clear visible" : "Select all visible"}</button>
        <div className="callEmployeeList">{visible.map(employee => <label className={selected.includes(employee.employeeId) ? "selected" : ""} key={employee.employeeId}><input type="checkbox" checked={selected.includes(employee.employeeId)} onChange={() => toggle(employee.employeeId)} /><div><b>{employee.fullName}</b><span>{employee.employeeId} · {employee.department || "No department"}</span></div><small>{employee.designation || "-"}</small></label>)}</div>
      </aside>
      <section className="callResultsArea"><div className="panel requestBar"><div className="field"><label>Call activity date</label><input type="date" max={getTodayISODate()} value={date} onChange={event => setDate(event.target.value)} /></div><button className="btn cyan" disabled={loading || !selected.length} onClick={fetchStats}><RefreshCw size={18} className={loading ? "spin" : ""} /> {loading ? "Sending requests..." : "Fetch From Selected Phones"}</button></div>
        <div className="callMetricGrid"><Metric icon={PhoneCall} label="Total Calls" value={totals.total} tone="blue"/><Metric icon={PhoneOutgoing} label="Outgoing" value={totals.outgoing} tone="green"/><Metric icon={PhoneIncoming} label="Incoming" value={totals.incoming} tone="cyan"/><Metric icon={PhoneMissed} label="Missed" value={totals.missed} tone="red"/><Metric icon={Clock3} label="Total Duration" value={duration(totals.seconds)} tone="purple"/></div>
        <section className="panel callResultsPanel"><div className="resultsTitle"><div><h2>Employee call totals</h2><p>{request ? `Requested for ${request.date}. Temporary results expire automatically.` : "Select employees and request their phone totals."}</p></div><div className="callReportActions">{request && <span className={request.complete ? "requestComplete" : "requestPending"}>{request.complete ? "Complete" : "Waiting for phones"}</span>}<button className="btn cyan" disabled={!rows.length} onClick={generateReport}><Download size={17}/> Generate Report</button></div></div>
          {!rows.length ? <div className="callEmpty"><Users size={38}/><b>No realtime results yet</b><span>Results appear here as selected phones respond.</span></div> : <div className="tableWrap"><table className="callResultsTable"><thead><tr><th>Employee</th><th>Connection</th><th>Total</th><th>Outgoing</th><th>Incoming</th><th>Missed</th><th>Duration</th><th>Permissions</th></tr></thead><tbody>{rows.map(row => <tr key={row.employeeId}><td><b>{row.name}</b><small>{row.employeeId} · {row.department} / {row.designation}</small></td><td><span className={`realtimeStatus ${normalize(row.status)}`}>{row.status}</span>{row.message && <small>{row.message}</small>}</td><td>{row.totalCalls}</td><td>{row.outgoingCalls}</td><td>{row.incomingCalls}</td><td>{row.missedCalls}</td><td>{duration(row.totalDurationSeconds)}</td><td><span className={`permissionRatio ${(row.permissionAllowed||0)===(row.permissionTotal||11)?"complete":"partial"}`}>{row.permissionAllowed||0}/{row.permissionTotal||11}</span></td></tr>)}</tbody></table></div>}
        </section>
      </section>
    </section>
  </div></main>;
}
function Metric({ icon:Icon, label, value, tone }) { return <div className={`callMetric ${tone}`}><Icon size={21}/><div><b>{value}</b><span>{label}</span></div></div>; }
