/**
 * Upgrade-path check.
 *
 * The smoke test runs against a cold database. Real deployments upgrade an
 * existing v4 one, which is a different code path: `CREATE TABLE IF NOT
 * EXISTS` is a no-op there, so every new column has to arrive via ALTER, and
 * new tables have to be created alongside the old data.
 *
 *   node scripts/check-migration.mjs
 */

import { DatabaseSync } from "node:sqlite";
import { ensureSchema } from "../src/lib/db.js";

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `  → ${detail}` : ""}`);
  }
};

/* --------------------------------------------------- a v4 database, verbatim */

const sqlite = new DatabaseSync(":memory:");

sqlite.exec(`
  CREATE TABLE history (
    id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, model TEXT NOT NULL,
    voice TEXT, format TEXT NOT NULL, style TEXT, text TEXT NOT NULL,
    duration REAL, size INTEGER, audio_key TEXT NOT NULL
  );
  CREATE INDEX idx_history_created ON history (created_at DESC);
  CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
`);

const V4_ROW = {
  id: "oldtake0001",
  created_at: 1700000000000,
  model: "mimo-v2.5-tts",
  voice: "冰糖",
  format: "wav",
  style: "温柔",
  text: "这条记录来自 v4，升级后必须还在。",
  duration: 3.5,
  size: 168044,
  audio_key: "audio/oldtake0001.wav",
};

sqlite
  .prepare(
    `INSERT INTO history (id, created_at, model, voice, format, style, text, duration, size, audio_key)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  .run(
    V4_ROW.id,
    V4_ROW.created_at,
    V4_ROW.model,
    V4_ROW.voice,
    V4_ROW.format,
    V4_ROW.style,
    V4_ROW.text,
    V4_ROW.duration,
    V4_ROW.size,
    V4_ROW.audio_key,
  );

sqlite
  .prepare("INSERT INTO config (key, value, updated_at) VALUES (?,?,?)")
  .run("config:default", JSON.stringify({ model: "mimo-v2.5-tts", voice: "茉莉" }), Date.now());

/* --------------------------------------------------------------- the shim -- */

const D1 = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    let bound = [];
    const api = {
      bind(...args) {
        bound = args.map((a) => (a === undefined ? null : a));
        return api;
      },
      async run() {
        const info = stmt.run(...bound);
        return { success: true, meta: { changes: info.changes } };
      },
      async all() {
        return { results: stmt.all(...bound), success: true };
      },
      async first(column) {
        const row = stmt.get(...bound) ?? null;
        return row && column ? (row[column] ?? null) : row;
      },
    };
    return api;
  },
};

/* ---------------------------------------------------------------- migrate -- */

console.log("before: history columns =", sqlite.prepare("PRAGMA table_info(history)").all().map((c) => c.name).join(", "));

let threw = null;
try {
  await ensureSchema(D1);
} catch (e) {
  threw = e;
}

console.log("\nupgrade");
check("ensureSchema completes on a v4 database", !threw, String(threw?.message || ""));

const historyCols = sqlite.prepare("PRAGMA table_info(history)").all().map((c) => c.name);
for (const col of ["starred", "batch_id", "take_index", "spec", "tokens", "chars"]) {
  check(`history.${col} added`, historyCols.includes(col));
}

const tables = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((t) => t.name);
for (const t of ["history", "config", "meta", "usage", "voices"]) {
  check(`table ${t} exists`, tables.includes(t));
}

const indexes = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='index'")
  .all()
  .map((i) => i.name);
for (const i of ["idx_history_created", "idx_history_starred", "idx_history_batch", "idx_voices_created"]) {
  check(`index ${i} exists`, indexes.includes(i));
}

/* ------------------------------------------------------------- old data --- */

console.log("\nexisting data");
const row = sqlite.prepare("SELECT * FROM history WHERE id = ?").get(V4_ROW.id);
check("the v4 row survives", Boolean(row), "row missing");
check("its text is intact", row?.text === V4_ROW.text);
check("its audio key is intact", row?.audio_key === V4_ROW.audio_key);
check("starred defaults to 0", row?.starred === 0, String(row?.starred));
check("the new columns read back as null", row?.batch_id === null && row?.spec === null);

const cfg = sqlite.prepare("SELECT value FROM config WHERE key = ?").get("config:default");
check("existing config survives", JSON.parse(cfg?.value || "{}").voice === "茉莉");

const version = sqlite.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
check("schema_version recorded", version?.value === "5", version?.value);

/* -------------------------------------------------------------- idempotent */

console.log("\nre-running is a no-op");
let second = null;
try {
  await ensureSchema(D1);
} catch (e) {
  second = e;
}
check("a second run does not throw", !second, String(second?.message || ""));
check(
  "no duplicate columns appear",
  sqlite.prepare("PRAGMA table_info(history)").all().length === historyCols.length,
);

/* -------------------------------------------------- a brand new database -- */

console.log("\ncold database");
const fresh = new DatabaseSync(":memory:");
const FreshD1 = {
  prepare(sql) {
    const stmt = fresh.prepare(sql);
    let bound = [];
    const api = {
      bind(...args) {
        bound = args.map((a) => (a === undefined ? null : a));
        return api;
      },
      async run() {
        return { success: true, meta: { changes: stmt.run(...bound).changes } };
      },
      async all() {
        return { results: stmt.all(...bound), success: true };
      },
      async first(column) {
        const r = stmt.get(...bound) ?? null;
        return r && column ? (r[column] ?? null) : r;
      },
    };
    return api;
  },
};
await ensureSchema(FreshD1);
const freshTables = fresh
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((t) => t.name);
check(
  "a cold database gets every table in one pass",
  ["history", "config", "meta", "usage", "voices"].every((t) => freshTables.includes(t)),
  freshTables.join(", "),
);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
