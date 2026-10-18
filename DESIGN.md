# MiMo TTS Studio — 设计基线

本文是界面视觉与交互的权威约定，供后续维护者使用。文中的色值、尺寸、时长全部取自代码（`public/css/tokens.css`、`base.css`、`components.css`、`app.css`）；如果本文与代码不一致，以代码为准，并顺手把本文改回来。

## 设计方向

**暖中性底 + 单一橙色强调 + 零装饰**：界面不解释自己，把注意力全部留给台词与声音；所有颜色来自 `tokens.css`，所有尺寸来自同一套 token，所有动效只用于表达状态变化。

三条原则：

1. **一层一义**：界面三段（音色 / 演绎 / 台词）各自对应请求里的一个字段，视觉上也必须保持三段可分辨——所以每段有编号与标题。
2. **克制用色**：强调色只出现在"当前选中""可执行的主操作""进行中的状态"三类位置。状态色（`--ok` / `--warn` / `--err`）不用于装饰。
3. **零外部依赖**：没有字体文件、没有图标字体、没有 CDN、没有打包产物。新增任何资源前先问"能不能用现有 token 和 `icons.js` 表达"。

## 色彩 token

浅色是默认；`auto` 跟随系统（`:root:not([data-theme="light"])` 下的 `prefers-color-scheme: dark` 分支），`[data-theme="dark"]` 为显式深色。

### 表面与描边

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--bg` | `oklch(0.977 0.004 68)` | `oklch(0.163 0.007 52)` | 页面底色。带极轻的暖色偏移，避免橙色显得发冷 |
| `--surface` | `oklch(1 0 0)` | `oklch(0.203 0.008 52)` | 卡片、输入框、播放器、抽屉 |
| `--surface-2` | `oklch(0.958 0.005 68)` | `oklch(0.243 0.009 52)` | 次级底：分段控件轨道、chip 行、样本卡、代码块 |
| `--surface-3` | `oklch(0.925 0.006 68)` | `oklch(0.292 0.010 52)` | 更重的底：开关关闭态轨道、进度条槽、按钮 hover |
| `--surface-sunk` | `oklch(0.945 0.005 68)` | `oklch(0.185 0.008 52)` | 下沉区域：请求预览的 `<pre>` |
| `--border` | `oklch(0.905 0.006 68)` | `oklch(0.305 0.010 52)` | 常规描边与分隔线 |
| `--border-strong` | `oklch(0.845 0.008 68)` | `oklch(0.405 0.012 52)` | 需要被看见的描边：虚线 pill、拖放区、折叠箭头、未收藏星标 |

### 文字

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--ink` | `oklch(0.225 0.012 52)` | `oklch(0.938 0.006 74)` | 正文、标题、播放按钮底 |
| `--ink-dim` | `oklch(0.455 0.012 52)` | `oklch(0.690 0.010 74)` | 次级文字：按钮标签、开关标签、播放时间 |
| `--ink-faint` | `oklch(0.615 0.010 52)` | `oklch(0.512 0.009 74)` | 仅辅助信息：说明、提示、等宽元数据。不得用于需要读的正文 |

### 强调色

