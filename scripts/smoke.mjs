/**
 * End-to-end smoke test against the local harness.
 *
 *   node scripts/local-harness.mjs &
 *   node scripts/smoke.mjs
 *
 * Exercises the real Worker over HTTP: auth, D1 migration on a cold database,
 * the R2 range maths, SSE assembly, the usage ledger, security headers, and the
 * static asset layer.
 */

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const TOKEN = process.env.CONFIG_TOKEN || "devtoken";
const H = { "X-Config-Token": TOKEN, "Content-Type": "application/json" };

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `  → ${detail}` : ""}`);
  }
}

const section = (title) => console.log(`\n${title}`);

/* ------------------------------------------------------------------ 1 -- */

section("health & auth");
{
  const r = await fetch(`${BASE}/api/health`);
  const j = await r.json();
  check("health reachable without a token", r.status === 200, `status ${r.status}`);
  check("health reports auth=token", j.auth === "token", JSON.stringify(j));
  check("health reports mock upstream", j.mock === true);

  const denied = await fetch(`${BASE}/api/config`);
  check("config without a token is 401", denied.status === 401, `status ${denied.status}`);

  const wrong = await fetch(`${BASE}/api/config`, { headers: { "X-Config-Token": "nope" } });
  check("config with a wrong token is 401", wrong.status === 401, `status ${wrong.status}`);

  const bad = await denied.json();
  check(
    "error body uses the standard shape",
    bad?.error?.code === "unauthorized" && typeof bad.error.message === "string",
    JSON.stringify(bad),
  );
}

/* ------------------------------------------------------------------ 2 -- */

section("config round-trip (cold D1 migration)");
{
  const payload = { model: "mimo-v2.5-tts", voice: "冰糖", text: "你好", takes: 2 };
  const put = await fetch(`${BASE}/api/config`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify(payload),
  });
  check("PUT /api/config succeeds on a fresh database", put.status === 200, `status ${put.status}`);

  const got = await (await fetch(`${BASE}/api/config`, { headers: H })).json();
  check("stored config reads back", got.voice === "冰糖" && got.takes === 2, JSON.stringify(got));

  const withKey = await fetch(`${BASE}/api/config`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ apiKey: "must-not-persist", model: "mimo-v2.5-tts" }),
  });
  const after = await (await fetch(`${BASE}/api/config`, { headers: H })).json();
  check("apiKey is stripped from config", withKey.ok && !("apiKey" in after), JSON.stringify(after));
}

/* ------------------------------------------------------------------ 3 -- */

section("synthesis (non-streaming)");
let takeId = null;
let takeUrl = null;
{
  const r = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "你好，这是一段测试。" }],
      audio: { format: "wav", voice: "冰糖" },
    }),
  });
  const j = await r.json();
  const b64 = j?.choices?.[0]?.message?.audio?.data;
  check("non-streaming returns audio", r.status === 200 && typeof b64 === "string", `status ${r.status}`);

  const bytes = b64 ? Buffer.from(b64, "base64") : Buffer.alloc(0);
  check("audio is a RIFF/WAVE container", bytes.subarray(0, 4).toString() === "RIFF", bytes.subarray(0, 12).toString("hex"));
  check("usage tokens reported", Number(j?.usage?.total_tokens) > 0);
}

section("synthesis (streaming SSE)");
{
  const r = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "流式测试，稍微长一点的句子用来产生多个数据块。" }],
      audio: { format: "pcm16", voice: "冰糖" },
      stream: true,
    }),
  });
  check("streaming responds 200", r.status === 200, `status ${r.status}`);
  check(
    "content-type is event-stream",
    (r.headers.get("content-type") || "").includes("text/event-stream"),
    r.headers.get("content-type"),
  );

  const text = await r.text();
  const dataLines = text.split("\n").filter((l) => l.startsWith("data:") && !l.includes("[DONE]"));
  let pcm = 0;
  for (const line of dataLines) {
    try {
      const j = JSON.parse(line.slice(5));
      const d = j?.choices?.[0]?.delta?.audio?.data;
      if (d) pcm += Buffer.from(d, "base64").length;
    } catch {
      /* ignore */
    }
  }
  check("stream delivered multiple chunks", dataLines.length > 1, `${dataLines.length} chunks`);
  check("stream delivered PCM bytes", pcm > 48000, `${pcm} bytes`);
}

/* ------------------------------------------------------------------ 4 -- */

section("validation");
{
  const badModel = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ model: "gpt-4", messages: [{ role: "assistant", content: "x" }], audio: {} }),
  });
  check("unknown model is rejected", badModel.status === 400, `status ${badModel.status}`);

  const badRole = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "system", content: "x" }],
      audio: {},
    }),
  });
  check("unsupported role is rejected", badRole.status === 400, `status ${badRole.status}`);

  const badJson = await fetch(`${BASE}/api/tts`, { method: "POST", headers: H, body: "{oops" });
  check("malformed JSON is rejected", badJson.status === 400, `status ${badJson.status}`);

  const badFormat = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "x" }],
      audio: { format: "flac" },
    }),
  });
  check("unsupported format is rejected", badFormat.status === 400, `status ${badFormat.status}`);
}

/* ------------------------------------------------------------------ 5 -- */

section("history: upload, list, fetch, patch, range, delete");
{
  const wavRes = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "历史条目测试文本，用于验证上传、列表与回放。" }],
      audio: { format: "wav", voice: "茉莉" },
    }),
  });
  const wav = Buffer.from((await wavRes.json()).choices[0].message.audio.data, "base64");

  const form = new FormData();
  form.append("audio", new File([wav], "take.wav", { type: "audio/wav" }));
  form.append(
    "meta",
    JSON.stringify({
      model: "mimo-v2.5-tts",
      voice: "茉莉",
      format: "wav",
      text: "历史条目测试文本",
      duration: 2.5,
      batchId: "batch1",
      takeIndex: 0,
      spec: { model: "mimo-v2.5-tts", voice: "茉莉", style: "温柔", director: { role: "r", scene: "s", guide: "g" } },
    }),
  );

  const up = await fetch(`${BASE}/api/history`, {
    method: "POST",
    headers: { "X-Config-Token": TOKEN },
    body: form,
  });
  const created = await up.json();
  takeId = created.id;
  check("upload returns 201", up.status === 201, `status ${up.status}`);
  check("upload returns an id", typeof takeId === "string" && takeId.length > 8, String(takeId));

  const list = await (await fetch(`${BASE}/api/history?limit=10`, { headers: H })).json();
  check("list returns the item", Array.isArray(list.items) && list.items.length >= 1);
  check(
    "list reports a filtered total",
    Number(list.total) >= list.items.length,
    `total ${list.total}, items ${list.items.length}`,
  );
  check(
    "list items carry a signed playback url",
    typeof list.items[0]?.url === "string" && list.items[0].url.includes("sig="),
    list.items[0]?.url,
  );
  takeUrl = list.items[0].url;

  const search = await (await fetch(`${BASE}/api/history?q=历史条目`, { headers: H })).json();
  check("search filters", search.items.length >= 1);
  const miss = await (await fetch(`${BASE}/api/history?q=zzz-not-present`, { headers: H })).json();
  check("search excludes non-matches", miss.items.length === 0);

  const one = await (await fetch(`${BASE}/api/history/${takeId}`, { headers: H })).json();
  check("single fetch returns parsed spec", one.spec?.voice === "茉莉", JSON.stringify(one.spec));
  check("single fetch returns director", one.spec?.director?.role === "r");

  const star = await fetch(`${BASE}/api/history/${takeId}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ starred: true }),
  });
  check("patch starred succeeds", star.status === 200, `status ${star.status}`);
  const starred = await (await fetch(`${BASE}/api/history?starred=1`, { headers: H })).json();
  check("starred filter finds it", starred.items.some((x) => x.id === takeId));
}

