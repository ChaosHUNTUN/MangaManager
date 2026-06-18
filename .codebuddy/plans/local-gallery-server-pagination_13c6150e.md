---
name: local-gallery-server-pagination
overview: 将本地画廊从"全量加载+客户端筛选/排序/分页"改为服务端三步分页加载，大幅减少瞬时数据量，并优化阅读器跨作品预加载。
todos:
  - id: backend-new-endpoints
    content: 后端：新增三个分页端点（count / paged / details）到 LocalGalleryController 和 LocalGalleryService
    status: completed
  - id: frontend-api-functions
    content: 前端 api.js：新增对应三个端点的 API 函数（fetchGalleryCount、fetchPagedGids、fetchGalleryDetailsBatch）
    status: completed
    dependencies:
      - backend-new-endpoints
  - id: gallery-step1-count
    content: 前端 LocalGallery.jsx：实现第一步（筛选变化时获取总数+渲染骨架屏+缓存分页元信息）
    status: completed
    dependencies:
      - frontend-api-functions
  - id: gallery-step2-gids
    content: 前端 LocalGallery.jsx：实现第二步（获取当前页GID列表）和第三步（渐进加载作品详情并渲染）
    status: completed
    dependencies:
      - gallery-step1-count
  - id: gallery-pagination-only
    content: 前端 LocalGallery.jsx：翻页时从第二步开始执行，复用已缓存的分页元信息
    status: completed
    dependencies:
      - gallery-step2-gids
  - id: reader-gallery-nav
    content: 前端 ReaderLocal.jsx：改造画廊间导航，基于分页GID列表，边界时自动请求相邻分页
    status: completed
    dependencies:
      - frontend-api-functions
  - id: reader-preload
    content: 前端 ReaderLocal.jsx：实现图片预加载窗口策略（当前页±2页范围，超出范围持续向后加载）
    status: completed
    dependencies:
      - reader-gallery-nav
---

## 用户需求

将本地画廊从"一次性全量加载+客户端分页"改造为"服务端三步分页加载"，大幅减少瞬时数据量。同时优化阅读器的画廊间导航与图片预加载策略。

### 核心功能

**画廊页三步加载流程**

1. **第一步**（筛选变化时触发）：调用后端获取当前筛选条件下的作品总数和总页数，在页面上建立空白占位骨架方块，缓存分页元信息（总页数、总作品数）
2. **第二步**：根据当前页码和分页大小，调用后端获取当前页需要显示的 GID 列表
3. **第三步**：根据 GID 列表，逐个轮询获取每个作品的详细信息（封面、标题、专辑分配、页数、评分、文件大小），渐进式渲染到页面

**触发规则**

- 筛选条件变化（切换专辑、修改搜索词、改变排序、改变每页数量）→ 从第一步重新执行
- 仅翻页（上一页/下一页/跳转到指定页）→ 从第二步开始执行（分页元信息已缓存）
- 第三步的作品详情按需渐进加载

**阅读器模式增强**

- 作品间导航（上一部/下一部）使用当前分页的 GID 列表
- GID 列表耗尽时（到达分页边界），自动用当前分页数 ±1 请求相邻分页的 GID 列表
- 图片预加载：默认加载当前页码 ±2 页的图片信息，用户翻页时优先保持当前页 ±2 页范围内的图片已加载，超出范围则持续向后加载

## 技术栈

