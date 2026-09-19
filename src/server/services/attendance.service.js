const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee");
const AttendanceRecord = require("../models/AttendanceRecord");
const Lead = require("../models/Lead");
const { connectDatabase } = require("../db/connection");
const { createDashboardSession, createEmployeeSession } = require("../security/dashboard-session");
const dashboardCredentials = require("./dashboard-credential.service");
const officeWifi = require("./office-wifi.service");
const { sendLeadAssignment, sendEmployeeTestPush } = require("./push-notification.service");
const { hasEmployeeFeature } = require("./mobile-feature.service");
const { employeeSheetData } = require("./lead-sheet-fields");

function cleanText(value) {
  return String(value || "").trim();
}

function toNullable(value) {
  const text = cleanText(value);
  return text ? text : null;
}

function toBoolean(value) {
  return String(value || "").trim().toLowerCase() === "yes" || value === true;
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(text + "T00:00:00.000Z");
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toDateTimeOrNow(value) {
  const text = cleanText(value);
  const date = text ? new Date(text) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(-10);
}

async function canUseLeadFeatures(employeeId) {
  if (!employeeId) return false;
  const employee = await Employee.findOne({ employeeId, status: "Active" }).lean();
  if (!employee) return false;
  return (await hasEmployeeFeature(employee, "leads")) || (await hasEmployeeFeature(employee, "alerts"));
}

async function returnExpiredLeads() {
  // Assignment is permanent while lead rules are on hold.
}

async function expireOverdueLeadAssignments() {
  await connectDatabase();
  await returnExpiredLeads();
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function mapEmployee(employee) {
  return {
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    name: employee.fullName,
    phone: employee.phone,
    email: employee.email || "",
    dob: toDateInputValue(employee.dob),
    gender: employee.gender || "",
    address: employee.address || "",
    department: employee.department || "",
    designation: employee.designation || "",
    teamLeadId: employee.teamLeadId || "",
    joiningDate: toDateInputValue(employee.joiningDate),
    salary: employee.salary || "",
    shift: employee.shift || "",
    status: employee.status || "Inactive",
    allowNewDeviceRegistration: Boolean(employee.allowNewDeviceRegistration)
  };
}

function mapTeamMember(employee) {
  return {
    employeeId: employee.employeeId,
    fullName: employee.fullName,
    name: employee.fullName,
    department: employee.department || "",
    designation: employee.designation || "",
    teamLeadId: employee.teamLeadId || "",
    status: employee.status || "Inactive"
  };
}

function getLeadAttemptStats(lead) {
  const todayKey = toDateKey(new Date());
  const attemptsByDate = new Map();

  for (const attempt of lead.attempts || []) {
    const key = toDateKey(attempt.calledAt);
    if (!key) continue;

    if (!attemptsByDate.has(key)) {
      attemptsByDate.set(key, {
        date: key,
        attempts: 0,
        connected: 0,
        totalDurationSeconds: 0
      });
    }

    const day = attemptsByDate.get(key);
    day.attempts += 1;
    if (attempt.connected) day.connected += 1;
    day.totalDurationSeconds += Number(attempt.durationSeconds || 0);
  }

  const daily = [...attemptsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const today = attemptsByDate.get(todayKey) || { attempts: 0, connected: 0, totalDurationSeconds: 0 };
  const totalAttempts = (lead.attempts || []).length;
  const connectedAttempts = (lead.attempts || []).filter(attempt => attempt.connected).length;
  const lastAttempt = (lead.attempts || [])
    .slice()
    .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))[0];
  const lastConnected = (lead.attempts || [])
    .filter(attempt => attempt.connected)
    .sort((a, b) => new Date(b.calledAt) - new Date(a.calledAt))[0];
  const isConnected = connectedAttempts > 0;
  return {
    daily,
    totalAttempts,
    connectedAttempts,
    completedDays: 0,
    todayAttempts: today.attempts,
    todayRemainingAttempts: 0,
    archiveEligible: false,
    callMode: "tracking_only",
    isConnected,
    dailyCallTarget: null,
    callDaysTarget: null,
    connectedFollowUpHours: null,
    nextRequiredCallAt: null,
    hoursUntilNextRequiredCall: null,
    followUpCallOverdue: false,
    requirementSummary: "Lead call rules are on hold.",
    rulesOnHold: true,
    lastCallAt: lastAttempt ? lastAttempt.calledAt : null,
    lastConnectedAt: lastConnected ? lastConnected.calledAt : null
  };
}

function mapLead(lead, employeesById = new Map(), employeeView = false) {
  const stats = getLeadAttemptStats(lead);
  const assignedEmployee = employeesById.get(lead.assignedEmployeeId);
  const marketingAssignedTl = employeesById.get(lead.marketingAssignedTlId);
  const sheetData = employeeView
    ? employeeSheetData(lead.sheetFields, lead.sheetFieldOrder)
    : {
        sheetFields: lead.sheetFields instanceof Map ? Object.fromEntries(lead.sheetFields) : (lead.sheetFields || {}),
        sheetFieldOrder: lead.sheetFieldOrder?.length ? lead.sheetFieldOrder : Object.keys(lead.sheetFields || {})
      };

  return {
    leadId: lead.leadId,
    name: lead.name,
    phone: lead.phone,
    city: lead.city || "",
    source: lead.source || "",
    ...sheetData,
    sharingStatus: lead.sharingStatus || (lead.sheetSourceKey ? "Done" : "Not Done"),
    notificationStatus: lead.notificationStatus || "Pending",
    assignedEmployeeId: lead.assignedEmployeeId,
    assignedEmployeeName: assignedEmployee?.fullName || "",
    assignedAt: lead.assignedAt ? lead.assignedAt.toISOString() : "",
    marketingAssignedTlId: lead.marketingAssignedTlId || "",
    marketingAssignedTlName: marketingAssignedTl?.fullName || "",
    assignmentStage: lead.assignmentStage || "TL",
    firstCallDeadline: "",
    firstCallAt: lead.firstCallAt ? lead.firstCallAt.toISOString() : "",
    securedAt: lead.securedAt ? lead.securedAt.toISOString() : (lead.firstCallAt ? lead.firstCallAt.toISOString() : ""),
    securedByEmployeeId: lead.securedByEmployeeId || "",
    isSecured: Boolean(lead.securedAt || lead.firstCallAt),
    returnedToMarketingAt: lead.returnedToMarketingAt ? lead.returnedToMarketingAt.toISOString() : "",
    deadlineRemainingSeconds: 0,
    status: lead.status || "New",
    lastRemark: lead.lastRemark || "",
    nextFollowUpDate: toDateInputValue(lead.nextFollowUpDate),
    meetingDate: toDateInputValue(lead.meetingDate),
    followUpHistory: (lead.followUpHistory || []).map(item => ({
      employeeId: item.employeeId || "",
      status: item.status || "",
      remark: item.remark || "",
      nextFollowUpDate: toDateInputValue(item.nextFollowUpDate),
      meetingDate: toDateInputValue(item.meetingDate),
      createdAt: item.createdAt ? item.createdAt.toISOString() : ""
    })),
    archivedByEmployee: Boolean(lead.archivedByEmployee),
    archivedAt: lead.archivedAt ? lead.archivedAt.toISOString() : "",
    attempts: (lead.attempts || []).map(attempt => ({
      calledAt: attempt.calledAt ? attempt.calledAt.toISOString() : "",
      durationSeconds: attempt.durationSeconds || 0,
      connected: Boolean(attempt.connected),
      callStatus: attempt.callStatus || (attempt.connected ? "Connected" : "Not Connected"),
      externalCallId: attempt.externalCallId || "",
      source: attempt.source || "manual",
      remark: attempt.remark || ""
    })),
    stats
  };
}

async function mapLeadWithEmployeeNames(lead, employeeView = false) {
  if (!lead) return null;
  const employeeIds = [...new Set([lead.assignedEmployeeId, lead.marketingAssignedTlId].filter(Boolean))];
  const employees = employeeIds.length
    ? await Employee.find({ employeeId: { $in: employeeIds } }).select({ employeeId: 1, fullName: 1 }).lean()
    : [];
  return mapLead(lead, new Map(employees.map(employee => [employee.employeeId, employee])), employeeView);
}

async function getEmployees() {
  await connectDatabase();

  const employees = await Employee.find({})
    .sort({ createdAt: -1 })
    .lean();

  return {
    success: true,
    data: employees.map(mapEmployee)
  };
}

async function addEmployee(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId) || "EMP" + Date.now().toString().slice(-6);
  const fullName = cleanText(payload.fullName);
  const phone = cleanText(payload.phone);
  const pin = cleanText(payload.pin);

  if (!fullName || !/^[0-9]{10}$/.test(phone) || !/^[0-9]{4}$/.test(pin)) {
    return {
      success: false,
      message: "Full name, valid phone, and PIN are required."
    };
  }

  const registeredAndroidId = cleanText(payload.registeredAndroidId || payload.androidId);

  const pinHash = await bcrypt.hash(pin, 10);

  try {
    await Employee.create({
      employeeId,
      fullName,
      phone,
      pinHash,
      email: cleanText(payload.email),
      dob: toDateOrNull(payload.dob),
      gender: cleanText(payload.gender),
      address: cleanText(payload.address),
      department: cleanText(payload.department),
      designation: cleanText(payload.designation),
      joiningDate: toDateOrNull(payload.joiningDate),
      salary: toNumberOrNull(payload.salary),
      shift: cleanText(payload.shift),
      status: cleanText(payload.status) || "Inactive",
      registeredAndroidId
    });
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: false,
        message: "Employee ID or phone number already exists."
      };
    }

    throw error;
  }

  return {
    success: true,
    employeeId
  };
}

