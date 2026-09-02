/**
 * MiMo TTS Studio — Cloudflare Worker
 *
 * - 托管 public/ 静态资源（Workers Assets）
 * - KV 持久化配置：GET/PUT /api/config
 * - 服务端密钥管理：GET/PUT/DELETE /api/api-key（密钥永不下发）
 * - TTS 代理：POST /api/tts（浏览器无需持有 API Key，流式响应透传）
 *
 * 可选机密:
 *   CONFIG_TOKEN — 设置后，所有写操作与 /api/tts 需携带 X-Config-Token
 *   MIMO_API_KEY — KV 中未存密钥时代理使用的兜底密钥
 */

const CONFIG_KEY = 'config:default';
const APIKEY_KEY = 'secret:mimo-api-key';

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function checkToken(request, env) {
  if (!env.CONFIG_TOKEN) return true; // 未设置令牌则不校验
  return request.headers.get('X-Config-Token') === env.CONFIG_TOKEN;
}

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Config-Token, api-key',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json({ error: 'bad request' }, cors, 400);
    }

    // ---------- 配置持久化 ----------
    if (url.pathname === '/api/config') {
      if (request.method === 'GET') {
        const cfg = await env.CONFIG_KV.get(CONFIG_KEY, 'json');
        return json(cfg ?? {}, cors);
      }
      if (request.method === 'PUT') {
        if (!checkToken(request, env)) return json({ error: 'unauthorized' }, cors, 401);
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'invalid json' }, cors, 400);
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          return json({ error: 'invalid config' }, cors, 400);
        }
        delete body.apiKey; // 密钥不允许混在配置里
        // KV 单值上限 25MB / 单键写入频率限制对配置足够；裁剪超长字段防滥用
        for (const [k, v] of Object.entries(body)) {
          if (typeof v === 'string' && v.length > 100_000) body[k] = v.slice(0, 100_000);
        }
        await env.CONFIG_KV.put(CONFIG_KEY, JSON.stringify(body));
        return json({ ok: true }, cors);
      }
    }

    // ---------- 服务端密钥（只写不读） ----------
    if (url.pathname === '/api/api-key') {
      if (request.method === 'GET') {
        const configured = !!(await env.CONFIG_KV.get(APIKEY_KEY)) || !!env.MIMO_API_KEY;
        return json({ configured }, cors);
      }
      if (request.method === 'PUT') {
        if (!checkToken(request, env)) return json({ error: 'unauthorized' }, cors, 401);
        const { apiKey } = await request.json().catch(() => ({}));
        if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 200) {
          return json({ error: 'invalid api key' }, cors, 400);
        }
        await env.CONFIG_KV.put(APIKEY_KEY, apiKey);
        return json({ ok: true }, cors);
      }
      if (request.method === 'DELETE') {
        if (!checkToken(request, env)) return json({ error: 'unauthorized' }, cors, 401);
        await env.CONFIG_KV.delete(APIKEY_KEY);
        return json({ ok: true }, cors);
      }
    }

    // ---------- TTS 代理（支持流式透传） ----------
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      if (!checkToken(request, env)) return json({ error: 'unauthorized' }, cors, 401);
      const apiKey =
        request.headers.get('api-key') ||
        (await env.CONFIG_KV.get(APIKEY_KEY)) ||
        env.MIMO_API_KEY ||
        '';
      if (!apiKey) return json({ error: '未配置 API Key' }, cors, 401);

      const upstream = await fetch(env.UPSTREAM_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: request.body, // 原样透传请求体
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        },
      });
    }

    // ---------- 其余走静态资源 ----------
    return env.ASSETS.fetch(request);
  },
};
