/** 设置抽屉：访问令牌、音频格式、流式输出 */

import { server, apiJson } from "../api.js";
import { state, scheduleSave, MODELS } from "../store.js";

const $ = (id) => document.getElementById(id);

export function initSettings() {
  const drawer = $("settingsDrawer");
  const mask = $("drawerMask");

  const open = () => {
    drawer.classList.add("open");
    mask.classList.add("open");
  };
  const close = () => {
    drawer.classList.remove("open");
    mask.classList.remove("open");
  };
  $("settingsBtn").addEventListener("click", open);
  $("drawerClose").addEventListener("click", close);
  mask.addEventListener("click", close);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // 令牌
  const tokenInput = $("tokenInput");
  tokenInput.value = server.token;
  tokenInput.addEventListener("change", () => {
    server.setToken(tokenInput.value);
    showTokenStatus();
  });
  showTokenStatus();

  // 格式
  document.querySelectorAll('input[name="format"]').forEach((el) => {
    el.checked = el.value === state.format;
    el.addEventListener("change", () => {
      state.format = el.value;
      syncFormatButtons();
      syncStreamToFormat();
      scheduleSave(syncBadge);
    });
  });
  syncFormatButtons();

  // 流式
  const streamToggle = $("streamToggle");
  streamToggle.classList.toggle("active", state.stream);
  streamToggle.setAttribute("aria-checked", String(!!state.stream));
  const flipStream = () => {
    if (!MODELS[state.model].supportsStream && !state.stream) {
      setSettingsStatus("该模型不支持流式输出", "err");
      return;
    }
    state.stream = !state.stream;
    streamToggle.classList.toggle("active", state.stream);
    streamToggle.setAttribute("aria-checked", String(!!state.stream));
    if (state.stream && state.format !== "pcm16") {
      state.format = "pcm16";
      document.querySelector('input[name="format"][value="pcm16"]').checked =
        true;
    }
    updateStreamNote();
    scheduleSave(syncBadge);
  };
  streamToggle.addEventListener("click", flipStream);
  streamToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flipStream();
    }
  });
  updateStreamNote();
}

export function syncFormatButtons() {
  document.querySelectorAll("[data-format]").forEach((b) => {
    b.classList.toggle("active", b.dataset.format === state.format);
  });
}

export function syncStreamToFormat() {
  if (state.stream && state.format !== "pcm16") {
    state.format = "pcm16";
    document.querySelector('input[name="format"][value="pcm16"]').checked =
      true;
  }
  updateStreamNote();
}

export function updateStreamNote() {
  const el = $("streamNote");
  if (state.stream && !MODELS[state.model].supportsStream) {
    el.textContent = "当前模型不支持流式输出";
    el.style.color = "var(--err)";
  } else if (state.stream) {
    el.textContent = "流式模式 — 实时接收 PCM16 音频块";
    el.style.color = "";
  } else {
    el.textContent = "非流式 — 完成后返回完整 WAV";
    el.style.color = "";
  }
}

export function syncBadge(status) {
  const el = $("syncBadge");
  el.className =
    "sync-dot" + (status === "ok" ? " ok" : status === "err" ? " err" : "");
  el.querySelector(".txt").textContent =
    status === "ok"
      ? "已同步"
      : status === "err"
        ? "同步失败"
        : status === "off"
          ? "本地"
          : "同步中…";
}

function showTokenStatus() {
  const el = $("tokenStatus");
  if (!el) return;
  el.textContent = server.token ? "已设置" : "未设置";
  el.style.color = server.token ? "var(--ok)" : "";
}

function setSettingsStatus(msg, cls) {
  const el = $("settingsStatus");
  el.className = `status ${cls}`;
  el.textContent = msg;
  setTimeout(() => {
    el.textContent = "";
  }, 3000);
}
