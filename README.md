<img src="public/brand/logo.svg" width="84" alt="MiMo TTS Studio">

# MiMo TTS Studio

自托管的语音合成工作台，把小米 MiMo 开放平台的三类 TTS 模型（预置音色 / 音色设计 / 音色克隆）与语音识别整合到一套界面里。运行于 Cloudflare Workers + D1 + R2，前端零构建。

模型密钥与上游端点只存在于 Worker 的变量与机密里，浏览器全程不接触；所有合成经服务端代理转发。

[English](README.en.md) · [设计基线](DESIGN.md) · [品牌资产](public/brand/README.md)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020)
![License](https://img.shields.io/badge/license-MIT-3da639)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wooxi/mimo-tts-studio)

## 功能

**语音**

| 功能 | 说明 |
| --- | --- |
| 预置音色 | 8 个具名音色 + `mimo_default`，卡片式选择；每张卡片可试听，试听结果按音色缓存 |
| 音色设计 | 一段文字描述生成新嗓音；内置示例如深夜电台、电竞解说等，支持智能润色播报文本 |
| 音色克隆 | 拖放或点选 mp3/wav 样本，显示波形、时长与体积；也可从历史音频中挑选；样本只随本次请求发送 |
| 音色库 | 保存设计或克隆出的嗓音：设计音色存描述文本，克隆音色存参考音频（R2），一键应用 |
| 语音识别 | 用 `mimo-v2.5-asr` 读回克隆样本内容，判断样本是否干净；台词为空时自动填入 |
| 唱歌 | 一键把 `(唱歌)` 归位到台词最前（仅预置音色模型） |

**创作控制**

| 功能 | 说明 |
| --- | --- |
| 三层控制 | 音色 / 演绎 / 台词分别对应请求中的 `audio.voice`、`messages[role=user]`、`messages[role=assistant]` |
| 自然语言控制 | 风格描述进入 user 消息，只影响表演，不会被念出来 |
| 导演模式 | 角色 / 场景 / 指导三个字段，可一键填入示例；留空则不发送 |
| 风格标签 | 台词开头的 `(标签)`：基础情绪 / 复合情绪 / 语调 / 音色 / 人设 / 方言 / 角色扮演七组，可搜索 |
| 句内标签 | 任意位置的 `（标签）`：语速节奏 / 情绪状态 / 语音特征 / 哭笑表达，按台词语种自动切中英 |
| 请求预览 | 实时显示将发送的 JSON（克隆样本自动省略为体积标注），可复制为 cURL |

**工作流**

| 功能 | 说明 |
| --- | --- |
| 多版本对比 | 一次生成 1–3 条 take，各自独立波形，点选即载入播放器 |
| 长文本分段 | 超过 2500 字按句切分、逐段合成、在浏览器里拼回单个 WAV |
| 历史与收藏 | 元数据存 D1、音频存 R2；搜索、收藏、分页、删除，可一键还原全部参数 |
| 播放器 | 波形、进度、0.75/1/1.25/1.5 倍速、下载，以及「用作克隆样本」 |
| 自动清理 | 默认保留 200 条，超出后清理最旧的未收藏项（先删对象、再删行） |

**工程**

| 要点 | 说明 |
| --- | --- |
| 零构建 | 原生 ES Modules + CSS 自定义属性；无打包器、无外部字体、无 CDN |
| 密钥不出服务端 | `MIMO_API_KEY` 只存在于 Worker 机密；端点与上限都是 Worker 变量，前端无任何连接配置 |
| 签名播放链接 | `/audio/:id?exp&sig` 使用 HMAC-SHA256 短期链接，支持 Range 与 HEAD |
| 安全响应头 | CSP 仅允许同源；另有 `no-referrer`、`nosniff`、`frame-ancestors 'none'`，由 Worker 对每个响应下发 |
| fail-closed | 未设置 `CONFIG_TOKEN` 时拒绝所有 API 请求，避免变成对外开放的免费代理 |
| 用量统计 | 每次到达上游的调用落一行记录；设置抽屉展示近 30 天调用数、字数、音频总量与按模型分布 |
| 深浅色 | auto / light / dark 三态，首屏前应用 |
| 本地假上游 | `npm run dev:mock` 返回结构真实的 WAV / SSE，不发请求、不消耗额度 |

## 部署

**前置**：Node 20+、Cloudflare 账号、[小米 MiMo 开放平台](https://mimo.mi.com) 的 API Key（按量付费与 Token Plan 密钥不能混用）。

```bash
npm install
npx wrangler login

# 1. 创建资源
npx wrangler d1 create mimo-tts-db          # 把输出里的 database_id 填回 wrangler.toml
npx wrangler r2 bucket create mimo-tts-audio

# 2. 建表（可选；Worker 首次收到请求时也会自动建表并补齐新增列）
npm run db:remote

# 3. 两个机密
npx wrangler secret put MIMO_API_KEY        # 小米 MiMo 开放平台密钥
npx wrangler secret put CONFIG_TOKEN        # 自定义访问令牌，进入界面时要填

# 4. 部署
npm run deploy
```

打开 Worker 域名，首次进入时输入刚才设置的 `CONFIG_TOKEN`（只保存在该浏览器）。

使用 Token Plan 密钥时，把 `wrangler.toml` 里的 `UPSTREAM_URL` 改为 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`。

已有部署升级：直接 `npm run deploy`，数据库结构会在首次请求时自动对齐，无需手工迁移。

**持续部署**：`.github/workflows/deploy.yml` 在 push 到 `main` 时部署。仓库 Secrets 配置 `CF_API_TOKEN` 与 `CF_ACCOUNT_ID` 即可，D1 / R2 仍需按上面步骤先行创建。

## 配置

所有连接配置都在 Worker 侧。`wrangler.toml` 的 `[vars]`：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `UPSTREAM_URL` | `https://api.xiaomimimo.com/v1/chat/completions` | 上游 OpenAI 兼容端点（Token Plan 换成 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`） |
| `HISTORY_LIMIT` | `200` | 历史保留条数，超出后清理最旧的未收藏项 |
| `MAX_AUDIO_BYTES` | `26214400` | 单个音频对象硬上限（25MB） |
| `AUDIO_URL_TTL` | `1800` | 签名播放链接有效期（秒） |
| `MIMO_MOCK` | 未设置 | 设为 `"1"` 启用本地假上游，仅用于开发自测 |
| `ALLOWED_ORIGINS` | 未设置 | 跨域白名单（逗号分隔）；留空表示仅同源 |

机密（`wrangler secret put`）：

| 机密 | 必需 | 说明 |
| --- | --- | --- |
| `MIMO_API_KEY` | 是 | 小米 MiMo 开放平台密钥，以 `api-key` 请求头发往上游 |
| `CONFIG_TOKEN` | 是 | 访问令牌。未设置时服务端拒绝所有 API 请求（fail-closed） |

界面不提供、也不需要任何密钥或端点配置。

## 本地开发

```bash
npm run dev              # 本地开发；机密用 .dev.vars 提供
npm run dev:mock         # MIMO_MOCK=1：本地假上游
npm run db:local         # 在本地 D1 上建表
npm run brand            # 重新生成品牌资产候选稿
```

在没有 workerd 的环境里（受限环境、CI），可以只用 Node 直接加载真实的 Worker 源码：

```bash
node scripts/local-harness.mjs          # http://127.0.0.1:8787，CONFIG_TOKEN=devtoken，假上游
node scripts/smoke.mjs                  # 93 项端到端断言：鉴权、迁移、Range、SSE、音色库、安全头
node scripts/check-failclosed.mjs       # 未设 CONFIG_TOKEN 时的拒绝行为
node scripts/check-migration.mjs        # v4 数据库升级到 v5 的迁移路径（40 项）
node scripts/check-live.mjs https://…   # 校验一个已部署实例：响应头、构建标记、访问控制
```

`scripts/local-harness.mjs` 只用 `node:sqlite` 与内存对象模拟 D1 / R2，`src/` 不做任何改动；它读取 `.dev.vars`（与 `wrangler dev` 一致）：

```ini
# .dev.vars（已在 .gitignore 里）
MIMO_API_KEY=你的小米 MiMo 密钥
MIMO_MOCK=0          # 设为 0 才会打真上游；不写或写别的值一律走假上游
CONFIG_TOKEN=devtoken
```

默认走假上游是刻意的：`.dev.vars` 里放着真密钥时，日常测试不会意外产生计费调用，必须显式 `MIMO_MOCK=0` 才联网。

接了真密钥之后可以跑 `node scripts/check-upstream.mjs`，核对只能靠实测确认的上游行为（WAV 采样率与位深、MP3 容器形态、流式响应细节、ASR 返回形状）；输出里带 `·` 的实测值可回填进 `docs/mimo-api-reference.md`。

## 项目结构

```
wrangler.toml          Worker 名称、静态资源、D1 / R2 绑定、vars
src/worker.js          入口：路由、静态资源托管、安全响应头
src/routes/            tts（合成代理）/ asr / config / history / audio / voices
src/lib/               auth（令牌与签名）/ db / upstream（重试与错误翻译）/ http / mock
src/db/schema.sql      D1 权威结构，幂等
public/index.html      应用外壳
public/css/            tokens / base / components / app
public/js/             boot · main · synth · core / domain / views
public/brand/          标识与分享卡
scripts/               本地宿主、冒烟与校验脚本、品牌生成
docs/mimo-api-reference.md   上游 API 的逐项事实
```

## 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `⌘` / `Ctrl` + `Enter` | 开始合成 |
| `Esc` | 取消正在进行的合成 |
| `空格` | 播放 / 暂停 |
| `←` / `→` | 后退 / 前进 3 秒 |
| `Shift` + `←` / `→` | 后退 / 前进 10 秒 |

播放快捷键在焦点不在输入框、且已有载入产物时生效。

## 说明

- **`mimo_default` 的嗓音随部署集群而异**（中国集群为「冰糖」，其他为「Mia」），合成本身也有随机性；需要稳定结果请选择具名音色。
- **音色克隆为限**：mp3 / wav，Base64 后不超过 10MB（原始文件约 7.5MB）；样本只随本次请求发往上游，服务端不留存。
- **长文本**：三个 TTS 模型共享 8K 上下文，官方建议单次合成约 2500 字以内；开启自动分段后按句切分、逐段合成并拼回单个 WAV，每段独立计费。
- **流式**：只有 `mimo-v2.5-tts` 是真正的低延迟流式；另外两个模型的流式是兼容模式。流式与分段固定使用 PCM16，并在浏览器里封装为 WAV。
- **数据存储**：D1 存 `config` / `history` / `voices` / `usage` 四类数据；R2 存音频对象。浏览器只存访问令牌、主题偏好与一份配置快照。
- **上游错误**：服务端把状态码翻译成语义化错误码——401 鉴权失败、402 余额不足、403 地区或风控、421 内容被安全策略拦截、429 触发限流；对 429 与 5xx 最多重试 3 次。

## 许可

MIT，见 [LICENSE](LICENSE)。

MiMo 及相关名称、标识归其各自所有者所有；本项目与小米无隶属关系。
