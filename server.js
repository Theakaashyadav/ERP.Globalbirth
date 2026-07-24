require("dotenv").config();

const { createApp } = require("./src/server/app");
const { expireOverdueLeadAssignments } = require("./src/server/services/attendance.service");

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log("Attendance system running on port " + port);
  expireOverdueLeadAssignments().catch(error => console.error("Lead deadline check failed:", error.message));
});

setInterval(() => {
  expireOverdueLeadAssignments().catch(error => console.error("Lead deadline check failed:", error.message));
}, 60 * 1000).unref();
