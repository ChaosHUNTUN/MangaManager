# MangaManager 全面优化分析报告

> 日期: 2026-06-09 | 范围: 全项目审计 | 原则: 不复杂化用户操作，信息密度合理

---

## 执行摘要

项目整体架构清晰，三层分离（React / ASP.NET Core / WPF），功能完备。已完成的优化（docs/next-phase-optimization.md 第一批+第二批）解决了最紧迫的问题。以下是从**用户视角**出发，按收益排序的剩余优化建议。

---

## 一、高优先级（用户明显可感知，改动适中）

### 1. LocalGallery.jsx 巨型组件拆分 (92KB, ~2400行)

**现状**: 一个文件包含: 画廊列表、分组、搜索、排序、分页、专辑管理、拖拽、导入导出、元数据修复、详情弹窗、标签编辑、Toast系统。几乎无法维护。

**优化方案**: 拆为独立模块，用户无感知:
```
LocalGallery.jsx (主容器 ~400行)
├── components/gallery/GalleryGrid.jsx      # 网格/列表视图
├── components/gallery/GalleryCard.jsx      # 单张卡片
├── components/gallery/GalleryDetail.jsx    # 详情弹窗（当前内联 ~200行 JSX）
├── components/gallery/AlbumSidebar.jsx     # 侧边栏专辑管理
├── components/gallery/EditTagsDialog.jsx   # 编辑标签对话框
├── components/gallery/ImportDialog.jsx     # 导入对话框
├── components/gallery/BatchImportDialog.jsx # 批量导入对话框
├── hooks/useGalleryState.js               # 画廊核心状态逻辑
├── hooks/useGalleryDrag.js                # 拖拽逻辑
└── hooks/useSearchSuggestions.js          # 搜索补全逻辑
```

**收益**: 可维护性提升巨大，后续迭代不碰雷。不影响任何用户操作。

### 2. EHentai 内嵌阅读器与 ReaderLocal 代码合并

**现状**: 
- `EHentai.jsx` 第374-469行有独立的阅读器实现（`readerPages`, `readerIndex`, `ehFitMode`, `ehScrollRef`, 键盘快捷键...）
- `ReaderLocal.jsx` (538行) 是另一个独立阅读器
- 两者有大量重复逻辑（翻页/滚动模式、缩放、幻灯片、快捷键）

**优化方案**: 
- EHentai 的"在线阅读"按钮直接跳转到 `/reader-local/:gid`（已有该路由）
- 如果本地无文件，`ReaderLocal` 可接收一个 `fallbackMode` prop，用代理URL加载远程图片
- 删除 EHentai.jsx 内嵌的 ~100 行阅读器代码

**收益**: 删除约 200 行重复代码，阅读体验统一（用户不会感到两套阅读器行为不一致）。

### 3. Home.jsx 遗留组件清理

**现状**: `Home.jsx` (456行) 实现了漫画库主页（扫描目录、标签筛选、批量操作），但路由 `/` 指向的是 `LocalGallery.jsx`，`Home.jsx` 完全未被使用。

**验证**: App.jsx 的路由表确认无 `Home` 引用。

**优化方案**: 删除 `Home.jsx`，或将其作为 `/manga` 路由的备选页面（如果需要保留扫描入库功能入口）。

**收益**: 减少混淆，释放 456 行未使用代码。

---

## 二、中优先级（体验打磨，改动较小）

### 4. 图片加载骨架屏 (FE-UI-1)

**现状**: 图片加载时显示旋转 spinner（`reader-page-loading`），在 LocalGallery 的网格卡片中无占位。

**优化方案**: 
- 画廊卡片: 封面加载时显示灰色占位块 + 标题（已有标题数据），避免布局抖动
- 阅读器: spinner 保留即可，效果已经不错

**改动**: 约 10 行 CSS + 5 行 JSX 条件渲染

### 5. 搜索自动补全性能 (FE-LOGIC-7)

**现状**: `searchTagPool` useMemo 依赖整个 `galleries` 数组，任何画廊数据变化都重建补全池。

**优化方案**: 用 `useRef` 缓存补全池，仅在 galleries 长度变化时重建（因为标签名不会动态变化）。补全搜索用 Web Worker 或至少用 `requestIdleCallback` 包装。

**改动**: `LocalGallery.jsx` 约 15 行修改

### 6. 阅读器退出进度保存 (FE-LOGIC-5)

**现状**: `progressRef` 在组件卸载时可能丢失数据，`beforeunload` 不可靠。

