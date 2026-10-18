/**
 * D1 bootstrap.
 *
 * Every statement is idempotent, and new columns are added lazily, so an
 * existing v4 database upgrades itself on the first request after deploy.
 * `CREATE TABLE IF NOT EXISTS` covers fresh installs; the ALTERs below cover
 * databases created before v5. A duplicate-column error is expected on the
 * second and later runs and is swallowed.
 */

const V5_COLUMNS = [
  ["history", "starred", "INTEGER NOT NULL DEFAULT 0"],
  ["history", "batch_id", "TEXT"],
  ["history", "take_index", "INTEGER"],
  ["history", "spec", "TEXT"],
  ["history", "tokens", "INTEGER"],
  ["history", "chars", "INTEGER"],
];

const BASE = [
  // The history table has to exist before the v5 ALTERs below run, otherwise a
  // fresh database fails with "no such table" and every API route 500s.
  `CREATE TABLE IF NOT EXISTS history (
     id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, model TEXT NOT NULL,
     voice TEXT, format TEXT NOT NULL, style TEXT, text TEXT NOT NULL,
     duration REAL, size INTEGER, audio_key TEXT NOT NULL,
     starred INTEGER NOT NULL DEFAULT 0, batch_id TEXT, take_index INTEGER,
     spec TEXT, tokens INTEGER, chars INTEGER)`,
  `CREATE TABLE IF NOT EXISTS config (
     key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  // Saved voices — the one piece of user data that is not a take. A designed
  // voice is a prompt; a cloned voice is a reference clip in R2.
  `CREATE TABLE IF NOT EXISTS voices (
     id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, name TEXT NOT NULL,
     kind TEXT NOT NULL, description TEXT, sample_key TEXT, sample_type TEXT,
     duration REAL, size INTEGER, source_history_id TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_voices_created ON voices (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS usage (
     id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, model TEXT NOT NULL,
     ok INTEGER NOT NULL, status INTEGER, ms INTEGER, chars INTEGER,
     audio_bytes INTEGER, tokens INTEGER, error_code TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_usage_created ON usage (created_at DESC)`,
];

/**
 * Idempotent, memoised per binding.
 *
 * Keyed by the D1 object rather than by module scope: a plain module-level
 * flag assumes there is only ever one database, so a second binding would be
 * silently left unmigrated. Call before touching any table.
 */
const ready = new WeakMap();

async function run(db, sql, ...binds) {
  return db.prepare(sql).bind(...binds).run();
}

export function ensureSchema(db) {
  let pending = ready.get(db);
  if (!pending) {
    pending = bootstrap(db).catch((e) => {
      ready.delete(db); // let the next request retry
      throw e;
    });
    ready.set(db, pending);
  }
  return pending;
}

async function bootstrap(db) {
  for (const sql of BASE) await run(db, sql);

  for (const [table, column, type] of V5_COLUMNS) {
    try {
      await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (e) {
      const msg = String(e?.message || e);
      if (!/duplicate column|already exists/i.test(msg)) throw e;
    }
  }

  // Indexes that reference v5 columns must come after the ALTERs. A failure
  // here is non-fatal (the table still works, just slower) but must not be
  // silent — an index that never gets created is invisible otherwise.
  for (const sql of [
    `CREATE INDEX IF NOT EXISTS idx_history_created ON history (created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_history_starred ON history (starred, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_history_batch ON history (batch_id)`,
  ]) {
    try {
      await run(db, sql);
    } catch (e) {
      console.warn("index creation skipped:", String(e?.message || e));
    }
  }

  await run(
    db,
    `INSERT INTO meta (key, value) VALUES ('schema_version', '5')
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
}

/* ------------------------------------------------------------------ usage -- */

const rid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export function recordUsage(db, row, ctx) {
  const p = run(
    db,
    `INSERT INTO usage
       (id, created_at, model, ok, status, ms, chars, audio_bytes, tokens, error_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    rid(),
    Date.now(),
    String(row.model || "?").slice(0, 64),
    row.ok ? 1 : 0,
    row.status ?? null,
    row.ms ?? null,
    row.chars ?? null,
    row.audioBytes ?? null,
    row.tokens ?? null,
    row.errorCode ? String(row.errorCode).slice(0, 48) : null,
  ).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(p);
}

/** Usage rollup for the settings panel. */
export async function usageSummary(db, days = 30) {
  const since = Date.now() - days * 86400_000;
  const { results } = await db
    .prepare(
      `SELECT
         COUNT(*)                                   AS calls,
         SUM(ok)                                    AS ok_calls,
         COALESCE(SUM(tokens), 0)                   AS tokens,
         COALESCE(SUM(chars), 0)                    AS chars,
         COALESCE(SUM(audio_bytes), 0)              AS bytes,
         COALESCE(SUM(ms), 0)                       AS ms
       FROM usage WHERE created_at >= ?`,
    )
    .bind(since)
    .all();
  const row = results?.[0] || {};

  const { results: byModel } = await db
    .prepare(
      `SELECT model, COUNT(*) AS calls, COALESCE(SUM(tokens),0) AS tokens
       FROM usage WHERE created_at >= ? GROUP BY model ORDER BY calls DESC`,
    )
    .bind(since)
    .all();

  const { results: byDay } = await db
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS calls
       FROM usage WHERE created_at >= ?
       GROUP BY day ORDER BY day DESC LIMIT ?`,
    )
    .bind(since, days)
    .all();

  return {
    windowDays: days,
    calls: row.calls || 0,
    okCalls: row.ok_calls || 0,
    tokens: row.tokens || 0,
    chars: row.chars || 0,
    bytes: row.bytes || 0,
    ms: row.ms || 0,
    byModel: byModel || [],
    byDay: (byDay || []).reverse(),
  };
}
