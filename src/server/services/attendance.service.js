const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee");
const AttendanceRecord = require("../models/AttendanceRecord");
const Lead = require("../models/Lead");
const { connectDatabase } = require("../db/connection");
const { createDashboardSession, createEmployeeSession } = require("../security/dashboard-session");
const dashboardCredentials = require("./dashboard-credential.service");
const { sendLeadAssignment } = require("./push-notification.service");
const { hasEmployeeFeature } = require("./mobile-feature.service");

const DAILY_LEAD_CALL_TARGET = 3;
const LEAD_CALL_DAYS_TARGET = 4;
const CONNECTED_FOLLOW_UP_HOURS = 48;
const MAX_ACTIVE_LEADS_PER_EMPLOYEE = 50;
const FIRST_CALL_DEADLINE_MS = 30 * 60 * 1000;

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
  const now = new Date();
  await Lead.updateMany(
    { archivedAt: null, returnedToMarketingAt: null, firstCallDeadline: { $lte: now }, securedAt: null, firstCallAt: null, assignedEmployeeId: { $ne: "" } },
    {
      $set: {
        assignedEmployeeId: "",
        marketingAssignedTlId: "",
        assignedAt: null,
        assignmentStage: "Marketing Queue",
        firstCallDeadline: null,
        firstCallAt: null,
        securedAt: null,
        securedByEmployeeId: "",
        returnedToMarketingAt: now,
        status: "Unassigned"
      }
    }
  );
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
    status: employee.status || "Inactive"
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
  const start = lead.assignedAt ? new Date(lead.assignedAt) : new Date(lead.createdAt || Date.now());
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

  const daily = [];
  let completedDays = 0;

  for (let i = 0; i < LEAD_CALL_DAYS_TARGET; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = toDateKey(date);
    const day = attemptsByDate.get(key) || {
      date: key,
      attempts: 0,
      connected: 0,
      totalDurationSeconds: 0
    };
    const complete = day.attempts >= DAILY_LEAD_CALL_TARGET;
    if (complete) completedDays += 1;
    daily.push({
      ...day,
      requiredAttempts: DAILY_LEAD_CALL_TARGET,
      complete
    });
  }

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
  const nextRequiredCallAt = isConnected && lastAttempt
    ? new Date(new Date(lastAttempt.calledAt).getTime() + CONNECTED_FOLLOW_UP_HOURS * 60 * 60 * 1000)
    : null;
  const followUpCallOverdue = Boolean(nextRequiredCallAt && nextRequiredCallAt.getTime() <= Date.now());
  const hoursUntilNextRequiredCall = nextRequiredCallAt
    ? Math.max(Math.ceil((nextRequiredCallAt.getTime() - Date.now()) / (60 * 60 * 1000)), 0)
    : null;

  return {
    daily,
    totalAttempts,
    connectedAttempts,
    completedDays,
    todayAttempts: today.attempts,
    todayRemainingAttempts: isConnected ? (followUpCallOverdue ? 1 : 0) : Math.max(DAILY_LEAD_CALL_TARGET - today.attempts, 0),
    archiveEligible: !isConnected && completedDays >= LEAD_CALL_DAYS_TARGET,
    callMode: isConnected ? "connected_48h" : "not_connected_daily",
    isConnected,
    dailyCallTarget: isConnected ? 1 : DAILY_LEAD_CALL_TARGET,
    callDaysTarget: LEAD_CALL_DAYS_TARGET,
    connectedFollowUpHours: CONNECTED_FOLLOW_UP_HOURS,
    nextRequiredCallAt: nextRequiredCallAt ? nextRequiredCallAt.toISOString() : null,
    hoursUntilNextRequiredCall,
    followUpCallOverdue,
    requirementSummary: isConnected
      ? (followUpCallOverdue ? "Follow-up call is due now" : `Next call required within ${hoursUntilNextRequiredCall} hours`)
      : `${Math.max(DAILY_LEAD_CALL_TARGET - today.attempts, 0)} of ${DAILY_LEAD_CALL_TARGET} calls remaining today; ${completedDays}/${LEAD_CALL_DAYS_TARGET} days complete`,
    lastCallAt: lastAttempt ? lastAttempt.calledAt : null,
    lastConnectedAt: lastConnected ? lastConnected.calledAt : null
  };
}

