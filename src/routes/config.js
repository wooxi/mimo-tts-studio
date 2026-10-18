/**
 * GET|PUT /api/config — the single persisted UI state.
 *
 * Stored as one row because every field is written together and read together;
 * per-key rows would only add round trips. Writes are bounded so a runaway
 * client cannot fill the database with one enormous value.
 */

import { CODES, HttpError, readJson } from "../lib/http.js";

const KEY = "config:default";
const MAX_BYTES = 256 * 1024;

export async function handleConfig(request, env, ctx, cors) {
  if (request.method === "GET") {
    let cfg = {};
    try {
      const row = await env.HISTORY_DB.prepare(
        "SELECT value FROM config WHERE key = ?",
      )
        .bind(KEY)
        .first();
      if (row?.value) cfg = JSON.parse(row.value);
    } catch {
      cfg = {}; // missing table or corrupt row reads as "no config yet"
    }
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) cfg = {};
    return Response.json(cfg, { headers: { ...cors, "Cache-Control": "no-store" } });
  }

  if (request.method !== "PUT") {
    throw new HttpError(CODES.BAD_REQUEST, "method not allowed", 405);
  }

  const body = await readJson(request, MAX_BYTES);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(CODES.BAD_REQUEST, "配置必须是 JSON 对象", 400);
  }

  // Never persisted: the key belongs to the server, the token to the browser.
  delete body.apiKey;
  delete body.configToken;

  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_BYTES) {
    throw new HttpError(CODES.PAYLOAD_TOO_LARGE, "配置过大", 413);
  }

  await env.HISTORY_DB.prepare(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(KEY, serialized, Date.now())
    .run();

  return Response.json({ ok: true }, { headers: { ...cors, "Cache-Control": "no-store" } });
}
