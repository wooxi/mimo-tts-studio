/**
 * HTTP helpers — one response shape for the whole API.
 *
 * Every failure leaves as:
 *   { "error": { "code": "...", "message": "...", "retryable": false } }
 * so the client never has to guess whether a body is JSON, text, or HTML.
 */

/** Machine-readable failure codes. The client maps these to Chinese copy. */
export const CODES = {
  BAD_REQUEST: "bad_request",
  UNAUTHORIZED: "unauthorized",
  NOT_CONFIGURED: "not_configured",
  NOT_FOUND: "not_found",
  PAYLOAD_TOO_LARGE: "payload_too_large",
  UPSTREAM_ERROR: "upstream_error",
  UPSTREAM_RATE_LIMITED: "upstream_rate_limited",
  UPSTREAM_FILTERED: "upstream_filtered",
  UPSTREAM_BALANCE: "upstream_balance",
  UPSTREAM_REGION: "upstream_region",
  UPSTREAM_TIMEOUT: "upstream_timeout",
  INTERNAL: "internal",
};

/** Failure codes worth retrying as-is. */
export const RETRYABLE = new Set([
  CODES.UPSTREAM_RATE_LIMITED,
  CODES.UPSTREAM_TIMEOUT,
  CODES.UPSTREAM_ERROR,
  CODES.INTERNAL,
]);

/**
 * Cross-origin policy. Empty ALLOWED_ORIGINS means same-origin only, which is
 * what the bundled UI needs — no CORS headers are emitted at all.
 */
export function corsHeaders(request, env) {
  const allow = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allow.length) return {};

  const origin = request.headers.get("Origin");
  if (!origin || !allow.includes(origin)) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type, X-Config-Token",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

export function fail(code, message, status = 400, extra = {}) {
  return json(
    { error: { code, message, retryable: RETRYABLE.has(code) } },
    status,
    extra,
  );
}

export function notFound() {
  return fail(CODES.NOT_FOUND, "not found", 404);
}

/** Body size guard that works without buffering the whole payload. */
export async function readJson(request, limit = 512 * 1024) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > limit) throw new HttpError(CODES.PAYLOAD_TOO_LARGE, "body too large", 413);
  const text = await request.text();
  if (text.length > limit) {
    throw new HttpError(CODES.PAYLOAD_TOO_LARGE, "body too large", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(CODES.BAD_REQUEST, "invalid json body", 400);
  }
}

export class HttpError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Turn anything thrown inside a route into the standard failure shape. */
export function toResponse(err, request, env) {
  const extra = corsHeaders(request, env);
  if (err instanceof HttpError) {
    return fail(err.code, err.message, err.status, extra);
  }
  console.error("unhandled:", err?.stack || err);
  return fail(CODES.INTERNAL, String(err?.message || err), 500, extra);
}
