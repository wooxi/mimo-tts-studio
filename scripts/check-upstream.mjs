/**
 * Real-upstream check.
 *
 * Everything in the other suites runs against a fake upstream, so a handful of
 * behaviours were never confirmed against the real MiMo API — they were
 * inferred from the docs and marked as such. This script closes that gap: it
 * drives a local harness with the mock off, so requests go through the real
 * Worker code to the real endpoint.
 *
 * Setup (the key is read from .dev.vars, never from the command line):
 *
 *   echo MIMO_API_KEY=your-key > .dev.vars
 *   MIMO_MOCK=0 node scripts/local-harness.mjs      # in one terminal
 *   node scripts/check-upstream.mjs                 # in another
 *
 * It makes five short paid calls. Keep the texts short.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BASE = (process.env.BASE || "http://127.0.0.1:8787").replace(/\/$/, "");

function readDevVars() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(ROOT, ".dev.vars"), "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const DEV = readDevVars();
const TOKEN = process.env.CONFIG_TOKEN ?? DEV.CONFIG_TOKEN ?? "devtoken";
const H = { "X-Config-Token": TOKEN, "Content-Type": "application/json" };

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
const fact = (label, value) => console.log(`  ·    ${label}: ${value}`);

const tts = (body) =>
  fetch(`${BASE}/api/tts`, { method: "POST", headers: H, body: JSON.stringify(body) });

const b64ToBytes = (b64) => Buffer.from(b64, "base64");

/** Minimal RIFF/WAVE header reader — enough to report the real format. */
function wavInfo(buf) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return null;
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const bytesPerSec = buf.readUInt32LE(28);
  const seconds = bytesPerSec ? (buf.length - 44) / bytesPerSec : 0;
  return { channels, sampleRate, bits, seconds: +seconds.toFixed(2), bytes: buf.length };
}

const health = await (await fetch(`${BASE}/api/health`)).json();
console.log(`real-upstream check  →  ${BASE}`);
console.log(`mock=${health.mock}  auth=${health.auth}  ready=${health.ready}\n`);

if (health.mock !== false) {
  console.error("The harness is still on the mock upstream. Start it with MIMO_MOCK=0.");
  process.exit(2);
}

/* ------------------------------------------------ 1. preset voice, wav --- */

console.log("1. preset-voice synthesis (wav)");

const t0 = Date.now();
const wavRes = await tts({
  model: "mimo-v2.5-tts",
  messages: [{ role: "assistant", content: "测试。" }],
  audio: { voice: "冰糖", format: "wav" },
});
const wavMs = Date.now() - t0;
const wavBody = await wavRes.json();

console.log(`  ·    latency: ${wavMs} ms`);
if (wavBody?.choices?.[0]?.message?.audio?.data) {
  const info = wavInfo(b64ToBytes(wavBody.choices[0].message.audio.data));
  if (info) {
    fact("sample rate", `${info.sampleRate} Hz`);
    fact("channels", info.channels);
    fact("bit depth", `${info.bits}-bit`);
    fact("duration", `${info.seconds}s`);
    fact("bytes", info.bytes);
    check("the real wav is 24 kHz mono 16-bit", info.sampleRate === 24000 && info.channels === 1 && info.bits === 16, JSON.stringify(info));
  } else {
    fact("body", "not a RIFF/WAVE container");
  }
  fact("usage", JSON.stringify(wavBody.usage ?? null));
  check("preset-voice synthesis returns audio", true);
} else {
  check("preset-voice synthesis returns audio", false, JSON.stringify(wavBody).slice(0, 240));
}

/* ------------------------------------------------------- 2. mp3 format --- */

console.log("\n2. mp3 output");

const mp3Res = await tts({
  model: "mimo-v2.5-tts",
  messages: [{ role: "assistant", content: "测试。" }],
  audio: { voice: "冰糖", format: "mp3" },
});
const mp3Body = await mp3Res.json();
const mp3B64 = mp3Body?.choices?.[0]?.message?.audio?.data;
if (mp3B64) {
  const buf = b64ToBytes(mp3B64);
  const isId3 = buf.toString("ascii", 0, 3) === "ID3";
  const frameSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
  fact("first bytes", buf.subarray(0, 4).toString("hex"));
  fact("container", isId3 ? "ID3-tagged" : frameSync ? "raw MPEG frame" : "unknown");
  fact("bytes", buf.length);
  check("mp3 output is not a wav", buf.toString("ascii", 0, 4) !== "RIFF");
} else {
  check("mp3 output is not a wav", false, JSON.stringify(mp3Body).slice(0, 240));
}

