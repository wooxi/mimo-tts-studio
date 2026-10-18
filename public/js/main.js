/**
 * Wiring.
 *
 * Owns the store and hands the views one `ctx` object. Views never reach for
 * globals; everything that causes a change goes through here, which keeps the
 * render graph readable without a framework.
 *
 * Two refresh levels:
 *   refresh()     rebuilds the layer panels — used when the shape changes
 *                 (switching model, loading history parameters)
 *   refreshSoft() cheap in-place updates — used on every keystroke
 */

import { $, setChildren, formatClock } from "./core/dom.js";
import { createStore } from "./core/state.js";
import { createPersistence } from "./core/persist.js";
import { auth, get } from "./core/api.js";
import { ic } from "./icons.js";

import { TTS_MODELS, modelOf, FORMATS, SAMPLE_RATE } from "./domain/models.js";
import { removeLeadingTag } from "./domain/tags.js";

import { initVoice, acceptClone } from "./views/voice.js";
import { initLibrary } from "./views/library.js";
import { initDirection } from "./views/direction.js";
import { initScript } from "./views/script.js";
import { initInspector } from "./views/inspector.js";
import { initTagSheet } from "./views/tagsheet.js";
import { initTakes } from "./views/takes.js";
import { createPlayer } from "./views/player.js";
import { initHistory } from "./views/history.js";
import { initSettings, createGate } from "./views/settings.js";
import { toast } from "./views/toast.js";
import { createSynth } from "./synth.js";

const THEMES = ["auto", "light", "dark"];
const THEME_LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };
const SYNC_LABEL = {
  ok: "已同步",
  pending: "同步中",
  local: "本地",
  err: "同步失败",
  off: "仅本地",
};

const element = (tag, props = {}) => Object.assign(document.createElement(tag), props);

