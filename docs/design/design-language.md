# MangaManager 阅读器设计语言（Design Language）

> **设计核心**：界面是"隐形管家"——暗色毛玻璃材质承载极简叙事，所有控件轻柔浮现、任务完成后立即隐退，让读者完全沉浸于漫画世界。
>
> 版本：v1.0  
> 适用范围：MangaManager 前端全局，以阅读器为核心，延伸至书架/侧栏/弹窗等所有界面。

---

## 1. 色彩系统（Color System）

### 1.1 语义色板

| 令牌名 | 角色 | 色值 | 用途 |
|--------|------|------|------|
| `--canvas` | 沉浸画布色 | `#000000` 或 `#0a0a0a` | 阅读器全屏背景，消除与漫画黑边的界限 |
| `--surface` | 基底表面色 | `#16161a` | 书架、侧栏等基础页面背景，比画布稍浅 |
| `--surface-high` | 抬高表面 | `#1e1e24` | 卡片、面板微抬背景 |
| `--glass-bg` | 毛玻璃背景 | `rgba(22, 22, 26, 0.85)` | 浮层控件统一背景 |
| `--glass-border` | 毛玻璃边框 | `rgba(255, 255, 255, 0.06)` | 浮层微光边缘 |
| `--glass-highlight` | 毛玻璃内高光 | `rgba(255, 255, 255, 0.04)` | 层级分隔的微弱亮部内阴影 |
| `--text-primary` | 文本主色 | `#c8c4cc` | 正文/标题，暖灰偏冷，长时阅读舒适 |
| `--text-secondary` | 文本辅色 | `#8b8594` | 次要信息、标签、描述 |
| `--text-muted` | 文本隐色 | `#5a5461` | 不可用状态、极次要信息 |
| `--accent` | 叙事点缀色 | `#8b7aa0`（檀紫） | 进度条、当前项标记，全站出现频次 < 0.5% |
| `--accent-bg` | 点缀色背景 | `rgba(139, 122, 160, 0.12)` | 点缀色对应背景 |
| `--accent-border` | 点缀色边框 | `rgba(139, 122, 160, 0.35)` | 焦点/选中边框 |
| `--divider` | 分割线 | `rgba(255, 255, 255, 0.06)` | 极细分割线，低透明度 |
| `--error` | 错误/警示 | `#b06060` | 低饱和度暗红，不使用荧光红 |
| `--success` | 成功绿 | `#6b8b6b` | 静默状态确认 |

> **替代叙事色**：`#6b8a8a`（静川青）可作为檀紫的替代方案，适合偏冷调偏好的用户。

### 1.2 色彩使用铁律

- **杜绝高饱和度、荧光色**出现在阅读界面 500px 半径内
- 叙事点缀色仅用于：进度条填充、当前页码高亮、选中态图标
- 黑色画布区域不允许出现任何彩色光晕/辉光效果
- 所有文本/图标色彩对比度 ≥ 4.5:1（WCAG AA）

---

## 2. 材质与光影（Material & Lighting）

### 2.1 核心材质：暗色毛玻璃（Dark Frosted Glass）

所有浮层控件（侧栏、工具栏、菜单、面板、弹窗）必须使用统一材质：

```css
background: rgba(22, 22, 26, 0.85);
backdrop-filter: blur(20px) saturate(1.2);
-webkit-backdrop-filter: blur(20px) saturate(1.2);
border: 1px solid rgba(255, 255, 255, 0.06);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
```

### 2.2 层级表现规则

| 层级 | 材质 | 光影规则 |
|------|------|----------|
| 画布层（Canvas） | 纯黑 `#000` / `--canvas` | 无任何光影 |
| 基底（Surface） | 实体深色 `#16161a` | 无外投影 |
| 微抬浮层（Overlay） | 暗色毛玻璃 | 仅内阴影微光边缘，禁用外投影 |
| 常驻底栏（Bottom Bar） | 实体深色 `#16161a` 或透明 `rgba(0,0,0,0.9)` | 顶部极细分割线 |

### 2.3 光影视则

- **禁用传统外投影**（box-shadow 外扩阴影）
- 层级区分手段：**向内凹陷的微光边缘**（`inset 0 1px 0 rgba(255,255,255,0.04)`）
- 悬浮态（hover）以亮度微提 4-8% 实现，不加阴影
- 聚焦态（focus-visible）用 `0 0 0 2px var(--accent-border)` 环

---

## 3. 字体排版（Typography）

### 3.1 字体家族

```css
--font-sans: 'Inter', 'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Consolas', ui-monospace, monospace;
```

### 3.2 字号阶梯（Type Scale）

