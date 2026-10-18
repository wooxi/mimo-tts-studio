/**
 * Layer ③ — 台词.
 *
 * The spoken text, which lands in `messages[role=assistant].content` and is the
 * only thing the model actually says.
 *
 * Two kinds of tag live in this string and they are not interchangeable:
 *   `(风格)`  once, at the very start
 *   `（标签）` anywhere, for a breath, a laugh, a shift in pace
 *
 * Rather than keeping tags in separate state and re-serialising them (the
 * approach that let the old build drift out of sync), the text *is* the state.
 * The highlight layer and the tag chips are both derived from it, so what you
 * see in the box is literally what gets sent.
 */

import { h, setChildren, $, esc } from "../core/dom.js";
import { ic } from "../icons.js";
import { modelOf, LIMITS, estimateTokens } from "../domain/models.js";
import {
  scanScript,
  leadingStyleTags,
  inlineWrap,
  toggleSinging,
  scriptLang,
} from "../domain/tags.js";
import { planSegments } from "../domain/segment.js";

export function initScript(ctx) {
  const root = $("#scriptPanel");
  let lastLang = null;
  /** Rebound on every render so soft updates touch live elements. */
  let soft = () => {};

  const rerender = () => {
    const s = ctx.store.get();
    render(root, ctx, { setSoft: (fn) => (soft = fn) });
    const lang = scriptLang(s.text);
    if (lang !== lastLang) {
      lastLang = lang;
      ctx.onLangChange?.(lang);
    }
  };

  ctx.onRefresh.push(rerender);
  ctx.onSoftRefresh.push(() => soft());
  rerender();
  return rerender;
}

function render(root, ctx, { setSoft = () => {} } = {}) {
  const active = document.activeElement;
  const keepFocus = active?.id === "scriptInput";
  const caret = keepFocus ? [active.selectionStart, active.selectionEnd] : null;

  const s = ctx.store.get();
  const model = modelOf(s.model);
  const caps = model.caps;
  const tags = scanScript(s.text);
  const singing = tags.some((t) => t.kind === "sing");

  /* ---- editor ---------------------------------------------------------- */

  const hl = h("div", { class: "hl", "aria-hidden": "true" });
  const ta = h("textarea", {
    id: "scriptInput",
    rows: 7,
    spellcheck: "false",
    placeholder:
      "（紧张，深呼吸）呼……冷静，不就是一个面试吗……（小声）哎呀，领带歪没歪？",
    value: s.text,
    oninput: (e) => {
      ctx.set({ text: e.target.value }, { silent: true });
      softNow();
    },
    onscroll: () => {
      hl.style.transform = `translateY(${-ta.scrollTop}px)`;
    },
    onkeydown: (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        ctx.requestSynth();
      }
    },
  });

  paintHighlight(hl, s.text);

  const editor = h("div", { class: "editor" }, hl, ta);

  /* ---- tag controls ---------------------------------------------------- */

  const chipRow = h("div", { class: "chip-row" });

  const styleBtn = h("button", {
    type: "button",
    class: "pill-btn",
    onclick: () => ctx.openTagSheet("style"),
  });

  const controls = h(
    "div",
    { class: "chip-row" },
    chipRow,
    styleBtn,
    h("button", {
      type: "button",
      class: "pill-btn",
      html: `${ic("plus")}<span>句内标签</span>`,
      disabled: !caps.inlineTags,
      onclick: () => ctx.openTagSheet("inline"),
    }),
  );

  if (!caps.inlineTags) {
    controls.append(
      h("span", { class: "hint", text: "该模型不支持句内标签" }),
    );
  }

  /* ---- singing --------------------------------------------------------- */

  const singBtn = caps.singing
    ? h("button", {
        type: "button",
        class: "pill-btn",
        html: `${ic("mic")}<span>唱歌</span>`,
        onclick: () => ctx.set({ text: toggleSinging(ctx.store.get().text) }),
      })
    : null;

  if (singBtn) controls.append(singBtn);

  /* ---- footer: meters, split, optimize --------------------------------- */

  const meterFill = h("i");
  const meter = h("div", { class: "meter" }, meterFill);
  const countEl = h("span", { class: "hint mono" });
  const tokEl = h("span", { class: "hint mono" });

  const foot = h(
    "div",
    { class: "editor-foot" },
    h(
      "span",
      { class: "legend" },
      h("i", { class: "sw sw-style" }),
      h("span", { text: "整体风格" }),
      h("i", { class: "sw sw-inline" }),
      h("span", { text: "句内标签" }),
      ...(caps.singing ? [h("i", { class: "sw sw-sing" }), h("span", { text: "唱歌" })] : []),
    ),
    h("span", { class: "spacer" }),
    countEl,
    tokEl,
  );

  const meterRow = h("div", { class: "row" }, h("div", { class: "meter-slot" }, meter));
  meterRow.style.gap = "10px";

  /* ---- segmentation ---------------------------------------------------- */

  const splitNote = h("p", { class: "note" });

  const splitToggle = switchRow(
    "自动分段并拼接",
    s.autoSplit,
    (on) => ctx.set({ autoSplit: on }),
  );

  /* ---- soft update ------------------------------------------------------ */
  /* Reads live state, so it stays correct however many times the panel is
     rebuilt. Every element it touches is captured above. */

  function softNow() {
    const st = ctx.store.get();
    const tagsNow = scanScript(st.text);
    const styleTagsNow = leadingStyleTags(st.text);
    const singingNow = tagsNow.some((t) => t.kind === "sing");

    // The visible glyphs come from the textarea; the backdrop only supplies
    // tint. If a tag button or chip changed the text, the textarea has to be
    // brought along or the next keystroke would write the stale value back.
    if (ta.value !== st.text) {
      const caretAt = ta.selectionStart;
      ta.value = st.text;
      try {
        ta.setSelectionRange(caretAt, caretAt);
      } catch {
        /* element may not be focused */
      }
    }

    paintHighlight(hl, st.text);
    renderStyleChips(chipRow, styleTagsNow, ctx);

    styleBtn.classList.toggle("is-on", styleTagsNow.length > 0);
    setChildren(
      styleBtn,
      (() => {
        const wrap = document.createElement("span");
        wrap.innerHTML = ic("sparkle");
        return wrap.firstElementChild || wrap;
      })(),
      h("span", {
        text: styleTagsNow.length ? `整体风格 · ${styleTagsNow.length}` : "整体风格",
      }),
    );
    if (singBtn) singBtn.classList.toggle("is-on", singingNow);

    const t = estimateTokens(st.text);
    const r = Math.min(1, t / LIMITS.contextTokens);
    meterFill.style.width = `${(r * 100).toFixed(1)}%`;
    meter.classList.toggle("is-warn", r >= 0.75 && r < 1);
    meter.classList.toggle("is-err", r >= 1);
    countEl.textContent = `${st.text.length} 字`;
    tokEl.textContent = `≈${t} / ${LIMITS.contextTokens} tokens`;

    if (!st.autoSplit) {
      const over = st.text.length > LIMITS.segmentAt;
      splitNote.className = over ? "note warn" : "note";
      splitNote.textContent = over
        ? `当前 ${st.text.length} 字，建议开启分段`
        : "";
      return;
    }
    const p = planSegments(st.text, LIMITS.segmentAt);
    splitNote.className = "note";
    splitNote.textContent = p.needed
      ? `将切成 ${p.count} 段（${p.lengths.join(" / ")} 字）`
      : "";
  }

  /* ---- assemble -------------------------------------------------------- */

  const parts = [];

  if (caps.voiceDesign) {
    parts.push(
      switchRow(
        "智能润色播报文本",
        s.optimize,
        (on) => ctx.set({ optimize: on }),
      ),
    );
  }

  parts.push(
    h("div", { class: "field" }, editor, foot),
    meterRow,
    controls,
    splitToggle,
    splitNote,
    h("div", { id: "previewSlot" }),
  );

  setChildren(root, ...parts);
  softNow();
  setSoft(softNow);

  if (keepFocus && caret) {
    ta.focus();
    ta.setSelectionRange(caret[0], caret[1]);
  }
}

