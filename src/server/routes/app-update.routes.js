const express = require("express");
const update = require("../services/app-update.service");
const { readDashboardSession } = require("../security/dashboard-session");

const router = express.Router();
router.get("/latest", update.latest);
router.get("/download", update.download);
router.post("/publish", (req, res, next) => {
  if (readDashboardSession(req)?.role !== "admin") return res.status(401).json({ success: false, message: "Administrator session is missing or expired." });
  next();
}, update.publish);
module.exports = router;