| 令牌 | 字号 | 行高 | 字重 | 用途 |
|------|------|------|------|------|
| `--text-xs` | `11px` | `1.5` | Regular | 极辅助信息、徽标 |
| `--text-sm` | `12px` | `1.5` | Regular | 次要标签、时间戳 |
| `--text-base` | `14px` | `1.6` | Regular | 正文 |
| `--text-md` | `16px` | `1.5` | SemiBold 600 | 卡片标题、条目名 |
| `--text-lg` | `18px` | `1.4` | SemiBold 600 | 面板标题、区域标题 |
| `--text-xl` | `22px` | `1.3` | Bold 700 | 页面大标题（极少使用） |
| `--text-2xl` | `28px` | `1.2` | Bold 700 | 页面主标题（极少使用） |

### 3.3 排版纪律

- **层级感**：通过字重（Regular → SemiBold → Bold）和细微灰度差区分，避免夸张字差
- **整体字号偏小**：全局基准 `14px`，把视觉面积让给漫画内容
- **字号增幅克制**：相邻字号比 ≤ 1.3x
- **阅读器内文字**：统一 `12px`，仅页码可到 `13px SemiBold`

---

## 4. 空间与形状（Space & Shape）

### 4.1 圆角系统

| 令牌 | 半径 | 用途 |
|------|------|------|
| `--radius-sm` | `4px` | 小按钮、标签、输入框、内联元素 |
| `--radius-md` | `6px` | 卡片、面板、下拉菜单 |
| `--radius-lg` | `8px` | 弹窗、侧栏 |
| `--radius-full` | `9999px` | 圆形按钮（极少使用） |

### 4.2 间距阶梯（Spacing Scale）

基于 4px 网格系统：

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--space-1` | `4px` | 紧凑内边距、图标与文本间距 |
| `--space-2` | `8px` | 列表项内部间距、按钮内边距 |
| `--space-3` | `12px` | 组件内部段落间距 |
| `--space-4` | `16px` | 卡片内边距、组件间标准间距 |
| `--space-5` | `20px` | 面板内边距 |
| `--space-6` | `24px` | 区域分隔 |
| `--space-8` | `32px` | 大块留白、页面 section 间距 |
| `--space-10` | `40px` | 页面级分隔 |
| `--space-12` | `48px` | 极端留白（极少使用） |

### 4.3 空间法则

- **密不透风，疏可走马**：列表项内部紧凑（`--space-1` / `--space-2`），列表组之间大块留白（`--space-6` / `--space-8`）
- 页面最大内容宽度：`1280px`（书架），阅读器无边栏全宽
- 侧栏宽度：`280px`（收起 0）

### 4.4 图标规范

- **风格**：线性图标（Outline/Stroke），不使用实心图标
- **描边粗细**：`1.75px`（统一偏细）
- **尺寸**：16px（内联）、20px（按钮标准）、24px（导航）
- **色彩**：继承 `--text-secondary`，激活态 `--text-primary`

---

## 5. 动效系统（Motion）

### 5.1 时长

| 类型 | 时长 | 用途 |
|------|------|------|
| 瞬时 | `100ms` | hover 状态切换、焦点环 |
| 快速 | `150ms` | 浮层关闭/隐藏 |
| 标准 | `200ms` | 浮层打开、切换过渡、fade |
| 舒缓 | `250ms` | 面板入场、较大元素出现 |

### 5.2 缓动曲线

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* 缓出：温和稳定停止，无弹性 */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);   /* 标准缓动 */
--ease-enter: cubic-bezier(0, 0, 0.2, 1);        /* 入场专用 */
--ease-exit: cubic-bezier(0.4, 0, 1, 1);         /* 离场专用 */
```

### 5.3 动效叙事

- **入场**：控件从边缘极短距离淡入滑动（从下方上浮 4px，或从侧边平移 8px）
- **离场**：仅淡出（`opacity 0 → 1`），无任何位移
- **呼吸感**：像呼吸一样自然——控件出现悄无声息，消失不留痕迹
- **阅读器 UI 显隐**：鼠标静止 3 秒后 fade out（`opacity: 0` + `pointer-events: none`），鼠标移动后瞬间 fade in（100ms）
- **页面切换**：阅读器翻页使用 `200ms ease-out` 的交叉淡入淡出或轻微滑动

### 5.4 动效禁用

- 尊重 `prefers-reduced-motion: reduce`，所有动效时长降为 `0ms`，仅保留 opacity 过渡

---

## 6. 组件蓝图（Component Blueprints）

### 6.1 阅读器根布局

```
┌──────────────────────────────────────────────┐
│ 透明热区（左翻页）    │ 透明热区（右翻页）    │
│                       │                      │
│         漫画图片区域（--canvas 背景）         │
│                       │                      │
│                       │                      │
├──────────────────────────────────────────────┤
│ 顶栏：毛玻璃，40px 高，自动隐藏              │
│ ← 返回 | GID 标题 | ▲▼导航 | 页码 · ?帮助   │
├──────────────────────────────────────────────┤
│ 底栏：实体深色背景，44px 高，分割线分隔      │
│ [进度条 100%]                                │
│ ◀ | 页码 | 模式选择 | 缩放 | 过渡 | ▶       │
└──────────────────────────────────────────────┘
```

