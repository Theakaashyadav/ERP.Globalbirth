const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const AttendanceRecord = require("../models/AttendanceRecord");
const Lead = require("../models/Lead");
const MobileFeaturePolicy = require("../models/MobileFeaturePolicy");
const DashboardCredential = require("../models/DashboardCredential");
const OfficeWifiPolicy = require("../models/OfficeWifiPolicy");
const Announcement = require("../models/Announcement");
const AppFeedback = require("../models/AppFeedback");
const AppRelease = require("../models/AppRelease");
const CallLogRequest = require("../models/CallLogRequest");
const { connectDatabase } = require("../db/connection");

const DEFAULT_PLAN_CAPACITY_BYTES = 512 * 1024 * 1024;
const collections = [
  { key: "employees", label: "Employees", model: Employee, resettable: true },
  { key: "attendance", label: "Attendance Records", model: AttendanceRecord, resettable: true },
  { key: "leads", label: "Leads", model: Lead, resettable: true },
  { key: "announcements", label: "Announcements", model: Announcement, resettable: true },
  { key: "appFeedback", label: "App Feedback", model: AppFeedback, resettable: true },
  { key: "appReleases", label: "App Release History", model: AppRelease, resettable: true },
  { key: "callLogRequests", label: "Temporary Call Requests", model: CallLogRequest, resettable: true },
  { key: "featurePolicies", label: "Feature Policies", model: MobileFeaturePolicy, resettable: true },
  { key: "officeWifiPolicies", label: "Office Wi-Fi Policies", model: OfficeWifiPolicy, resettable: true },
  { key: "dashboardAccounts", label: "Dashboard Accounts", model: DashboardCredential, resettable: false }
];

async function collectionSnapshot(connection, item) {
  const count = await item.model.countDocuments({});
  let storage = {};
  try { storage = await connection.db.command({ collStats: item.model.collection.name, scale: 1 }); }
  catch { storage = {}; }
  const storageSizeBytes = Number(storage.storageSize || 0);
  const indexSizeBytes = Number(storage.totalIndexSize || 0);
  return { key:item.key, label:item.label, collectionName:item.model.collection.name, count, dataSizeBytes:Number(storage.size||0), storageSizeBytes, indexSizeBytes, totalUsedBytes:storageSizeBytes+indexSizeBytes, resettable:item.resettable };
}

async function getDatabaseAnalysis() {
  const startedAt = Date.now();
  const connection = await connectDatabase();
  const pingStartedAt = Date.now();
  await connection.db.admin().ping();
  const latencyMs = Date.now() - pingStartedAt;
  const stats = await connection.db.command({ dbStats: 1, scale: 1 });
  const collectionCounts = await Promise.all(collections.map(item => collectionSnapshot(connection, item)));
  const configuredCapacity = Number(process.env.MONGODB_STORAGE_LIMIT_BYTES || 0);
  const totalCapacityBytes = configuredCapacity > 0 ? configuredCapacity : DEFAULT_PLAN_CAPACITY_BYTES;
  const usedStorageBytes = Number(stats.storageSize || 0) + Number(stats.indexSize || 0);

  return {
    success: true,
    data: {
      health: "Healthy",
      connectionStatus: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
      readyState: mongoose.connection.readyState,
      databaseName: stats.db || connection.name || "",
      host: connection.host || "MongoDB Atlas",
      latencyMs,
      checkedAt: new Date().toISOString(),
      analysisDurationMs: Date.now() - startedAt,
      collections: Number(stats.collections || 0),
      views: Number(stats.views || 0),
      documents: Number(stats.objects || 0),
      dataSizeBytes: Number(stats.dataSize || 0),
      allocatedStorageBytes: Number(stats.storageSize || 0),
      indexSizeBytes: Number(stats.indexSize || 0),
      totalUsedBytes: usedStorageBytes,
      totalCapacityBytes,
      availableStorageBytes: Math.max(totalCapacityBytes - usedStorageBytes, 0),
      capacitySource: configuredCapacity > 0 ? "Configured plan limit" : "512 MB Atlas plan limit",
      utilizationPercent: totalCapacityBytes > 0 ? Number(((usedStorageBytes / totalCapacityBytes) * 100).toFixed(2)) : null,
      averageDocumentBytes: Number(stats.avgObjSize || 0),
      collectionCounts
    }
  };
}

async function resetDatabaseCollection(payload = {}) {
  const key = String(payload.collectionKey || "").trim();
  const target = collections.find(item => item.key === key);
  if (!target || !target.resettable) throw new Error("This database collection cannot be reset.");
  if (String(payload.confirmation || "") !== `RESET ${key}`) throw new Error("Reset confirmation did not match.");
  await connectDatabase();
  const result = await target.model.deleteMany({});
  return { success:true, message:`${target.label} reset successfully.`, data:{ collectionKey:key, deletedCount:Number(result.deletedCount||0) } };
}

module.exports = { getDatabaseAnalysis, resetDatabaseCollection };
