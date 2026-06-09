# MangaManager 阅读器功能文档

> 最后更新：2026-06-07

---

## 一、阅读器入口

| 路由 | 组件 | 用途 |
|------|------|------|
| `/reader/:id` | `Reader.jsx` | 本地漫画阅读器（从扫描目录） |
| `/reader-local/:gid` | `ReaderLocal.jsx` | E-Hentai 本地画廊阅读器 |
| EHentai 内嵌 | `EHentai.jsx` 行 431+ | E-Hentai 在线预览（本地文件/代理远程） |

---

## 二、阅读模式

### 翻页模式 (Paged)
- 每次显示单页图片
- 支持左右翻页热区（点击屏幕左侧/右侧 22% 区域）
- 支持键盘方向键翻页
- 支持触摸左右滑动翻页

### 滚动模式 (Scroll)
- 所有页面自然流式排列在一个大容器中
- 支持上下滚动浏览
- 懒加载：仅渲染当前可见区域 ±3 页的图片
- 未加载页面显示占位符（`min-height: 95vh`）
- 图片加载后自然撑开实际高度（fit-width 下不受固定高度限制）

---

## 三、缩放模式

| 模式 | 效果 | 适用场景 |
|------|------|---------|
| 适应宽度 | `width: N%`, 高度等比例自适应 | 横向阅读长条漫画 |
| 适应高度 | `height: 100vh`, 宽度等比例自适应 | 竖向阅读宽幅漫画 |
| 适应页面 | `max-width/max-height: N%`, 等比缩放不超出容器 | 常规阅读 |
| 原始大小 | 不做任何缩放，超出容器可滚动查看 | 查看高清细节 |

**可调百分比**：适应宽度/高度/页面模式下，通过底栏滑块调节 20%~100%（步长 5%），图片居中显示。

**即时刷新**：切换模式后通过 `requestAnimationFrame` + `resize` 事件强制重排。

---

## 四、翻页效果

| 效果 | 动画 |
|------|------|
| 淡入淡出 | CSS `opacity` 动画，0.3s |
| 滑动 | CSS `translateX` 动画，0.35s，同时渲染前/当前/后三页 |
| 无效果 | 直接切换 |

---

## 五、幻灯片（自动播放）

| 模式 | 实现 | 控制 |
|------|------|------|
| 翻页模式 | `setInterval` 定时翻页 | 间隔 1~30 秒 |
| 滚动模式 | `requestAnimationFrame` 平滑滚动 | 速度 50~600 px/s |

- 循环模式：到末尾后回到开头
- 鼠标悬停暂停（`isHovering`）
- 面板动态切换：翻页模式显示"⏱ 间隔"，滚动模式显示"🚀 速度"

---

## 六、阅读方向

| 方向 | 说明 |
|------|------|
| 右→左 (RTL) | 日漫风格，右侧为上一页 |
| 左→右 (LTR) | 西式风格，左侧为上一页 |

---

## 七、快捷键

| 快捷键 | 功能 | 适用组件 |
|--------|------|---------|
| `←` / `A` | 上一页 | Reader / ReaderLocal |
| `→` / `D` | 下一页 | Reader / ReaderLocal |
| `↑` / `↓` | 上/下一部画廊 | ReaderLocal |
| `空格` | 开关幻灯片 | Reader / ReaderLocal |
| `F` | 循环切换缩放模式 | Reader / ReaderLocal |
| `M` | 切换翻页/滚动模式 | Reader / ReaderLocal |
| `T` | 开关缩略图面板 | Reader |
| `?` / `H` | 开关快捷键帮助 | Reader / ReaderLocal |
| `Esc` | 返回（先关缩略图，再退出） | Reader / ReaderLocal |

> 键盘事件自动忽略 INPUT/SELECT/TEXTAREA 中的按键，防止表单控件误触发。

---

## 八、快捷键帮助面板

- 按 `?` 或 `H` 弹出半透明毛玻璃面板
- 显示所有快捷键速查表
- 点击空白处关闭 / 再次按 `?` 关闭 / 4 秒后自动消失

---

## 九、沉浸模式

- 3 秒无操作自动隐藏顶部栏和底部控制栏
- 鼠标移动 / 触摸恢复显示
- 幻灯片播放时不自动隐藏

---

## 十、缩略图导航（Reader 专用）

- 按 `T` 键开关
- 5 列网格显示所有页面缩略图
- 当前页高亮边框
- 点击缩略图直接跳转

---

## 十一、图片预加载

- 翻页模式：预加载当前页 ±2 页
- 滚动模式：懒加载可见范围 ±3 页
- 使用 `new Image()` 浏览器原生预加载

---

## 十二、设置持久化

### 持久化的设置项

| 设置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fitMode` | string | `fit-width` | 缩放模式 |
| `fitPercent` | int | 100 | 缩放百分比 |
| `direction` | string | `rtl` | 阅读方向 |
| `transition` | string | `fade` | 翻页效果 |
| `readMode` | string | `paged` | 阅读模式 |
| `slideInterval` | int | 3 | 幻灯片间隔（秒） |
| `scrollSpeed` | int | 200 | 幻灯片滚动速度（px/s） |
| `loopMode` | bool | false | 幻灯片循环 |

### 架构

```
数据库 (SQLite reader_settings 表，单行 Id=1)
    ↕ GET/PUT /api/settings/reader
useReaderSettings hook (前端模块级缓存)
    ↕ settings, updateSetting
Reader.jsx / ReaderLocal.jsx
```

### 同步时机
- **修改时**：立即更新模块缓存（dirty 标记）
- **退出时**：组件卸载 → `flush()` → 同步到数据库
- **关闭时**：`beforeunload` 事件 → 同步到数据库
- **启动时**：首次调用从数据库加载 → 存入模块缓存（整个页面生命周期只加载一次）

---

## 十三、移动端适配

- 触摸左右滑动翻页（滑动距离 > 40px）
- 触摸上下滑动切换 UI 显示/隐藏（滑动距离 > 50px）
- 响应式 CSS：≤768px 时缩略图 4 列、按钮缩小、滚动页 `min-height: 100vh`

---

## 十四、组件架构

```
Reader.jsx / ReaderLocal.jsx
├── PageImage (子组件)
│   ├── 翻页模式 → .reader-page-slot (position:absolute)
│   └── 滚动模式 → .reader-page-slot-scroll (自然文档流)
├── useReaderSettings (hook)
│   ├── fetchReaderSettings() → GET /api/settings/reader
│   └── saveReaderSettings() → PUT /api/settings/reader
└── useLazyImage (hook)
    └── new Image() 预加载 + loaded/error 状态
```

---

## 十五、后端 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/settings/reader` | 获取阅读器设置 |
| PUT | `/api/settings/reader` | 保存阅读器设置 |
| GET | `/api/reader/manga/{id}/pages` | 获取漫画页面列表 |
| GET | `/api/reader/manga/{id}/page/{idx}` | 获取单页图片 |
| GET | `/api/local/gallery/{gid}/pages` | 本地画廊页面列表 |
| GET | `/api/local/gallery/{gid}/page/{idx}` | 本地画廊单页图片 |
| GET | `/api/ehentai/image?url=...` | E-Hentai 图片代理 |
