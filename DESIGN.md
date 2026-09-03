# MiMo TTS Studio — Design Baseline

> 方向 A「录音棚」：深色专业音频工具气质，琥珀点缀，等宽数字，波形为视觉母题。
> 用户已确认（2025 会话方案讨论）：A 方向 + 历史记录 + 仅代理模式。

## Atmosphere

专业录音棚的暗色调工作台。安静、聚焦、有设备感 —— 界面像一台音频工作站（DAW），
而不是通用 Web 表单。所有数值（时长/进度/大小/状态）使用等宽字体，
强化"仪器读数"的感觉。波形是贯穿全局的视觉母题。

## Color Tokens（dark 为默认，light 为「日间」变体）

### Dark（默认）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--bg` | `oklch(0.145 0.008 260)` | 页面底色，近黑 |
| `--surface` | `oklch(0.19 0.01 260)` | 卡片/面板 |
| `--surface-2` | `oklch(0.235 0.012 260)` | 次级面板/输入框 |
| `--border` | `oklch(0.30 0.012 260)` | 描边 |
| `--ink` | `oklch(0.93 0.005 260)` | 主文字 |
| `--ink-dim` | `oklch(0.62 0.01 260)` | 次级文字 |
| `--accent` | `oklch(0.78 0.14 75)` | 琥珀主色：按钮/焦点/波形 |
| `--accent-strong` | `oklch(0.84 0.15 75)` | hover |
| `--accent-dim` | `oklch(0.78 0.14 75 / 0.16)` | 焦点环/选中底 |
| `--ok` | `oklch(0.75 0.14 150)` | 成功 |
| `--err` | `oklch(0.68 0.18 25)` | 错误 |

### Light「日间」

暖纸白底 `oklch(0.97 0.006 85)` + 墨字 `oklch(0.2 0.01 70)` + 深琥珀 `oklch(0.55 0.13 65)`。
面板纯白，边框 `oklch(0.86 0.01 85)`。

## Typography

| 角色 | 字体 | 字号 |
| --- | --- | --- |
| UI 正文 | `system-ui` 栈 | 0.875rem / line 1.6 |
| 读数（时长/进度/状态/KB） | `'SF Mono','JetBrains Mono',Consolas,monospace` | 0.75rem，tabular-nums |
| 页面标题 | system-ui 600 | 1rem，字距 -0.01em |

不引入外部字体文件。等宽字体只用于"读数"，不用于正文。

## Layout

- 桌面三段：顶栏 52px（Logo·模型分段切换·主题·同步状态·⚙）／左创作区 flex 1.1 ／右输出区 flex 0.9，中间 1px 分隔
- 创作区内边距 1.5rem；合成主按钮高 3rem 全宽，琥珀底黑字
- 输出区：播放器卡片在上，历史列表滚动在下
- 移动端（≤820px）：单列，输出区为底部抽屉（上滑把手），合成按钮吸底
- 断点只有两个：820px / 1100px（1100 以下右区变窄）

## Primitives

- **分段切换 segmented**：顶栏模型切换与标签分组 tab 共用，圆角 8px，选中项琥珀底黑字
- **chip**：标签选中态，圆角 100px，带 × 移除
- **抽屉 drawer**：右侧设置（400px）与移动端输出，`transform` 过渡 220ms
- **卡片**：`--surface` 底 + 1px `--border` + 圆角 10px，无大阴影（阴影最深 `0 2px 12px oklch(0 0 0/.25)`）
- **波形 canvas**：48px 高，琥珀色 60% 透明度柱状

## Motion

统一 `180ms ease`；抽屉 220ms；播放进度条 `linear` 100ms。
`prefers-reduced-motion` 全部归零。

## Voice / 文案

界面文案中文为主，术语保留英文（WAV、PCM16、VoiceDesign）。
空状态引导一句话 + 主操作按钮，不放插图堆砌。

## Source Evidence & Confidence

- 旧版 `public/index.html`（单文件版）为唯一先行来源，本次为有意的整体替换式重设计
- `[inferred confidence=high]` 全部 token 值为本设计权威新定，非从旧源提取
- 功能字段与旧版保持兼容：MODELS/PRESET_VOICES/STYLE_TAGS/AUDIO_TAGS 及配置持久化字段名不变
