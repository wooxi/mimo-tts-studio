/**
 * Layer ② — 演绎.
 *
 * Natural-language direction. This whole block lands in
 * `messages[role=user].content` and is never spoken aloud, which is why it is
 * a separate layer from the script.
 *
 * For VoiceDesign the same content has to be folded into the voice description
 * instead, because that model has a single required user field — the UI says so
 * rather than silently dropping it.
 */

import { h, setChildren, $ } from "../core/dom.js";
import { ic } from "../icons.js";
import { modelOf } from "../domain/models.js";
import { composeVoiceDesign } from "../domain/payload.js";

const DIRECTOR_EXAMPLE = {
  role: "百年门阀岑家的现任大当家。自出生便被过继给祖庙的守门老人抚养，被塑造成一尊完美无瑕、绝情断欲的家族图腾。常年深居简出，对人有着极强的阶级疏离感。",
  scene:
    "在祠堂的阴影里，看着那个不顾一切冲破保安防线来找她、企图带她私奔的男人。她要用最冷硬的阶级壁垒，绞杀对方，也绞杀自己刚刚萌芽的感情。",
  guide:
    "冰冷、慵懒却极具威压的低音御姐。发声通道非常松弛，没有任何剑拔弩张，却有着让人骨里生寒的压迫感。语速极慢，句与句之间留下极长的空白。尾音处加入极轻微的气音收束。",
};

export function initDirection(ctx) {
  const root = $("#directionPanel");
  /** Rebound on every render; registered once so listeners cannot pile up. */
  let soft = () => {};

  const rerender = () => render(root, ctx, (fn) => (soft = fn));

  ctx.onRefresh.push(rerender);
  ctx.onSoftRefresh.push(() => soft());
  rerender();
  return rerender;
}

function render(root, ctx, setSoft = () => {}) {
  const s = ctx.store.get();
  const model = modelOf(s.model);
  const folded = model.caps.voiceDesign;

  const styleField = h(
    "div",
    { class: "field" },
    h(
      "div",
      { class: "field-head" },
      h("label", { class: "label", for: "styleInput", text: "风格描述" }),
      h("span", { class: "hint mono", text: `${s.style.length} 字` }),
    ),
    h("textarea", {
      id: "styleInput",
      rows: 2,
      placeholder:
        "用轻快上扬的语调报喜，语速稍快，带着压抑不住的激动与小骄傲，声音明亮有活力。",
      value: s.style,
      oninput: (e) => ctx.set({ style: e.target.value }),
    }),
  );

  const details = h(
    "details",
    { class: "inspector", open: hasDirector(s) },
    h(
      "summary",
      null,
      h("span", { html: ic("chevron") }),
      h("span", { text: "导演模式 · 角色 / 场景 / 指导" }),
    ),
    h(
      "div",
      { class: "inspector-body" },
      h(
        "div",
        { style: { display: "grid", gap: "10px" } },
        directorField("角色", "d-role", s.director.role, "身份、性格底色、说话习惯", ctx),
        directorField("场景", "d-scene", s.director.scene, "发生了什么、对谁说、情绪状态", ctx),
        directorField("指导", "d-guide", s.director.guide, "语速、气息、停顿、重音、音色质感", ctx),
      ),
      h(
        "div",
        { class: "row wrap" },
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("wand")}<span>填入示例</span>`,
          onclick: () => ctx.set({ director: { ...DIRECTOR_EXAMPLE } }),
        }),
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("close")}<span>清空</span>`,
          onclick: () =>
            ctx.set({ director: { role: "", scene: "", guide: "" } }),
        }),
      ),
    ),
  );

  const parts = [];

  if (folded) {
    // The merge is real, so it is shown rather than described. Without this the
    // user cannot see that a leftover style line is riding along with the voice
    // description into the single user field.
    const merged = h("pre", { class: "code merged" });
    setSoft(() => {
      merged.textContent = composeVoiceDesign(ctx.store.get()) || "（空）";
    });
    merged.textContent = composeVoiceDesign(ctx.store.get()) || "（空）";

    parts.push(
      styleField,
      details,
      h(
        "div",
        { class: "field" },
        h(
          "div",
          { class: "field-head" },
          h("span", { class: "label", text: "实际发送的音色描述" }),
        ),
        merged,
        h("button", {
          type: "button",
          class: "btn tiny",
          html: `${ic("close")}<span>清空演绎层</span>`,
          onclick: () =>
            ctx.set({ style: "", director: { role: "", scene: "", guide: "" } }),
        }),
      ),
    );

    return setChildren(root, ...parts);
  }

  parts.push(styleField, details);

  // Delivery direction is optional, and leaving it expanded pushes the script
  // editor — the control people actually touch most — below the fold on a
  // 900px-tall window. So it starts closed, and the summary reports whether
  // anything is filled in. The layer header above stays visible either way, so
  // the three-layer structure is still legible.
  const filled = [
    s.style.trim(),
    s.director.role.trim(),
    s.director.scene.trim(),
    s.director.guide.trim(),
  ].filter(Boolean).length;

  setChildren(
    root,
    h(
      "details",
      { class: "layer-fold" },
      h(
        "summary",
        null,
        h("span", { html: ic("chevron") }),
        h("span", { text: "风格描述与导演模式" }),
        h("span", { class: "spacer" }),
        h("span", {
          class: `hint${filled ? " is-on" : ""}`,
          text: filled ? `已填 ${filled} 项` : "可选",
        }),
      ),
      h("div", { class: "fold-body" }, ...parts),
    ),
  );
}

function directorField(label, id, value, placeholder, ctx) {
  const key = { "d-role": "role", "d-scene": "scene", "d-guide": "guide" }[id];
  return h(
    "div",
    { class: "field" },
    h("label", { class: "label", for: id, text: label }),
    h("textarea", {
      id,
      rows: 3,
      placeholder,
      value,
      style: { fontSize: "0.82rem", minHeight: "70px" },
      oninput: (e) =>
        ctx.set({ director: { ...ctx.store.get().director, [key]: e.target.value } }),
    }),
  );
}

function hasDirector(s) {
  const d = s.director || {};
  return Boolean(d.role || d.scene || d.guide);
}
