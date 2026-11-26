-- The database clock runs in the server's own zone (CET). From now on every session uses UTC
-- (db.js sets time_zone = '+00:00'), so convert times already written by these modules to UTC once.
-- updated_at is set explicitly so ON UPDATE does not overwrite it.
UPDATE leave_requests SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'), updated_at = CONVERT_TZ(updated_at, 'SYSTEM', '+00:00'),
  decided_at = CONVERT_TZ(decided_at, 'SYSTEM', '+00:00');
UPDATE project_repositories SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'), updated_at = CONVERT_TZ(updated_at, 'SYSTEM', '+00:00');
UPDATE reimbursements SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'), updated_at = CONVERT_TZ(updated_at, 'SYSTEM', '+00:00'),
  decided_at = CONVERT_TZ(decided_at, 'SYSTEM', '+00:00');
UPDATE reimbursement_files SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');
UPDATE work_allotments SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'), updated_at = CONVERT_TZ(updated_at, 'SYSTEM', '+00:00');
UPDATE tickets SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00'), updated_at = CONVERT_TZ(updated_at, 'SYSTEM', '+00:00'),
  completed_at = CONVERT_TZ(completed_at, 'SYSTEM', '+00:00');
UPDATE ticket_attachments SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');
UPDATE ticket_comments SET created_at = CONVERT_TZ(created_at, 'SYSTEM', '+00:00');
UPDATE ticket_time_logs SET started_at = CONVERT_TZ(started_at, 'SYSTEM', '+00:00'), ended_at = CONVERT_TZ(ended_at, 'SYSTEM', '+00:00');
UPDATE ticket_time_events SET at = CONVERT_TZ(at, 'SYSTEM', '+00:00');
UPDATE ticket_activity SET at = CONVERT_TZ(at, 'SYSTEM', '+00:00');
