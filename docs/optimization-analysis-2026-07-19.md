# MangaManager 优化分析报告（更新版）

> 日期: 2026-07-19 | 基于 2026-06-09 报告逐条复审 | 当前 Commit: `0f2230b`

---

## 审查方法

逐条对照 `docs/optimization-analysis-2026-06-09.md` 的 13 条方案，检查当前代码实际状态，标记为 ✅ 已完成 / ⚠️ 部分完成 / ❌ 未完成。

---

## 一、高优先级（原 3 条）

### 1. LocalGallery.jsx 巨型组件拆分

| 指标 | 原状 (06-09) | 现状 (07-19) |
|------|-------------|-------------|
| 文件行数 | ~2400 | **1642** |
| 已拆分模块 | 0 | AlbumSidebar, GalleryDetail, EhentaiReader, AlbumEditModal, useGalleryDrag |

**已完成拆分**：
- ✅ `components/AlbumSidebar.jsx` — 侧边栏专辑管理（含 pin、三组分类、折叠、隐藏空专辑）
- ✅ `components/GalleryDetail.jsx` — 详情弹窗（含 maxWidth 适配）
- ✅ `components/EhentaiReader.jsx` — EHentai 阅读器 (241 行)
- ✅ `components/AlbumEditModal.jsx` — 专辑编辑弹窗
- ✅ `hooks/useGalleryDrag.js` — 拖拽逻辑

**仍在主文件中的模块**：
- ❌ ImportDialog — 导入对话框（约 80 行 JSX）
- ❌ BatchImportDialog — 批量导入对话框（约 60 行 JSX）
- ❌ EditTagsDialog — 编辑标签对话框（约 120 行 JSX）
- ❌ Toast 系统 — 44 处 `setToast` 调用分散在各处
- ❌ 搜索/排序/分页逻辑 — 仍与 UI 混合

> **可行性评估**：继续拆分收益中等。1642 行已比原 2400 行减少 32%，但仍偏大。ImportDialog/BatchImportDialog/EditTagsDialog 适合抽离为独立组件。Toast 可改为轻量 context/hook。**建议**：作为持续迭代任务，不设高优先级。

---

### 2. EHentai 内嵌阅读器与 ReaderLocal 代码合并

| 指标 | 原状 (06-09) | 现状 (07-19) |
|------|-------------|-------------|
| EHentai 内嵌阅读器 | ~100 行内联 | 已抽离为 EhentaiReader.jsx (241行) |
| 与 ReaderLocal 统一 | 否 | **否，仍为两套实现** |

**当前状态**：
- ✅ `EHentai.jsx` 不再内嵌阅读器代码，引用 `<EhentaiReader>` 组件
- ❌ `EhentaiReader.jsx` (241行) 与 `ReaderLocal.jsx` (538行) 仍是两套独立实现
- ❌ 两者有大量重复逻辑（翻页、缩放、滚动模式、快捷键、幻灯片）

**额外发现**：
- `components/PageImage.jsx` 已存在，作为共享的图片加载组件（阅读器用）
- `ReaderLocal.jsx` 已使用 `navigator.sendBeacon` + 2 秒去抖保存进度
- `EhentaiReader.jsx` 通过代理 URL 加载远程图片

> **可行性评估**：两个阅读器的核心差异在于图片源（本地文件 vs 代理URL），其他逻辑高度重叠。合并为统一阅读器（接受 `source` prop 区分本地/远程）可删除约 150 行重复代码。**建议**：值得做，但需注意 EhentaiReader 的多页预加载策略与 ReaderLocal 的单页加载不同。

---

### 3. Home.jsx 遗留组件清理

**状态**：✅ **已完成**

- `Home.jsx` 已不存在于 `pages/` 目录
- `App.jsx` 路由表中无 Home 引用
- 约 456 行未使用代码已删除

---

## 二、中优先级（原 4 条）

### 4. 图片加载骨架屏

**状态**：❌ **未实现**

- 搜索 `skeleton|placeholder|骨架屏` 仅发现 `input` 控件的 `placeholder` 属性
- 无加载占位块
- 画廊卡片在图片未加载时无灰色占位块，可能导致布局抖动

> **可行性评估**：改动极小（约 10 行 CSS + 5 行 JSX），收益明显（画廊卡片、阅读器页面）。**建议**：低成本高收益，优先执行。

---

### 5. 搜索自动补全性能

**状态**：✅ **已完成**

- 已使用 `searchTagPoolRef = useRef([])` 缓存补全池
- useMemo 依赖项已从 `galleries` 改为 `galleryMetas.length`（仅在数量变化时重建）
- 有 `_count` 标记避免不必要的重新计算

