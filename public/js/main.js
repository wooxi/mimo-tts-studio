/** 入口：装配顶栏 / 创作区 / 输出区 / 设置抽屉，启动合成与配置恢复 */

import {
  state,
  MODELS,
  PRESET_VOICES,
  scheduleSave,
  restoreConfig,
} from "./store.js";
import { apiJson } from "./api.js";
import {
  buildBody,
  validate,
  synthesize,
  synthesizeStream,
  fileToVoiceData,
} from "./tts.js";
import { initTags, renderChips } from "./ui/tags.js";
import { initOutput, showResult } from "./ui/output.js";
import { initSettings, syncBadge, updateStreamNote } from "./ui/settings.js";

const $ = (id) => document.getElementById(id);

// ---------- 主题 ----------
const themeBtn = $("themeToggle");
const savedTheme = localStorage.getItem("mimo_tts_theme");
if (savedTheme === "dark" || savedTheme === "light")
  document.documentElement.setAttribute("data-theme", savedTheme);
themeBtn.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "light"
      ? "dark"
      : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("mimo_tts_theme", next);
  window.dispatchEvent(new CustomEvent("themechange"));
});

// ---------- 模型切换（分段滑块） ----------
const modelTabs = $("modelTabs");
const segThumb = modelTabs.querySelector(".seg-thumb");

function positionThumb() {
  const active = modelTabs.querySelector("button.active");
  if (!active || !segThumb) return;
  segThumb.style.width = `${active.offsetWidth}px`;
  segThumb.style.transform = `translateX(${active.offsetLeft}px)`;
}

for (const [id, info] of Object.entries(MODELS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = info.label;
  b.setAttribute("role", "tab");
  b.dataset.model = id;
  b.addEventListener("click", () => {
    if (state.model === id) return;
    state.model = id;
    renderModelTabs();
    renderModelCard();
    if (!MODELS[id].supportsStream && state.stream) state.stream = false;
    updateStreamNote();
    scheduleSave(syncBadge);
  });
  modelTabs.appendChild(b);
}

function renderModelTabs() {
  modelTabs.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.model === state.model);
    b.setAttribute("aria-selected", b.dataset.model === state.model);
  });
  positionThumb();
}

// ---------- 模型专属卡片 ----------
const modelCard = $("modelCard");
function renderModelCard() {
  modelCard.textContent = "";
  const info = MODELS[state.model];
  $("modelDesc").textContent = info.desc;

  if (info.presetVoices) {
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "预置音色";
    const select = document.createElement("select");
    select.id = "voiceSelect";
    PRESET_VOICES.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.label} (${v.lang})`;
      if (v.id === state.voice) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      state.voice = select.value;
      scheduleSave(syncBadge);
    });
    modelCard.append(label, select);

    // 唱歌模式
    modelCard.appendChild(
      toggleRow("唱歌模式", "singingToggle", state.singing, (on) => {
        state.singing = on;
        scheduleSave(syncBadge);
      }),
    );
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "开启后在文本开头自动拼接 (唱歌) 标签";
    modelCard.appendChild(note);
  }

  if (state.model === "mimo-v2.5-tts-voicedesign") {
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "音色描述";
    const ta = document.createElement("textarea");
    ta.id = "voiceDesignInput";
    ta.rows = 3;
    ta.placeholder =
      "Young female, warm and gentle voice, like a close friend whispering a bedtime story.";
    ta.value = state.voiceDesign;
    ta.addEventListener("input", () => {
      state.voiceDesign = ta.value;
      scheduleSave(syncBadge);
    });
    modelCard.append(label, ta);

    modelCard.appendChild(
      toggleRow("优化文本预览", "optimizeToggle", state.optimize, (on) => {
        state.optimize = on;
        scheduleSave(syncBadge);
      }),
    );
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "智能润色目标播报文本，开启后可省略合成文本";
    modelCard.appendChild(note);
  }

  if (state.model === "mimo-v2.5-tts-voiceclone") {
    const label = document.createElement("div");
    label.className = "field-label";
    label.textContent = "音频样本";
    const upload = document.createElement("div");
    upload.className = "file-upload";
    upload.innerHTML = `
      <span data-role="txt">点击或拖拽上传 MP3/WAV 样本</span>
      <input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" aria-label="上传音频样本">`;
    const nameEl = document.createElement("p");
    nameEl.className = "note";
    const input = upload.querySelector("input");
    input.addEventListener("change", () => {
      const f = input.files[0];
      state.cloneFile = f || null;
      upload.style.borderColor = f ? "var(--ok)" : "";
      nameEl.textContent = f
        ? `已选择：${f.name}（${(f.size / 1024 / 1024).toFixed(1)} MB · Base64 后不超过 10MB）`
        : "";
    });
    ["dragover", "dragleave", "drop"].forEach((ev) => {
      upload.addEventListener(ev, (e) => {
        e.preventDefault();
        upload.classList.toggle("drag", ev === "dragover");
        if (ev === "drop") {
          const f = e.dataTransfer?.files?.[0];
          if (f) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.files = dt.files;
            input.dispatchEvent(new Event("change"));
          }
        }
      });
    });
    modelCard.append(label, upload, nameEl);
  }
}

