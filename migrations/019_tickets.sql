-- Ticketing System. Every change on a project is a ticket, numbered per project: <PREFIX>-1, -2, …
CREATE TABLE IF NOT EXISTS tickets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  seq INT UNSIGNED NOT NULL,
  ticket_no VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  type ENUM('bug','change','feature','improvement','task') NOT NULL DEFAULT 'bug',
  priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  status ENUM('open','in_progress','in_testing','completed') NOT NULL DEFAULT 'open',
  reported_by ENUM('client','internal_testing','internal_team') NOT NULL DEFAULT 'client',
  reporter_name VARCHAR(160) NULL,
  due_date DATE NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_ticket_seq (project_id, seq),
  UNIQUE KEY uq_ticket_no (ticket_no),
  INDEX idx_ticket_status (status),
  CONSTRAINT fk_ticket_project FOREIGN KEY (project_id) REFERENCES project_master(id),
  CONSTRAINT fk_ticket_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_assignees (
  ticket_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (ticket_id, employee_id),
  CONSTRAINT fk_ta_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Files (image / PDF / Excel, stored privately) and links.
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  kind ENUM('file','link') NOT NULL,
  stored_name VARCHAR(190) NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes INT UNSIGNED NULL,
  url VARCHAR(1000) NULL,
  uploaded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tatt_ticket (ticket_id),
  CONSTRAINT fk_tatt_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tatt_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  source ENUM('comment','time_note') NOT NULL DEFAULT 'comment',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tc_ticket (ticket_id),
  CONSTRAINT fk_tc_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Worked time. One row per running stretch: start/resume opens one (ended_at NULL), pause/stop closes it.
-- source=manual rows are time logged by hand.
CREATE TABLE IF NOT EXISTS ticket_time_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  seconds INT UNSIGNED NOT NULL DEFAULT 0,
  source ENUM('timer','manual') NOT NULL DEFAULT 'timer',
  note VARCHAR(1000) NULL,
  INDEX idx_ttl_ticket (ticket_id),
  INDEX idx_ttl_user_open (user_id, ended_at),
  CONSTRAINT fk_ttl_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ttl_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every timer click, in order: start, pause, resume, stop (and manual logs).
CREATE TABLE IF NOT EXISTS ticket_time_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  action ENUM('start','pause','resume','stop','manual') NOT NULL,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(1000) NULL,
  INDEX idx_tte_ticket_user (ticket_id, user_id, id),
  CONSTRAINT fk_tte_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tte_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket changes: created, status, priority, edits, attachments.
CREATE TABLE IF NOT EXISTS ticket_activity (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  detail VARCHAR(500) NULL,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tact_ticket (ticket_id),
  CONSTRAINT fk_tact_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tact_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every role may see tickets, raise them, log time and comment. Edit (status, delete) is granted by an admin.
INSERT IGNORE INTO role_permissions (role_id, module_key, can_view, can_create)
SELECT id, 'tickets', 1, 1 FROM roles;
