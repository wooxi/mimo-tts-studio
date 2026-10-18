/**
 * GET /api/audio/:id — stream a stored take out of R2.
 *
 * Two ways in, because <audio> cannot set headers:
 *   - ?exp=&sig=  HMAC-signed short-lived URL, minted by /api/history
 *   - X-Config-Token  for scripts and for the fetch() that decodes waveforms
 *
 * Range requests are forwarded to R2 so scrubbing and Safari's byte-range
 * probing both work.
 */

import { CODES, HttpError } from "../lib/http.js";
import { hasToken, tokenOk, verifyAudio } from "../lib/auth.js";

const ID_RE = /^[a-z0-9]{8,40}$/;

export async function handleAudio(request, env, cors, url) {
  const id = url.pathname.slice("/audio/".length);
  if (!ID_RE.test(id)) throw new HttpError(CODES.BAD_REQUEST, "非法 id", 400);
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(CODES.BAD_REQUEST, "method not allowed", 405);
  }

  // guard() exempts /audio/* because <audio> cannot send headers, so this
  // route carries its own check — including the not-configured case, which is
  // a server fault (503) and must not be reported as a bad client token.
  if (!hasToken(env)) {
    throw new HttpError(
      CODES.NOT_CONFIGURED,
      "服务端未设置 CONFIG_TOKEN，已拒绝所有请求。请执行：wrangler secret put CONFIG_TOKEN",
      503,
    );
  }

  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const signed = exp && sig && (await verifyAudio(env, id, exp, sig));

  if (!signed && !tokenOk(request, env)) {
    throw new HttpError(CODES.UNAUTHORIZED, "播放链接已过期，请刷新列表", 401);
  }

  const row = await env.HISTORY_DB.prepare(
    "SELECT audio_key FROM history WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!row) throw new HttpError(CODES.NOT_FOUND, "记录不存在", 404);

  const range = request.headers.get("Range");
  const parsed = range ? parseRange(range) : null;
  const obj = await env.AUDIO_BUCKET.get(
    row.audio_key,
    parsed ? { range: parsed } : undefined,
  );
  if (!obj) throw new HttpError(CODES.NOT_FOUND, "音频对象缺失", 404);

  const headers = new Headers({
    ...cors,
    "Content-Type": obj.httpMetadata?.contentType || "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": signed ? "private, max-age=1800" : "private, no-store",
    ETag: obj.httpEtag,
  });

  // R2Range exposes offset / length / suffix — there is no `end`, and a
  // contrary assumption silently produced Content-Length values that did not
  // match the body.
  if (parsed) {
    const total = obj.size;
    const start = Math.min(obj.range?.offset ?? parsed.offset ?? 0, Math.max(0, total - 1));
    const len =
      obj.range?.length ??
      (obj.range?.suffix != null
        ? Math.min(obj.range.suffix, total)
        : Math.min(parsed.length ?? total - start, total - start));
    const end = start + len - 1;

    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(len));
    return new Response(request.method === "HEAD" ? null : obj.body, {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(obj.size));
  return new Response(request.method === "HEAD" ? null : obj.body, {
    status: 200,
    headers,
  });
}

/**
 * "bytes=0-1023" → an R2Range. Returns null for anything unparseable or out of
 * bounds, so the caller degrades to a normal 200 rather than a wrong 206.
 */
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    const n = Number(b);
    return Number.isFinite(n) && n > 0 ? { suffix: n } : null;
  }
  const offset = Number(a);
  if (!Number.isFinite(offset)) return null;
  if (b === "") return { offset };
  const end = Number(b);
  if (!Number.isFinite(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
}
