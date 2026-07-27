const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Employee = require("../models/Employee");
const AppRelease = require("../models/AppRelease");
const { connectDatabase } = require("../db/connection");
const { sendMandatoryUpdate } = require("./push-notification.service");

const releaseDir = path.resolve(process.cwd(), "data", "app-releases");
const metadataPath = path.join(releaseDir, "latest.json");
const githubApkUrl = process.env.ANDROID_APK_GITHUB_URL || "https://raw.githubusercontent.com/Theakaashyadav/ERP.Globalbirth/main/public/downloads/GlobalOne-Employee.apk";
const githubVersionUrl = process.env.ANDROID_VERSION_GITHUB_URL || githubApkUrl.replace(/GlobalOne-Employee\.apk(?:\?.*)?$/, "app-version.json");
fs.mkdirSync(releaseDir, { recursive: true });

async function detectGithubVersion() {
  const response = await fetch(`${githubVersionUrl}${githubVersionUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    headers: { "User-Agent": "GlobalOne-Release-Service", "Cache-Control": "no-cache" }
  });
  if (!response.ok) throw new Error(`GitHub version metadata returned HTTP ${response.status}`);
  const metadata = await response.json();
  const versionCode = Number(metadata.versionCode);
  const versionName = String(metadata.versionName || "").trim();
  if (!Number.isInteger(versionCode) || versionCode < 1 || !versionName) throw new Error("GitHub version metadata is invalid.");
  return { versionCode, versionName };
}

async function readLatest() {
  try {
    await connectDatabase();
    const release = await AppRelease.findOne({ releaseKey: "latest-android" }).lean();
    if (release) return { ...release, _id: undefined, __v: undefined, releaseKey: undefined, createdAt: undefined, updatedAt: undefined };
  } catch (error) { console.error("Shared app release lookup failed:", error.message); }
  try { return JSON.parse(fs.readFileSync(metadataPath, "utf8")); } catch { return null; }
}
async function latest(req, res) {
  const release = await readLatest();
  if (!release) return res.json({ success: true, available: false });
  res.json({ success: true, available: true, release: { ...release, fileName: undefined, downloadUrl: "/api/app-update/download" } });
}
async function candidate(req, res) {
  try {
    const data = await detectGithubVersion();
    res.json({ success: true, data });
  } catch (error) {
    res.status(502).json({ success: false, message: `Could not detect the GitHub APK version: ${error.message}` });
  }
}
async function publish(req, res) {
  const notes = String(req.body.notes || "").trim();
  let versionCode;
  let versionName;
  try {
    ({ versionCode, versionName } = await detectGithubVersion());
  } catch (error) {
    return res.status(502).json({ success: false, message: `Could not detect the GitHub APK version: ${error.message}` });
  }
  const sourceUrl = `${githubApkUrl}${githubApkUrl.includes("?") ? "&" : "?"}v=${versionCode}`;
  let bytes;
  try {
    const response = await fetch(sourceUrl, { headers: { "User-Agent": "GlobalOne-Release-Service", "Cache-Control": "no-cache" } });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    return res.status(502).json({ success: false, message: `Could not fetch the APK from GitHub: ${error.message}` });
  }
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return res.status(400).json({ success: false, message: "The GitHub file is not a valid APK archive." });
  }
  const release = {
    versionCode, versionName, notes, mandatory: true, sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"), sourceUrl,
    releasedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(release, null, 2));
  try {
    await connectDatabase();
    await AppRelease.findOneAndUpdate({ releaseKey: "latest-android" }, { $set: { ...release, releaseKey: "latest-android", releasedAt: new Date(release.releasedAt) } }, { upsert: true, new: true, runValidators: true });
    const employees = await Employee.find({ status: "Active", pushToken: { $ne: "" } }).select("pushToken").lean();
    release.notifiedDevices = await sendMandatoryUpdate(employees.map(item => item.pushToken), release);
  } catch (error) {
    console.error("Mandatory update notification failed:", error.message);
    release.notifiedDevices = 0;
  }
  res.json({ success: true, release, message: "Mandatory update alert sent using the GitHub APK." });
}
async function download(req, res) {
  const release = await readLatest();
  if (!release) return res.status(404).json({ success: false, message: "No Android release is available." });
  if (release.sourceUrl) return res.redirect(302, release.sourceUrl);
  const file = release.fileName ? path.join(releaseDir, path.basename(release.fileName)) : "";
  if (!file || !fs.existsSync(file)) return res.status(404).json({ success: false, message: "Release APK is unavailable. Send the update alert again to use GitHub." });
  return res.download(file, `GlobalOne-${release.versionName}.apk`);
}

module.exports = { releaseDir, latest, candidate, publish, download, readLatest };
