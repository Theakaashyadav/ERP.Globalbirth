CREATE TABLE IF NOT EXISTS employees (
  employee_id VARCHAR(64) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  pin_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  dob DATE,
  gender VARCHAR(50),
  address TEXT,
  department VARCHAR(120),
  designation VARCHAR(120),
  joining_date DATE,
  salary DECIMAL(12,2),
  shift VARCHAR(120),
  status VARCHAR(50) NOT NULL DEFAULT 'Inactive',
  registered_ip_address VARCHAR(80),
  registered_fingerprint_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(64) NOT NULL,
  attendance_date DATE NOT NULL,
  attendance_time VARCHAR(40) NOT NULL,
  gps_verified BOOLEAN NOT NULL DEFAULT FALSE,
  gps_latitude DECIMAL(11,8),
  gps_longitude DECIMAL(11,8),
  gps_accuracy DECIMAL(10,2),
  office_distance_meter DECIMAL(10,2),
  allowed_radius_meter DECIMAL(10,2),
  office_verified BOOLEAN NOT NULL DEFAULT FALSE,
  attendance_source VARCHAR(80) NOT NULL DEFAULT 'web-gps',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_employee_attendance_date (employee_id, attendance_date),
  INDEX idx_attendance_records_employee_date (employee_id, attendance_date),
  CONSTRAINT fk_attendance_employee
    FOREIGN KEY (employee_id)
    REFERENCES employees(employee_id)
    ON DELETE CASCADE
);
