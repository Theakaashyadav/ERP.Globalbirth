const express = require("express");
const update = require("../services/app-update.service");
const { readDashboardSession } = require("../security/dashboard-session");

const router = express.Router();
function requireAdmin(req, res, next) {
  if (readDashboardSession(req)?.role !== "admin") return res.status(401).json({ success: false, message: "Administrator session is missing or expired." });
  next();
}
router.get("/latest", update.latest);
router.get("/download", update.download);
router.get("/candidate", requireAdmin, update.candidate);
router.post("/publish", requireAdmin, update.publish);
module.exports = router;
