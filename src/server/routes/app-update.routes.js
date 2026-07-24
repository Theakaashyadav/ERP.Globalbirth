const path = require("path");
const express = require("express");
const multer = require("multer");
const update = require("../services/app-update.service");
const { readDashboardSession } = require("../security/dashboard-session");

const router = express.Router();
const upload = multer({
  dest: update.releaseDir,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, path.extname(file.originalname).toLowerCase() === ".apk")
});
router.get("/latest", update.latest);
router.get("/download", update.download);
router.post("/publish", (req, res, next) => {
  if (readDashboardSession(req)?.role !== "admin") return res.status(401).json({ success: false, message: "Administrator session is missing or expired." });
  next();
}, upload.single("apk"), update.publish);
module.exports = router;
