/**
 * Tag picker.
 *
 * One component serving two jobs, because the two jobs differ only in what
 * happens on click:
 *   mode="style"   toggles the leading `(… )` group
 *   mode="inline"  inserts a bracketed tag at the caret
 */

import { h, setChildren, $, esc } from "../core/dom.js";
import { ic } from "../icons.js";
import {
  inlineGroupsFor,
  inlineWrap,
  leadingStyleTags,
  setLeadingTags,
  styleGroupsFor,
  isSinging,
} from "../domain/tags.js";
import { insertInlineTag } from "./script.js";

let state = { mode: "style", group: null, query: "" };

export function initTagSheet(ctx) {
  const sheet = $("#tagSheet");
  const mask = $("#mask");
  const body = $("#tagSheetBody");
  const tabs = $("#tagSheetTabs");
  const search = $("#tagSearch");
  const title = $("#tagSheetTitle");

  const close = () => {
    sheet.classList.remove("is-open");
    mask.classList.remove("is-open");
    document.body.classList.remove("is-locked");
    search.value = "";
    state.query = "";
  };

  mask.addEventListener("click", close);
  $("#tagSheetClose").addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("is-open")) close();
  });

  search.addEventListener("input", () => {
    state.query = search.value.trim().toLowerCase();
    paint(body, tabs, ctx);
  });

  ctx.openTagSheet = (mode) => {
    state.mode = mode;
    state.group = null;
    state.query = "";
    search.value = "";
    title.textContent = mode === "style" ? "整体风格标签" : "句内音频标签";
    sheet.classList.add("is-open");
    mask.classList.add("is-open");
    document.body.classList.add("is-locked");
    paint(body, tabs, ctx);
  };

  ctx.closeTagSheet = close;

  /** Called by the script view after any change so pills reflect reality. */
  ctx.syncTagSheet = () => {
    if (sheet.classList.contains("is-open")) paint(body, tabs, ctx);
  };
}

function groupsFor(mode, text) {
  return mode === "style" ? styleGroupsFor(text) : inlineGroupsFor(text);
}

function paint(body, tabs, ctx) {
  const s = ctx.store.get();
  const groups = groupsFor(state.mode, s.text);

  if (!state.group || !groups.some((g) => g.id === state.group)) {
    state.group = groups[0]?.id;
  }

  /* tabs */
  setChildren(
    tabs,
    ...groups.map((g) =>
      h("button", {
        type: "button",
        role: "tab",
        text: g.label,
        "aria-selected": String(g.id === state.group),
        onclick: () => {
          state.group = g.id;
          paint(body, tabs, ctx);
        },
      }),
    ),
  );

  /* pills */
  const active = new Set(
    state.mode === "style" ? leadingStyleTags(s.text) : [],
  );

  const q = state.query;
  const visible = q
    ? groups.flatMap((g) => g.tags.map((t) => ({ g, t })))
    : groups.filter((g) => g.id === state.group).flatMap((g) => g.tags.map((t) => ({ g, t })));

  const hits = visible.filter(({ t }) => !q || t.toLowerCase().includes(q));

  setChildren(
    body,
    ...(hits.length
      ? hits.map(({ g, t }) =>
          h("button", {
            type: "button",
            class: "tag-pill",
            text: t,
            "aria-pressed": String(active.has(t)),
            title:
              state.mode === "style"
                ? `整体风格：${t}`
                : `插入到光标处：${inlineWrap(t, s.text)}`,
            onclick: () => {
              if (state.mode === "style") {
                const next = new Set(active);
                if (next.has(t)) next.delete(t);
                else next.add(t);
                ctx.set({
                  text: setLeadingTags(s.text, [...next], { singing: isSinging(s.text) }),
                });
                paint(body, tabs, ctx);
              } else {
                const ta = $("#scriptInput");
                if (!ta) return;
                const next = insertInlineTag(ta, t);
                ctx.set({ text: next });
                ta.focus();
              }
            },
          }),
        )
      : [h("div", { class: "tag-empty", text: "没有匹配的标签" })]),
  );

  /* the note that belongs to the visible group */
  const note = groups.find((g) => g.id === state.group)?.note;
  if (note && !q) {
    body.append(h("p", { class: "note", text: note }));
  }

  if (state.mode === "inline" && !q) {
    body.append(
      h("p", {
        class: "note",
        text: "括号内只能写能发出声音的内容",
      }),
    );
  }
}

/** Small helper the settings drawer uses to render read-only tag samples. */
export const sampleTag = (tag) => `<code>${esc(inlineWrap(tag, "中文"))}</code>`;

export const tagSheetIcon = () => ic("sparkle");