品牌色阶为 `#f49120 → #eb5e00 → #c5322b`；界面强调色是同一色相在 OKLCH 中的三档。

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--accent` | `oklch(0.655 0.192 44)` | `oklch(0.722 0.170 48)` | 主操作、选中态、进度、focus 描边 |
| `--accent-strong` | `oklch(0.595 0.196 40)` | `oklch(0.768 0.160 50)` | 主操作 hover |
| `--accent-hi` | `oklch(0.745 0.163 62)` | `oklch(0.792 0.145 64)` | 高光端（与品牌渐变起点同族） |
| `--accent-ink` | `oklch(0.995 0.002 80)` | `oklch(0.175 0.030 44)` | 强调底上的文字 |
| `--accent-dim` | `oklch(0.655 0.192 44 / 0.11)` | `oklch(0.722 0.170 48 / 0.17)` | 选中填充、chip 底、focus 环、进度条底 |
| `--accent-veil` | `oklch(0.655 0.192 44 / 0.055)` | `oklch(0.722 0.170 48 / 0.08)` | 悬停/选中的极淡底（音色卡、take 卡、历史行） |
| `--accent-line` | `oklch(0.655 0.192 44 / 0.35)` | `oklch(0.722 0.170 48 / 0.42)` | 内描边与下划线（选中卡、高亮标签） |

### 状态色

| Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--ok` | `oklch(0.555 0.115 158)` | `oklch(0.745 0.120 158)` | 成功、样本就绪、唱歌标签高亮 |
| `--ok-dim` | `oklch(0.555 0.115 158 / 0.13)` | `oklch(0.745 0.120 158 / 0.16)` | 成功底 |
| `--warn` | `oklch(0.635 0.135 78)` | `oklch(0.785 0.125 82)` | 警告与非阻塞提示、句内标签高亮 |
| `--warn-dim` | `oklch(0.635 0.135 78 / 0.14)` | `oklch(0.785 0.125 82 / 0.16)` | 警告底 |
| `--err` | `oklch(0.545 0.195 26)` | `oklch(0.700 0.170 26)` | 失败、危险操作 hover |
| `--err-dim` | `oklch(0.545 0.195 26 / 0.10)` | `oklch(0.700 0.170 26 / 0.15)` | 失败底 |

### 形状

| Token | 值 | 用途 |
| --- | --- | --- |
| `--r-lg` | `16px` | 大容器：标签弹层、gate 卡 |
| `--r` | `12px` | 卡片、拖放区、播放器 |
| `--r-sm` | `9px` | 按钮、输入框、编辑器、分段控件、take 卡 |
| `--r-xs` | `6px` | 行内小按钮、focus 环圆角、搜索框 |
| `--shadow-1` | `0 1px 2px oklch(0.225 0.012 52 / 0.05)` | 抬升 1：卡片、分段滑块 |
| `--shadow-2` | 上一行 + `0 4px 14px … / 0.06` | 抬升 2：gate 卡；深色下为纯黑阴影 |
| `--shadow-pop` | `0 2px 8px … / 0.08` + `0 20px 56px … / 0.16` | 浮层：弹层、抽屉、toast；深色为 `0.35` / `0.55` |

深色下三档阴影全部换成纯黑（`oklch(0 0 0 / 0.3)`、`/ 0.28`、`/ 0.35` + `/ 0.55`）。

## 排版

| Token | 值 |
| --- | --- |
| `--font` | `system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif` |
| `--font-mono` | `"SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace, Consolas, monospace` |

- 上文正文 `0.875rem / 1.6`，抗锯齿开启，`text-rendering: optimizeLegibility`。
- 等宽字重不提高；`.mono` 固定 `0.72rem`、`letter-spacing: 0.01em`、`font-variant-numeric: tabular-nums`。所有数字（时长、体积、token、字数、用量）都必须走等宽或 `tabular-nums`，避免跳动。
- 字号阶梯（rem）：`1.15` · `0.95` · `0.93` · `0.92` · `0.88` · `0.86` · `0.84` · `0.83` · `0.82` · `0.81` · `0.8` · `0.79` · `0.78` · `0.76` · `0.75` · `0.74` · `0.72` · `0.71` · `0.7` · `0.68` · `0.66` · `0.65`。新增文字请复用现有档位，不要引入中间值；最末两档只给最密集的元数据（`0.66` 是合成按钮里的 `kbd` 提示，`0.65` 是音色卡标签、音色库的 kind 角标与播放器格式徽标）。
- 字重阶梯：`500 / 520 / 540 / 550 / 560 / 600 / 620 / 650 / 660 / 680`，另有 `700` 仅用于层序号数字（`.layer-no`）。语义上：正文与大型控件 500–560，按钮与标签 550，组件标题 620，小节标题 650，主标题 660–680。不使用 `text-transform`，不做全大写。

对应关系：