export async function start() {
  /* ══════════════════════════════════════════════════════════════ store ══ */

  const store = createStore({
    model: "mimo-v2.5-tts",
    voice: "mimo_default",
    voiceDesign: "",
    style: "",
    director: { role: "", scene: "", guide: "" },
    text: "",
    format: "wav",
    stream: false,
    takes: 1,
    optimize: true,
    autoSplit: false,
    showErrors: false,

    /* session-only, never persisted: up to 10MB of base64 */
    cloneDataUrl: "",
    cloneName: "",
    cloneSize: 0,
    cloneDuration: 0,
    clonePeaks: null,
    cloneFile: null,
    cloneFileName: "",
  });

  const onRefresh = [];
  const onSoftRefresh = [];
  const keyHandlers = [];

  let persistence = null; // assigned once the views are mounted

  const ctx = {
    store,
    onRefresh,
    onSoftRefresh,
    toast,

    registerKeys(fn) {
      keyHandlers.push(fn);
    },

    set(patch, { silent = false } = {}) {
      store.set(patch, { silent: true });
      if (!silent) persistence?.schedule();
      if (patch.model) refresh();
      else refreshSoft();
    },

    refresh() {
      for (const fn of onRefresh) fn();
      refreshSoft();
    },

    refreshSoft() {
      for (const fn of onSoftRefresh) fn();
    },

    /* bound below */
    requestSynth: () => {},
    cancelSynth: () => {},
    openTagSheet: () => {},
    closeTagSheet: () => {},
    syncTagSheet: () => {},
    loadParams: () => {},
    pickFromHistory: () => {},
    acceptCloneFile: () => {},
    onLangChange: () => {},
    player: null,
    history: null,
  };

  const refresh = () => ctx.refresh();
  const refreshSoft = () => ctx.refreshSoft();

  /* ═══════════════════════════════════════════════════════════════ theme ══ */

  const themeBtn = $("#themeBtn");
  const currentTheme = () => {
    try {
      return localStorage.getItem("mimo_tts_theme") || "auto";
    } catch {
      return "auto";
    }
  };

  function applyTheme(pref) {
    if (pref === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", pref);
    try {
      localStorage.setItem("mimo_tts_theme", pref);
    } catch {
      /* ignore */
    }
    themeBtn.dataset.pref = pref;
    themeBtn.title = `主题：${THEME_LABEL[pref]}`;
    window.dispatchEvent(new CustomEvent("themechange"));
  }

  themeBtn.dataset.pref = currentTheme();
  themeBtn.title = `主题：${THEME_LABEL[currentTheme()]}`;
  themeBtn.addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    applyTheme(next);
    toast(`主题：${THEME_LABEL[next]}`);
  });

  /* ══════════════════════════════════════════════════════════ model tabs ══ */

  const modelSeg = $("#modelSeg");
  const thumb = element("span", { className: "seg-thumb" });
  modelSeg.append(thumb);

  for (const m of TTS_MODELS) {
    const b = element("button", { type: "button", textContent: m.short });
    b.setAttribute("role", "tab");
    b.dataset.model = m.id;
    b.addEventListener("click", () => {
      if (store.get().model === m.id) return;
      ctx.set({ model: m.id });
    });
    modelSeg.append(b);
  }

  function paintModelSeg() {
    const id = store.get().model;
    const buttons = [...modelSeg.querySelectorAll("button")];
    buttons.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.model === id)));

    const active = buttons.find((b) => b.dataset.model === id);
    if (active?.offsetWidth) {
      thumb.style.width = `${active.offsetWidth}px`;
      thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    }
  }

  /* ═════════════════════════════════════════════════════════════ dock ═══ */

  const formatSeg = $("#formatSeg");
  for (const f of FORMATS) {
    const b = element("button", { type: "button", textContent: f.label, title: f.note });
    b.dataset.format = f.id;
    b.addEventListener("click", () => ctx.set({ format: f.id }));
    formatSeg.append(b);
  }

  const takesSeg = $("#takesSeg");
  for (const n of [1, 2, 3]) {
    const b = element("button", {
      type: "button",
      textContent: String(n),
      title: n === 1 ? "生成 1 条" : `同时生成 ${n} 条择优`,
    });
    b.dataset.takes = String(n);
    b.addEventListener("click", () => ctx.set({ takes: n }));
    takesSeg.append(b);
  }

  const streamToggle = $("#streamToggle");
  const flipStream = () => {
    const on = streamToggle.getAttribute("aria-checked") !== "true";
    const s = store.get();
    ctx.set({ stream: on, format: on ? "pcm16" : s.format === "pcm16" ? "wav" : s.format });
  };
  streamToggle.addEventListener("click", flipStream);
  streamToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flipStream();
    }
  });

  function paintDock() {
    const s = store.get();
    // Segmentation and streaming both force PCM16 and then wrap the result as
    // WAV, so the container choice is not the user's to make in those modes.
    // Leaving the buttons live let the UI claim MP3 while producing WAV.
    const formatLocked = s.stream || s.autoSplit;
    formatSeg.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.format === s.format));
      b.disabled = formatLocked;
    });
    formatSeg.title = s.autoSplit
      ? "自动分段会拼接为 WAV，格式不可选"
      : s.stream
        ? "流式固定输出 PCM16，并在浏览器里封装为 WAV"
        : "";
    takesSeg.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-selected", String(Number(b.dataset.takes) === s.takes));
    });
    streamToggle.setAttribute("aria-checked", String(Boolean(s.stream)));
    streamToggle.title = s.stream
      ? modelOf(s.model).caps.realtimeStream
        ? "流式输出：实时接收 PCM16 音频块"
        : "该模型没有真·低延迟流式，开流式只会拿到一次性结果"
      : "非流式：完成后返回完整文件";
  }

  /* ═════════════════════════════════════════════════════════════ views ══ */

  const player = createPlayer(ctx);
  ctx.player = player;
  ctx.acceptCloneFile = (file) => acceptClone(file, ctx);

  const takes = initTakes(ctx);
  const history = initHistory(ctx);
  ctx.history = history;

  // Bound before initVoice so the panel's save buttons can reach it.
  ctx.library = null;

  initVoice(ctx);
  initDirection(ctx);
  initScript(ctx);
  initInspector(ctx);
  initTagSheet(ctx);
  initSettings(ctx);

  ctx.library = initLibrary(ctx);

  onRefresh.push(paintModelSeg, paintDock);
  onSoftRefresh.push(paintDock);

  // Style-chip removal lives here because the chip row belongs to the script
  // panel but the intent is global, and the transform itself is a domain rule.
  ctx.removeStyleTag = (tag) => {
    ctx.set({ text: removeLeadingTag(store.get().text, tag) });
    ctx.syncTagSheet?.();
  };

  /* ═════════════════════════════════════════════════════════════ synth ══ */

  const synthBtn = $("#synthBtn");
  const synthLabel = $("#synthLabel");
  const synthFill = $("#synthFill");
  const cancelBtn = $("#cancelBtn");
  const statusEl = $("#statusArea");
  const progressBar = $("#progressBar");
  const progressFill = $("#progressFill");

  const synth = createSynth({ getState: () => store.get(), on: handleSynthEvent });
  let lastFinalText = null;

  synthBtn.addEventListener("click", () => ctx.requestSynth());
  cancelBtn.addEventListener("click", () => ctx.cancelSynth());

  ctx.requestSynth = () => {
    if (synth.running) return;
    takes.reset();
    lastFinalText = null;
    renderPreview();
    setStatus("");
    synth.run();
  };

  ctx.cancelSynth = () => {
    synth.cancel();
  };

  function setStatus(message, kind = "", detail = "") {
    statusEl.className = `status ${kind}`;
    setChildren(statusEl);
    if (!message) return;

    const iconName = kind === "is-err" ? "alert" : kind === "is-ok" ? "check" : null;
    if (iconName) {
      const wrap = element("span");
      wrap.innerHTML = ic(iconName);
      statusEl.append(wrap.firstElementChild || wrap);
    }

    const text =
      detail && store.get().showErrors ? `${message} — ${detail}` : message;
    statusEl.append(document.createTextNode(text));
  }

  function handleSynthEvent(event) {
    switch (event.type) {
      case "invalid":
        setStatus(event.problems[0], "is-err");
        toast(event.problems[0], "err", 4200);
        return;

      case "notice":
        toast(event.message);
        return;

      case "start":
        synthBtn.disabled = true;
        cancelBtn.hidden = false;
        synthLabel.textContent = event.takes > 1 ? `合成中 · ${event.takes} 条` : "合成中";
        progressBar.hidden = false;
        progressBar.classList.toggle("is-indeterminate", event.segments <= 1);
        progressFill.style.width = "0";
        setStatus(
          event.segments > 1
            ? `分 ${event.segments} 段合成中…`
            : event.takes > 1
              ? `生成 ${event.takes} 条中…`
              : "合成中…",
        );
        return;

      case "progress": {
        // A single segment has no knowable length, so the bar stays
        // indeterminate rather than sitting at a fake 0%. Segment count is
        // real progress and is shown as such.
        if (event.segments > 1) {
          progressBar.classList.remove("is-indeterminate");
          progressFill.style.width = `${(event.segIndex / event.segments) * 100}%`;
        }
        const bits = [event.label];
        if (event.seconds) bits.push(`${event.seconds.toFixed(1)}s`);
        if (event.bytes) bits.push(`${(event.bytes / 1024).toFixed(0)} KB`);
        setStatus(bits.join(" · "));
        return;
      }

      case "take-done": {
        const r = event.result;
        takes.push(r);
        if (r.finalText) lastFinalText = r.finalText;

        const stored = takes.all.find((t) => t.index === r.index);
        player.load(
          {
            url: r.url,
            blob: r.blob,
            format: r.format,
            duration:
              stored?.duration || (r.pcm ? r.pcm.length / 2 / SAMPLE_RATE : 0),
            size: r.size,
            historyId: r.historyId,
          },
          { autoplay: store.get().takes === 1 },
        );
        setStatus(`第 ${r.index + 1} 条完成`, "is-ok");
        return;
      }

      case "done": {
        synthBtn.disabled = false;
        cancelBtn.hidden = true;
        synthLabel.textContent = "合成";
        progressBar.hidden = true;
        progressFill.style.width = "0";

        if (event.cancelled) setStatus("已取消", "is-warn");
        else if (event.results.length) {
          setStatus(
            `${event.results.length} 条完成 · ${(event.ms / 1000).toFixed(1)}s`,
            "is-ok",
          );
        }

        renderPreview();
        history.reload();
        openOutputOnNarrow();
        return;
      }

      case "error": {
        synthBtn.disabled = false;
        cancelBtn.hidden = true;
        synthLabel.textContent = "合成";
        progressBar.hidden = true;

        const err = event.error;
        const message = err?.message || "合成失败";
        setStatus(message, "is-err", err?.code || "");
        toast(message, "err", 5200);
        if (event.results.length) history.reload();
        return;
      }

      default:
    }
  }

  /* --------------------------------------- VoiceDesign preview script -- */

  function renderPreview() {
    const slot = $("#previewSlot");
    if (!slot) return;

    if (!modelOf(store.get().model).caps.optimizeText || !lastFinalText) {
      setChildren(slot);
      return;
    }

    const head = element("div", { className: "field-head" });
    head.append(
      element("span", { className: "label", textContent: "润色后的播报文本" }),
      element("span", { className: "hint", textContent: "模型实际朗读的内容" }),
    );

    const use = element("button", {
      type: "button",
      className: "btn tiny",
      textContent: "用这段文本替换台词",
    });
    use.addEventListener("click", () => {
      ctx.set({ text: lastFinalText });
      toast("已替换台词", "ok");
    });

    const row = element("div", { className: "row wrap" });
    row.append(use);

    const box = element("div", { className: "field" });
    box.append(
      head,
      element("p", { className: "note", textContent: lastFinalText }),
      row,
    );

    setChildren(slot, element("hr", { className: "divider" }), box);
  }

  /* ═══════════════════════════════════════════════════════ history glue ══ */

  ctx.loadParams = (full, listItem = {}) => {
    const spec = full?.spec || {};
    const patch = {
      model: spec.model || full?.model || listItem.model || store.get().model,
      text: full?.text ?? listItem.text ?? "",
    };

    // Only overwrite when the record actually carried a value: design and
    // clone takes store `voice: ""`, and writing that back would silently
    // reset the user's chosen preset voice.
    if (typeof spec.voice === "string" && spec.voice) patch.voice = spec.voice;
    if (typeof spec.voiceDesign === "string") patch.voiceDesign = spec.voiceDesign;
    if (typeof spec.style === "string") patch.style = spec.style;
    else if (typeof full?.style === "string") patch.style = full.style;
    if (spec.director) patch.director = { ...spec.director };
    if (typeof spec.optimize === "boolean") patch.optimize = spec.optimize;
    if (typeof spec.autoSplit === "boolean") patch.autoSplit = spec.autoSplit;
    if (spec.format && FORMATS.some((f) => f.id === spec.format)) patch.format = spec.format;
    if (spec.cloneName) patch.cloneName = spec.cloneName;

    store.set(patch, { silent: true });
    persistence?.schedule();
    refresh();

    if (spec.truncated) {
      toast("这条参数过多，风格与导演描述未能完整保存", "err", 4200);
    } else if (spec.cloneName) {
      toast(`参数已载入；克隆样本「${spec.cloneName}」需要重新上传`, "ok", 4200);
    } else if (spec.model) {
      toast("参数已载入", "ok");
    } else {
      toast("参数已载入（这条较早，部分字段无法还原）", "ok");
    }
    setStatus("已载入历史参数，可重新编辑合成", "is-ok");

    if (window.matchMedia("(max-width: 980px)").matches) {
      $("#output").classList.remove("is-open");
    }
  };

  /** Reuse the tag sheet as a picker for "clone from a past take". */
  ctx.pickFromHistory = async () => {
    const sheet = $("#tagSheet");
    const body = $("#tagSheetBody");
    const tabs = $("#tagSheetTabs");
    $("#tagSheetTitle").textContent = "从历史音频选择";

    setChildren(tabs);
    setChildren(body, element("p", { className: "note", textContent: "读取中…" }));
    sheet.classList.add("is-open");
    $("#mask").classList.add("is-open");
    document.body.classList.add("is-locked");

    try {
      const data = await get("/api/history?limit=30");
      const items = (data?.items || []).filter((x) => /^(wav|mp3)$/i.test(x.format || "wav"));

      if (!items.length) {
        setChildren(
          body,
          element("p", { className: "note", textContent: "还没有可用的历史音频。" }),
        );
        return;
      }

      setChildren(
        body,
        ...items.map((item) => {
          const b = element("button", {
            type: "button",
            className: "tag-pill",
            textContent: `${(item.text || "").replace(/\s+/g, " ").slice(0, 20)} · ${formatClock(item.duration)}`,
            title: item.text || "",
          });
          b.addEventListener("click", async () => {
            ctx.closeTagSheet();
            try {
              const blob = await (await fetch(item.url)).blob();
              const ext = item.format === "mp3" ? "mp3" : "wav";
              ctx.acceptCloneFile(
                new File([blob], `history-${item.id}.${ext}`, { type: blob.type || "audio/wav" }),
              );
            } catch (e) {
              toast(`读取失败：${e.message}`, "err");
            }
          });
          return b;
        }),
      );
    } catch (e) {
      setChildren(
        body,
        element("p", { className: "note err", textContent: `读取失败：${e.message}` }),
      );
    }
  };

  ctx.onLangChange = () => ctx.syncTagSheet?.();

  /**
   * Minimal text prompt, reusing the tag sheet container.
   * Resolves with the trimmed value, or null if dismissed.
   */
  ctx.promptText = (title, initial = "") =>
    new Promise((resolve) => {
      const sheet = $("#tagSheet");
      const body = $("#tagSheetBody");
      const tabs = $("#tagSheetTabs");
      $("#tagSheetTitle").textContent = title;

      setChildren(tabs);
      sheet.classList.add("is-open");
      $("#mask").classList.add("is-open");
      document.body.classList.add("is-locked");

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        ctx.closeTagSheet();
        resolve(value);
      };

      const input = element("input", {
        type: "text",
        value: initial,
        placeholder: "名称",
        maxlength: "60",
        "aria-label": title,
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(input.value.trim() || null);
        }
      });

      const save = element("button", {
        type: "button",
        className: "btn primary",
        textContent: "保存",
      });
      save.addEventListener("click", () => finish(input.value.trim() || null));

      const cancel = element("button", { type: "button", className: "btn", textContent: "取消" });
      cancel.addEventListener("click", () => finish(null));

      const row = element("div", { className: "row wrap" });
      row.append(save, cancel);

      const wrap = element("div", { className: "prompt" });
      wrap.append(input, row);
      setChildren(body, wrap);
      setTimeout(() => input.focus(), 40);
    });

  /* ═══════════════════════════════════════════════════ output behaviour ══ */

  const NARROW = () => window.matchMedia("(max-width: 980px)").matches;

  function openOutputOnNarrow() {
    if (NARROW()) $("#output").classList.add("is-open");
  }

  $("#outputHead").addEventListener("click", () => {
    if (NARROW()) $("#output").classList.toggle("is-open");
  });

  /* ═════════════════════════════════════════════════════════ keyboard ══ */

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      ctx.requestSynth();
      return;
    }
    if (e.key === "Escape" && synth.running) {
      e.preventDefault();
      ctx.cancelSynth();
      return;
    }
    for (const fn of keyHandlers) {
      if (fn(e)) {
        e.preventDefault();
        return;
      }
    }
  });

  $("#kbdHint").textContent = /Mac|iPhone|iPad/.test(navigator.platform || "")
    ? "⌘⏎"
    : "Ctrl⏎";

  /* ══════════════════════════════════════════════════════════ start up ══ */

  const syncBadge = $("#syncBadge");
  const syncText = $("#syncText");

  persistence = createPersistence(store, {
    onStatus(status) {
      syncBadge.className = `badge${
        status === "ok"
          ? " is-ok"
          : status === "pending"
            ? " is-busy"
            : status === "err"
              ? " is-err"
              : ""
      }`;
      syncText.textContent = SYNC_LABEL[status] || status;
    },
  });

  const gate = createGate(ctx);

  await persistence.restore();
  refresh();

  // Restored state may name a different model, whose panel has a different
  // shape, so the tree is rebuilt once after hydration.
  paintModelSeg();
  paintDock();

  gate.check();

  if ("ResizeObserver" in window) {
    new ResizeObserver(paintModelSeg).observe(modelSeg);
  } else {
    window.addEventListener("resize", paintModelSeg);
  }

  // The thumb is measured from live layout, so re-measure once fonts settle.
  setTimeout(paintModelSeg, 120);
  void auth;
}
