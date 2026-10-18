/**
 * Layer ① — 音色.
 *
 * Answers "who is speaking", which is the one thing the three models differ
 * on. Preset voices get a grid you can audition; VoiceDesign gets a description
 * field with the official writing guidance; VoiceClone gets a drop zone with a
 * real waveform so you can see what you are about to clone.
 */

import { h, setChildren, $, formatBytes, formatClock } from "../core/dom.js";
import { ic } from "../icons.js";
import { PRESET_VOICES, modelOf, LIMITS } from "../domain/models.js";
import { fileToDataUrl, dataUrlBytes, peaks, decode, durationOf } from "../domain/audio.js";
import { post } from "../core/api.js";

/* Audition renders are cached per voice for the life of the page — they are
   real API calls, so re-clicking must never re-bill. */
const auditions = new Map();
let auditioning = null;

export function initVoice(ctx) {
  const root = $("#voicePanel");
  const rerender = () => render(root, ctx);
  ctx.onRefresh.push(rerender);
  rerender();
  return rerender;
}

function render(root, ctx) {
  const s = ctx.store.get();
  const model = modelOf(s.model);

  if (model.caps.presetVoices) return renderPresets(root, ctx);
  if (model.caps.voiceDesign) return renderDesign(root, ctx);
  return renderClone(root, ctx);
}

/* --------------------------------------------------------------- presets -- */

function renderPresets(root, ctx) {
  const s = ctx.store.get();

  // A radiogroup rather than a row of buttons: the audition control is a real
  // button, and a button cannot legally contain another button.
  const grid = h("div", {
    class: "voice-grid",
    role: "radiogroup",
    "aria-label": "预置音色",
  });

  for (const v of PRESET_VOICES) {
    const busy = auditioning === v.id;
    const pick = s.voice === v.id;

    const card = h(
      "div",
      {
        class: `voice-card${busy ? " is-busy" : ""}`,
        role: "radio",
        tabindex: pick ? "0" : "-1",
        "aria-checked": String(pick),
        dataset: { voice: v.id },
        onclick: () => ctx.set({ voice: v.id }),
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ctx.set({ voice: v.id });
          }
        },
      },
      h(
        "span",
        { class: "vc-head" },
        h("span", { class: "vc-name", text: v.name }),
        h("span", {
          class: "vc-tag",
          text: [v.lang, v.gender].filter(Boolean).join(" "),
        }),
      ),
      h("span", { class: "vc-meta", text: v.style }),
      h("button", {
        type: "button",
        class: "vc-audition",
        title: `试听 ${v.name}`,
        "aria-label": `试听 ${v.name}`,
        html: ic("play"),
        onclick: (e) => {
          e.stopPropagation();
          audition(v, ctx);
        },
      }),
    );
    grid.append(card);
  }

  const note =
    s.voice === "mimo_default"
      ? "mimo_default 的具体嗓音取决于部署集群：中国集群为「冰糖」，其他集群为「Mia」。想固定结果请直接选一个具名音色。"
      : "点卡片右侧的 ▶ 试听。试听结果会缓存在本页，重复点击不会重复计费。";

  setChildren(root, grid, h("p", { class: "note", text: note }));
}

async function audition(voice, ctx) {
  if (auditioning) return;

  if (auditions.has(voice.id)) {
    playUrl(auditions.get(voice.id));
    ctx.toast(`试听 ${voice.name}`, "ok");
    return;
  }

  auditioning = voice.id;
  ctx.refresh();

  const line =
    voice.lang === "英文"
      ? `Hi, I'm ${voice.name}. This is how I sound.`
      : `你好，我是${voice.name}。这是我的声音。`;

  try {
    const data = await post("/api/tts", {
      model: "mimo-v2.5-tts",
      messages: [{ role: "assistant", content: line }],
      audio: { format: "wav", voice: voice.id },
    });
    const b64 = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) throw new Error("没有返回音频");

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    auditions.set(voice.id, url);
    playUrl(url);
    ctx.toast(`试听 ${voice.name}`, "ok");
  } catch (e) {
    ctx.toast(`试听失败：${e.message}`, "err");
  } finally {
    auditioning = null;
    ctx.refresh();
  }
}

let auditionEl = null;
function playUrl(url) {
  if (!auditionEl) auditionEl = new Audio();
  auditionEl.src = url;
  auditionEl.play().catch(() => {});
}

/* --------------------------------------------------------------- design --- */

const DESIGN_EXAMPLES = [
  {
    label: "深夜电台",
    text: "青年女性，气声偏多，共鸣位置靠前，语速缓慢而松弛，情绪底色温柔克制。深夜电台主持人风格，字尾偶尔带一点气音收束。",
  },
  {
    label: "电竞解说",
    text: "青年男性，电竞解说风格，语速极快且连贯，带明显气口和爆发性强调，兴奋时声音上扬尖锐。",
  },
  {
    label: "美食评论",
    text: "中年女性，美食评论家风格，语调绵柔富感染力，描述时带夸张的回味与陶醉感，偶尔闭眼吸气。",
  },
  {
    label: "法庭陈词",
    text: "中年男性，法庭陈词风格，声线沉稳偏正式，吐字工整字字顿挫，情绪克制但每个词都很重。",
  },
];

