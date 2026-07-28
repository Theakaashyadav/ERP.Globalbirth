import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowLeft, Clock3, Database, HardDrive, RefreshCw, ShieldAlert, TableProperties, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import { AttendanceApi } from "../../api.js";
import { useToast } from "../../components/Toast.jsx";

function bytes(value) {
  const amount = Number(value || 0);
  if (!amount) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(amount) / Math.log(1024)), units.length - 1);
  return `${(amount / 1024 ** index).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}

export default function DatabaseAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState("");
  const toast = useToast();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await AttendanceApi.getDatabaseAnalysis();
      if (!result.success) throw new Error(result.message);
      setData(result.data);
    } catch (error) { toast.error(error.message || "Database analysis could not be loaded."); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  async function resetCollection(item) {
    if (!item.resettable || resetting) return;
    const accepted = window.confirm(`Reset ${item.label}?\n\nThis will permanently delete all ${Number(item.count).toLocaleString()} records in the ${item.collectionName} collection. This cannot be undone.`);
    if (!accepted) return;
    setResetting(item.key);
    try {
      const result = await AttendanceApi.resetDatabaseCollection(item.key);
      if (!result.success) throw new Error(result.message);
      toast.success(`${result.message} ${Number(result.data?.deletedCount||0).toLocaleString()} records deleted.`);
      await load();
    } catch (error) { toast.error(error.message || "Collection could not be reset."); }
    finally { setResetting(""); }
  }

  const usage = Math.max(0, Math.min(Number(data?.utilizationPercent || 0), 100));
  return <main className="screen databaseAnalysisPage"><div className="wide">
    <div className="adminHubTopbar">
      <PageHeader icon={Database} title="Database Analysis" subtitle="Live MongoDB connection, health, capacity and collection activity." tone="cyan" />
      <div className="headerActions"><button className="btn" onClick={load} disabled={loading}><RefreshCw size={17}/>{loading ? "Checking..." : "Refresh"}</button><Link className="btn dark" to="/admin"><ArrowLeft size={17}/> Admin Dashboard</Link></div>
    </div>

    {!data && loading ? <section className="panel databaseLoading"><RefreshCw className="spin"/><b>Reading live database statistics...</b></section> : data && <>
      <section className={`databaseHealthBanner ${data.connectionStatus === "Connected" ? "healthy" : "unhealthy"}`}>
        <span className="databasePulse"/><div><b>{data.health} · {data.connectionStatus}</b><small>{data.host} / {data.databaseName}</small></div><div className="databaseLatency"><Clock3 size={17}/><b>{data.latencyMs} ms</b><small>Ping</small></div>
      </section>

      <section className="databaseMetricGrid">
        <article><span className="dbMetricIcon cyan"><HardDrive/></span><div><small>Total used storage</small><b>{bytes(data.totalUsedBytes)}</b><p>Allocated data plus indexes</p></div></article>
        <article><span className="dbMetricIcon blue"><Database/></span><div><small>Document data</small><b>{bytes(data.dataSizeBytes)}</b><p>Logical BSON data size</p></div></article>
        <article><span className="dbMetricIcon purple"><TableProperties/></span><div><small>Index storage</small><b>{bytes(data.indexSizeBytes)}</b><p>Across {data.collections} collections</p></div></article>
        <article><span className="dbMetricIcon green"><Activity/></span><div><small>Total documents</small><b>{Number(data.documents).toLocaleString()}</b><p>{data.averageDocumentBytes ? `${bytes(data.averageDocumentBytes)} average` : "Live record count"}</p></div></article>
        <article><span className="dbMetricIcon blue"><HardDrive/></span><div><small>Plan capacity</small><b>{bytes(data.totalCapacityBytes)}</b><p>{bytes(data.availableStorageBytes)} currently available</p></div></article>
      </section>

      <section className="databaseLayout">
        <article className="panel storagePanel">
          <div className="databaseSectionTitle"><div><span>STORAGE CAPACITY</span><h2>Database utilization</h2></div><b>{data.utilizationPercent == null ? "Not reported" : `${data.utilizationPercent}%`}</b></div>
          <div className="storageTrack"><span style={{width: `${usage}%`}}/></div>
          <div className="storageLegend"><div><small>Used</small><b>{bytes(data.totalUsedBytes)}</b></div><div><small>Available</small><b>{bytes(data.availableStorageBytes)}</b></div><div><small>Total capacity</small><b>{bytes(data.totalCapacityBytes)}</b></div></div>
          <p className="databaseHint">Capacity is based on your 512 MB Atlas plan. Used storage includes allocated collection storage and indexes. Collection figures below are read live from MongoDB.</p>
        </article>

        <article className="panel collectionPanel">
          <div className="databaseSectionTitle"><div><span>COLLECTION ACTIVITY</span><h2>Stored records</h2></div><b>{data.collectionCounts.length} tracked</b></div>
          <div className="collectionResetNotice"><ShieldAlert size={18}/><span>Reset permanently deletes every record in only the selected collection. Dashboard accounts are protected.</span></div>
          <div className="collectionCountList">{data.collectionCounts.map(item => <article key={item.key} className="collectionRecord"><div><span>{item.label}</span><small>{item.collectionName} · {bytes(item.totalUsedBytes)}</small></div><b>{Number(item.count).toLocaleString()}</b>{item.resettable ? <button className="collectionResetButton" disabled={resetting === item.key || Number(item.count) === 0} onClick={() => resetCollection(item)} title={`Reset ${item.label}`}><Trash2 size={15}/>{resetting === item.key ? "Resetting..." : "Reset"}</button> : <span className="collectionProtected">Protected</span>}</article>)}</div>
        </article>
      </section>

      <section className="panel databaseDetails">
        <div><small>Connection state</small><b>{data.connectionStatus} (state {data.readyState})</b></div><div><small>Allocated data storage</small><b>{bytes(data.allocatedStorageBytes)}</b></div><div><small>Views</small><b>{data.views}</b></div><div><small>Analysis duration</small><b>{data.analysisDurationMs} ms</b></div><div><small>Last checked</small><b>{new Date(data.checkedAt).toLocaleString()}</b></div>
      </section>
    </>}
  </div></main>;
}
