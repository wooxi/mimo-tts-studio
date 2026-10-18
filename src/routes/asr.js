/**
 * POST /api/asr — speech recognition via mimo-v2.5-asr.
 *
 * Used by the studio to read a VoiceClone sample back to the user ("is this
 * actually clean speech?") and to transcribe an existing take into an editable
 * script. Same endpoint as TTS, different model.
 */

import { CODES, HttpError, readJson } from "../lib/http.js";
import { callUpstream } from "../lib/upstream.js";
import { recordUsage } from "../lib/db.js";

const LANGS = new Set(["auto", "zh", "en"]);
const BODY_LIMIT = 16 * 1024 * 1024;

export async function handleAsr(request, env, ctx, cors) {
  const body = await readJson(request, BODY_LIMIT);
  const data = body?.data;
  const language = LANGS.has(body?.language) ? body.language : "auto";

  if (typeof data !== "string" || !data) {
    throw new HttpError(CODES.BAD_REQUEST, "缺少音频数据", 400);
  }
  if (!/^data:audio\/(wav|mpeg|mp3|x-wav|wave);base64,/.test(data)) {
    throw new HttpError(
      CODES.BAD_REQUEST,
      "仅支持 wav / mp3，且需为 data:<mime>;base64,<data> 形式",
      400,
    );
  }
  if (data.length > BODY_LIMIT) {
    throw new HttpError(CODES.PAYLOAD_TOO_LARGE, "音频过大，Base64 后不得超过 10MB", 413);
  }

  const t0 = Date.now();
  const upstream = await callUpstream(
    env,
    {
      model: "mimo-v2.5-asr",
      messages: [
        {
          role: "user",
          content: [{ type: "input_audio", input_audio: { data } }],
        },
      ],
      asr_options: { language },
    },
    { ctx },
  ).catch((e) => {
    recordUsage(
      env.HISTORY_DB,
      {
        model: "mimo-v2.5-asr",
        ok: false,
        status: e.status,
        ms: Date.now() - t0,
        errorCode: e.code,
      },
      ctx,
    );
    throw e;
  });

  const parsed = await upstream.json().catch(() => null);
  const text = parsed?.choices?.[0]?.message?.content ?? "";

  recordUsage(
    env.HISTORY_DB,
    {
      model: "mimo-v2.5-asr",
      ok: true,
      status: 200,
      ms: Date.now() - t0,
      tokens: Number(parsed?.usage?.total_tokens) || null,
    },
    ctx,
  );

  return new Response(JSON.stringify({ text, usage: parsed?.usage ?? null }), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
