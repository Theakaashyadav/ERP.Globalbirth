const path = require("path");
const express = require("express");
const multer = require("multer");
const update = require("../services/app-update.service");

const router = express.Router();
const upload = multer({
  dest: update.releaseDir,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, path.extname(file.originalname).toLowerCase() === ".apk")
});
router.get("/latest", update.latest);
router.get("/download", update.download);
router.post("/publish", upload.single("apk"), update.publish);
module.exports = router;
