/** 输出区：播放器（波形/进度/下载）+ 历史列表（D1 + R2） */

import { apiJson, audioUrl } from "../api.js";
import { formatDuration } from "../tts.js";

let audioEl = null;
let audioCtx = null;
let objectUrl = null;
let audioBuffer = null;
let barCache = { w: 0, samples: [] };
let paintRaf = 0;

const $ = (id) => document.getElementById(id);

const ICON_PLAY =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.4 5.4v13.2c0 .85.95 1.36 1.66.9l10.2-6.6a1.08 1.08 0 0 0 0-1.8L10.06 4.5c-.71-.46-1.66.05-1.66.9z"/></svg>';
const ICON_PAUSE =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.6" y="5" width="3.5" height="14" rx="1.2"/><rect x="13.9" y="5" width="3.5" height="14" rx="1.2"/></svg>';
const ICON_LOAD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 5v5h5"/><path d="M4.1 14.5a8 8 0 1 0 .9-6.9L3.5 10"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15"/><path d="M9.5 7V5.4c0-.77.62-1.4 1.4-1.4h2.2c.78 0 1.4.63 1.4 1.4V7"/><path d="M6.5 7l.9 12.1a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/></svg>';

function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function initOutput(onLoadParams) {
  audioEl = new Audio();
  $("playBtn").innerHTML = ICON_PLAY;

  $("playBtn").addEventListener("click", () => {
    if (!audioEl.src) return;
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
  });
  audioEl.addEventListener("play", () => {
    $("playBtn").innerHTML = ICON_PAUSE;
  });
  const onPause = () => {
    $("playBtn").innerHTML = ICON_PLAY;
  };
  audioEl.addEventListener("pause", onPause);
  audioEl.addEventListener("ended", () => {
    onPause();
    setPlayingItem(null);
  });
  audioEl.addEventListener("timeupdate", () => {
    const progress = audioEl.duration
      ? audioEl.currentTime / audioEl.duration
      : 0;
    $("progressFill").style.width = `${progress * 100}%`;
    $("timeDisplay").textContent = `${formatDuration(audioEl.currentTime)} / ${formatDuration(audioEl.duration)}`;
    paintWave(progress);
  });

  for (const id of ["progressBar", "waveformCanvas"]) {
    $(id).addEventListener("click", (e) => {
      if (!audioEl.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      audioEl.currentTime =
        ((e.clientX - rect.left) / rect.width) * audioEl.duration;
    });
  }

  // 主题切换 / 窗口变化时重绘波形
  window.addEventListener("themechange", () => {
    if (audioBuffer) {
      barCache = { w: 0, samples: [] };
      paintWave(progressRatio());
    }
  });
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (audioBuffer) {
        barCache = { w: 0, samples: [] };
        paintWave(progressRatio());
      }
    }, 180);
  });

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

function progressRatio() {
  return audioEl && audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
}

/** 展示本次合成结果并写入历史 */
export async function showResult(blob, meta) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(blob);
  playSource(objectUrl, {
    durationText: `WAV · ${formatDuration(meta.duration)} · ${(blob.size / 1024).toFixed(1)} KB`,
  });

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

  // 移动端：合成完成后自动展开输出抽屉
  if (window.matchMedia("(max-width: 820px)").matches) {
    $("paneOutput").classList.add("open");
  }
}

/** 把一个音频源装载进播放器卡（本次结果或历史条目） */
function playSource(src, { durationText }) {
  audioEl.src = src;
  $("playerSection").hidden = false;
  $("emptyState").hidden = true;
  $("downloadLink").href = src;
  $("durationInfo").textContent = durationText;
  $("timeDisplay").textContent = "0:00 / —";
  $("progressFill").style.width = "0%";
  audioBuffer = null;
  barCache = { w: 0, samples: [] };
  paintWave(0);

  const requested = new URL(src, location.href).href;
  fetch(src)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      if (!audioCtx)
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      return audioCtx.decodeAudioData(buf);
    })
    .then((decoded) => {
      // 解码期间用户可能已切换到其他音频
      if (audioEl.src !== requested) return;
      audioBuffer = decoded;
      barCache = { w: 0, samples: [] };
      paintWave(progressRatio());
    })
    .catch(() => {
      /* 解码失败时静默，播放仍可用 */
    });
}