section("audio playback: signature, ranges, auth");
{
  const signed = await fetch(`${BASE}${takeUrl}`);
  check("signed url plays without a header", signed.status === 200, `status ${signed.status}`);
  const len = Number(signed.headers.get("content-length"));
  check("full response advertises the object size", len > 44, `len ${len}`);
  check("accept-ranges advertised", signed.headers.get("accept-ranges") === "bytes");
  await signed.arrayBuffer();

  const partial = await fetch(`${BASE}${takeUrl}`, { headers: { Range: "bytes=0-1023" } });
  const cr = partial.headers.get("content-range");
  const cl = Number(partial.headers.get("content-length"));
  const body = await partial.arrayBuffer();
  check("range returns 206", partial.status === 206, `status ${partial.status}`);
  check("content-range is correct", cr === `bytes 0-1023/${len}`, `got ${cr}, size ${len}`);
  check("content-length matches the range", cl === 1024, `got ${cl}`);
  check("body length matches content-length", body.byteLength === cl, `${body.byteLength} vs ${cl}`);

  const openEnded = await fetch(`${BASE}${takeUrl}`, { headers: { Range: "bytes=100-" } });
  const cl2 = Number(openEnded.headers.get("content-length"));
  check("open-ended range is exact", cl2 === len - 100, `${cl2} vs ${len - 100}`);
  await openEnded.arrayBuffer();

  const suffix = await fetch(`${BASE}${takeUrl}`, { headers: { Range: "bytes=-64" } });
  check("suffix range is 64 bytes", Number(suffix.headers.get("content-length")) === 64, suffix.headers.get("content-length"));
  await suffix.arrayBuffer();

  const garbage = await fetch(`${BASE}${takeUrl}`, { headers: { Range: "bytes=abc" } });
  check("unparseable range degrades to 200", garbage.status === 200, `status ${garbage.status}`);
  await garbage.arrayBuffer();

  const head = await fetch(`${BASE}${takeUrl}`, { method: "HEAD" });
  check("HEAD works", head.status === 200 && Number(head.headers.get("content-length")) === len);

  const headerAuth = await fetch(`${BASE}/audio/${takeId}`, { headers: { "X-Config-Token": TOKEN } });
  check("header token also authorises playback", headerAuth.status === 200, `status ${headerAuth.status}`);
  await headerAuth.arrayBuffer();

  const noAuth = await fetch(`${BASE}/audio/${takeId}`);
  check("unsigned, unauthenticated playback is 401", noAuth.status === 401, `status ${noAuth.status}`);

  const expired = await fetch(`${BASE}/audio/${takeId}?exp=1&sig=deadbeef`);
  check("expired signature is rejected", expired.status === 401, `status ${expired.status}`);

  const missing = await fetch(`${BASE}/audio/aaaaaaaaaaaaaaaaaaaaaa`, { headers: H });
  check("unknown audio id is 404", missing.status === 404, `status ${missing.status}`);
}

