-- Employee + Role masters for ImagiNET Tracker.
-- Added alongside the existing tables; nothing else is dropped.

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emp_no VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  -- Basic information
  date_of_birth DATE NULL,
  blood_group VARCHAR(8) NULL,
  phone VARCHAR(20) NULL,
  emergency_contact VARCHAR(20) NULL,
  aadhar_no VARCHAR(20) NULL,
  photo VARCHAR(255) NULL,
  -- Professional information
  role_id INT UNSIGNED NULL,
  join_date DATE NULL,
  last_date DATE NULL,
  status ENUM('active','inactive','notice_period','resigned','terminated') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A few active roles so the employee dropdown is not empty on first use.
INSERT IGNORE INTO roles (name, status) VALUES
  ('Developer','active'),
  ('Senior Developer','active'),
  ('Team Lead','active'),
  ('QA / Tester','active'),
  ('UI/UX Designer','active'),
  ('Project Manager','active'),
  ('Business Analyst','active'),
  ('DevOps Engineer','active'),
  ('HR','active'),
  ('Intern','active');
