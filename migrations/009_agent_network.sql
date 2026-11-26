-- Guard against forged agent messages: remember which network address each event came from.
ALTER TABLE activity_events ADD COLUMN ip VARCHAR(45) NULL AFTER received_at;
ALTER TABLE agent_devices ADD COLUMN last_ip VARCHAR(45) NULL AFTER last_seen_at;
