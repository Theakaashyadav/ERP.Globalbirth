const bcrypt = require("bcryptjs");
const Employee = require("../models/Employee");
const AttendanceRecord = require("../models/AttendanceRecord");
const { connectDatabase } = require("../db/connection");

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
    joiningDate: toDateInputValue(employee.joiningDate),
    salary: employee.salary || "",
    shift: employee.shift || "",
    status: employee.status || "Inactive",
    registeredIpAddress: employee.registeredIpAddress || "",
    registeredFingerprintId: employee.registeredFingerprintId || ""
  };
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

  if (!fullName || !/^[0-9]{10}$/.test(phone) || !/^[0-9]{4,6}$/.test(pin)) {
    return {
      success: false,
      message: "Full name, valid phone, and PIN are required."
    };
  }

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
      registeredIpAddress: cleanText(payload.registeredIpAddress),
      registeredFingerprintId: cleanText(payload.registeredFingerprintId)
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

  return {
    success: true,
    employee: mapEmployee(employee)
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

  const result = await Employee.updateOne(
    { employeeId },
    {
      $set: {
        fullName: cleanText(payload.fullName),
        phone: cleanText(payload.phone),
        email: cleanText(payload.email),
        department: cleanText(payload.department),
        designation: cleanText(payload.designation),
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

  for (const record of records) {
    const employeeId = cleanText(record.employeeId);
    const date = toDateOrNull(record.date);
    const time = cleanText(record.time);

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
          gpsVerified: toBoolean(record.gpsVerified),
          gpsLatitude: toNumberOrNull(record.gpsLatitude),
          gpsLongitude: toNumberOrNull(record.gpsLongitude),
          gpsAccuracy: toNumberOrNull(record.gpsAccuracy),
          officeDistanceMeter: toNumberOrNull(record.officeDistanceMeter),
          allowedRadiusMeter: toNumberOrNull(record.allowedRadiusMeter),
          officeVerified: toBoolean(record.officeVerified),
          attendanceSource: cleanText(record.attendanceSource) || "web-gps"
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

    map.get(employeeId)[dateKey] = record.attendanceTime + " (Present)";
  });

  return {
    success: true,
    data: Array.from(map.values())
  };
}

module.exports = {
  getEmployees,
  addEmployee,
  loginEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeProfile,
  saveAttendance,
  getAttendance
};