/* -------------------------------------------------------- 3. streaming --- */

console.log("\n3. streaming (pcm16)");

const streamRes = await tts({
  model: "mimo-v2.5-tts",
  messages: [{ role: "assistant", content: "第一句。第二句。" }],
  audio: { voice: "冰糖", format: "pcm16" },
  stream: true,
});
check("streaming responds 200", streamRes.status === 200, `status ${streamRes.status}`);
fact("content-type", streamRes.headers.get("content-type"));

const raw = await streamRes.text();
const events = raw.split("\n\n").filter((s) => s.trim());
fact("sse events", events.length);

const deltas = [];
let dataBytes = 0;
for (const ev of events) {
  const line = ev.split("\n").find((l) => l.startsWith("data:"));
  if (!line) continue;
  const payload = line.slice(5).trim();
  if (payload === "[DONE]") continue;
  let j;
  try {
    j = JSON.parse(payload);
  } catch {
    continue;
  }
  const d = j?.choices?.[0]?.delta ?? j?.choices?.[0]?.message ?? {};
  deltas.push({ keys: Object.keys(d), preview: d.final_text_preview, usage: j.usage });
  if (typeof d.audio?.data === "string") dataBytes += b64ToBytes(d.audio.data).length;
}

const withPreview = deltas.filter((d) => typeof d.preview === "string" && d.preview.length);
const withUsage = deltas.filter((d) => d.usage);
fact("deltas", deltas.length);
fact("delta keys seen", [...new Set(deltas.flatMap((d) => d.keys))].join(", ") || "(none)");
fact("pcm bytes", dataBytes);
fact("deltas carrying final_text_preview", `${withPreview.length} / ${deltas.length}`);
fact("deltas carrying usage", `${withUsage.length} / ${deltas.length}`);

check("the real stream delivers pcm bytes", dataBytes > 0, `${dataBytes} bytes`);
check("usage is emitted at most once per stream", withUsage.length <= 1, `${withUsage.length} deltas`);

/* ------------------------------------- 4. voice design + preview field --- */

console.log("\n4. voice design (optimize_text_preview)");

const vdRes = await tts({
  model: "mimo-v2.5-tts-voicedesign",
  messages: [
    { role: "user", content: "一位嗓音低沉的老年男性，语速缓慢。" },
    { role: "assistant", content: "你好。" },
  ],
  audio: { format: "wav", optimize_text_preview: true },
});
const vdBody = await vdRes.json();
const vdText = vdBody?.choices?.[0]?.message?.content;
fact("response has a content field", typeof vdText === "string" ? `yes (${vdText.length} chars)` : "no");
if (typeof vdText === "string" && vdText.trim()) {
  fact("polished text (first 40)", vdText.trim().slice(0, 40));
}
check("voice design returns audio", Boolean(vdBody?.choices?.[0]?.message?.audio?.data), JSON.stringify(vdBody).slice(0, 240));

/* --------------------------------------------------------------- 5. asr -- */

console.log("\n5. asr");

// Reuse the wav we just made rather than shipping a fixture.
const asrSample = wavBody?.choices?.[0]?.message?.audio?.data;
if (asrSample) {
  const asrRes = await fetch(`${BASE}/api/asr`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ data: `data:audio/wav;base64,${asrSample}` }),
  });
  const asrBody = await asrRes.json();
  fact("status", asrRes.status);
  fact("text", JSON.stringify(asrBody.text ?? null));
  fact("other keys", Object.keys(asrBody).filter((k) => k !== "text").join(", ") || "(none)");
  check("asr returns a string", typeof asrBody.text === "string", JSON.stringify(asrBody).slice(0, 200));
} else {
  check("asr returns a string", false, "no sample audio available from step 1");
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
console.log("\nanything printed above with a `·` is a measured fact — fold the");
console.log("confirmed ones back into docs/mimo-api-reference.md.");
process.exit(fail === 0 ? 0 : 1);