### 6.2 各组件规格

| 组件 | 材质 | 尺寸 | 圆角 | 显隐行为 |
|------|------|------|------|----------|
| 顶栏（reader-topbar） | 毛玻璃 `--glass-bg` | 高 44px，全宽 | 0 | 3s 无操作 fade out |
| 底栏（reader-bottombar） | 实体 `--surface` | 高 48px，全宽 | 0 | 3s 无操作 fade out |
| 进度条轨道 | `rgba(255,255,255,0.08)` | 高 3px，全宽 | `--radius-full` | 常驻底栏内 |
| 进度条填充 | `--accent` | 高 3px | `--radius-full` | — |
| 帮助面板 | 毛玻璃 `--glass-bg` | 自适应 | `--radius-lg` | 按键触发/点击关闭/4s 自动消失 |
| 幻灯片面板 | 毛玻璃 `--glass-bg` | 自适应 | `--radius-md` | 随顶栏一起显隐 |
| 按钮（reader-btn） | 透明 + hover 微提亮 | 28×28px | `--radius-sm` | 随容器 |
| 选择框（reader-select） | 透明 bg + `--glass-border` | 自适应 | `--radius-sm` | 随容器 |
| 范围滑块 | 透明轨道 + `--accent` | 60px 宽，高 4px | — | 随容器 |
| Toast 提示 | `rgba(0,0,0,0.85)` | 自适应 | `--radius-md` | 1.5s 自动消失 |
| 透明热区（翻页） | 完全透明 | 各占 30% 宽度，全高 | — | 始终可交互 |

### 6.3 书架/侧栏组件

| 组件 | 材质 | 尺寸 | 圆角 | 备注 |
|------|------|------|------|------|
| 页面背景 | `--surface` | 全屏 | — | — |
| 侧栏 | `--surface-high` | 宽 280px | 0 | 极细右边线 |
| 画廊卡片 | `--surface-high` | 自适应 | `--radius-md` | hover 微提亮 4% |
| 侧栏项 | 透明 | 全宽 280px | `--radius-sm` | 选中态 `--accent-bg` |
| 搜索框 | `--surface` + 1px border | 全宽 | `--radius-md` | focus 环 `--accent-border` |
| 弹窗/模态框 | 毛玻璃 `--glass-bg` | 最大 520px 宽 | `--radius-lg` | 居中 |

---

## 7. 可访问性（Accessibility）

### 7.1 色彩对比度
- 所有 `--text-primary` 在 `--surface` 上对比度 ≥ 4.5:1
- `--text-secondary` 在 `--surface` 上对比度 ≥ 3:1（大文本可接受）
- 焦点环与背景对比度 ≥ 3:1

### 7.2 键盘导航
- 所有交互元素可 Tab 到达
- `focus-visible` 环统一为 `0 0 0 2px var(--accent-border)`，偏移 2px
- 阅读器快捷键不变（←→↑↓ Space F M Esc ? H）

### 7.3 动效偏好
- 使用 `prefers-reduced-motion: reduce` 的用户获得零时长体验

### 7.4 触摸/移动端
- 热区最小触控面积 44×44px
- 移动端阅读器默认隐藏所有 UI，点击中心区域唤出

---

## 8. CSS 令牌清单（Token Summary）

完整的 CSS 自定义属性应定义在 `:root` 下，作为全局设计令牌源。详见 `src/frontend/manga-ui/src/tokens.css`。

```css
/* 颜色 */
--canvas, --surface, --surface-high, --glass-bg, --glass-border, --glass-highlight,
--text-primary, --text-secondary, --text-muted, --accent, --accent-bg, --accent-border,
--divider, --error, --success

/* 字体 */
--font-sans, --font-mono, --text-xs, --text-sm, --text-base, --text-md, --text-lg, --text-xl, --text-2xl

/* 间距 */
--space-1~12, --radius-sm, --radius-md, --radius-lg, --radius-full

/* 动效 */
--ease-out, --ease-standard, --ease-enter, --ease-exit
--duration-instant, --duration-fast, --duration-normal, --duration-slow

/* hover / 滚动条 */
--hover-brighten: brightness(1.06), --hover-bg: rgba(255,255,255,0.05)
--scrollbar-width: 6px, --scrollbar-thumb, --scrollbar-thumb-hover

/* 布局 */
--sidebar-width: 280px, --content-max-width: 1280px, --header-height: 48px
```

---

> 本设计语言是 MangaManager 前端所有视觉决策的唯一真理来源。任何组件样式偏离此文档的值均视为 bug。