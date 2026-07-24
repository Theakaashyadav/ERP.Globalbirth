const path = require("path");
const express = require("express");
const cors = require("cors");
const attendanceRoutes = require("./routes/attendance.routes");
const { healthCheck } = require("./controllers/health.controller");
const { requireClientApiKey } = require("./middleware/api-key");
const { getClientConfig } = require("./config");

function createApp(options = {}) {
  const app = express();
  const publicDir = path.join(__dirname, "../../dist");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/attendance-config.js", (req, res) => {
    res.type("application/javascript");
    res.send("window.ATTENDANCE_DB_CONFIG = " + JSON.stringify(getClientConfig()) + ";");
  });

  app.get("/api/health", requireClientApiKey, healthCheck);
  app.use("/api/attendance", requireClientApiKey, attendanceRoutes);
  app.use("/api/app-update", requireClientApiKey, require("./routes/app-update.routes"));

  if (options.apiOnly) {
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: "API route not found."
      });
    });
    return app;
  }

  if (options.vite) {
    app.use(options.vite.middlewares);
  } else {
    app.use(express.static(publicDir));
  }

  app.get("*", (req, res) => {
    if (options.renderIndex) {
      options.renderIndex(req, res);
      return;
    }

    res.sendFile(path.join(publicDir, "index.html"));
  });

  return app;
}

module.exports = {
  createApp
};
