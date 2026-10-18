/**
 * Authentication.
 *
 * Two rules, both deliberate:
 *
 *  1. Fail closed. If CONFIG_TOKEN is unset the API refuses to serve at all,
 *     rather than turning the deployment into an open proxy for the account's
 *     MiMo API key. /api/health stays reachable so the UI can explain what to
 *     run.
 *
 *  2. <audio> elements cannot send request headers, so playback uses a short
 *     lived HMAC-signed URL instead of putting the long-lived token in the
 *     query string, where it would leak into logs, Referer and history.
 */

import { CODES, fail } from "./http.js";

const encoder = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Constant-time string compare — avoids leaking the token through timing.
 *
 * Both sides must be non-empty strings. Coercing first (`String(undefined)` →
 * "undefined") let a request carrying the literal header `X-Config-Token:
 * undefined` match an unset secret.
 */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!a.length || !b.length) return false;
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmacKey(env) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.CONFIG_TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Signature over "<scope>.<id>.<exp>".
 *
 * The scope is part of the signed material so a link minted for a history take
 * cannot be replayed against a saved voice clip, even though both are keyed by
 * the same kind of opaque id. Returns null when the deployment has no token,
 * because an empty HMAC key throws and there is nothing meaningful to sign.
 */
export async function signAudio(env, id, exp, scope = "audio") {
  if (!hasToken(env)) return null;
  const key = await hmacKey(env);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${scope}.${id}.${exp}`),
  );
  return b64url(mac);
}

export async function verifyAudio(env, id, exp, sig, scope = "audio") {
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < Date.now()) return false;
  const expect = await signAudio(env, id, e, scope);
  if (!expect) return false;
  return safeEqual(expect, sig);
}

/** Build a playback URL the browser can use directly in <audio src>. */
export async function signedUrl(env, base, id, scope) {
  const ttl = Number(env.AUDIO_URL_TTL || 1800);
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = await signAudio(env, id, exp, scope);
  return sig ? `${base}/${id}?exp=${exp}&sig=${sig}` : `${base}/${id}`;
}

export const audioUrl = (env, id) => signedUrl(env, "/audio", id, "audio");
export const voiceUrl = (env, id) => signedUrl(env, "/voice", id, "voice");

/** Token supplied via header, or — for <audio> only — via signed query. */
export function tokenOk(request, env) {
  if (!hasToken(env)) return false;
  return safeEqual(request.headers.get("X-Config-Token") || "", env.CONFIG_TOKEN);
}

export function hasToken(env) {
  return typeof env.CONFIG_TOKEN === "string" && env.CONFIG_TOKEN.length > 0;
}

/**
 * Guard for /api/*. Returns a Response to short-circuit with, or null to pass.
 *
 * Two exemptions, both load-bearing:
 *   /api/health   so the UI can explain a misconfigured deployment
 *   /audio, /voice  because <audio src> cannot send a request header. Those
 *                 routes authenticate themselves, via the HMAC signature or a
 *                 header — including the not-configured case.
 */
export function guard(request, env, pathname) {
  if (pathname === "/api/health") return null;
  if (pathname.startsWith("/audio/") || pathname.startsWith("/voice/")) return null;

  if (!hasToken(env)) {
    return fail(
      CODES.NOT_CONFIGURED,
      "服务端未配置访问令牌，已拒绝所有请求",
      503,
    );
  }
  if (!tokenOk(request, env)) {
    return fail(CODES.UNAUTHORIZED, "访问令牌缺失或错误", 401);
  }
  return null;
}
