const mongoose = require("mongoose");
const Employee = require("../models/Employee");
const AttendanceRecord = require("../models/AttendanceRecord");
const Lead = require("../models/Lead");
const MobileFeaturePolicy = require("../models/MobileFeaturePolicy");
const DashboardCredential = require("../models/DashboardCredential");
const { connectDatabase } = require("../db/connection");

async function getDatabaseAnalysis() {
  const startedAt = Date.now();
  const connection = await connectDatabase();
  const pingStartedAt = Date.now();
  await connection.db.admin().ping();
  const latencyMs = Date.now() - pingStartedAt;
  const stats = await connection.db.command({ dbStats: 1, scale: 1 });
  const [employees, attendance, leads, policies, dashboardAccounts] = await Promise.all([
    Employee.countDocuments({}), AttendanceRecord.countDocuments({}),
    Lead.countDocuments({}), MobileFeaturePolicy.countDocuments({}), DashboardCredential.countDocuments({})
  ]);
  const configuredCapacity = Number(process.env.MONGODB_STORAGE_LIMIT_BYTES || 0);
  const reportedCapacity = Number(stats.fsTotalSize || 0);
  const totalCapacityBytes = configuredCapacity > 0 ? configuredCapacity : reportedCapacity;
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
      capacitySource: configuredCapacity > 0 ? "Configured plan limit" : (reportedCapacity > 0 ? "Reported by MongoDB" : "Not reported by Atlas"),
      utilizationPercent: totalCapacityBytes > 0 ? Number(((usedStorageBytes / totalCapacityBytes) * 100).toFixed(2)) : null,
      averageDocumentBytes: Number(stats.avgObjSize || 0),
      collectionCounts: [
        { key: "employees", label: "Employees", count: employees },
        { key: "attendance", label: "Attendance Records", count: attendance },
        { key: "leads", label: "Leads", count: leads },
        { key: "featurePolicies", label: "Feature Policies", count: policies },
        { key: "dashboardAccounts", label: "Dashboard Accounts", count: dashboardAccounts }
      ]
    }
  };
}

module.exports = { getDatabaseAnalysis };
