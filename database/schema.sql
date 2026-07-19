CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  pin_hash TEXT NOT NULL,
  email TEXT,
  dob DATE,
  gender TEXT,
  address TEXT,
  department TEXT,
  designation TEXT,
  joining_date DATE,
  salary NUMERIC,
  shift TEXT,
  status TEXT NOT NULL DEFAULT 'Inactive',
  registered_ip_address TEXT,
  registered_fingerprint_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  attendance_time TEXT NOT NULL,
  gps_verified BOOLEAN NOT NULL DEFAULT FALSE,
  gps_latitude NUMERIC,
  gps_longitude NUMERIC,
  gps_accuracy NUMERIC,
  office_distance_meter NUMERIC,
  allowed_radius_meter NUMERIC,
  office_verified BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_source TEXT NOT NULL DEFAULT 'web-gps',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_date
  ON attendance_records(employee_id, attendance_date);
