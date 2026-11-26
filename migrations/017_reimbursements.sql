-- Reimbursement claims: money an employee spent for work (e.g. travel to a client meeting), with bills attached.
CREATE TABLE IF NOT EXISTS reimbursements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  decision_note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reimb_user (user_id, created_at),
  INDEX idx_reimb_status (status),
  CONSTRAINT fk_reimb_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_reimb_decider FOREIGN KEY (decided_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bills (images / PDFs). Files are stored privately and only served to signed-in users allowed to see the claim.
CREATE TABLE IF NOT EXISTS reimbursement_files (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reimbursement_id INT UNSIGNED NOT NULL,
  stored_name VARCHAR(190) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reimb_file (reimbursement_id),
  CONSTRAINT fk_reimb_file FOREIGN KEY (reimbursement_id) REFERENCES reimbursements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every role may see its own claims and submit new ones. Approving needs edit.
INSERT IGNORE INTO role_permissions (role_id, module_key, can_view, can_create)
SELECT id, 'reimbursements', 1, 1 FROM roles;
