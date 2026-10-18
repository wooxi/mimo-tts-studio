/**
 * POST /api/tts — the only synthesis path.
 *
 * The API key lives in a Worker secret; the browser never sees it and there is
 * no direct-connect mode. The body is validated, then forwarded untouched so
 * streaming stays streaming.
 */

import { CODES, HttpError, readJson } from "../lib/http.js";
import { callUpstream, usageOf } from "../lib/upstream.js";
import { recordUsage } from "../lib/db.js";

const MODELS = new Set([
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
]);

const FORMATS = new Set(["wav", "mp3", "pcm", "pcm16", "pcm16le"]);

/** Base64 of a 10MB sample plus the data: prefix — upstream's documented cap. */
const MAX_VOICE_CHARS = 14 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const BODY_LIMIT = 20 * 1024 * 1024;

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(CODES.BAD_REQUEST, "请求体必须是 JSON 对象", 400);
  }
  if (!MODELS.has(body.model)) {
    throw new HttpError(
      CODES.BAD_REQUEST,
      `未知模型 ${body.model}。可用：${[...MODELS].join(", ")}`,
      400,
    );
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new HttpError(CODES.BAD_REQUEST, "messages 不能为空", 400);
  }
  if (body.messages.length > 12) {
    throw new HttpError(CODES.BAD_REQUEST, "messages 过多", 400);
  }

  let chars = 0;
  for (const m of body.messages) {
    if (m?.role !== "user" && m?.role !== "assistant") {
      throw new HttpError(CODES.BAD_REQUEST, `不支持的角色 ${m?.role}`, 400);
    }
    if (typeof m.content !== "string") {
      throw new HttpError(CODES.BAD_REQUEST, "message.content 必须是字符串", 400);
    }
    if (m.content.length > MAX_TEXT_CHARS) {
      throw new HttpError(
        CODES.PAYLOAD_TOO_LARGE,
        `单条消息超过 ${MAX_TEXT_CHARS} 字，请分段合成`,
        413,
      );
    }
    if (m.role === "assistant") chars += m.content.length;
  }

  const audio = body.audio;
  if (audio == null || typeof audio !== "object" || Array.isArray(audio)) {
    throw new HttpError(CODES.BAD_REQUEST, "缺少 audio 参数", 400);
  }
  if (audio.format != null && !FORMATS.has(audio.format)) {
    throw new HttpError(CODES.BAD_REQUEST, `不支持的格式 ${audio.format}`, 400);
  }
  if (typeof audio.voice === "string" && audio.voice.length > MAX_VOICE_CHARS) {
    throw new HttpError(
      CODES.PAYLOAD_TOO_LARGE,
      "音频样本过大：Base64 后不得超过 10MB",
      413,
    );
  }
  if (body.stream != null && typeof body.stream !== "boolean") {
    throw new HttpError(CODES.BAD_REQUEST, "stream 必须是布尔值", 400);
  }

  return { chars, stream: body.stream === true };
}

export async function handleTts(request, env, ctx, cors) {
  const t0 = Date.now();
  const body = await readJson(request, BODY_LIMIT);
  const { chars, stream } = validate(body);

  let upstream;
  try {
    upstream = await callUpstream(env, body, { ctx });
  } catch (e) {
    recordUsage(
      env.HISTORY_DB,
      {
        model: body.model,
        ok: false,
        status: e.status,
        ms: Date.now() - t0,
        chars,
        errorCode: e.code || CODES.UPSTREAM_ERROR,
      },
      ctx,
    );
    throw e;
  }

  const headers = {
    ...cors,
    "Content-Type":
      upstream.headers.get("Content-Type") ||
      (stream ? "text/event-stream; charset=utf-8" : "application/json"),
    "Cache-Control": "no-store",
  };

  if (stream) {
    return new Response(
      tapStream(upstream.body, env, ctx, { model: body.model, chars, t0 }),
      { status: 200, headers },
    );
  }

  const text = await upstream.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* upstream said ok but sent something unparseable — pass it through */
  }

  const audioB64 = parsed?.choices?.[0]?.message?.audio?.data;
  recordUsage(
    env.HISTORY_DB,
    {
      model: body.model,
      ok: true,
      status: upstream.status,
      ms: Date.now() - t0,
      chars,
      audioBytes: audioB64 ? Math.floor((audioB64.length * 3) / 4) : 0,
      tokens: usageOf(parsed),
    },
    ctx,
  );

  return new Response(text, { status: upstream.status, headers });
}

/**
 * Count audio bytes and lift the trailing `usage` object out of an SSE body
 * without buffering the audio — the client still receives every chunk as it
 * arrives.
 *
 * Usage is recorded exactly once, on whichever of {done, cancel, error} fires
 * first. A cancelled run is still a billed upstream call, so it must not
 * vanish from the stats.
 */
function tapStream(source, env, ctx, meta) {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let bytes = 0; // decoded audio bytes, matching the non-streaming branch
  let tail = "";
  let tokens = null;
  let errored = null;
  let finished = false;

  const finish = (errorCode = null) => {
    if (finished) return;
    finished = true;
    recordUsage(
      env.HISTORY_DB,
      {
        model: meta.model,
        ok: !errorCode,
        status: errorCode ? 502 : 200,
        ms: Date.now() - meta.t0,
        chars: meta.chars,
        audioBytes: bytes,
        tokens,
        errorCode,
      },
      ctx,
    );
  };

  return new ReadableStream({
    async pull(controller) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        finish(CODES.UPSTREAM_ERROR);
        controller.error(e);
        return;
      }

      const { done, value } = chunk;
      if (done) {
        finish(errored);
        controller.close();
        return;
      }

      const text = decoder.decode(value, { stream: true });
      tail = (tail + text).slice(-8192);

      // Count only the base64 payload, so the figure is comparable with the
      // non-streaming branch's decoded byte count.
      for (const m of text.matchAll(/"data"\s*:\s*"([A-Za-z0-9+/=]*)"/g)) {
        bytes += Math.floor((m[1].length * 3) / 4);
      }

      const tk = tail.match(/"total_tokens"\s*:\s*(\d+)/);
      if (tk) tokens = Number(tk[1]);

      // An upstream error arrives as an SSE event; only a well-formed one is
      // trusted, so a script that merely contains the word cannot trip it.
      const err = tail.match(/\{\s*"error"\s*:\s*\{/);
      if (err) errored = CODES.UPSTREAM_ERROR;

      controller.enqueue(value);
    },
    cancel(reason) {
      finish("client_cancelled");
      return reader.cancel(reason);
    },
  });
}
