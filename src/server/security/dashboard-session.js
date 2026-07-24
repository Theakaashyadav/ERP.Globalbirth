const crypto = require("crypto");
const { clientApiKey, adminApiKey } = require("../config");

const SESSION_TTL_SECONDS = 24 * 60 * 60;
const secret = process.env.DASHBOARD_SESSION_SECRET || adminApiKey || clientApiKey;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createDashboardSession(user) {
  if (!secret) throw new Error("DASHBOARD_SESSION_SECRET or CLIENT_API_KEY must be configured.");
  const payload = encode({ ...user, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function createEmployeeSession(employeeId) {
  if (!secret) throw new Error("DASHBOARD_SESSION_SECRET or CLIENT_API_KEY must be configured.");
  const payload = encode({ employeeId, type: "employee", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  return `${payload}.${sign(payload)}`;
}

function readDashboardSession(req) {
  if (!secret) return null;
  const token = String(req.get("x-dashboard-session") || "").trim();
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.exp > Math.floor(Date.now() / 1000) ? session : null;
  } catch {
    return null;
  }
}

function canAccessDashboardRole(session, roles) {
  if (!session) return false;
  if (session.role === "admin") return true;
  return roles.includes(session.role) || roles.includes(session.allowedRole);
}

function readEmployeeSession(req) {
  const original = req.headers["x-dashboard-session"];
  req.headers["x-dashboard-session"] = req.get("x-employee-session") || "";
  const session = readDashboardSession(req);
  if (original === undefined) delete req.headers["x-dashboard-session"];
  else req.headers["x-dashboard-session"] = original;
  return session?.type === "employee" ? session : null;
}

module.exports = { createDashboardSession, createEmployeeSession, readDashboardSession, readEmployeeSession, canAccessDashboardRole };
