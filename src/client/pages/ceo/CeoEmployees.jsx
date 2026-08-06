import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Search, UserRoundCheck, UserRoundX, UsersRound } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { normalize } from "../../utils.js";
import { useToast } from "../../components/Toast.jsx";

export default function CeoEmployees() {
  const [employees,setEmployees]=useState([]),[search,setSearch]=useState(""),[department,setDepartment]=useState(""),[status,setStatus]=useState("");
  const toast=useToast();
  useEffect(()=>{(async()=>{try{const result=await AttendanceApi.getEmployees();if(!result.success)throw new Error(result.message);setEmployees(Array.isArray(result.data)?result.data:[])}catch(error){toast.error(error.message||"Employees could not be loaded.")}})()},[]);
  const departments=useMemo(()=>[...new Set(employees.map(item=>item.department).filter(Boolean))].sort(),[employees]);
  const filtered=useMemo(()=>employees.filter(item=>normalize([item.employeeId,item.fullName,item.phone,item.email,item.department,item.designation].join(" ")).includes(normalize(search))&&(!department||item.department===department)&&(!status||normalize(item.status)===normalize(status))),[employees,search,department,status]);
  const active=employees.filter(item=>normalize(item.status)==="active").length;
  return <main className="screen"><div className="wide">
    <PageHeader icon={UsersRound} title="All Employees" subtitle="Read-only executive directory of every employee." tone="purple" action={<Link className="btn dark" to="/ceo"><ArrowLeft size={17}/> CEO Dashboard</Link>}/>
    <section className="statsGrid"><article className="statCard"><UsersRound/><div><b>{employees.length}</b><span>Total Employees</span></div></article><article className="statCard"><UserRoundCheck/><div><b>{active}</b><span>Active</span></div></article><article className="statCard"><UserRoundX/><div><b>{employees.length-active}</b><span>Inactive</span></div></article><article className="statCard"><Building2/><div><b>{departments.length}</b><span>Departments</span></div></article></section>
    <section className="panel"><div className="toolbar"><div className="field"><label>Search</label><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, employee ID, phone..."/></div><div className="field"><label>Department</label><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(value=><option key={value}>{value}</option>)}</select></div><div className="field"><label>Status</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></div></div>
      <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Contact</th><th>Department</th><th>Designation</th><th>Joining Date</th><th>Status</th></tr></thead><tbody>{filtered.map(item=><tr key={item.employeeId}><td><b>{item.fullName||"-"}</b><small className="tableSubtext">{item.employeeId}</small></td><td>{item.phone||"-"}<small className="tableSubtext">{item.email||""}</small></td><td>{item.department||"-"}</td><td>{item.designation||"-"}</td><td>{item.joiningDate?new Date(item.joiningDate).toLocaleDateString("en-IN"):"-"}</td><td><span className={`statusPill ${normalize(item.status)==="active"?"active":"inactive"}`}><CheckCircle2 size={14}/>{item.status||"Inactive"}</span></td></tr>)}{!filtered.length&&<tr><td colSpan="6" className="emptyCell">No employees match these filters.</td></tr>}</tbody></table></div>
    </section>
  </div></main>;
}
