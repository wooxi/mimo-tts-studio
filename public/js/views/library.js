/**
 * Voice library — the voices you made.
 *
 * Two kinds, stored differently and applied differently:
 *
 *   design  a prompt. Applying it switches to VoiceDesign and fills the
 *           description; the timbre is regenerated on every call.
 *   clone   a reference clip in R2. Applying it downloads the clip and feeds it
 *           through the same path as a manual upload.
 *
 * The distinction matters to the user because only one of them is reproducible
 * from text alone, so the card says which is which instead of hiding it.
 */

import { h, setChildren, $, formatClock, formatBytes } from "../core/dom.js";
import { ic } from "../icons.js";
import { get, del, post, upload } from "../core/api.js";

export function initLibrary(ctx) {
  const root = $("#voiceLibrary");
  const body = $("#libraryBody");
  const count = $("#libraryCount");

  let items = [];
  let loading = false;
  let error = null;

  /* ---------------------------------------------------------------- load -- */

  async function load() {
    if (loading) return;
    loading = true;
    render();

    try {
      const data = await get("/api/voices");
      items = Array.isArray(data?.items) ? data.items : [];
      error = null;
    } catch (e) {
      error = e.status === 401 || e.status === 503 ? null : e.message;
      items = [];
    } finally {
      loading = false;
      render();
    }
  }

  /* -------------------------------------------------------------- render -- */

  function render() {
    count.textContent = items.length ? `${items.length} 个` : "";

    if (loading) {
      setChildren(body, h("p", { class: "note", text: "读取中…" }));
      return;
    }
    if (error) {
      setChildren(body, h("p", { class: "note err", text: `音色库读取失败：${error}` }));
      return;
    }
    if (!items.length) {
      setChildren(
        body,
        h("p", {
          class: "note",
          text: "还没有保存的音色。设计或克隆出一个满意的嗓音后，点「存为我的音色」就会出现在这里。",
        }),
      );
      return;
    }

    setChildren(
      body,
      ...items.map((v) => {
        const card = h(
          "div",
          { class: "lib-card", dataset: { kind: v.kind } },
          h(
            "div",
            { class: "lib-main" },
            h(
              "div",
              { class: "lib-title" },
              h("span", { class: "lib-name", text: v.name }),
              h("span", {
                class: "lib-kind",
                text: v.kind === "clone" ? "克隆" : "设计",
              }),
            ),
            h("div", {
              class: "lib-meta",
              text:
                v.kind === "clone"
                  ? [formatClock(v.duration), formatBytes(v.size)].filter(Boolean).join("  ")
                  : (v.description || "").slice(0, 42),
            }),
          ),
          h(
            "div",
            { class: "lib-actions" },
            h("button", {
              type: "button",
              class: "btn tiny",
              text: "应用",
              title: "把这个音色载入创作区",
              onclick: () => apply(v),
            }),
            h("button", {
              type: "button",
              class: "btn tiny danger",
              html: ic("trash"),
              "aria-label": `删除 ${v.name}`,
              onclick: (e) => remove(v, e.currentTarget),
            }),
          ),
        );
        return card;
      }),
    );
  }

  /* --------------------------------------------------------------- apply -- */

  async function apply(v) {
    if (v.kind === "design") {
      ctx.set({
        model: "mimo-v2.5-tts-voicedesign",
        voiceDesign: v.description || "",
      });
      ctx.toast(`已载入「${v.name}」的音色描述`, "ok");
      return;
    }

    ctx.toast("正在载入参考音频…");
    try {
      const res = await fetch(v.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const ext = /mp3|mpeg/i.test(blob.type) ? "mp3" : "wav";
      ctx.set({ model: "mimo-v2.5-tts-voiceclone" });
      await ctx.acceptCloneFile(
        new File([blob], `${v.name}.${ext}`, { type: blob.type || "audio/wav" }),
      );
    } catch (e) {
      ctx.toast(`载入参考音频失败：${e.message}`, "err");
    }
  }

  async function remove(v, button) {
    button.disabled = true;
    try {
      await del(`/api/voices/${v.id}`);
      items = items.filter((x) => x.id !== v.id);
      render();
      ctx.toast(`已删除「${v.name}」`, "ok");
    } catch (e) {
      button.disabled = false;
      ctx.toast(`删除失败：${e.message}`, "err");
    }
  }

  /* ---------------------------------------------------------------- save -- */

  /** Save the current VoiceDesign description under a name. */
  async function saveDesign() {
    const s = ctx.store.get();
    const description = String(s.voiceDesign || "").trim();
    if (!description) {
      ctx.toast("音色描述为空，没有可保存的内容", "err");
      return;
    }

    const name = await ctx.promptText("给这个音色起个名字", suggestName(description));
    if (!name) return;

    try {
      await post("/api/voices", { name, description });
      await load();
      ctx.toast(`已保存「${name}」`, "ok");
    } catch (e) {
      ctx.toast(`保存失败：${e.message}`, "err");
    }
  }

  /** Save the current clone sample under a name. */
  async function saveClone() {
    const s = ctx.store.get();
    if (!s.cloneDataUrl || !s.cloneFileName) {
      ctx.toast("还没有可保存的参考音频", "err");
      return;
    }

    const name = await ctx.promptText(
      "给这个音色起个名字",
      s.cloneFileName.replace(/\.[a-z0-9]+$/i, "").slice(0, 24) || "我的克隆音色",
    );
    if (!name) return;

    const form = new FormData();
    form.append("audio", s.cloneFile, s.cloneFileName);
    form.append(
      "meta",
      JSON.stringify({ name, duration: s.cloneDuration, description: s.voiceDesign || "" }),
    );

    try {
      await upload("/api/voices", form);
      await load();
      ctx.toast(`已保存「${name}」`, "ok");
    } catch (e) {
      ctx.toast(`保存失败：${e.message}`, "err");
    }
  }

  load();
  return { reload: load, saveDesign, saveClone, get items() { return items; } };
}

/** A first guess at a name, taken from the opening of the description. */
function suggestName(description) {
  const first = description.split(/[，,。.；;\n]/)[0].trim();
  return first.length > 1 && first.length <= 16 ? first : "我的设计音色";
}
