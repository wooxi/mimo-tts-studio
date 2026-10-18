/**
 * Settings drawer and the first-run gate.
 *
 * The gate exists because the Worker refuses every /api request while the
 * access token is unset, so a fresh deployment needs a way to enter it
 * rather than showing an empty studio.
 *
 * Everything about the upstream — endpoint, key material, mock mode — is
 * Worker-side configuration and deliberately has no representation here.
 */

import { h, setChildren, $, formatBytes } from "../core/dom.js";
import { ic } from "../icons.js";
import { auth, get, health } from "../core/api.js";

export function initSettings(ctx) {
  const drawer = $("#settingsDrawer");
  const mask = $("#mask");

  const open = () => {
    drawer.classList.add("is-open");
    mask.classList.add("is-open");
    document.body.classList.add("is-locked");
    paintUsage($("#usageInfo"));
  };
  const close = () => {
    drawer.classList.remove("is-open");
    mask.classList.remove("is-open");
    document.body.classList.remove("is-locked");
  };

  $("#settingsBtn").addEventListener("click", open);
  $("#drawerClose").addEventListener("click", close);
  mask.addEventListener("click", () => {
    close();
    ctx.closeTagSheet?.();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) close();
  });

  /* token */
  const tokenInput = $("#tokenInput");
  const tokenState = $("#tokenState");
  tokenInput.value = auth.token;

  const refreshTokenState = () => {
    const has = Boolean(auth.token);
    tokenState.textContent = has ? "已设置" : "未设置";
    tokenState.className = `hint${has ? "" : " err"}`;
  };
  refreshTokenState();

  tokenInput.addEventListener("change", () => {
    auth.set(tokenInput.value);
    tokenInput.value = auth.token;
    refreshTokenState();
    ctx.toast("令牌已保存，正在重新加载…", "ok");
    setTimeout(() => location.reload(), 500);
  });

  $("#tokenClear").addEventListener("click", () => {
    auth.set("");
    tokenInput.value = "";
    refreshTokenState();
    ctx.toast("已清除本机令牌");
  });

  /* errors toggle */
  const errorsToggle = $("#errorsToggle");
  errorsToggle.setAttribute("aria-checked", String(ctx.store.get().showErrors));
  errorsToggle.addEventListener("click", () => {
    const on = errorsToggle.getAttribute("aria-checked") !== "true";
    errorsToggle.setAttribute("aria-checked", String(on));
    ctx.set({ showErrors: on });
  });

  $("#resetConfig").addEventListener("click", async () => {
    try {
      localStorage.removeItem("mimo_tts_config");
    } catch {
      /* ignore */
    }
    ctx.toast("本地快照已清除，正在重新加载…", "ok");
    setTimeout(() => location.reload(), 500);
  });

  return { open, close };
}

/* ---------------------------------------------------------------- runtime -- */

async function paintUsage(target) {
  try {
    const u = await get("/api/stats?days=30");
    setChildren(
      target,
      h(
        "dl",
        { class: "kv" },
        h("dt", { text: "近 30 天调用" }),
        h("dd", { text: `${u.calls} 次（成功 ${u.okCalls}）` }),
        h("dt", { text: "合成字数" }),
        h("dd", { text: `${u.chars}` }),
        h("dt", { text: "音频总量" }),
        h("dd", { text: formatBytes(u.bytes) }),
        h("dt", { text: "平均耗时" }),
        h("dd", { text: u.calls ? `${Math.round(u.ms / u.calls / 100) / 10}s` : "—" }),
      ),
      u.byModel?.length
        ? h(
            "dl",
            { class: "kv", style: { marginTop: "8px" } },
            ...u.byModel.flatMap((m) => [
              h("dt", { text: m.model.replace("mimo-v2.5-", "") }),
              h("dd", { text: `${m.calls} 次` }),
            ]),
          )
        : null,
    );
  } catch {
    setChildren(target, h("p", { class: "note", text: "暂无用量数据" }));
  }
}

/* ------------------------------------------------------------------- gate -- */

export function createGate(ctx) {
  const gate = $("#gate");
  const body = $("#gateBody");

  async function check() {
    let info;
    try {
      info = await health();
    } catch {
      show("offline");
      return;
    }

    if (info.auth !== "token") {
      show("no-token");
      return;
    }
    if (!auth.token) {
      show("need-token");
      return;
    }

    // A stored token can still be wrong (stale, or the wrong secret pasted
    // in). Probe a guarded endpoint so a bad token lands on the gate with a
    // clear message instead of a studio where every request 401s.
    try {
      await get("/api/config");
    } catch (e) {
      if (e.status === 401) {
        show("bad-token");
        return;
      }
      /* not a token verdict — let the app surface it instead */
    }
    hide();
  }

  function refreshButton(label = "刷新", primary = false) {
    return h("div", { class: "row wrap" },
      h("button", {
        type: "button",
        class: primary ? "btn primary" : "btn",
        html: `${ic("reload")}<span>${label}</span>`,
        onclick: () => location.reload(),
      }),
    );
  }

  function show(kind) {
    gate.hidden = false;

    if (kind === "offline") {
      setChildren(body, h("h1", { text: "无法连接服务端" }), refreshButton());
      return;
    }

    if (kind === "no-token") {
      setChildren(body, h("h1", { text: "服务端未配置访问令牌" }), refreshButton());
      return;
    }

    // kind === "need-token" | "bad-token": the server has one, this browser
    // either lacks it or holds a rejected value.
    const input = h("input", {
      type: "password",
      id: "gateToken",
      placeholder: "访问令牌",
      autocomplete: "off",
      onkeydown: (e) => {
        if (e.key === "Enter") submit();
      },
    });

    const submit = () => {
      const value = input.value.trim();
      if (!value) return;
      auth.set(value);
      gate.hidden = true;
      location.reload();
    };

    setChildren(
      body,
      h("h1", { text: kind === "bad-token" ? "访问令牌无效" : "输入访问令牌" }),
      input,
      h("div", { class: "row wrap" },
        h("button", {
          type: "button",
          class: "btn primary",
          html: `${ic("lock")}<span>进入</span>`,
          onclick: submit,
        }),
      ),
    );
    setTimeout(() => input.focus(), 60);
  }

  function hide() {
    gate.hidden = true;
  }

  return { check, hide };
}
