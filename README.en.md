<img src="public/brand/logo.svg" width="84" alt="MiMo TTS Studio">

# MiMo TTS Studio

A self-hosted studio for the Xiaomi MiMo speech models: preset voices, voice design and zero-shot voice cloning, plus speech recognition, behind one UI. Runs on Cloudflare Workers + D1 + R2 with a zero-build frontend.

The API key and upstream endpoint live only in Worker vars and secrets — the browser never sees them, and every synthesis request is proxied server-side.

[中文](README.md) · [Design baseline](DESIGN.md) · [Brand assets](public/brand/README.md)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020)
![License](https://img.shields.io/badge/license-MIT-3da639)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wooxi/mimo-tts-studio)

## Features

**Speech**

| Feature | Notes |
| --- | --- |
| Preset voices | 8 named voices + `mimo_default`, card picker; per-voice audition, cached per page |
| Voice design | Describe a voice in a sentence; built-in examples; optional text optimisation |
| Voice clone | Drop or pick an mp3/wav sample with waveform, duration and size; samples are sent per request only |
| Voice library | Save designed voices (as prompts) and cloned voices (reference audio in R2); one-click apply |
| Speech recognition | Read a clone sample back with `mimo-v2.5-asr`; fills the script when it is empty |
| Singing | Moves `(唱歌)` to the front of the script (preset-voice model only) |

**Direction & control**

| Feature | Notes |
| --- | --- |
| Three layers | Voice / direction / script map to `audio.voice`, `messages[role=user]` and `messages[role=assistant]` |
| Natural-language direction | Style text never gets spoken — it only directs the performance |
| Director mode | Role / scene / guidance fields with a one-click example; omitted when empty |
| Style tags | A leading `(tag)` group: emotion, tone, timbre, persona, dialect, role-play — searchable |
| Inline tags | `(tag)` anywhere: pacing, emotion, voice qualities, laugh/cry; Chinese/English by script language |
| Request preview | Live JSON of the exact request (clone samples elided), copyable as cURL |

**Workflow**

| Feature | Notes |
| --- | --- |
| Take comparison | Generate 1–3 takes per run, each with its own waveform |
| Long text | Over 2500 chars splits by sentence, synthesises each part, concatenates to one WAV in the browser |
| History | Metadata in D1, audio in R2: search, star, paginate, delete, restore all parameters |
| Player | Waveform, scrub, 0.75–1.5× speed, download, "use as clone sample" |
| Retention | Keeps the newest 200 takes by default; oldest unstarred rows are pruned (object first, then row) |

**Engineering**

| Point | Notes |
| --- | --- |
| Zero build | Native ES modules + CSS custom properties; no bundler, no external fonts, no CDN |
| Secrets stay server-side | `MIMO_API_KEY` is a Worker secret; endpoint and limits are Worker vars; the UI has no connection settings at all |
| Signed playback | `/audio/:id?exp&sig` HMAC-SHA256 URLs, Range and HEAD capable |
| Security headers | Same-origin CSP plus `no-referrer`, `nosniff`, `frame-ancestors 'none'`, applied by the Worker to every response |
| Fail-closed | Without `CONFIG_TOKEN` every API request is refused |
| Usage stats | One row per upstream call; the settings drawer shows 30-day calls, characters, audio bytes and per-model split |
| Themes | auto / light / dark, applied before first paint |
| Mock upstream | `npm run dev:mock` returns structurally real WAV / SSE without spending quota |

## Deploying

**Prerequisites**: Node 20+, a Cloudflare account, and a [MiMo](https://mimo.mi.com) API key (pay-as-you-go and Token Plan keys are not interchangeable).

```bash
npm install
npx wrangler login

# 1. Create resources
npx wrangler d1 create mimo-tts-db          # put the printed database_id into wrangler.toml
npx wrangler r2 bucket create mimo-tts-audio

# 2. Create tables (optional; the Worker also creates and migrates them on first request)
npm run db:remote

# 3. Two secrets
npx wrangler secret put MIMO_API_KEY        # MiMo API key
npx wrangler secret put CONFIG_TOKEN        # access token you choose; entered in the UI

# 4. Ship
npm run deploy
```

Open the Worker URL and enter the `CONFIG_TOKEN` on first visit (it stays in that browser only).

Using a Token Plan key? Point `UPSTREAM_URL` at `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`.

Upgrading an existing deployment: just `npm run deploy` — the schema aligns itself on the first request.

**Continuous deployment**: `.github/workflows/deploy.yml` deploys on pushes to `main`; set `CF_API_TOKEN` and `CF_ACCOUNT_ID` in the repository secrets. D1 / R2 still need to be created once, as above.

## Configuration

All connection settings live on the Worker side. `[vars]` in `wrangler.toml`:

| Var | Default | Purpose |
| --- | --- | --- |
| `UPSTREAM_URL` | `https://api.xiaomimimo.com/v1/chat/completions` | OpenAI-compatible endpoint (Token Plan: `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`) |
| `HISTORY_LIMIT` | `200` | Takes to retain; oldest unstarred rows are pruned |
| `MAX_AUDIO_BYTES` | `26214400` | Hard per-object limit (25MB) |
| `AUDIO_URL_TTL` | `1800` | Signed playback URL lifetime, seconds |
| `MIMO_MOCK` | unset | `"1"` enables the mock upstream (development only) |
| `ALLOWED_ORIGINS` | unset | Comma-separated CORS allow-list; empty means same-origin only |

Secrets (`wrangler secret put`):

| Secret | Required | Purpose |
| --- | --- | --- |
| `MIMO_API_KEY` | yes | MiMo key, sent upstream as the `api-key` header |
| `CONFIG_TOKEN` | yes | Access token; without it every API route is refused (fail-closed) |

The UI never asks for, stores or displays any of these.

## Local development

```bash
npm run dev              # wrangler dev; secrets come from .dev.vars
npm run dev:mock         # MIMO_MOCK=1: mock upstream
npm run db:local         # create tables in the local D1
npm run brand            # regenerate brand asset drafts
```

Where workerd is unavailable (locked-down environments, CI), the real Worker source can be loaded by plain Node:

```bash
node scripts/local-harness.mjs          # http://127.0.0.1:8787, CONFIG_TOKEN=devtoken, mock upstream
node scripts/smoke.mjs                  # 93 end-to-end assertions: auth, migration, Range, SSE, library, headers
node scripts/check-failclosed.mjs       # refusal behaviour with CONFIG_TOKEN unset
node scripts/check-migration.mjs        # v4 → v5 database migration path (40 checks)
node scripts/check-live.mjs https://…   # verify a deployed instance: headers, build markers, access control
```

`scripts/local-harness.mjs` shims D1 / R2 with `node:sqlite` and an in-memory map, leaving `src/` untouched. It reads `.dev.vars` exactly like `wrangler dev`:

```ini
# .dev.vars (already in .gitignore)
MIMO_API_KEY=your-mimo-key
MIMO_MOCK=0          # only 0 reaches the real upstream; anything else stays on the mock
CONFIG_TOKEN=devtoken
```

The mock-by-default behaviour is deliberate: a real key can sit in `.dev.vars` without any routine test spending quota.

With a real key, `node scripts/check-upstream.mjs` verifies what only the live API can settle (actual WAV sample rate and bit depth, MP3 container shape, streaming response details, ASR response shape). Values printed with `·` can be filled back into `docs/mimo-api-reference.md`.

## Layout

```
wrangler.toml          Worker name, assets, D1 / R2 bindings, vars
src/worker.js          entry: routing, asset serving, security headers
src/routes/            tts (proxy) / asr / config / history / audio / voices
src/lib/               auth (token & signatures) / db / upstream (retry, error mapping) / http / mock
src/db/schema.sql      authoritative D1 schema, idempotent
public/index.html      app shell
public/css/            tokens / base / components / app
public/js/             boot · main · synth · core / domain / views
public/brand/          marks and share card
scripts/               local harness, smoke & check suites, brand generation
docs/mimo-api-reference.md   verified facts about the upstream API
```

## Keyboard

| Key | Action |
| --- | --- |
| `⌘` / `Ctrl` + `Enter` | Synthesise |
| `Esc` | Cancel the running request |
| `Space` | Play / pause |
| `←` / `→` | Seek back / forward 3s |
| `Shift` + `←` / `→` | Seek back / forward 10s |

Playback shortcuts apply when focus is not in a text field and a take is loaded.

## Notes

- **`mimo_default` resolves per cluster** (「冰糖」 on the China cluster, Mia elsewhere) and synthesis itself is stochastic. Pick a named voice for reproducible output.
- **Clone samples**: mp3 / wav only, ≤ 10MB after Base64 (≈ 7.5MB on disk). Sent per request only; nothing is stored or trained server-side.
- **Long text**: all three TTS models share an 8K context; the official guidance is to stay around 2500 characters per call. Auto-split segments by sentence, synthesises each part and concatenates to one WAV — each part is billed separately.
- **Streaming**: only `mimo-v2.5-tts` streams with true low latency; the other two are compatibility-mode. Streaming and splitting both force PCM16, wrapped to WAV in the browser.
- **Storage**: D1 holds `config` / `history` / `voices` / `usage`; R2 holds audio objects. The browser stores only the access token, a theme preference and a config snapshot.
- **Upstream errors** are translated: 401 auth failure, 402 balance, 403 region or moderation, 421 blocked by safety policy, 429 rate limit; 429s and 5xx retry up to three times.

## License

MIT — see [LICENSE](LICENSE).

MiMo and related names and marks belong to their respective owners; this project is not affiliated with Xiaomi.
