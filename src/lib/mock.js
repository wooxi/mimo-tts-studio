/**
 * Local fake upstream — enabled only when the MIMO_MOCK var is "1".
 *
 * It produces genuinely valid WAV/SSE payloads rather than stubs, so the whole
 * pipeline (base64 decode, PCM16 assembly, WAV header wrap, waveform decode,
 * history upload, R2 playback, Range requests) can be exercised end to end
 * without an API key and without spending quota.
 *
 * The synthesised audio is a burst of tones whose length follows the text, so
 * duration, seeking and the progress bar all behave like the real thing.
 */

const SAMPLE_RATE = 24000;

/* --------------------------------------------------------------- waveform -- */

/** A short "spoken" burst: a few formant-ish tones under a soft envelope. */
function synthPcm(text, seconds) {
  const n = Math.max(SAMPLE_RATE * 0.4, Math.floor(SAMPLE_RATE * seconds));
  const out = new Int16Array(n);
  const seed = [...String(text)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = 110 + (seed % 90);

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // syllable-ish amplitude gating so it looks like speech in the waveform
    const syl = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3.1 + seed);
    const gate = Math.pow(syl, 3);
    // word-level envelope with silence between phrases
    const word = Math.max(0, Math.sin(t * Math.PI * 2 * 0.55 + seed * 0.7));
    const env = gate * word * (1 - Math.exp(-t * 24)) * Math.exp(-t * 0.25);

    const v =
      0.6 * Math.sin(2 * Math.PI * base * t) +
      0.25 * Math.sin(2 * Math.PI * base * 2.4 * t + 0.6) +
      0.15 * Math.sin(2 * Math.PI * base * 3.7 * t + 1.9);

    out[i] = Math.max(-1, Math.min(1, v * env * 0.7)) * 32767;
  }
  return new Uint8Array(out.buffer);
}

/** 44-byte RIFF header + PCM data, mono 16-bit LE at 24 kHz. */
export function pcmToWav(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buf);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  const byteRate = SAMPLE_RATE * 2;
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

function toBase64(bytes) {
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

/* ------------------------------------------------------------------ reply -- */

const SECONDS_PER_CHAR = 0.16;

function spokenText(body) {
  const msgs = body?.messages || [];

  // ASR sends a user message whose content is an array of input_audio parts
  // and has no assistant turn at all — without this branch the mock returned
  // an empty transcript and "transcribe the sample" was untestable locally.
  if (body?.model && /-asr\b/.test(body.model)) {
    return "这是一段由本地假上游生成的识别结果，用于在没有真实密钥时验证识别链路。";
  }

  const assistant = msgs.filter((m) => m.role === "assistant").pop();
  return String(assistant?.content || "").slice(0, 4000);
}

function requestedFormat(body) {
  const f = body?.audio?.format;
  if (body?.stream) return "pcm16";
  return f === "mp3" || f === "pcm" ? f : "wav";
}

export function mockResponse(body) {
  const text = spokenText(body);
  const id = "mock-" + Math.random().toString(36).slice(2, 10);

  // ASR returns text, not audio.
  if (body?.model && /-asr\b/.test(body.model)) {
    return new Response(
      JSON.stringify({
        id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
        usage: { prompt_tokens: 0, completion_tokens: 24, total_tokens: 24 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const seconds = Math.min(30, Math.max(1, text.length * SECONDS_PER_CHAR));
  const pcm = synthPcm(text, seconds);

  if (body?.stream) {
    return streamResponse(id, pcm, pcm.length);
  }

  const format = requestedFormat(body);
  const bytes = format === "wav" ? pcmToWav(pcm) : pcm;
  const mime = format === "mp3" ? "audio/mpeg" : "audio/wav";

  const payload = {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body?.model || "mock",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: text,
          audio: {
            id,
            data: toBase64(bytes),
            expires_at: null,
            transcript: null,
            mime,
          },
          ...(body?.audio?.optimize_text_preview
            ? { final_text_preview: `【模拟润色】${text}` }
            : {}),
        },
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: Math.round(text.length * 1.6),
      total_tokens: Math.round(text.length * 1.6),
      completion_tokens_details: { reasoning_tokens: 0 },
      prompt_tokens_details: { cached_tokens: 0 },
    },
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** SSE that actually trickles, so streaming UI can be observed for real. */
function streamResponse(id, pcm, total) {
  const CHUNK = 4800; // 100ms of 24kHz mono PCM16
  const created = Math.floor(Date.now() / 1000);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({
        id,
        object: "chat.completion.chunk",
        created,
        model: "mock",
        choices: [{ index: 0, delta: { role: "assistant", content: "" } }],
      });

      for (let off = 0; off < total; off += CHUNK) {
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model: "mock",
          choices: [
            {
              index: 0,
              delta: {
                audio: {
                  id,
                  data: toBase64(pcm.subarray(off, Math.min(off + CHUNK, total))),
                },
              },
            },
          ],
        });
        await new Promise((r) => setTimeout(r, 18));
      }

      send({
        id,
        object: "chat.completion.chunk",
        created,
        model: "mock",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { total_tokens: Math.round(total / 320) },
      });
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}
