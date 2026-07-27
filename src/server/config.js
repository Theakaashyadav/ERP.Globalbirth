const clientApiKey = process.env.CLIENT_API_KEY || process.env.API_KEY || "";
const androidAppApiKey = "globalone-android-client-2026-v1";
const dashboardUsers = {
  admin: {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
    name: process.env.ADMIN_NAME || "System Admin"
  },
  hr: {
    username: process.env.HR_USERNAME || "hr",
    password: process.env.HR_PASSWORD || "hr123",
    name: process.env.HR_NAME || "HR Manager"
  },
  marketing: {
    username: process.env.MARKETING_USERNAME || "marketing",
    password: process.env.MARKETING_PASSWORD || "marketing123",
    name: process.env.MARKETING_NAME || "Marketing Manager"
  }
};

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
  androidAppApiKey,
  adminApiKey: process.env.ADMIN_API_KEY || "",
  dashboardUsers,
  getClientConfig
};