function toggleRow(text, id, checked, onChange) {
  const row = document.createElement("div");
  row.className = "toggle-row";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = text;
  const t = document.createElement("div");
  t.className = "toggle" + (checked ? " active" : "");
  t.id = id;
  t.setAttribute("role", "switch");
  t.setAttribute("aria-checked", String(!!checked));
  t.tabIndex = 0;
  const flip = () => {
    const on = !t.classList.contains("active");
    t.classList.toggle("active", on);
    t.setAttribute("aria-checked", String(on));
    onChange(on);
  };
  t.addEventListener("click", flip);
  t.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flip();
    }
  });
  row.append(lbl, t);
  return row;
}

// ---------- 标签 ----------
initTags($("tagsPanel"), state, {
  onStyleTag(tag, on) {
    if (on) state.styleTags.add(tag);
    else state.styleTags.delete(tag);
    renderChipsFromState();
    scheduleSave(syncBadge);
  },
  onAudioTag(tag) {
    const ta = $("textInput");
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const insert = `[${tag}]`;
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    const pos = start + insert.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    state.text = ta.value;
    updateCharCount();
    scheduleSave(syncBadge);
  },
});

function syncTagPills() {
  document.querySelectorAll("#tagsPanel .tag-pill").forEach((pill) => {
    pill.classList.toggle("active", state.styleTags.has(pill.textContent));
  });
  $("tagCount").textContent = state.styleTags.size
    ? String(state.styleTags.size)
    : "";
}
const removeChip = (tag) => {
  state.styleTags.delete(tag);
  renderChipsFromState();
  scheduleSave(syncBadge);
};

function renderChipsFromState() {
  renderChips($("chipRow"), state, removeChip);
  syncTagPills();
}

// ---------- 输入绑定 ----------
const textInput = $("textInput");
function updateCharCount() {
  $("charCount").textContent = textInput.value
    ? `${textInput.value.length} 字`
    : "";
}
textInput.addEventListener("input", () => {
  state.text = textInput.value;
  updateCharCount();
  scheduleSave(syncBadge);
});
$("styleInput").addEventListener("input", () => {
  state.style = $("styleInput").value;
  scheduleSave(syncBadge);
});
["directorRole", "directorScene", "directorGuide"].forEach((id, i) => {
  $(id).addEventListener("input", () => {
    state.director[["role", "scene", "guide"][i]] = $(id).value;
    scheduleSave(syncBadge);
  });
});

textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    doSynthesize();
  }
});

// ---------- 折叠区 ----------
document.querySelectorAll(".fold-head").forEach((head) => {
  head.addEventListener("click", () => {
    const fold = head.closest(".fold");
    const open = fold.classList.toggle("open");
    head.setAttribute("aria-expanded", String(open));
  });
});

// 移动端输出抽屉把手
$("outputHead").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 820px)").matches) {
    $("paneOutput").classList.toggle("open");
  }
});

