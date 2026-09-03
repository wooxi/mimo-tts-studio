/** /api/* 封装：自动携带 X-Config-Token */
const TOKEN_KEY = "mimo_tts_config_token";

export const server = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  setToken(t) {
    this.token = (t || "").trim();
    localStorage.setItem(TOKEN_KEY, this.token);
  },
};

export function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (server.token) headers["X-Config-Token"] = server.token;
  return fetch(path, { ...opts, headers });
}

export async function apiJson(path, opts = {}) {
  const res = await api(path, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** 音频播放地址（<audio> 无法带 header，令牌走 query） */
export function audioUrl(id) {
  const t = server.token ? encodeURIComponent(server.token) : "";
  return `/audio/${id}${t ? `?t=${t}` : ""}`;
}