| 位置 | 字号 / 字重 |
| --- | --- |
| gate 页标题 | `1.15rem / 680`，`letter-spacing: -0.01em` |
| 抽屉标题 | `0.95rem / 650` |
| 台词编辑区 | `0.93rem`，`line-height: 1.85` |
| 合成按钮、品牌名 | `0.92rem / 660` |
| 弹层标题 | `0.88rem / 650` |
| 层标题 | `0.86rem / 660` |
| 音色卡名称、空态标题 | `0.83–0.84rem / 620` |
| 输出栏标题、历史正文 | `0.81–0.82rem` |
| 按钮、开关标签、状态行 | `0.78–0.8rem`（`520–550`） |
| 说明文字 `.note` | `0.75rem`，`line-height: 1.6` |
| 提示 `.hint`、徽标、等宽元数据 | `0.68–0.72rem` |

## 布局

| Token | 值 | 用途 |
| --- | --- | --- |
| `--topbar-h` | `54px` | 顶栏高度；`@media (hover: none)` 下提到 `58px` |
| `--col` | `720px` | 编辑列最大宽度（`.composer-col`、`.dock-col` 居中）；`min-width: 1500px` 升为 `820px`，`min-width: 1800px` 升为 `880px` |
| `--out-w` | `404px` | 输出栏宽度；`max-width: 1240px` 降为 `348px`，`min-width: 1500px` 升为 `460px`，`min-width: 1800px` 升为 `520px` |
| `--dock-h` | `64px` | 当前仅用于 toast 的底部偏移（`calc(var(--dock-h) + 18px)`），不是合成条的实际高度（其高度由内容决定） |

- 顶栏：`sticky`、`z-index: 40`、`height: var(--topbar-h)`、左右 `16px`；背景 `color-mix(in oklab, var(--bg) 84%, transparent)` + `backdrop-filter: blur(14px)`，底部 `1px` 分隔线。
- 主栅格 `.app`：`grid-template-columns: minmax(0, 1fr) var(--out-w)`，`min-height: calc(100dvh - var(--topbar-h))`；编辑栏右侧 `1px` 分隔线。
- 编辑列内边距 `26px 24px 20px`，列内 `gap: 20px`；每层内部 `gap: 12px`。
- 底部合成条 `.dock`：`sticky bottom: 0`、`z-index: 30`、`padding: 10px 24px calc(14px + env(safe-area-inset-bottom))`，用向上淡出的背景渐变遮住滚动内容。
- 输出栏：头部 `46px`，列表区 `padding: 12px 16px calc(24px + env(safe-area-inset-bottom))`、`gap: 12px`；历史行之间用 `1px` 分隔线而非卡片。
- 弹层 `.sheet`：`width: min(620px, calc(100vw - 40px))`、`max-height: min(600px, calc(100dvh - 80px))`，居中。抽屉 `.drawer`：`width: min(420px, 100vw)`，右侧贴边，`transform: translateX(102%)` 收起。
- toast 固定居中于 `bottom: calc(var(--dock-h) + 18px)`，`max-width: min(520px, calc(100vw - 32px))`。

### 断点

共六档：宽屏两档 `min-width`（`1500px` / `1800px`）只放大 `--col` 与 `--out-w`，窄屏四档 `max-width`（`1240px` / `980px` / `560px` / `430px`）改变结构。

