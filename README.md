# MiMo TTS Studio

小米 MiMo TTS 前端工作台，运行在 Cloudflare Workers 全家桶上：
**Workers（托管 + 代理）+ KV（配置持久化）+ D1（历史元数据）+ R2（历史音频）**。

## 架构

```text
浏览器 ──► Cloudflare Worker
   ├─ 静态资源（public/，原生 ES Modules，无构建）
   ├─ POST /api/tts        → 代理上游 TTS（流式透传）
   ├─ GET/PUT /api/config  → KV 持久化全部 UI 配置
   ├─ GET/POST/DELETE /api/history → D1 历史元数据
   └─ GET /audio/:id       → R2 音频流式回放
```

- **API Key 只存在于 CF Secret（`MIMO_API_KEY`）**，浏览器全程不接触密钥，没有直连模式
- 所有 `/api/*` 与 `/audio/*` 受 `CONFIG_TOKEN` 保护（`<audio>` 回放走 `?t=` query 参数）
- 合成结果自动存入历史（保留最新 100 条，超出自动清理），点击回放或「载入参数」重新编辑

## 部署

```bash
npm install

# 一次性创建资源（已创建过可跳过）
wrangler kv namespace create CONFIG_KV
wrangler d1 create mimo-tts-db
wrangler r2 bucket create mimo-tts-audio
# 把 id 填入 wrangler.toml，然后建表（本地 + 远程）
wrangler d1 execute mimo-tts-db --remote --file=src/schema.sql

# 机密
wrangler secret put MIMO_API_KEY   # 上游 TTS 密钥（必需）
wrangler secret put CONFIG_TOKEN   # 访问令牌（强烈建议）

# 部署
wrangler deploy
```

首次打开页面：点右上角 ⚙ → 填入 CONFIG_TOKEN（仅存于本浏览器 localStorage）。

GitHub Actions：仓库 Secrets 配置 `CF_API_TOKEN`（Workers Scripts:Edit 权限）和 `CF_ACCOUNT_ID`，push 即自动部署。

## 界面

「录音棚」暗色主题（`DESIGN.md` 为视觉权威）：近黑底 + 琥珀点缀 + 等宽读数，
波形为视觉母题。三段布局：

- **顶栏**：模型分段切换（TTS / VoiceDesign / VoiceClone）· 同步状态 · 主题 · 设置
- **创作区**：合成文本主焦点 · 风格标签（分组 tab + 搜索 + 选中 chip）· 风格描述 · 导演模式抽屉 · 模型专属卡片 · 大号合成按钮（⌘/Ctrl+Enter）
- **输出区**：波形播放器 · 历史列表（回放 / 载入参数 / 删除）· 移动端为底部抽屉

## 开发

```bash
wrangler dev          # 本地（D1/R2/KV 自动本地模拟）
wrangler d1 execute mimo-tts-db --local --file=src/schema.sql   # 本地建表
```

配置字段向后兼容旧版 localStorage（`mimo_tts_config`），KV 无需迁移。