async function loginEmployee(payload) {
  await connectDatabase();

  const phone = cleanText(payload.phone);
  const pin = cleanText(payload.pin);
  const employee = await Employee.findOne({ phone }).lean();

  if (!employee) {
    return {
      success: false,
      message: "Employee not found."
    };
  }

  const ok = await bcrypt.compare(pin, employee.pinHash);

  if (!ok) {
    return {
      success: false,
      message: "Invalid PIN."
    };
  }

  if (cleanText(employee.status).toLowerCase() !== "active") {
    return {
      success: false,
      message: "Your employee account is inactive. Contact HR for approval."
    };
  }

  return {
    success: true,
    token: createEmployeeSession(employee.employeeId),
    employee: mapEmployee(employee)
  };
}

async function loginMobileEmployee(payload) {
  await connectDatabase();

  const phone = normalizePhone(payload.phone);
  const pin = cleanText(payload.pin);
  const androidId = cleanText(payload.androidId);

  if (!phone || !pin || !androidId) {
    return { success: false, message: "Phone, PIN, and Android device identity are required." };
  }

  const employee = await Employee.findOne({ phone }).lean();
  if (!employee) return { success: false, message: "Employee not found." };

  const pinMatches = await bcrypt.compare(pin, employee.pinHash);
  if (!pinMatches) return { success: false, message: "Invalid PIN." };

  if (cleanText(employee.status).toLowerCase() !== "active") {
    return { success: false, message: "Your employee account is inactive. Contact HR for approval." };
  }

  let authenticatedEmployee = employee;
  const registeredAndroidId = cleanText(employee.registeredAndroidId);
  if (registeredAndroidId && registeredAndroidId !== androidId) {
    if (!employee.allowNewDeviceRegistration) {
      return { success: false, message: "This account is registered to another Android device. Contact HR to allow a new device." };
    }

    const reboundEmployee = await Employee.findOneAndUpdate(
      {
        _id: employee._id,
        registeredAndroidId: employee.registeredAndroidId,
        status: "Active",
        allowNewDeviceRegistration: true
      },
      {
        $set: {
          registeredAndroidId: androidId,
          allowNewDeviceRegistration: false
        },
        $unset: {
          registeredIpAddress: "",
          registeredFingerprintId: "",
          pushToken: ""
        }
      },
      { new: true }
    ).lean();

    if (!reboundEmployee) {
      const currentEmployee = await Employee.findById(employee._id).lean();
      if (!currentEmployee || cleanText(currentEmployee.status).toLowerCase() !== "active" || cleanText(currentEmployee.registeredAndroidId) !== androidId) {
        return { success: false, message: "New-device permission was already used or cancelled. Contact HR to enable it again." };
      }
      authenticatedEmployee = currentEmployee;
    } else {
      authenticatedEmployee = reboundEmployee;
    }
  }

  if (!registeredAndroidId) {
    const boundEmployee = await Employee.findOneAndUpdate(
      { _id: employee._id, status: "Active", $or: [{ registeredAndroidId: "" }, { registeredAndroidId: null }, { registeredAndroidId: { $exists: false } }] },
      {
        $set: { registeredAndroidId: androidId, allowNewDeviceRegistration: false },
        $unset: { registeredIpAddress: "", registeredFingerprintId: "", pushToken: "" }
      },
      { new: true }
    ).lean();

    if (!boundEmployee) {
      const currentEmployee = await Employee.findById(employee._id).lean();
      if (!currentEmployee || cleanText(currentEmployee.status).toLowerCase() !== "active" || cleanText(currentEmployee.registeredAndroidId) !== androidId) {
        return { success: false, message: "This account was just registered on another Android device. Contact HR if you changed phones." };
      }
      authenticatedEmployee = currentEmployee;
    } else {
      authenticatedEmployee = boundEmployee;
    }
  }

  return {
    success: true,
    token: createEmployeeSession(authenticatedEmployee.employeeId, androidId),
    employee: mapEmployee(authenticatedEmployee)
  };
}

