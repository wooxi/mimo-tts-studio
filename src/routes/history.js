/**
 * /api/history — take metadata in D1, audio bodies in R2.
 *
 *   GET    /api/history?q&model&starred&limit&cursor
 *   POST   /api/history            multipart: audio=<file> meta=<json>
 *   PATCH  /api/history/:id        { starred }
 *   DELETE /api/history/:id
 */

import { CODES, HttpError } from "../lib/http.js";
import { audioUrl } from "../lib/auth.js";

const ID_RE = /^[a-z0-9]{8,40}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  let s = "";
  for (const v of b) s += ALPHABET[v % ALPHABET.length];
  return s + Date.now().toString(36);
};

const str = (v, max) =>
  typeof v === "string" && v ? v.slice(0, max) : null;
const num = (v) =>
  Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null;

/**
 * Serialise the reload parameters, staying under the column budget by dropping
 * whole fields. Slicing the JSON string would leave invalid JSON, which then
 * fails to parse on read and silently loses every restored field.
 */
function packSpec(spec) {
  if (!spec || typeof spec !== "object") return null;

  const slim = { ...spec };
  if (typeof slim.style === "string") slim.style = slim.style.slice(0, 4000);
  if (typeof slim.voiceDesign === "string") {
    slim.voiceDesign = slim.voiceDesign.slice(0, 4000);
  }
  if (slim.director && typeof slim.director === "object") {
    slim.director = Object.fromEntries(
      Object.entries(slim.director).map(([k, v]) => [k, String(v ?? "").slice(0, 2000)]),
    );
  }

  let json = JSON.stringify(slim);
  if (json.length <= 20000) return json;

  // Still too big: keep the identity fields, which is what makes a take
  // reproducible, and record that the prose was dropped.
  json = JSON.stringify({
    model: slim.model,
    voice: slim.voice,
    format: slim.format,
    optimize: slim.optimize,
    autoSplit: slim.autoSplit,
    cloneName: slim.cloneName,
    truncated: true,
  });
  return json;
}

/**
 * Duck-typed rather than `instanceof File`: the global File class differs
 * between workerd builds and compatibility flags, and a false negative here
 * would reject every upload.
 */
const isFileLike = (v) =>
  v != null &&
  typeof v === "object" &&
  typeof v.arrayBuffer === "function" &&
  typeof v.size === "number" &&
  v.size > 0;

