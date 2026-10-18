/**
 * Fail-closed check.
 *
 * With CONFIG_TOKEN unset, every API route must refuse — otherwise a
 * deployment would be an open proxy for the account's MiMo key — and the key
 * must never appear in a refusal body.
 *
 *   node scripts/check-failclosed.mjs
 */

const { default: worker } = await import("../src/worker.js");

const db = { prepare: () => ({ bind: () => ({ run: async () => ({}), all: async () => ({ results: [] }), first: async () => null }) }) };
const env = {
  ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  HISTORY_DB: db,
  AUDIO_BUCKET: { get: async () => null, put: async () => ({}), delete: async () => {} },
  UPSTREAM_URL: "https://example.invalid/v1/chat/completions",
  MIMO_API_KEY: "should-never-be-reachable",
  HISTORY_LIMIT: "200",
  MAX_AUDIO_BYTES: "26214400",
  // CONFIG_TOKEN deliberately absent
};
const ctx = { waitUntil() {} };

const cases = [
  ["GET  /api/health",        "GET",  "/api/health"],
  ["GET  /api/config",        "GET",  "/api/config"],
  ["PUT  /api/config",        "PUT",  "/api/config"],
  ["POST /api/tts",           "POST", "/api/tts"],
  ["POST /api/asr",           "POST", "/api/asr"],
  ["GET  /api/history",       "GET",  "/api/history"],
  ["GET  /api/stats",         "GET",  "/api/stats"],
  ["GET  /api/voices",        "GET",  "/api/voices"],
  ["POST /api/voices",        "POST", "/api/voices"],
  ["GET  /audio/abcdefghijkl","GET",  "/audio/abcdefghijkl"],
  ["GET  /voice/abcdefghijkl","GET",  "/voice/abcdefghijkl"],
  ["GET  /",                  "GET",  "/"],
];

let bad = 0;
for (const [label, method, path] of cases) {
  const req = new Request("https://studio.example" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });
  const res = await worker.fetch(req, env, ctx);
  const expectOpen = path === "/api/health" || path === "/";
  const body = await res.text();
  const code = (() => { try { return JSON.parse(body)?.error?.code; } catch { return undefined; } })();
  const ok = expectOpen ? res.status === 200 : res.status === 503 && code === "not_configured";
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(26)} → ${res.status} ${code ?? ""}`);
}

// And the API key must not leak into any refusal body.
const leak = await (await worker.fetch(new Request("https://studio.example/api/tts", { method: "POST", body: "{}" }), env, ctx)).text();
if (leak.includes("should-never-be-reachable")) { bad++; console.log("FAIL api key leaked into the refusal body"); }
else console.log("ok   key not echoed in the refusal body");

/* -------------------------------------------------------------------------
 * Regression: a request carrying the literal header `X-Config-Token:
 * undefined` used to authenticate, because the comparison coerced the unset
 * secret with String() and the two sides both became "undefined". Same class
 * of bug for "", "null" and "NaN".
 * ---------------------------------------------------------------------- */
const FORGED = ["undefined", "null", "NaN", "", " ", "0", "false"];
for (const route of ["/audio/abcdefghijkl", "/voice/abcdefghijkl"]) {
  for (const value of FORGED) {
    const res = await worker.fetch(
      new Request(`https://studio.example${route}`, {
        headers: { "X-Config-Token": value },
      }),
      env,
      ctx,
    );
    const ok = res.status === 503;
    if (!ok) bad++;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${route.padEnd(21)} forged ${JSON.stringify(value).padEnd(11)} → ${res.status}`,
    );
  }
}

// A signature cannot be minted without a secret, so a signed URL must not help either.
{
  const res = await worker.fetch(
    new Request("https://studio.example/audio/abcdefghijkl?exp=9999999999&sig=anything"),
    env,
    ctx,
  );
  const ok = res.status === 503;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} signed url with no secret      → ${res.status}`);
}

console.log(bad === 0 ? "\nPASS fail-closed holds" : `\nFAIL ${bad} case(s)`);
process.exit(bad ? 1 : 0);
