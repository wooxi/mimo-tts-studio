/**
 * History.
 *
 * A take is a row in D1 plus an object in R2. This view is the only place that
 * talks to /api/history, and it is responsible for turning a stored row back
 * into a fully restorable parameter set — including the tags, the director
 * block and the output format, which the previous version dropped.
 */

import {
  h,
  setChildren,
  $,
  formatClock,
  formatBytes,
  timeAgo,
} from "../core/dom.js";
import { ic } from "../icons.js";
import { get, patch, del } from "../core/api.js";
import { MODEL_BY_ID } from "../domain/models.js";

const PAGE = 40;

export function initHistory(ctx) {
  const list = $("#historyList");
  const countEl = $("#historyCount");
  const searchEl = $("#historySearch");
  const starFilter = $("#historyStarred");
  const moreBtn = $("#historyMore");

  let items = [];
  let cursor = null;
  let total = 0;
  let loading = false;
  let query = "";
  let starredOnly = false;

  /* --------------------------------------------------------------- fetch -- */

  async function load({ append = false } = {}) {
    if (loading) return;
    loading = true;
    moreBtn.hidden = true;

    try {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (query) params.set("q", query);
      if (starredOnly) params.set("starred", "1");
      if (append && cursor) params.set("cursor", String(cursor));

      const data = await get(`/api/history?${params}`);
      const rows = Array.isArray(data?.items) ? data.items : [];
      items = append ? [...items, ...rows] : rows;
      cursor = data?.next ?? null;
      total = Number(data?.total) || items.length;
      render();
    } catch (e) {
      if (e.status === 401) {
        ctx.toast("访问令牌缺失或错误", "err");
      } else {
        ctx.toast(`历史加载失败：${e.message}`, "err");
      }
    } finally {
      loading = false;
      moreBtn.hidden = !cursor;
      moreBtn.disabled = false;
    }
  }

  /* -------------------------------------------------------------- render -- */

  function render() {
    // The badge reports the database total under the active filters, not how
    // many rows this page happened to load.
    countEl.textContent = total
      ? items.length < total
        ? `${items.length} / ${total}`
        : `${total} 条`
      : "";

    if (!items.length) {
      setChildren(list);
      $("#emptyState").hidden = Boolean(ctx.player.current());
      return;
    }
    $("#emptyState").hidden = true;

    const rows = [];
    let lastBatch = null;

    items.forEach((item, i) => {
      // Group the takes that came from one press of the button — but a header
      // over a single row is noise, so it only appears for real batches.
      if (item.batch_id && item.batch_id !== lastBatch) {
        const group = items.filter((x) => x.batch_id === item.batch_id);
        if (group.length > 1) {
          rows.push(
            h("div", { class: "h-group", text: `${group.length} 条同批结果` }),
          );
        }
        lastBatch = item.batch_id;
      }
      rows.push(row(item, i));
    });

    setChildren(list, ...rows);
  }

  function row(item, index) {
    const model = MODEL_BY_ID[item.model];
    const el = h(
      "div",
      {
        class: "h-item",
        dataset: { id: item.id, playing: "0" },
        style: { animationDelay: `${Math.min(index, 12) * 0.02}s` },
        onclick: (e) => {
          if (e.target.closest("button")) return;
          play(item, el);
        },
      },
      h("button", {
        type: "button",
        class: "h-star",
        "aria-pressed": String(Boolean(item.starred)),
        "aria-label": item.starred ? "取消收藏" : "收藏",
        html: item.starred ? ic("starFill") : ic("star"),
        onclick: async (e) => {
          e.stopPropagation();
          const next = !item.starred;
          item.starred = next ? 1 : 0;
          e.currentTarget.setAttribute("aria-pressed", String(next));
          e.currentTarget.innerHTML = next ? ic("starFill") : ic("star");
          try {
            await patch(`/api/history/${item.id}`, { starred: next });
          } catch {
            item.starred = next ? 0 : 1;
            render();
          }
        },
      }),
      h(
        "div",
        { class: "h-body" },
        h("div", {
          class: "h-text",
          text: (item.text || "").replace(/\s+/g, " ").slice(0, 70) || "(空台词)",
        }),
        h(
          "div",
          { class: "h-meta" },
          h("span", {
            class: "h-model",
            text: model?.short || item.model.replace("mimo-v2.5-tts", "TTS"),
          }),
          item.voice ? h("span", { class: "h-voice", text: item.voice }) : null,
          h("span", { text: formatClock(item.duration) }),
          h("span", { class: "h-size", text: formatBytes(item.size) }),
          h("span", { class: "h-ago", text: timeAgo(item.created_at) }),
          h(
            "span",
            { class: "h-actions" },
            h("button", {
              type: "button",
              html: `${ic("reload")}<span>载入</span>`,
              onclick: async (e) => {
                e.stopPropagation();
                const btn = e.currentTarget;
                btn.disabled = true;
                try {
                  const full = await get(`/api/history/${item.id}`);
                  ctx.loadParams(full, item);
                } catch (err) {
                  ctx.toast(`载入失败：${err.message}`, "err");
                } finally {
                  btn.disabled = false;
                }
              },
            }),
            h("button", {
              type: "button",
              class: "del",
              html: ic("trash"),
              "aria-label": "删除",
              onclick: async (e) => {
                e.stopPropagation();
                el.classList.add("is-out");
                items = items.filter((x) => x.id !== item.id);
                total = Math.max(0, total - 1);
                setTimeout(() => {
                  render();
                  if (!items.length) $("#emptyState").hidden = false;
                }, 180);
                try {
                  await del(`/api/history/${item.id}`);
                } catch {
                  ctx.toast("删除失败，刷新后可见", "err");
                }
              },
            }),
          ),
        ),
      ),
    );
    return el;
  }

  /* ------------------------------------------------------------ playback -- */

  let playingEl = null;

  function play(item, el) {
    if (playingEl) playingEl.dataset.playing = "0";
    playingEl = el;
    el.dataset.playing = "1";

    ctx.player.load(
      {
        url: item.url,
        format: item.format,
        duration: item.duration,
        size: item.size,
        blob: null,
        historyId: item.id,
      },
      { autoplay: true },
    );
  }

  /* -------------------------------------------------------------- events -- */

  searchEl.addEventListener(
    "input",
    debounceFn(() => {
      query = searchEl.value.trim();
      cursor = null;
      load();
    }, 260),
  );

  starFilter.addEventListener("click", () => {
    starredOnly = !starredOnly;
    starFilter.setAttribute("aria-pressed", String(starredOnly));
    starFilter.classList.toggle("is-on", starredOnly);
    cursor = null;
    load();
  });

  moreBtn.addEventListener("click", () => {
    moreBtn.disabled = true;
    load({ append: true });
  });

  ctx.onHistoryChanged = () => {
    cursor = null;
    load();
  };

  load();
  return { reload: () => load(), get items() { return items; } };
}

function debounceFn(fn, ms) {
  let t = 0;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
