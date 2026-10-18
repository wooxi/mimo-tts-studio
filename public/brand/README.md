# 品牌资产

MiMo TTS Studio 的标识文件。全部为纯 SVG，不依赖外部字体文件（文字使用系统字体栈），可直接通过 `<img>`、README 或 `<link rel="icon">` 引用。

## 标记构成

「声峰 M」：字母 M 的外柱厚重、内谷是一条浑圆的波谷曲线，而不是尖角。三条描边定义全部几何——两条外柱（`stroke-width="56"`）与一条谷线（`stroke-width="38"`），统一 `stroke-linecap="round"`、`stroke-linejoin="round"`，画布 512×512，方形底色圆角 `rx="116"`。

品牌色阶（与界面 token 同一色相，十六进制为对外交付值）：

| 位置 | 色值 |
| --- | --- |
| 渐变起点（高光橙） | `#f49120` |
| 渐变中点 52% | `#eb5e00` |
| 渐变终点（深橙红） | `#c5322b` |
| 标记笔触（底色之上） | `#fffdfb` |
| 社交卡底色 | `#171310` |

## 文件

| 文件 | 画布 | 用途 | 最小可用尺寸 | 备注 |
| --- | --- | --- | --- | --- |
| `logo.svg` | 512×512 | 主标识：圆角方形彩色底 + 白色 M。用于 README 顶部、应用图标、需要独立色块的场合 | 40px | 渐变 `id="mimo"`；自带 `<title>` 与 `role="img"` |
| `logo-mark.svg` | 512×512 | 单色标记，无底色，笔触为 `currentColor` | 20px | 放在深/浅背景上时由外层 `color` 决定颜色；不要给它加底色 |
| `favicon.svg` | 256×256 | 浏览器标签页图标。描边比例比主标识更重，保证 16px 光栅化后仍成形 | 16px | 由 `public/index.html` 的 `<link rel="icon">` 引用 |
| `logo-wordmark.svg` | 720×160 | 横向 lockup：左侧标记 + 右侧文字「MiMo TTS Studio」 | 宽度 180px | 整体继承 `currentColor`；宽度低于 180px 时文字不足 14.5px，请改用 `logo-mark.svg` |
| `og.svg` | 1200×630 | 社交分享卡（深底 + 标识 + 中英说明 + 技术栈） | 固定 1200×630 | 由 `og:image` 引用。多数平台只接受位图，发布前需导出同尺寸 PNG |

`brand/drafts/` 目录不属于发布资产：它是 `scripts/gen-logos.mjs`（`npm run brand`）生成的三个候选方案（`a` 声峰 M、`b` 采样窗、`c` 由文生声）、各自的单色版，以及对比用的 `contact-sheet.html`。当前采用 `a` 案。

## 用法

```html
<!-- 顶栏、脚注等单色场合：颜色由 CSS 决定 -->
<img src="/brand/logo-mark.svg" width="24" height="24" alt="MiMo TTS Studio" style="color:#eb5e00">

<!-- 横向 lockup：彩色版给 color，深色底给浅色 -->
<img src="/brand/logo-wordmark.svg" width="180" alt="MiMo TTS Studio" style="color:#eb5e00">

<!-- 需要独立色块时用主标识 -->
<img src="/brand/logo.svg" width="88" alt="MiMo TTS Studio">
```

```markdown
<img src="public/brand/logo.svg" width="88" alt="MiMo TTS Studio">
```

## 约定

- 不放宽高比、不改渐变角度、不替换笔触端点样式；需要新尺寸时整体缩放。
- 标记周围至少留出标记高度 1/4 的空白，不要在锁定区域内叠加文字或描边。
- 底色之上只用 `#fffdfb`，不要用纯白；深色底上文字色用 `#faf7f4`。
- 应用内顶栏目前内联了与 `logo-mark.svg` 相同的三条路径（避免额外请求）；改几何时两处需同步。

MiMo 及相关名称、标识归其各自所有者所有；本仓库的品牌资产仅用于标识这个开源项目本身。
