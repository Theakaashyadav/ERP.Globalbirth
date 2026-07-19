const mongoose = require("mongoose");
const { connectDatabase } = require("../db/connection");
const { clientApiKey } = require("../config");

async function healthCheck(req, res) {
  try {
    await connectDatabase();

    res.json({
      success: true,
      database: "mongodb",
      readyState: mongoose.connection.readyState,
      apiKeyRequired: Boolean(clientApiKey)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: "mongodb",
      readyState: mongoose.connection.readyState,
      apiKeyRequired: Boolean(clientApiKey),
      message: error.message || "Database connection failed."
    });
  }
}

module.exports = {
  healthCheck
};
