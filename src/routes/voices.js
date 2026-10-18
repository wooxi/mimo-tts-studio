/**
 * /api/voices — the voice library.
 *
 * Two kinds of saved voice, and they persist differently:
 *
 *   design  a text prompt. The model regenerates the timbre from it each time,
 *           so what is stored is the description, not a waveform.
 *   clone   a reference clip in R2 under `voice/<id>.<ext>`, plus metadata.
 *
 *   GET    /api/voices
 *   POST   /api/voices          JSON for a design voice, multipart for a clone
 *   DELETE /api/voices/:id      removes the row and, for a clone, the object
 *   GET    /voice/:id?exp&sig   plays a clone's reference clip
 *
 * Voice clips are served from /voice rather than /audio because the history
 * table is not where they live; the signature scheme is the same.
 */

import { CODES, HttpError, readJson } from "../lib/http.js";
import { hasToken, tokenOk, verifyAudio, voiceUrl } from "../lib/auth.js";

const ID_RE = /^[a-z0-9]{8,40}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const NAME_MAX = 60;
const DESC_MAX = 4000;
const BODY_LIMIT = 16 * 1024 * 1024;

const newId = () => {
  const b = crypto.getRandomValues(new Uint8Array(9));
  let s = "";
  for (const v of b) s += ALPHABET[v % ALPHABET.length];
  return s + Date.now().toString(36);
};

const str = (v, max) => (typeof v === "string" && v ? v.slice(0, max) : null);

const isFileLike = (v) =>
  v != null &&
  typeof v === "object" &&
  typeof v.arrayBuffer === "function" &&
  typeof v.size === "number" &&
  v.size > 0;

