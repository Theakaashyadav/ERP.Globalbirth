const clientApiKey = process.env.CLIENT_API_KEY || process.env.API_KEY || "";

if (!process.env.MONGODB_URI) {
  console.warn("MONGODB_URI is not set. API requests will fail until MongoDB Atlas is configured.");
}

if (!clientApiKey) {
  console.warn("CLIENT_API_KEY is not set. API requests are not protected by a shared client key.");
}

function getClientConfig() {
  return {
    apiBaseUrl: process.env.PUBLIC_API_BASE_URL || "/api",
    apiKey: clientApiKey
  };
}

module.exports = {
  clientApiKey,
  adminApiKey: process.env.ADMIN_API_KEY || "",
  getClientConfig
};