async function registerPushToken(payload) {
  await connectDatabase();
  const employeeId = cleanText(payload.employeeId);
  const androidId = cleanText(payload.androidId);
  const pushToken = cleanText(payload.pushToken);
  if (!employeeId || !androidId || !pushToken) return { success: false, message: "Employee, Android ID, and push token are required." };
  const employee = await Employee.findOneAndUpdate(
    { employeeId, registeredAndroidId: androidId, status: "Active" },
    { $set: { pushToken } },
    { new: false }
  ).lean();
  if (employee) {
    try {
      // A missing or rotated token may have caused a recent failed push. The
      // token is saved first; notification recovery cannot break registration.
      const { retryAssignedSheetLeadNotifications } = require("./lead-sheet.service");
      await retryAssignedSheetLeadNotifications({ ...employee, pushToken }, { forceFailed: employee.pushToken !== pushToken });
    } catch (error) {
      console.error(`Lead notification recovery failed for ${employeeId}:`, error);
    }
  }
  return { success: Boolean(employee), message: employee ? "Push notifications enabled." : "Device verification failed." };
}

async function validateMobileSession(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const phone = normalizePhone(payload.phone);
  const androidId = cleanText(payload.androidId);
  const employee = await Employee.findOne(employeeId ? { employeeId } : { phone }).lean();

  if (!employee) return { success: false, message: "Employee not found. Sign in with PIN again." };
  if (cleanText(employee.status).toLowerCase() !== "active") {
    return { success: false, message: "Your employee account is inactive. Contact HR for approval." };
  }
  if (!androidId || cleanText(employee.registeredAndroidId) !== androidId) {
    return { success: false, message: "Android device verification failed. Contact HR to reset the registered device." };
  }

  return { success: true, token: createEmployeeSession(employee.employeeId, androidId), employee: mapEmployee(employee) };
}

