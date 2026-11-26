-- Agent tables keep every time in UTC (occurred_at always was). received_at / last_seen_at / created_at
-- were filled by the database clock, which runs in the server's own zone; convert them to UTC once.
-- From now on the code writes UTC_TIMESTAMP() explicitly.
UPDATE activity_events SET received_at = CONVERT_TZ(received_at, 'SYSTEM', '+00:00');
UPDATE agent_devices SET
  last_seen_at = CONVERT_TZ(last_seen_at, 'SYSTEM', '+00:00'),
  created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');
