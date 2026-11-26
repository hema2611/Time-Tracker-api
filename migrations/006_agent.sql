-- Desktop agent: computers paired to a user, and the activity they report.

-- One row per paired computer. The token itself is never stored, only its SHA-256.
CREATE TABLE agent_devices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  platform ENUM('windows','mac','linux') NOT NULL,
  agent_version VARCHAR(20) NULL,
  token_hash CHAR(64) NOT NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agent_token (token_hash),
  INDEX idx_agent_user (user_id),
  CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw events, times in UTC. client_id makes re-sends (after being offline) harmless.
-- Working hours and breaks are worked out from these; the rows are never edited.
CREATE TABLE activity_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('agent_start','agent_quit','heartbeat','suspend','resume','lock','unlock','idle_start','idle_end','shutdown') NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  client_id CHAR(36) NOT NULL,
  detail JSON NULL,
  UNIQUE KEY uq_event_client (device_id, client_id),
  INDEX idx_event_user_time (user_id, occurred_at),
  CONSTRAINT fk_event_device FOREIGN KEY (device_id) REFERENCES agent_devices(id),
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
