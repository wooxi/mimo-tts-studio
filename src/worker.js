/**
 * MiMo TTS Studio — Cloudflare Worker entry point.
 *
 * Static assets come from ./public with no build step. Everything under
 * /api and /audio is routed here.
 *
 *   GET    /api/health            liveness + what is misconfigured
 *   GET    /api/config            persisted UI state
 *   PUT    /api/config
 *   POST   /api/tts               synthesis proxy (streaming passthrough)
 *   POST   /api/asr               speech recognition
 *   GET    /api/history           take list, filters, signed playback URLs
 *   POST   /api/history           multipart upload (audio + meta)
 *   PATCH  /api/history/:id       { starred }
 *   DELETE /api/history/:id
 *   GET    /api/stats             usage rollup
 *   GET    /api/voices            saved voice library
 *   POST   /api/voices            JSON (designed) or multipart (cloned)
 *   DELETE /api/voices/:id
 *   GET    /audio/:id?exp&sig     R2 playback, signed, Range-capable
 *   GET    /voice/:id?exp&sig     saved clone reference clip
 *
 * Secrets: MIMO_API_KEY (upstream), CONFIG_TOKEN (access; fail-closed).
 * /audio and /voice are exempt from the shared guard because <audio> cannot
 * send headers, so those routes authenticate themselves.
 */

import { CODES, corsHeaders, fail, json, notFound, toResponse } from "./lib/http.js";
import { guard, hasToken } from "./lib/auth.js";
import { ensureSchema, usageSummary } from "./lib/db.js";
import { handleConfig } from "./routes/config.js";
import { handleTts } from "./routes/tts.js";
import { handleAsr } from "./routes/asr.js";
import { handleHistory } from "./routes/history.js";
import { handleAudio } from "./routes/audio.js";
import { handleVoices, handleVoiceSample } from "./routes/voices.js";

/** Headers applied to every HTML document we serve. */
const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "media-src 'self' blob: data:",
    "style-src 'self'",
    "script-src 'self'",
    // blob: is defensive rather than load-bearing: takes are decoded from
    // their Blob directly, and history playback fetches a same-origin signed
    // URL. It is kept so a future code path that reads an object URL back
    // cannot be blocked silently.
    "connect-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=()",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const isApi =
      path.startsWith("/api/") ||
      path.startsWith("/audio/") ||
      path.startsWith("/voice/");
    if (!isApi) return serveAsset(request, env);

    try {
      /* ------------------------------------------------------- health -- */
      if (path === "/api/health") {
        return json(
          {
            ok: true,
            auth: hasToken(env) ? "token" : "unset",
            upstream: Boolean(env.UPSTREAM_URL),
            apiKey: Boolean(env.MIMO_API_KEY),
            mock: env.MIMO_MOCK === "1",
            historyLimit: Number(env.HISTORY_LIMIT || 200),
            maxAudioBytes: Number(env.MAX_AUDIO_BYTES || 26214400),
          },
          200,
          cors,
        );
      }

      /* --------------------------------------------------------- auth -- */
      const blocked = guard(request, env, path);
      if (blocked) return blocked;

      await ensureSchema(env.HISTORY_DB);

      /* ------------------------------------------------------- routes -- */
      if (path === "/api/config") {
        return await handleConfig(request, env, ctx, cors);
      }

      if (path === "/api/tts") {
        if (request.method !== "POST") return methodNotAllowed(cors);
        return await handleTts(request, env, ctx, cors);
      }

      if (path === "/api/asr") {
        if (request.method !== "POST") return methodNotAllowed(cors);
        return await handleAsr(request, env, ctx, cors);
      }

      if (path === "/api/stats") {
        if (request.method !== "GET") return methodNotAllowed(cors);
        const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
        return json(await usageSummary(env.HISTORY_DB, days), 200, cors);
      }

      if (path === "/api/history" || path.startsWith("/api/history/")) {
        const rest = path.slice("/api/history".length);
        return await handleHistory(request, env, ctx, cors, url, rest);
      }

      if (path === "/api/voices" || path.startsWith("/api/voices/")) {
        const rest = path.slice("/api/voices".length);
        return await handleVoices(request, env, ctx, cors, url, rest);
      }

      if (path.startsWith("/audio/")) {
        return await handleAudio(request, env, cors, url);
      }

      if (path.startsWith("/voice/")) {
        return await handleVoiceSample(request, env, cors, url);
      }

      return notFound();
    } catch (err) {
      return toResponse(err, request, env);
    }
  },
};

function methodNotAllowed(cors) {
  return fail(CODES.BAD_REQUEST, "method not allowed", 405, cors);
}

/**
 * Static assets, plus hardening on the document itself. Anything the asset
 * layer misses falls back to index.html so deep links keep working.
 */
async function serveAsset(request, env) {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get("Content-Type") || "";

  if (!type.includes("text/html")) return res;

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}