export async function handleVoices(request, env, ctx, cors, url, path) {
  const reply = (data, status = 200) =>
    Response.json(data, { status, headers: { ...cors, "Cache-Control": "no-store" } });

  /* ------------------------------------------------------------- list -- */
  if (request.method === "GET" && !path) {
    const { results } = await env.HISTORY_DB.prepare(
      `SELECT id, created_at, name, kind, description, duration, size, source_history_id
       FROM voices ORDER BY created_at DESC LIMIT 200`,
    ).all();

    const items = (results || []).map((v) => ({
      ...v,
      // Signed playback is only meaningful for a clone.
      url: v.kind === "clone" ? `/voice/${v.id}` : null,
    }));

    // Mint signatures for the clones in one pass.
    await Promise.all(
      items.map(async (v) => {
        if (v.kind === "clone") v.url = await voiceUrl(env, v.id);
      }),
    );

    return reply({ items, total: items.length });
  }

  /* ----------------------------------------------------------- create -- */
  if (request.method === "POST" && !path) {
    const contentType = request.headers.get("Content-Type") || "";

    if (contentType.includes("multipart/form-data")) {
      let form;
      try {
        form = await request.formData();
      } catch {
        throw new HttpError(CODES.BAD_REQUEST, "需要 multipart/form-data", 400);
      }

      const audio = form.get("audio");
      if (!isFileLike(audio)) {
        throw new HttpError(CODES.BAD_REQUEST, "缺少参考音频", 400);
      }
      const maxBytes = Number(env.MAX_AUDIO_BYTES || 26214400);
      if (audio.size > maxBytes) {
        throw new HttpError(CODES.PAYLOAD_TOO_LARGE, "参考音频过大", 413);
      }

      let meta = {};
      try {
        meta = JSON.parse(form.get("meta") || "{}");
      } catch {
        throw new HttpError(CODES.BAD_REQUEST, "meta 不是合法 JSON", 400);
      }

      const name = str(meta.name, NAME_MAX);
      if (!name) throw new HttpError(CODES.BAD_REQUEST, "请给这个音色起个名字", 400);

      const id = newId();
      const ext = /mp3|mpeg/i.test(audio.type || "") ? "mp3" : "wav";
      const key = `voice/${id}.${ext}`;

      await env.AUDIO_BUCKET.put(key, await audio.arrayBuffer(), {
        httpMetadata: { contentType: audio.type || "audio/wav" },
        customMetadata: { kind: "voice", id },
      });

      try {
        await env.HISTORY_DB.prepare(
          `INSERT INTO voices
             (id, created_at, name, kind, description, sample_key, sample_type,
              duration, size, source_history_id)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
          .bind(
            id,
            Date.now(),
            name,
            "clone",
            str(meta.description, DESC_MAX),
            key,
            str(audio.type, 64) || "audio/wav",
            Number.isFinite(Number(meta.duration)) ? Number(meta.duration) : null,
            audio.size,
            str(meta.sourceHistoryId, 40),
          )
          .run();
      } catch (e) {
        await env.AUDIO_BUCKET.delete(key); // never leave an orphaned object
        throw new HttpError(CODES.INTERNAL, `保存音色失败：${e.message}`, 500);
      }

      const created = { id, name, kind: "clone", url: await voiceUrl(env, id) };
      return reply(created, 201);
    }

    // JSON path: a designed voice is just a prompt.
    const body = await readJson(request, BODY_LIMIT);
    const name = str(body?.name, NAME_MAX);
    const description = str(body?.description, DESC_MAX);
    if (!name) throw new HttpError(CODES.BAD_REQUEST, "请给这个音色起个名字", 400);
    if (!description) {
      throw new HttpError(CODES.BAD_REQUEST, "音色描述不能为空", 400);
    }

    const id = newId();
    await env.HISTORY_DB.prepare(
      `INSERT INTO voices
         (id, created_at, name, kind, description, sample_key, sample_type,
          duration, size, source_history_id)
       VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,?)`,
    )
      .bind(id, Date.now(), name, "design", description, str(body?.sourceHistoryId, 40))
      .run();

    return reply({ id, name, kind: "design", description }, 201);
  }

  /* ----------------------------------------------------------- delete -- */
  const id = path ? path.replace(/^\//, "") : "";
  if (path && !ID_RE.test(id)) {
    throw new HttpError(CODES.BAD_REQUEST, "非法 id", 400);
  }

  if (request.method === "DELETE" && id) {
    const row = await env.HISTORY_DB.prepare(
      "SELECT sample_key FROM voices WHERE id = ?",
    )
      .bind(id)
      .first();
    if (!row) throw new HttpError(CODES.NOT_FOUND, "音色不存在", 404);

    // Object first: if it fails, the row survives and can be retried, rather
    // than leaving a clip nothing points at.
    if (row.sample_key) await env.AUDIO_BUCKET.delete(row.sample_key);
    await env.HISTORY_DB.prepare("DELETE FROM voices WHERE id = ?").bind(id).run();
    return reply({ ok: true, id });
  }

  throw new HttpError(CODES.BAD_REQUEST, "method not allowed", 405);
}

/** GET|HEAD /voice/:id?exp&sig — a saved clone's reference clip. */
export async function handleVoiceSample(request, env, cors, url) {
  const id = url.pathname.slice("/voice/".length);
  if (!ID_RE.test(id)) throw new HttpError(CODES.BAD_REQUEST, "非法 id", 400);
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(CODES.BAD_REQUEST, "method not allowed", 405);
  }

  // Same reasoning as /audio: <audio> cannot send headers, so this route
  // carries its own check — including the not-configured case.
  if (!hasToken(env)) {
    throw new HttpError(
      CODES.NOT_CONFIGURED,
      "服务端未设置 CONFIG_TOKEN，已拒绝所有请求。请执行：wrangler secret put CONFIG_TOKEN",
      503,
    );
  }

  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const signed = exp && sig && (await verifyAudio(env, id, exp, sig, "voice"));
  if (!signed && !tokenOk(request, env)) {
    throw new HttpError(CODES.UNAUTHORIZED, "链接已过期，请刷新音色库", 401);
  }

  const row = await env.HISTORY_DB.prepare(
    "SELECT sample_key, sample_type FROM voices WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!row?.sample_key) throw new HttpError(CODES.NOT_FOUND, "音色不存在", 404);

  const obj = await env.AUDIO_BUCKET.get(row.sample_key);
  if (!obj) throw new HttpError(CODES.NOT_FOUND, "参考音频缺失", 404);

  return new Response(request.method === "HEAD" ? null : obj.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": obj.httpMetadata?.contentType || row.sample_type || "audio/wav",
      "Content-Length": String(obj.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": signed ? "private, max-age=1800" : "private, no-store",
    },
  });
}