- 后端：ASP.NET Core 9 (C#) + LocalGalleryService + LocalGalleryController
- 前端：React 19 + React Router 7 (useSearchParams)
- 数据：文件系统扫描 + .meta.json 元数据

## 实现方案

### 总体策略

将原来一次性 `GET /api/local/galleries` 返回全量数据的方式，拆分为三个独立的后端端点，对应前端三步加载。筛选和排序逻辑从客户端移至服务端，减轻前端内存压力。

### 后端新增接口

#### 1. `GET /api/local/galleries/count` — 第一步：获取筛选结果总数

- 参数：`group`(专辑分组), `search`(搜索词), `sort`(排序字段)
- 返回：`{ total, totalPages }`
- 实现：在 `LocalGalleryService` 中新增 `GetFilteredCountAsync(group, search, sort)` 方法，扫描全部目录后应用筛选条件（专辑过滤、搜索匹配、排序），返回数量

#### 2. `GET /api/local/galleries/paged` — 第二步：获取当前页 GID 列表

- 参数：`group`, `search`, `sort`, `page`, `pageSize`
- 返回：`{ items: [{ gid, title, fileCount, totalSize, category, language, lastModified, artists, groups, rating }], total, page, pageSize, totalPages }`
- 实现：在 `LocalGalleryService` 中新增 `GetPagedGalleriesAsync(...)` 方法，扫描+筛选+排序后取分页切片，返回摘要信息（不含封面文件路径）

#### 3. `POST /api/local/galleries/details` — 第三步：批量获取作品详情

- 参数：`{ gids: int[] }`
- 返回：`{ items: LocalGalleryDetail[] }`
- 实现：复用现有 `GetDetailAsync(gid)` 逻辑，批量处理

### 前端改造要点

**LocalGallery.jsx 核心变更**

- 移除 `galleries` 全量 state，改为 `pageMeta`（总页数/总数缓存）、`pageGids`（当前页 GID 列表）、`galleryDetails`（已加载的作品详情 Map）
- 筛选条件变化时，调用 `fetchGalleryCount` → 渲染骨架屏 → 调用 `fetchPagedGids` → 逐个调用 `fetchLocalGalleryDetail`
- 翻页时，直接调用 `fetchPagedGids` → 渐进加载详情
- 骨架屏复用现有 loading 动画样式（`skeleton-pulse`）

**ReaderLocal.jsx 核心变更**

- 不再依赖 sessionStorage 的全量列表，改为基于当前筛选上下文动态请求
- 画廊列表从全量数组改为"当前分页 GID 列表 + 可动态扩展的相邻分页"
- 导航到边界时自动请求相邻分页的 GID 列表
- 图片预加载窗口：当前页 ±2 页范围，使用 `fetchLocalGalleryPagesAbortable` 加载

### 向后兼容

- 保留原 `GET /api/local/galleries` 端点（标记为 deprecated），旧版前端仍可使用
- 阅读器仍支持 sessionStorage 传入列表作为 fallback

## 实现细节

### 性能考量

- `ScanLocalGalleries()` 每次扫描全部目录（I/O 密集），新增接口复用它作为数据源，筛选/排序在内存中完成
- 第三步批量接口 `POST details` 可一次请求多个 gid，减少 HTTP 往返
- 封面图片仍通过 `GET /api/local/gallery/{gid}/cover` 按需加载（浏览器缓存生效）

### 筛选逻辑迁移

当前客户端筛选逻辑（LocalGallery.jsx 第473-598行 `filtered` useMemo）需要迁移到服务端：

- 专辑分组过滤（activeGroup 解析）
- 搜索词匹配（支持 `artist:xxx`、`group:xxx`、中文标签翻译搜索）
- 排序（modified/ title/ pages/ size 的 asc/desc）

标签翻译缓存（`searchTagTransMap`）需在服务端可访问，或前端先翻译再传参。

### 阅读器预加载策略

- 维护 `preloadWindow` 状态：`{ centerPage: number, range: 2 }`
- 当前作品切换时，更新 centerPage，预加载 `[centerPage-range, centerPage+range]` 范围内的作品图片
- 使用 AbortController 取消超出窗口的旧请求

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 在实施过程中深入探索前端画廊页和阅读器页的完整代码结构、状态管理细节、组件依赖关系
- Expected outcome: 准确识别所有需要修改的状态变量、useEffect 依赖、useMemo 逻辑，确保重构不遗漏任何调用点