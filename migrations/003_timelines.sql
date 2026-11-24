-- A project's planned timeline. Every save is a new version; nothing is overwritten.
-- The latest version with status 'final' is the project's plan.
CREATE TABLE timelines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  status ENUM('draft','final') NOT NULL DEFAULT 'final',
  mode ENUM('seq','overlap') NOT NULL DEFAULT 'seq',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  working_days INT UNSIGNED NOT NULL,
  proposal_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_timeline_version (project_id, version),
  CONSTRAINT fk_timelines_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_timelines_proposal FOREIGN KEY (proposal_id) REFERENCES proposals(id),
  CONSTRAINT fk_timelines_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Modules and the sections under them, in display order. source = where the days came from.
CREATE TABLE timeline_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  timeline_id INT UNSIGNED NOT NULL,
  parent_id INT UNSIGNED NULL,
  kind ENUM('module','section') NOT NULL,
  position INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  days INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source ENUM('you','proposal','ai') NOT NULL,
  INDEX idx_items_timeline (timeline_id, position),
  CONSTRAINT fk_items_timeline FOREIGN KEY (timeline_id) REFERENCES timelines(id),
  CONSTRAINT fk_items_parent FOREIGN KEY (parent_id) REFERENCES timeline_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
