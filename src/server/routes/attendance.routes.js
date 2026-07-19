const express = require("express");
const { handleAttendanceAction } = require("../controllers/attendance.controller");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    await handleAttendanceAction(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error."
    });
  }
});

module.exports = router;