async function loginDashboardUser(payload) {
  const role = cleanText(payload.role).toLowerCase();
  const username = cleanText(payload.username);
  const password = cleanText(payload.password);
  if (!["hr", "marketing", "admin", "ceo"].includes(role)) {
    return {
      success: false,
      message: "Invalid dashboard role."
    };
  }

  const roleUser = await dashboardCredentials.authenticate(role, username, password);
  const adminUser = role === "admin" ? roleUser : await dashboardCredentials.authenticate("admin", username, password);
  const isRoleUser = Boolean(roleUser);
  const isAdminUser = Boolean(adminUser);

  if (!isRoleUser && !isAdminUser) {
    return {
      success: false,
      message: "Invalid username or password."
    };
  }

  return {
    success: true,
    token: createDashboardSession({ role: isAdminUser ? "admin" : role, allowedRole: role, username }),
    user: {
      role: isAdminUser ? "admin" : role,
      allowedRole: role,
      name: isAdminUser ? adminUser.name : roleUser.name,
      username
    }
  };
}

async function updateEmployee(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);

  if (!employeeId) {
    return {
      success: false,
      message: "Employee ID is required."
    };
  }

  const department = cleanText(payload.department);
  const designation = cleanText(payload.designation);
  const teamLeadId = cleanText(payload.teamLeadId);
  const allowedDepartments = ["Sales", "HR", "Backend"];
  if (!allowedDepartments.includes(department)) {
    return { success: false, message: "Department must be Sales, HR, or Backend." };
  }
  if (department === "Sales" && !["TL", "Executive"].includes(designation)) {
    return { success: false, message: "Sales designation must be TL or Executive." };
  }
  if (department === "Sales" && designation === "Executive") {
    const teamLead = await Employee.findOne({ employeeId: teamLeadId, department: "Sales", designation: "TL", status: "Active" }).lean();
    if (!teamLead) return { success: false, message: "Select an active Sales TL for this Executive." };
  }

  const hasNewDeviceRegistrationSetting = Object.prototype.hasOwnProperty.call(payload, "allowNewDeviceRegistration");
  const allowNewDeviceRegistration = payload.allowNewDeviceRegistration === true;
  const employeeUpdates = {
    fullName: cleanText(payload.fullName),
    phone: cleanText(payload.phone),
    email: cleanText(payload.email),
    department,
    designation: department === "Sales" ? designation : "",
    teamLeadId: department === "Sales" && designation === "Executive" ? teamLeadId : "",
    joiningDate: toDateOrNull(payload.joiningDate),
    salary: toNumberOrNull(payload.salary),
    shift: cleanText(payload.shift),
    status: cleanText(payload.status) || "Inactive",
    address: cleanText(payload.address)
  };
  if (hasNewDeviceRegistrationSetting) {
    employeeUpdates.allowNewDeviceRegistration = allowNewDeviceRegistration;
  }

  const requirePendingDeviceRegistration = hasNewDeviceRegistrationSetting
    && allowNewDeviceRegistration
    && payload.originalAllowNewDeviceRegistration === true;
  const employeeFilter = { employeeId };
  if (requirePendingDeviceRegistration) {
    employeeFilter.allowNewDeviceRegistration = true;
  }

  const result = await Employee.updateOne(
    employeeFilter,
    {
      $set: employeeUpdates
    }
  );

  if (result.matchedCount === 0) {
    const employeeStillExists = await Employee.exists({ employeeId });
    return {
      success: false,
      message: employeeStillExists && requirePendingDeviceRegistration
        ? "The employee's device registration changed while this form was open. Reopen the employee and try again."
        : "Employee not found."
    };
  }

  return {
    success: true,
    message: hasNewDeviceRegistrationSetting && allowNewDeviceRegistration
      ? "Employee updated. One-time new-device registration is enabled."
      : "Employee updated."
  };
}