| 断点 | 行为 |
| --- | --- |
| `≥ 1800px` | `--col: 880px`、`--out-w: 520px` |
| `≥ 1500px` | `--col: 820px`、`--out-w: 460px`（宽屏下居中列两侧留白过宽，因此两栏同时放大） |
| `> 1240px`（默认） | 双栏：编辑列 `720px`（居中）+ 输出栏 `404px` |
| `≤ 1240px` | `--out-w: 348px`；编辑列内边距收紧为 `22px 20px 18px`；take 卡与历史行的体积信息隐藏；其余不变 |
| `≤ 980px` | 栅格改为单列。输出栏变成底部抽屉：`fixed`、`height: 76dvh`、上圆角 `18px`、折叠态为 `translateY(calc(100% - 52px - env(safe-area-inset-bottom)))`，头部 `52px` 居中可点（显示抓手条与箭头），展开态加 `.is-open`；合成条底部内边距增为 `calc(62px + safe-area)` 以避开折叠的抽屉；标签弹层同时变为底部面板（贴底、`max-height: 78dvh`、上圆角 `18px`）；合成结束时若处于该宽度会自动展开输出栏 |
| `≤ 560px` | 编辑列内边距 `16px 13px 12px`，合成条左右 `13px`；音色网格 `minmax(140px, 1fr)`（默认 `158px`）；合成条选项间距 `6px`，并隐藏竖分隔与选项标签 `.opt-label`，分段按钮收为 `4px 8px` / `0.72rem`；台词框最小高度 `160px`（默认 `190px`）；gate 卡内边距 `20px`（默认 `28px`） |
| `≤ 430px` | 同步徽标只留状态圆点（隐藏 `#syncText`），徽标内边距收为 `3px 8px` |

## 组件清单

