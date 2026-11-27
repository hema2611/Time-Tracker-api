-- Optional chosen icon for a holiday: a bundled icon name, a pasted emoji, or an https image link.
-- Empty = picked automatically from the holiday name.
ALTER TABLE holidays ADD COLUMN icon VARCHAR(500) NULL AFTER name;