function renderDesign(root, ctx) {
  const s = ctx.store.get();

  const ta = h("textarea", {
    id: "voiceDesign",
    rows: 4,
    placeholder:
      "只描写这副声音本身：年龄段 + 性别、声音质感、语速节奏、情绪底色。不要写场景和动作。",
    value: s.voiceDesign,
    oninput: (e) => ctx.set({ voiceDesign: e.target.value }),
  });

  const examples = h(
    "div",
    { class: "chip-row" },
    ...DESIGN_EXAMPLES.map((ex) =>
      h("button", {
        type: "button",
        class: "pill-btn",
        text: ex.label,
        title: ex.text,
        onclick: () => ctx.set({ voiceDesign: ex.text }),
      }),
    ),
  );

  const optimize = toggleRow(
    "智能润色播报文本",
    s.optimize,
    (on) => ctx.set({ optimize: on }),
  );

  setChildren(
    root,
    h(
      "div",
      { class: "field" },
      h(
        "div",
        { class: "field-head" },
        h("label", { class: "label", for: "voiceDesign", text: "音色描述" }),
        h("span", {
          class: "hint mono",
          text: `${s.voiceDesign.length} 字`,
        }),
      ),
      ta,
      h("p", {
        class: "note",
        text: "四要素：身份锚点（年龄+性别）· 声音质感 · 语速节奏 · 情绪底色。1–4 句即可，写长了反而模糊。",
      }),
    ),
    h(
      "div",
      { class: "field" },
      h("span", { class: "label", text: "快速开始" }),
      examples,
    ),
    optimize,
    h("p", {
      class: "note",
      text: s.optimize
        ? "开启后，即使不写台词，模型也会根据音色描述自动生成一段合适的播报文本，并回传润色后的最终文本。"
        : "关闭后必须自己写台词。",
    }),
    h(
      "div",
      { class: "row wrap" },
      h("button", {
        type: "button",
        class: "btn tiny",
        html: `${ic("star")}<span>存为我的音色</span>`,
        title: "把这个音色描述存进音色库，之后可以一键复用",
        onclick: () => ctx.library?.saveDesign(),
      }),
      h("span", {
        class: "hint",
        text: "保存的是描述本身——同一段描述每次生成的嗓音会有细微差别",
      }),
    ),
  );
}

/* ---------------------------------------------------------------- clone --- */

