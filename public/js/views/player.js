/**
 * Waveform player.
 *
 * One audio element drives the whole pane. Peaks are computed once per loaded
 * source and repainted on theme change or resize, never re-decoded.
 */

import { $, h, setChildren, formatClock, formatBytes, raf } from "../core/dom.js";
import { ic } from "../icons.js";
import { peaks, decode, durationOf, blobMeta, context } from "../domain/audio.js";
import { drawPeaks } from "./voice.js";

const RATES = [0.75, 1, 1.25, 1.5];

export function createPlayer(ctx) {
  const audio = new Audio();
  audio.preload = "metadata";

  const box = $("#waveBox");
  const canvas = $("#waveCanvas");
  const playBtn = $("#playBtn");
  const scrub = $("#scrub");
  const fill = $("#scrubFill");
  const timeLabel = $("#timeLabel");
  const metaEl = $("#playerMeta");
  const rateRow = $("#rateRow");
  const dl = $("#downloadLink");
  const useClone = $("#useAsClone");

  let current = null;
  let values = null;
  let decodedBuffer = null;
  let rate = 1;
  let rafId = 0;

  /* ------------------------------------------------------------ transport -- */

  playBtn.innerHTML = ic("play");

  playBtn.addEventListener("click", () => {
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  audio.addEventListener("play", () => {
    playBtn.innerHTML = ic("pause");
    tick();
  });
  audio.addEventListener("pause", () => {
    playBtn.innerHTML = ic("play");
  });
  audio.addEventListener("ended", () => {
    playBtn.innerHTML = ic("play");
    paint(0);
  });
  audio.addEventListener("timeupdate", () => paint(ratio()));
  audio.addEventListener("loadedmetadata", () => paint(ratio()));

  const ratio = () => (audio.duration ? audio.currentTime / audio.duration : 0);

  function tick() {
    cancelAnimationFrame(rafId);
    const step = () => {
      if (audio.paused) return;
      paint(ratio());
      timeLabel.textContent = `${formatClock(audio.currentTime)} / ${formatClock(audio.duration)}`;
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  function paint(progress) {
    fill.style.width = `${(progress * 100).toFixed(2)}%`;
    timeLabel.textContent = `${formatClock(audio.currentTime)} / ${formatClock(audio.duration)}`;
    if (values) drawPeaks(canvas, values, progress);
  }

  const seek = (clientX, el) => {
    if (!audio.duration) return;
    const rect = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audio.currentTime = p * audio.duration;
    paint(p);
  };

  scrub.addEventListener("click", (e) => seek(e.clientX, scrub));
  box.addEventListener("click", (e) => seek(e.clientX, box));

  /* ---------------------------------------------------------------- rates -- */

  setChildren(
    rateRow,
    ...RATES.map((r) =>
      h("button", {
        type: "button",
        text: `${r}×`,
        "aria-pressed": String(r === 1),
        onclick: (e) => {
          rate = r;
          audio.playbackRate = r;
          rateRow
            .querySelectorAll("button")
            .forEach((b) =>
              b.setAttribute("aria-pressed", String(b === e.currentTarget)),
            );
        },
      }),
    ),
  );

  /* ------------------------------------------------------------- shortcuts -- */

  ctx.registerKeys?.((e) => {
    if (!current) return false;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (inField) return false;

    if (e.code === "Space") {
      e.preventDefault();
      playBtn.click();
      return true;
    }
    if (e.key === "ArrowLeft") {
      audio.currentTime = Math.max(0, audio.currentTime - (e.shiftKey ? 10 : 3));
      return true;
    }
    if (e.key === "ArrowRight") {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (e.shiftKey ? 10 : 3));
      return true;
    }
    return false;
  });

  /* ----------------------------------------------------------------- load -- */

  /**
   * @param {object} take  { blob, url, format, duration, meta }
   * @param {object} [opts] { autoplay }
   */
  async function load(take, { autoplay = false } = {}) {
    current = take;
    values = null;
    decodedBuffer = null;

    $("#player").hidden = false;
    $("#emptyState").hidden = true;

    audio.src = take.url;
    audio.playbackRate = rate;
    playBtn.innerHTML = ic("play");
    paint(0);

    const size = take.blob?.size ?? take.size ?? 0;
    const dur =
      take.duration ||
      (take.blob ? durationOf(await take.blob.arrayBuffer(), take.blob.type) : 0);

    setChildren(
      metaEl,
      h("span", { class: "fmt", text: String(take.format || "wav").toUpperCase() }),
      h("span", { text: formatClock(dur) }),
      h("span", { text: formatBytes(size) }),
    );

    const { ext, mime } = blobMeta(take.format);
    dl.href = take.url;
    dl.download = `mimo-${(take.historyId || Date.now()).toString().slice(-6)}.${ext}`;
    void mime;

    // Decode for the waveform. A fresh take already holds its Blob, so it is
    // decoded directly; a history row only has a signed URL, which is fetched
    // from the same origin.
    try {
      const buf = take.blob
        ? await take.blob.arrayBuffer()
        : await (await fetch(take.url)).arrayBuffer();
      const decoded = await decode(buf.slice(0));
      if (current !== take) return; // user moved on while decoding
      decodedBuffer = decoded;
      const count = Math.max(60, Math.floor(box.clientWidth / 4.5));
      values = decoded
        ? peaks(decoded, count)
        : peaks(new Uint8Array(buf).slice(44), count);
      paint(ratio());
    } catch {
      /* waveform is decorative — playback still works without it */
    }

    context()?.resume?.().catch(() => {});
    if (autoplay) audio.play().catch(() => {});
  }

  function clear() {
    audio.pause();
    audio.removeAttribute("src");
    current = null;
    values = null;
    $("#player").hidden = true;
  }

  const repaint = raf(() => {
    if (!values || !current) return;
    // Re-derive the peak count at the new width. Deliberately does NOT touch
    // audio.src: re-assigning the same URL restarts playback from zero.
    const count = Math.max(60, Math.floor(box.clientWidth / 4.5));
    if (count !== values.length && decodedBuffer) {
      values = peaks(decodedBuffer, count);
    }
    paint(ratio());
  });
  window.addEventListener("resize", repaint);
  window.addEventListener("themechange", () => paint(ratio()));

  useClone.addEventListener("click", async () => {
    if (!current?.blob) return;
    const file = new File([current.blob], `take.${blobMeta(current.format).ext}`, {
      type: current.blob.type,
    });
    // Switch to the clone model first: the voice panel only renders the
    // sample card there, so staying put would make the button look inert.
    ctx.set({ model: "mimo-v2.5-tts-voiceclone" });
    await ctx.acceptCloneFile?.(file);
  });

  return { load, clear, get current() { return current; } };
}
