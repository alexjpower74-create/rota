-- Who builds the rota: worship leaders and pastors, and who made each change (Alexander, 2026-09-13).
ALTER TABLE people ADD COLUMN title TEXT NOT NULL DEFAULT '';          -- 'worship leader' | 'pastor' | ''
ALTER TABLE services ADD COLUMN last_edit_by TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN last_edit_title TEXT NOT NULL DEFAULT '';
ALTER TABLE services ADD COLUMN last_edit_at TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS edits (
  id TEXT PRIMARY KEY,
  service_id TEXT,                 -- null for song/team changes
  what TEXT NOT NULL,              -- plain sentence: "put SAMPLE Dan on drums"
  by_id TEXT NOT NULL,
  by_name TEXT NOT NULL,
  by_title TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edits_service ON edits(service_id, at);
