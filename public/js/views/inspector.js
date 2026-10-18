/**
 * Request inspector.
 *
 * Shows the exact JSON that will be posted, with the voice sample elided. This
 * exists because the three control layers are otherwise invisible: the fastest
 * way to trust "my style text is actually sent" is to read the request.
 */

import { h, setChildren, $, copyText } from "../core/dom.js";
import { ic } from "../icons.js";
import { buildPayload, redact, asCurl, inspect } from "../domain/payload.js";

export function initInspector(ctx) {
  const pre = $("#payloadView");
  const state = $("#payloadState");
  const copy = $("#copyCurl");

  const paint = () => {
    const s = ctx.store.get();
    let body;
    try {
      body = buildPayload(s);
    } catch (e) {
      setChildren(pre, document.createTextNode(String(e.message)));
      return;
    }

    pre.textContent = JSON.stringify(redact(body), null, 2);

    const verdict = inspect(s);
    const bits = [
      `${body.messages.length} 条消息`,
      `${(JSON.stringify(redact(body)).length / 1024).toFixed(1)} KB`,
    ];
    if (verdict.ok) bits.push("可以合成");
    else bits.push(verdict.problems[0]);

    state.textContent = bits.join(" · ");
    state.className = `hint${verdict.ok ? "" : " err"}`;
  };

  copy.addEventListener("click", async () => {
    const s = ctx.store.get();
    const ok = await copyText(asCurl(buildPayload(s)));
    ctx.toast(ok ? "已复制为 cURL" : "复制失败", ok ? "ok" : "err");
  });

  ctx.onSoftRefresh.push(paint);
  paint();
  void h;
  void ic;
}
