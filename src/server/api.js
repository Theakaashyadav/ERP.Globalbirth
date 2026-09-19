require("dotenv").config();

const { createApp } = require("./app");

const port = process.env.API_PORT || 3001;
const app = createApp({ apiOnly: true });

app.listen(port, () => {
  console.log("Attendance API server running on http://localhost:" + port);
});