| 组件 | 类名 | 说明与关键尺寸 |
| --- | --- | --- |
| 层容器 | `.layer` / `.layer-head` / `.layer-no` / `.layer-body` | 三层（音色 / 演绎 / 台词）的骨架，层内 `gap: 12px`。标题行 `gap: 9px`：`21px` 圆形序号 `.layer-no`（`--accent-dim` 底、`--accent` 字、等宽 `0.68rem / 700`）+ `0.86rem / 660` 标题 |
| 分段控件 | `.seg` / `.seg-thumb` | 轨道 `--surface-2` + `3px` 内边距；滑块绝对定位，宽度与位移由 JS 量取实际按钮位置后写入，`transition: transform, width var(--t)`。用于模型、输出格式、生成条数、标签分组；滑块目前只加在模型控件上，其余控件以 `aria-selected` 的底色变化表示选中 |
| 卡片 | `.card` | 通用容器：`--surface` + `1px --border` + `--r` + `15px` 内边距 |
| 音色卡 | `.voice-card` | 网格项 `minmax(158px, 1fr)`；选中态用 `--accent` 描边 + `--accent-veil` 底 + `inset 0 0 0 1px --accent-line`；右上角 `26px` 圆形试听按钮；试听中加 `.is-busy`（`breathe` 呼吸动画） |
| 音色库 | `.library` / `.library-head` / `.library-body` | ① 音色层的最后一段（`public/index.html` 里紧跟 `#voicePanel`），与上方音色网格之间用 `1px` 虚线 `--border` 分隔（`padding-top: 12px`），区块内纵向 `gap: 8px`。标题行 `.library-head` 是 `0.78rem / 600` 的「我的音色」＋右对齐计数 `.hint`（`0.72rem`、`margin-left: auto`）；主体 `.library-body` 纵向 `gap: 6px`，读取中、空态、读取失败都只占一行 `.note`（失败加 `.err`）。**音色库是服务端数据**（D1 `voices` + R2 `voice/<id>.*`），不占任何本地存储键 |
| 音色库卡片 | `.lib-card` / `.lib-main` / `.lib-title` / `.lib-name` / `.lib-kind` / `.lib-meta` / `.lib-actions` | 单行卡片：`--surface` 底 + `1px --border` + `--r-sm` + `8px 10px` 内边距，hover 转 `--border-strong` + `--surface-2`。`.lib-main` 占满余宽：标题行 `.lib-title`（`gap: 7px`）是 `0.82rem / 600` 的音色名 `.lib-name`（超长省略）＋ kind 角标 `.lib-kind`（`0.65rem / 550`、`1px 6px`、`4px` 圆角）；`.lib-meta`（`0.72rem`、`--ink-faint`、`tabular-nums`、单行省略）在克隆音色下显示时长 · 体积，在设计音色下显示描述的前 42 字。右侧 `.lib-actions`（`gap: 4px`）是两个 `.btn.tiny`：「应用」与 `.danger` 图标删除（带 `aria-label`）。**`.lib-kind` 的底色按 `data-kind` 区分**：`clone` 用 `--ok-dim` / `--ok`，`design` 用 `--accent-dim` / `--accent`，默认 `--surface-3` / `--ink-faint`——这是刻意的，因为两种音色的行为不同（克隆确定性复刻，设计每次重新生成），角标必须让人一眼看出存的是哪一种 |
| 拖放区 | `.drop` | 最小高度 `96px`，`1.5px` 虚线 `--border-strong`；拖拽或悬停转 `--accent`；已载入样本转 `.is-set`（实线 `--ok` + `--ok-dim`） |
| 样本卡 | `.sample` | `--surface-2` 底 + 内嵌 `30px` 高波形 canvas + 等宽时长/体积 |
| chip | `.chip` / `.chip-row` | `999px` 圆角、`--accent-dim` 底、右侧 `16px` 圆形移除按钮；出现时 `chip-in` 动画 |
| 药丸按钮 | `.pill-btn` | 最小高度 `28px`、虚线描边；激活 `.is-on` 转为实底 `--accent-dim`。用于整体风格、句内标签、唱歌、收藏筛选、音色设计示例 |
| 标签 pill | `.tag-pill` / `.tag-group` | 弹层内的可点标签；句内标签组用虚线描边区分于风格标签组 |
| 开关 | `.toggle` / `.toggle-row` | `38×22px` 圆角轨道，滑块 `16×16px`，`translateX(16px)` 表示开启；行最小高度 `30px` |
| 底部合成条 | `.dock` / `.synth` / `.status` / `.meter` | 主按钮高 `46px`、`--accent` 底，文字右侧跟一枚 `kbd` 快捷键提示（`⌘⏎` / `Ctrl⏎`）；合成中按钮内底部有 3px 进度条（`.fill`），并显示 `取消本次合成`；进度槽 `.meter` 高 `3px`，不确定态加 `.is-indeterminate` 用 `slide` 动画；状态行 `.status` 用 `is-ok` / `is-warn` / `is-err` 着色并配图标 |
| 编辑器 | `.editor` / `.hl` / `.editor-foot` / `.legend` | `textarea` 透明文字叠在高亮层上（同一套字体与行高）；`min-height: 190px`、`max-height: 46dvh`；三类高亮：`.tk-style`（`--accent-dim`）、`.tk-inline`（`--warn-dim`）、`.tk-sing`（`--ok-dim`），均 `4px` 圆角 + 底部 1px 内阴影；`focus-within` 时容器转 `--accent` 描边并加 `3px --accent-dim` 环。底部 `.editor-foot`（`gap: 10px`、可换行）左侧是 `.legend` 色彩图例（`0.71rem`、`9×9px` 圆角色块，色块跟随三类高亮），右侧是字数 / token 等宽元数据；唱歌色块只在支持唱歌的模型下出现 |
| 请求预览 | `.inspector` | 原生 `<details>`，摘要行 `12px 2px` 内边距、箭头 `90°` 旋转；内容为等宽 `<pre>`（`--surface-sunk`、最大高度 `320px`、`white-space: pre`） |
| 播放器 | `.player` / `.wave` / `.play-btn` / `.scrub` / `.rate` | 卡片式，入场 `rise`；波形区高 `60px` 可点击跳转；圆形播放键 `38px`（`--ink` 底，hover 转 `--accent`）；进度条 `.scrub` 高 `18px`、可视轨道 `4px`；倍速按钮 `0.75/1/1.25/1.5×`，选中态 `--accent-dim` |
| take 卡 | `.takes` / `.take` | 容器 `.takes` 纵向排列、`gap: 8px`；卡片单行：`#n` 序号（等宽 `0.7rem`）→ `28px` 波形 → 时长 · 体积（`≤ 1240px` 隐藏体积）；选中 `[data-active="1"]` 用 `--accent` 描边 + `--accent-veil` 底 |
| 历史行 | `.out-filters` / `.h-item` / `.h-star` / `.h-group` / `.load-more` | 输出栏顶部 `.out-filters` 是搜索框（`flex: 1`、`min-width: 120px`）+「收藏」药丸按钮；行高由内容决定，`1px` 分隔线，入场 `rise` 且按序 `20ms` 递增延迟（最多 12 项）；播放中左侧 `2px --accent` 竖条 + `--accent-veil` 底；操作按钮默认 `opacity: 0`，hover / `focus-within` / 播放中 / `hover: none` 时显示；收藏星标 `24px`；体积在 `≤ 1240px` 隐藏；同批分组标题 `.h-group` 右侧用 1px 线补齐 |
| 弹层 | `.sheet` / `.mask` | 标签选择器（也被音色命名对话框复用，见下一行）：头部固定，主体内滚动；遮罩 `--ink` 26% 混合，`is-open` 时接管指针事件 |
| 命名弹层 | `.prompt` | 复用标签弹层容器做的最小文本输入对话框（`public/js/main.js` 的 `ctx.promptText`）：换掉 `.sheet-head h2` 的标题、清空 `#tagSheetTabs` 页签区，在 `.tags-body`（`12px 16px 18px` 内边距）里放入 `.prompt`（纵向 `gap: 12px`）——一个单行输入（`maxlength: 60`，`aria-label` 取标题）＋ 一行 `.row.wrap` 的「保存」`.btn.primary` 与「取消」`.btn`。`Enter` 提交、空值等同于取消，打开后 40ms 聚焦输入框；关闭走 `ctx.closeTagSheet()`，所以遮罩点击与 `Esc` 一并生效。目前只有音色库保存时用它取名 |
| 抽屉 | `.drawer` | 设置面板，右侧滑入 `260ms`；内部 `.drawer-sec` 分节 `gap: 22px`，每节标题 `0.78rem / 650` |
| gate 页 | `.gate` / `.gate-card` | 全屏覆盖 `z-index: 160`，卡片 `min(560px, 100%)` + `--r-lg` + `--shadow-2`；三种内容：连不上服务端 / 服务端未配置令牌 / 需要输入令牌 |
| toast | `.toasts` / `.toast` | 堆叠于合成条上方，`999px` 胶囊、`--ink` 底；`is-ok` / `is-err` 分别为纯色底 + 近白文字；`role="status"`，3.2s 后淡出 |
| 空态 | `.empty` | 74×34 波形图标 + 标题，垂直内边距 `58px` |
| 键值表 / 代码块 / 徽标 | `.kv` / `.code` / `.badge` | 设置抽屉内使用：`.kv` 为两列右对齐数值表；`.code` 为等宽命令块；`.badge` 为 `999px` 小标（同步状态用它，`is-busy` 时圆点呼吸） |

