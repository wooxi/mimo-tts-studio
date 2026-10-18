/**
 * Live smoke check.
 *
 * Verifies a deployed instance rather than a local one. The local suite cannot
 * catch the class of bug this exists for: whether the security headers are
 * actually on the wire. They are set in `worker.js`, but that only helps if the
 * Worker is the thing answering — and a deployed Worker can be bypassed by the
 * asset layer or by Cloudflare's edge cache, which is exactly what happened
 * once already.
 *
 *   node scripts/check-live.mjs https://your-worker.workers.dev
 *
 * Cache-busting is deliberate. Without it this reads stale edge-cached copies
 * and reports problems that are already fixed, or misses ones that are not.
 */

const BASE = (process.argv[2] || process.env.LIVE_BASE || "").replace(/\/$/, "");
if (!BASE) {
  console.error("usage: node scripts/check-live.mjs https://your-worker.workers.dev");
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `  → ${detail}` : ""}`);
  }
};

const bust = () => `?v=${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
const get = (path) => fetch(BASE + path);
const busted = (path) => fetch(BASE + path + bust());

console.log(`live check  →  ${BASE}\n`);

/* ------------------------------------------------------------------ health */

console.log("health");

let health = {};
try {
  const res = await get(`/api/health${bust()}`);
  health = await res.json();
  check("/api/health is reachable anonymously", res.status === 200, `status ${res.status}`);
  check("an access token is configured", health.auth === "token", `auth=${health.auth}`);
  check("upstream credentials are configured", health.ready === true, `ready=${health.ready}`);
  check(
    "health exposes no upstream configuration",
    !("apiKey" in health) && !("upstream" in health) && !("historyLimit" in health),
    JSON.stringify(health),
  );
} catch (e) {
  check("/api/health is reachable anonymously", false, e.message);
}

/* ----------------------------------------------------- assets & headers --- */

console.log("\nsecurity headers");

const doc = await busted("/");
const csp = doc.headers.get("content-security-policy") || "";
check("the document is served", doc.status === 200, `status ${doc.status}`);
check("CSP is on the document", csp.includes("default-src 'self'"), csp || "(absent)");
check("CSP denies framing", csp.includes("frame-ancestors 'none'"));
check("CSP allows blob: media", csp.includes("media-src 'self' blob: data:"));
check(
  "CSP allows the zone RUM beacon",
  csp.includes("https://static.cloudflareinsights.com") &&
    csp.includes("https://cloudflareinsights.com"),
  csp || "(absent)",
);
check("nosniff is set", doc.headers.get("x-content-type-options") === "nosniff");
check("referrer policy is set", doc.headers.get("referrer-policy") === "no-referrer");
check("framing is denied", doc.headers.get("x-frame-options") === "DENY");

// A stylesheet is the honest test: it is not HTML, so if the headers are there
// they came from whatever actually answered the request. This is the assertion
// that failed in production when the headers were only applied to documents.
for (const path of ["/css/tokens.css", "/js/boot.js", "/brand/logo.svg"]) {
  const res = await busted(path);
  check(
    `${path} carries the headers`,
    (res.headers.get("content-security-policy") || "").includes("default-src 'self'") &&
      res.headers.get("x-content-type-options") === "nosniff",
    `csp=${res.headers.get("content-security-policy") ? "present" : "absent"} nosniff=${res.headers.get("x-content-type-options") || "absent"}`,
  );
}

const api = await busted("/api/health");
check("api responses are nosniff", api.headers.get("x-content-type-options") === "nosniff");

// `_headers` is parsed by the asset layer and never applied to Worker
// responses, so shipping one would be a no-op that is also publicly served.
const stray = await busted("/_headers");
check("no _headers file is shipped", stray.status === 404, `status ${stray.status}`);

/* --------------------------------------------------------------- the build */

console.log("\nbuild markers");

const html = await doc.text();
const layerIds = ["layerVoice", "layerDirection", "layerScript"];
check(
  "the three-layer markup is present",
  layerIds.every((id) => html.includes(`id="${id}"`)),
);
check(
  "no legacy explainer markup",
  !html.includes("layer-map") && !html.includes("modelDesc"),
);
check("the voice library slot is present", html.includes('id="voiceLibrary"'));
check("the modular entry point is present", html.includes("/js/boot.js"));
check("the pre-v4 bundle is gone", !html.includes("/css/main.css") && !html.includes("/js/tts.js"));
check("the brand favicon is wired up", html.includes("/brand/favicon.svg"));

/* ---------------------------------------------------------- access control */

console.log("\naccess control");

for (const [path, method] of [
  ["/api/config", "GET"],
  ["/api/history", "GET"],
  ["/api/voices", "GET"],
  ["/api/stats", "GET"],
]) {
  const res = await fetch(BASE + path, { method });
  check(`${method} ${path} without a token is refused`, res.status === 401 || res.status === 503, `status ${res.status}`);
}

const tts = await fetch(`${BASE}/api/tts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ model: "mimo-v2.5-tts", messages: [], audio: { format: "wav" } }),
});
check("POST /api/tts without a token is refused", tts.status === 401 || tts.status === 503, `status ${tts.status}`);

// Regression: an unset secret must never match the literal string "undefined".
for (const [path, value] of [
  ["/audio/abcdefghijkl", "undefined"],
  ["/audio/abcdefghijkl", "null"],
  ["/voice/abcdefghijkl", "undefined"],
]) {
  const res = await fetch(BASE + path + bust(), { headers: { "X-Config-Token": value } });
  check(`${path} + forged ${JSON.stringify(value)} is refused`, res.status !== 200, `status ${res.status}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
