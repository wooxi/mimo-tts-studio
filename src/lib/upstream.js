/**
 * Upstream transport for api.xiaomimimo.com (OpenAI-compatible).
 *
 * Responsibilities:
 *  - attach the API key, which never leaves the Worker
 *  - retry the failures that are worth retrying, before any bytes are piped
 *  - translate upstream status codes into our own failure taxonomy
 *  - hand back the raw Response so streaming stays streaming
 */

import { CODES, HttpError } from "./http.js";
import { mockResponse } from "./mock.js";

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Map an upstream failure onto our taxonomy, with copy a user can act on. */
function classify(status, detail) {
  const tail = detail ? ` — ${detail}` : "";
  switch (status) {
    case 401:
      return new HttpError(
        CODES.UPSTREAM_ERROR,
        `上游鉴权失败（401）：服务端密钥与端点不匹配${tail}`,
        502,
      );
    case 402:
      return new HttpError(CODES.UPSTREAM_BALANCE, `上游账户余额不足（402）${tail}`, 402);
    case 403:
      return new HttpError(CODES.UPSTREAM_REGION, `上游拒绝该地区或风控拦截（403）${tail}`, 403);
    case 421:
      return new HttpError(CODES.UPSTREAM_FILTERED, `内容被上游安全策略拦截（421）${tail}`, 422);
    case 429:
      return new HttpError(CODES.UPSTREAM_RATE_LIMITED, `触发上游限流（429）${tail}`, 429);
    default:
      return new HttpError(CODES.UPSTREAM_ERROR, `上游返回 ${status}${tail}`, 502);
  }
}

async function readDetail(res) {
  try {
    const text = await res.text();
    if (!text) return "";
    try {
      const j = JSON.parse(text);
      return j?.error?.message || j?.message || text.slice(0, 240);
    } catch {
      return text.slice(0, 240);
    }
  } catch {
    return "";
  }
}

/**
 * POST a chat/completions body upstream.
 * Returns the raw Response (streaming bodies are passed through untouched).
 * Throws HttpError on a non-retryable or exhausted failure.
 */
export async function callUpstream(env, body, { ctx } = {}) {
  if (env.MIMO_MOCK === "1") return mockResponse(body);

  const apiKey = env.MIMO_API_KEY || "";
  if (!apiKey) {
    throw new HttpError(
      CODES.NOT_CONFIGURED,
      "服务端未配置上游密钥，合成不可用",
      503,
    );
  }

  const payload = JSON.stringify(body);
  let lastErr = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt) await sleep(400 * 2 ** (attempt - 1) + Math.random() * 250);

    let res;
    try {
      res = await fetch(env.UPSTREAM_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          Accept: body.stream ? "text/event-stream" : "application/json",
        },
        body: payload,
      });
    } catch (e) {
      lastErr = new HttpError(
        CODES.UPSTREAM_TIMEOUT,
        `无法连接上游：${e?.message || e}`,
        504,
      );
      continue; // network-level failure is always worth one more try
    }

    if (res.ok) return res;

    // Retry only when the upstream told us to, and only while nothing has
    // been handed to the client yet — callUpstream returns before piping.
    if (RETRY_STATUS.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        await sleep(Math.min(retryAfter * 1000, 8000));
      }
      lastErr = classify(res.status, await readDetail(res));
      continue;
    }

    throw classify(res.status, await readDetail(res));
  }

  throw lastErr || new HttpError(CODES.UPSTREAM_ERROR, "上游请求失败", 502);
}

/** Pull token accounting out of a completed (non-streamed) upstream payload. */
export function usageOf(jsonBody) {
  const u = jsonBody?.usage;
  if (!u) return null;
  const n = Number(u.total_tokens);
  return Number.isFinite(n) ? n : null;
}
