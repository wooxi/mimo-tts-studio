-- ============================================================================
-- MiMo TTS Studio — D1 schema (v5)
--
-- 全部语句都是幂等的，可以重复执行。
-- Worker 启动时也会做一次版本化迁移（见 src/lib/db.js），因此
-- 已有部署只需 `wrangler deploy` 即可升级，不必手工跑 SQL。
-- 本文件同时作为权威结构说明保留。
-- ============================================================================

-- 历史记录元数据（音频本体在 R2）
CREATE TABLE IF NOT EXISTS history (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  model       TEXT NOT NULL,
  voice       TEXT,
  format      TEXT NOT NULL,
  style       TEXT,
  text        TEXT NOT NULL,
  duration    REAL,
  size        INTEGER,
  audio_key   TEXT NOT NULL,
  -- v5 新增
  starred     INTEGER NOT NULL DEFAULT 0, -- 收藏
  batch_id    TEXT,                       -- 同一次多条 take 归为一组
  take_index  INTEGER,                    -- 组内序号，从 0 开始
  spec        TEXT,                       -- 完整参数 JSON，用于无损「载入参数」
  tokens      INTEGER,                    -- 本次调用消耗的 token
  chars       INTEGER                     -- 台词字数，便于统计
);

CREATE INDEX IF NOT EXISTS idx_history_created ON history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_starred ON history (starred, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_batch   ON history (batch_id);

-- UI 配置（单行 upsert，key 固定为 "config:default"）
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 调用用量（每次上游调用一行，用于设置页的统计）
CREATE TABLE IF NOT EXISTS usage (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  model        TEXT NOT NULL,
  ok           INTEGER NOT NULL,
  status       INTEGER,
  ms           INTEGER,
  chars        INTEGER,
  audio_bytes  INTEGER,
  tokens       INTEGER,
  error_code   TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_created ON usage (created_at DESC);

-- 自维护的 schema 版本，用于幂等迁移
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