**优化方案**: 
- 每次翻页立即保存当前页进度（而非退出时批量保存）
- 使用 `navigator.sendBeacon()` 确保关闭时也能发送
- 对同一 gid 的多次保存做 2 秒去抖

**改动**: `ReaderLocal.jsx` 约 20 行

### 7. 详情弹窗大屏适配 (FE-UI-5)

**现状**: 详情弹窗 `maxWidth: 520` 固定，大屏上显小。

**优化方案**: 改为 `maxWidth: min(520px, 90vw)` 或响应式断点 `@media (min-width: 1200px) { maxWidth: 640 }`。

**改动**: 1 行 CSS

---

## 三、低优先级（锦上添花，改动小）

### 8. Toast 消息队列 (FE-UI-6)

**现状**: `setToast` 只保留最近 2 条，快速操作时旧 toast 被覆盖。

**优化方案**: 改为队列式，每条独立计时消失，垂直堆叠最多 3 条。

**改动**: `LocalGallery.jsx` 的 `setToast` 函数约 10 行

### 9. 阅读器快捷键提示 (FE-UI-7)

**现状**: 按 `?`/`H` 显示帮助面板，但新用户不知道这个快捷键。

**优化方案**: 首次进入阅读器时，底部栏显示一个小 `?` 图标按钮，hover 提示"快捷键"。

**改动**: `Reader.jsx` / `ReaderLocal.jsx` 各 3 行

### 10. request() 与 raw fetch() 统一 (FE-API-1)

**现状**: `api.js` 中 `request()` 函数和部分 `fetch()` 直接调用混用，错误处理不一致。

**优化方案**: 所有 API 调用统一走 `request()`，移除 `fetchMangaList`、`fetchAlbumConfig` 等中的直接 `fetch()`。

**改动**: `api.js` 约 10 行

---

## 四、后端优化（用户间接感知）

### 11. API 响应缓存

**现状**: `/api/local/galleries` 每次请求都扫描磁盘 + 读取所有 `.meta.json`。画廊数量多时可能慢。

**优化方案**: 
- 内存缓存（5 分钟 TTL），文件系统修改时（下载完成/删除）主动失效
- 或在 `ScanLocalGalleries` 结果上加 `ETag`，前端用 `If-None-Match` 请求

**收益**: 画廊列表页面秒开（用户切换回标签页时尤其明显）

### 12. 标签翻译数据库预加载

**现状**: `InitTagTranslationsAsync()` 是 fire-and-forget，首次搜索时翻译数据库可能未就绪。

**优化方案**: 在 `Program.cs` 启动时 await 等待翻译数据库下载完成（带 5 秒超时兜底）。

**改动**: `Program.cs` 约 5 行

### 13. 数据库备份策略 (DB-3)

**现状**: 每日自动备份已实现（Program.cs 中），但仅保留 7 个。

**优化方案**: 当前已足够。可考虑添加手动触发备份的 API 端点（`POST /api/db/backup`），方便升级前备份。

---

## 五、不需要优化的项目（避免过度工程化）

| 项目 | 原因 |
|------|------|
| 虚拟滚动 | 已有分页 30/60/120，数据量在可控范围，引入虚拟滚动复杂度 > 收益 |
| Redux/Zustand 状态管理 | 当前各页面独立 useState 足够清晰，全局状态需求少 |
| TypeScript 迁移 | 项目规模适中，JS 够用。TS 迁移成本高且用户无感知 |
| SSR/SSG | 纯客户端 SPA 已满足需求 |
| 微前端 | 杀鸡用牛刀 |
| PWA/Service Worker | 本地应用场景，离线降级已有基础 |
| 图片 WebP 转换 | 存储格式由用户自行管理，不应擅自修改 |
| 拖拽视觉反馈的"空位指示" | 当前拖到侧边栏专辑标签的逻辑已可用，精细化的"插入位置指示"实现复杂且容易出 bug |

---

## 建议实施顺序

1. **第一批（1-2天）**: 代码清理 — 删除 Home.jsx、合并 EHentai 阅读器、拆分 LocalGallery
2. **第二批（1天）**: 体验打磨 — 骨架屏、弹窗适配、Toast队列、快捷键提示
3. **第三批（1天）**: 可靠性 — 阅读进度保存加固、API统一、搜索补全优化
4. **第四批（1-2天）**: 后端 — 响应缓存、翻译预加载

总计约 4-6 天工作量，用户可在每一步完成后立即感知改进。
