-- Rota schema. Every mutable row carries rev; stale writes get 409.
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '[]',      -- JSON array of role names
  token TEXT NOT NULL UNIQUE,
  is_leader INTEGER NOT NULL DEFAULT 0,
  phone TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                     -- YYYY-MM-DD
  time TEXT NOT NULL DEFAULT '',          -- HH:MM
  kind TEXT NOT NULL DEFAULT 'am',        -- am | pm | practice | special
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS services_date ON services(date, time);
CREATE TABLE IF NOT EXISTS assignments (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, role)          -- a role slot holds one person
);
CREATE TABLE IF NOT EXISTS away (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (person_id, date)
);
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  key TEXT NOT NULL DEFAULT '',
  bpm INTEGER,
  chart TEXT NOT NULL DEFAULT '',
  video TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  last_used TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS set_entries (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  key TEXT NOT NULL DEFAULT '',
  lead_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS set_entries_service ON set_entries(service_id, position);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  ch INTEGER NOT NULL,
  src TEXT NOT NULL DEFAULT '',
  inp TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS desk_notes (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
-- One rev for list-shaped things (the channel list).
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta(key, value) VALUES ('channels_rev', '1');
