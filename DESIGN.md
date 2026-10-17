# MiMo TTS Studio — Design Baseline

> 方向 v4「Modern Studio」：中性极简工作台，单一强调色（MiMo 橙），
> 默认跟随系统深浅色。工具感优先：留白、细线、克制的灰阶层级，
> 唯一饱和色只出现在「值得被看见」的地方（合成按钮、播放进度、选中态、
> 风格 chip）。波形仍然是唯一视觉主角。

## Atmosphere

一张安静的现代工作台。不是通用 Web 表单，也不是拟物 DAW——
是给中文配音/有声内容创作者的精密工具。信息按「输入 → 调参 → 输出」
单向排布，默认隐藏一切可省略的东西（风格面板是弹层、高级设置默认折叠），
首屏只保留：模型、音色、文本、合成。

## Color Tokens

Light 为默认；`auto`（未设 `data-theme`）时由 `prefers-color-scheme` 决定。

| Token | Light | 用途 |
| --- | --- | --- |
| `--bg` | `oklch(0.982 0.003 80)` | 页面底（暖中性灰白） |
| `--surface` | `oklch(1 0 0)` | 卡片/输入框 |
| `--surface-2` | `oklch(0.962 0.004 80)` | 次级底/分段控件底 |
| `--surface-3` | `oklch(0.93 0.005 80)` | 进度条槽/更深层级 |
| `--border` | `oklch(0.912 0.005 80)` | 描边 |
| `--ink` | `oklch(0.23 0.013 60)` | 正文 |
| `--ink-dim` | `oklch(0.46 0.012 60)` | 次级文字 |
| `--ink-faint` | `oklch(0.62 0.010 60)` | 辅助文字/未播放波形 |
| `--accent` | `oklch(0.635 0.192 42)` | MiMo 橙：合成按钮/播放进度/选中态 |
| `--accent-ink` | 近白 | 橙底上的文字 |
| `--ok` / `--err` | 苔绿 / 陶红 | 状态 |

Dark：`--bg oklch(0.158 0.006 60)` 近黑暖灰，橙提亮为 `oklch(0.715 0.170 46)`。

## Typography

| 角色 | 字体 | 字号 |
| --- | --- | --- |
| 品牌字 | system-ui 650（无衬线，v3 的衬线品牌字退役） | 0.94rem |
| UI 正文 | system-ui 栈 | 0.875rem / line 1.6 |
| 合成文本输入 | system-ui 栈 | 0.94rem / line 1.75 |
| 读数（时间码/KB/字数） | `'SF Mono','JetBrains Mono',Consolas` | 0.72rem，tabular-nums |

不引入外部字体文件。

## Layout

- **桌面双栏**：顶栏 56px（品牌 · 同步状态 · 主题 · 设置）／
  左创作区（内容列 `max-width: 680px` 居中）／右输出栏 400px
- 创作区自上而下：模型分段（滑动墨块）· 模型参数卡（随模型变化）·
  合成文本（主焦点）· chips 行（`+ 风格` 按钮）· 高级设置（折叠）
- 合成按钮吸底（46px 高，全宽，渐变遮罩），⌘/Ctrl+Enter 触发
- **移动端（≤900px）**：单列创作区；输出区为底部抽屉（54px 把手、
  上滑 72dvh、chevron 翻转），合成按钮吸底于把手之上
- 断点：1180px（输出栏收窄 340px）/ 900px（单列+抽屉）/ 480px
  （同步文字收纳、标签搜索独占一行、高级三格改单列）

## Primitives

- **分段 segmented**：浅底凹槽 + 白色滑块（阴影轻浮起），选中项加黑字重；
  不再是彩色墨块
- **card**：1px 描边 + 14px 圆角，无阴影或极轻阴影
- **chip**：橙 10% 底 + 橙字，圆角 999px，× 移除，弹入动效；
  `+ 风格` 按钮无标签时虚线描边，有标签时实心橙底并显示计数
- **标签面板**：桌面居中 popover（560px，遮罩渐显）；移动端底部 sheet
  （76dvh 圆角上翻）。内部为分组 tab + 搜索 + pills；
  风格 pill 实底、音效 pill 虚线描边，选中转橙 10% 底
- **播放器卡**：白面板 + 58px 波形 canvas（未播放灰、已播放橙，双色填充
  表达进度）+ 38px 圆形播放钮（浅色黑底白图标 / 深色白底黑图标，
  hover 转橙）+ 4px 进度条 + mono 读数 + 下载按钮
- **历史条目**：无卡片列表行（1px 分隔线），hover 白底浮起；播放中
  橙 12% 底 + 左橙描边；操作（载入/删除）hover 浮现，触屏恒显
- **抽屉 drawer**：右侧 400px，遮罩渐显，Esc 可关
- **空态**：一行标题 + 一行指路 + 细线波形图形；有历史或播放器出现时
  由 `[hidden]` 精确控制显隐（统一 `[hidden] { display: none !important }`）

## Motion

回答操作的动效：分段滑块滑动 180ms、chip 弹入（回弹曲线）、
面板遮罩渐显 180ms、抽屉/底部 sheet 260ms（`cubic-bezier(0.32,0.72,0,1)`）、
历史删除淡出位移、播放器卡上浮 260ms、历史条目错峰入场（30ms 步进）。
`prefers-reduced-motion` 全部归零。同步状态点呼吸动效仅用于进行中。

## Voice / 文案

界面文案中文为主，术语保留英文（WAV、PCM16、VoiceDesign、VoiceClone）。
按钮说动作（合成/下载/载入），空态一句话指路。图标全部为手绘线性 SVG。

## 兼容性契约（不可破坏）

- localStorage key：`mimo_tts_config` / `mimo_tts_theme` / `mimo_tts_config_token`
- 配置字段名（`collectConfig` 输出）与 D1 `config` 表结构不变
- `mimo_tts_theme` 新增取值 `auto`（跟随系统）；旧的 `light`/`dark` 直接生效
- 后端 API 契约（/api/tts、/api/config、/api/history、/audio/:id）不变
