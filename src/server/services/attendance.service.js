const bcrypt = require("bcryptjs");
const { query, dbClient } = require("../db");

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

function toDateInputValue(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function mapEmployee(row) {
  return {
    employeeId: row.employee_id,
    fullName: row.full_name,
    name: row.full_name,
    phone: row.phone,
    email: row.email || "",
    dob: toDateInputValue(row.dob),
    gender: row.gender || "",
    address: row.address || "",
    department: row.department || "",
    designation: row.designation || "",
    joiningDate: toDateInputValue(row.joining_date),
    salary: row.salary || "",
    shift: row.shift || "",
    status: row.status || "Inactive",
    registeredIpAddress: row.registered_ip_address || "",
    registeredFingerprintId: row.registered_fingerprint_id || ""
  };
}

async function getEmployees() {
  const result = await query(
    `SELECT *
     FROM employees
     ORDER BY created_at DESC`
  );

  return {
    success: true,
    data: result.rows.map(row => mapEmployee(row))
  };
}

async function addEmployee(payload) {
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

  await query(
    `INSERT INTO employees (
      employee_id, full_name, phone, pin_hash, email, dob, gender, address,
      department, designation, joining_date, salary, shift, status,
      registered_ip_address, registered_fingerprint_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
    )`,
    [
      employeeId,
      fullName,
      phone,
      pinHash,
      toNullable(payload.email),
      toNullable(payload.dob),
      toNullable(payload.gender),
      toNullable(payload.address),
      toNullable(payload.department),
      toNullable(payload.designation),
      toNullable(payload.joiningDate),
      toNumberOrNull(payload.salary),
      toNullable(payload.shift),
      cleanText(payload.status) || "Inactive",
      toNullable(payload.registeredIpAddress),
      toNullable(payload.registeredFingerprintId)
    ]
  );

  return {
    success: true,
    employeeId
  };
}

async function loginEmployee(payload) {
  const phone = cleanText(payload.phone);
  const pin = cleanText(payload.pin);

  const result = await query(
    `SELECT *
     FROM employees
     WHERE phone = $1
     LIMIT 1`,
    [phone]
  );

  if (!result.rows.length) {
    return {
      success: false,
      message: "Employee not found."
    };
  }

  const row = result.rows[0];
  const ok = await bcrypt.compare(pin, row.pin_hash);

  if (!ok) {
    return {
      success: false,
      message: "Invalid PIN."
    };
  }

  return {
    success: true,
    employee: mapEmployee(row)
  };
}

async function updateEmployee(payload) {
  const employeeId = cleanText(payload.employeeId);

  if (!employeeId) {
    return {
      success: false,
      message: "Employee ID is required."
    };
  }

  const result = await query(
    `UPDATE employees
     SET full_name = $2,
         phone = $3,
         email = $4,
         department = $5,
         designation = $6,
         joining_date = $7,
         salary = $8,
         shift = $9,
         status = $10,
         address = $11,
         updated_at = NOW()
     WHERE employee_id = $1`,
    [
      employeeId,
      cleanText(payload.fullName),
      cleanText(payload.phone),
      toNullable(payload.email),
      toNullable(payload.department),
      toNullable(payload.designation),
      toNullable(payload.joiningDate),
      toNumberOrNull(payload.salary),
      toNullable(payload.shift),
      cleanText(payload.status) || "Inactive",
      toNullable(payload.address)
    ]
  );

  return {
    success: result.rowCount > 0,
    message: result.rowCount > 0 ? "Employee updated." : "Employee not found."
  };
}

async function deleteEmployee(payload) {
  const employeeId = cleanText(payload.employeeId);

  const result = await query(
    `DELETE FROM employees
     WHERE employee_id = $1`,
    [employeeId]
  );

  return {
    success: result.rowCount > 0,
    message: result.rowCount > 0 ? "Employee deleted." : "Employee not found."
  };
}

async function getEmployeeProfile(payload) {
  const employeeId = cleanText(payload.employeeId);

  const result = await query(
    `SELECT *
     FROM employees
     WHERE employee_id = $1
     LIMIT 1`,
    [employeeId]
  );

  return {
    success: result.rows.length > 0,
    data: result.rows.length ? mapEmployee(result.rows[0]) : null,
    message: result.rows.length ? "" : "Employee not found."
  };
}

async function saveAttendance(payload) {
  const records = Array.isArray(payload.records) ? payload.records : [];

  for (const record of records) {
    const employeeId = cleanText(record.employeeId);
    const date = cleanText(record.date);
    const time = cleanText(record.time);

    if (!employeeId || !date || !time) {
      continue;
    }

    const sql = dbClient === "mysql"
      ? `INSERT INTO attendance_records (
          employee_id, attendance_date, attendance_time, gps_verified,
          gps_latitude, gps_longitude, gps_accuracy, office_distance_meter,
          allowed_radius_meter, office_verified, attendance_source
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
        ON DUPLICATE KEY UPDATE employee_id = employee_id`
      : `INSERT INTO attendance_records (
          employee_id, attendance_date, attendance_time, gps_verified,
          gps_latitude, gps_longitude, gps_accuracy, office_distance_meter,
          allowed_radius_meter, office_verified, attendance_source
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
        )
        ON CONFLICT (employee_id, attendance_date)
        DO NOTHING`;

    await query(sql, [
      employeeId,
      date,
      time,
      toBoolean(record.gpsVerified),
      toNumberOrNull(record.gpsLatitude),
      toNumberOrNull(record.gpsLongitude),
      toNumberOrNull(record.gpsAccuracy),
      toNumberOrNull(record.officeDistanceMeter),
      toNumberOrNull(record.allowedRadiusMeter),
      toBoolean(record.officeVerified),
      cleanText(record.attendanceSource) || "web-gps"
    ]);
  }

  return {
    success: true
  };
}

async function getAttendance() {
  const result = await query(
    `SELECT
       e.employee_id,
       e.full_name,
       e.department,
       e.designation,
       a.attendance_date,
       a.attendance_time
     FROM attendance_records a
     JOIN employees e ON e.employee_id = a.employee_id
     ORDER BY e.employee_id, a.attendance_date`
  );

  const map = new Map();

  result.rows.forEach(row => {
    const employeeId = row.employee_id;
    const dateKey = toDateInputValue(row.attendance_date);

    if (!map.has(employeeId)) {
      map.set(employeeId, {
        employeeId,
        name: row.full_name,
        fullName: row.full_name,
        department: row.department || "",
        designation: row.designation || ""
      });
    }

    map.get(employeeId)[dateKey] = row.attendance_time + " (Present)";
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
