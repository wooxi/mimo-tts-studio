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

-- UI 配置（v3.1 起替代 KV；单行 upsert，key 固定为 "config:default"）
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
