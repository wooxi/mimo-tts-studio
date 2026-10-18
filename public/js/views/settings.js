/**
 * Settings drawer and the first-run gate.
 *
 * The gate is not decoration: the Worker refuses every /api request while
 * CONFIG_TOKEN is unset, so a fresh deployment has to explain what to run
 * instead of showing an empty, broken-looking studio.
 */

import { h, setChildren, $, copyText, formatBytes } from "../core/dom.js";
import { ic } from "../icons.js";
import { auth, get, health } from "../core/api.js";
import { FORMATS, LIMITS } from "../domain/models.js";

export function initSettings(ctx) {
  const drawer = $("#settingsDrawer");
  const mask = $("#mask");

  const open = () => {
    drawer.classList.add("is-open");
    mask.classList.add("is-open");
    document.body.classList.add("is-locked");
    paintRuntime(ctx);
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

  /* defaults */
  const formatRow = $("#formatDefaults");
  setChildren(
    formatRow,
    ...FORMATS.map((f) =>
      h("button", {
        type: "button",
        class: "pill-btn",
        text: f.label,
        title: f.note,
        "aria-pressed": String(ctx.store.get().format === f.id),
        onclick: (e) => {
          ctx.set({ format: f.id });
          formatRow
            .querySelectorAll("button")
            .forEach((b) =>
              b.setAttribute("aria-pressed", String(b === e.currentTarget)),
            );
        },
      }),
    ),
  );

  ctx.refreshSettings = () => {
    formatRow.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.textContent === labelOf(ctx.store.get().format)));
    });
  };

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

const labelOf = (id) => FORMATS.find((f) => f.id === id)?.label || "WAV";

/* ---------------------------------------------------------------- runtime -- */

async function paintRuntime(ctx) {
  const target = $("#runtimeInfo");
  setChildren(target, h("p", { class: "note", text: "读取中…" }));

  let info;
  try {
    info = await health();
  } catch (e) {
    setChildren(
      target,
      h("p", { class: "note err", text: `无法读取服务端状态：${e.message}` }),
    );
    return;
  }

  const rows = [
    ["访问令牌", info.auth === "token" ? "已设置（fail-closed）" : "未设置 —— 所有 API 请求会被拒绝"],
    ["上游地址", info.upstream ? "已配置" : "未配置"],
    ["上游密钥", info.apiKey ? "已配置" : "未配置"],
    ["模拟上游", info.mock ? "已开启（本地假上游）" : "关闭"],
    ["历史保留", `${info.historyLimit} 条`],
    ["单文件上限", formatBytes(info.maxAudioBytes)],
  ];

  setChildren(
    target,
    h(
      "dl",
      { class: "kv" },
      ...rows.flatMap(([k, v]) => [
        h("dt", { text: k }),
        h("dd", { text: v }),
      ]),
    ),
  );

  paintUsage($("#usageInfo"));
}

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
    hide();
  }

  function show(kind) {
    gate.hidden = false;

    if (kind === "offline") {
      setChildren(
        body,
        h("h1", { text: "连接不上服务端" }),
        h("p", {
          class: "note",
          text: "页面加载了，但 /api/health 没有响应。如果你是本地开发，请确认 wrangler dev 还在运行。",
        }),
      );
      return;
    }

    if (kind === "no-token") {
      const cmd = "wrangler secret put CONFIG_TOKEN";
      setChildren(
        body,
        h("h1", { text: "还差一步：设置访问令牌" }),
        h("p", {
          class: "note",
          text:
            "服务端没有配置 CONFIG_TOKEN，因此它拒绝了所有 API 请求。" +
            "这是刻意设计：没有令牌时，任何人都能用你的 MIMO_API_KEY 免费合成语音。",
        }),
        h("ol", null, h("li", { text: "在项目目录执行下面这条命令，输入一个自定义的随机字符串：" })),
        h("code", { class: "code", text: cmd }),
        h(
          "div",
          { class: "row wrap" },
          h("button", {
            type: "button",
            class: "btn",
            html: `${ic("copy")}<span>复制命令</span>`,
            onclick: async (e) => {
              const ok = await copyText(cmd);
              ctx.toast(ok ? "已复制" : "复制失败", ok ? "ok" : "err");
              void e;
            },
          }),
        ),
        h("p", { class: "note", text: "设置完成后刷新本页。" }),
        h(
          "div",
          { class: "row wrap" },
          h("button", {
            type: "button",
            class: "btn primary",
            html: `${ic("reload")}<span>刷新</span>`,
            onclick: () => location.reload(),
          }),
        ),
      );
      return;
    }

    // kind === "need-token": the server has one, this browser does not.
    const input = h("input", {
      type: "password",
      id: "gateToken",
      placeholder: "粘贴你设置的 CONFIG_TOKEN",
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
      h("h1", { text: "输入访问令牌" }),
      h("p", {
        class: "note",
        text: "令牌只保存在这个浏览器里，用于调用你自己的 Worker。",
      }),
      input,
      h(
        "div",
        { class: "row wrap" },
        h("button", {
          type: "button",
          class: "btn primary",
          html: `${ic("lock")}<span>保存并进入</span>`,
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

export const _limits = LIMITS;