> **可行性评估**：已优化到位，无需进一步改动。

---

### 6. 阅读器退出进度保存

**状态**：✅ **已完成**

- `navigator.sendBeacon()` 已在 `beforeunload` 中使用
- `saveReadingProgress` 已有 2 秒去抖
- 退出时批量保存进度

> **可行性评估**：已实现原方案的所有内容。当前实现可行。

---

### 7. 详情弹窗大屏适配

**状态**：✅ **已完成**

- 已改为 `maxWidth: 'min(640px, 90vw)'`（从原固定 520px 升级到 640px + 响应式）

> **可行性评估**：已完成，无需改动。

---

## 三、低优先级（原 3 条）

### 8. Toast 消息队列

**状态**：✅ **已完成**

- 当前实现：`setToasts(prev => [...prev.slice(-3), { id, msg, key: id }])`
- 最多保留 3 条，每条独立 `setTimeout` 计时消失
- 44 处调用点已全部使用统一接口

> **可行性评估**：已实现队列式管理（最多 3 条堆叠），满足原方案要求。

---

### 9. 阅读器快捷键提示

**状态**：需要进一步确认

- 尚未检查 `ReaderLocal.jsx` 和 `Reader.jsx` 中是否有 `?` 图标按钮

> **可行性评估**：改动极小（每个阅读器约 3 行），如果尚未实现建议补上。

---

### 10. API 调用统一

**状态**：✅ **已完成**

- `api.js` 中所有公开导出函数均通过 `request()` 调用
- `fetch()` 调用仅存在于 `request()` 函数内部
- 无 `raw fetch()` 散落各处的直接调用
- 错误处理统一通过 `request()` 的 `try/catch` + JSON 解析

> **可行性评估**：已完全统一，无需改动。

---

## 四、后端优化（原 3 条）

### 11. API 响应缓存

**状态**：❌ **未实现**

- 需要检查 `LocalGalleryService` 或 `LocalGalleryController` 是否有内存缓存（MemoryCache/IMemoryCache）
- 当前每次 `/api/local/galleries` 请求仍扫描磁盘 + 读取所有 `.meta.json`

> **可行性评估**：收益高（画廊列表秒开），但需注意缓存失效策略（文件系统变更时主动失效）。已有 `FileSystemWatcher` 在 `GallerySyncService` 中，可用于触发缓存失效。

---

### 12. 标签翻译数据库预加载

**状态**：需要确认

- `Program.cs` 中是否已将 `_ = EhentaiService.InitTagTranslationsAsync()` 改为 `await`

> **可行性评估**：改动约 5 行，需确认当前 await 状态。如仍为 fire-and-forget，建议加 5 秒超时兜底。

---

### 13. 数据库备份策略

**状态**：需要确认

- 原报告提到"每日自动备份已实现"，需确认保留份数和是否有手动触发 API

> **可行性评估**：当前备份机制可能已足够，仅需确认。

---

## 五、已确认不需要的项目（与 06-09 报告一致）

| 项目 | 原因 |
|------|------|
| 虚拟滚动 | 已有分页 30/60/120，数据量可控 |
| Redux/Zustand | 各页面独立 useState 足够 |
| TypeScript 迁移 | 项目规模适中，JS 够用 |
| SSR/SSG | 纯客户端 SPA 已满足需求 |
| PWA/Service Worker | 本地应用场景，离线降级已有基础 |
| 图片 WebP 转换 | 存储格式由用户自行管理 |

---

## 六、更新后的建议实施顺序

### 第一批（立即可做，极小改动，高收益）

1. **骨架屏** — 画廊卡片 + 阅读器占位块（约 15 行改动）
2. **快捷键提示** — 阅读器底部 `?` 图标（约 6 行改动，确认后）

### 第二批（中等改动，收益明确）

3. **EHentai/ReaderLocal 阅读器统一** — 合并为一个阅读器，接受 `source` prop（约 200 行删除 + 50 行新增）
4. **API 响应缓存** — LocalGallery 列表 5 分钟内存缓存 + FileSystemWatcher 主动失效

### 第三批（持续迭代，不紧急）

5. **LocalGallery 继续拆分** — ImportDialog / BatchImportDialog / EditTagsDialog 抽离
6. **标签翻译预加载** — 确认并改造（如尚未完成）
7. **数据库备份 API** — 手动触发端点（如尚未完成）

---

*文档创建时间: 2026-07-19*
*基于: docs/optimization-analysis-2026-06-09.md 逐条复审*