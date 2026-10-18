/**
 * Synthesis engine.
 *
 * Owns everything between "the button was pressed" and "here are N finished
 * takes": payload compilation, multi-take fan-out, long-script segmentation,
 * SSE assembly, concatenation, cancellation and history upload.
 *
 * Progress is reported through a single `on(event)` callback so the UI never
 * has to poll.
 */

import { stream as streamPost, post, upload } from "./core/api.js";
import { buildPayload, inspect, composeScript } from "./domain/payload.js";
import { modelOf, LIMITS, SAMPLE_RATE } from "./domain/models.js";
import { splitScript } from "./domain/segment.js";
import {
  base64ToBytes,
  bytesToBase64,
  concatBytes,
  pcmToWav,
  objectUrl,
  revoke,
  blobMeta,
} from "./domain/audio.js";

const newBatchId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function createSynth({ getState, on }) {
  let controller = null;
  let running = false;

  function cancel() {
    if (controller) controller.abort();
    controller = null;
  }

  async function run() {
    if (running) return null;
    const state = getState();

    const verdict = inspect(state);
    if (!verdict.ok) {
      on({ type: "invalid", problems: verdict.problems, warnings: verdict.warnings });
      return null;
    }

    const model = modelOf(state.model);
    let script = composeScript(state.text);

    // ---- segmentation ------------------------------------------------------
    let segments = [script];
    if (state.autoSplit && script.length > LIMITS.segmentAt) {
      segments = splitScript(script, LIMITS.segmentAt);
    } else if (script.length > LIMITS.hardChars) {
      on({
        type: "invalid",
        problems: [`台词 ${script.length} 字，超过 ${LIMITS.hardChars} 字上限，请开启自动分段`],
        warnings: [],
      });
      return null;
    }

    const multi = segments.length > 1;
    // With segmentation each take already costs N requests; stacking takes on
    // top multiplies the bill without adding much, so it is capped at one.
    let takes = Math.max(1, Math.min(Number(state.takes) || 1, 3));
    if (multi && takes > 1) {
      takes = 1;
      on({ type: "notice", message: "已启用自动分段，本次只生成 1 条" });
    }

    running = true;
    controller = new AbortController();
    const signal = controller.signal;
    const batchId = newBatchId();
    const started = Date.now();

    on({
      type: "start",
      takes,
      segments: segments.length,
      model: state.model,
      total: segments.reduce((n, s) => n + s.length, 0),
    });

    const results = [];
    let cancelled = false;

    try {
      for (let t = 0; t < takes; t++) {
        on({ type: "take-start", index: t });

        const pcmParts = [];
        let finalText = null;
        let tokens = null;
        let containerBlob = null;
        let containerFormat = state.format;
        let done = 0;

        for (let s = 0; s < segments.length; s++) {
          if (signal.aborted) throw new DOMException("aborted", "AbortError");

          const payload = buildPayload(state, segments[s]);

          // Joining segments requires raw PCM16, and requesting PCM16 requires
          // asking upstream for a stream. Without this the request would go out
          // as JSON while the client waited for SSE, and every segmented run
          // would fail with "no audio received".
          const useStream = state.stream || multi;
          if (useStream) {
            payload.stream = true;
            payload.audio.format = "pcm16";
          }

          const label =
            segments.length > 1
              ? `第 ${s + 1}/${segments.length} 段`
              : `第 ${t + 1}/${takes} 条`;

          if (useStream) {
            const out = await synthesizeStream(payload, signal, (bytes) => {
              on({
                type: "progress",
                index: t,
                segIndex: s,
                segments: segments.length,
                label,
                bytes,
                seconds: bytes / 2 / SAMPLE_RATE,
              });
            });
            pcmParts.push(out.pcm);
            done += out.pcm.length;
            if (out.finalText) finalText = out.finalText;
            if (out.tokens) tokens = out.tokens;
          } else {
            const out = await synthesizeOnce(payload, signal);
            containerBlob = out.blob;
            containerFormat = out.format;
            if (out.finalText) finalText = out.finalText;
            if (out.tokens) tokens = out.tokens;
            on({
              type: "progress",
              index: t,
              segIndex: s,
              segments: segments.length,
              label,
              bytes: out.blob.size,
              seconds: out.duration,
            });
          }
        }

        let blob;
        let format;
        let pcm = null;

        if (pcmParts.length) {
          pcm = concatBytes(pcmParts);
          blob = new Blob([pcmToWav(pcm)], { type: "audio/wav" });
          format = "wav";
        } else {
          blob = containerBlob;
          format = containerFormat;
        }

        const result = {
          index: t,
          batchId,
          blob,
          format,
          pcm,
          finalText,
          tokens,
          segments: segments.length,
          size: blob.size,
          url: objectUrl(blob),
          ms: Date.now() - started,
        };
        results.push(result);
        on({ type: "take-done", result });

        // Persist immediately so a later take failing cannot lose this one.
        result.historyId = await save(result, state).catch(() => null);
      }

      on({ type: "done", results, cancelled: false, ms: Date.now() - started });
      return results;
    } catch (err) {
      if (err?.name === "AbortError") {
        cancelled = true;
        on({ type: "done", results, cancelled: true, ms: Date.now() - started });
        return results;
      }
      on({ type: "error", error: err, results });
      return results;
    } finally {
      running = false;
      controller = null;
    }
  }

  /* ------------------------------------------------------------ transports -- */

  /** Non-streaming: one JSON response, audio as base64 in the message. */
  async function synthesizeOnce(payload, signal) {
    const data = await post("/api/tts", payload, { signal });
    const message = data?.choices?.[0]?.message;
    const b64 = message?.audio?.data;
    if (!b64) {
      const reason = data?.choices?.[0]?.finish_reason;
      throw new Error(
        reason === "content_filter"
          ? "内容被上游安全策略拦截"
          : "响应中没有音频数据",
      );
    }

    const bytes = base64ToBytes(b64);
    const mime = message.audio.mime || guessMime(payload.audio.format);
    const blob = new Blob([bytes], { type: mime });
    return {
      blob,
      format: payload.audio.format,
      duration: durationFromBlob(blob, bytes, payload.audio.format),
      finalText: message.final_text_preview || null,
      tokens: Number(data?.usage?.total_tokens) || null,
    };
  }

  /** Streaming: assemble PCM16 chunks, keep every byte already received. */
  async function synthesizeStream(payload, signal, onProgress) {
    const res = await streamPost("/api/tts", payload, { signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const parts = [];
    let received = 0;
    let buffer = "";
    let finalText = null;
    let tokens = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const body = trimmed.slice(5).trim();
        if (!body || body === "[DONE]") continue;

        let chunk;
        try {
          chunk = JSON.parse(body);
        } catch {
          continue;
        }

        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.final_text_preview) finalText = delta.final_text_preview;
        if (chunk?.usage?.total_tokens) tokens = Number(chunk.usage.total_tokens);

        const b64 = delta?.audio?.data;
        if (!b64) continue;

        const bytes = base64ToBytes(b64);
        parts.push(bytes);
        received += bytes.length;
        onProgress?.(received);
      }
    }

    if (!parts.length) {
      const err = new Error("流式响应中没有收到音频数据");
      err.code = "empty_stream";
      throw err;
    }

    return { pcm: concatBytes(parts), finalText, tokens, bytes: received };
  }

  /* --------------------------------------------------------------- history -- */

  async function save(result, state) {
    const model = modelOf(state.model);
    const { ext } = blobMeta(result.format);
    const spec = {
      model: state.model,
      voice: model.caps.presetVoices ? state.voice : "",
      voiceDesign: state.voiceDesign || "",
      style: state.style || "",
      director: { ...state.director },
      singing: /(唱歌|singing|\bsing\b)/i.test(state.text),
      optimize: Boolean(state.optimize),
      autoSplit: Boolean(state.autoSplit),
      // The format the user asked for, kept alongside the one that was
      // actually produced — streaming and segmentation override it.
      requestedFormat: state.format,
      format: result.format,
      cloneName: state.cloneName || "",
    };

    const form = new FormData();
    form.append(
      "audio",
      new File([result.blob], `take-${result.index + 1}.${ext}`, {
        type: result.blob.type,
      }),
    );
    form.append(
      "meta",
      JSON.stringify({
        model: state.model,
        voice: model.caps.presetVoices ? state.voice : spec.cloneName,
        format: result.format,
        style: state.style || "",
        text: state.text,
        duration: result.duration ?? durationFromBlob(result.blob, null, result.format),
        batchId: result.batchId,
        takeIndex: result.index,
        spec,
        tokens: result.tokens,
      }),
    );

    const out = await upload("/api/history", form);
    return out?.id || null;
  }

  return { run, cancel, get running() { return running; } };
}

/* ------------------------------------------------------------------ helpers -- */

function guessMime(format) {
  if (format === "mp3") return "audio/mpeg";
  return "audio/wav";
}

function durationFromBlob(blob, bytes, format) {
  if (format === "mp3") return bytes ? (bytes.length * 8) / 128000 : 0;
  const size = bytes ? bytes.length : blob.size;
  return size > 44 ? (size - 44) / 2 / SAMPLE_RATE : 0;
}

export { revoke };
