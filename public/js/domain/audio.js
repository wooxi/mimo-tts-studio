/**
 * Audio utilities — everything runs in the browser, so nothing here costs a
 * round trip.
 *
 * The upstream returns 24 kHz mono 16-bit LE PCM when streaming, and a
 * container (wav/mp3) otherwise. Both shapes are handled: PCM is assembled
 * client-side into a real WAV, containers are passed through untouched.
 */

import { SAMPLE_RATE } from "./models.js";

/* ------------------------------------------------------------------ base64 -- */

export function bytesToBase64(bytes) {
  let s = "";
  const CHUNK = 0x8000;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** File → `data:<mime>;base64,…`, the shape `audio.voice` expects. */
export async function fileToDataUrl(file) {
  const buf = await file.arrayBuffer();
  const mime = file.type || (/(\.mp3)$/i.test(file.name) ? "audio/mpeg" : "audio/wav");
  return `data:${mime};base64,${bytesToBase64(new Uint8Array(buf))}`;
}

/** Decoded byte count of a data: URL, without allocating the bytes. */
export function dataUrlBytes(url) {
  const comma = String(url || "").indexOf(",");
  if (comma < 0) return 0;
  const n = url.length - comma - 1;
  const pad = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
  return Math.floor((n * 3) / 4) - pad;
}

/* --------------------------------------------------------------------- wav -- */

/** Wrap raw PCM16LE mono in a canonical 44-byte RIFF header. */
export function pcmToWav(pcm, sampleRate = SAMPLE_RATE, channels = 1) {
  const bits = 16;
  const blockAlign = (channels * bits) / 8;
  const buf = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buf);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  str(36, "data");
  view.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);

  return new Uint8Array(buf);
}

/**
 * Read a WAV header. Also used to learn the real sample rate, which the docs
 * never state for container output — the UI reports what actually arrived
 * instead of assuming.
 */
export function wavInfo(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44) return null;
  const tag = (off) =>
    String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let off = 12;
  let fmt = null;
  let dataSize = 0;

  while (off + 8 <= view.byteLength) {
    const id = tag(off);
    const size = view.getUint32(off + 4, true);
    if (id === "fmt ") {
      fmt = {
        channels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        bits: view.getUint16(off + 22, true),
      };
    } else if (id === "data") {
      dataSize = Math.min(size, view.byteLength - off - 8);
    }
    off += 8 + size + (size % 2);
  }

  if (!fmt) return null;
  const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bits / 8);
  return { ...fmt, dataSize, duration: bytesPerSec ? dataSize / bytesPerSec : 0 };
}

/**
 * Duration for any container. WAV is read from its header; MP3 is estimated
 * from the frame count only as a fallback, and unknown shapes return 0 so the
 * UI can show "—" rather than a wrong number.
 */
export function durationOf(buffer, mime = "") {
  const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  if (/wav|wave|x-wav/i.test(mime) || looksLikeWav(bytes)) {
    const info = wavInfo(bytes);
    if (info?.duration) return info.duration;
  }
  // MP3: 128kbps is the safe middle for a duration *estimate*; if the first
  // frame header is readable we use its real bitrate instead.
  if (/mpeg|mp3/i.test(mime) || looksLikeMp3(bytes)) {
    const br = mp3Bitrate(bytes);
    if (br) return (bytes.byteLength * 8) / br;
  }
  return 0;
}

function looksLikeWav(buf) {
  if (buf.byteLength < 12) return false;
  const v = new DataView(buf);
  return v.getUint32(0, false) === 0x52494646 && v.getUint32(8, false) === 0x57415645;
}

function looksLikeMp3(buf) {
  if (buf.byteLength < 2) return false;
  const v = new DataView(buf);
  return v.getUint16(0, false) === 0xfffb || v.getUint16(0, false) === 0xfff3;
}

const MP3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];

function mp3Bitrate(buf) {
  const v = new DataView(buf);
  for (let i = 0; i + 4 <= Math.min(buf.byteLength, 4096); i++) {
    if (v.getUint8(i) !== 0xff) continue;
    const b1 = v.getUint8(i + 1);
    if ((b1 & 0xe0) !== 0xe0) continue;
    const idx = (v.getUint8(i + 2) >> 4) & 0x0f;
    const kbps = MP3_BITRATES[idx];
    if (kbps) return kbps * 1000;
  }
  return 128000;
}

/* ------------------------------------------------------------------ concat -- */

export function concatBytes(list) {
  const total = list.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of list) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/* ------------------------------------------------------------------- peaks -- */

/**
 * Reduce samples to N normalised magnitudes for drawing.
 * Accepts either an AudioBuffer or raw PCM16 bytes.
 */
export function peaks(source, count, { channels } = {}) {
  let data;
  if (source instanceof AudioBuffer) {
    data = source.getChannelData(0);
  } else {
    const u8 = source instanceof Uint8Array ? source : new Uint8Array(source);
    const n = Math.floor(u8.length / 2);
    const view = new DataView(u8.buffer, u8.byteOffset, n * 2);
    data = new Float32Array(n);
    for (let i = 0; i < n; i++) data[i] = view.getInt16(i * 2, true) / 32768;
  }

  const out = new Float32Array(count);
  if (!data.length) return out;
  const step = data.length / count;

  let max = 1e-6;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(data.length, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = start; j < end; j++) sum += Math.abs(data[j]);
    const v = end > start ? sum / (end - start) : 0;
    out[i] = v;
    if (v > max) max = v;
  }
  for (let i = 0; i < count; i++) out[i] = out[i] / max;

  void channels;
  return out;
}

/* ------------------------------------------------------------------ decode -- */

let audioCtx = null;
export function context() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Decode for waveform drawing; returns null when the browser cannot. */
export async function decode(buffer) {
  const ctx = context();
  if (!ctx) return null;
  try {
    return await ctx.decodeAudioData(buffer.slice(0));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ object -- */

const urls = new Set();

export function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return url;
}

export function revoke(url) {
  if (url && urls.has(url)) {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }
}

/** Extension + mime for a blob we are about to download or upload. */
export function blobMeta(format) {
  if (format === "mp3") return { ext: "mp3", mime: "audio/mpeg" };
  if (format === "pcm16" || format === "pcm") return { ext: "pcm", mime: "audio/wav" };
  return { ext: "wav", mime: "audio/wav" };
}
