# 后端二期优化规划

> 日期: 2026-07-19 | 基于全量代码审查 + 一期完成项 | Commit: `0f2230b`

---

## 一期已完成 ✅

| 项目 | 来源 |
|------|------|
| `Console.WriteLine` → `ILogger<T>` (53 处，7 个文件) | P0 代码质量 |
| 删除 3 个 `Class1.cs` 占位文件 | P0 代码清理 |
| EhentaiService 部分拆分 → `EhentaiModels.cs` + `EhentaiFileHelper.cs` + `EhentaiTagService.cs` | P1 架构 |
| SQLite WAL 模式 | DB-2 |
| EF Core Migrations 系统 | DB-1 |
| 每日自动备份 (7 份) | DB-3 |

---

## 二期待办清单（按优先级分组）

### 🔴 第一批：生命周期规范 (P0 — 1d)

| # | 项目 | 说明 | 改动范围 |
|---|------|------|----------|
| BE-1 | Singleton → Scoped 修正 | `LocalGalleryService`、`DownloadManager` 当前为 Singleton 但依赖 Scoped DbContext，手动 `CreateScope()` 有泄漏风险。改为 Scoped 或在 `Program.cs` 中显式管理 scope 生命周期。 | Program.cs + 2 Service |
| BE-2 | 2 处 `new HttpClient` 统一 | `EhentaiController.cs` 行 205 验证 Cookie + `EhentaiTagService.cs` `InitTagTranslationsAsync` 下载翻译 DB。统一走 `IHttpClientFactory`。 | 2 个文件，~5 行 |

---

### 🟡 第二批：架构完善 (P1 — 2d)

| # | 项目 | 说明 | 改动范围 |
|---|------|------|----------|
| BE-3 | EhentaiService 继续拆分 | 当前 1488 行仍偏大，继续拆出 `EhentaiHtmlParser.cs`（HTML 解析纯函数 ~280 行）和 `EhentaiBlockedTagService.cs`（标签屏蔽 ~139 行）。完成后 EhentaiService 降至 ~460 行。 | 新建 2 个文件 + 更新引用 |
| BE-4 | DTO 统一管理 | `BatchTagController`、`LocalGalleryController`、`EhentaiController`、`AlbumsController` 内均嵌有 Request DTO（`record`），移至 `DTOs.cs` 或按模块文件的 `Models/` 目录。 | 6 个 Controller 文件 |
| BE-5 | API 响应缓存 | `GET /api/local/galleries` 每次扫描磁盘 + 读取所有 `.meta.json`。加内存缓存（5min TTL）+ `FileSystemWatcher` 主动失效。已有 `GallerySyncService` 可监听变更事件。 | `LocalGalleryService` (50 行) |
| BE-6 | GallerySyncService 同步锁 | 启动全量扫描 + FileSystemWatcher 期间无状态标记。加 `_isSyncing` 标记 + 读请求返回 "同步中" 提示而非半成品数据。 | GallerySyncService + LocalGalleryController (20 行) |

---

### 🟢 第三批：代码清理 (P2 — 1d)

| # | 项目 | 说明 | 改动范围 |
|---|------|------|----------|
| BE-7 | MangaService 评估废弃 | `MangaService`（616 行）处理传统漫画扫描，当前路由 `/manga` 未被 `App.jsx` 引用。确认是否完全废弃后删除或归档。 | 3 个 Controller + 1 Service |
| BE-8 | API 路径规范化 | 当前 `/api/local`、`/api/ehentai`、`/api/albums` 无版本前缀。加 `/api/v1/` 前缀，旧路径保留 301 重定向。 | Program.cs (10 行 MapGroup) |
| BE-9 | 标签翻译预加载 await | `Program.cs` 中 `InitTagTranslationsAsync` 已通过 `EhentaiTagService` 调用，但仍为 `_ = Task.Run(...)`。改为 `await` + 5s 超时兜底。 | Program.cs (3 行) |
| BE-10 | 手动备份 API 端点 | 已有每日自动备份，加 `POST /api/admin/backup` 手动触发端点（升级前备份）。 | Program.cs (10 行) |

---

### 🔵 远期：基础设施 (P3 — 不定)

| # | 项目 | 说明 |
|---|------|------|
| BE-11 | 单元测试覆盖 | 零测试。优先覆盖 `EhentaiTagService`（纯函数易测）+ `EhentaiHtmlParser`（正则匹配需回归测试）。`xUnit` + `Moq`。 |
| BE-12 | Docker 化 | 添加 `Dockerfile` + `docker-compose.yml`（后端 + SQLite volume 挂载） |
| BE-13 | OpenAPI/Swagger 文档 | 当前无 Swagger 页面，利用 `Microsoft.AspNetCore.OpenApi` 生成 |

---

## 工作量估算

| 批次 | 项目数 | 预计工期 | 风险 |
|------|--------|----------|------|
| 第一批 | 2 | 1 天 | 低（纯重构，无功能变更） |
| 第二批 | 4 | 2 天 | 中（EhentaiService 拆分需谨慎引用的完整性） |
| 第三批 | 4 | 1 天 | 低（清理/规范化） |
| 远期 | 3 | 不定 | 低 |
| **合计** | **13** | **~4 天** | — |

---

## 与前端二期的关系

前端二期项目（见 `optimization-analysis-2026-07-19.md` 第六部分）包含骨架屏、阅读器统一、API 缓存等。其中 **BE-5 (API 响应缓存)** 对前端性能改善最大——画廊列表页从 2-3 秒降至 <100ms。建议与前端二期同步执行。

---

*文档创建时间: 2026-07-19*
*一期参考: docs/optimization-analysis-2026-06-09.md + docs/optimization-analysis-2026-07-19.md*