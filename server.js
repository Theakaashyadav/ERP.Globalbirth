require("dotenv").config();

const { createApp } = require("./src/server/app");

const port = process.env.PORT || 3000;
const app = createApp();

app.listen(port, () => {
  console.log("Attendance system running on port " + port);
});
