/**
 * API client.
 *
 * Every response goes through one decoder that understands the server's
 * `{ error: { code, message, retryable } }` shape and maps it to an `ApiError`
 * carrying copy the UI can show directly.
 */

const TOKEN_KEY = "mimo_tts_token";

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  },
  set(token) {
    const t = String(token || "").trim();
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode — session-only token */
    }
  },
};

export class ApiError extends Error {
  constructor(message, { code = "internal", status = 0, retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

/** Codes the UI treats specially rather than showing raw. */
export const CODE = {
  UNAUTHORIZED: "unauthorized",
  NOT_CONFIGURED: "not_configured",
  FILTERED: "upstream_filtered",
  RATE_LIMITED: "upstream_rate_limited",
  BALANCE: "upstream_balance",
  REGION: "upstream_region",
};

async function decode(res) {
  const text = await res.text().catch(() => "");
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (res.ok) return body;

  const err = body?.error;
  throw new ApiError(
    err?.message || text.slice(0, 200) || `${res.status} ${res.statusText}`,
    {
      code: err?.code || "http_error",
      status: res.status,
      retryable: Boolean(err?.retryable),
    },
  );
}

export function headers(extra = {}) {
  const h = { ...extra };
  const t = auth.token;
  if (t) h["X-Config-Token"] = t;
  return h;
}

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: headers(opts.headers),
  });
  return decode(res);
}

export const get = (path) => api(path);

/** `opts` is spread first so callers can pass `signal` without losing the
 *  JSON content type, and can still override headers explicitly. */
export const post = (path, body, opts = {}) =>
  api(path, {
    method: "POST",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
export const put = (path, body) =>
  api(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const patch = (path, body) =>
  api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const del = (path) => api(path, { method: "DELETE" });

export function upload(path, formData, opts = {}) {
  return api(path, { method: "POST", body: formData, ...opts });
}

/** Streaming POST — returns the raw Response so the caller can read the body. */
export async function stream(path, body, { signal } = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await decode(res);
  return res;
}

export const health = () => get("/api/health");