/* ------------------------------------------------------------- highlight -- */

/** Rebuild the backdrop that tints tag groups behind the transparent-shown text. */
function paintHighlight(hl, text) {
  const tags = scanScript(text);
  let html = "";
  let at = 0;

  for (const t of tags) {
    html += esc(text.slice(at, t.start));
    const cls =
      t.kind === "sing" ? "tk-sing" : t.kind === "style" ? "tk-style" : "tk-inline";
    html += `<span class="${cls}">${esc(t.raw)}</span>`;
    at = t.end;
  }
  html += esc(text.slice(at));
  // Trailing newline needs a placeholder or the backdrop is one line short.
  hl.innerHTML = html.replace(/\n$/, "\n ");
}

/* ----------------------------------------------------------------- chips -- */

function renderStyleChips(row, styleTags, ctx) {
  setChildren(
    row,
    ...styleTags.map((tag) =>
      h(
        "span",
        { class: "chip" },
        h("span", { text: tag }),
        h("button", {
          type: "button",
          html: ic("close"),
          "aria-label": `移除 ${tag}`,
          onclick: () => ctx.removeStyleTag(tag),
        }),
      ),
    ),
  );
}

/* --------------------------------------------------------------- helpers -- */

/** Write an inline tag at the caret, choosing brackets that match the script. */
export function insertInlineTag(textarea, tag) {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const snippet = inlineWrap(tag, value);

  // If the caret sits inside an existing tag group, replace it instead of
  // nesting brackets.
  const before = value.lastIndexOf("（", start);
  const beforeHalf = value.lastIndexOf("(", start);
  const open = Math.max(before, beforeHalf);
  const close = value.indexOf("）", start) >= 0 ? value.indexOf("）", start) : value.indexOf(")", start);
  if (open >= 0 && close > start && open < start) {
    const next = value.slice(0, open) + snippet + value.slice(close + 1);
    textarea.value = next;
    const pos = open + snippet.length;
    textarea.setSelectionRange(pos, pos);
    return next;
  }

  const next = value.slice(0, start) + snippet + value.slice(end);
  textarea.value = next;
  const pos = start + snippet.length;
  textarea.setSelectionRange(pos, pos);
  return next;
}

/* ---------------------------------------------------------------- shared -- */

function switchRow(label, checked, onChange) {
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
    { class: "field" },
    h(
      "div",
      { class: "toggle-row" },
      h("span", { class: "t-label", text: label }),
      sw,
    ),
  );
}
