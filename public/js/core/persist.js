/**
 * Persistence.
 *
 * Two tiers, on purpose:
 *   localStorage  — instant, survives a reload with no network
 *   PUT /api/config (D1) — debounced, shared across devices
 *
 * Only durable preferences live here. Transient things (running takes, the
 * decoded clone sample) are session state; the clone sample alone can reach
 * 10MB, well past what localStorage will accept.
 */

import { get, put } from "./api.js";

const LOCAL_KEY = "mimo_tts_config";
const SERVER_DEBOUNCE = 900;

/** The persisted field set, with the shape each field must have. */
const SCHEMA = {
  model: "string",
  voice: "string",
  voiceDesign: "string",
  style: "string",
  text: "string",
  format: "string",
  optimize: "boolean",
  autoSplit: "boolean",
  showErrors: "boolean",
  stream: "boolean",
  takes: "number",
  director: "object",
};

export function collect(state) {
  const out = {};
  for (const [key, kind] of Object.entries(SCHEMA)) {
    const v = state[key];
    if (kind === "object") {
      const d = v || {};
      out[key] = {
        role: String(d.role || ""),
        scene: String(d.scene || ""),
        guide: String(d.guide || ""),
      };
    } else if (typeof v === kind || (kind === "number" && Number.isFinite(v))) {
      out[key] = v;
    }
  }
  return out;
}

/** Apply a stored blob onto the store, ignoring anything malformed. */
export function apply(store, cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return 0;
  const patch = {};
  for (const [key, kind] of Object.entries(SCHEMA)) {
    const v = cfg[key];
    if (v == null) continue;
    if (kind === "string" && typeof v === "string") patch[key] = v;
    else if (kind === "boolean" && typeof v === "boolean") patch[key] = v;
    else if (kind === "number" && Number.isFinite(Number(v))) patch[key] = Number(v);
    else if (kind === "object" && typeof v === "object" && !Array.isArray(v)) {
      patch[key] = {
        role: String(v.role || ""),
        scene: String(v.scene || ""),
        guide: String(v.guide || ""),
      };
    }
  }
  const n = Object.keys(patch).length;
  if (n) store.set(patch);
  return n;
}

export function createPersistence(store, { onStatus } = {}) {
  let timer = 0;
  let inflight = 0;

  function status(s) {
    onStatus?.(s);
  }

  /** Write locally now, to the server shortly. */
  function schedule() {
    const cfg = collect(store.get());

    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg));
      status(inflight ? "pending" : "local");
    } catch {
      status("off");
    }

    clearTimeout(timer);
    timer = setTimeout(push, SERVER_DEBOUNCE);
  }

  async function push() {
    const cfg = collect(store.get());
    inflight++;
    status("pending");
    try {
      await put("/api/config", cfg);
      status("ok");
    } catch (e) {
      status(e.status === 401 || e.status === 503 ? "off" : "err");
    } finally {
      inflight--;
    }
  }

  /**
   * Restore: the local snapshot first so the UI is usable immediately, then the
   * server copy, which wins because it may have been edited elsewhere.
   */
  async function restore() {
    let restored = 0;
    try {
      restored = apply(store, JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"));
    } catch {
      /* corrupt snapshot — start clean */
    }

    try {
      const remote = await get("/api/config");
      if (remote && typeof remote === "object" && Object.keys(remote).length) {
        restored += apply(store, remote);
        status("ok");
      } else {
        status(restored ? "local" : "off");
      }
    } catch (e) {
      status(e.status === 401 || e.status === 503 ? "off" : "err");
    }

    return restored;
  }

  function clear() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
  }

  return { schedule, restore, clear, push };
}
