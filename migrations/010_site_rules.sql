-- Unproductive / productive sites and apps. The agent and browser extension report ONLY matches of
-- 'unproductive' rules (name + minutes); everything else is never stored.
CREATE TABLE site_rules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('site','app') NOT NULL,             -- site = web domain (youtube.com), app = program name (steam.exe / Steam)
  pattern VARCHAR(190) NOT NULL,                -- domain (matches subdomains too) or program name (case-insensitive)
  label VARCHAR(120) NOT NULL,                  -- shown in reports, e.g. YouTube
  rating ENUM('unproductive','productive') NOT NULL DEFAULT 'unproductive',
  allow_roles VARCHAR(190) NULL,                -- comma list of roles for whom this is NOT flagged (e.g. 'designer')
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rule (kind, pattern)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO site_rules (kind, pattern, label) VALUES
  ('site','youtube.com','YouTube'), ('site','netflix.com','Netflix'), ('site','primevideo.com','Prime Video'),
  ('site','hotstar.com','Hotstar'), ('site','instagram.com','Instagram'), ('site','facebook.com','Facebook'),
  ('site','x.com','X / Twitter'), ('site','twitter.com','X / Twitter'), ('site','reddit.com','Reddit'),
  ('site','tiktok.com','TikTok'), ('site','twitch.tv','Twitch'), ('site','poki.com','Online games'),
  ('site','crazygames.com','Online games'), ('site','miniclip.com','Online games'), ('site','chess.com','Chess.com'),
  ('site','cricbuzz.com','Cricbuzz'), ('site','spotify.com','Spotify'),
  ('app','steam','Steam'), ('app','epicgameslauncher','Epic Games'), ('app','riotclientservices','Riot Games'),
  ('app','valorant','Valorant'), ('app','minecraft','Minecraft'), ('app','spotify','Spotify'), ('app','vlc','VLC player');

-- What the agent reports: one row per minute per flagged thing.
ALTER TABLE activity_events
  MODIFY type ENUM('agent_start','agent_quit','heartbeat','suspend','resume','lock','unlock','idle_start','idle_end','shutdown','break_reason','flagged_use') NOT NULL;