// ---------- 合成 ----------
const synthBtn = $("synthesizeBtn");
const synthLabel = $("synthLabel");
let busy = false;

async function doSynthesize() {
  if (busy) return;
  const err = validate();
  if (err) {
    setStatus(err, "err");
    return;
  }

  busy = true;
  synthBtn.disabled = true;
  synthBtn.classList.add("busy");
  synthLabel.textContent = "合成中";
  setStatus("", "");

  const body = buildBody();

  try {
    if (state.model === "mimo-v2.5-tts-voiceclone") {
      body.audio.voice = await fileToVoiceData(state.cloneFile);
    }

    let result;
    if (state.stream) {
      $("progressArea").hidden = false;
      result = await synthesizeStream(body, (bytes) => {
        $("progressText").textContent =
          `接收中… ${(bytes / 1024).toFixed(1)} KB`;
      });
      $("progressArea").hidden = true;
    } else {
      result = await synthesize(body);
    }

    await showResult(result.blob, {
      model: state.model,
      voice: state.model === "mimo-v2.5-tts" ? state.voice : "",
      format: "wav",
      style: state.style,
      text: state.text,
      duration: result.duration,
    });
    setStatus("合成完成", "ok");
  } catch (e) {
    $("progressArea").hidden = true;
    if (e.name === "AbortError") return;
    setStatus("合成失败: " + e.message, "err");
    console.error(e);
  } finally {
    busy = false;
    synthBtn.disabled = false;
    synthBtn.classList.remove("busy");
    synthLabel.textContent = "合成";
  }
}

synthBtn.addEventListener("click", doSynthesize);

function setStatus(msg, cls) {
  const el = $("statusArea");
  el.className = `status ${cls}`;
  el.textContent = msg;
}

// ---------- 载入历史参数 ----------
function loadParams(p) {
  if (!p) return;
  if (p.model && MODELS[p.model]) {
    state.model = p.model;
    renderModelTabs();
    renderModelCard();
  }
  if (p.voice) {
    state.voice = p.voice;
  }
  if (typeof p.style === "string") {
    state.style = p.style;
    $("styleInput").value = p.style;
  }
  if (typeof p.text === "string") {
    state.text = p.text;
    textInput.value = p.text;
    updateCharCount();
  }
  if (p.voice && MODELS[p.model]?.presetVoices) {
    const sel = $("voiceSelect");
    if (sel) sel.value = p.voice;
  }
  renderChipsFromState();
  scheduleSave(syncBadge);
  setStatus("已载入历史参数，可重新编辑合成", "info");
  $("paneOutput").classList.remove("open");
}

// ---------- 启动 ----------
renderModelTabs();
renderModelCard();
renderChipsFromState();
textInput.value = state.text;
updateCharCount();
$("styleInput").value = state.style;
$("directorRole").value = state.director.role;
$("directorScene").value = state.director.scene;
$("directorGuide").value = state.director.guide;
$("kbdHint").textContent = /Mac|iPhone|iPad/.test(navigator.platform)
  ? "⌘⏎"
  : "Ctrl⏎";
initOutput(loadParams);
initSettings();

if ("ResizeObserver" in window) {
  new ResizeObserver(positionThumb).observe(modelTabs);
} else {
  window.addEventListener("resize", positionThumb);
}

restoreConfig((status) => {
  syncBadge(status);
  if (status === "ok") {
    // 服务端配置覆盖后刷新受控 DOM
    textInput.value = state.text;
    updateCharCount();
    $("styleInput").value = state.style;
    $("directorRole").value = state.director.role;
    $("directorScene").value = state.director.scene;
    $("directorGuide").value = state.director.guide;
    renderModelTabs();
    renderModelCard();
    renderChipsFromState();
    updateStreamNote();
  }
});

// 令牌/服务端状态探测（/api/history 需要令牌，401 说明令牌缺失或错误）
(async () => {
  const res = await apiJson("/api/history?limit=1").catch(() => ({
    ok: true,
    status: 200,
  }));
  if (res.status === 401) {
    setStatus("需要访问令牌：点击右上角设置填入 CONFIG_TOKEN", "err");
  }
})();