图标：全部集中在 `public/js/icons.js`，24×24 网格、`stroke-width: 1.7`（个别 1.9 / 2）、`currentColor`、圆角端点；实体图标（播放、暂停、停止、实心星）用 `fill="currentColor"`。不引入图标字体或雪碧图。

## 动效规则

| Token | 值 | 用途 |
| --- | --- | --- |
| `--t-fast` | `120ms cubic-bezier(0.4, 0, 0.2, 1)` | 颜色、描边、悬停反馈 |
| `--t` | `180ms cubic-bezier(0.4, 0, 0.2, 1)` | 分段滑块、箭头旋转、淡出 |
| `--t-sheet` | `260ms cubic-bezier(0.32, 0.72, 0, 1)` | 抽屉与底部面板的位移 |
| `--t-pop` | `220ms cubic-bezier(0.34, 1.3, 0.5, 1)` | 浮层与 chip 的出现（轻微回弹） |

关键帧：`rise`（面板、播放器、历史行 6px 上移淡入）、`chip-in`（缩放进场）、`breathe`（进行中的圆点/试听按钮，1.4–1.5s 循环）、`slide`（不确定进度条，1.3s 循环）、`toast-in`（上移 + 缩放淡入）。

约定：

- 只动 `opacity` 与 `transform`。两个例外必须有明确理由：`.seg-thumb` 用 `width` + `transform`（滑块必须贴合按钮宽度），进度条 `.meter > i` 与 `.synth .fill` 用 `width`（进度需要线性对应）。
- 单次过渡不超过 `260ms`；不使用入场编排（除了历史行的 `20ms` 逐项延迟）。
- 循环动画只允许表达"进行中"（`breathe` / `slide` / `is-busy`），不得用于装饰。
- 状态变化不能只靠动画表达：合成状态同时更新文字与图标，进度同时有 `role="status"` 文案。
- 所有动效在 `prefers-reduced-motion: reduce` 下必须退化为瞬时状态（见下）。