function renderClone(root, ctx) {
  const s = ctx.store.get();

  const input = h("input", {
    type: "file",
    accept: ".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav",
    id: "cloneFile",
    onchange: (e) => {
      const f = e.target.files?.[0];
      if (f) acceptClone(f, ctx);
      e.target.value = "";
    },
  });

  const drop = h(
    "label",
    {
      class: `drop${s.cloneDataUrl ? " is-set" : ""}`,
      for: "cloneFile",
      ondragover: (e) => {
        e.preventDefault();
        drop.classList.add("is-drag");
      },
      ondragleave: () => drop.classList.remove("is-drag"),
      ondrop: (e) => {
        e.preventDefault();
        drop.classList.remove("is-drag");
        const f = e.dataTransfer?.files?.[0];
        if (f) acceptClone(f, ctx);
      },
    },
    h("span", { html: ic("upload") }),
    h("b", { text: s.cloneDataUrl ? "已载入样本" : "点击选择，或把音频拖进来" }),
    h("span", {
      class: "note",
      text: "仅支持 mp3 / wav，Base64 编码后不超过 10MB",
    }),
    input,
  );

  const parts = [drop];

  if (s.cloneDataUrl) {
    parts.push(sampleCard(ctx));
    parts.push(
      h(
        "div",
        { class: "row wrap" },
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("mic")}<span>识别样本内容</span>`,
          onclick: (e) => transcribeSample(e.currentTarget, ctx),
        }),
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("star")}<span>存为我的音色</span>`,
          title: "把这段参考音频存进音色库，之后可以一键复用",
          onclick: () => ctx.library?.saveClone(),
        }),
        h("button", {
          type: "button",
          class: "btn tiny danger",
          html: `${ic("close")}<span>移除样本</span>`,
          onclick: () =>
            ctx.set({
              cloneDataUrl: "",
              cloneName: "",
              cloneSize: 0,
              cloneDuration: 0,
              clonePeaks: null,
              cloneFile: null,
              cloneFileName: "",
            }),
        }),
      ),
    );
  } else {
    // Available with or without a sample — gating it on an existing sample
    // made the feature unreachable, which is the opposite of the intent.
    parts.push(
      h(
        "div",
        { class: "row wrap" },
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("stack")}<span>从历史音频选择</span>`,
          onclick: () => ctx.pickFromHistory(),
        }),
      ),
    );
  }

  parts.push(
    h("p", {
      class: "note",
      text: "克隆是零样本的：样本只用于这一次请求，不会在服务端留存训练。样本越干净、越接近目标语气，复刻越准。",
    }),
  );

  setChildren(root, ...parts);
}

function sampleCard(ctx) {
  const s = ctx.store.get();

  const canvas = h("canvas", { "aria-hidden": "true" });
  const card = h(
    "div",
    { class: "sample" },
    canvas,
    h("span", {
      class: "s-info",
      text: `${formatClock(s.cloneDuration)} · ${formatBytes(s.cloneSize)}`,
    }),
  );

  // Paint once the element is in the document.
  requestAnimationFrame(() => {
    if (s.clonePeaks) drawPeaks(canvas, s.clonePeaks, 1);
  });
  return card;
}

export async function acceptClone(file, ctx) {
  const mime = file.type || (/\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/wav");
  if (!/audio\/(mpeg|mp3|wav|x-wav|wave)/i.test(mime)) {
    ctx.toast("只支持 mp3 与 wav", "err");
    return;
  }

  // Base64 inflates by ~4/3, so the raw file must stay under 7.5MB to fit the
  // documented 10MB encoded ceiling. Checked before reading, not after.
  if (file.size > LIMITS.cloneBase64Bytes * 0.75) {
    ctx.toast(
      `样本 ${(file.size / 1048576).toFixed(1)}MB，Base64 后会超过 10MB 上限`,
      "err",
    );
    return;
  }

  ctx.toast("正在读取样本…");

  const dataUrl = await fileToDataUrl(file);
  const bytes = dataUrlBytes(dataUrl);
  if (bytes > LIMITS.cloneBase64Bytes) {
    ctx.toast(
      `样本 Base64 后 ${(bytes / 1048576).toFixed(1)}MB，超过 10MB 上限`,
      "err",
    );
    return;
  }

  const buf = await file.arrayBuffer();
  const decoded = await decode(buf.slice(0));
  const clonePeaks = decoded ? peaks(decoded, 220) : null;
  const duration = decoded?.duration || durationOf(buf, mime);

  ctx.set({
    cloneDataUrl: dataUrl,
    cloneName: file.name,
    cloneSize: bytes,
    cloneDuration: duration,
    clonePeaks,
    // Kept so the library can upload the original bytes without decoding the
    // data URL back into a File.
    cloneFile: file,
    cloneFileName: file.name,
  });
  // The voice panel is a structural render, not a soft one: accepting a sample
  // changes which controls exist (waveform, transcript, remove). Without this
  // the panel still shows the empty drop zone and none of those are reachable.
  ctx.refresh();
  ctx.toast(`样本已就绪（${(bytes / 1048576).toFixed(2)}MB）`, "ok");
}

async function transcribeSample(button, ctx) {
  const s = ctx.store.get();
  if (!s.cloneDataUrl) return;

  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "识别中…";

  try {
    const out = await post("/api/asr", { data: s.cloneDataUrl, language: "auto" });
    const text = String(out?.text || "").trim();
    if (!text) {
      ctx.toast("没有识别出内容", "err");
      return;
    }
    ctx.set({ text: s.text ? s.text : text });
    ctx.toast(
      s.text ? "识别完成（台词已有内容，未覆盖）" : "识别完成，已填入台词",
      "ok",
    );
  } catch (e) {
    ctx.toast(`识别失败：${e.message}`, "err");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

/* ---------------------------------------------------------------- shared -- */

function toggleRow(label, checked, onChange) {
  const sw = h("div", {
    class: "toggle",
    role: "switch",
    tabindex: "0",
    "aria-checked": String(Boolean(checked)),
    "aria-label": label,
    onclick: () => flip(),
    onkeydown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        flip();
      }
    },
  });
  const flip = () => {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(on));
    onChange(on);
  };
  return h(
    "div",
    { class: "toggle-row" },
    h("span", { class: "t-label", text: label }),
    sw,
  );
}

/** Shared waveform painter — also used by the player and take cards. */
export function drawPeaks(canvas, values, progress = 0, { played = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;

  const w = rect.width;
  const hh = rect.height || 30;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hh * dpr);

  const c = canvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hh);

  const css = getComputedStyle(document.documentElement);
  const idle = css.getPropertyValue("--ink-faint").trim() || "#999";
  const hot = played || css.getPropertyValue("--accent").trim() || "#eb5e00";

  const n = values.length;
  const barW = 2.5;
  const gap = 2;
  const step = barW + gap;
  const playedIndex = Math.round(n * Math.min(1, Math.max(0, progress)));

  for (let i = 0; i < n; i++) {
    const x = i * step;
    if (x + barW > w) break;
    const v = values[i];
    const barH = Math.max(2, v * (hh - 4));
    c.fillStyle = i < playedIndex ? hot : idle;
    c.globalAlpha = i < playedIndex ? 1 : 0.55;
    c.beginPath();
    c.roundRect(x, (hh - barH) / 2, barW, barH, 1.25);
    c.fill();
  }
  c.globalAlpha = 1;
}
