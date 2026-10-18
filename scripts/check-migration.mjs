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

/* ------------------------------------------- the real routes, old data --- */

// Column existence is not the same as "the API still works". These are the
// actual route handlers, running their actual SQL against the migrated v4
// database with the v4 row still in it.
console.log("\nthe API against migrated v4 data");

const { handleHistory } = await import("../src/routes/history.js");
const { audioUrl } = await import("../src/lib/auth.js");

const env = {
  HISTORY_DB: D1,
  AUDIO_BUCKET: {
    async get(key) {
      // The v4 object is still there, under whatever key the v4 row recorded.
      if (key !== V4_ROW.audio_key) return null;
      return {
        body: new Uint8Array([82, 73, 70, 70]),
        size: 4,
        httpMetadata: { contentType: "audio/wav" },
        range: undefined,
      };
    },
    async put() {},
    async delete() {},
  },
  CONFIG_TOKEN: "migration-test-token",
  HISTORY_LIMIT: "200",
  AUDIO_URL_TTL: "1800",
  MAX_AUDIO_BYTES: "26214400",
};
const ctx = { waitUntil() {} };
const cors = {};

// `rest` is the path suffix only, exactly as the Worker computes it from
// url.pathname — the query string travels separately.
const call = async (method, rest = "", query = "", body) => {
  const url = `https://studio.example/api/history${rest}${query}`;
  const req = new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleHistory(req, env, ctx, cors, new URL(url), rest);
};

let list;
try {
  list = await (await call("GET", "", "?limit=10")).json();
  check("GET /api/history returns the v4 row", list.items?.some((i) => i.id === V4_ROW.id), JSON.stringify(list).slice(0, 140));
  check("the v4 row keeps its text", list.items?.find((i) => i.id === V4_ROW.id)?.text === V4_ROW.text);
  check("the v4 row is listed as unstarred", list.items?.find((i) => i.id === V4_ROW.id)?.starred === 0);
  check("the filtered total counts it", list.total >= 1, `total=${list.total}`);
  check("playback urls are minted for old rows", String(list.items?.[0]?.url || "").includes("sig="), String(list.items?.[0]?.url));
} catch (e) {
  check("GET /api/history returns the v4 row", false, e.message);
}

try {
  const one = await (await call("GET", `/${V4_ROW.id}`)).json();
  check("GET /api/history/:id reads a v4 row", one.id === V4_ROW.id, JSON.stringify(one).slice(0, 140));
  check("its text survives the round trip", one.text === V4_ROW.text);
  // The R2 key is deliberately not exposed; a signed url proves the server
  // resolved the row and can still address the old object.
  check("no r2 key is leaked to the client", one.audio_key === undefined);
  check("a signed playback url is returned", String(one.url || "").includes("sig="), String(one.url));
  check("its spec column reads back empty rather than throwing", one.spec === null || typeof one.spec === "object");
} catch (e) {
  check("GET /api/history/:id reads a v4 row", false, e.message);
}

try {
  const patched = await (await call("PATCH", `/${V4_ROW.id}`, "", { starred: true })).json();
  check("PATCH can star a v4 row", patched.ok === true || patched.starred === true, JSON.stringify(patched).slice(0, 120));
  const starred = sqlite.prepare("SELECT starred FROM history WHERE id = ?").get(V4_ROW.id);
  check("the star is persisted", starred?.starred === 1, String(starred?.starred));
  await call("PATCH", `/${V4_ROW.id}`, "", { starred: false });
} catch (e) {
  check("PATCH can star a v4 row", false, e.message);
}

try {
  const searched = await (await call("GET", "", "?q=" + encodeURIComponent("来自 v4"))).json();
  check("search finds the v4 row by its text", searched.items?.some((i) => i.id === V4_ROW.id), JSON.stringify(searched).slice(0, 140));
} catch (e) {
  check("search finds the v4 row by its text", false, e.message);
}

try {
  const url = await audioUrl(env, V4_ROW.id);
  check("a signed playback url is minted for the old object", url.includes("/audio/") && url.includes("sig="), url);
} catch (e) {
  check("a signed playback url is minted for the old object", false, e.message);
}

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
