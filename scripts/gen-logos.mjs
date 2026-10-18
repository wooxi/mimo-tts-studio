/**
 * MiMo TTS Studio — brand mark generator (draft round)
 *
 * Emits three candidate marks as standalone SVG, plus a mono variant of each,
 * plus a contact sheet. Colours are authored in OKLCH so the gradient
 * endpoints stay in the same space as the UI design tokens.
 *
 *   node scripts/gen-logos.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "brand", "drafts");
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- colour -- */

function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  });
}

const hex = (L, C, H) =>
  "#" +
  oklchToRgb(L, C, H)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

const RAMP = {
  hi: hex(0.745, 0.163, 62),
  mid: hex(0.655, 0.192, 44),
  lo: hex(0.545, 0.185, 28),
};
const PAPER = hex(0.995, 0.002, 80);
const INK = hex(0.235, 0.014, 46);

/* --------------------------------------------------------------- helpers --- */

const r2 = (n) => Math.round(n * 100) / 100;
const pol = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + r * Math.cos(a)), r2(cy + r * Math.sin(a))];
};

/** Open arc as a stroked path, angles in degrees, 0° = east, clockwise. */
function arc(cx, cy, r, from, to) {
  const [x1, y1] = pol(cx, cy, r, from);
  const [x2, y2] = pol(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${x1} ${y1}A${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/** Sine with a sin(pi·t) envelope so it starts and ends flat. */
function wavePath(x0, x1, yc, amp, cycles, steps = 56) {
  const dx = (x1 - x0) / steps;
  const at = (i) => {
    const t = i / steps;
    return yc - amp * Math.sin(t * Math.PI * 2 * cycles - Math.PI / 2) * Math.sin(t * Math.PI);
  };
  let d = `M${r2(x0)} ${r2(at(0))}`;
  for (let i = 1; i <= steps; i++) {
    d += ` Q${r2(x0 + dx * (i - 0.5))} ${r2(at(i - 0.5))} ${r2(x0 + dx * i)} ${r2(at(i))}`;
  }
  return d;
}

function shell({ title, field, gid, body }) {
  return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
  <title>${title}</title>
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${RAMP.hi}"/>
      <stop offset=".52" stop-color="${RAMP.mid}"/>
      <stop offset="1" stop-color="${RAMP.lo}"/>
    </linearGradient>
  </defs>
${field}${body}</svg>
`;
}

const fieldColor = (gid) => `  <rect width="512" height="512" rx="116" fill="url(#${gid})"/>\n`;
const fieldMono = () =>
  `  <rect x="13" y="13" width="486" height="486" rx="104" fill="none" stroke="currentColor" stroke-width="26"/>\n`;

/* ============================================================== MARK A ==== */
/* 声峰 M — the letter M whose valley is rounded like a wave trough rather
 * than a rigid apex. Heavy outer stems, lighter valley: a waveform envelope
 * that still reads unmistakably as type. */

function markA({ mono = false } = {}) {
  const gid = "mimoA";
  const stroke = mono ? "currentColor" : PAPER;
  const body = `  <g fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M146 334V190" stroke-width="56"/>
    <path d="M366 334V190" stroke-width="56"/>
    <path d="M146 190Q200 300 256 300Q312 300 366 190" stroke-width="38"/>
  </g>
`;
  return shell({
    title: "MiMo TTS Studio",
    field: mono ? fieldMono() : fieldColor(gid),
    gid,
    body,
  });
}

/* ============================================================== MARK B ==== */
/* 采样窗 — a voice being sampled: two corner brackets framing a compact
 * waveform. The bracket is a crop/selection mark, so the reading is
 * "this is a captured voice", which is exactly what cloning consumes. */

function markB({ mono = false } = {}) {
  const gid = "mimoB";
  const stroke = mono ? "currentColor" : PAPER;
  const Y = 256;

  const brackets = [
    "M212 122H152A30 30 0 0 0 122 152V212",
    "M300 390H360A30 30 0 0 0 390 360V300",
  ]
    .map((d) => `    <path d="${d}" stroke-width="28"/>`)
    .join("\n");

  const bars = [
    [188, 58],
    [232, 118],
    [276, 168],
    [320, 104],
  ]
    .map(
      ([x, h]) =>
        `    <path d="M${x} ${r2(Y - h / 2)}V${r2(Y + h / 2)}" stroke-width="26"/>`,
    )
    .join("\n");

  const body = `  <g stroke="${stroke}" stroke-linecap="round" fill="none">
${brackets}
${bars}
  </g>
`;
  return shell({
    title: "MiMo TTS Studio",
    field: mono ? fieldMono() : fieldColor(gid),
    gid,
    body,
  });
}

/* ============================================================== MARK C ==== */
/* 由文生声 — three lines of copy on the left resolve into a waveform on the
 * right. It is the one thing this product does that a generic audio app
 * cannot: the voice is authored from text. */

function markC({ mono = false } = {}) {
  const gid = "mimoC";
  const stroke = mono ? "currentColor" : PAPER;
  const Y = 256;

  // left: three lines of copy, ragged right — deliberately thin, so it reads
  // as text and never collapses into a list glyph at 16px
  const lines = [
    [184, 104],
    [256, 52],
    [328, 78],
  ]
    .map(
      ([y, w]) =>
        `    <path d="M116 ${y}H${116 + w}" stroke-width="19" stroke-linecap="round"/>`,
    )
    .join("\n");

  // right: the same copy, released as sound — heavier, taller, unmistakable
  const bars = [
    [262, 112],
    [304, 196],
    [346, 148],
    [388, 214],
  ]
    .map(
      ([x, h]) =>
        `    <path d="M${x} ${r2(Y - h / 2)}V${r2(Y + h / 2)}" stroke-width="29"/>`,
    )
    .join("\n");

  const body = `  <g stroke="${stroke}" fill="none" stroke-linecap="round">
${lines}
${bars}
  </g>
`;
  return shell({
    title: "MiMo TTS Studio",
    field: mono ? fieldMono() : fieldColor(gid),
    gid,
    body,
  });
}

/* ---------------------------------------------------------------- write --- */

const marks = { a: markA, b: markB, c: markC };
console.log("ramp:", RAMP.hi, RAMP.mid, RAMP.lo);

for (const [key, fn] of Object.entries(marks)) {
  writeFileSync(join(OUT, `${key}.svg`), fn());
  writeFileSync(join(OUT, `${key}-mono.svg`), fn({ mono: true }));
}

/* --------------------------------------------------------------- contact -- */

const asMark = (svg, cls = "mark") => svg.replace("<svg ", `<svg class="${cls}" `);

const COPY = {
  a: ["A · 声峰 M", "首字母 M 即波形包络：外柱厚重、内谷浑圆，坐在基线上像活字。16px 仍可辨。"],
  b: ["B · 采样窗", "两枚取景角框住一段波形 —— 被采样下来的嗓音，正是克隆所消费的东西。"],
  c: ["C · 由文生声", "左侧三行文字在右侧被释放成波形 —— 嗓音由文本生成，这是通用音频应用做不到的。"],
};

const card = (key) => `
  <section class="card">
    <header><b>${COPY[key][0]}</b><span>${COPY[key][1]}</span></header>
    <div class="row">
      <div class="sw light">${asMark(marks[key]())}</div>
      <div class="sw dark">${asMark(marks[key]())}</div>
      <div class="sw bare">${asMark(marks[key]())}</div>
    </div>
    <div class="ladder">
      <span class="s88">${asMark(marks[key]())}</span>
      <span class="s40">${asMark(marks[key]())}</span>
      <span class="s24">${asMark(marks[key]())}</span>
      <span class="s16">${asMark(marks[key]())}</span>
      <em>88 / 40 / 24 / 16 px</em>
    </div>
    <div class="row mono">
      <div class="sw light">${asMark(marks[key]({ mono: true }), "mark mono")}</div>
      <div class="sw dark">${asMark(marks[key]({ mono: true }), "mark mono")}</div>
    </div>
  </section>`;

writeFileSync(
  join(OUT, "contact-sheet.html"),
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>MiMo TTS Studio — logo drafts</title>
<style>
  :root{
    --bg:${hex(0.975, 0.004, 70)}; --surface:${PAPER}; --line:${hex(0.9, 0.006, 70)};
    --ink:${INK}; --dim:${hex(0.47, 0.012, 46)}; --acc:${RAMP.mid};
  }
  *{box-sizing:border-box}
  body{margin:0;padding:44px;background:var(--bg);color:var(--ink);
       font:14px/1.6 system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  h1{font-size:20px;margin:0 0 6px;letter-spacing:-.01em}
  .lede{margin:0 0 34px;color:var(--dim);font-size:13px;max-width:70ch}
  .grid{display:grid;gap:26px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px}
  .card header{display:flex;align-items:baseline;gap:12px;margin-bottom:18px;flex-wrap:wrap}
  .card header b{font-size:15px;white-space:nowrap}
  .card header span{font-size:12.5px;color:var(--dim)}
  .row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
  .row.mono{margin-top:14px}
  .sw{width:126px;height:126px;border-radius:14px;display:grid;place-items:center;flex:none}
  .sw.light{background:${hex(0.962, 0.004, 70)};border:1px solid var(--line)}
  .sw.dark{background:${hex(0.17, 0.007, 50)}}
  .sw.bare{background:repeating-conic-gradient(#0000 0 25%, ${hex(0.93,0.004,70)} 0 50%) 0 0/16px 16px}
  .mark{width:84px;height:84px;display:block}
  .row.mono .sw{height:96px}
  .row.mono .mark{width:58px;height:58px;color:${INK}}
  .row.mono .dark .mark{color:${PAPER}}
  .ladder{display:flex;align-items:flex-end;gap:22px;margin-top:20px;
          padding-top:18px;border-top:1px solid var(--line)}
  .ladder span{display:block;border-radius:9px;overflow:hidden;flex:none}
  .ladder svg{display:block;width:100%;height:100%}
  .ladder em{font-style:normal;font-size:11.5px;color:var(--dim);
             font-family:"SF Mono",Consolas,monospace}
  .s88{width:88px;height:88px}.s40{width:40px;height:40px}
  .s24{width:24px;height:24px}.s16{width:16px;height:16px}
</style></head><body>
<h1>MiMo TTS Studio — Logo 三稿</h1>
<p class="lede">每稿给出：彩色（浅底 / 深底 / 透明格）、实际尺寸阶梯、单色版。
请在看完 16px 与单色表现后再决定。强调色与 UI 同一 OKLCH 色阶：${RAMP.hi} → ${RAMP.mid} → ${RAMP.lo}。</p>
<div class="grid">
${["a", "b", "c"].map(card).join("")}
</div></body></html>
`,
);

console.log(`\nwrote 6 svg + contact sheet → ${OUT}`);
