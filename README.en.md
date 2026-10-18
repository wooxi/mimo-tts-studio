<img src="public/brand/logo.svg" width="88" alt="MiMo TTS Studio">

# MiMo TTS Studio

A speech-creation workbench for Xiaomi's MiMo-V2.5-TTS family, running on Cloudflare Workers: three control layers (voice / direction / script), multi-take comparison, automatic segmentation for long scripts, history and favourites — with a zero-build front end.

[中文](README.md) · [Design baseline](DESIGN.md) · [Brand assets](public/brand/README.md)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020)
![License](https://img.shields.io/badge/license-MIT-3da639)
![Build](https://img.shields.io/badge/build-none-6b7280)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wooxi/mimo-tts-studio)

> The deploy button clones the repository and walks you through the bindings, but D1, R2 and the two secrets still have to be set up as described in "Deploy in a minute".

## What this is

A self-hosted web workbench that puts MiMo's three speech-synthesis models (preset voices, voice design, voice clone) and speech recognition behind one interface.
Your upstream key lives in a Worker secret and never reaches the browser; configuration, history and usage are stored in D1 and R2.
Beyond `wrangler` there is no build step, no bundler, no external fonts and no CDN dependency.

## Features

**Speech**

| Feature | Notes |
| --- | --- |
| Preset voices | 8 named voices plus `mimo_default`, chosen from a card grid; the ▶ button on each card auditions it, and auditions are cached per voice so repeat clicks are not re-billed |
| Voice design | Describe a voice in text and get a new timbre, no sample needed; four starter examples (late-night radio, esports casting, food review, courtroom statement) and a four-part writing hint |
| Voice clone | Drop or pick an mp3/wav sample and see its waveform, duration and size; pick a past take instead of uploading; zero-shot, the sample is used for that one request |
| Voice library | Keeps the voices you designed or cloned so you can reuse them. A designed voice stores its description text (every generation differs slightly); a cloned voice keeps its reference clip in R2. Each card has an "apply" button and a delete button, and applying a clone switches to the clone model and loads the clip back |
| Singing | One click moves `(唱歌)` to the front of the script; the button only appears for the preset-voice model |
| Speech recognition | Reads a clone sample back through `mimo-v2.5-asr` so you can tell whether it is clean speech; fills the script when it is still empty |

**Creative control**

| Feature | Notes |
| --- | --- |
| Natural-language direction | The style text in the direction layer becomes the `user` message — it shapes the performance and is never spoken |
| Director mode | Character / scene / guidance fields, with a one-click official example; left empty, nothing is sent |
| Overall style tags | A bracketed group at the very start of the script; the picker offers 7 groups and a search box |
| Inline audio tags | `（tag）` inserted at the caret; the picker switches between the Chinese and English sets based on the script language, and the highlight layer colours style, inline and singing tags differently |
| Text polish | Voice design's `optimize_text_preview`: leave the script empty and the model writes it; the polished text is shown afterwards and can replace the script in one click |
| Request preview | The exact JSON about to be sent, with the clone sample elided to its size, copyable as a cURL command |

**Workflow**

| Feature | Notes |
| --- | --- |
| Take comparison | Generate 1–3 takes per run, each with its own waveform and duration; clicking one loads it into the player. With auto-split on, the count is forced to 1 |
| Long-script segmentation | Past 2500 characters the script is split on sentence boundaries, synthesised piece by piece and joined into a single WAV in the browser |
| Design → clone | Send a finished take back as a clone sample, which switches you to the clone model automatically, and carry on from there; the clip can then be saved to the voice library |
| History and favourites | Metadata in D1, audio in R2; search, starred-only filter, paging, delete, and a one-click "load" that restores the model, voice, voice description, style, direction and format (a clone sample has to be re-uploaded) |
| Playback | Waveform, scrubber, 0.75/1/1.25/1.5× rates, download, and "use as clone sample" |
| Retention | 200 entries by default; the oldest unstarred entries are pruned, removing the R2 object before its row — if the object delete fails the row survives and is retried, so nothing is left unreferenced |

**Engineering**

| Feature | Notes |
| --- | --- |
| Zero build | Native ES modules and CSS custom properties; no bundler, no webfonts, no CDN requests |
| Key stays server-side | `MIMO_API_KEY` exists only as a Worker secret; every synthesis call goes through `/api/tts`, and there is no direct-connect mode |
| Signed playback URLs | `/audio/:id?exp&sig` uses a short-lived HMAC-SHA256 URL (30 minutes by default) and supports Range and HEAD |
| Usage stats | One `usage` row per call that reaches the upstream (requests stopped by local validation get no row); the settings drawer shows 30-day calls, characters, audio volume, mean latency and a per-model breakdown |
| Light and dark | auto / light / dark, applied before first paint, with `auto` following the system |
| Keyboard access | Skip link, one consistent `focus-visible` outline, and switches and segmented controls that work from the keyboard |
| Security headers | A CSP that allows same-origin only (plus `data:` / `blob:` for images and media), along with `no-referrer`, `nosniff` and `frame-ancestors 'none'` |
| Fail closed | With no `CONFIG_TOKEN`, every API request is refused — a deployment can never become a free proxy for your account |
| Mock upstream | `npm run dev:mock` returns structurally real WAV and SSE payloads without calling anyone or spending quota |

## Model capability map

The left column is what MiMo-V2.5-TTS offers; the right column is where it lands in this project.

| Upstream capability | Where it lives here |
| --- | --- |
| 8 preset voices plus `mimo_default` (`audio.voice`) | ① Voice · preset grid (9 cards) and the ▶ audition on each card |
| Voice design from a text description | ① The voice-description field, four-part hint, four examples, the polish switch and "save as my voice" |
| Zero-shot voice clone (mp3/wav, Base64 ≤ 10MB) | ① Drop/pick a sample → waveform, duration, size; "recognise sample", "save as my voice" and "pick from history"; "use as clone sample" in the player |
| Singing (preset-voice model only) | ③ The "singing" pill, which moves `(唱歌)` to the front of the script; it is not offered on the other two models |
| Natural-language control (`messages[role=user]`) | ② Direction · style text (whole-utterance tone, per-sentence pacing, single-character handling) |
| Director mode: character / scene / guidance | ② A collapsible section with three fields and a "fill in the official example" button; left empty, it is not sent |
| Overall style tags (bracketed group at the start of the script) | ③ The "overall style" pill and a 7-group picker: basic emotions, complex emotions, overall tone, timbre, persona, dialect, role-play |
| Inline audio tags (anywhere in the script) | ③ The "inline tag" pill and a 4-group picker — pacing, emotional state, voice quality, laughter and crying — switched between Chinese and English to match the script |
| Text polish and automatic script generation (`optimize_text_preview`) | The "polish broadcast text" switch in ① and ③; the polished text is echoed back with a one-click "replace script" |
| True low-latency streaming (preset-voice model only) | The "stream" switch in the compose dock; on either other model its tooltip says this is compatibility mode only |
| Output formats wav / mp3 / pcm16 (24 kHz mono) | The format control in the compose dock and "default output format" in settings; streaming is always PCM16 and is wrapped into a WAV in the browser |
| 8K context, with roughly 2500 characters recommended per call | ③ "Auto-split and join": sentence-boundary splitting, the style tag re-added to every piece, PCM16 throughout, joined back into one WAV |
| Speech recognition (`mimo-v2.5-asr`, same endpoint) | "Recognise sample" in ①; the result only fills the script when it is empty |
| Upstream error semantics (401 / 402 / 403 / 421 / 429 / 5xx) | Translated server-side into `not_configured` and `upstream_*` codes, surfaced with actionable copy |
| The `transcript` field in responses | Always `null` upstream, so it is unused; the polished text comes back through `final_text_preview` instead |

What is deliberately not wired up, so the coverage above is not overread:

| Upstream capability | Status |
| --- | --- |
| Audio understanding / QA of generated audio (`mimo-v2.5`, `mimo-v2.6-*`) | Not integrated |
| Multi-turn conversation history in `messages` | Unused: every request stands alone, and `messages` is capped at 12 entries |
| Punctuation for pauses, ALL CAPS for emphasis | No dedicated control — just write it in the script |

## The interface, layer by layer

The interface has three layers, and each one maps to a different field in the request. This mapping is the core design of the project:

| Layer | Where | Request field | What it means |
| --- | --- | --- | --- |
| ① Voice | First block in the composer | `audio.voice` | Who speaks: a preset voice ID, or a clone sample as `data:audio/…;base64,…`. The voice-design model does not use this field |
| ② Direction | Second block | `messages[role=user].content` | How to perform it: natural-language description and director mode. **Never spoken** |
| ③ Script | Third block | `messages[role=assistant].content` | What is said: the only text that is spoken, and the text that carries the overall style tag and the inline audio tags |

- Each layer header shows the request field it feeds, so you never have to consult the docs to line them up.
- "Request preview" at the bottom of the composer shows the JSON that is about to be sent; the clone sample is elided to `<x.xx MB>`, and the whole thing can be copied as a cURL command.
- The voice-design model takes exactly one `user` field, so the contents of ② are folded into the voice description of ① — the interface says so instead of dropping them silently.
- The script box *is* the state: tags are not stored twice, so what you see is literally what is sent, and both the highlight layer and the tag chips are derived from that one string.

## Deploy in a minute

**Before you start:** Node.js 18+ and a Cloudflare account, plus an API key from the [Xiaomi MiMo open platform](https://mimo.mi.com). Pay-as-you-go and Token Plan keys cannot be mixed — using the wrong one against the wrong endpoint returns a 401.

```bash
npm install
npx wrangler login

# 1. Create the resources
npx wrangler d1 create mimo-tts-db          # put the printed database_id back into wrangler.toml
npx wrangler r2 bucket create mimo-tts-audio

# 2. Create the tables (recommended; the Worker also creates them and adds any
#    new columns on its first request, so an existing deployment can simply
#    deploy — no manual SQL needed)
npm run db:remote

# 3. Two secrets
npx wrangler secret put MIMO_API_KEY        # your Xiaomi MiMo key
npx wrangler secret put CONFIG_TOKEN        # any random string you choose; you type it in the UI

# 4. Ship it
npm run deploy
```

Open the Worker hostname and paste the `CONFIG_TOKEN` you just set — it is kept in that browser's localStorage only.

On a Token Plan key, change `UPSTREAM_URL` in `wrangler.toml` to `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`.

**Continuous deployment:** `.github/workflows/deploy.yml` deploys with `cloudflare/wrangler-action@v3` on every push to `main`. Add `CF_API_TOKEN` and `CF_ACCOUNT_ID` to the repository secrets; it does not create D1 or R2, so the first run still needs the steps above.

**Local development**

```bash
npm run dev              # local development; put the two secrets in .dev.vars (wrangler secret put only affects the deployed Worker)
npm run dev:mock         # MIMO_MOCK=1: a local fake upstream returning real WAV / SSE shapes
npm run db:local         # create the tables in the local D1
npm run brand            # regenerate the logo candidates under brand/drafts/
```

When `wrangler` will not start — a locked-down machine, or a CI job that only needs a smoke test — the bundled Node host loads the real Worker source directly:

```bash
node scripts/local-harness.mjs          # http://127.0.0.1:8787, CONFIG_TOKEN=devtoken, fake upstream
node scripts/smoke.mjs                  # 87 end-to-end assertions: auth, cold-database migration, Range, SSE, the voice library, security headers…
node scripts/check-failclosed.mjs       # refusal behaviour with no CONFIG_TOKEN set (includes the forged-header regression)
```

`scripts/local-harness.mjs` shims D1 and R2 with `node:sqlite` and in-memory objects, and leaves `src/` untouched. It is not a deployment target; it exists so the whole chain can be verified where workerd cannot run.

## Configuration

`[vars]` in `wrangler.toml`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPSTREAM_URL` | `https://api.xiaomimimo.com/v1/chat/completions` | Upstream OpenAI-compatible endpoint. Token Plan uses `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` |
| `HISTORY_LIMIT` | `200` | How many entries to keep; the oldest unstarred ones are pruned along with their R2 objects |
| `MAX_AUDIO_BYTES` | `26214400` | Hard cap per audio object (25MB); `POST /api/history` returns 413 above it |
| `AUDIO_URL_TTL` | `1800` | Lifetime in seconds of a signed playback URL. `<audio>` cannot send headers, hence the short-lived signed URL |
| `MIMO_MOCK` | unset | Set to `"1"` to enable the local fake upstream; development and self-testing only |
| `ALLOWED_ORIGINS` | unset | Comma-separated cross-origin allowlist; empty means same-origin and no CORS headers at all. Read by `src/lib/http.js` and not written into `wrangler.toml` by default |

The two secrets:

| Secret | Required | Notes |
| --- | --- | --- |
| `MIMO_API_KEY` | Yes | Sent upstream as the `api-key` header; without it synthesis returns 503 `not_configured` |
| `CONFIG_TOKEN` | Yes | Access token. **With it unset, the server refuses every `/api/*` and `/audio/*` request** (only `/api/health` is exempt, so the UI can tell you which command to run) |

## Layout

```
wrangler.toml          Worker name, static-asset binding, D1 / R2 bindings, vars
src/worker.js          Entry point: routing, asset serving, document security headers
src/routes/            tts (synthesis proxy) / asr / config / history / audio / voices (voice library)
src/lib/               auth (token and signing) / db (schema and usage) / upstream (retry, error mapping) / http / mock
src/db/schema.sql      Authoritative D1 schema, idempotent, safe to re-run
public/index.html      Application shell
public/css/            tokens / base / components / app, in that order
public/js/             boot (entry) · main (wiring) · synth (engine) · core / domain / views
public/brand/          Logo and share card (see public/brand/README.md)
scripts/gen-logos.mjs  Logo generator, writes to brand/drafts/
scripts/local-harness.mjs / smoke.mjs   End-to-end verification without workerd
docs/mimo-api-reference.md              The upstream API, item by item, with what is still unconfirmed
```

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `⌘` / `Ctrl` + `Enter` | Start synthesis |
| `Esc` | Cancel a running synthesis |
| `Space` | Play / pause |
| `←` / `→` | Seek back / forward 3 seconds |
| `Shift` + `←` / `→` | Seek back / forward 10 seconds |

The playback shortcuts need a loaded take and are ignored while focus is in a text field. Switches and segmented controls in the tag picker and the settings drawer all respond to `Enter` and `Space`.

## FAQ

**Why is `CONFIG_TOKEN` mandatory, and what happens without it?**
Without it the server answers every `/api/*` and `/audio/*` request with 503 `not_configured`; only `/api/health` stays reachable, which is how the interface knows to show "one step left: set an access token" and the exact command to run. This is deliberate fail-closed behaviour: the Worker holds your `MIMO_API_KEY`, so an anonymous deployment would let anyone who knows the hostname spend your quota. The token travels in the `X-Config-Token` header, is stored by the browser in localStorage (`mimo_tts_token`), and is compared in constant time.

**Why do results change when I pick `mimo_default`?**
Two effects stack. First, `mimo_default` resolves per cluster — 冰糖 on the China cluster, Mia elsewhere — so the same preset is not even the same voice across deployments. Second, synthesis itself is stochastic, and the official guidance is to generate a few takes and pick. Choose a named voice if you need a fixed result.

**What are the limits on a clone sample?**
mp3 and wav only, and no more than 10MB once Base64-encoded (roughly a 7.5MB file); the browser checks this the moment you pick a file. The server has a second guard: an `audio.voice` string above 14MB as a data URL is rejected with 413. Cloning is zero-shot — the sample goes upstream with that one request and is not stored or trained on server-side.

**Why does long text break up, and what should I do?**
All three TTS models share an 8K context and an 8K output ceiling, and the official guidance is to stay under roughly 2500 characters per call; longer inputs tend to lose their tail. Turn on "auto-split and join" and anything past 2500 characters is split on sentence-ending punctuation, the leading style tag is re-added to every piece, everything is synthesised as PCM16 and joined into one WAV in the browser. Two things to keep in mind: every piece is a separately billed upstream call, and with segmentation on the take count is forced to 1.

**Why is streaming only genuinely low-latency on the preset-voice model?**
`/api/tts` passes SSE straight through, but only `mimo-v2.5-tts` returns audio in real time upstream. For `mimo-v2.5-tts-voicedesign` and `mimo-v2.5-tts-voiceclone`, streaming is compatibility mode — the result arrives in one SSE-shaped batch after all inference finishes, so turning it on buys no latency. The interface says so on those two models. Streaming also fixes the format to PCM16 (wrapped into a WAV by the browser), and the format control is disabled while it is on.

**Where is my data?**
Three places. D1 holds four kinds of table: `config` (a single row of UI configuration), `history` (metadata plus the full parameter set for every take), `voices` (the voice library — either a description or the metadata for a reference clip) and `usage` (one row per upstream call). R2 holds the audio itself: history audio under `audio/<id>.wav|mp3`, and a saved clone's reference clip under `voice/<id>.wav|mp3`. The browser holds only the token, the theme preference and a configuration snapshot. Deleting a history entry removes both the D1 row and the R2 object; when `HISTORY_LIMIT` is reached only unstarred entries are pruned, and the object goes first — if that delete fails the row is kept and retried on the next pass, so no object is ever left orphaned with nothing pointing at it.

**What is the difference between a "design" and a "clone" in the voice library?**
A designed voice stores the description text, and the model regenerates the timbre from it on every call — so the same saved voice comes out slightly different between two runs. That is the model's own randomness, not a failed save. A cloned voice stores the reference clip itself (in R2), so the re-creation is deterministic. The badge on each card says which kind it is.

**How should I read upstream errors?**
The server maps upstream status codes onto semantic ones: 401 → the key does not match the billing mode of the endpoint, 402 → `upstream_balance` (insufficient balance), 403 → `upstream_region` (region or risk control), 421 → `upstream_filtered` (blocked by the content policy — rewrite and retry), 429 → `upstream_rate_limited`. For 429 and 5xx, as long as nothing has been streamed to the client yet, the server retries up to three times with backoff and honours `Retry-After`. Account-level limits are 100 RPM and 10M TPM, counted per model across all API keys.

## Changelog — v5

- **The three-layer control model.** Each interface layer now maps to one request field, and that mapping lives in a single place, `public/js/domain/payload.js`. The voice-design model no longer loses its style text and director block; they are folded into the voice description instead.
- **The script is the state.** Tags are no longer kept in parallel state and re-serialised, which removes any chance of the highlight and the request disagreeing.
- **Lossless history restore.** A new `spec` column stores the full parameter set, so "load" restores model, voice, voice description, style, director mode, format, polish and split settings.
- **Takes and grouping.** New `batch_id` / `take_index` / `tokens` / `chars` / `starred` columns bring same-batch grouping, a starred filter and usage stats; the D1 migration is idempotent and upgrades a v4 database on the first request.
- **Long-script segmentation**, **cached auditions**, **playback rates and download**, **using a past take as a clone sample**, **ASR on the clone sample**, and **the voice library** (a designed voice stores its description, a cloned voice stores its reference clip, and either applies in one click).
- **Security.** Playback moved to short-lived HMAC-signed URLs instead of a long-lived token in the query string; CSP, `no-referrer`, `nosniff` and `frame-ancestors 'none'` were added; an unset `CONFIG_TOKEN` now fails closed.
- **Engineering.** A local mock upstream (`MIMO_MOCK`), a usage endpoint with a settings drawer, a pre-paint theme script, v5 design tokens and the brand assets.

## License

MIT, see [LICENSE](LICENSE).

MiMo and related names and marks belong to their respective owners; this project is not affiliated with Xiaomi.
