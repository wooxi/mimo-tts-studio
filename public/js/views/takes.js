/**
 * Take list.
 *
 * The models are stochastic — the official guidance is to generate a few times
 * and pick. This lists every take from the last run with its own waveform, and
 * selecting one loads it into the player.
 */

import { h, setChildren, $, formatClock, formatBytes } from "../core/dom.js";
import { peaks, decode } from "../domain/audio.js";
import { SAMPLE_RATE } from "../domain/models.js";
import { drawPeaks } from "./voice.js";

export function initTakes(ctx) {
  const root = $("#takesPanel");
  const takes = [];
  let active = -1;

  function render() {
    if (!takes.length) {
      setChildren(root);
      root.hidden = true;
      return;
    }
    root.hidden = false;

    setChildren(
      root,
      ...takes.map((t, i) => {
        const canvas = h("canvas", { "aria-hidden": "true" });
        requestAnimationFrame(() => {
          if (t.peaks) drawPeaks(canvas, t.peaks, 0, { played: "transparent" });
        });

        return h(
          "button",
          {
            type: "button",
            class: "take",
            dataset: { active: String(i === active) },
            onclick: () => select(i),
          },
          h("span", { class: "t-no", text: `#${i + 1}` }),
          canvas,
          h(
            "span",
            { class: "t-meta" },
            h("span", { text: formatClock(t.duration) }),
            h("span", { class: "t-size", text: formatBytes(t.blob.size) }),
          ),
        );
      }),
      h("p", {
        class: "note",
        text:
          takes.length > 1
            ? "同一次请求的多条结果。语音合成有随机性，多生成几条再挑是正常用法。"
            : "",
      }),
    );
  }

  function select(i) {
    active = i;
    render();
    ctx.player.load(takes[i], { autoplay: true });
  }

  /** Add a finished take and decode its peaks in the background. */
  async function push(result) {
    // Duration is derived before the first render: rendering first left the
    // final take of a batch showing 0:00, because nothing re-rendered after
    // the value was assigned.
    const take = {
      ...result,
      peaks: result.pcm ? peaks(result.pcm, 200) : null,
      duration: result.pcm
        ? result.pcm.length / 2 / SAMPLE_RATE
        : Math.max(0, (result.blob.size - 44) / 2 / SAMPLE_RATE),
    };

    takes.push(take);
    if (active < 0) active = 0;
    render();

    if (!take.peaks) {
      try {
        const buffer = await result.blob.arrayBuffer();
        const decoded = await decode(buffer.slice(0));
        take.peaks = decoded
          ? peaks(decoded, 200)
          : peaks(new Uint8Array(buffer).slice(44), 200);
        if (decoded?.duration) take.duration = decoded.duration;
      } catch {
        /* waveform is decorative */
      }
      render();
    }

    return take;
  }

  function reset() {
    // Take blobs are session-only; without this every run leaks its object
    // URLs for the life of the page.
    for (const t of takes) {
      if (t.url) URL.revokeObjectURL(t.url);
    }
    takes.length = 0;
    active = -1;
    render();
  }

  function current() {
    return takes[active] || null;
  }

  render();
  return { push, reset, select, current, get all() { return takes; } };
}
