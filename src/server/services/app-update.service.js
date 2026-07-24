const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { dashboardUsers } = require("../config");
const Employee = require("../models/Employee");
const { connectDatabase } = require("../db/connection");
const { sendMandatoryUpdate } = require("./push-notification.service");

const releaseDir = path.resolve(process.cwd(), "data", "app-releases");
const metadataPath = path.join(releaseDir, "latest.json");
fs.mkdirSync(releaseDir, { recursive: true });

function readLatest() {
  try { return JSON.parse(fs.readFileSync(metadataPath, "utf8")); } catch { return null; }
}
function latest(req, res) {
  const release = readLatest();
  if (!release) return res.json({ success: true, available: false });
  res.json({ success: true, available: true, release: { ...release, fileName: undefined, downloadUrl: "/api/app-update/download" } });
}
async function publish(req, res) {
  const admin = dashboardUsers.admin;
  if (String(req.body.username || "").trim() !== admin.username || String(req.body.password || "") !== admin.password) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(401).json({ success: false, message: "Invalid admin credentials." });
  }
  const versionCode = Number(req.body.versionCode);
  const versionName = String(req.body.versionName || "").trim();
  const notes = String(req.body.notes || "").trim();
  if (!req.file || !Number.isInteger(versionCode) || versionCode < 1 || !versionName) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ success: false, message: "APK, positive version code, and version name are required." });
  }
  const bytes = fs.readFileSync(req.file.path);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ success: false, message: "Uploaded file is not a valid APK archive." });
  }
  const fileName = `global-one-${versionCode}.apk`;
  const destination = path.join(releaseDir, fileName);
  fs.renameSync(req.file.path, destination);
  const release = {
    versionCode, versionName, notes, mandatory: true, sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"), fileName,
    releasedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(release, null, 2));
  try {
    await connectDatabase();
    const employees = await Employee.find({ status: "Active", pushToken: { $ne: "" } }).select("pushToken").lean();
    release.notifiedDevices = await sendMandatoryUpdate(employees.map(item => item.pushToken), release);
  } catch (error) {
    console.error("Mandatory update notification failed:", error.message);
    release.notifiedDevices = 0;
  }
  res.json({ success: true, release: { ...release, fileName: undefined }, message: "Mandatory Android release published." });
}
function download(req, res) {
  const release = readLatest();
  if (!release) return res.status(404).json({ success: false, message: "No Android release is available." });
  const file = path.join(releaseDir, path.basename(release.fileName));
  if (!fs.existsSync(file)) return res.status(404).json({ success: false, message: "Release APK file is missing." });
  res.download(file, `GlobalOne-${release.versionName}.apk`);
}

module.exports = { releaseDir, latest, publish, download, readLatest };
