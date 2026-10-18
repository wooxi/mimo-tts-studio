/** Toasts — transient confirmations, stacked above the dock. */

import { h, $ } from "../core/dom.js";
import { ic } from "../icons.js";

const ICONS = { ok: "check", err: "alert", info: "info" };

export function toast(message, kind = "info", ms = 3200) {
  const root = $("#toasts");
  const el = h(
    "div",
    { class: `toast is-${kind}`, role: "status" },
    h("span", { html: ic(ICONS[kind] || "info") }),
    h("span", { text: message }),
  );
  root.append(el);

  setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  }, ms);

  return el;
}
