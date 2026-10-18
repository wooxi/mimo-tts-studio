<img src="public/brand/logo.svg" width="88" alt="MiMo TTS Studio">

# MiMo TTS Studio

面向小米 MiMo-V2.5-TTS 系列的语音创作工作台，跑在 Cloudflare Workers 上：三层控制（音色 / 演绎 / 台词）、多版本对比、长文本分段拼接、历史与收藏，前端零构建。

[English](README.en.md) · [设计基线](DESIGN.md) · [品牌资产](public/brand/README.md)

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-f38020)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020)
![License](https://img.shields.io/badge/license-MIT-3da639)
![Build](https://img.shields.io/badge/build-none-6b7280)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/wooxi/mimo-tts-studio)

> 一键部署按钮会克隆仓库并引导绑定，但 D1、R2 与两个 secret 仍需按下方「一分钟部署」准备。

## 这是什么

一个自托管的网页工作台，把小米 MiMo 开放平台的三个语音合成模型（预置音色、音色设计、音色克隆）与语音识别接到同一套界面里。
上游密钥存在 Worker Secret 中，浏览器全程不接触；配置、历史与用量分别落在 D1 与 R2。
除 `wrangler` 之外没有构建步骤、没有打包器、没有外部字体或 CDN 依赖。

## 特性

**语音能力**

| 能力 | 说明 |
| --- | --- |
| 预置音色 | 8 个具名音色 + `mimo_default`，卡片式选择；每张卡片右上角 ▶ 试听，结果按音色缓存，重复点击不重复计费 |
| 音色设计 | 一段文字描述生成新嗓音，无需样本；内置 4 个示例（深夜电台 / 电竞解说 / 美食评论 / 法庭陈词）与四要素写作提示 |
| 音色克隆 | 拖放或点选 mp3/wav 样本，实时显示波形、时长与体积；也可以直接从历史音频里挑一条；零样本复刻，样本只用于本次请求 |
| 音色库 | 把设计或克隆出来的嗓音存下来复用。设计音色存的是描述文本（每次生成会有细微差别），克隆音色把参考音频存进 R2；每个音色卡上有「应用」与删除，应用克隆音色会自动切到克隆模型并载回样本 |
| 唱歌 | 一键把 `(唱歌)` 归位到台词最前；该按钮只在预置音色模型下出现 |
| 语音识别 | 用 `mimo-v2.5-asr` 读回克隆样本，判断样本是否干净；台词为空时自动填入识别结果 |

**创作控制**

| 能力 | 说明 |
| --- | --- |
| 自然语言控制 | 演绎层的风格描述进入 `user` 消息，只影响表演，不会被念出来 |
| 导演模式 | 角色 / 场景 / 指导三个字段，可一键填入官方示例；三段都留空则不发送 |
| 整体风格标签 | 写在台词开头的一组 `(标签)`，标签面板 7 组、可搜索 |
| 句内音频标签 | 插入光标处的 `（标签）`，按台词语种自动切换中/英两组；高亮层把风格、句内、唱歌三类标签分别着色 |
| 智能润色文本 | 音色设计的 `optimize_text_preview`：可留空台词让模型生成；合成后回显润色结果并支持一键替换 |
| 请求预览 | 实时显示即将发送的 JSON（克隆样本自动省略为体积标注），可复制为 cURL |

**工作流**

| 能力 | 说明 |
| --- | --- |
| 多版本对比 | 一次生成 1–3 条 take，各自独立波形与时长，点选即载入播放器；开启自动分段时条数自动降为 1 |
| 长文本分段拼接 | 超过 2500 字按句切分、逐段合成、在浏览器里拼回单个 WAV |
| 音色设计 → 克隆 | 把满意的合成结果「用作克隆样本」，自动切到克隆模型继续创作，并可存进音色库 |
| 历史与收藏 | 元数据在 D1、音频在 R2；支持搜索、只看收藏、分页、删除、一键「载入」还原模型 / 音色 / 音色描述 / 风格 / 导演模式 / 格式等参数（克隆样本需重新上传） |
| 试听与播放器 | 波形、进度条、0.75/1/1.25/1.5 倍速、下载，以及「用作克隆样本」 |
| 自动清理 | 默认保留 200 条，超出后删除最旧的未收藏项（先删 R2 对象再删 D1 行，删对象失败则保留该行下次重试） |

**工程**

| 能力 | 说明 |
| --- | --- |
| 零构建 | 原生 ES Modules + CSS 自定义属性；无打包器、无外部字体、无 CDN 请求 |
| 密钥不出服务端 | `MIMO_API_KEY` 只存在于 Worker Secret，所有合成经 `/api/tts` 代理，浏览器没有直连模式 |
| 签名播放链接 | `/audio/:id?exp&sig` 使用 HMAC-SHA256 短期链接（默认 30 分钟），支持 Range 与 HEAD |
| 用量统计 | 每次**到达上游**的调用落一行 `usage`（被本地校验拦下的请求不落行），设置抽屉展示近 30 天调用数、字数、音频总量、平均耗时与按模型分布 |
| 深浅色 | auto / light / dark 三态，首屏前应用，`auto` 跟随系统 |
| 键盘可达性 | 跳到主内容链接、统一的 `focus-visible` 描边、开关与分段控件均可用键盘操作 |
| 安全响应头 | CSP 默认仅允许同源（图片与媒体额外允许 `data:` / `blob:`），另有 `no-referrer`、`nosniff`、`frame-ancestors 'none'`。由 Worker 给**每一个**响应加上，包括 CSS/JS 与 API。这里不用 `public/_headers`：它的规则不会应用到 Worker 生成的响应，而 `run_worker_first = true` 让每个请求都先进 Worker |
| fail-closed | 未设置 `CONFIG_TOKEN` 时拒绝所有 API 请求，避免部署变成对全网开放的免费代理 |
| 本地假上游 | `npm run dev:mock` 返回真实结构的 WAV / SSE，不发请求、不消耗额度 |

## 模型能力对照表

左列是 MiMo-V2.5-TTS 官方能力，右列是它在本项目里的落点。

| 官方能力 | 本项目落点 |
| --- | --- |
| 8 个预置音色 + `mimo_default`（`audio.voice`） | ① 音色 · 预置音色网格（9 张卡片）＋ 每张卡片的 ▶ 试听 |
| 音色设计：由文本描述生成新音色 | ① 音色描述框 ＋ 四要素提示 ＋ 4 个示例 ＋ 智能润色开关 ＋「存为我的音色」 |
| 零样本音色克隆（mp3/wav，Base64 ≤ 10MB） | ① 拖放/点选样本 → 波形 · 时长 · 体积 ＋「识别样本内容」＋「存为我的音色」＋「从历史音频选择」；播放器里的「用作克隆样本」 |
| 唱歌（仅 `mimo-v2.5-tts`） | ③ 台词「唱歌」pill：自动把 `(唱歌)` 写到文本最前；其它模型给出提示 |
| 自然语言控制（`messages[role=user]`） | ② 演绎 · 风格描述（整段基调 / 句内节奏 / 单字处理） |
| 导演模式：角色 / 场景 / 指导 | ② 折叠区三个字段 ＋「填入官方示例」；留空不发送 |
| 整体风格标签（台词开头的 `(标签)`） | ③「整体风格」pill ＋ 标签面板 7 组：基础情绪 / 复合情绪 / 整体语调 / 音色定位 / 人设腔调 / 方言 / 角色扮演 |
| 句内音频标签（台词任意位置的 `（标签）`） | ③「句内标签」pill ＋ 标签面板 4 组：语速节奏 / 情绪状态 / 语音特征 / 哭笑表达，按台词语种自动切中/英 |
| 智能润色与自动生成播报文本（`optimize_text_preview`） | ①③ 的「智能润色播报文本」开关；合成后回显「润色后的播报文本」＋「用这段文本替换台词」 |
| 真·低延迟流式（仅预置音色模型） | 底部合成条的「流式」开关；另两个模型下，开关的悬停提示会说明这只是兼容模式 |
| 输出格式 wav / mp3 / pcm16（24kHz 单声道） | 底部合成条格式分段控件 ＋ 设置里的「默认输出格式」；流式固定 PCM16 并在浏览器里封装成 WAV |
| 8K 上下文，官方建议约 2500 字以内一次合成 | ③「自动分段并拼接」：按句切分、逐段补回风格标签、统一 PCM16、拼回单个 WAV |
| 语音识别（`mimo-v2.5-asr`，同一端点） | ① 音色克隆的「识别样本内容」；仅在台词为空时填入 |
| 上游错误语义（401 / 402 / 403 / 421 / 429 / 5xx） | 服务端翻译为 `not_configured`、`upstream_*` 等错误码，界面显示可执行的中文提示 |
| 响应里的 `transcript` 字段 | 上游恒为 `null`，未使用；润色结果改由 `final_text_preview` 回显 |

尚未接入的部分，一并列出以免误判覆盖面：

| 官方能力 | 状态 |
| --- | --- |
| 音频理解 / 生成音频的回听评估（`mimo-v2.5`、`mimo-v2.6-*`） | 未接入 |
| 把多轮对话历史放进 `messages` 作为上下文 | 未使用：每次请求独立，`messages` 最多 12 条 |
| 标点控制停顿、全大写表示强调 | 无专用控件，直接写在台词里即可 |

## 界面导览

界面是三层，每层对应请求里不同的字段——这是本项目的核心设计：

| 层 | 界面位置 | 落到请求里的字段 | 说明 |
| --- | --- | --- | --- |
| ① 音色 | 左栏第一段 | `audio.voice` | 谁在说话：预置音色 ID，或克隆样本的 `data:audio/…;base64,…`。音色设计模型不使用该字段 |
| ② 演绎 | 左栏第二段 | `messages[role=user].content` | 怎么演：自然语言描述与导演模式。**永远不会被朗读** |
| ③ 台词 | 左栏第三段 | `messages[role=assistant].content` | 说什么：唯一被朗读的文本，整体风格标签与句内音频标签都写在这里 |

- 每层标题右侧标注了它对应的请求字段，不用翻文档就能对上。
- 左栏底部的「请求预览」实时显示将要发送的 JSON；克隆样本会被省略成 `<x.xx MB>`，可一键复制为 cURL。
- 音色设计模型只有一个 `user` 字段，所以 ② 的内容会被合并进 ① 的「音色描述」一起发送——界面会明确提示，而不是悄悄丢弃。
- 台词框本身就是状态：标签不另存一份，输入什么就发送什么，高亮层和标签 chip 都从这段文本推导。

## 一分钟部署

**前置**：Node.js 18+ 与 Cloudflare 账号；[小米 MiMo 开放平台](https://mimo.mi.com) 的 API Key。按量付费与 Token Plan 两类密钥不能混用，用错会在上游得到 401。

```bash
npm install
npx wrangler login

# 1. 创建资源
npx wrangler d1 create mimo-tts-db          # 把输出里的 database_id 填回 wrangler.toml
npx wrangler r2 bucket create mimo-tts-audio

# 2. 建表（推荐执行；Worker 首次收到请求时也会自动建表并补齐新增列，
#    所以已有部署直接 deploy 即可升级，不必手工跑 SQL）
npm run db:remote

# 3. 两个 secret
npx wrangler secret put MIMO_API_KEY        # 小米 MiMo 开放平台密钥
npx wrangler secret put CONFIG_TOKEN        # 自定义一个随机串，进入界面时要填

# 4. 部署
npm run deploy
```

部署完成后打开 Worker 域名，首次进入会要求粘贴刚才设置的 `CONFIG_TOKEN`（只保存在该浏览器的 localStorage 中）。

使用 Token Plan 密钥时，把 `wrangler.toml` 里的 `UPSTREAM_URL` 改为 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`。

**持续部署**：`.github/workflows/deploy.yml` 会在 push 到 `main` 时用 `cloudflare/wrangler-action@v3` 部署。在仓库 Secrets 中配置 `CF_API_TOKEN` 与 `CF_ACCOUNT_ID` 即可；它不负责创建 D1 / R2，首次仍需按上面的步骤准备。

**本地开发**

```bash
npm run dev              # 本地开发；两个机密用 .dev.vars 提供（wrangler secret put 只影响已部署的 Worker）
npm run dev:mock         # MIMO_MOCK=1：本地假上游，返回结构真实的 WAV / SSE
npm run db:local         # 在本地 D1 上建表
npm run brand            # 重新生成 brand/drafts/ 下的 logo 候选稿
```

`wrangler` 起不来时（受限环境、CI 里只想跑个冒烟测试），可以用附带的 Node 宿主直接加载真实的 Worker 源码：

```bash
node scripts/local-harness.mjs          # http://127.0.0.1:8787，CONFIG_TOKEN=devtoken，假上游
node scripts/smoke.mjs                  # 91 项端到端断言：鉴权、冷库迁移、Range、SSE、音色库、安全头…
node scripts/check-failclosed.mjs       # 未设 CONFIG_TOKEN 时的拒绝行为（含伪造请求头回归）
node scripts/check-migration.mjs        # 已有 v4 数据库升级到 v5 的迁移路径
node scripts/check-live.mjs https://…   # 校验一个已部署实例：响应头、构建版本、访问控制
```

`scripts/local-harness.mjs` 只用 `node:sqlite` 与内存对象模拟 D1 / R2，`src/` 一行不改。它不是部署目标，只是让整条链路可以在没有 workerd 的环境里被验证。

`scripts/check-live.mjs` 补的是本地跑不出来的那一类问题：安全响应头到底有没有真的下发。Worker 里设了头，不等于线上就有——请求可能被资源层直接接走，压根不进 Worker。它带缓存穿透参数请求 CSS / JS / SVG 这些非 HTML 文件，因为这些文件带没带头能直接说明是谁应答的。`npm run check:live -- https://你的域名` 即可。

> **CI 里必须先 `npm ci`。** `cloudflare/wrangler-action@v3` 在找不到本地 wrangler 时会回退到自己 pin 的 **3.90.0**，那个版本不认识 `assets.run_worker_first`，会把它当成未知字段静默丢掉，于是静态资源改由资源层应答、Worker 完全收不到请求，线上所有安全头都会消失。装完依赖后 action 会用 `package-lock.json` 里锁定的 wrangler 4.x。这条已经踩过一次，工作流里加了说明。

## 配置项

`wrangler.toml` 的 `[vars]`：

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `UPSTREAM_URL` | `https://api.xiaomimimo.com/v1/chat/completions` | 上游 OpenAI 兼容端点。Token Plan 换成 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` |
| `HISTORY_LIMIT` | `200` | 历史保留条数，超出后清理最旧的未收藏项（D1 行与 R2 对象一起删） |
| `MAX_AUDIO_BYTES` | `26214400` | 单个音频对象的硬上限（25MB），超出时 `POST /api/history` 返回 413 |
| `AUDIO_URL_TTL` | `1800` | 签名播放链接有效期（秒）。`<audio>` 无法携带请求头，因此走短期签名 URL |
| `MIMO_MOCK` | 未设置 | 设为 `"1"` 时启用本地假上游，仅用于开发与自测 |
| `ALLOWED_ORIGINS` | 未设置 | 逗号分隔的跨域白名单；留空表示仅同源、不发送任何 CORS 头。该变量由 `src/lib/http.js` 读取，默认未写入 `wrangler.toml` |

两个 secret：

| Secret | 必需 | 说明 |
| --- | --- | --- |
| `MIMO_API_KEY` | 是 | 小米 MiMo 开放平台密钥，以 `api-key` 请求头发往上游；未设置时合成返回 503 `not_configured` |
| `CONFIG_TOKEN` | 是 | 访问令牌。**未设置时服务端拒绝所有 `/api/*` 与 `/audio/*` 请求**，一律返回 503 `not_configured`（仅 `/api/health` 例外，用于让界面提示该跑哪条命令）。`/audio/*` 因为 `<audio>` 无法携带请求头而绕开统一守卫，但它在自己内部执行同样的检查 |

## 目录结构

```
wrangler.toml          Worker 名称、静态资源绑定、D1 / R2 绑定、vars
src/worker.js          入口：路由、静态资源托管、给所有响应加安全头
src/routes/            tts（合成代理）/ asr / config / history / audio / voices（音色库）
src/lib/               auth（令牌与签名）/ db（建表与用量）/ upstream（重试与错误翻译）/ http / mock
src/db/schema.sql      D1 权威结构，幂等，可重复执行
public/index.html      应用外壳
public/css/            tokens / base / components / app 四层样式
public/js/             boot（入口）· main（装配）· synth（合成引擎）· core / domain / views
public/brand/          标识与分享卡（见 public/brand/README.md）
scripts/gen-logos.mjs  标识生成脚本，输出到 brand/drafts/
scripts/local-harness.mjs / smoke.mjs   无 workerd 环境下的端到端验证
docs/mimo-api-reference.md              上游 API 的逐项事实与未确认项
```

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `⌘` / `Ctrl` + `Enter` | 开始合成 |
| `Esc` | 取消正在进行的合成 |
| `空格` | 播放 / 暂停 |
| `←` / `→` | 后退 / 前进 3 秒 |
| `Shift` + `←` / `→` | 后退 / 前进 10 秒 |

播放相关快捷键需要已有载入的产物，且焦点不在输入框内时生效；标签面板与设置抽屉中的开关、分段控件都可用 `Enter` / `空格` 操作。

## 常见问题

**为什么必须设置 `CONFIG_TOKEN`？不设置会怎样？**
不设置时，服务端会对所有 `/api/*` 与 `/audio/*` 请求返回 503 `not_configured`，只有 `/api/health` 可达——界面据此显示「还差一步：设置访问令牌」并给出要执行的命令。这是刻意的 fail-closed：Worker 里存着你的 `MIMO_API_KEY`，如果匿名可用，任何知道域名的人都能用你的额度合成语音。令牌通过 `X-Config-Token` 请求头传递，浏览器把它存在 localStorage（`mimo_tts_token`），比较时使用常量时间实现。

**为什么选 `mimo_default` 结果会变？**
两件事叠加。其一，`mimo_default` 是按集群解析的：中国集群解析为「冰糖」，其他集群为「Mia」，所以同一个预设在不同部署上本来就不是同一个嗓音。其二，合成本身有随机性，官方也建议多生成几条再挑。想固定结果就直接选一个具名音色。

**音色克隆的样本有什么限制？**
仅支持 mp3 与 wav；Base64 编码后不得超过 10MB（对应原始文件约 7.5MB），前端在选择时就会校验并提示。服务端另有一道保险：`audio.voice` 字符串超过 14MB（data URL 形式）直接返回 413。克隆是零样本的，样本只随本次请求发往上游，不做服务端留存或训练。

**长文本为什么会断？怎么处理？**
三个 TTS 模型共享 8K 上下文与 8K 最大输出，官方建议一次性合成控制在约 2500 字以内，超长容易丢尾。打开「自动分段并拼接」后，超过 2500 字的部分会按句末标点切分，每段都补回开头的风格标签，统一用 PCM16 合成，最后在浏览器里拼成一个完整 WAV。两点注意：每段都是一次独立计费的上游调用；启用分段时生成条数会被强制为 1。

**为什么只有预置音色模型的流式是真正的低延迟？**
`/api/tts` 是流式透传（SSE），但上游只有 `mimo-v2.5-tts` 是实时返回的。`mimo-v2.5-tts-voicedesign` 与 `mimo-v2.5-tts-voiceclone` 的流式是兼容模式——推理全部完成后才一次性返回 SSE 形状的结果，开流式不会更快。界面在这两个模型上会直接提示这一点。另外流式固定使用 PCM16（浏览器收到后封装成 WAV），此时格式按钮会被禁用。

**数据都存在哪里？**
D1 存四类：`config`（单行 UI 配置）、`history`（每次合成的元数据与完整参数）、`voices`（音色库：描述文本或参考音频的元数据）、`usage`（每次上游调用一行）。R2 存音频本体，历史音频键为 `audio/<id>.wav|mp3`，音色库参考音频键为 `voice/<id>.wav|mp3`。浏览器只存令牌、主题偏好与一份配置快照。删除一条历史会同时删除 D1 行与 R2 对象；`HISTORY_LIMIT` 触发时只清理未收藏项，且先删对象再删行——删对象失败就保留该行，下次再试，不会留下无人引用的孤儿对象。

**音色库里存的「设计」和「克隆」有什么区别？**
设计音色存的是那段描述文本，每次调用模型都会重新生成音色，所以同一个音色两次合成会有细微差别——这是模型本身的随机性，不是保存失败。克隆音色存的是参考音频本体（在 R2 里），复刻是确定性的。音色卡的角标会写明是哪一种。

**上游报错怎么读？**
服务端把上游状态码翻译成语义化错误码：401 → 密钥与端点计费方式不匹配，402 → `upstream_balance`（余额不足），403 → `upstream_region`（地区或风控），421 → `upstream_filtered`（内容被安全策略拦截，改写文本再试），429 → `upstream_rate_limited`。对 429 与 5xx，只要还没向客户端输出任何字节，服务端会最多重试 3 次并尊重 `Retry-After`。账号级限流为 100 RPM / 10M TPM（按模型、按账号汇总）。

## 更新日志 v5

- **三层控制模型定型**：界面三层与请求字段一一对应，并把映射集中到 `public/js/domain/payload.js` 一处；音色设计的风格描述与导演模式不再被丢弃，而是合并进音色描述。
- **台词即状态**：标签不再单独存一份，文本本身就是唯一来源，消除了高亮与发送内容不一致的问题。
- **历史可无损还原**：新增 `spec` 字段保存参数，「载入」会恢复模型、音色、音色描述、风格、导演模式、格式、润色与分段开关；克隆样本属于会话状态，需重新上传。参数极多时 `spec` 会降级保存身份字段，并明确告知哪部分没能保存。
- **多版本与分组**：新增 `batch_id` / `take_index` / `tokens` / `chars` / `starred` 字段，支持同批 take 分组、收藏筛选与用量统计；D1 迁移幂等，v4 数据库在首次请求后自动补齐。
- **长文本分段拼接**、**试听缓存**、**播放器倍速与下载**、**历史音频直接用作克隆样本**、**ASR 识别样本**、**音色库**（设计音色存描述、克隆音色存参考音频，一键应用）。
- **安全**：播放改走 HMAC 签名短期链接（不再把长期令牌放进 query string）；新增 CSP、`no-referrer`、`nosniff`、`frame-ancestors 'none'` 等响应头；未设置 `CONFIG_TOKEN` 时 fail-closed。
- **工程**：新增本地假上游（`MIMO_MOCK`）、用量统计端点与设置抽屉、首屏前主题脚本、v5 设计 token 与品牌资产。

## 许可

MIT，见 [LICENSE](LICENSE)。

MiMo 及相关名称、标识归其各自所有者所有；本项目与小米无隶属关系。