## 无障碍契约

**focus 可见性**：全局 `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-xs) }`。输入类控件用 `:focus` 的 `border-color: var(--accent)` + `box-shadow: 0 0 0 3px var(--accent-dim)` 表达焦点，编辑器用 `.editor:focus-within` 的等效样式。不得在未提供等效可见焦点的情况下移除 outline。

**触屏目标**：主控件最小 `34px`（`.btn` `min-height: 34px`、`.icon-btn` `34×34`），合成按钮 `46px`，播放键 `38px`，开关轨道 `38×22`（行 `min-height: 30px`）。已知密集例外：chip 移除按钮 `16px`、收藏星标 `24px`、倍速按钮约 `22px`、行内小按钮 `.btn.tiny` `26px`。**新增控件不得低于 34px**，除非它整体位于一个不小于 34px 的可点区域内。

在 `@media (hover: none)` 下所有目标按手指放大，鼠标环境维持上面的基准值：`.icon-btn` `40×40`、`.btn` `min-height: 40px`、`.btn.tiny` 与 `.pill-btn` `34px`、`.tag-pill` `36px`（`8px 14px`）、音色卡试听键 `36×36`、收藏星标 `36px`、历史操作按钮 `36px`、倍速按钮 `34px`、chip 移除按钮 `22px`；历史行操作按钮不再等 hover，常显（`opacity: 1`）；顶栏 `--topbar-h` 提到 `58px`，编辑栏高度由该 token 推导，所以只能改 token，不能写局部高度。

**reduced motion**：`base.css` 在 `prefers-reduced-motion: reduce` 下把 `animation-duration` 与 `transition-duration` 压到 `0.01ms`、`animation-iteration-count` 设为 1，并把 `scroll-behavior` 改回 `auto`。因此逻辑不得依赖动画完成事件或过渡时长。

**语义与 ARIA 用法**

| 场景 | 约定 |
| --- | --- |
| 开关（流式、智能润色、自动分段、错误详情） | `role="switch"` + `aria-checked` + `tabindex="0"`，`Enter` / `空格` 切换 |
| 分段控件（模型、格式、条数、标签分组） | 容器 `role="tablist"` / `role="group"` + `aria-label`，按钮 `role="tab"` + `aria-selected` |
| 二态按钮（音色卡、收藏筛选、标签 pill、倍速、药丸按钮） | `aria-pressed` |
| 仅图标按钮 | 必须带 `aria-label`（试听、收藏、删除、关闭、播放/暂停、主题、设置），可再加 `title` |
| 状态播报 | 合成状态区 `role="status"`，toast 容器 `aria-live="polite"`，同步徽标 `role="status"` |
| 弹层与抽屉 | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`；遮罩点击与 `Esc` 均可关闭；打开时给 `body` 加 `.is-locked` 锁滚动 |
| 纯装饰元素 | 品牌与图标 SVG、波形 `canvas`、编辑器高亮层 `.hl` 一律 `aria-hidden="true"` |
| 分组容器 | 音色网格 `role="group"` + `aria-label="预置音色"`，倍速行 `role="group"` |
| 其余 | 页面 `lang="zh-CN"`；`.skip` 跳到主内容链接在获得焦点时从 `translateY(-160%)` 滑入；`<noscript>` 给出提示；`color-scheme` 由 meta 与 CSS 同时声明 |

**键盘**：`⌘/Ctrl + Enter` 合成、`Esc` 取消合成（进行中）与关闭浮层、`空格` 播放/暂停、`←/→` 前后 3 秒、`Shift + ←/→` 前后 10 秒。播放类快捷键在焦点位于 `INPUT` / `TEXTAREA` / `SELECT` 时必须让位（现有实现在输入框内直接返回 `false`），避免劫持输入。

**对比度**：正文用 `--ink`，次级文字用 `--ink-dim`；`--ink-faint` 只用于辅助信息。状态色只用于状态，不承载正文信息——任何用颜色表达的状态都必须同时有文字或图标。

## 品牌资产

标记「声峰 M」由三条描边构成：两条外柱（`stroke-width="56"`）与一条浑圆的波谷曲线（`stroke-width="38"`），`stroke-linecap/linejoin` 均为 `round`。画布 512×512，方形底圆角 `rx="116"`，底色为 `#f49120 → #eb5e00（52%） → #c5322b` 的对角渐变，笔触 `#fffdfb`。

