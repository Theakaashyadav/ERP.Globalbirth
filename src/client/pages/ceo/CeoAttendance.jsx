import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarCheck2, CheckCircle2, Clock3, Palmtree, UserX, Users } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { getTodayISODate, normalize } from "../../utils.js";
import { useToast } from "../../components/Toast.jsx";

function statusOf(value,saved){const status=String(saved||"").trim();if(["Present","Late","Absent","Leave"].includes(status))return status;const text=normalize(value);if(!text||text==="absent")return "Absent";if(text.includes("leave"))return "Leave";if(text.includes("late"))return "Late";return "Present"}
function timeOf(value){return String(value||"").replace(/\((present|late)\)/ig,"").replace(/\b(present|late)\b/ig,"").replace(/\s+/g," ").trim()||"-"}
export default function CeoAttendance(){
 const[employees,setEmployees]=useState([]),[attendance,setAttendance]=useState([]),[date,setDate]=useState(getTodayISODate()),[search,setSearch]=useState(""),[filter,setFilter]=useState("");const toast=useToast();
 async function load(){try{const[e,a]=await Promise.all([AttendanceApi.getEmployees(),AttendanceApi.getAttendance()]);if(!e.success||!a.success)throw new Error(e.message||a.message);setEmployees(e.data||[]);setAttendance(a.data||[])}catch(error){toast.error(error.message||"Attendance could not be loaded.")}}
 useEffect(()=>{load()},[]);
 const rows=useMemo(()=>employees.map(employee=>{const record=attendance.find(item=>String(item.employeeId)===String(employee.employeeId));const raw=record?.[date]||"";return{...employee,status:statusOf(raw,record?.statuses?.[date]),time:timeOf(raw),remark:record?.remarks?.[date]||"-"}}).filter(item=>normalize(`${item.fullName} ${item.employeeId} ${item.department}`).includes(normalize(search))&&(!filter||item.status===filter)),[employees,attendance,date,search,filter]);
 const counts=employees.reduce((result,employee)=>{const record=attendance.find(item=>String(item.employeeId)===String(employee.employeeId));result[statusOf(record?.[date],record?.statuses?.[date])]++;return result},{Present:0,Late:0,Absent:0,Leave:0});
 return <main className="screen"><div className="wide"><PageHeader icon={CalendarCheck2} title="Attendance View" subtitle="Read-only daily attendance and HR remarks." tone="blue" action={<Link className="btn dark" to="/ceo"><ArrowLeft size={17}/> CEO Dashboard</Link>}/>
  <section className="statsGrid"><article className="statCard"><Users/><div><b>{employees.length}</b><span>Employees</span></div></article><article className="statCard"><CheckCircle2/><div><b>{counts.Present}</b><span>Present</span></div></article><article className="statCard"><Clock3/><div><b>{counts.Late}</b><span>Late</span></div></article><article className="statCard"><UserX/><div><b>{counts.Absent}</b><span>Absent</span></div></article><article className="statCard"><Palmtree/><div><b>{counts.Leave}</b><span>Leave</span></div></article></section>
  <section className="panel"><div className="toolbar"><div className="field"><label>Attendance Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="field"><label>Search Employee</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, ID or department"/></div><div className="field"><label>Status</label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All statuses</option>{["Present","Late","Absent","Leave"].map(value=><option key={value}>{value}</option>)}</select></div></div>
   <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Department</th><th>Status</th><th>Clock-in Time</th><th>HR Remark</th></tr></thead><tbody>{rows.map(item=><tr key={item.employeeId}><td><b>{item.fullName||"-"}</b><small className="tableSubtext">{item.employeeId}</small></td><td>{item.department||"-"}<small className="tableSubtext">{item.designation||""}</small></td><td><span className={`attendanceStatus ${normalize(item.status).replace(" ","-")}`}>{item.status}</span></td><td>{item.time}</td><td>{item.remark}</td></tr>)}{!rows.length&&<tr><td colSpan="5" className="emptyCell">No attendance records match these filters.</td></tr>}</tbody></table></div>
  </section></div></main>;
}
