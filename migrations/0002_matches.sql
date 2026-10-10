-- Shared match history (visible to every Access-allowed user).
-- data = normalized match JSON: {players, frameWins, frames:[{scores, winner, breaks, potted, fouls, potPts}]}
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,          -- snookr | montonen | cuescore
  source_ref TEXT NOT NULL UNIQUE, -- dedupe key, e.g. snookr:<at>, cuescore:<matchId>
  played_at TEXT NOT NULL,
  discipline TEXT,
  venue TEXT,
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  frames_a INTEGER NOT NULL,
  frames_b INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_played_at ON matches (played_at);

-- Display names, CueScore id mapping (e.g. 65158465 -> 'Jere') and avatars.
CREATE TABLE IF NOT EXISTS players (
  name TEXT PRIMARY KEY,
  cuescore_id INTEGER UNIQUE,
  image TEXT
);