async function deleteEmployee(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const [teamMembers, activeLeads] = await Promise.all([
    Employee.countDocuments({ teamLeadId: employeeId }),
    Lead.countDocuments({ assignedEmployeeId: employeeId, archivedAt: null })
  ]);
  if (teamMembers > 0) {
    return { success: false, message: `Move ${teamMembers} Executive(s) to another TL before deleting this employee.` };
  }
  if (activeLeads > 0) {
    return { success: false, message: `This employee owns ${activeLeads} active lead(s). Lead ownership is permanent, so this employee cannot be deleted.` };
  }
  const result = await Employee.deleteOne({ employeeId });

  if (result.deletedCount > 0) {
    await AttendanceRecord.deleteMany({ employeeId });
  }

  return {
    success: result.deletedCount > 0,
    message: result.deletedCount > 0 ? "Employee deleted." : "Employee not found."
  };
}

async function getEmployeeProfile(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const employee = await Employee.findOne({ employeeId }).lean();

  return {
    success: Boolean(employee),
    data: employee ? mapEmployee(employee) : null,
    message: employee ? "" : "Employee not found."
  };
}

async function saveAttendance(payload) {
  await connectDatabase();

  const records = Array.isArray(payload.records) ? payload.records : [];
  const attendanceEmployeeId = cleanText(records[0]?.employeeId);
  const wifiExempt = attendanceEmployeeId && await officeWifi.isEmployeeExempt(attendanceEmployeeId);
  if (cleanText(payload.androidId) && !wifiExempt && !(await officeWifi.verifyActiveOfficeNetwork(payload.officeId, { ssid: payload.wifiSsid, bssid: payload.wifiBssid, privateIp: payload.wifiPrivateIp }))) {
    return { success: false, message: "This office Wi-Fi is no longer approved. Refresh the attendance page." };
  }

  const now = new Date();
  const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const indiaTime = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(now);
  let savedCount = 0;
  let alreadySavedCount = 0;

  for (const record of records) {
    const employeeId = cleanText(record.employeeId);
    const date = toDateOrNull(indiaDate);
    const time = indiaTime;

    if (!employeeId || !date || !time) {
      continue;
    }

    const result = await AttendanceRecord.updateOne(
      {
        employeeId,
        attendanceDate: date
      },
      {
        $setOnInsert: {
          employeeId,
          attendanceDate: date,
          attendanceTime: time,
          status: "Present",
          remark: ""
        }
      },
      {
        upsert: true
      }
    );

    if (result.upsertedCount > 0) savedCount += 1;
    else alreadySavedCount += 1;
  }

  return {
    success: true,
    data: { savedCount, alreadySavedCount, attendanceDate: indiaDate },
    message: savedCount > 0
      ? "Attendance saved for today."
      : "Attendance is already marked for today."
  };
}

async function getAttendance() {
  await connectDatabase();

  const [employees, attendanceRecords] = await Promise.all([
    Employee.find({}).lean(),
    AttendanceRecord.find({}).sort({ employeeId: 1, attendanceDate: 1 }).lean()
  ]);

  const employeesById = new Map(
    employees.map(employee => [employee.employeeId, employee])
  );

  const map = new Map();

  attendanceRecords.forEach(record => {
    const employee = employeesById.get(record.employeeId);
    if (!employee) return;

    const employeeId = employee.employeeId;
    const dateKey = toDateInputValue(record.attendanceDate);

    if (!map.has(employeeId)) {
      map.set(employeeId, {
        employeeId,
        name: employee.fullName,
        fullName: employee.fullName,
        department: employee.department || "",
        designation: employee.designation || ""
      });
    }

    const normalizedStatus = cleanText(record.status);
    const attendanceStatus = ["Present", "Late", "Absent", "Leave"].includes(normalizedStatus)
      ? normalizedStatus
      : (record.attendanceTime === "-" ? "Absent" : "Present");
    map.get(employeeId)[dateKey] = record.attendanceTime + " (" + attendanceStatus + ")";
    if (!map.get(employeeId).statuses) map.get(employeeId).statuses = {};
    map.get(employeeId).statuses[dateKey] = attendanceStatus;
    if (!map.get(employeeId).remarks) map.get(employeeId).remarks = {};
    map.get(employeeId).remarks[dateKey] = record.remark || "";
  });

  return {
    success: true,
    data: Array.from(map.values())
  };
}

async function getEmployeeAttendance(payload) {
  const employeeId = cleanText(payload.employeeId);
  const result = await getAttendance();
  return { ...result, data: result.data.filter(item => item.employeeId === employeeId) };
}

async function updateAttendanceRemark(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const attendanceDate = toDateOrNull(payload.date);
  const status = cleanText(payload.status);
  const remark = cleanText(payload.remark);

  if (!employeeId || !attendanceDate) {
    return { success: false, message: "Employee ID and attendance date are required." };
  }

  if (!["Present", "Late", "Absent", "Leave"].includes(status)) {
    return { success: false, message: "Select Present, Late, Absent, or Leave." };
  }

  const result = await AttendanceRecord.updateOne(
    { employeeId, attendanceDate },
    {
      $set: { status, remark },
      $setOnInsert: { employeeId, attendanceDate, attendanceTime: "-" }
    },
    { upsert: true }
  );

  return {
    success: result.acknowledged,
    message: result.acknowledged ? "Attendance remark updated." : "Attendance remark was not updated."
  };
}

