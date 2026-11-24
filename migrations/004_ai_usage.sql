-- One row per AI call that is not a proposal read (those are in proposal_readings).
-- Used for the daily limit per user and to see where AI usage goes.
CREATE TABLE ai_usage (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  purpose VARCHAR(40) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(80) NOT NULL,
  status ENUM('ok','failed') NOT NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  error VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_usage_user_day (user_id, purpose, created_at),
  CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_ai_usage_project FOREIGN KEY (project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
