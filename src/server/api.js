require("dotenv").config();

const { createApp } = require("./app");
const { syncLeadSheet } = require("./services/lead-sheet.service");

const port = process.env.API_PORT || 3001;
const app = createApp({ apiOnly: true });

app.listen(port, () => {
  console.log("Attendance API server running on http://localhost:" + port);
  syncLeadSheet().catch(error => console.error("Lead Sheet sync failed:", error.message));
});
setInterval(() => syncLeadSheet().catch(error => console.error("Lead Sheet sync failed:", error.message)), 10 * 1000).unref();
