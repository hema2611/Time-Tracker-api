-- What each Role Master role may do on each screen (module).
-- A login gets its permissions through: users.id -> employees.user_id -> employees.role_id -> here.
-- Admin logins (users.role = 'admin') always have full access and are not stored here.
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  module_key VARCHAR(60) NOT NULL,
  can_view TINYINT(1) NOT NULL DEFAULT 0,
  can_create TINYINT(1) NOT NULL DEFAULT 0,
  can_edit TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, module_key),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Starting point: every existing role can view the shared calendar, events and their attendance.
INSERT IGNORE INTO role_permissions (role_id, module_key, can_view)
SELECT r.id, m.k, 1
  FROM roles r
  CROSS JOIN (SELECT 'holiday_calendar' AS k UNION ALL SELECT 'events' UNION ALL SELECT 'attendance') m;
