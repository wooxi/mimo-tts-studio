# Xiaomi MiMo TTS / Audio API — Exhaustive Reference

**Compiled from official documentation only** (plus clearly-labelled secondary sources).
Primary doc host: `https://mimo.mi.com` (the "Xiaomi MiMo API Open Platform" docs; `https://platform.xiaomimimo.com` is the console/marketing host and mostly redirects there).

Doc raw-markdown source of truth (fetchable without JS):
- `https://mimo.mi.com/llms.txt` — full doc index
- `https://mimo.mi.com/llms-full.txt` — all docs concatenated
- `https://mimo.mi.com/static/docs/<path>.md` — individual pages

> ⚠️ **Note on "unconfirmed":** every claim below carries a source URL. Anything not directly stated in an official page is marked **UNCONFIRMED**. No parameter names have been invented.

---

## 1. Endpoint, base URL, authentication

Source: [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md), [First API Call](https://mimo.mi.com/static/docs/quick-start/summary/first-api-call.md)

```
POST https://api.xiaomimimo.com/v1/chat/completions
```

Headers — **two equivalent auth styles**:

```json
api-key: $MIMO_API_KEY
Content-Type: application/json
```
```json
Authorization: Bearer $MIMO_API_KEY
Content-Type: application/json
```

Alternate base URLs (not the public one) from the [First API Call](https://mimo.mi.com/static/docs/quick-start/summary/first-api-call.md) page:

| Plan | OpenAI-compatible BASE_URL | Anthropic-compatible | Key format |
|---|---|---|---|
| Pay-as-you-go | `https://api.xiaomimimo.com/v1` | `https://api.xiaomimimo.com/anthropic` | `sk-xxxxx` |
| Batch inference | `https://batch-api-cn.xiaomimimo.com/v1` | — | `sk-xxxxx` |
| Token Plan | `https://token-plan-cn.xiaomimimo.com/v1` | `https://token-plan-cn.xiaomimimo.com/anthropic` | `tp-xxxxx` (individual) / `ttp-xxxxx` (team) |

Token-Plan and pay-as-you-go keys **cannot be mixed** — mixing them yields `401` ([Error Codes](https://mimo.mi.com/static/docs/api/guidance/error-codes.md), [API Integration FAQ](https://mimo.mi.com/static/docs/quick-start/faq/api-integration.md)).

**There is no `/v1/audio/speech` endpoint.** All TTS goes through `/v1/chat/completions` ([TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md)).

---

## 2. Model IDs (confirmed)

### 2.1 Current TTS models — the complete set

Source: [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md), [List Models](https://mimo.mi.com/static/docs/api/model/list-models.md), [Speech Synthesis usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)

| Model ID | Purpose | Voice source | Notes |
|---|---|---|---|
| `mimo-v2.5-tts` | Preset/built-in voice synthesis | 8 built-in voices | **Supports singing mode**; no voice design, no cloning |
| `mimo-v2.5-tts-voicedesign` | Custom voice from a text description | Generated from description | No singing, no built-in voices, no cloning; supports `optimize_text_preview` |
| `mimo-v2.5-tts-voiceclone` | Clone a voice from a reference audio sample | Base64 audio sample | No singing, no built-in voices, no voice design |

`GET https://api.xiaomimimo.com/v1/models` returns (verbatim from the doc's sample response):

```json
{
  "object": "list",
  "data": [
    { "id": "mimo-v2.5",                  "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.5-asr",              "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.5-pro",              "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.5-tts",              "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.5-tts-voiceclone",   "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.5-tts-voicedesign",  "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.6-flash",            "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.6-pro",              "object": "model", "owned_by": "xiaomi" },
    { "id": "mimo-v2.6-pro-ultraspeed",   "object": "model", "owned_by": "xiaomi" }
  ]
}
```
This list is the authoritative runtime inventory — a studio should call `GET /v1/models` and filter for `*-tts*` rather than hard-coding.

### 2.2 Legacy TTS model (deprecated)

- `mimo-v2-tts` — released 2026-03-18 ([Model Release](https://mimo.mi.com/static/docs/updates/model.md)), **deprecated 2026-06-30**, system-replaced by `mimo-v2.5-tts` from 2026-06-27, with **timbre remapping**: `mimo_default` → `冰糖` on Chinese clusters, `mia` elsewhere ([Model Deprecation](https://mimo.mi.com/static/docs/updates/deprecate.md)).

### 2.3 Non-TTS audio model

- `mimo-v2.5-asr` — speech recognition, same `/v1/chat/completions` endpoint ([ASR API reference](https://mimo.mi.com/static/docs/api/audio/Speech-Recognition.md)).

### 2.4 Realtime variants — **NONE FOUND**

There is **no** `realtime`, `-realtime`, duplex, or WebSocket TTS model or endpoint in the official docs. The [doc index](https://mimo.mi.com/llms.txt) lists exactly two Audio pages (ASR + TTS), both on `/v1/chat/completions`. The phrase "real-time" in the docs refers to (a) the **Real-time Inference API** pricing tier vs. the Batch API, and (b) `mimo-v2.6-pro-ultraspeed` being built for "real-time and latency-sensitive workloads" (a text model). **UNCONFIRMED:** any streaming/duplex voice API.

Note the **streaming caveats** which matter for a studio:
- `mimo-v2.5-tts`: true low-latency streaming is available ("The streaming interface has been restored and returns responses in real time").
- `mimo-v2.5-tts-voicedesign` and `mimo-v2.5-tts-voiceclone`: streaming is **"downgraded to compatibility mode, and only returns the results once in streaming format after all inferences are completed"** — i.e. no latency win, just SSE-shaped output.

Source: [Speech Synthesis usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)

---

## 3. Request schema

### 3.1 Top-level body

Source: [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md)

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | string | ✅ | one of the three TTS IDs |
| `messages` | array | ✅ | see role conventions below |
| `audio` | object | ❌ (but effectively required to get audio) | `{format, voice, optimize_text_preview}` |
| `stream` | boolean | ❌ | default `false`; SSE when `true` |

**There is NO `modalities` parameter documented for MiMo.** (Unlike OpenAI's `modalities: ["text","audio"]`.) The [OpenAI Chat Completions doc](https://mimo.mi.com/static/docs/api/chat/openai-api.md) covers only text models — its `model` enum is `mimo-v2.6-flash`, `mimo-v2.6-pro`, `mimo-v2.6-pro-ultraspeed`, `mimo-v2.5-pro`, `mimo-v2.5` — and its only TTS-related content is a pointer to the TTS page. Likewise **no `speed`, `max_completion_tokens`, `temperature`, `top_p`, `response_format`, or `prefix` is documented for TTS.** Do not send them.

### 3.2 `audio` object

| Field | Type | Default | Notes |
|---|---|---|---|
| `format` | string | `wav` (or `pcm` when `stream:true`) | enum: `wav`, `mp3`, `pcm`, `pcm16`. "Passing in `pcm` or `pcm16` both indicate specifying the use of the `pcm16` format." |
| `voice` | string | `mimo_default` for `mimo-v2.5-tts` | built-in voice ID **or** a `data:` URL base64 sample. Required for voiceclone; **not supported** by voicedesign |
| `optimize_text_preview` | boolean | `false` | LLM-polishes the broadcast text, or auto-generates it if absent. **Only `mimo-v2.5-tts-voicedesign` supports it.** When `true`, the `assistant` message may be omitted |

### 3.3 Message-role convention (this is the key gotcha)

Verbatim from the [usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md):

> - The target text for speech synthesis **must** be filled in the `role` of `assistant` message and **cannot** be placed in the `user` role message.
> - `user` role messages are optional parameters, and instructions can be passed in to adjust the tone and style of speech synthesis, or they can be conversation history (message content **will not appear in synthesized speech**). When using the `mimo-v2.5-tts-voicedesign` model, they are required parameters.

So:

| Role | Carries | Required? |
|---|---|---|
| `user` | Style instructions (natural language). For `voicedesign` this is the **voice description**. May also be conversation history (multi-turn) | Optional for `tts` / `voiceclone`; **required** for `voicedesign`. Exception: may be omitted too when `optimize_text_preview:true`? — doc says required for voicedesign, so keep it. |
| `assistant` | **The exact text to be spoken.** Audio tags go here too | Required, except when `optimize_text_preview:true` on voicedesign |
| `system` / `developer` | **Not documented for TTS** — the TTS schema only permits `user` and `assistant` roles | — |

This is a "leading-text"/prefill-style trick in spirit (the model *continues* the assistant turn as audio), but **there is no `prefix` / `continue_final_message` boolean documented**. UNCONFIRMED whether such a field is accepted.

### 3.4 Minimal non-streaming payload (preset voice)

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    {
      "role": "user",
      "content": "Bright, bouncy, slightly sing-song tone — like you're bursting with good news you can barely hold in. Fast pace, rising pitch at the end."
    },
    {
      "role": "assistant",
      "content": "Hey boss — guess what, guess what? I just got the results back and I actually passed! Not just passed, I got a distinction!"
    }
  ],
  "audio": { "format": "wav", "voice": "Chloe" }
}
```

### 3.5 Streaming payload (must use pcm16)

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    { "role": "user", "content": "Speak warmly and slowly." },
    { "role": "assistant", "content": "Hello, and welcome." }
  ],
  "audio": { "format": "pcm16", "voice": "Chloe" },
  "stream": true
}
```

> Official guidance: *"When using streaming calls, please specify the format of the output audio as `pcm16`, so that it can be spliced into a complete audio."*

### 3.6 Voice design payload

```json
{
  "model": "mimo-v2.5-tts-voicedesign",
  "messages": [
    { "role": "user", "content": "Give me a young male tone." },
    { "role": "assistant", "content": "Yes, I had a sandwich." }
  ],
  "audio": { "format": "wav", "optimize_text_preview": true }
}
```
With `optimize_text_preview: true` the `assistant` message can be omitted entirely (the model writes the script).

### 3.7 Voice clone payload

```json
{
  "model": "mimo-v2.5-tts-voiceclone",
  "messages": [
    { "role": "user", "content": "" },
    { "role": "assistant", "content": "Yes, I had a sandwich." }
  ],
  "audio": {
    "format": "wav",
    "voice": "data:audio/mpeg;base64,$BASE64_AUDIO"
  }
}
```
(Yes — the official example sends `user` with an empty string. `voice` here **must not** be a built-in voice name.)

---

## 4. Voice control

### 4.1 Built-in voices (`mimo-v2.5-tts` only) — complete list

Source: [usage guide, Built-in Voice List](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)

| Voice name | Voice ID (= `audio.voice`) | Language | Gender |
|---|---|---|---|
| MiMo-默认 | `mimo_default` | depends on cluster | — |
| 冰糖 | `冰糖` | Chinese | Female |
| 茉莉 | `茉莉` | Chinese | Female |
| 苏打 | `苏打` | Chinese | Male |
| 白桦 | `白桦` | Chinese | Male |
| Mia | `Mia` | English | Female |
| Chloe | `Chloe` | English | Female |
| Milo | `Milo` | English | Male |
| Dean | `Dean` | English | Male |

- `mimo_default` resolves to **`冰糖` on the China cluster** and **`Mia` on other clusters**.
- Voice IDs are **the Chinese characters themselves** (no ASCII alias) for the four Chinese voices.
- The [MiMo-Skills](https://raw.githubusercontent.com/XiaomiMiMo/MiMo-Skills/main/skills/mimo-v2-5-tts/SKILL.md) skill (official XiaomiMiMo GitHub org, MIT) adds style descriptors: 冰糖=活泼少女, 茉莉=知性女声, 苏打=阳光少年, 白桦=成熟男声, Mia=Lively girl, Chloe=Sweet Dreamy, Milo=Sunny boy, Dean=Steady Gentle.
- **No API endpoint lists voices.** The [doc index](https://mimo.mi.com/llms.txt) has no voices/models-for-voices route; the table above is the only source. A studio must hard-code these or scrape the doc.

### 4.2 VoiceDesign (natural-language voice description)

- Goes in the **`user` message `content`**. **No reference audio, no `voice` field.**
- The model generates a brand-new timbre from the description.
- Officially recommended dimensions ([usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)):
  - **Core:** gender & age ("young woman in her mid-20s"), voice/texture ("deep and gravelly", "silky, mellow, magnetic"), mood/tone, speech speed/rhythm.
  - **Optional richness:** role/character (narrator, podcast host, late-night radio DJ), speaking style, scene description, era reference ("1940s film noir", "1980s dubbed films").
- **Official writing rules:** 1–4 sentences is enough; avoid contradictory traits ("innocent childish voice + CEO aura"); **avoid audio-quality/post-processing terms** (reverb, echo, EQ, compression); avoid vague words ("ordinary", "normal", "foreign"); **Chinese and English descriptions both supported**.
- The synthesized `assistant` text should *match* the designed voice's tone.
- Longer/better-structured prompt guidance (from the official skill): identity anchor (age+gender), vocal texture, pace/rhythm, emotional baseline, optional style/occupation tag, one memorable quirk; 1–2 sentences, no scene, no stage directions, **no real actor or IP character names** (copyright + poor generalization).
- The [MiMo Studio](https://mimo.mi.com/static/docs/updates/feature/studio.md) UI exposes a **"Generate Text"** button that LLM-writes a matching script from the voice description.

### 4.3 VoiceClone (reference audio)

Source: [usage guide, Voice Cloning](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)

| Requirement | Value |
|---|---|
| Field | `audio.voice` (required) |
| Encoding | Data URL: `data:{MIME_TYPE};base64,{BASE64_AUDIO}` |
| MIME types | `audio/mpeg` **or** `audio/mp3`; `audio/wav` |
| Container formats | **only `mp3` and `wav`** |
| Size limit | the **Base64-encoded string must not exceed 10 MB** |
| Min/max duration | **UNCONFIRMED** — no duration limit stated. Marketing says "a reference audio as short as a few seconds" suffices ([launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md)) |
| Sample rate / channels of the reference | **UNCONFIRMED** — not specified |
| Training/fine-tuning | none required; zero-shot, immediately usable |
| Reuse | the cloned timbre "can reuse all the control capabilities of this series" — natural-language instructions in `user`, audio tags, director mode |

Workflow tip from the official skill: save a VoiceDesign output and feed it back as a VoiceClone reference ("design → clone").

---

## 5. Style / emotion / paralinguistic control

There are **two documented control channels**, and their placement in `messages` differs ([usage guide, Style Control](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md)):

| Channel | Where it goes |
|---|---|
| **Natural-language control** | `role: "user"` → `content` |
| **Audio tag control** | `role: "assistant"` → `content` (inline with the spoken text) |

### 5.1 Natural language control (`user.content`)

- A single natural-language sentence is sufficient.
- Documented capabilities:
  - **Multi-style switching** within one utterance (announcement → whisper → roar).
  - **Multi-emotion mixing** ("repressed anger", "smile with a sob", "gentle but tired", "gentleness in mania").
  - **Multi-granularity control**: paragraph → sentence → word → character ("choking, dragging, or breathy sound of a specific character").
- **Director Mode** — a structured 3-layer superset (still just prose in `user.content`). Official English labels:
  - `[Character]` — identity, personality, physical appearance, speaking habits
  - `[Scene]` — what's happening now, who you're talking to, emotional state; more specific is better
  - `[Guidance]` — speed, breath control, pauses, accents, resonance position, timbre texture, emotional fluctuation
  - The Chinese examples use the literal headers `CHARACTER` / `SCENE` / `DIRECTION` (or 角色/场景/指导). **The exact header keywords are not schema-enforced** — it is prose.
  - Documented use cases: character voiceover, film-level content, game NPCs, audio drama, character dialogue; layers "independently updated at their own pace and freely combined" for consistent timbre identity across sentences.

### 5.2 Audio tag control (`assistant.content`)

**Overall style tag at the very beginning:**
- Format: `(Style 1 Style 2)Content to be synthesized`
- Accepted bracket forms: **half-width `()`**, **full-width `（）`**, or **`[]`**.
- Multiple style names inside one pair of parentheses; no restriction on the delimiter.
- Recommended (non-exhaustive — "custom styles not listed are also supported"):

| Style type | Documented examples |
|---|---|
| Basic emotions | Happy, Sad, Angry, Fearful, Amazed, Excited, Wronged, Calm, Indifferent |
| Complex emotions | Melancholy, Relieved, Helpless, Guilty, Jealous, Tired, Apprehensive, Emotional |
| Overall tone | Gentle, Cold, Lively, Serious, Lazy, Playful, Deep, Capable, Sharp |
| Timbre positioning | Magnetic, Mellow, Clear, Ethereal, Innocent, Old, Sweet, Hoarse, Elegant |
| Character tone | Clamp voice (夹子音), Big Sister voice (御姐音), Shota voice (正太音), Uncle voice (大叔音), Taiwanese accent |
| Dialect | Northeast dialect, Sichuan dialect, Henan dialect, Cantonese |
| Role-playing | Sun Wukong, Lin Daiyu |
| Singing | `singing` |

**Inline fine-grained tags at any position:**

| Style type | Documented examples |
|---|---|
| Speech rate & rhythm | Inhale / Take a deep breath / Sigh / Let out a long sigh / Pant / Hold one's breath |
| Emotional state | nervous / scared / excited / tired / wronged / coquettish / guilty / shocked / impatient |
| Speech features | Trembling / Voice trembling / Pitch change / Cracked voice / Nasal voice / Breathiness / Hoarseness |
| Laughing & crying tone | Smile / Chuckle / Laugh out loud / Sneer / Sob / Whimper / Choke / Wail |

**Rules & examples (verbatim from the docs):**
- `(Sighing)After all these years, when I walked down that street again, a part of my heart suddenly felt empty.`
- `(Lazy)Let me sleep for five more minutes... just five minutes, really, for the last time.`
- `(Northeastern dialect)Oh my goodness, it's so cold today! ...`
- `(Cantonese)This is really amazing! Once you've tasted it, you won't forget!`
- `(nervously, takes a deep breath) Hoo... Calm down, calm down. It's just an interview... (speaking faster, muttering) ...`
- Stacking is allowed; the Chinese launch post shows `(急促｜呼喊)` and `(低声｜情绪塌陷般平静)` — a full-width vertical bar `｜` separates combined tags.
- Official skill hard rules: **tags must describe sound-producing things** — tone, emotion, breath, laughter, crying, panting, coughing, yawning, sighing. **Do NOT write physical actions** (turning around, sitting down, waving). Tag language must match the body text (Chinese text → Chinese tags; English text → English tags; never mix). One tag per sentence max as a guideline.

### 5.3 Singing

- **Only `mimo-v2.5-tts` supports singing.** voicedesign and voiceclone explicitly do not.
- Required: put `(唱歌)` at the **very beginning** of the target text, format `(唱歌)lyrics`.
- Equivalent tags: **`唱歌`, `sing`, `singing`** — all produce the same result.
- Lyrics are recommended to be in **Chinese** for better synthesis.
- Skill guidance: the lyrics must be complete — truncated lyrics cause pitch problems.

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    { "role": "assistant",
      "content": "(singing)Forgive me for my unruly and unrestrained love for freedom throughout my life, and I'm also afraid that one day I'll fall, Oh no." }
  ],
  "audio": { "format": "wav", "voice": "冰糖" }
}
```

### 5.4 Speed / rate control

**There is no `speed` parameter.** Rate is controlled **only** in-band:
- natural language in `user.content` ("speaking at an extremely fast pace, like a machine gun", "slow and deliberate"), or
- inline tags in `assistant.content` (`[语速加快]`, `[语速放缓]`, `(speaking faster, muttering)`), or
- punctuation (ellipsis = pause, em-dash = interruption/drawl, ALL CAPS = emphasis; source: [MiMo-Skills](https://raw.githubusercontent.com/XiaomiMiMo/MiMo-Skills/main/skills/mimo-v2-5-tts/SKILL.md)).

### 5.5 Tag support by model — discrepancy to verify

The official [usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md) presents tag control in the general "Style Control" section (implying all models), while the official [MiMo-Skills](https://raw.githubusercontent.com/XiaomiMiMo/MiMo-Skills/main/skills/mimo-v2-5-tts/SKILL.md) skill states explicitly that **`mimo-v2.5-tts-voicedesign` does NOT support audio tag control** (use a longer `--context` description instead), and that `mimo-v2.5-tts` + `mimo-v2.5-tts-voiceclone` do. The model comparison table officially confirms only that voicedesign lacks **singing**, built-in voices, and cloning. → **Treat "voicedesign supports audio tags" as UNCONFIRMED / likely no.**

---

## 6. Audio output

### 6.1 Formats

`audio.format` enum: **`wav`, `mp3`, `pcm`, `pcm16`**.

- Default is `wav`, **or `pcm` when `stream: true`**.
- `pcm` and `pcm16` are the same thing: "both indicate specifying the use of the `pcm16` format".
- **No `opus`, `flac`, `aac`, or `mulaw` option is documented for output.** (Opus appears only in the skill's Feishu delivery step, done client-side with ffmpeg, not via the API.)

Source: [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md)

### 6.2 Sample rate / channels / bit depth

- **PCM16 streaming: 24000 Hz, 16-bit signed little-endian, mono.** Confirmed by inline comments in all three official Python streaming samples: `# 24kHz PCM16LE mono audio`, then `np.frombuffer(pcm_bytes, dtype=np.int16)` and `sf.write(..., samplerate=24000)`.
- **WAV / MP3 sample rate, channel count, and bit depth are NOT documented — UNCONFIRMED.** (Almost certainly also 24 kHz mono, but the docs never say so. A studio should probe with a WAV header parse.)
- The underlying open-source tokenizer works at **24 kHz** input ([arXiv 2512.23808](https://ar5iv.labs.arxiv.org/html/2512.23808): "Given a single-channel audio waveform sampled at 24 kHz").

### 6.3 Non-streaming response shape

Source: [TTS API reference — Chat response object](https://mimo.mi.com/static/docs/api/audio/tts.md)

```json
{
  "id": "<chat completion id>",
  "object": "chat.completion",
  "created": 1790007961,
  "model": "mimo-v2.5-tts",
  "choices": [
    {
      "index": 0,
      "finish_reason": "stop",
      "message": {
        "role": "assistant",
        "content": "<string>",
        "audio": {
          "id": "<unique audio response id>",
          "data": "<BASE64 AUDIO BYTES in the requested format>",
          "expires_at": null,
          "transcript": null
        },
        "final_text_preview": "<polished broadcast text>"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "completion_tokens_details": { "reasoning_tokens": 0 },
    "prompt_tokens_details": { "cached_tokens": 0 }
  }
}
```

Field notes (all verbatim semantics from the doc):
- `choices[].message.audio.data` — **"Base64 encoded audio bytes generated by the model, in the format specified in the request."** ← this is where the audio is, non-streaming.
- `audio.id` — unique identifier for this audio response.
- `audio.expires_at` — "**Currently always `null`**". (Documented type: number|null.)
- `audio.transcript` — "**Currently always `null`**". A studio cannot rely on getting the transcript back.
- `choices[].message.final_text_preview` — **only returned when `optimize_text_preview: true`**; the polished broadcast text actually fed to the model.
- `finish_reason` enum: `stop`, `length`, `content_filter`.
- `usage.completion_tokens_details.reasoning_tokens` — **always `0`**.

### 6.4 Streaming response shape (SSE)

`object` is **`chat.completion.chunk`**; each chunk shares the same `id` and `created`.

```json
{
  "id": "<same for every chunk>",
  "object": "chat.completion.chunk",
  "created": 1790007961,
  "model": "mimo-v2.5-tts",
  "choices": [
    {
      "index": 0,
      "finish_reason": null,
      "delta": {
        "role": "assistant",
        "content": "<string>",
        "audio": {
          "id": "<unique audio response id>",
          "data": "<BASE64 PCM16 CHUNK>",
          "expires_at": null,
          "transcript": null
        },
        "final_text_preview": "<string, only when optimize_text_preview=true>"
      }
    }
  ],
  "usage": { "...": "same shape as non-streaming" }
}
```

- Audio arrives as **base64 in `choices[0].delta.audio.data`** — confirmed by the official Python loop, which also guards `if not chunk.choices: continue`.
- `delta.audio` is typed `object | null` — handle null.
- Concatenate decoded `int16` LE buffers at 24 kHz, then wrap in a WAV header.

**Official client-side accumulation pattern (Python, verbatim structure):**

```python
import base64, os
import numpy as np, soundfile as sf
from openai import OpenAI

client = OpenAI(api_key=os.environ["MIMO_API_KEY"],
                base_url="https://api.xiaomimimo.com/v1")

completion = client.chat.completions.create(
    model="mimo-v2.5-tts",
    messages=[
        {"role": "user", "content": "Bright, bouncy tone. Fast pace, rising pitch at the end."},
        {"role": "assistant", "content": "Hey boss — guess what, I actually passed!"},
    ],
    audio={"format": "pcm16", "voice": "Chloe"},
    stream=True,
)

collected = np.array([], dtype=np.float32)
for chunk in completion:
    if not chunk.choices:
        continue
    audio = getattr(chunk.choices[0].delta, "audio", None)
    if audio is not None:
        pcm_bytes = base64.b64decode(audio["data"])
        collected = np.concatenate(
            (collected, np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0)
        )

os.makedirs("tmp", exist_ok=True)
sf.write("tmp/output.wav", collected, samplerate=24000)
```

---

## 7. Hard limits

| Limit | Value | Source |
|---|---|---|
| `mimo-v2.5-tts*` **context window** | **8K tokens** | [Models](https://mimo.mi.com/static/docs/quick-start/summary/model.md) |
| `mimo-v2.5-tts*` **maximum output** | **8K tokens** | [Models](https://mimo.mi.com/static/docs/quick-start/summary/model.md) |
| TTS **RPM** | **100** (per account, summed across all API keys, per model) | [Rate Limit](https://mimo.mi.com/static/docs/api/guidance/rate-limit.md) |
| TTS **TPM** | **10M** | [Rate Limit](https://mimo.mi.com/static/docs/api/guidance/rate-limit.md) |
| Voice-clone reference audio | Base64 string **≤ 10 MB**, `mp3`/`wav` only | [usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md) |
| Max input **text length** in characters | **Not documented for the API.** The MiMo **Studio UI** caps both the timbre description and the broadcast text at **1024 characters** ("Adjust the timbre descriptions and broadcast text caps of 3 voice large language models, and expand both to 1024 characters", Studio V3.1.1, 2026-05-11) | [Studio changelog](https://mimo.mi.com/static/docs/updates/feature/studio.md) |
| Community guidance on splitting | The official skill advises generating in one shot and only splitting above **2500 Chinese characters** — **unofficial, not an API limit** | [MiMo-Skills](https://raw.githubusercontent.com/XiaomiMiMo/MiMo-Skills/main/skills/mimo-v2-5-tts/SKILL.md) |
| **Max output audio duration** | **UNCONFIRMED** — no seconds/minutes limit is published anywhere | — |
| **Max output audio file size** | **UNCONFIRMED** | — |
| Simultaneous voices / multi-speaker | **UNCONFIRMED** as an explicit feature. Director Mode examples describe single-speaker performance; the launch post's agent demo shows Grandpa + grandson dialogue but as an agent-orchestrated pipeline, not one API call | [launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md) |
| Batch API support for TTS | **Not documented.** Batch pricing tables list only language models + ASR | [Pay-As-You-Go](https://mimo.mi.com/static/docs/price/pay-as-you-go.md) |
| Pricing | **Free for a limited time** for all three TTS models | [Pay-As-You-Go](https://mimo.mi.com/static/docs/price/pay-as-you-go.md) |

### Error codes (relevant to a studio)

Source: [Error Codes](https://mimo.mi.com/static/docs/api/guidance/error-codes.md)

| Code | Meaning | Studio handling |
|---|---|---|
| 400 | Invalid format | check JSON, required params, message format, model existence, multimodal format/size |
| 401 | Auth fails | wrong key type (Token-Plan vs pay-as-you-go cannot be mixed), bad header format |
| 402 | Insufficient balance | — |
| 403 | Forbidden | region unavailable or key risk-controlled |
| 404 | Not found | endpoint/model unsupported |
| **421** | **Content Filter** — content moderation blocked | show a moderation message |
| 429 | Too many requests / Token-Plan quota exhausted | exponential backoff |
| 500 / 503 | Server error / overloaded | retry with backoff |

---

## 8. Other capabilities a UI can exploit

### 8.1 Speech recognition (`mimo-v2.5-asr`) — same endpoint

Source: [ASR API reference](https://mimo.mi.com/static/docs/api/audio/Speech-Recognition.md), [ASR usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/Speech-Recognition.md)

```json
{
  "model": "mimo-v2.5-asr",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_audio",
          "input_audio": { "data": "data:audio/wav;base64,$BASE64_AUDIO" }
        }
      ]
    }
  ],
  "asr_options": { "language": "en" }
}
```

- `asr_options.language`: `auto` (default) | `zh` | `en`. Manual selection recommended when the language is known.
- Input audio: **`mp3` / `wav` only**; MIME `audio/mpeg`|`audio/mp3`|`audio/wav`; Base64 string **≤ 10 MB**. Two input modes: data URL (`format` optional) or pure Base64 (**then `format` is required**); if both are present they must agree.
- **Only single audio input is supported** for ASR.
- Extra usage fields: `usage.prompt_tokens_details.audio_tokens`, `usage.seconds` (audio duration in seconds).
- Limits: context **8K**, max output **2K**, RPM **100**, TPM **10K**.
- Billing: by input audio duration, accurate to the second → **¥0.5/h** domestic, **$0.074/h** overseas.
- Capabilities: zh/en bilingual + auto-detect; dialects **Wu, Cantonese, Minnan, Sichuan**; Chinese–English **code-switching** without preset language labels; **lyrics transcription** in mixed vocal/instrumental tracks; robust to noise, far-field, multi-speaker overlap; precise on classical poetry, technical terms, proper nouns, place names; **native punctuation**.
- **Open-sourced**: [github.com/XiaomiMiMo/MiMo-V2.5-ASR](https://github.com/XiaomiMiMo/MiMo-V2.5-ASR), [HF weights](https://huggingface.co/XiaomiMiMo/MiMo-V2.5-ASR) — per the [launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md).

### 8.2 Audio understanding (for "listen back" / QA of generated audio)

Source: [Audio Understanding](https://mimo.mi.com/static/docs/quick-start/usage-guide/multimodal-understanding/audio-understanding.md)

- Models: `mimo-v2.6-flash`, `mimo-v2.6-pro`, `mimo-v2.6-pro-ultraspeed`, `mimo-v2.5`.
- Input via `{"type":"input_audio","input_audio":{"data": "<public URL or data:...;base64,...>"}}`, optionally plus a `{"type":"text",...}` part.
- **Formats: MP3, WAV, FLAC, M4A, OGG.** Size: URL ≤ **100 MB**; Base64 string ≤ **50 MB**.
- **Audio token estimate: `Total tokens ≈ audio duration (seconds) × 6.25`.** (Matches the 6.25 Hz patch rate of the open-source architecture.)
- Local file upload not supported for real-time inference.
- The launch post frames this as the "listening back and evaluation" leg of a closed-loop agent pipeline (`mimo-v2.5-pro` plans → TTS series performs → `mimo-v2.5` evaluates).

### 8.3 Multi-turn

The TTS usage guide says `user` messages "can be conversation history". So the endpoint tolerates a prior-turn transcript in `messages`, but the **only spoken text is the final `assistant` message**, and the docs never promise cross-turn voice consistency. **Multi-turn *audio* conversation (audio-in → audio-out in one call) is UNCONFIRMED / not documented for the TTS models.**

### 8.4 Capability checklist

| Capability | Status | Source |
|---|---|---|
| Built-in preset voices | ✅ 8 voices | [usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md) |
| Voice design from text | ✅ `voicedesign` | same |
| Zero-shot voice clone from sample | ✅ `voiceclone`, mp3/wav, ≤10 MB base64 | same |
| Style transfer / emotion control | ✅ both natural language + tags | same |
| Director Mode (character/scene/guidance) | ✅ prose in `user.content` | same |
| Multi-style switching inside one segment | ✅ | same |
| Multi-granularity (paragraph→character) | ✅ | same |
| **Singing** | ✅ `mimo-v2.5-tts` only, `(唱歌)`/`(sing)`/`(singing)` | same |
| **Dialects / accents** | ✅ Northeast, Sichuan, Henan, Cantonese, Taiwanese accent | same |
| **Code-switching zh/en** | ✅ implicitly — both languages supported for text, voices and descriptions. Explicitly claimed only for **ASR** ("Chinese-English Code-Switch") | [launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md) |
| **Laughter / crying / cough / sigh / breath / trembling** | ✅ via inline tags | same |
| Role-play characters (Sun Wukong, Lin Daiyu) | ✅ tag values | same |
| Plain-text emotional reading (no tags, no prompt) | ✅ "rich text comprehension" | [launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md) |
| ALL-CAPS → emphasis; repeated words → rhythm | ✅ (legacy `mimo-v2-tts` page, but same family) | [v2-tts release](https://mimo.mi.com/static/docs/news/previous-news/v2-tts-release.md) |
| Auto text polish / auto script generation | ✅ `optimize_text_preview`, voicedesign only | [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md) |
| Streaming output | ✅ real-time for `mimo-v2.5-tts`; compatibility-only for voicedesign/voiceclone | [usage guide](https://mimo.mi.com/static/docs/quick-start/usage-guide/audio/speech-synthesis-v2.5.md) |
| Speech-to-text | ✅ separate `mimo-v2.5-asr` model | [ASR](https://mimo.mi.com/static/docs/api/audio/Speech-Recognition.md) |
| Audio understanding / captioning / QA | ✅ via `mimo-v2.5` / `mimo-v2.6-*` | [Audio Understanding](https://mimo.mi.com/static/docs/quick-start/usage-guide/multimodal-understanding/audio-understanding.md) |
| Voice conversion (audio→audio, one call) | ❌ not in the hosted API. The open-source **MiMo-Audio-7B-Base** does it few-shot | [arXiv 2512.23808](https://ar5iv.labs.arxiv.org/html/2512.23808) |
| Sound effects / music generation | ❌ "next step" roadmap only | [launch post](https://mimo.mi.com/static/docs/news/latest/v2.5-tts-release.md) |
| Realtime duplex / WebSocket | ❌ not documented | [doc index](https://mimo.mi.com/llms.txt) |
| `transcript` in TTS response | ❌ always `null` | [TTS API reference](https://mimo.mi.com/static/docs/api/audio/tts.md) |

### 8.5 Agent/tooling integration

- Xiaomi open-sourced an **agent skill** for the TTS models: [github.com/XiaomiMiMo/MiMo-Skills](https://github.com/XiaomiMiMo/MiMo-Skills) (MIT), skill name `mimo-v2-5-tts`. It ships `mimo_tts.py`, `mimo_tts_voicedesign.py`, `mimo_tts_voiceclone.py`. Install with `npx skills add XiaomiMiMo/MiMo-Skills`. Env: `MIMO_API_KEY`.
- MiMo Studio (the official web playground) is at **https://aistudio.xiaomimimo.com/#/c** — useful as a behavioral reference implementation. Features visible in its changelog: 8 premium voices, multiple broadcast modes, long-text timbre description, **AI-optimized style description and broadcast text**, **online recording AND local file upload** for cloning, one-click audio export, Chinese/English + PC/mobile.

---

## 9. Complete worked examples

### 9.1 cURL — preset voice, non-streaming

```bash
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "mimo-v2.5-tts",
    "messages": [
        {
            "role": "user",
            "content": "Bright, bouncy, slightly sing-song tone — like you are bursting with good news you can barely hold in. Fast pace, rising pitch at the end."
        },
        {
            "role": "assistant",
            "content": "Hey boss — guess what, guess what? I just got the results back and I actually passed!"
        }
    ],
    "audio": {
        "format": "wav",
        "voice": "Chloe"
    }
}'
```

### 9.2 Python — preset voice, non-streaming

```python
import os, base64
from openai import OpenAI

client = OpenAI(api_key=os.environ["MIMO_API_KEY"],
                base_url="https://api.xiaomimimo.com/v1")

completion = client.chat.completions.create(
    model="mimo-v2.5-tts",
    messages=[
        {"role": "user", "content": "Bright, bouncy, slightly sing-song tone."},
        {"role": "assistant", "content": "Hey boss — guess what, I actually passed!"},
    ],
    audio={"format": "wav", "voice": "Chloe"},
)

message = completion.choices[0].message
with open("audio_file.wav", "wb") as f:
    f.write(base64.b64decode(message.audio.data))
```

### 9.3 Voice clone — non-streaming

```python
import base64, os
from openai import OpenAI

client = OpenAI(api_key=os.environ["MIMO_API_KEY"],
                base_url="https://api.xiaomimimo.com/v1")

with open("voice.mp3", "rb") as f:
    voice_base64 = base64.b64encode(f.read()).decode("utf-8")

completion = client.chat.completions.create(
    model="mimo-v2.5-tts-voiceclone",
    messages=[
        {"role": "user", "content": ""},
        {"role": "assistant", "content": "Yes, I had a sandwich."},
    ],
    audio={"format": "wav", "voice": f"data:audio/mpeg;base64,{voice_base64}"},
)
open("audio_file.wav", "wb").write(base64.b64decode(completion.choices[0].message.audio.data))
```

### 9.4 Voice design + auto script

```python
completion = client.chat.completions.create(
    model="mimo-v2.5-tts-voicedesign",
    messages=[
        {"role": "user", "content": "An elderly gentleman, speaking Mandarin with a northern accent, "
                                    "his speech slow and steady, his voice slightly hoarse and weathered."},
        {"role": "assistant", "content": "Yes, I had a sandwich."},
    ],
    audio={"format": "wav", "optimize_text_preview": True},
)
print(completion.choices[0].message.final_text_preview)   # polish result, if returned
```

### 9.5 Director Mode (prose in `user.content`)

```json
{
  "model": "mimo-v2.5-tts",
  "messages": [
    {
      "role": "user",
      "content": "Character: The current head of a century-old noble family. Adopted at birth and raised by the temple gatekeeper, molded into a flawless, emotionless family totem; long in seclusion, with a strong sense of class alienation.\n\nScene: In the shadows of the ancestral hall, she watches the man who broke through the security cordon to find her and attempts to elope. She will strangle both him and her own newly-sprouted feelings with the coldest class barriers.\n\nGuidance: A cold, languid yet imposing deep-voiced mature woman. Relaxed vocal tract, no tension, yet a bone-chilling oppression. Speed and pauses: extremely slow, each word rolled on the tongue before being uttered; extremely long, unsettling pauses between sentences. Mostly no pitch fluctuation, heavy and hard full voice, but a very slight breathy sound on certain final sounds."
    },
    {
      "role": "assistant",
      "content": "You asked for my mercy, for sweet rain to wash this muddy world clean. But this world's ills can only be scraped clean by fire. Close your eyes."
    }
  ],
  "audio": { "format": "wav", "voice": "白桦" }
}
```

---

## 10. Open-source / research lineage (context, not the hosted API)

Source: [XiaomiMiMo/MiMo-Audio README](https://raw.githubusercontent.com/XiaomiMiMo/MiMo-Audio/main/README.md), [HF model card](https://huggingface.co/XiaomiMiMo/MiMo-Audio-7B-Instruct/raw/main/README.md), [arXiv 2512.23808](https://ar5iv.labs.arxiv.org/html/2512.23808)

- **MiMo-Audio-Tokenizer** — 1.2B-param Transformer, **25 Hz** frame rate, **8-layer RVQ**, **200 tokens/second**, 20-layer RVQ (first two codebooks 1024 entries, rest 128), trained on a 10M-hour corpus; **24 kHz** mono input; ~1.55 kbps effective bitrate.
- **MiMo-Audio** — patch encoder + LLM + patch decoder. Patch encoder packs **4 RVQ timesteps into one patch → 6.25 Hz** for the LLM; patch decoder regenerates the full 25 Hz sequence with delayed generation. (This is exactly the `× 6.25` in the hosted audio-token formula.)
- Checkpoints: `MiMo-Audio-Tokenizer`, **`MiMo-Audio-7B-Base`**, **`MiMo-Audio-7B-Instruct`**; license **MIT**.
- Pretraining data: **>100 million hours**.
- **Few-shot / emergent** (Base): voice conversion, style transfer, speech editing, speech rate control, denoising, speech translation, speech continuation (talk shows, recitations, livestreaming, debates).
- **Instruct** SOTA claims: MMSU, MMAU, MMAR, MMAU-Pro (audio understanding); Big Bench Audio, MultiChallenge Audio (spoken dialogue); instruct-TTS comparable to **GPT-4o-mini-tts**.
- A **`MiMo-TTS-7B`** was trained on 7M+ hours to convert text conversations into speech (used to build spoken-dialogue data).
- Also: `MiMo-V2.5-ASR` is open-sourced (GitHub + HF).
- ⚠️ The relationship between these open weights and the hosted `mimo-v2.5-tts*` API models is **not stated** by Xiaomi — **UNCONFIRMED**.

---

## 11. Secondary / non-official corroboration (use with caution)

- **`mimo-api`** (npm, community TypeScript SDK, MIT, "not affiliated with Xiaomi") — [README](https://cdn.jsdelivr.net/npm/mimo-api@0.1.0/README.md). Its TTS/voice-design/voice-clone examples match the official schema exactly, and it lists `mimo-v2.5-tts*` as **8K context / 8K max output** and a legacy `mimo-v2-tts` (8K/8K). It adds an **audio-understanding `input_audio.format` field** (`"format": "wav"`) — the official audio-understanding doc shows only `data`, so treat the explicit `format` there as unofficial.
- Aggregator/model-catalog pages (models.sulat.com, routin.ai) surfaced in search but add nothing beyond the official docs and were not used for any fact above.

---

## 12. Uncertainties / gaps — verify against the live API

1. **WAV/MP3 output parameters.** Only PCM16 (24 kHz, mono, LE) is documented. Confirm actual WAV sample rate / channels / bit depth and MP3 bitrate + sample rate by decoding a real response.
2. **Max input text length.** No character or token limit is published for the TTS text. The 8K context is the only hard bound. The **1024-character** cap is a *Studio UI* limit, not proven to be an API limit. Test where 400s start.
3. **Max output audio duration / file size.** Completely undocumented. Measure the longest single-call output and whether it degrades or truncates.
4. **Whether `modalities: ["text","audio"]` is accepted.** Not documented; the official TTS examples omit it. It may be silently ignored or cause a 400. Test explicitly — do not assume OpenAI parity.
5. **Whether `audio.voice` needs to be present at all for `mimo-v2.5-tts`.** The doc calls it optional with default `mimo_default`; test omitting it.
6. **voicedesign + audio tags.** Officially ambiguous (see §5.5). Test whether inline `(...)`/`[...]` tags are honored or read literally.
7. **voicedesign + `optimize_text_preview:false` without an `assistant` message** — confirm it errors.
8. **`voiceclone` + audio tags + director mode** — the docs say the cloned timbre "can reuse all the control capabilities"; verify tags actually fire.
9. **Reference-audio duration window** for cloning (min/max seconds) and whether the service re-encodes/resamples non-24 kHz input.
10. **Multi-speaker / dialogue in a single call.** The Director Mode demo and the agent demo imply it but no parameter exists. Test whether one call can voice two characters.
11. **`mimo_default` cluster resolution.** Verify what `mimo_default` actually resolves to on *your* account's cluster (China = 冰糖, elsewhere = Mia) — this affects reproducibility.
12. **`final_text_preview` presence.** Confirm it appears in *streaming* deltas as well as non-streaming, and whether it's the first, last, or repeated in every chunk.
13. **`usage` semantics for TTS.** The doc shows `total_tokens` etc. but it is unclear whether audio output is metered in these tokens (billing is currently free). Verify whether `completion_tokens` reflects audio tokens.
14. **`finish_reason: "length"` for TTS** — what actually happens when the 8K output is hit (truncated audio vs. error)?
15. **Batch API support for TTS models.** Not documented; batch pricing lists only language models and ASR. Test whether `mimo-v2.5-tts` works via the batch endpoint.
16. **Rate limiting is per-model per-account, summed across keys.** Confirm the TTS bucket is separate from the language-model bucket (the doc implies per-model buckets).
17. **CORS / browser-direct calls.** **Not documented at all.** For any "front-end studio", assume a server-side proxy is required so the `api-key` is never shipped to the browser. Verify the API's CORS headers before attempting direct browser calls.
18. **Streaming chunk cadence and first-byte latency** for `mimo-v2.5-tts`; confirm the voicedesign/voiceclone "compatibility mode" really emits one big chunk.
19. **`system` / `developer` role with TTS models** — undocumented; the TTS schema lists only `user` and `assistant`. Test whether extra roles are rejected.
20. **Content moderation (HTTP 421) behavior on TTS specifically** — e.g. whether lyric/role-play tags can trip it.
