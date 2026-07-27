const fs = require("fs");
const path = require("path");

let messaging = null;
let initializationAttempted = false;
let initializationError = "";

function initializeMessaging() {
  if (initializationAttempted) return messaging;
  initializationAttempted = true;
  try {
    const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
    const { getMessaging } = require("firebase-admin/messaging");
    let credential = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const credentialPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      credential = cert(JSON.parse(fs.readFileSync(credentialPath, "utf8")));
    } else {
      const defaultCredentialPath = path.resolve("firebase-service-account.json");
      if (fs.existsSync(defaultCredentialPath)) {
        credential = cert(JSON.parse(fs.readFileSync(defaultCredentialPath, "utf8")));
      }
    }
    if (!credential) {
      initializationError = "No Firebase service-account environment variable or file was found.";
      console.warn("Firebase push disabled: configure FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.");
      return null;
    }
    const app = getApps()[0] || initializeApp({ credential: credential || applicationDefault() });
    messaging = getMessaging(app);
  } catch (error) {
    initializationError = error.message || "Firebase initialization failed.";
    console.error("Firebase push initialization failed:", error.message);
  }
  return messaging;
}

function firebaseConfigurationStatus() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "";
  let parsed = null;
  let parseError = "";
  if (raw) try { parsed = JSON.parse(raw); } catch (error) { parseError = error.message || "Invalid JSON."; }
  return {
    environmentVariablePresent: Boolean(raw),
    jsonValid: Boolean(parsed),
    hasProjectId: Boolean(parsed?.project_id),
    hasClientEmail: Boolean(parsed?.client_email),
    hasPrivateKey: Boolean(parsed?.private_key),
    initialized: Boolean(messaging),
    error: initializationError || parseError
  };
}

async function sendLeadAssignment(employee, lead, assignedBy) {
  if (!employee || !employee.pushToken || !lead) return false;
  const client = initializeMessaging();
  if (!client) return false;
  try {
    await client.send({
      token: employee.pushToken,
      data: {
        type: "lead_assignment",
        leadId: String(lead.leadId),
        phone: String(lead.phone),
        title: "New Lead",
        body: "Call Within 30 Minutes"
      },
      android: { priority: "high" }
    });
    return true;
  } catch (error) {
    console.error(`Lead notification failed for ${employee.employeeId}:`, error.message);
    return false;
  }
}

async function sendCallLogRequest(employee, requestId, date) {
  if (!employee?.pushToken) return false;
  const client = initializeMessaging();
  if (!client) return false;
  try {
    await client.send({
      token: employee.pushToken,
      data: { type: "call_log_request", requestId: String(requestId), date: String(date) },
      android: { priority: "high", ttl: 120000 }
    });
    return true;
  } catch (error) {
    console.error(`Call-log request failed for ${employee.employeeId}:`, error.message);
    return false;
  }
}

async function sendMandatoryUpdate(tokens, release) {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!validTokens.length) return 0;
  const client = initializeMessaging();
  if (!client) return 0;
  let sent = 0;
  for (let index = 0; index < validTokens.length; index += 500) {
    const response = await client.sendEachForMulticast({
      tokens: validTokens.slice(index, index + 500),
      data: { type: "app_update", title: "Mandatory App Update", body: `Version ${release.versionName} is ready. Update now to continue.`, versionCode: String(release.versionCode) },
      android: { priority: "high" }
    });
    sent += response.successCount;
  }
  return sent;
}

async function sendCommonAlert(tokens, alert) {
  const validTokens = [...new Set((tokens || []).filter(Boolean))];
  if (!validTokens.length) return 0;
  const client = initializeMessaging(); if (!client) return 0;
  let sent = 0;
  for (let index = 0; index < validTokens.length; index += 500) {
    const response = await client.sendEachForMulticast({
      tokens: validTokens.slice(index, index + 500),
      data: { type: "common_alert", alertId: String(alert._id), title: String(alert.subject), body: String(alert.message).slice(0, 500), sender: String(alert.sentByRole || "company").toUpperCase() },
      android: { priority: "high" }
    });
    sent += response.successCount;
  }
  return sent;
}

async function sendEmployeeTestPush(employee) {
  if (!employee?.pushToken) return { sent: false, reason: "This employee device has no registered push token. Open and log in to the app once." };
  const client = initializeMessaging();
  if (!client) return { sent: false, reason: "Firebase Admin is not configured on the server.", firebase: firebaseConfigurationStatus() };
  try {
    await client.send({
      token: employee.pushToken,
      data: { type: "common_alert", alertId: `test-${Date.now()}`, title: "Test Notification", body: "Push notifications are working on this device.", sender: "ADMIN" },
      android: { priority: "high" }
    });
    return { sent: true, reason: "Firebase accepted the notification.", firebase: firebaseConfigurationStatus() };
  } catch (error) {
    return { sent: false, reason: error.message || "Firebase rejected the notification.", firebase: firebaseConfigurationStatus() };
  }
}

async function verifyPhoneIdToken(idToken, expectedPhone) {
  if (!idToken || !expectedPhone) return false;
  const client = initializeMessaging();
  if (!client) return false;
  try {
    const { getApps } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");
    const decoded = await getAuth(getApps()[0]).verifyIdToken(idToken);
    const verifiedPhone = String(decoded.phone_number || "").replace(/\D/g, "").slice(-10);
    return verifiedPhone === String(expectedPhone).replace(/\D/g, "").slice(-10);
  } catch (error) {
    console.error("Phone verification token rejected:", error.message);
    return false;
  }
}

module.exports = { sendLeadAssignment, sendCallLogRequest, sendMandatoryUpdate, sendCommonAlert, sendEmployeeTestPush, firebaseConfigurationStatus, verifyPhoneIdToken };
