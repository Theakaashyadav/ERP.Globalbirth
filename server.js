require("dotenv").config();

const { createApp } = require("./src/server/app");
const { syncLeadSheet } = require("./src/server/services/lead-sheet.service");

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log("Attendance system running on port " + port);
  syncLeadSheet().catch(error => console.error("Lead Sheet sync failed:", error.message));
});

setInterval(() => {
  syncLeadSheet().catch(error => console.error("Lead Sheet sync failed:", error.message));
}, 10 * 1000).unref();
