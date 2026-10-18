/**
 * Local harness — runs the real Worker in plain Node, with no wrangler and no
 * workerd. It exists so the whole stack (routing, auth, D1 migration, R2
 * ranges, SSE passthrough, the front end) can be exercised in one command:
 *
 *   node scripts/local-harness.mjs
 *   → http://127.0.0.1:8787   (CONFIG_TOKEN=devtoken, mock upstream)
 *
 * It is a development aid, not a deployment target. `wrangler dev` remains the
 * faithful local runtime; this shims only the three bindings the app touches,
 * so the Worker source itself runs unmodified.
 */

import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC = join(ROOT, "public");

/**
 * `.dev.vars` is read the way `wrangler dev` reads it, so one file serves both
 * entry points and no secret has to be exported into the shell or pasted into a
 * command. Real environment variables win, so `MIMO_MOCK=0 node ...` still
 * overrides whatever the file says.
 */
function loadDevVars() {
  const out = {};
  let text;
  try {
    text = readFileSync(join(ROOT, ".dev.vars"), "utf8");
  } catch {
    return out;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const DEV_VARS = loadDevVars();
const setting = (key) => process.env[key] ?? DEV_VARS[key];

const PORT = Number(setting("PORT") || 8787);
const TOKEN = setting("CONFIG_TOKEN") || "devtoken";

/* ══════════════════════════════════════════════════════════ D1 shim ══ */

const sqlite = new DatabaseSync(":memory:");

/** SqliteError codes that the Worker treats as benign during migration. */
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
        if (row && column) return row[column] ?? null;
        return row;
      },
    };
    return api;
  },
  async batch(statements) {
    return Promise.all(statements.map((s) => s.run()));
  },
  async exec(sql) {
    sqlite.exec(sql);
    return { count: 0, duration: 0 };
  },
};

/* ═════════════════════════════════════════════════════════ R2 shim ══ */

const objects = new Map();

const BUCKET = {
  async put(key, value, options = {}) {
    const buf =
      value instanceof ArrayBuffer
        ? Buffer.from(value)
        : Buffer.from(await new Response(value).arrayBuffer());
    objects.set(key, {
      body: buf,
      httpMetadata: options.httpMetadata || {},
      customMetadata: options.customMetadata || {},
      etag: `"${buf.length.toString(16)}-${key.length.toString(16)}"`,
    });
    return { key, size: buf.length };
  },

  async get(key, options = {}) {
    const obj = objects.get(key);
    if (!obj) return null;

    const total = obj.body.length;
    let slice = obj.body;
    let range = null;

    const r = options?.range;
    if (r && typeof r === "object") {
      let start = 0;
      let len = total;
      if (r.suffix != null) {
        start = Math.max(0, total - r.suffix);
        len = total - start;
      } else {
        start = Math.max(0, Math.min(r.offset ?? 0, total));
        len = Math.max(0, Math.min(r.length ?? total - start, total - start));
      }
      slice = obj.body.subarray(start, start + len);
      // Mirrors the real binding: offset/length/suffix, never `end`.
      range = r.suffix != null ? { suffix: r.suffix, offset: start, length: len } : { offset: start, length: len };
    }

    return {
      key,
      size: total,
      etag: obj.etag,
      httpEtag: obj.etag,
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
      range,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(slice));
          controller.close();
        },
      }),
      async arrayBuffer() {
        return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
      },
      async text() {
        return slice.toString("utf8");
      },
    };
  },

  async delete(key) {
    objects.delete(key);
  },

  async head(key) {
    const obj = objects.get(key);
    return obj ? { key, size: obj.body.length, httpEtag: obj.etag } : null;
  },
};

/* ══════════════════════════════════════════════════════ ASSETS shim ══ */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

/**
 * Files the asset layer consumes as configuration and never serves.
 * Cloudflare excludes these from Workers Assets; the shim has to match,
 * otherwise a local run would report them as downloadable.
 */
const CONFIG_ONLY = new Set(["_headers", "_redirects", "_routes.json"]);

const ASSETS = {
  async fetch(request) {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";

    const name = rel.split("/").pop();
    if (CONFIG_ONLY.has(name)) return new Response("not found", { status: 404 });

    // Contain the lookup inside ./public — no traversal.
    const full = normalize(join(PUBLIC, rel));
    if (!full.startsWith(PUBLIC)) return new Response("forbidden", { status: 403 });

    try {
      const info = await stat(full);
      if (!info.isFile()) throw new Error("not a file");
      const body = await readFile(full);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": MIME[extname(full)] || "application/octet-stream",
          "Content-Length": String(body.length),
        },
      });
    } catch {
      return new Response("not found", { status: 404 });
    }
  },
};

/* ═════════════════════════════════════════════════════════════ env ══ */

const env = {
  ASSETS,
  HISTORY_DB: D1,
  AUDIO_BUCKET: BUCKET,
  UPSTREAM_URL: setting("UPSTREAM_URL") || "https://api.xiaomimimo.com/v1/chat/completions",
  MIMO_API_KEY: setting("MIMO_API_KEY") || "harness-placeholder",
  CONFIG_TOKEN: TOKEN,
  HISTORY_LIMIT: setting("HISTORY_LIMIT") || "200",
  MAX_AUDIO_BYTES: setting("MAX_AUDIO_BYTES") || "26214400",
  AUDIO_URL_TTL: setting("AUDIO_URL_TTL") || "1800",
  // Mock unless explicitly turned off, so a stray real key in .dev.vars can
  // never cause an accidental billed call during routine local testing.
  MIMO_MOCK: setting("MIMO_MOCK") === "0" ? undefined : "1",
};

const ctx = {
  waitUntil(promise) {
    Promise.resolve(promise).catch((e) => console.warn("waitUntil:", e?.message));
  },
  passThroughOnException() {},
};

/* ══════════════════════════════════════════════════════════ server ══ */

const { default: worker } = await import("../src/worker.js");

const server = createServer(async (req, res) => {
  const url = `http://${req.headers.host || `127.0.0.1:${PORT}`}${req.url}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });

  let response;
  try {
    response = await worker.fetch(request, env, ctx);
  } catch (err) {
    console.error("worker threw:", err);
    response = new Response(JSON.stringify({ error: { code: "harness", message: String(err) } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  res.statusCode = response.status;
  for (const [k, v] of response.headers) {
    if (k.toLowerCase() === "content-encoding") continue;
    res.setHeader(k, v);
  }

  if (!response.body || req.method === "HEAD") {
    res.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(res);
  res.on("close", () => response.body?.cancel?.().catch(() => {}));
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use — another harness is probably still running.\n` +
        `Pick a different port:  PORT=8790 node scripts/local-harness.mjs`,
    );
    process.exit(1);
  }
  throw err;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    // Don't wait on lingering keep-alive sockets.
    setTimeout(() => process.exit(0), 300).unref();
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`MiMo TTS Studio harness  →  http://127.0.0.1:${PORT}`);
  console.log(`  CONFIG_TOKEN = ${TOKEN}`);
  console.log(`  upstream     = ${env.MIMO_MOCK ? "MOCK (no network)" : env.UPSTREAM_URL}`);
  console.log(`  api key      = ${env.MIMO_MOCK ? "not used" : env.MIMO_API_KEY === "harness-placeholder" ? "MISSING — set MIMO_API_KEY in .dev.vars" : "loaded from .dev.vars"}`);
  console.log(`  data         = in-memory (D1 via node:sqlite, R2 via a Map); resets on exit`);
  console.log(`  ctrl-c to stop`);
});
