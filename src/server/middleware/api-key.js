const { clientApiKey, adminApiKey } = require("../config");

function getBearerOrApiKey(req) {
  const header = req.get("authorization") || "";
  const apiKey = req.get("x-api-key") || "";

  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }

  return apiKey.trim();
}

function requireClientApiKey(req, res, next) {
  if (!clientApiKey) {
    next();
    return;
  }

  if (getBearerOrApiKey(req) === clientApiKey) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    message: "Invalid or missing API key."
  });
}

function hasAdminAccess(req) {
  if (!adminApiKey) return true;
  return getBearerOrApiKey(req) === adminApiKey;
}

module.exports = {
  requireClientApiKey,
  hasAdminAccess
};
