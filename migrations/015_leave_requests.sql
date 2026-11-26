-- Leave and permission (short time off) requests.
-- Leave: from_date..to_date, `days` = working days (weekends and active holidays excluded).
-- Permission: one date (from_date = to_date) with start_time..end_time, `minutes` = duration.
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('leave','permission') NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  days SMALLINT UNSIGNED NULL,
  minutes SMALLINT UNSIGNED NULL,
  subject VARCHAR(160) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leave_user_date (user_id, from_date),
  INDEX idx_leave_status (status),
  CONSTRAINT fk_leave_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_leave_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every role may see its own requests and apply (view + create). Approving needs edit.
INSERT IGNORE INTO role_permissions (role_id, module_key, can_view, can_create)
SELECT id, 'leave', 1, 1 FROM roles;
