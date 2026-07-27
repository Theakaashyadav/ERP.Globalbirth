import { useEffect, useState } from "react";
import { BellRing, Clock3, Send } from "lucide-react";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";

export default function BroadcastAlerts(){
 const [subject,setSubject]=useState("");const [message,setMessage]=useState("");const [items,setItems]=useState([]);const [sending,setSending]=useState(false);const toast=useToast();
 async function load(){try{const result=await AttendanceApi.getBroadcastAlerts();setItems(result.data||[])}catch(error){toast.error(error.message)}}
 useEffect(()=>{load()},[]);
 async function send(event){event.preventDefault();setSending(true);try{const result=await AttendanceApi.sendBroadcastAlert(subject,message);if(!result.success)throw new Error(result.message);toast.success(`${result.message} ${result.data?.notifiedDevices||0} push notification(s) delivered.`);setSubject("");setMessage("");await load()}catch(error){toast.error(error.message||"Could not send alert.")}finally{setSending(false)}}
 return <main className="screen commonAlertManager"><div className="wide"><PageHeader icon={BellRing} title="Employee Alerts" subtitle="Send an important message to every active employee app." tone="orange"/><section className="commonAlertLayout"><form className="panel commonAlertComposer" onSubmit={send}><span className="eyebrow">NEW COMPANY ALERT</span><h2>Compose alert</h2><div className="field"><label>Subject</label><input required maxLength="150" value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Important announcement"/></div><div className="field"><label>Full message</label><textarea required rows="8" maxLength="5000" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write the complete message employees should receive..."/></div><button className="btn full orange" disabled={sending}><Send size={18}/>{sending?"Sending...":"Send Alert to All Employees"}</button></form><section className="panel commonAlertHistory"><span className="eyebrow">PREVIOUS ALERTS</span><h2>Sent history</h2><div>{items.length?items.map(item=><article className="commonAlertHistoryItem" key={item.id}><div><b>{item.subject}</b><span>Sent by {item.sentByRole?.toUpperCase()}</span></div><p>{item.message}</p><small><Clock3 size={13}/>{new Date(item.createdAt).toLocaleString()}</small></article>):<p className="muted">No alerts have been sent.</p>}</div></section></section></div></main>
}
