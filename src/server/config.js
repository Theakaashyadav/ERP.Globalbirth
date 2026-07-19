const dbClient = (process.env.DB_CLIENT || (process.env.HOSTINGER_DB_HOST ? "mysql" : "postgres")).toLowerCase();
const clientApiKey = process.env.CLIENT_API_KEY || process.env.API_KEY || "";

function getClientConfig() {
  return {
    apiBaseUrl: process.env.PUBLIC_API_BASE_URL || "/api",
    apiKey: clientApiKey
  };
}

module.exports = {
  dbClient,
  clientApiKey,
  adminApiKey: process.env.ADMIN_API_KEY || "",
  getClientConfig
};