async function getEmployeeLeads(payload) {
  await connectDatabase();
  await returnExpiredLeads();

  const employeeId = cleanText(payload.employeeId);
  const search = cleanText(payload.search).toLowerCase();

  if (!employeeId) {
    return {
      success: false,
      message: "Employee ID is required."
    };
  }

  if (!(await canUseLeadFeatures(employeeId))) {
    return { success: false, message: "Lead access is disabled for your role." };
  }

  const leads = await Lead.find({
    assignedEmployeeId: employeeId,
    archivedAt: null
  })
    .sort({ assignedAt: -1 })
    .lean();

  const employee = await Employee.findOne({ employeeId }).select({ employeeId: 1, fullName: 1 }).lean();
  const employeesById = new Map(employee ? [[employee.employeeId, employee]] : []);
  const mapped = leads.map(lead => mapLead(lead, employeesById, true)).filter(lead => {
    if (!search) return true;
    return (
      lead.name.toLowerCase().includes(search) ||
      lead.phone.includes(search)
    );
  });

  return {
    success: true,
    data: mapped,
    limits: {
      maxActiveLeads: null,
      dailyCallTarget: null,
      callDaysTarget: null,
      connectedFollowUpHours: null,
      leadRulesOnHold: true
    }
  };
}

async function getTeamLeadWorkspaceLeads(payload) {
  await connectDatabase();
  await returnExpiredLeads();
  const teamLeadId = cleanText(payload.teamLeadId);
  const teamLead = await Employee.findOne({ employeeId: teamLeadId, department: "Sales", designation: "TL", status: "Active" }).lean();
  if (!teamLead) return { success: false, message: "Active Sales TL not found." };
  const [executives, leads] = await Promise.all([
    Employee.find({ department: "Sales", designation: "Executive", teamLeadId, status: "Active" }).sort({ fullName: 1 }).lean(),
    Lead.find({ assignedEmployeeId: teamLeadId, archivedAt: null }).sort({ assignedAt: -1 }).lean()
  ]);
  const people = [teamLead, ...executives];
  const employeesById = new Map(people.map(employee => [employee.employeeId, employee]));
  return { success: true, data: { leads: leads.map(lead => mapLead(lead, employeesById, true)), executives: executives.map(mapTeamMember) } };
}

async function getLeadDetails(payload) {
  await connectDatabase();
  await returnExpiredLeads();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
  if (!employeeId) return { success: false, message: "Employee ID is required." };
  const query = { leadId };

  if (employeeId) {
    const employee = await Employee.findOne({ employeeId, status: "Active" }).lean();
    if (!employee || !((await hasEmployeeFeature(employee, "leads")) || (await hasEmployeeFeature(employee, "alerts")))) {
      return { success: false, message: "Lead access is disabled for your role." };
    }
    query.assignedEmployeeId = employeeId;
  }

  const lead = await Lead.findOne(query).lean();

  return {
    success: Boolean(lead),
    data: await mapLeadWithEmployeeNames(lead, true),
    message: lead ? "" : "Lead not found."
  };
}

async function assignLead(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const name = cleanText(payload.name);
  const phone = normalizePhone(payload.phone);

  if (!employeeId || !name || !/^[0-9]{10}$/.test(phone)) {
    return {
      success: false,
      message: "Employee, lead name and valid 10 digit phone number are required."
    };
  }

  const employee = await Employee.findOne({ employeeId }).lean();

  if (!employee) {
    return {
      success: false,
      message: "Employee not found."
    };
  }

  if (cleanText(employee.department).toLowerCase() !== "sales" || cleanText(employee.designation).toLowerCase() !== "tl") {
    return { success: false, message: "Marketing can assign leads only to a Sales TL." };
  }

  const leadId = cleanText(payload.leadId) || "LEAD" + Date.now().toString().slice(-8);

  try {
    const lead = await Lead.create({
      leadId,
      name,
      phone,
      city: cleanText(payload.city),
      source: cleanText(payload.source) || "Marketing Manager",
      assignedEmployeeId: employee.employeeId,
      marketingAssignedTlId: employee.employeeId,
      assignmentStage: "TL",
      firstCallDeadline: null,
      firstCallAt: null,
      returnedToMarketingAt: null,
      status: "New",
      lastRemark: cleanText(payload.remark)
    });

    await sendLeadAssignment(employee, lead.toObject(), "Marketing");

    return {
      success: true,
      data: mapLead(lead.toObject(), new Map([[employee.employeeId, employee]])),
      message: "Lead assigned successfully."
    };
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: false,
        message: "Lead ID already exists."
      };
    }

    throw error;
  }
}

