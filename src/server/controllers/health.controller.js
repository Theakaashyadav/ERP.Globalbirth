const { query, dbClient } = require("../db");
const { clientApiKey } = require("../config");

async function healthCheck(req, res) {
  try {
    await query("SELECT 1 AS ok");

    res.json({
      success: true,
      database: dbClient,
      apiKeyRequired: Boolean(clientApiKey)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: dbClient,
      apiKeyRequired: Boolean(clientApiKey),
      message: error.message || "Database connection failed."
    });
  }
}

module.exports = {
  healthCheck
};
