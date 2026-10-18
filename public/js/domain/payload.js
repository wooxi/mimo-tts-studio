/**
 * Payload compiler.
 *
 * The single place that knows how UI state becomes an API request. Everything
 * else in the app reads or writes state; only this module talks shape.
 *
 * The mapping is the whole design of the product, so it is worth stating
 * plainly — the three layers of the interface are three different fields:
 *
 *   ① voice      → audio.voice          (preset id, or a data: sample)
 *   ② direction  → messages[user]       (natural language, never spoken)
 *   ③ script     → messages[assistant]  (spoken text, carries the tags)
 *
 * Pure functions only: no DOM, no fetch. That makes the "did my style text
 * actually reach the API?" question answerable by reading one file.
 */

import { LIMITS, modelOf } from "./models.js";
import { scanScript, scriptLang } from "./tags.js";

/* ------------------------------------------------------------- composition -- */

/** ② The direction block, assembled from the free-form style and the director. */
export function composeDirection(state) {
  const parts = [];

  const style = String(state.style || "").trim();
  if (style) parts.push(style);

  const d = state.director || {};
  const role = String(d.role || "").trim();
  const scene = String(d.scene || "").trim();
  const guide = String(d.guide || "").trim();

  if (role || scene || guide) {
    const block = [
      role ? `角色：${role}` : "",
      scene ? `场景：${scene}` : "",
      guide ? `指导：${guide}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    parts.push(block);
  }

  return parts.join("\n\n");
}

/**
 * ② for VoiceDesign. That model has exactly one user field and it is the voice
 * description, so the style and director have to be folded in rather than
 * dropped — which is precisely what the previous version did wrong.
 */
export function composeVoiceDesign(state) {
  return [
    String(state.voiceDesign || "").trim(),
    composeDirection(state),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * ③ The spoken text.
 *
 * The singing flag is a real tag, but it only works at position 0 — a stray
 * `(唱歌)` further in is either spoken aloud or ignored. So if one exists and
 * is not already leading, it is pulled to the front.
 *
 * Only bracketed groups are touched. Matching the bare substring "sing" used to
 * corrupt ordinary English ("I want to sing" → "(唱歌)I want to"), so the tag
 * must arrive in brackets to be treated as a tag, and the tag written back
 * matches the script's language.
 */
export function composeScript(text) {
  const t = String(text || "");
  const lead = t.match(/^\s*[(（[\[［【][^)）\]\]］】]*[)）\]］】]/);
  if (lead) return t; // already starts with a tag group — respect the author

  const inline = t.match(/[(（[\[［【]\s*(唱歌|sing|singing)\s*[)）\]］】]/i);
  if (!inline) return t;

  const tag = scriptLang(t) === "en" ? "singing" : "唱歌";
  const body = (t.slice(0, inline.index) + t.slice(inline.index + inline[0].length))
    .trimStart();
  return `(${tag})${body}`;
}

/* ------------------------------------------------------------------ payload -- */

/**
 * Build one request.
 * @param {object} state  app state
 * @param {string} [script] override the spoken text (used by long-text splitting)
 */
export function buildPayload(state, script) {
  const model = state.model;
  const caps = modelOf(model).caps;
  const text = composeScript(script == null ? state.text : script);

  const messages = [];
  const stream = Boolean(state.stream);

  if (model === "mimo-v2.5-tts-voicedesign") {
    // Required by the API, and it is the voice itself.
    messages.push({ role: "user", content: composeVoiceDesign(state) });
  } else {
    const direction = composeDirection(state);
    if (direction) messages.push({ role: "user", content: direction });
  }

  if (text || (model === "mimo-v2.5-tts-voicedesign" && !state.optimize)) {
    messages.push({ role: "assistant", content: text });
  }

  // VoiceClone's documented sample always carries a user turn, even empty.
  if (model === "mimo-v2.5-tts-voiceclone" && !messages.some((m) => m.role === "user")) {
    messages.unshift({ role: "user", content: "" });
  }

  const audio = { format: stream ? "pcm16" : state.format || "wav" };

  if (caps.presetVoices) audio.voice = state.voice || "mimo_default";
  if (caps.voiceClone) audio.voice = state.cloneDataUrl || "";
  if (caps.optimizeText) audio.optimize_text_preview = Boolean(state.optimize);

  const body = { model, messages, audio };
  if (stream) body.stream = true;
  return body;
}

/* ----------------------------------------------------------------- validity -- */

/**
 * Pre-flight check. Returns `{ ok, problems[], warnings[] }` — problems block
 * submission, warnings are things the model will accept but ignore.
 */
export function inspect(state, script) {
  const model = state.model;
  const caps = modelOf(model).caps;
  const text = composeScript(script == null ? state.text : script);
  const problems = [];
  const warnings = [];

  const chars = text.length;
  if (chars > LIMITS.hardChars) {
    problems.push(`台词 ${chars} 字，超过上限 ${LIMITS.hardChars} 字`);
  }

  if (model === "mimo-v2.5-tts-voicedesign") {
    if (!String(state.voiceDesign || "").trim()) {
      problems.push("音色设计需要填写音色描述");
    }
    if (!text && !state.optimize) {
      problems.push("未填台词时需要开启「智能润色文本」");
    }
    if (state.format === "mp3" && state.stream) {
      problems.push("流式输出只能使用 PCM16");
    }
  } else if (model === "mimo-v2.5-tts-voiceclone") {
    if (!state.cloneDataUrl) problems.push("音色克隆需要先上传音频样本");
    if (!text) problems.push("请填写台词");
  } else if (!text) {
    problems.push("请填写台词");
  }

  if (state.stream && !caps.realtimeStream) {
    warnings.push("该模型没有真·低延迟流式，开流式只会拿到一次性结果");
  }

  // Tag-related warnings read the parsed tags, not raw substrings, so ordinary
  // English ("using", "singer") never trips them.
  const tags = scanScript(text);
  const inline = tags.filter((t) => t.kind === "inline");
  if (!caps.inlineTags && inline.length) {
    warnings.push("该模型不支持句内音频标签，括号内容可能被念出来");
  }
  if (!caps.singing && tags.some((t) => t.kind === "sing")) {
    warnings.push("该模型不支持唱歌");
  }

  return { ok: problems.length === 0, problems, warnings, chars };
}

/* ---------------------------------------------------------------- redaction -- */

const VOICE_SAMPLE = /^data:audio\/[a-z0-9.+-]+;base64,/i;

/** Payload shaped for display — the sample is elided, everything else is real. */
export function redact(body) {
  const clone = structuredClone(body);
  const v = clone?.audio?.voice;
  if (typeof v === "string" && VOICE_SAMPLE.test(v)) {
    const bytes = Math.floor(((v.length - v.indexOf(",") - 1) * 3) / 4);
    clone.audio.voice = `data:audio/…;base64,<${(bytes / 1048576).toFixed(2)} MB>`;
  }
  return clone;
}

/** The same request as a copy-pasteable curl, for the inspector panel. */
export function asCurl(body, endpoint = "https://api.xiaomimimo.com/v1/chat/completions") {
  const red = redact(body);
  const lines = [
    `curl -X POST '${endpoint}' \\`,
    `  -H 'api-key: $MIMO_API_KEY' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${JSON.stringify(red, null, 2)}'`,
  ];
  return lines.join("\n");
}

/** Short human summary used in history rows and the inspector header. */
export function summarize(state) {
  const model = modelOf(state.model);
  let voice = "—";
  if (model.caps.presetVoices) voice = state.voice;
  else if (model.caps.voiceClone) voice = state.cloneName || "克隆样本";
  else voice = "文字描述";

  return { model: model.short, voice };
}