/* ------------------------------------------------------------------ 6 -- */

section("ASR proxy");
{
  const wavRes = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "样本识别测试。" }],
      audio: { format: "wav" },
    }),
  });
  const wav = Buffer.from((await wavRes.json()).choices[0].message.audio.data, "base64");
  const dataUrl = `data:audio/wav;base64,${wav.toString("base64")}`;

  const r = await fetch(`${BASE}/api/asr`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ data: dataUrl, language: "zh" }),
  });
  const j = await r.json();
  check("asr returns 200", r.status === 200, `status ${r.status}`);
  check(
    "asr returns non-empty text",
    typeof j.text === "string" && j.text.trim().length > 0,
    JSON.stringify(j).slice(0, 160),
  );

  const bad = await fetch(`${BASE}/api/asr`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ data: "not-a-data-url" }),
  });
  check("asr rejects a non data-url payload", bad.status === 400, `status ${bad.status}`);
}

/* ------------------------------------------------------------------ 7 -- */

section("usage ledger");
{
  const stats = await (await fetch(`${BASE}/api/stats?days=30`, { headers: H })).json();
  check("stats reports calls", stats.calls > 0, JSON.stringify(stats).slice(0, 200));
  check("stats reports successes", stats.okCalls > 0);
  check("stats groups by model", Array.isArray(stats.byModel) && stats.byModel.length > 0);
  check("stats counts audio bytes", stats.bytes > 0, `bytes ${stats.bytes}`);
}

