-- Messages pasted from WhatsApp / email, and what the AI suggested from them.
CREATE TABLE inbox_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  source ENUM('whatsapp','email','call','meeting','other') NOT NULL,
  kind ENUM('cr','bug','decision','client_owes') NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  said_by VARCHAR(120) NULL,
  said_at VARCHAR(40) NULL,
  quote TEXT NOT NULL,
  confidence ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  cr_id INT UNSIGNED NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inbox_project (project_id, status),
  CONSTRAINT fk_inbox_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_inbox_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Change requests: numbered per project, never deleted.
CREATE TABLE change_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  number INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  type ENUM('new','change','revert') NOT NULL DEFAULT 'new',
  source ENUM('whatsapp','email','call','meeting','portal','other') NOT NULL,
  evidence TEXT NULL,
  raised_by_name VARCHAR(120) NULL,
  raised_on VARCHAR(40) NULL,
  status ENUM('raised','estimated','approved','in_progress','done','closed','rejected','cancelled') NOT NULL DEFAULT 'raised',
  effort_days DECIMAL(6,1) NULL,
  chargeable TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cr_number (project_id, number),
  CONSTRAINT fk_cr_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_cr_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cr_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cr_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  note VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hist_cr (cr_id),
  CONSTRAINT fk_hist_cr FOREIGN KEY (cr_id) REFERENCES change_requests(id),
  CONSTRAINT fk_hist_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
