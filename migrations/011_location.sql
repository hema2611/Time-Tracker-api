-- Check-in / check-out location. The agent sends a 'location' event (Wi-Fi name, and exact place only when the
-- computer's location service is on). The network address is already stored on every event.
ALTER TABLE activity_events
  MODIFY type ENUM('agent_start','agent_quit','heartbeat','suspend','resume','lock','unlock','idle_start','idle_end','shutdown','break_reason','flagged_use','location') NOT NULL;

-- How the tracker recognises "Office": the office's public internet address(es) and/or office Wi-Fi names.
CREATE TABLE office_networks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('ip','wifi') NOT NULL,
  value VARCHAR(120) NOT NULL,
  label VARCHAR(120) NOT NULL,          -- e.g. "Chennai office"
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_office_net (kind, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