/* ------------------------------------------------------------------ 8 -- */

section("static assets & security headers");
{
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  const csp = page.headers.get("content-security-policy") || "";
  check("index served", page.status === 200 && html.includes("MiMo TTS Studio"));
  check("CSP present", csp.includes("default-src 'self'"), csp);
  check("nosniff present", page.headers.get("x-content-type-options") === "nosniff");
  check("frame-ancestors denied", csp.includes("frame-ancestors 'none'"));
  // The player reads a fresh take back through its blob: URL to draw the
  // waveform; without blob: in connect-src that fetch is blocked silently.
  check("connect-src permits blob:", csp.includes("connect-src 'self' blob:"), csp);
  check("media-src permits blob:", csp.includes("media-src 'self' blob:"));
  check("no inline <style> in the document", !/<style[\s>]/i.test(html));
  check("no inline style= attribute", !/\sstyle="/i.test(html));
  check("no inline event handler", !/\son[a-z]+="/i.test(html));

  // In production the asset layer answers public/ and may hit Cloudflare's edge
  // cache without ever invoking the Worker, so the same rules have to be
  // declared in public/_headers as well. Keep the two in step.
  const { readFile } = await import("node:fs/promises");
  const declared = await readFile(new URL("../public/_headers", import.meta.url), "utf8").catch(() => "");
  check("public/_headers exists", declared.includes("/*"));
  for (const [name, needle] of [
    ["CSP", "Content-Security-Policy:"],
    ["frame-ancestors", "frame-ancestors 'none'"],
    ["connect-src blob:", "connect-src 'self' blob:"],
    ["nosecniff", "X-Content-Type-Options: nosniff"],
    ["referrer", "Referrer-Policy: no-referrer"],
  ]) {
    check(`_headers declares ${name}`, declared.includes(needle));
  }
  const headersAsAsset = await fetch(`${BASE}/_headers`);
  check("_headers is not served as an asset", headersAsAsset.status === 404, `status ${headersAsAsset.status}`);

  const css = await fetch(`${BASE}/css/tokens.css`);
  check("css served with the right type", (css.headers.get("content-type") || "").includes("text/css"), css.headers.get("content-type"));
  await css.text();

  const js = await fetch(`${BASE}/js/main.js`);
  check("js served with the right type", (js.headers.get("content-type") || "").includes("javascript"), js.headers.get("content-type"));
  await js.text();

  const logo = await fetch(`${BASE}/brand/logo.svg`);
  check("logo svg served", logo.status === 200 && (logo.headers.get("content-type") || "").includes("svg"));
  await logo.text();

  const traversal = await fetch(`${BASE}/../wrangler.toml`);
  check("path traversal is not served", traversal.status >= 400, `status ${traversal.status}`);

  const unknown = await fetch(`${BASE}/api/nope`, { headers: H });
  check("unknown api route is 404", unknown.status === 404, `status ${unknown.status}`);
}

/* ------------------------------------------------------------------ 9 -- */

section("voice library");
let voiceId = null;
{
  // A designed voice is just a prompt.
  const design = await fetch(`${BASE}/api/voices`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "深夜电台", description: "青年女性，气声偏多，语速缓慢而松弛。" }),
  });
  const designed = await design.json();
  check("save a designed voice returns 201", design.status === 201, `status ${design.status}`);
  check("designed voice echoes its kind", designed.kind === "design");

  const unnamed = await fetch(`${BASE}/api/voices`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ description: "没有名字" }),
  });
  check("a nameless voice is rejected", unnamed.status === 400, `status ${unnamed.status}`);

  const empty = await fetch(`${BASE}/api/voices`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "空描述", description: "" }),
  });
  check("an empty description is rejected", empty.status === 400, `status ${empty.status}`);

  // A cloned voice carries its reference clip.
  const wavRes = await fetch(`${BASE}/api/tts`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: "参考音频。" }],
      audio: { format: "wav" },
    }),
  });
  const wav = Buffer.from((await wavRes.json()).choices[0].message.audio.data, "base64");

  const form = new FormData();
  form.append("audio", new File([wav], "ref.wav", { type: "audio/wav" }));
  form.append("meta", JSON.stringify({ name: "我的克隆音色", duration: 1.5 }));

  const clone = await fetch(`${BASE}/api/voices`, {
    method: "POST",
    headers: { "X-Config-Token": TOKEN },
    body: form,
  });
  const cloned = await clone.json();
  voiceId = cloned.id;
  check("save a cloned voice returns 201", clone.status === 201, `status ${clone.status}`);
  check("cloned voice carries a signed url", typeof cloned.url === "string" && cloned.url.includes("sig="), cloned.url);

  const list = await (await fetch(`${BASE}/api/voices`, { headers: H })).json();
  check("library lists both kinds", list.items.length >= 2, `count ${list.items.length}`);
  check(
    "designed entries expose their prompt",
    list.items.some((v) => v.kind === "design" && v.description),
  );
  check(
    "clone urls point at the voice route, not the audio route",
    list.items.every((v) => v.kind !== "clone" || v.url.startsWith("/voice/")),
    list.items.find((v) => v.kind === "clone")?.url,
  );

  const clip = await fetch(`${BASE}${cloned.url}`);
  check("the saved clip plays from its signed url", clip.status === 200, `status ${clip.status}`);
  const bytes = await clip.arrayBuffer();
  check("the saved clip is the audio that was uploaded", bytes.byteLength === wav.length, `${bytes.byteLength} vs ${wav.length}`);

  // Scope check: a voice signature must not be accepted by the audio route.
  const crossScope = await fetch(
    `${BASE}${cloned.url.replace("/voice/", "/audio/")}`,
  );
  check(
    "a voice signature is not valid on the audio route",
    crossScope.status === 404 || crossScope.status === 401,
    `status ${crossScope.status}`,
  );

  const unauth = await fetch(`${BASE}/voice/${voiceId}`);
  check("an unsigned request for a clip is 401", unauth.status === 401, `status ${unauth.status}`);

  const removed = await fetch(`${BASE}/api/voices/${voiceId}`, { method: "DELETE", headers: H });
  check("deleting a saved voice returns 200", removed.status === 200, `status ${removed.status}`);

  const gone = await fetch(`${BASE}/voice/${voiceId}`, { headers: H });
  check("the clip is gone with its voice", gone.status === 404, `status ${gone.status}`);

  const twice = await fetch(`${BASE}/api/voices/${voiceId}`, { method: "DELETE", headers: H });
  check("deleting twice is 404", twice.status === 404, `status ${twice.status}`);
}

/* ----------------------------------------------------------------- 10 -- */

section("cleanup");
{
  const del = await fetch(`${BASE}/api/history/${takeId}`, { method: "DELETE", headers: H });
  check("delete returns 200", del.status === 200, `status ${del.status}`);

  const gone = await fetch(`${BASE}/api/history/${takeId}`, { headers: H });
  check("deleted record is gone", gone.status === 404, `status ${gone.status}`);

  const orphan = await fetch(`${BASE}/audio/${takeId}`, { headers: H });
  check("object removed with the record", orphan.status === 404, `status ${orphan.status}`);

  const again = await fetch(`${BASE}/api/history/${takeId}`, { method: "DELETE", headers: H });
  check("deleting twice is 404", again.status === 404, `status ${again.status}`);
}

/* -------------------------------------------------------------------- */

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