| 文件 | 尺寸 | 用途 | 最小可用尺寸 |
| --- | --- | --- | --- |
| `public/brand/logo.svg` | 512×512 | 主标识（彩色底 + 白 M）：README、应用图标 | 40px |
| `public/brand/logo-mark.svg` | 512×512 | 单色标记，无底，`currentColor` | 20px |
| `public/brand/favicon.svg` | 256×256 | 标签页图标；描边按比例加重以适配 16px 光栅化 | 16px |
| `public/brand/logo-wordmark.svg` | 720×160 | 横向 lockup：标记 + 「MiMo TTS Studio」 | 宽度 180px |
| `public/brand/og.svg` | 1200×630 | 社交分享卡（深底 `#171310`、`#faf7f4` 文字） | 固定尺寸 |

- 应用内顶栏内联了与 `logo-mark.svg` 相同的三条路径（省一次请求，`24×24`，颜色取 `--accent`）；改几何时两处必须同步。
- `og.svg` 为 SVG；只接受位图 `og:image` 的平台需要自行导出 1200×630 PNG。
- 细节与用法示例见 [public/brand/README.md](public/brand/README.md)。

## 维护检查项

新增或修改界面时逐条对照：

1. 新颜色先进 `tokens.css`，并且浅色与深色两侧都补；不在组件里写裸色值（现有例外：品牌 SVG 内的品牌色与 `og.svg` 的卡面配色，以及 toast 成功/失败态的近白文字 `oklch(0.99 0 0)`）。
2. 新尺寸先看现有 token（圆角、阴影、间距、`--col` / `--out-w` / `--topbar-h`）；断点只允许 `1240 / 980 / 560 / 430`（`max-width`）与 `1500 / 1800`（`min-width`）这六档。
3. 字号复用阶梯，字重只用阶梯内的值（`500`–`680`，另有 `700` 仅给 `.layer-no`）；数字走等宽或 `tabular-nums`。
4. 动效时长用 `--t-*` token，且必须通过 `prefers-reduced-motion` 的退化路径。
5. 新控件的触屏目标 ≥ 34px，且具备可见焦点与 `aria-label`（若为纯图标）。
6. 新图标加进 `public/js/icons.js`（24 网格、`currentColor`、`1.7` 描边），不引外部图标资源。
7. 改动字段映射时，同步更新 `public/js/domain/payload.js`（唯一编译处）与其文件头注释、`README.md` 中的相关表格。
8. 浏览器本地只存三个键，改名视为破坏性变更：`mimo_tts_theme`（主题偏好，首屏前由 `public/js/theme.js` 读取，运行时由 `main.js` 读写）、`mimo_tts_token`（访问令牌，`public/js/core/api.js`）、`mimo_tts_config`（配置快照，`public/js/core/persist.js`）。克隆样本等会话级状态一律不入本地存储。
