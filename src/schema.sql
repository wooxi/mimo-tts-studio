CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  voice TEXT,
  format TEXT NOT NULL,
  style TEXT,
  text TEXT NOT NULL,
  duration REAL,
  size INTEGER,
  audio_key TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_created ON history (created_at DESC);
