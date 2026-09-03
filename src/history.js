/**
 * 历史记录模块 — D1 元数据 + R2 音频
 */

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function newId() {
  let s = "";
  for (let i = 0; i < 12; i++)
    s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s + Date.now().toString(36);
}

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

/** 清理超出上限的最旧记录（元数据 + R2 对象） */
export async function pruneHistory(env) {
  const limit = parseInt(env.HISTORY_LIMIT || "100", 10);
  const { results } = await env.HISTORY_DB.prepare(
    `SELECT id, audio_key FROM history ORDER BY created_at DESC LIMIT -1 OFFSET ?`,
  )
    .bind(limit)
    .all();
  if (!results?.length) return;
  for (const row of results) {
    await env.HISTORY_DB.prepare("DELETE FROM history WHERE id = ?")
      .bind(row.id)
      .run();
    if (row.audio_key) await env.AUDIO_BUCKET.delete(row.audio_key);
  }
}

export async function handleHistory(request, env, cors, url, ctx) {
  const path = url.pathname;

  // 列表
  if (request.method === "GET" && path === "/api/history") {
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10) || 50,
      100,
    );
    const { results } = await env.HISTORY_DB.prepare(
      `SELECT id, created_at, model, voice, format, style, text, duration, size
       FROM history ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(limit)
      .all();
    return json(results ?? [], cors);
  }

  // 上传（multipart：audio 文件 + meta JSON）
  if (request.method === "POST" && path === "/api/history") {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "invalid multipart body" }, cors, 400);
    }
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return json({ error: "missing audio file" }, cors, 400);
    }
    if (audio.size > 25 * 1024 * 1024) {
      return json({ error: "audio too large (max 25MB)" }, cors, 413);
    }

    let meta;
    try {
      meta = JSON.parse(form.get("meta") || "{}");
    } catch {
      return json({ error: "invalid meta json" }, cors, 400);
    }

    const text = typeof meta.text === "string" ? meta.text.slice(0, 20000) : "";
    if (!text) return json({ error: "meta.text required" }, cors, 400);

    const id = newId();
    const key = `audio/${id}.wav`;
    const buf = await audio.arrayBuffer();

    await env.AUDIO_BUCKET.put(key, buf, {
      httpMetadata: { contentType: audio.type || "audio/wav" },
    });

    try {
      await env.HISTORY_DB.prepare(
        `INSERT INTO history (id, created_at, model, voice, format, style, text, duration, size, audio_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          Date.now(),
          String(meta.model || "mimo-v2.5-tts").slice(0, 64),
          typeof meta.voice === "string" ? meta.voice.slice(0, 128) : null,
          String(meta.format || "wav").slice(0, 16),
          typeof meta.style === "string" ? meta.style.slice(0, 4000) : null,
          text,
          Number.isFinite(+meta.duration) ? +meta.duration : null,
          buf.byteLength,
          key,
        )
        .run();
    } catch (e) {
      await env.AUDIO_BUCKET.delete(key); // 元数据失败则不留孤儿音频
      return json({ error: "db insert failed: " + e.message }, cors, 500);
    }

    // 异步清理不阻塞响应
    const prune = pruneHistory(env).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(prune);
    else await prune;

    return json({ ok: true, id, size: buf.byteLength }, cors);
  }

  // 删除单条
  const delMatch = path.match(/^\/api\/history\/([a-z0-9]+)$/);
  if (request.method === "DELETE" && delMatch) {
    const id = delMatch[1];
    const row = await env.HISTORY_DB.prepare(
      "SELECT audio_key FROM history WHERE id = ?",
    )
      .bind(id)
      .first();
    if (!row) return json({ error: "not found" }, cors, 404);
    await env.HISTORY_DB.prepare("DELETE FROM history WHERE id = ?")
      .bind(id)
      .run();
    if (row.audio_key) await env.AUDIO_BUCKET.delete(row.audio_key);
    return json({ ok: true }, cors);
  }

  return json({ error: "not found" }, cors, 404);
}

/** GET /audio/:id?t=<token> — <audio> 标签无法带 header，令牌走 query 参数 */
export async function handleAudio(request, env, cors, url) {
  const match = url.pathname.match(/^\/audio\/([a-z0-9]+)$/);
  if (!match || request.method !== "GET") {
    return json({ error: "not found" }, cors, 404);
  }
  const row = await env.HISTORY_DB.prepare(
    "SELECT audio_key FROM history WHERE id = ?",
  )
    .bind(match[1])
    .first();
  if (!row) return json({ error: "not found" }, cors, 404);
  const obj = await env.AUDIO_BUCKET.get(row.audio_key);
  if (!obj) return json({ error: "audio missing" }, cors, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "audio/wav",
      "Content-Length": String(obj.size),
      "Cache-Control": "private, max-age=86400",
      ...cors,
    },
  });
}
