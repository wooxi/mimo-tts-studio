/**
 * MiMo TTS Studio — Cloudflare Worker
 *
 * - 托管 public/ 静态资源（Workers Assets）
 * - KV 持久化 UI 配置：GET/PUT /api/config
 * - TTS 代理：POST /api/tts（密钥只存在于 CF Secret MIMO_API_KEY，浏览器不接触）
 * - 历史记录：D1 元数据 + R2 音频（src/history.js）
 *
 * 机密:
 *   MIMO_API_KEY — 上游 TTS 密钥（必需）
 *   CONFIG_TOKEN — 访问令牌，所有 /api/* 与 /audio/* 需携带 X-Config-Token
 */

import { handleHistory, handleAudio } from './history.js';

const CONFIG_KEY = 'config:default';

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function checkToken(request, env, url) {
  if (!env.CONFIG_TOKEN) return true; // 未设置令牌则不校验
  // <audio> 标签无法携带 header，允许 query 参数 ?t=
  const supplied = request.headers.get('X-Config-Token') || url.searchParams.get('t') || '';
  return supplied === env.CONFIG_TOKEN;
}

export default {
  async fetch(request, env, ctx) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Config-Token',
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
        if (!checkToken(request, env, url)) return json({ error: 'unauthorized' }, cors, 401);
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'invalid json' }, cors, 400);
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          return json({ error: 'invalid config' }, cors, 400);
        }
        delete body.apiKey;
        for (const [k, v] of Object.entries(body)) {
          if (typeof v === 'string' && v.length > 100_000) body[k] = v.slice(0, 100_000);
        }
        await env.CONFIG_KV.put(CONFIG_KEY, JSON.stringify(body));
        return json({ ok: true }, cors);
      }
    }

    // ---------- TTS 代理（唯一合成通道，密钥仅存于 CF Secret） ----------
    if (url.pathname === '/api/tts' && request.method === 'POST') {
      if (!checkToken(request, env, url)) return json({ error: 'unauthorized' }, cors, 401);
      const apiKey = env.MIMO_API_KEY || '';
      if (!apiKey) return json({ error: '服务端未配置 MIMO_API_KEY' }, cors, 503);

      const upstream = await fetch(env.UPSTREAM_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: request.body, // 原样透传（支持流式响应）
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        },
      });
    }

    // ---------- 历史记录 ----------
    if (url.pathname === '/api/history' || url.pathname.startsWith('/api/history/')) {
      if (!checkToken(request, env, url)) return json({ error: 'unauthorized' }, cors, 401);
      return handleHistory(request, env, cors, url, ctx);
    }

    if (url.pathname.startsWith('/audio/')) {
      if (!checkToken(request, env, url)) return json({ error: 'unauthorized' }, cors, 401);
      return handleAudio(request, env, cors, url);
    }

    // ---------- 其余走静态资源 ----------
    return env.ASSETS.fetch(request);
  },
};