function playHistory(item) {
  const id = item.dataset.id;
  const dur = parseFloat(item.dataset.duration) || 0;
  const size = parseInt(item.dataset.size, 10) || 0;
  playSource(audioUrl(id), {
    durationText: `WAV · ${formatDuration(dur)} · ${(size / 1024).toFixed(0)} KB`,
  });
  audioEl.play().catch(() => {});
  setPlayingItem(id);
}

async function loadHistory() {
  try {
    const { ok, data } = await apiJson("/api/history?limit=50");
    if (!ok || !Array.isArray(data)) return;
    const list = $("historyList");
    list.textContent = "";
    $("historyCount").textContent = data.length ? `${data.length} 条` : "";
    if (!data.length) {
      const tip = document.createElement("div");
      tip.className = "history-more";
      tip.textContent = "暂无历史记录";
      list.appendChild(tip);
      return;
    }
    data.forEach((item, i) => {
      const el = historyItemEl(item);
      el.style.animationDelay = `${Math.min(i, 12) * 0.03}s`;
      list.appendChild(el);
    });
  } catch {
    /* 静默 */
  }
}

function historyItemEl(item) {
  const div = document.createElement("div");
  div.className = "history-item";
  div.dataset.id = item.id;
  div.dataset.duration = item.duration || 0;
  div.dataset.size = item.size || 0;

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
  loadBtn.innerHTML = `${ICON_LOAD}<span>载入</span>`;
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "del";
  delBtn.title = "删除";
  delBtn.setAttribute("aria-label", "删除这条记录");
  delBtn.innerHTML = ICON_TRASH;
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

async function deleteHistory(id, el) {
  el.classList.add("removing");
  setTimeout(() => el.remove(), 180);
  try {
    await apiJson(`/api/history/${id}`, { method: "DELETE" });
  } catch {
    /* 列表已本地移除 */
  }
  const list = $("historyList");
  const remaining = list.querySelectorAll(".history-item").length;
  $("historyCount").textContent = remaining ? `${remaining} 条` : "";
  if (!remaining) {
    const tip = document.createElement("div");
    tip.className = "history-more";
    tip.textContent = "暂无历史记录";
    list.appendChild(tip);
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

/* ---------- 波形绘制（未播放墨灰 / 已播放朱砂） ---------- */

function barsFor(w) {
  if (barCache.w === w) return barCache.samples;
  const data = audioBuffer.getChannelData(0);
  const barW = 3;
  const gap = 2;
  const count = Math.max(8, Math.floor(w / (barW + gap)));
  const step = Math.max(1, Math.floor(data.length / count));
  const samples = [];
  for (let i = 0; i < count; i++) {
    let sum = 0;
    let n = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j++, n++) sum += Math.abs(data[j]);
    samples.push(n ? sum / n : 0);
  }
  const max = Math.max(...samples, 0.001);
  const norm = samples.map((s) => s / max);
  barCache = { w, samples: norm };
  return norm;
}

function paintWave(progress = 0) {
  cancelAnimationFrame(paintRaf);
  paintRaf = requestAnimationFrame(() => {
    const canvas = $("waveformCanvas");
    if (!canvas || canvas.parentElement.hidden) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width) return;
    const w = rect.width;
    const h = rect.height;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!audioBuffer) return;
    const samples = barsFor(w);
    const played = Math.round(samples.length * Math.min(1, Math.max(0, progress)));
    const accent = cssColor("--accent", "oklch(0.545 0.185 27)");
    const idle = cssColor("--ink-faint", "oklch(0.60 0.011 250)");
    const barW = 3;
    const gap = 2;
    ctx.fillStyle = idle;
    samples.forEach((s, i) => {
      if (i < played) return;
      const barH = Math.max(2.5, s * (h - 8));
      ctx.fillRect(i * (barW + gap), (h - barH) / 2, barW, barH);
    });
    ctx.fillStyle = accent;
    samples.forEach((s, i) => {
      if (i >= played) return;
      const barH = Math.max(2.5, s * (h - 8));
      ctx.fillRect(i * (barW + gap), (h - barH) / 2, barW, barH);
    });
  });
}
