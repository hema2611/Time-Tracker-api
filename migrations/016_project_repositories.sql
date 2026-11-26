-- Project Repository: drive links stored per project (project_master), with an optional description.
CREATE TABLE IF NOT EXISTS project_repositories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  drive_link VARCHAR(1000) NOT NULL,
  description TEXT NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_repo_project (project_id),
  CONSTRAINT fk_repo_project FOREIGN KEY (project_id) REFERENCES project_master(id),
  CONSTRAINT fk_repo_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