async function recordLeadCall(payload) {
  await connectDatabase();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
  const phone = normalizePhone(payload.phone);
  if (!employeeId) return { success: false, message: "Employee ID is required." };

  if (employeeId && !(await canUseLeadFeatures(employeeId))) {
    return { success: false, message: "Lead call tracking is disabled for your role." };
  }

  const query = leadId
    ? { leadId, ...(employeeId ? { assignedEmployeeId: employeeId } : {}) }
    : { assignedEmployeeId: employeeId, phone };

  if (!query.leadId && (!employeeId || !phone)) {
    return {
      success: false,
      message: "Lead ID or employee ID with phone number is required."
    };
  }

  const calledAt = toDateTimeOrNow(payload.calledAt);
  const remark = cleanText(payload.remark);
  const connected = payload.connected === true || cleanText(payload.connected).toLowerCase() === "yes";
  const durationSeconds = Math.max(Number(payload.durationSeconds || 0), 0);
  const externalCallId = cleanText(payload.externalCallId);

  if (externalCallId) {
    const existing = await Lead.findOne({ ...query, "attempts.externalCallId": externalCallId }).lean();
    if (existing) {
      return { success: true, data: await mapLeadWithEmployeeNames(existing, true), message: "Call attempt already synced.", duplicate: true };
    }
  }

  const currentLead = await Lead.findOne(query).lean();
  if (!currentLead) return { success: false, message: "Matching assigned lead not found." };
  const existingSecuredAt = currentLead.securedAt || currentLead.firstCallAt || null;

  const update = {
    $push: {
      attempts: {
        calledAt,
        durationSeconds,
        connected,
        callStatus: connected ? "Connected" : "Not Connected",
        externalCallId,
        source: cleanText(payload.source) || "android-call-log",
        remark
      }
    },
    $set: {
      lastRemark: remark || undefined,
      firstCallAt: calledAt,
      securedAt: existingSecuredAt || calledAt,
      securedByEmployeeId: currentLead.securedByEmployeeId || employeeId,
      status: connected ? "Connected" : "No Response"
    }
  };

  const lead = await Lead.findOneAndUpdate(query, update, { new: true }).lean();

  return {
    success: Boolean(lead),
    data: await mapLeadWithEmployeeNames(lead, true),
    message: lead ? "Call attempt saved." : "Matching lead not found."
  };
}

async function getTeamExecutives(payload) {
  await connectDatabase();
  const teamLeadId = cleanText(payload.teamLeadId);
  const teamLead = await Employee.findOne({ employeeId: teamLeadId, department: "Sales", designation: "TL", status: "Active" }).lean();
  if (!teamLead) return { success: false, message: "Active Sales TL not found." };
  const executives = await Employee.find({ department: "Sales", designation: "Executive", teamLeadId, status: "Active" }).sort({ fullName: 1 }).lean();
  return { success: true, data: executives.map(mapTeamMember) };
}

async function assignLeadToExecutive(payload) {
  return { success: false, message: "Lead ownership is permanent; delegation is on hold." };
}

async function reassignReturnedLead(payload) {
  return { success: false, message: "Lead reassignment is on hold." };
}

async function updateLeadRemark(payload) {
  await connectDatabase();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
  if (!employeeId) return { success: false, message: "Employee ID is required." };
  const status = cleanText(payload.status);
  const remark = cleanText(payload.remark);

  if (employeeId && !(await canUseLeadFeatures(employeeId))) {
    return { success: false, message: "Lead follow-up is disabled for your role." };
  }
  const nextFollowUpDate = toDateOrNull(payload.nextFollowUpDate);
  const meetingDate = toDateOrNull(payload.meetingDate);
  const allowedStatuses = ["Interested", "Not Interested", "No Response", "Cold", "Hot", "Wrong No.", "Meeting Fix"];
  const followUpStatuses = ["Interested", "Cold", "Hot", "No Response"];

  if (!allowedStatuses.includes(status)) {
    return { success: false, message: "Select a valid follow-up status." };
  }
  if (!remark) {
    return { success: false, message: "Remark is mandatory." };
  }
  if (followUpStatuses.includes(status) && !nextFollowUpDate) {
    return { success: false, message: "Next follow-up date is required for this status." };
  }
  if (status === "Meeting Fix" && !meetingDate) {
    return { success: false, message: "Meeting date is required." };
  }

  const query = { leadId };
  if (employeeId) query.assignedEmployeeId = employeeId;

  const currentLead = await Lead.findOne(query).lean();
  if (!currentLead) return { success: false, data: null, message: "Lead not found." };
  const historyEntries = [];
  if ((!currentLead.followUpHistory || currentLead.followUpHistory.length === 0) && cleanText(currentLead.lastRemark)) {
    historyEntries.push({
      employeeId: currentLead.assignedEmployeeId || employeeId,
      status: currentLead.status || "Follow Up",
      remark: currentLead.lastRemark,
      nextFollowUpDate: currentLead.nextFollowUpDate || null,
      meetingDate: currentLead.meetingDate || null,
      createdAt: currentLead.updatedAt || currentLead.createdAt || new Date()
    });
  }
  historyEntries.push({
    employeeId,
    status,
    remark,
    nextFollowUpDate: followUpStatuses.includes(status) ? nextFollowUpDate : null,
    meetingDate: status === "Meeting Fix" ? meetingDate : null,
    createdAt: new Date()
  });

  const lead = await Lead.findOneAndUpdate(
    { _id: currentLead._id, ...(employeeId ? { assignedEmployeeId: employeeId } : {}) },
    {
      $set: {
        status: status || "Follow Up",
        lastRemark: remark,
        nextFollowUpDate: followUpStatuses.includes(status) ? nextFollowUpDate : null,
        meetingDate: status === "Meeting Fix" ? meetingDate : null
      },
      $push: { followUpHistory: { $each: historyEntries } }
    },
    { new: true }
  ).lean();

  return {
    success: Boolean(lead),
    data: await mapLeadWithEmployeeNames(lead, true),
    message: lead ? "Lead updated." : "Lead not found."
  };
}