function mapLead(lead, employeesById = new Map()) {
  const stats = getLeadAttemptStats(lead);
  const assignedEmployee = employeesById.get(lead.assignedEmployeeId);
  const marketingAssignedTl = employeesById.get(lead.marketingAssignedTlId);

  return {
    leadId: lead.leadId,
    name: lead.name,
    phone: lead.phone,
    city: lead.city || "",
    source: lead.source || "",
    assignedEmployeeId: lead.assignedEmployeeId,
    assignedEmployeeName: assignedEmployee?.fullName || "",
    assignedAt: lead.assignedAt ? lead.assignedAt.toISOString() : "",
    marketingAssignedTlId: lead.marketingAssignedTlId || "",
    marketingAssignedTlName: marketingAssignedTl?.fullName || "",
    assignmentStage: lead.assignmentStage || "TL",
    firstCallDeadline: lead.firstCallDeadline ? lead.firstCallDeadline.toISOString() : "",
    firstCallAt: lead.firstCallAt ? lead.firstCallAt.toISOString() : "",
    securedAt: lead.securedAt ? lead.securedAt.toISOString() : (lead.firstCallAt ? lead.firstCallAt.toISOString() : ""),
    securedByEmployeeId: lead.securedByEmployeeId || "",
    isSecured: Boolean(lead.securedAt || lead.firstCallAt),
    returnedToMarketingAt: lead.returnedToMarketingAt ? lead.returnedToMarketingAt.toISOString() : "",
    deadlineRemainingSeconds: lead.firstCallDeadline && !lead.firstCallAt && !lead.returnedToMarketingAt ? Math.max(Math.floor((lead.firstCallDeadline.getTime() - Date.now()) / 1000), 0) : 0,
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

async function mapLeadWithEmployeeNames(lead) {
  if (!lead) return null;
  const employeeIds = [...new Set([lead.assignedEmployeeId, lead.marketingAssignedTlId].filter(Boolean))];
  const employees = employeeIds.length
    ? await Employee.find({ employeeId: { $in: employeeIds } }).select({ employeeId: 1, fullName: 1 }).lean()
    : [];
  return mapLead(lead, new Map(employees.map(employee => [employee.employeeId, employee])));
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

  const registeredAndroidId = cleanText(employee.registeredAndroidId);
  if (registeredAndroidId && registeredAndroidId !== androidId) {
    return { success: false, message: "This account is registered to another Android device. Contact HR to reset it." };
  }

  if (!registeredAndroidId) {
    await Employee.updateOne(
      { _id: employee._id, $or: [{ registeredAndroidId: "" }, { registeredAndroidId: { $exists: false } }] },
      {
        $set: { registeredAndroidId: androidId },
        $unset: { registeredIpAddress: "", registeredFingerprintId: "" }
      }
    );
    employee.registeredAndroidId = androidId;
    delete employee.registeredIpAddress;
    delete employee.registeredFingerprintId;
  }

  return { success: true, employee: mapEmployee(employee) };
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
    { new: true }
  ).lean();
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

  return { success: true, employee: mapEmployee(employee) };
}

async function loginDashboardUser(payload) {
  const role = cleanText(payload.role).toLowerCase();
  const username = cleanText(payload.username);
  const password = cleanText(payload.password);
  if (!["hr", "marketing", "admin"].includes(role)) {
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

  const result = await Employee.updateOne(
    { employeeId },
    {
      $set: {
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
      }
    }
  );

  return {
    success: result.matchedCount > 0,
    message: result.matchedCount > 0 ? "Employee updated." : "Employee not found."
  };
}

async function deleteEmployee(payload) {
  await connectDatabase();

  const employeeId = cleanText(payload.employeeId);
  const [teamMembers, activeLeads] = await Promise.all([
    Employee.countDocuments({ teamLeadId: employeeId }),
    Lead.countDocuments({ $or: [{ assignedEmployeeId: employeeId }, { marketingAssignedTlId: employeeId }], archivedAt: null })
  ]);
  if (teamMembers > 0) {
    return { success: false, message: `Move ${teamMembers} Executive(s) to another TL before deleting this employee.` };
  }
  if (activeLeads > 0) {
    return { success: false, message: `Reassign or archive ${activeLeads} active lead(s) before deleting this employee.` };
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
  const now = new Date();
  const indiaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const indiaTime = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(now);

  for (const record of records) {
    const employeeId = cleanText(record.employeeId);
    const date = toDateOrNull(indiaDate);
    const time = indiaTime;

    if (!employeeId || !date || !time) {
      continue;
    }

    await AttendanceRecord.updateOne(
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
  }

  return {
    success: true
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
  const mapped = leads.map(lead => mapLead(lead, employeesById)).filter(lead => {
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
      maxActiveLeads: MAX_ACTIVE_LEADS_PER_EMPLOYEE,
      dailyCallTarget: DAILY_LEAD_CALL_TARGET,
      callDaysTarget: LEAD_CALL_DAYS_TARGET,
      connectedFollowUpHours: CONNECTED_FOLLOW_UP_HOURS
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
    Lead.find({ marketingAssignedTlId: teamLeadId, assignedEmployeeId: { $ne: "" }, archivedAt: null }).sort({ assignedAt: -1 }).lean()
  ]);
  const people = [teamLead, ...executives];
  const employeesById = new Map(people.map(employee => [employee.employeeId, employee]));
  return { success: true, data: { leads: leads.map(lead => mapLead(lead, employeesById)), executives: executives.map(mapTeamMember) } };
}

async function getLeadDetails(payload) {
  await connectDatabase();
  await returnExpiredLeads();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
  const query = { leadId };

  if (employeeId) {
    const employee = await Employee.findOne({ employeeId, status: "Active" }).lean();
    if (!employee || !((await hasEmployeeFeature(employee, "leads")) || (await hasEmployeeFeature(employee, "alerts")))) {
      return { success: false, message: "Lead access is disabled for your role." };
    }
    if (cleanText(employee.department).toLowerCase() === "sales" && cleanText(employee.designation).toLowerCase() === "tl") {
      query.$or = [{ assignedEmployeeId: employeeId }, { marketingAssignedTlId: employeeId, assignedEmployeeId: { $ne: "" } }];
    } else {
      query.assignedEmployeeId = employeeId;
    }
  }

  const lead = await Lead.findOne(query).lean();

  return {
    success: Boolean(lead),
    data: await mapLeadWithEmployeeNames(lead),
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

  const activeLeadCount = await Lead.countDocuments({
    assignedEmployeeId: employeeId,
    archivedAt: null
  });

  if (activeLeadCount >= MAX_ACTIVE_LEADS_PER_EMPLOYEE) {
    return {
      success: false,
      message: "Employee lead storage is full. Ask the employee to complete call targets before assigning new leads."
    };
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
      firstCallDeadline: new Date(Date.now() + FIRST_CALL_DEADLINE_MS),
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
      return { success: true, data: await mapLeadWithEmployeeNames(existing), message: "Call attempt already synced.", duplicate: true };
    }
  }

  const currentLead = await Lead.findOne(query).lean();
  if (!currentLead) return { success: false, message: "Matching assigned lead not found." };
  const existingSecuredAt = currentLead.securedAt || currentLead.firstCallAt || null;
  const withinSecurityWindow = !currentLead.firstCallDeadline || calledAt.getTime() <= new Date(currentLead.firstCallDeadline).getTime();
  if (!existingSecuredAt && !withinSecurityWindow) {
    await returnExpiredLeads();
    return { success: false, message: "The 30-minute call window expired and the lead returned to Marketing." };
  }

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
    data: await mapLeadWithEmployeeNames(lead),
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
  await connectDatabase();
  await returnExpiredLeads();
  const leadId = cleanText(payload.leadId);
  const teamLeadId = cleanText(payload.teamLeadId);
  const executiveId = cleanText(payload.executiveId);
  const teamLead = await Employee.findOne({ employeeId: teamLeadId, department: "Sales", designation: "TL", status: "Active" }).lean();
  const executive = await Employee.findOne({ employeeId: executiveId, department: "Sales", designation: "Executive", teamLeadId, status: "Active" }).lean();
  if (!teamLead || !executive) return { success: false, message: "Select an active Executive from this TL's team." };
  const currentLead = await Lead.findOne({ leadId, assignedEmployeeId: teamLeadId, assignmentStage: "TL", returnedToMarketingAt: null, archivedAt: null }).lean();
  if (!currentLead) return { success: false, message: "Lead is no longer assigned to this TL." };
  const securedAt = currentLead.securedAt || currentLead.firstCallAt || null;
  const deadlineActive = currentLead.firstCallDeadline && new Date(currentLead.firstCallDeadline).getTime() > Date.now();
  if (!securedAt && !deadlineActive) {
    await returnExpiredLeads();
    return { success: false, message: "Lead was not called within 30 minutes and has returned to Marketing." };
  }
  const lead = await Lead.findOneAndUpdate(
    { _id: currentLead._id, assignedEmployeeId: teamLeadId, returnedToMarketingAt: null },
    { $set: { assignedEmployeeId: executive.employeeId, assignedAt: new Date(), assignmentStage: "Executive", firstCallDeadline: securedAt ? null : currentLead.firstCallDeadline, firstCallAt: null, securedAt, securedByEmployeeId: currentLead.securedByEmployeeId || (securedAt ? teamLeadId : ""), status: "Assigned to Executive" } },
    { new: true }
  ).lean();
  if (lead) await sendLeadAssignment(executive, lead, teamLead.fullName || "your TL");
  return { success: Boolean(lead), data: await mapLeadWithEmployeeNames(lead), message: lead ? (securedAt ? "Secured lead assigned to Executive. It will not return to Marketing." : "Lead assigned to Executive. They must call before the original 30-minute deadline.") : "Lead is no longer assigned to this TL." };
}

async function reassignReturnedLead(payload) {
  await connectDatabase();
  const leadId = cleanText(payload.leadId);
  const teamLeadId = cleanText(payload.teamLeadId);
  const teamLead = await Employee.findOne({ employeeId: teamLeadId, department: "Sales", designation: "TL", status: "Active" }).lean();
  if (!teamLead) return { success: false, message: "Select an active Sales TL." };
  const lead = await Lead.findOneAndUpdate(
    { leadId, returnedToMarketingAt: { $ne: null }, archivedAt: null },
    { $set: { assignedEmployeeId: teamLead.employeeId, marketingAssignedTlId: teamLead.employeeId, assignedAt: new Date(), assignmentStage: "TL", firstCallDeadline: new Date(Date.now() + FIRST_CALL_DEADLINE_MS), firstCallAt: null, securedAt: null, securedByEmployeeId: "", returnedToMarketingAt: null, status: "Reassigned to TL" } },
    { new: true }
  ).lean();
  if (lead) await sendLeadAssignment(teamLead, lead, "Marketing");
  return { success: Boolean(lead), data: await mapLeadWithEmployeeNames(lead), message: lead ? "Lead reassigned. TL has 30 minutes to call or delegate." : "Returned lead not found." };
}

async function updateLeadRemark(payload) {
  await connectDatabase();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
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
    data: await mapLeadWithEmployeeNames(lead),
    message: lead ? "Lead updated." : "Lead not found."
  };
}

async function archiveEmployeeLead(payload) {
  await connectDatabase();

  const leadId = cleanText(payload.leadId);
  const employeeId = cleanText(payload.employeeId);
  if (!(await canUseLeadFeatures(employeeId))) {
    return { success: false, message: "Lead access is disabled for your role." };
  }
  const lead = await Lead.findOne({ leadId, assignedEmployeeId: employeeId }).lean();

  if (!lead) {
    return {
      success: false,
      message: "Lead not found."
    };
  }

  const mapped = mapLead(lead);

  if (!mapped.stats.archiveEligible) {
    return {
      success: false,
      message: mapped.stats.isConnected
        ? "Connected leads require at least one follow-up call every 48 hours."
        : "This lead needs 3 call attempts per day for 4 days before it can be removed."
    };
  }

  const updated = await Lead.findOneAndUpdate(
    { leadId, assignedEmployeeId: employeeId },
    {
      $set: {
        status: "Archived",
        archivedByEmployee: true,
        archivedAt: new Date()
      }
    },
    { new: true }
  ).lean();

  return {
    success: true,
    data: mapLead(updated),
    message: "Lead archived."
  };
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
      storageRemaining: Math.max(MAX_ACTIVE_LEADS_PER_EMPLOYEE - employeeLeads.length, 0),
      blockedLeadCount: blockedLeads.length,
      canReceiveNewLeads: employeeLeads.length < MAX_ACTIVE_LEADS_PER_EMPLOYEE
      ,executives: Array.from(employeesById.values()).filter(member => member.department === "Sales" && member.designation === "Executive" && member.teamLeadId === employee.employeeId && member.status === "Active")
    };
  });

  return {
    success: true,
    data: {
      employees: employeeSummaries,
      leads: mappedLeads,
      limits: {
        maxActiveLeads: MAX_ACTIVE_LEADS_PER_EMPLOYEE,
        dailyCallTarget: DAILY_LEAD_CALL_TARGET,
        callDaysTarget: LEAD_CALL_DAYS_TARGET,
        connectedFollowUpHours: CONNECTED_FOLLOW_UP_HOURS
      }
    }
  };
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
  getMarketingLeadDashboard
};
