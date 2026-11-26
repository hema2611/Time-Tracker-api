-- Banking details on employees + a Project master.
-- The legacy `projects` table is left untouched; this master is a separate `project_master` table.

ALTER TABLE employees
  ADD COLUMN bank_name   VARCHAR(120) NULL AFTER status,
  ADD COLUMN account_no  VARCHAR(34)  NULL AFTER bank_name,
  ADD COLUMN ifsc        VARCHAR(15)  NULL AFTER account_no,
  ADD COLUMN branch_name VARCHAR(120) NULL AFTER ifsc;

CREATE TABLE IF NOT EXISTS project_master (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  client_name VARCHAR(160) NULL,
  address VARCHAR(255) NULL,
  contact_person VARCHAR(160) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