async function archiveEmployeeLead(payload) {
  return { success: false, message: "Lead archiving is on hold. Assigned leads stay with their owner." };
}

async function getMarketingLeadDashboard() {
  await connectDatabase();
  await returnExpiredLeads();

  const [employees, leads] = await Promise.all([
    Employee.find({}).sort({ fullName: 1 }).lean(),
    Lead.find({}).sort({ assignedAt: -1 }).lean()
  ]);

  const employeesById = new Map(employees.map(employee => [employee.employeeId, mapTeamMember(employee)]));
  const mappedLeads = leads.map(lead => mapLead(lead, employeesById));
  const activeLeads = mappedLeads.filter(lead => !lead.archivedAt);
  const employeeSummaries = Array.from(employeesById.values()).filter(employee => employee.department === "Sales" && employee.designation === "TL" && employee.status === "Active").map(employee => {
    const employeeLeads = activeLeads.filter(lead => lead.assignedEmployeeId === employee.employeeId);
    const blockedLeads = employeeLeads.filter(lead => !lead.stats.archiveEligible && lead.stats.todayRemainingAttempts > 0);

    return {
      ...employee,
      activeLeadCount: employeeLeads.length,
      storageRemaining: null,
      blockedLeadCount: blockedLeads.length,
      canReceiveNewLeads: true
      ,executives: Array.from(employeesById.values()).filter(member => member.department === "Sales" && member.designation === "Executive" && member.teamLeadId === employee.employeeId && member.status === "Active")
    };
  });

  return {
    success: true,
    data: {
      employees: employeeSummaries,
      leads: mappedLeads,
      limits: {
        maxActiveLeads: null,
        dailyCallTarget: null,
        callDaysTarget: null,
        connectedFollowUpHours: null,
        leadRulesOnHold: true
      }
    }
  };
}

async function clearAllLeads() {
  await connectDatabase();
  const before = await Lead.countDocuments({});
  const result = await Lead.deleteMany({});
  const after = await Lead.countDocuments({});
  return {
    success: after === 0,
    data: { before, deleted: result.deletedCount, after },
    message: after === 0 ? "All leads deleted." : "Some leads could not be deleted."
  };
}

async function sendTestPush(payload) {
  await connectDatabase();
  const rawId = cleanText(payload.employeeId).toUpperCase();
  const employeeId = rawId.startsWith("EMP") ? rawId : `EMP${rawId}`;
  const employee = await Employee.findOne({ employeeId, status: "Active" }).select({ employeeId: 1, fullName: 1, pushToken: 1 }).lean();
  if (!employee) return { success: false, message: `Active employee ${employeeId} was not found.` };
  const result = await sendEmployeeTestPush(employee);
  return { success: result.sent, data: { employeeId, employeeName: employee.fullName || "", sent: result.sent, firebase: result.firebase }, message: result.reason };
}

module.exports = {
  expireOverdueLeadAssignments,
  getEmployees,
  addEmployee,
  loginEmployee,
  loginMobileEmployee,
  registerPushToken,
  validateMobileSession,
  loginDashboardUser,
  updateEmployee,
  deleteEmployee,
  getEmployeeProfile,
  saveAttendance,
  getAttendance,
  getEmployeeAttendance,
  updateAttendanceRemark,
  getEmployeeLeads,
  getTeamLeadWorkspaceLeads,
  getLeadDetails,
  getTeamExecutives,
  assignLeadToExecutive,
  reassignReturnedLead,
  assignLead,
  recordLeadCall,
  updateLeadRemark,
  archiveEmployeeLead,
  getMarketingLeadDashboard,
  clearAllLeads,
  sendTestPush
};
