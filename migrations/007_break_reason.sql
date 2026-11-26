-- The agent asks "what was this break?" after a long break and sends the answer as an event.
ALTER TABLE activity_events
  MODIFY type ENUM('agent_start','agent_quit','heartbeat','suspend','resume','lock','unlock','idle_start','idle_end','shutdown','break_reason') NOT NULL;
