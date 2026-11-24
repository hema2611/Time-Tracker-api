-- Every uploaded proposal is kept as a version (Proposal v1, v2…). Files live on disk, never in the table.
CREATE TABLE proposals (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  stored_path VARCHAR(500) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proposal_version (project_id, version),
  CONSTRAINT fk_proposals_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_proposals_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per AI read: who asked, which provider and model, what it cost in tokens, and the answer.
CREATE TABLE proposal_readings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proposal_id INT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(80) NOT NULL,
  status ENUM('ok','failed') NOT NULL,
  result JSON NULL,
  error VARCHAR(500) NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  requested_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_readings_user_day (requested_by, created_at),
  CONSTRAINT fk_readings_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  CONSTRAINT fk_readings_user FOREIGN KEY (requested_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
