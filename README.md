# MiMo TTS Studio（Cloudflare Worker + KV 版）

小米 MiMo TTS 前端，改造为 Cloudflare Worker 部署，支持**服务端配置持久化**与**密钥代理**。

## 架构

```
浏览器 ──► Cloudflare Worker
            ├─ 静态资源（public/index.html，Workers Assets）
            ├─ GET/PUT /api/config      → KV 持久化全部 UI 配置（模型/音色/文本/标签/导演模式…）
            ├─ GET/PUT/DELETE /api/api-key → 服务端保存密钥（永不下发明文）
            └─ POST /api/tts            → 代理上游 TTS API（支持流式透传）
```

## 部署步骤

```bash
npm install

# 1. 创建 KV 命名空间
npx wrangler kv namespace create CONFIG_KV
# 把输出的 id 填入 wrangler.toml 的 kv_namespaces.id

# 2.（可选）设置访问令牌，防止他人调用你的配置/代理接口
npx wrangler secret put CONFIG_TOKEN

# 3.（可选）设置服务端兜底密钥（KV 未保存密钥时代理使用）
npx wrangler secret put MIMO_API_KEY

# 4. 部署
npx wrangler deploy
```

本地开发：`npx wrangler dev`（本地 KV 自动模拟）。

GitHub Actions：仓库 Secrets 配置 `CF_API_TOKEN`（Workers Scripts:Edit 权限）和 `CF_ACCOUNT_ID` 即可推送自动部署。

## 使用方式

- **配置持久化**：页面上的模型、音色、格式、流式开关、风格/文本、导演模式、标签选择都会自动同步到 KV（防抖 800ms），换设备登录同一 Worker 地址即自动恢复；同时保留 localStorage 快照做离线兜底。
- **密钥两种用法**：
  1. 浏览器直连：照旧在输入框填 Key（存 localStorage）；
  2. 服务端代理：点「保存密钥到服务端」后清空输入框，合成请求走 `/api/tts`，浏览器不再持有密钥。
- **访问令牌**：设置了 `CONFIG_TOKEN` 后，在页面「服务端访问令牌」里填一次（存 localStorage），所有 `/api/*` 请求自动携带。

## 相对原版的优化

1. 配置从"仅 localStorage 且只有 Key/主题"→ 全量 UI 状态 + 服务端 KV 持久化
2. 新增密钥代理模式，浏览器可不接触明文 Key
3. 修复 VoiceClone 大文件 Base64 编码栈溢出（分块转换）
4. 修复 `showStatus` 的 innerHTML XSS 风险（改 textContent）
5. Worker 侧对配置写入做类型校验、字段裁剪与密钥剥离，防滥用
