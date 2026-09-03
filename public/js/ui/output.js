/** 输出区：播放器（波形/进度/下载）+ 历史列表（D1 + R2） */

import { apiJson, audioUrl } from "../api.js";
import { formatDuration } from "../tts.js";

let audioEl = null;
let audioCtx = null;
let objectUrl = null;

const $ = (id) => document.getElementById(id);

export function initOutput(onLoadParams) {
  audioEl = new Audio();

  $("playBtn").addEventListener("click", () => {
    if (!audioEl.src) return;
    if (audioEl.paused) {
      audioEl.play();
    } else {
      audioEl.pause();
    }
  });
  audioEl.addEventListener("play", () => {
    $("playBtn").textContent = "⏸";
  });
  audioEl.addEventListener("pause", () => {
    $("playBtn").textContent = "▶";
  });
  audioEl.addEventListener("ended", () => {
    $("playBtn").textContent = "▶";
    setPlayingItem(null);
  });
  audioEl.addEventListener("timeupdate", () => {
    if (!audioEl.duration) return;
    $("progressFill").style.width =
      `${(audioEl.currentTime / audioEl.duration) * 100}%`;
    $("timeDisplay").textContent =
      `${formatDuration(audioEl.currentTime)} / ${formatDuration(audioEl.duration)}`;
  });
  for (const id of ["progressBar", "waveformCanvas"]) {
    $(id).addEventListener("click", (e) => {
      if (!audioEl.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      audioEl.currentTime =
        ((e.clientX - rect.left) / rect.width) * audioEl.duration;
    });
  }

  $("historyList").addEventListener("click", (e) => {
    const item = e.target.closest(".history-item");
    if (!item) return;
    const id = item.dataset.id;
    const del = e.target.closest(".del");
    if (del) {
      deleteHistory(id, item);
      return;
    }
    const load = e.target.closest(".load");
    if (load) {
      try {
        onLoadParams?.(JSON.parse(item.dataset.params));
      } catch {
        /* 忽略损坏的历史条目 */
      }
      return;
    }
    playHistory(item);
  });

  loadHistory();
}

/** 展示本次合成结果并写入历史 */
export async function showResult(blob, meta) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  audioEl.src = objectUrl;
  $("playerSection").hidden = false;
  $("emptyState").hidden = true;
  $("downloadLink").href = objectUrl;
  $("durationInfo").textContent =
    `WAV · ${formatDuration(meta.duration)} · ${(blob.size / 1024).toFixed(1)} KB`;
  $("timeDisplay").textContent = `0:00 / ${formatDuration(meta.duration)}`;
  audioEl.addEventListener("loadedmetadata", () => drawWaveform(objectUrl), {
    once: true,
  });
  drawWaveform(objectUrl);

  // 上传历史（失败不影响使用）
  try {
    const form = new FormData();
    form.append("audio", blob, "tts.wav");
    form.append("meta", JSON.stringify(meta));
    const res = await apiJson("/api/history", { method: "POST", body: form });
    if (res.ok) loadHistory();
  } catch {
    /* 离线/未授权时静默跳过 */
  }
}

async function loadHistory() {
  try {
    const { ok, data } = await apiJson("/api/history?limit=50");
    if (!ok || !Array.isArray(data)) return;
    const list = $("historyList");
    list.textContent = "";
    if (!data.length) {
      const tip = document.createElement("div");
      tip.className = "history-more";
      tip.textContent = "暂无历史记录";
      list.appendChild(tip);
      return;
    }
    for (const item of data) {
      list.appendChild(historyItemEl(item));
    }
  } catch {
    /* 静默 */
  }
}

function historyItemEl(item) {
  const div = document.createElement("div");
  div.className = "history-item";
  div.dataset.id = item.id;

  const top = document.createElement("div");
  top.className = "hi-top";
  const hiText = document.createElement("span");
  hiText.className = "hi-text";
  hiText.textContent =
    (item.text || "").replace(/\s+/g, " ").slice(0, 60) || "(空)";
  const hiTime = document.createElement("span");
  hiTime.className = "hi-time mono";
  hiTime.textContent = timeAgo(item.created_at);
  top.append(hiText, hiTime);

  const bottom = document.createElement("div");
  bottom.className = "hi-bottom";
  const hiVoice = document.createElement("span");
  hiVoice.className = "hi-voice";
  hiVoice.textContent =
    item.voice || item.model.replace("mimo-v2.5-tts", "MiMo");
  const hiDur = document.createElement("span");
  hiDur.className = "mono";
  hiDur.textContent = formatDuration(item.duration || 0);
  const hiSize = document.createElement("span");
  hiSize.className = "mono";
  hiSize.textContent = `${((item.size || 0) / 1024).toFixed(0)} KB`;
  const actions = document.createElement("span");
  actions.className = "hi-actions";
  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.className = "load";
  loadBtn.title = "载入参数重新编辑";
  loadBtn.textContent = "↻ 载入";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "del";
  delBtn.title = "删除";
  delBtn.textContent = "✕";
  actions.append(loadBtn, delBtn);
  bottom.append(hiVoice, hiDur, hiSize, actions);

  div.append(top, bottom);
  div.dataset.params = JSON.stringify({
    model: item.model,
    voice: item.voice,
    style: item.style,
    text: item.text,
  });
  return div;
}

function playHistory(item) {
  audioEl.src = audioUrl(item.dataset.id);
  audioEl.play().catch(() => {});
  setPlayingItem(item.dataset.id);
}

async function deleteHistory(id, el) {
  el.remove();
  try {
    await apiJson(`/api/history/${id}`, { method: "DELETE" });
  } catch {
    /* 列表已本地移除 */
  }
}

function setPlayingItem(id) {
  document.querySelectorAll(".history-item").forEach((el) => {
    el.classList.toggle("playing", el.dataset.id === id);
  });
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

async function drawWaveform(src) {
  try {
    const canvas = $("waveformCanvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const res = await fetch(src);
    const buf = await res.arrayBuffer();
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuf = await audioCtx.decodeAudioData(buf.slice(0));
    const data = audioBuf.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / w));
    const samples = [];
    for (let i = 0; i < w; i++) {
      let sum = 0;
      let n = 0;
      for (let j = 0; j < step && i * step + j < data.length; j++, n++) {
        sum += Math.abs(data[i * step + j]);
      }
      samples.push(n ? sum / n : 0);
    }
    const max = Math.max(...samples, 0.001);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim() || "oklch(0.78 0.14 75 / 0.6)";
    ctx.globalAlpha = 0.6;
    samples.forEach((s, i) => {
      const barH = Math.max(2, (s / max) * (h - 6));
      ctx.fillRect(i, (h - barH) / 2, 1, barH);
    });
  } catch (e) {
    console.warn("waveform draw failed:", e);
  }
}