export async function handleHistory(request, env, ctx, cors, url, path) {
  const reply = (data, status = 200) =>
    Response.json(data, {
      status,
      headers: { ...cors, "Cache-Control": "no-store" },
    });

  /* ------------------------------------------------------------- list -- */
  if (request.method === "GET" && !path) {
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 40, 1), 100);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
    const model = (url.searchParams.get("model") || "").trim().slice(0, 64);
    const starred = url.searchParams.get("starred") === "1";
    const cursor = Number(url.searchParams.get("cursor")) || 0;

    // Filters and pagination are separated so the total can be counted over the
    // full filtered set rather than the current page.
    const filters = [];
    const filterBinds = [];
    if (q) {
      filters.push("(text LIKE ? OR voice LIKE ? OR style LIKE ?)");
      filterBinds.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (model) {
      filters.push("model = ?");
      filterBinds.push(model);
    }
    if (starred) filters.push("starred = 1");

    const page = cursor ? [...filters, "created_at < ?"] : filters;
    const pageBinds = cursor ? [...filterBinds, cursor] : filterBinds;
    const where = (list) => (list.length ? `WHERE ${list.join(" AND ")}` : "");

    const [{ results }, countRow] = await Promise.all([
      env.HISTORY_DB.prepare(
        `SELECT id, created_at, model, voice, format, text, duration, size,
                starred, batch_id, take_index, tokens, chars,
                substr(COALESCE(style,''), 1, 200) AS style
         FROM history ${where(page)}
         ORDER BY created_at DESC LIMIT ?`,
      )
        .bind(...pageBinds, limit)
        .all(),
      env.HISTORY_DB.prepare(
        `SELECT COUNT(*) AS n FROM history ${where(filters)}`,
      )
        .bind(...filterBinds)
        .first(),
    ]);

    const rows = results || [];
    const next = rows.length === limit ? rows[rows.length - 1].created_at : null;

    // Signed playback URLs are minted here so the client never has to ask.
    const items = await Promise.all(
      rows.map(async (r) => ({ ...r, url: await audioUrl(env, r.id) })),
    );

    return reply({ items, next, total: Number(countRow?.n) || rows.length });
  }

  /* ----------------------------------------------------------- create -- */
  if (request.method === "POST" && !path) {
    let form;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(CODES.BAD_REQUEST, "需要 multipart/form-data", 400);
    }

    const audio = form.get("audio");
    if (!isFileLike(audio)) {
      throw new HttpError(CODES.BAD_REQUEST, "缺少音频文件", 400);
    }
    const maxBytes = Number(env.MAX_AUDIO_BYTES || 26214400);
    if (audio.size > maxBytes) {
      throw new HttpError(
        CODES.PAYLOAD_TOO_LARGE,
        `音频超过 ${(maxBytes / 1048576).toFixed(0)}MB 上限`,
        413,
      );
    }

    let meta = {};
    try {
      meta = JSON.parse(form.get("meta") || "{}");
    } catch {
      throw new HttpError(CODES.BAD_REQUEST, "meta 不是合法 JSON", 400);
    }

    const text = str(meta.text, 20000) || "";
    const id = newId();
    const format = str(meta.format, 16) || "wav";
    const key = `audio/${id}.${format === "mp3" ? "mp3" : "wav"}`;

    await env.AUDIO_BUCKET.put(key, await audio.arrayBuffer(), {
      httpMetadata: { contentType: audio.type || "audio/wav" },
      customMetadata: { model: String(meta.model || ""), id },
    });

    try {
      await env.HISTORY_DB.prepare(
        `INSERT INTO history
           (id, created_at, model, voice, format, style, text, duration, size,
            audio_key, starred, batch_id, take_index, spec, tokens, chars)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
      )
        .bind(
          id,
          Date.now(),
          str(meta.model, 64) || "mimo-v2.5-tts",
          str(meta.voice, 128),
          format,
          str(meta.style, 8000),
          text,
          num(meta.duration),
          audio.size,
          key,
          str(meta.batchId, 40),
          num(meta.takeIndex),
          packSpec(meta.spec),
          num(meta.tokens),
          text.length,
        )
        .run();
    } catch (e) {
      await env.AUDIO_BUCKET.delete(key); // never leave an orphaned object
      throw new HttpError(CODES.INTERNAL, `写入历史失败：${e.message}`, 500);
    }

    const prune = pruneHistory(env).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(prune);
    else await prune;

    return reply({ ok: true, id, size: audio.size, url: await audioUrl(env, id) }, 201);
  }

  /* --------------------------------------------------------- one record -- */
  const id = path ? path.replace(/^\//, "") : "";
  if (path && !ID_RE.test(id)) {
    throw new HttpError(CODES.BAD_REQUEST, "非法 id", 400);
  }

  // Full row, `spec` included — this is what "载入参数" restores from, so it
  // is fetched per item rather than shipped with every list page.
  if (request.method === "GET" && id) {
    const row = await env.HISTORY_DB.prepare(
      `SELECT id, created_at, model, voice, format, style, text, duration, size,
              starred, batch_id, take_index, spec, tokens, chars
       FROM history WHERE id = ?`,
    )
      .bind(id)
      .first();
    if (!row) throw new HttpError(CODES.NOT_FOUND, "记录不存在", 404);

    let spec = null;
    if (row.spec) {
      try {
        spec = JSON.parse(row.spec);
      } catch {
        spec = null;
      }
    }
    return reply({ ...row, spec, url: await audioUrl(env, row.id) });
  }

  if (request.method === "PATCH" && id) {
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(CODES.BAD_REQUEST, "body 必须是 JSON", 400);
    }
    await env.HISTORY_DB.prepare("UPDATE history SET starred = ? WHERE id = ?")
      .bind(body?.starred ? 1 : 0, id)
      .run();
    return reply({ ok: true, id, starred: body?.starred ? 1 : 0 });
  }

  if (request.method === "DELETE" && id) {
    const row = await env.HISTORY_DB.prepare(
      "SELECT audio_key FROM history WHERE id = ?",
    )
      .bind(id)
      .first();
    if (!row) throw new HttpError(CODES.NOT_FOUND, "记录不存在", 404);

    // Object first, same order as pruneHistory and for the same reason: the R2
    // call is the one that can fail transiently, while the D1 delete by primary
    // key is reliable. Doing the risky half first means a failure leaves the row
    // visible and retryable, instead of an object nothing points at.
    if (row.audio_key) {
      try {
        await env.AUDIO_BUCKET.delete(row.audio_key);
      } catch (e) {
        console.warn("delete: object removal failed, row kept", id, e?.message);
        throw new HttpError(
          CODES.INTERNAL,
          "音频删除失败，记录已保留，请重试",
          502,
        );
      }
    }
    await env.HISTORY_DB.prepare("DELETE FROM history WHERE id = ?").bind(id).run();
    return reply({ ok: true, id });
  }

  throw new HttpError(CODES.BAD_REQUEST, "method not allowed", 405);
}

/**
 * Trim to HISTORY_LIMIT.
 *
 * Objects are removed before their rows: if the object delete fails the row
 * survives and is retried on the next pass, whereas the reverse order would
 * leave an unreferenced object that nothing can find again.
 */
export async function pruneHistory(env) {
  const limit = Math.max(Number(env.HISTORY_LIMIT || 200), 1);
  const { results } = await env.HISTORY_DB.prepare(
    `SELECT id, audio_key FROM history
     WHERE starred = 0
     ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  )
    .bind(limit)
    .all();
  if (!results?.length) return;

  for (const row of results) {
    if (row.audio_key) {
      try {
        await env.AUDIO_BUCKET.delete(row.audio_key);
      } catch (e) {
        console.warn("prune: object delete failed, keeping its row", row.id, e?.message);
        continue;
      }
    }
    await env.HISTORY_DB.prepare("DELETE FROM history WHERE id = ?").bind(row.id).run();
  }
}
