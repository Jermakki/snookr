-- Per-user copy of the browser's settings table (key/value store used by dbGetSetting/dbSetSetting).
CREATE TABLE IF NOT EXISTS settings (
  user TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user, key)
);
