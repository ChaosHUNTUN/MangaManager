# MangaManager 项目知识库

> 用途：后续会话 / 新接手任务时**先读本文档**，即可恢复项目全貌。细节内容通过链接跳转。
> 最后更新：2026-09-10（含阅读器交互模型、桌面控制台重构、移动端适配、全量标签化管理 P0–P4、标签内自定义顺序）

---

## 1. 项目定位

本地优先的 E-Hentai 漫画下载 / 管理 / 阅读工具：在线搜索下载、本地画廊管理（专辑 + 排序 + 标签）、网页阅读器、桌面下载监控。

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/ChaosHUNTUN/MangaManager.git` |
| 分支 | `main`（单分支开发；另有遗留 `master` 远端引用、`ai/dev-isolation` 本地分支） |
| 后端 | ASP.NET Core 9 Web API（.NET SDK 10.0.200），端口 **5208** |
| 前端 | React 19 + Vite 8 + Ant Design，端口 **5173**，纯 JSX（无 TypeScript） |
| 桌面 | WPF `MangaManager.Console`（服务启停 + 下载监控 + 托盘） |
| 数据库 | SQLite（WAL，默认）/ MySQL（可选），EF Core 9 + Migrations |
| 其他入口 | 根目录 `manga_manager.py`（Python 控制台）+ `启动管理工具.bat` |

## 2. 目录结构（当前实际）

```
MangaManager/
├── NuGet.Config                # 清空继承的 fallbackPackageFolders（修复本机残留的 D:\Coder\Share\NuGetPackages）
├── README.md                   # 项目说明 + API 列表
├── .clinerules                 # 全局开发规范（最高指示，改核心架构后必须同步）
├── 启动管理工具.bat            # 一体化启动（Python 控制台拉起 API + 前端）
├── manga_manager.py            # Python 控制台入口（托盘）
├── src/
│   ├── backend/                # .NET 解决方案（MangaManager.slnx）
│   │   ├── MangaManager.Api/       # Web API 入口（Program.cs 启动流程）+ 15 个控制器
│   │   ├── MangaManager.Core/      # 实体（Entities/LocalEntities/DTOs/DownloadTask）
│   │   ├── MangaManager.Data/      # MangaDbContext + Migrations
│   │   └── MangaManager.Services/  # 业务服务（下载/EH/本地画廊/同步/标签）
│   ├── frontend/
│   │   └── manga-ui/               # React SPA（src/pages、src/components、src/hooks、src/api、src/visual-test）
│   └── desktop/
│       └── MangaManager.Console/   # WPF 控制台
├── docs/                       # 设计文档 / 交接 / 知识库（见 §8 索引）
├── scripts/                    # Python 辅助脚本 + devops（deploy/publish/test_api）
└── data/                       # api-data（manga.db 副本）、downloads（占位）
```

关键数据位置（不在 git）：
- 画廊图片：`G:\学习资料\本子\`（约 2498 个目录）
- SQLite DB：`src/backend/MangaManager.Api/manga.db`（WAL：连同 `-shm`/`-wal` 一起备份）
- EH Cookie：`src/backend/MangaManager.Api/ehentai_cookies.json`（gitignored）
- 开发配置：`appsettings.Development.json`（含下载目录，gitignored）

## 3. 后端架构

### 启动流程（Program.cs）
1. CORS（本地前端端口）→ 2. 数据库双模式注册（SQLite/MySQL）→ 3. 服务注册
   （`MangaService` Scoped；`LocalGalleryService` / `DownloadManager` Singleton；`GallerySyncService` HostedService）
4. E-Hentai 命名 HttpClient（CookieContainer + 代理）→ 5. 全局异常中间件 → 6. SPA fallback
7. EF 自动迁移 + Baseline 检测 → 8. SQLite WAL → 9. 每日自动备份（保留 7 份）
10. 标签翻译异步初始化 → 11. DownloadManager 恢复未完成任务

### 核心服务
| 服务 | 职责 |
|---|---|
| `LocalGalleryService` | 本地画廊：DB 为元数据索引、文件系统为图片源；页面文件列表 10s 缓存；负数 gid 防腐层映射 |
| `GallerySyncService` | 后台同步：启动全量扫描 → FileSystemWatcher 增量 → 每 5 分钟一致性检查，维护 `local_gallery` 表 |
| `EhentaiService` | EH 搜索/详情/下载；`EhentaiAuthService`（Cookie）、`EhentaiBlockedTagService`（屏蔽标签）、`EhentaiTagService`（翻译） |
| `DownloadManager` | 下载任务状态机（pending→downloading→paused/completed/failed）、断点续传、SSE 推送、取消（CTS） |
| `MangaService` | 旧版漫画扫描/CRUD/重命名（`as-local-gallery` 防腐层） |

### 数据库实体（约 12 个 DbSet）
`local_gallery`（gid 主键，元数据 JSON 字段）、`local_reading_progress`（Gid 唯一索引）、`album_config`（含 Order/KeyTag）、
`download_task`、`manga` + `tag` + `author`（多对多）、`reading_progress`、`reader_settings`、`scan_log`。

### 控制器与 API 概览
| 控制器 | 路由前缀 | 要点 |
|---|---|---|
| LocalGalleryController | `/api/local` | 画廊列表/分页/随机/分组、详情、**页面列表、单页图片、封面**、导入、重下载、meta-tags、repair-metadata(SSE) |
| ReadingProgressController | `/api/readingprogress` | GET 单条 / POST 批量 upsert（**并发冲突自动重试一次**） |
| SettingsController | `/api/settings/reader`、`/api/settings/app` | 阅读器设置 JSON 快照读写（`ReaderSettings.Data` 列；localStorage 快速路径 + 后端持久化双轨）；**运行时设置**（库目录/代理）读写 + `POST /api/settings/app/rescan` 追加式重扫 |
| ReaderController | `/api/reader/manga/{id}/...` | 旧版漫画阅读（防腐层之外的旧链路） |
| MangaController | `/api/manga` | 扫描/CRUD/批量标签/`{id}/as-local-gallery` |
| TagController / MangaTagController / BatchTagController | `/api/tag*` | 标签 CRUD/分类/批量 |
| AlbumsController | `/api/albums` | 专辑 CRUD/重命名/摘要 |
| DownloadController | `/api/download` | 任务 CRUD + SSE 事件流 |
| EhentaiController / EhLocalController / EhTagsController | `/api/ehentai` | 在线搜索/详情/图片代理/Cookie/翻译/屏蔽 |
| FilesystemController | `/api/filesystem` | 驱动器/目录浏览 |
| CoverController | `/api/cover/{id}` | 旧版封面 |

统一响应：`ApiResponse<T>{ success, data, message }`；全局异常 500 → JSON + CORS。

## 4. 本地阅读模式（重点，近期改动集中地）

### 入口与数据链路
| 路由 | 说明 |
|---|---|
| `/reader-local/:gid` | 统一阅读器（唯一生产入口） |
| `/reader/:id` | 防腐层：`GET /api/manga/{id}/as-local-gallery` → 负数虚拟 gid → 重定向 |

| 接口 | 用途 | 后端逻辑 |
|---|---|---|
| `GET /api/local/gallery/{gid}` | 标题/详情 | 优先读 `.meta.json`，fileCount 缺失回退文件系统枚举 |
| `GET /api/local/gallery/{gid}/pages` | 页面 URL 列表 | 枚举图片文件（**OrdinalIgnoreCase 排序**）+ 10s 缓存 |
| `GET /api/local/gallery/{gid}/page/{i}` | 单页图片 | PhysicalFile + 1 天 Cache-Control |
| `GET /api/local/gallery/{gid}/cover` | 封面 | 从 DB CoverFile 读取 |
| `GET/POST /api/readingprogress` | 进度读写 | upsert；POST 支持批量 + 唯一索引冲突重试 |
| `POST /api/local/galleries/gids` | 跨作品导航 gid 列表 | 复用书架同一套筛选/排序 |

### 交互模型（已定型，详见 [reader-interaction-model.md](reader-interaction-model.md)）
- **正交模型**：模式 `mode`（paged/scroll）× 方向 `direction`（vertical/horizontal）
- **交叉轴导航**：主轴键 = 阅读主操作；交叉轴键 = 上一部/下一部
  - 纵向：`↑↓` 翻页/滚动，`←→` 切作品；横向反之；`PgUp/PgDn` 全模式别名
  - 放大平移时交叉轴键让位（有溢出先平移）
- **手势按轴分流**：paged 主轴滑动翻页、交叉轴滑动切作品；纵向翻页热区为上/下 30%
- **自动阅读**：空格播放/暂停；翻页间隔 1–60s（滑块）；滚动速度 20–1600px/s（滑块）；`[`/`]` 微调；滚动模式手动操作立即暂停
- **进度模型**：paged 存页码；scroll 存页码 + **页内偏移（0~1，`ScrollOffset` 列）**；paged↔scroll 切换以当前页为锚
- **作品边界**：工具栏按钮置灰 + 键盘边界提示（"已是第一部"等）

### 前端阅读器关键组件
| 文件 | 职责 |
|---|---|
| `src/pages/ReaderLocal.jsx` | 组装页：数据加载、进度恢复/保存、键盘映射、画廊导航、UI 显隐 |
| `src/visual-test/reader/useReaderEngine.js` | 状态机（currentPage/direction/flow/fit/zoom/背景/边距/幻灯片）+ localStorage 持久化 + `getImageLayout`（零扭曲布局） |
| `.../PaginatedView.jsx` | 翻页视图：fit/zoom 布局、溢出滚动、点击热区、轴感知滑动 |
| `.../ContinuousView.jsx` | 滚动视图：固定尺寸帧、滚动页码跟踪、外部跳页、拖拽、懒加载 |
| `.../ReaderToolbar.jsx` | 顶部 HUD + 底部栏（进度条/作品导航/方向/模式/缩放/自动阅读/背景/边距） |
| `.../gestureUtils.js` | 滑动检测（返回 `{action, axis}`，轴锁定） |
| `src/hooks/useImagePreload.js` | ±50 页半径预加载（批次 3，正向优先） |

### 近期行为要点（修复后）
- 底部栏出现：**交互感知自动隐藏**（4s 续期）+ 鼠标移到底部/顶部唤醒 + 点画面中间切换；进度条**两种模式都显示**
- 进度恢复：`initialProgress` 携带 gid，**只有匹配当前作品才恢复**；恢复完成前禁止一切保存（防串进度）
- 进度保存：翻页后 2s 防抖 + 退出 sendBeacon；越界进度钳制到 `[0, totalPages-1]`
- 跨作品导航上下文：`reader-local-full-gids`（完整列表）> `reader-local-context`（当前页），返回书架保留 `reader-local-return-url`

## 5. 近期修复与变更记录（2026-08-25 ~ 09-01）

### 2026-09-01 变更总结（知识点，按模块）

**A. 标签化系统**
- **标签筛选**：后端 `tagIds` 从 OR 改 **AND（联合筛选=命中全部）**；`artist:/group:` 分组与搜索前缀改 **work_tag JOIN**（修复多作者只匹配数组首元素、JSON 格式依赖）；移除遗留 `AlbumKey==null` 门控（专辑废弃后漏作品）；`tag-stats` 只统计正 Gid（侧边栏计数与筛选一致）
- **带空格标签**：搜索支持**引号分词**（`tag:"big breasts"`）与下划线兼容（`tag:big_breasts`）；前端补全插入自动加引号
- **标签库管理**：`POST /api/tag/merge` 合并标签（搬移 work_tag/manga_tag、继承 NameCn/IsBlocked、删源）；`TagLibraryModal`（改名/中文/颜色/分类/合并/删除）；`TagPicker` 补全最近使用/搜索高亮/分类均衡；**批量标签** `POST/DELETE /api/work/batch/tags` + `BatchTagModal`
- **⚠️ 核心 bug：`tag.Id` 冲突导致新作品不入库**——`SyncGalleryTagsAsync` 用 `db.WorkTags.Add(new WorkTag { Tag = t })` 导航写法，**EF 的 Add 级联把整张关系图标记为 Added**，已存在标签（真实 Id）被当成新增重复 INSERT → 同步回滚 → 作品不进 local_gallery（磁盘有目录但库表无记录）。修复：**已存在标签（Id≠0）改用 `TagId = t.Id` 引用，新标签保持导航 Added**。全扫恢复 2728→2808 画廊、work_tag 47802→49279
- **NameCn 回填**：误用 `AsNoTracking()` 导致改值不落库 → 去掉后 3052 条真实落库
- **新作品链路验证**：下载完成 meta.json → `SyncDirectoryAsync` → `EnsureTagsCoreAsync`（自动建标签+翻译）→ work_tag 先清后建，全通（今日 76 个已完成任务全部入库）
- **标签内自定义顺序（连载顺序）**：新增 `tag_order` 表（TagId 主键、Gids=JSON int 数组）+ 迁移 `AddTagOrder`；`GET/PUT /api/tag/{id}/order` 读取/保存；**单标签 + `sort=custom`** 时 `GetPagedGalleries`/`GetGalleryGids` 按 tag_order 排列（未列入数组的 gid 排末尾）；tag-stats 增加 `HasOrder`（标签云显示 `▤`）；前端单标签视图工具栏「自定义顺序」按钮 + dnd-kit 拖拽重排 + 「清除顺序」回退规则排序。**保存采用合并式**：拖拽后先取完整 gid 列表（POST /local/galleries/gids, sort=custom），只替换当前页块，其余页顺序保留，避免跨页覆盖
  - **拖拽冲突修复**：标签顺序模式必须禁用旧 `useGalleryDrag` 自定义拖拽（只留 dnd-kit），否则两套 mousedown/pointer 拖拽同时运行导致排序失效；单选标签且该标签已有顺序时 `handleToggleTag` 自动带 `sort=custom`（无需再手动点按钮）；清空顺序改为**删除 tag_order 记录**（空数组行会让 hasOrder 恒为 true）；**拖拽可用性原则=仅"单选标签+sort=custom"（或专辑开启时的专辑排序），其余视图一律不可拖**——旧专辑拖拽整体受 `FEATURES.enableAlbums` 门控

**B. 下载管理**
- **⚠️ 已完成任务重启后消失**：`LoadTasksFromDb` 只加载非 completed，2740 条历史完成记录不载入 → 修复为**加载最近 100 条已完成** + 排序活跃在前/完成按 CompletedAt 倒序 + web/控制台新增「已完成」筛选
- **⚠️ DownloadMonitor 超时杀死轮询**：`catch (OperationCanceledException) { break; }` 把 HTTP 超时（TaskCanceledException 是其子类）当取消信号，API 重启/慢响应后监控线程永久退出、列表恒空 → 修复 `catch when (ct.IsCancellationRequested)`，超时按瞬时失败退避+留痕
- 批量暂停/恢复（`pause-all`/`resume-all`）+ 下载页默认展开 + 桌面入口 + 任务行百分比/ETA/失败页/队列位

**C. 桌面控制台**
- **⚠️ 退出 Mutex 双重释放崩溃**：`Exit_Click` 与 `OnExit` 各释放一次 → 记录所有权 `_appMutexOwned` + `ReleaseAppMutex()` 安全释放
- `DownloadMonitor` 失败留痕（首次/每6次），防“列表静默为空”无法诊断

**D. 在线模块**
- **⚠️ 连通性误报**：`/api/ehentai/connectivity` 原用裸 HttpClient 直连（不走代理）→ 代理环境必 false → 红色“无法访问”横幅常驻。修复：`CheckConnectivityAsync` 复用共享 ehentai 客户端（代理+Cookie）
- 卡片评分右侧「汉语」徽标（解析搜索行 `language:` 标签，**零额外请求**）
- `useEHSearch` TDZ bug：组合结束处理器引用后声明的 `handleSearchInput` → 声明顺序修复

**E. 搜索框自动补全**
- 修复“输入时下拉不出现”（`showSearchSuggestions` 只在 focus 打开 → 有建议即显示）
- 修复前缀匹配（`artist:foo` 用完整串匹配标签名恒失败 → 按冒号后内容）+ `tag:` 前缀查标签库
- **多标签输入误删**：受控输入 + IME 组合重渲染会重置输入框 → 改**非受控（defaultValue）+ composingRef 组合安全**；补全应用读**输入框实时值**替换当前词

**F. 阅读器**
- 滚动页内偏移进度（`ScrollOffset` 列，scroll 存页码+0~1 偏移，paged 恒 null）；下一部预加载（读尾 5% 预取）；**RTL 横向反序**（row-reverse 布局 + 热区/键盘/自动阅读适配）；content-visibility 窗口化渲染；可用区域运行时实测；缩略图窗口化 ±40

**G. 移动端 / PWA**
- 弹窗改底部抽屉（全宽/安全区/90dvh）；横屏误判修复（`≤768px 或 ≤1024px 且 ≤500px 高`）；卡片左滑手势（阅读/删除）；PWA（manifest + 最小安全 SW，API 直连不缓存）

**H. 其他**
- 页面/封面 URL 加版本参数（`?v=`），重下后浏览器缓存自动失效；`scripts/smoke_test.py` 端到端冒烟（15 项）
- 提交整理：今日 20+ 个逻辑提交（标签/搜索/下载/控制台/在线/阅读器/移动端/PWA/文档）

**关键知识点（后续易踩坑）**
1. **EF `Add` 会级联把关系图全部标记 Added**——引用已存在实体务必用外键 Id 或 `Attach`
2. **HTTP 超时 = TaskCanceledException = OperationCanceledException 子类**——catch 时先判自身令牌是否取消
3. **完成态任务不加载**——重启后历史完成记录消失
4. **受控输入 + IME**——需非受控 + `composingRef` 跳过同步
5. **TDZ**——`useCallback`/`useEffect` 的依赖数组或函数体引用**后声明**的 const 会崩（本次：ReaderLocal 预取 effect 在 engine 解构出 `currentPage` 之前引用它；measure effect 依赖 `showThumbs` 在其声明之前）。凡是"声明在后、引用在前"的变量，声明必须上移或 effect 下移
6. **连通性检测必须走与真实请求相同的代理链路**
7. **代码改动后必须重启对应进程**（API/控制台是独立进程，改后端要重建重启才生效）
8. **拖拽排序保存要合并式**——只保存当前页数组会整体覆盖全量顺序；跨页场景（连载系列几十上百部）必须先取完整列表、替换当前页块
9. **两套拖拽系统不能同时挂**——旧 `useGalleryDrag`（mousedown 克隆）与 dnd-kit（pointer 传感器）同时启用时互相干扰；启用 dnd-kit 的排序模式必须禁用旧拖拽并移除 `onDragMouseDown`

### 2026-09-18 阅读器移动端修复（触摸滚动 / 高度适应）
- **本地画廊顶栏精简 + 分组计数口径修复**：移除顶部那排"分组 chips"（作者/社团/多作者/未分类——它们不是标签，是 `useAlbumConfig` 从作品 `Artists/Groups` 元数据现算的分组；侧边栏在专辑功能关闭时只显示标签云，故这排是唯一入口）与「下载」入口，改为在原下载位置放「全部」按钮（一键清空 group/tags/搜索/排序/随机）。**作者/社团筛选仍可用**：搜索框支持 `artist:xxx` / `group:xxx`
  - **更正（曾误判）**：一度认为"前端聚合排除专辑成员导致计数偏低（186 vs 972）"，**实测不成立** —— 专辑功能关闭时 `useAlbumConfig` 根本不加载 albumConfig（恒 `{}`），排除分支从不命中；实测 chip 口径（Artists/Groups 列）与后端 work_tag 口径完全一致（未分类 972、多作者 982）。去掉该排除只是防御性清理（万一将来重开专辑功能）。**教训：报 bug 前先验证分支是否真的会执行**
- **标签删除保护 + 专辑遗留数据清理（2026-09-18）**：
  - **入口调整**：画廊顶栏的「标签管理」按钮已移除，标签库管理改从 **⚙ 设置页** 进入（`Settings.jsx` 内渲染 `TagLibraryModal`），避免低频维护入口占用画廊顶栏
  - **删除保护**：`DELETE /api/tag/{id}` 现在默认拒绝删除仍有作品关联的标签（返回 400 + 作品数），需显式 `?force=true`。原因：标签多来自 EH 元数据同步，删掉有作品的标签只会让作品丢失分类，且该作品后续重新同步时会再把标签建回来（状态漂移）
  - **前端**：标签管理弹窗中，有作品的标签删除按钮置灰并提示"关联 N 部作品，如需去重请用合并"；无作品的标签可直接删；新增「清理空标签」按钮 + `POST /api/tag/cleanup-empty`
  - **一次性脚本 `scripts/db/cleanup_albums.py`**：清理专辑方案全部遗留（album_config 631 行、`Category='album'` 合成标签 632 个、其 2788 条 work_tag 关联、作品上的 `AlbumKey` 2690 条），默认预演、`--yes` 才执行且**执行前自动备份 DB**。已于 2026-09-18 执行：作品数 3210→3210（不变），标签 4476→3844，专辑/AlbumKey 全部归零
  - **发现的遗留 bug（尚未修）**：`GallerySyncService` 删除作品记录时（磁盘目录消失 / 一致性检查）只删 `local_gallery` 行，**未同步删除 `work_tag` 关联**，会累积孤儿关联（当前 32 条 / 1 部作品；清理专辑前为 54 条）

### 2026-09-18 本地画廊 UI 精简
- **顶栏改两行布局**：第 1 行 = 导航 + 作品计数 + 视图控制（随机 / 排序 / 显示模式），第 2 行 = **搜索框独占整行**（`maxWidth: 720` 居中）。原为单行「左组 | 搜索(flex:1,max480) | 右组」，搜索框被两侧挤压；容器由 `height: var(--header-height)` 改为 `flexDirection: column` + padding 自适应高度。mobile.css 中 `.gallery-topbar > div:nth-child(3)` 的旧排序规则已删除（现仅 2 个子元素）
  - **视图控制必须与计数徽章同组**：放在独立的第二个 div 里会作为一个整体换行，视觉上像"第二行"；移进徽章所在的组内才会紧跟其后逐项排布
  - **注意 `flexShrink: 0` + 无 `flexWrap` 的组**：塞入新按钮后窄屏会横向溢出而非换行，需要给组补 `flexWrap: 'wrap'` 与 `minWidth: 0`
  - **移动端固定网格显示**：显示模式切换按钮仅桌面端渲染；同时用 `effectiveViewMode = isMobile ? 'grid' : viewMode` 覆盖渲染分支，避免 URL 残留 `view=list` 时手机端陷在列表模式且无法切回
- **在线模块（EHentai）移动端**：Cookie 状态/配置/验证/屏蔽等账号相关 UI 一律不渲染（移动端不管理账号），未配置提示改为引导「前往设置」；**卡片误触防护**：全局记录最近滚动时间，移动端在滚动结束后 250ms 内忽略卡片点击，避免滑动列表时误开详情
  - 注意：`.mobile .gallery-hover-overlay { display: none }` 隐藏了卡片悬浮层，所以移动端**卡片点击是进入详情与下载的唯一入口**（悬浮层的「详情/下载」按钮在手机上不可见）
  - **移动端常驻下载按钮**：卡片缩略图右下角新增直接下载按钮（`isMobile && 未下载 && 未在下载` 才显示；已下载/下载中状态由左上角徽章表达）。同样带 250ms 滚动误触防护——误触进下载队列的代价比误开详情更高
  - **踩坑记录**：用 `</div>\n            </div>` 这种通用缩进做 apply_patch 锚点极易命中错误位置（本次一度把按钮插进 Cookie 面板，那里 `g` 不在作用域，桌面端因 `isMobile` 短路未崩但属隐患）。**插入 JSX 务必用唯一的相邻代码行做锚点**

### 在线封面模糊（2026-09-18 排查，属 EH 源图限制）
- **移动端滚动卡顿/被"卡住"（2026-09-18 修复）**：`ContinuousView` 有两个叠加问题——
  ① **每个 scroll 事件都从第 0 帧线性遍历**读 `offsetTop/offsetHeight`（长画廊滚到第 200 页就是 O(200) 次布局读取 + 无 rAF 合并）→ 改为 **rAF 合并 + 从上次帧索引增量逼近**（正常滚动每帧只走 0~数帧）。注意 RTL(`row-reverse`) 下帧偏移是**降序**，增量方向要反过来（坐标更大 = 索引更小）
  ② **外部跳页的 `scrollTo({behavior:'smooth'})` 与惯性滚动打架**：该 effect 依赖 `currentPage` 与 `dimsMap`（图片陆续加载会不断触发），快速滚动时 React state 落后于实际位置 → `currentPage !== reportedPageRef` 成立 → 反复把画面回拉，表现为"滚到一半被卡住/停止"。修法：记录最近一次 scroll 时间，**250ms 内视为滚动驱动，跳过回拉**
- **实测结论**：EH 搜索结果每行**只有 1 个图片 URL**（`ehgt.org/w/...`），分辨率 **约 250×350**；详情页 `#gd1` 封面经抽样 6 个热门作品验证**与缩略图完全相同**（无更高清版本）。后端代理只转发原始字节，不做压缩
- **模糊根因**：卡片按 CSS 尺寸渲染，但设备像素需求 = CSS 尺寸 × DPR。桌面 `--card-min-width: 250px` 在 125~150% 缩放屏 = 312~375 设备px；手机 2 列约 175 CSS px × DPR3 ≈ 525 设备px —— 而源图只有 250px，**被放大 1.2~2.1 倍**
- **可做的**：①横版封面（250×171 等）用 `cover` 塞进 0.725 竖版卡片会再放大 1.5~2 倍 → `onLoad` 时按自然比例判断，横版改 `object-fit: contain`（已修）；②网格越密卡片越小、放大倍数越低（已按此调整，见下）；③真高清只能取作品第 1 页大图（0.5~2MB/张），代价过高未采用
- **⚠️ 死代码陷阱（已修）**：EH 页实际用的是 `<div className="grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(var(--card-min-width),1fr))'}}>`，而 mobile.css/App.css 里针对 **`.eh-grid`**（JSX 中早已不存在）的规则全部失效 → 手机竖屏沿用全局 `--card-min-width: 250px`，390px 屏只排出 **1 列**（封面被放大约 4.3 倍，最糊）。**改样式前先确认类名在 JSX 里真实存在**
- **网格密度调整（按"卡片越小越清晰"）**：`.eh-container .grid` 桌面 `--card-min-width: 200px`（App.css）、移动端竖屏 **`160px` + gap `--space-2`（2 列，390px 屏 ≈179px/卡，DPR3 下约 2.1x 放大）**、横屏 `120px`。注意 `auto-fill + 1fr` 下列宽由**列数**决定，min-width 只控制列数：2 列即 179px/卡。最终按"浏览效率 vs 清晰度"取舍选了 2 列
- **移动端顶栏去重**：底部标签栏已含 本地/浏览/下载/设置，故移动端隐藏本地画廊顶栏的「在线」「设置」按钮与「📁 本地画廊」标题；在线模块（EHentai 页）移动端隐藏「📁 本地」按钮与「🌐 E-Hentai」标题。桌面端保持原样
  - **（补充）整条顶栏在移动端不渲染**：隐藏上述内容后顶栏只剩占位 div，会留出一条 48px 空白，改为 `{!isMobile && (<div className="header">…)}` 整体不渲染
- 顶栏重组：**随机 / 排序 / 显示模式（网格·列表）** 合并成一组放在一起；「批量」按钮**仅桌面端**保留（手机端用卡片左滑删除）
- **删除整个 `.gallery-toolbar` 工具栏行**（排序/视图/每页数量/标签顺序按钮全部上移到顶栏）；「每页数量」下移到**底部分页控件旁**（`renderPagination` 内，仅 1 页时也显示）
- 「标签管理」按钮移除，入口移到设置页
- **移动端阅读器 UI 收敛**：移动端**不渲染底部缩略图列表**；底部工具行精简为「上一部/下一部（双箭头）+ 上一页/下一页（单箭头，RTL 自动反向）+ 自动阅读 + 设置」；其余全部设置（方向/阅读顺序/翻页方式/缩放适配/背景/间距/自动阅读速率/手势说明）集中到新组件 `ReaderSettingsModal`（复用 `.modal` 约定，移动端自动变底部抽屉）。桌面端保持原有密集工具栏不变
- **高度"没适应"根因（浮层与定位不一致）**：HUD/底栏是 `position: absolute` 浮层，代码只在**算尺寸**时扣了它们的高度，**定位**却仍按整屏居中 → 图片下沿被工具栏遮住；滚动模式更严重——滚动容器没有上下内边距，首帧顶部永远压在 HUD 下、末帧底部压在底栏下（滚到 0 也露不出来）。修法：翻页模式把 HUD/底栏高度做成 `.r-gallery` 的 padding（算尺寸与摆放用同一组值）；滚动模式给 scroller 加 `paddingTop/Bottom`，跳页/进度恢复的 scrollTo 目标同步减去该内边距
- **"只能点击翻页"根因（pointercancel）**：内容溢出时滚动容器 `touch-action: pan-x pan-y` 让浏览器接管平移 → 触发 `pointercancel` → `pointerup` 永远不来 → 依赖 `pointerup` 的手势识别失效。修法：**触摸改走 touch 事件**（`touchstart/touchmove/touchend`，不受平移接管取消影响），鼠标仍走 pointer 事件；溢出时滑动优先平移、到边界才翻页
- 其它：`updateChrome` 值不变时不 setState（配合 ResizeObserver 跟踪 HUD/底栏实际高度）；手机端图片预取半径 50 → 8

### 2026-09-19 桌面控制台：移除"已完成"任务
- **控制台只保留在途任务**（等待/下载中/暂停/失败），不再显示任何已完成记录：删除 XAML 的「已完成」筛选 Chip、`IsFilterCompleted` 属性、`MatchesFilter` 的 completed 分支
- **关键坑**：`DownloadMonitor.Merge` 原先只删"快照里已有且已完成"的项，而添加循环会把 incoming 中的**全部**任务加进去（含 completed）→ **已完成任务每轮轮询都被重新加回列表**（所以那个筛选并非无用，它确实在过滤这些记录）。修法：`activeGids` 只统计非 completed/removed，且添加循环 `continue` 跳过
- Web 端的「已完成」筛选保留（本次只按要求改控制台）
- 注：控制台是 WPF 独立进程，改动需**重新构建并重启控制台**才生效；且它同时管理 API 服务进程，切勿在未确认的情况下直接结束它
  - **⚠️ 为什么改了没生效（重要，已踩两次）**：`manga_manager.py` 启动 API 用的是 `dotnet run --no-build`，控制台则是**直接运行预编译 exe**（`bin/Debug/net9.0-windows/MangaManager.Console.exe`）——**两者都不会自动重建**。所以改完代码后如果只是"重启应用"，跑的还是旧二进制（本次现象：控制台进程今天 3:17 启动，但 exe 时间戳还是 9 月 1 日）。**正确顺序：停进程 → `dotnet build <项目>` → 再启动**
  - 结束控制台时用强制结束（Stop-Process）不会触发它的 `Exit_Click`，因此**不会连带停掉 API**；但走它自己的「退出」按钮会停 API+前端

### 2026-09-19 全量优化执行记录

**架构审查后按序执行的改进（每项独立提交）**
1. **删除 `AllTags` 的 API 暴露 + 死端点**：`LocalGallerySummary/Item`、`MapToSummary/MapToItem` 不再带 AllTags；删除 `/api/local/galleries` 全量列表端点与 `ScanLocalGalleries()`（前端从未调用）。卡片列表载荷 14KB → 6KB。**DB 列保留**（它是标签同步输入源）
2. **`RemoveGalleriesAsync` 统一删除路径 + 下载完成显式入库**：三处删除（追加式重扫/目录删除/一致性检查）共用同一方法（含 work_tag 清理）；下载完成后直接调 `GallerySyncService.SyncDirectoryAsync`，不再依赖 FileSystemWatcher 的 2 秒延迟兜底
3. **阅读器跨作品导航改用 URL 上下文**：打开阅读器时把 `group/q/sort/tags` 写进 URL，阅读器据此调 `/api/local/galleries/gids` 还原有序序列 → 刷新页面 / 新标签页 / 会话丢失都能继续上下翻作品（原先只靠 sessionStorage）
4. **在线模块缓存 + 详情骨架屏**：搜索结果与画廊详情各加 3 分钟内存缓存（翻页返回、列表↔详情来回切不再重复抓 EH）；详情弹窗先用列表卡片字段渲染骨架，接口返回后覆盖
5. **可观测性**：新增 `/api/status`（库规模、孤儿 work_tag / 悬空标签引用计数、下载队列按状态、存储目录可用性）+ 设置页「运行状态」诊断卡片。与轻量 `/health` 区分

**P0 真 bug**
- **编辑标签保存直接报错**：`useGalleryOperations` 定义了 `setEditTagsSaving` / `setImporting` / `setBatchImporting` 但**没 return**，LocalGallery 的内联 handler 直接调用 → 点击保存抛 `ReferenceError`（编辑标签功能实际不可用）。已补全 hook 返回值与解构

**P1 性能（实测数据）**
- **响应压缩**：后端原先未启用 → 已加 Brotli(Optimal)+Gzip。实测 meta 311KB→33KB、tag-stats 535KB→86KB、/api/tag 500KB→80KB（注意 Brotli 用 `Fastest` 反而比 gzip 大，必须用 `Optimal`）
- **meta 载荷瘦身**：`/api/local/galleries/meta` 移除 `AllTags` 字段——它占载荷 76%（1.05MB）且仅被**已禁用的专辑自动匹配**使用。meta 1392KB → 311KB（配合 brotli 33KB）；本地库首屏 JSON 1.93MB → **119KB**
- **生产包移除开发展示页**：App.jsx 原先把 12 个 visual-test 页面**静态引入**（注释写"loaded lazily"但实际不是），连带 antd/@ant-design/charts/@ant-design/icons 全进生产包。抽出 `src/visual-test/VTRoutes.jsx` 并用 `import.meta.env.DEV + React.lazy` 引入 → **JS 3.77MB → 663KB（gzip 1.10MB → 200KB）**，CSS 52.4→45.4KB，构建 1.4s→0.44s。开发服务器下 `/visual-test/*` 仍可用（已验证模块返回 200）

**P2 数据一致性 / 工程基线**
- **孤儿 work_tag**：`GallerySyncService` 三处删除点原先只删 `local_gallery`、不清理 `work_tag` → 已同步清理；一次性脚本 `scripts/db/cleanup_orphan_work_tags.py` 清除历史遗留 32 条（54324→54292），复检孤儿/悬空 TagId 均为 0
- **死端点移除**：`/api/local/groups` + 前端 `fetchLocalGalleryGroups`（从未被调用）+ 后端 `GetGalleryGroups()/GroupInfo`
- **lint 基线 189 errors → 0**：修复 `no-undef`（上条 bug）、`rules-of-hooks`（GalleryDetail 早退在 Hook 之前）、render 期写 ref（useReaderEngine）、无用赋值；批量清理 160+ 未使用变量/导入；eslint 配置补 node globals、允许空 catch、React Compiler 建议性规则降为 warn。剩 54 warnings（建议性）
- **冒烟测试偶发卡死**：端口 5299 落在 Windows 动态端口范围(1024-15000)内会偶发 `WSAEACCES`，改为自动挑空闲端口 + 进程退出即失败并打印 stderr。实测从 30~180 秒卡顿降到 **8 秒**跑完
- 新增 `scripts/devops/check_payload.py`（接口体积/压缩巡检）、`scripts/start_frontend.ps1`

**有意未做（附理由）**
- 删除 `manga`/`manga_tag`/`author` 三张空表与实体：属旧版漫画子系统（MangaService/MangaController/ReaderController 仍在用），需迁移+连带改造，风险远大于收益
- 移除 `useGalleryDrag`：专辑关闭后它已被 `disabled` 永久禁用，属休眠代码，删除需改动 GalleryCard/LocalGallery/AlbumSidebar，收益低

### 2026-09-10 收尾（审查 / 备份 / 上线）
- **运行时设置页（库目录 / Cookie / 代理）**：新增 `AppSettingsService`（`runtime_settings.json`，优先级 **runtime > appsettings > 内置默认**）+ `GET/PUT /api/settings/app`、`POST /api/settings/app/rescan`；前端新增 `/settings` 页（目录选择器 + Cookie 复用 `useEHCookie` + 代理）与首次配置引导弹窗 `FirstRunSetup`（未配置库目录时弹出）。要点：
  - `GallerySyncService.DownloadDir` 由 `static readonly` 改为**动态读取**，新增 `RescanAsync(reason, pruneMissing)` —— 设置页触发的重扫用 **pruneMissing=false（只增改不删）**，避免误配目录清空索引
  - 代理改为 `DynamicWebProxy`（每请求读取设置），改代理无需重启
  - `downloadDirConfigured` 的判断包含 appsettings 来源（否则老用户也会被弹首次引导）
  - PUT 保存时校验目录必须存在，不存在直接 400
- **阅读器 TDZ 崩溃（用户报告"阅读模式工作异常"）**：`ReaderLocal` 的"下一部预取" effect 引用了 engine 解构出的 `currentPage`，而解构发生在该 effect 之后 → `Cannot access 'currentPage' before initialization`，整页崩溃；顺带修掉 HUD 高度测量 effect 依赖 `showThumbs`（声明在后）的第二处同类问题。修法：预取 effect 下移到 engine 解构之后，`showThumbs`/`showHelp` 声明上移
- **标签内自定义顺序**（09-01 落地，09-10 复验）：`tag_order` 表 + `GET/PUT /api/tag/{id}/order`；单标签 + `sort=custom` 生效；单选已排序标签自动进 custom；拖拽只在"单标签 + custom"下可用（旧专辑拖拽与 dnd-kit 冲突已消除）
- **全量校验**：后端 Release 构建 0 警告 0 错误；前端 `npm run build` 通过；`scripts/smoke_test.py --build` 15/15 通过（库规模 **3008 画廊 / 4242 标签 / 53130 work_tag**，无孤儿 work_tag）
- **本地备份**：新增 `scripts/devops/backup_local.py` → `D:\MangaManager_Backups\MangaManager_<时间戳>`（工作树 + SQLite backup API 一致性快照 + git bundle，排除 node_modules/bin/obj）
- **清理**：删除遗留临时脚本 `scripts/verify_g.py`；`.gitignore` 增加 `.codebuddy/`（其它工具的记忆目录）

### 第一批：阅读器核心修复
- **缩放/适配真正生效**：`fit`/`zoom` 接入 PaginatedView 与 ContinuousView（`getImageLayout` + 自然尺寸测量）；放大溢出可滚动
- **滚动模式补全页码/跳转/进度语义**：滚动跟踪当前页、缩略图/Home/End 跳转、帧固定尺寸 + memo、图片懒加载
- 方向键映射修正（↑/PageUp = 上一部）；拖拽松手不再误触 UI；边缘滑动不再双翻页
- 进度恢复越界钳制；快捷键大小写兼容；删除死代码
- 后端：进度 upsert 并发重试；文件排序统一 `OrdinalIgnoreCase`

### 第二批：交互模型（正交化 + 交叉轴导航）
- 键盘按方向派生（纵向 `↑↓` 主操作/`←→` 切作品，横向反之）；paged-纵向上下热区与上下翻页
- 手势按轴分流（主轴翻页、交叉轴切作品）；放大平移让位
- 工具栏上一部/下一部按钮（随方向变图标、边界置灰）；作品边界提示；连续模式自动阅读打断

### 第三批：体验细节
- 自动阅读速率：滑块连续调节（间隔 1–60s / 速度 20–1600px/s）+ `[`/`]` 微调
- 底部进度栏出现机制修复（交互感知隐藏、悬停唤醒、滚动模式也显示）
- **进度恢复竞态修复**：A 作品页码不再继承到 B（gid 标记 + 恢复前禁存）
- **EH 登录优化**：Cookie 面板支持智能导入（完整 Cookie 串 / Netscape 导出 / JSON 自动识别）、从剪贴板导入、一键导出书签脚本（在已登录的 e-hentai.org 页面点击即复制三件套）、登录状态徽章（未配置/验证中/失效/仅表站/里站可用）+ 进入页面自动验证
- **桌面控制台重构 S1（共享 DTO）**：新建 `src/shared/MangaManager.Shared`（net9.0，含 `ApiResponse<T>` + `Download/DownloadTaskDto`）；后端 `DownloadController` 改返 DTO（`DownloadTaskMapper` 映射，Token 不进 DTO）；`/api/download/tasks` 等 REST 契约与旧 JSON 一致（差异：去 token、增 speedBps）；SSE 事件负载不受影响。后续阶段见 [desktop-console-refactor-design.md](desktop-console-refactor-design.md)
- **桌面控制台重构 S2（配置 + 基础设施）**：桌面端引用 Shared；新增 `appsettings.json`（服务命令/URL/超时/轮询退避/日志上限全部外置）+ `Models/AppConfig`（IConfiguration 强类型绑定）；新增 `Infrastructure/`（RelayCommand、AsyncRelayCommand 统一异常兜底、DispatcherService 线程调度）
- **桌面控制台重构 S3（Services 层）**：`ProcessRunner`（进程树启停 + 退出事件）、`ServiceManager`（服务状态机 + 防重复启动 + 就绪探测 + 端口兜底仅杀 dotnet/node 相关进程）、`ApiClient`（HttpClient 单例 + 非 2xx 抛 ApiException）、`DownloadMonitor`（独立轮询 + 失败指数退避 + 静默跳过）、`EnvironmentProbe`（dotnet/node 版本检测）；服务输出统一经 `DispatcherService` 回 UI 线程
- **桌面控制台重构 S4（MVVM 化）**：`MainViewModel`（服务卡片/全局状态/下载摘要/日志/全部命令）、`ServiceCardViewModel`、`DownloadTaskVm` 瘦身为纯 UI VM（从 DTO `MapFrom`）；MainWindow.xaml 全部事件改 Command 绑定（模板内按钮用 RelativeSource 取窗口 DataContext）；`MainWindow.xaml.cs` 缩至 <100 行；`App.xaml.cs` 为组合根。运行时冒烟验证通过：窗口正常显示、API 自动拉起就绪、下载监控轮询。**过程中修复两个真实 bug**：`ShowWindow()` 创建分支漏调 `Show()` 导致窗口不显示；环境探测无超时可能挂死启动（已加 3s 超时 + 首行日志）。另实现 P2 日志持久化（`console.log` 文件）
- **桌面控制台关闭卡死修复**：根因是 `ProcessRunner.StopAsync` 在 UI 线程同步调用 `Process.Kill(entireProcessTree:true)`——该 API 对 dotnet run 进程树可能永久挂起（.NET 已知问题），导致点 ✕ 后界面冻结。修复：杀进程移到后台线程（Task.Run）+ 改用 `taskkill /PID x /T /F`（实测 198ms 完成）+ 全部有界等待；`ServiceManager.StopAsync` 的端口兜底清理只对**自己启动**的服务执行（避免误杀外部运行的前端）
- **桌面控制台日志洪流卡死修复**：API 启动时 EF SQL 日志大量输出（每秒数百行），重构时把旧版 `Dispatcher.BeginInvoke` 改成了同步 `Invoke`，导致每行日志阻塞线程池线程并强制 UI 线程逐行处理，且每次全量重建日志文本 + 逐行写文件 → UI 线程饱和（实测 CPU 63s）。修复：`ProcessRunner` 恢复非阻塞 `BeginInvoke` 转发；`MainViewModel` 日志刷新节流（200ms 合并）；`LogService` 文件写入改后台批处理（信号触发排空积压）。修复后同场景 CPU 仅 2.3s
- **删除下载任务同步删本地文件**：`DownloadManager.RemoveTask` 现在会在取消任务后同步删除下载目录中的 `{gid}-*` 文件夹（等待下载循环响应取消 1s + 3 次重试防文件占用 + 失效画廊扫描缓存）；`DELETE /api/download/tasks/{gid}` 生效于桌面控制台与 Web 下载监控。已端到端验证：删除后目录消失、DB 记录清空
- **桌面控制台四优化（2026-08-30）**：① ✕ 改为**最小化到托盘**（服务继续运行），真正退出在托盘菜单（带确认）；② 服务状态**30s 周期探测**（发现外部启动/停止，`RefreshAsync` 复用且不写日志）；③ **崩溃自动重启**（5s/15s/30s 退避、最多 3 次、稳定运行 60s 重置计数，`ServiceConfig.AutoRestart` 可配，`StatusChanged` 统一经 `DispatcherService` 回 UI 线程）；④ 启动**并行化**（环境探测并行、API/UI 并行拉起）。已实测：杀掉 API 后自动重启成功
- **桌面控制台功能增强（2026-08-30）**：任务列表改 `ListBox` **虚拟化**（Recycling）+ **状态筛选**（全部/下载中/等待/暂停/失败 chips）；日志**按大小轮转**（默认 5MB → `.1`）+ **打开日志文件**按钮；**窗口位置/大小/最大化记忆**（`%LocalAppData%\MangaManager\window.json`，带屏幕可见性校验）；**发布形态支持**（`ServiceConfig.Enabled`，`publish.ps1` 增加控制台自包含发布，生成 API 与控制台共用的合并 `appsettings.json`，`ExePath` 直启、UI 由 API 托管时 `Enabled=false` 隐藏卡片）
- **移动端适配（2026-08-31）**：`useIsMobile`（matchMedia ≤768px 响应式）+ `MobileTabBar`（底部标签栏 本地/浏览/下载，阅读器路由隐藏）；根元素 `.mobile` 类驱动 `mobile.css` 布局重排——页面容器改可滚动列、专辑侧边栏改 82vw 抽屉（`☰ 专辑` 汉堡入口，关闭时 pointer-events:none）、按钮 38px 触摸目标、input 16px 防 iOS 缩放、阅读器按钮 40px + 100dvh、`viewport-fit=cover`。设计文档见 [mobile-adaptation.md](mobile-adaptation.md)
- **本地导入功能开关**：新增 `src/frontend/manga-ui/src/config.js`（`FEATURES.enableLocalImport`，默认 **false**）——初始导入阶段结束，本地画廊顶栏的「导入/批量导入」按钮隐藏；需要时改回 `true` 即可恢复（后端接口与弹窗代码保留）
- **全量标签化管理 P0（2026-09-01）**：`tag` 表扩展 `Namespace/NameCn/IsBlocked`（唯一索引 (Namespace,Name)）；新增统一关联表 `work_tag`（本地画廊正 Gid、旧版 Manga 负 Id）；`TagService`（批量幂等 upsert/作品标签 CRUD/搜索/常用）+ `TagMigrationService`（一次性迁移：local_gallery JSON 标签→tag+work_tag、专辑→album 标签、manga_tag 历史并入、屏蔽种子）+ GallerySync 全量/增量自动补标签；新 API：`/api/work/{id}/tags`、`/api/tag/search`、`/api/tag/common`。端到端验证通过（标签/关联/API/重启幂等）。设计见 [tag-centric-management-design.md](tag-centric-management-design.md)
- **标签化 P2/P3（2026-09-01）**：画廊查询支持 **`tagIds` JOIN 筛选**（命中任一标签）+ **`tag:` 搜索语法**（原文/中文）+ **`/api/local/galleries/tag-stats`** 标签统计（侧边栏/选择器用）；前端新增 **`TagPicker`**（搜索优先/分类分区/常用排序/已选 chips/无结果可新建自定义标签）并接入画廊详情（标签展示 + 增删）。端到端验证通过（milf→2 部 / custom→1 部 / tag:milf→2 / 增删生效）
- **侧边栏标签云（2026-09-01）**：`TagCloud` 组件按分类分区展示标签（计数/高亮/点击切换筛选），接入 AlbumSidebar；URL `tags=1,2` 参数驱动画廊筛选（命中任一标签），工具条显示可移除的激活标签 chips，选标签自动清空专辑分组、选分组自动清空标签，跨作品导航 gids 请求同步 tagIds
- **标签化 P4 收尾 + 真实库迁移验证（2026-09-01）**：`FEATURES.enableAlbums=false` 隐藏专辑 UI（AlbumSidebar 纯标签云）；真实库（2728 画廊）迁移验证通过：**TAGS=3961 / WORK_TAG=47802 / ALBUM_TAGS=632**，分类分布 other 1475、author 788、album 632、female 432、translator 385、male 238、language 11。期间修复两个真实 bug：① `BackfillNameCnAsync` 误用 `AsNoTracking()`，NameCn 回填日志显示 3052 但库中恒为 0 → 去除后实际落库 **3052**；② `EhentaiFileHelper.DefaultDownloadDir` setter 自动建目录 + `GallerySyncService` 空目录扫描把 DB 全部画廊当"已删除"清空（副本 2728→0 复现）→ setter 不再建目录、0 目录且 DB 有记录时跳过清理并告警，回归验证画廊不丢。另加固 **TagPicker**：搜索防抖 250ms、"全部"视图按分类均衡取 top（防止大类淹没小类）、最近使用标签（localStorage）、搜索命中高亮
- **专辑方案废弃完整性（2026-09-01）**：移除所有自动写专辑路径——`DownloadManager` 下载完成后的自动分配（匹配/新建/兜底专辑 + 写 AlbumKey）整体删除；`LocalGalleryService.GetGalleryGroups` 的自动补建专辑副作用块删除（其返回从来只有多作者/未分类派生分组，建专辑纯属写库噪音）；前端 `useAlbumConfig` 在 `enableAlbums=false` 时不再加载专辑配置/自动匹配新作品，卡片不再显示专辑色条角标，侧边栏折叠标签改"标签"，URL 残留 `album:` 分组自动回退。运行时回归：`/api/local/groups` 调用前后 album_config 计数 631→631 不变，画廊 2728 不丢、标签接口正常。保留：`album_config` 数据、`AlbumsController` 显式 CRUD（人工调用，前端已隐藏）
- **标签库管理与搜索建议补齐（2026-09-01）**：① 后端新增 `POST /api/tag/merge`（合并标签：搬移 work_tag/manga_tag 关联并去重、继承 NameCn/IsBlocked、删除源），删除标签改为先显式清理关联（SQLite 无 FK 级联，避免孤儿行）；② 前端新增 `TagLibraryModal` 标签库管理弹窗（本地页工具栏「标签管理」入口）：搜索/分类浏览 + 改名/改中文/改色/改分类 + 合并到其他标签 + 删除，复用此前闲置的 `updateTag/deleteTag/fetchTagCategories` API；③ 本地搜索建议接入标签库：无前缀词输入时查 `/api/tag/search` 补全为 `tag:xxx` 语法（原文/中文均命中），artist/group/category/language 前缀仍走本地派生池。真实库副本端到端验证：新建标签→加到作品→合并→目标出现在作品（DB+API 双确认）、源删除；删除标签关联同步清理、孤儿行 0、画廊 2728 不丢
- **滚动模式页内偏移进度（2026-09-01）**：`local_reading_progress` 新增 `ScrollOffset REAL NULL`（迁移 `AddScrollOffsetToReadingProgress`）；滚动模式保存 `pageIndex + 0~1 偏移`（当前帧内中线相对位置），分页模式偏移恒 null（避免滚动残留污染分页进度）；恢复时 `scrollRestore` 意图定位到「帧起点 + 偏移 × 帧尺寸」，帧尺寸未就绪（图片懒加载）时随 dimsMap 重试、应用后清除；同页滚动只更新偏移并复用 2s 防抖保存；画廊切换/返回书架也带偏移保存。真实库副本验证：POST 0.42 → GET 0.42、无偏移覆盖为 null、旧格式兼容、迁移列存在。阅读器路线图阶段 3 完成
- **下一部预加载（2026-09-01）**：`ReaderLocal` 读到当前作品最后 5%（至少 3 页）时预取下一部 pages 列表，存入会话缓存 `pagesCacheRef`（gid → URL 数组）；切换到已缓存作品时直接使用、跳过请求（秒开），返回上一部同样走缓存；预取带 AbortController 防竞态（gid 变化/重复预取会取消旧的）。阅读器路线图阶段 4 全部完成
- **RTL 横向反序（2026-09-01）**：引擎新增 `readingOrder`（ltr/rtl）并持久化（`manga-reader-settings-v1`），工具栏横向模式显示「左→右/右→左」开关。分页：左右热区互换（左=下一页）、键盘 `←/→` 语义翻转、滑动保持漫画惯例（左滑=下一页，与 LTR 一致）。滚动：`flex row-reverse` 让第 0 页在最右、初始停在最右（保持 LTR 滚动语义规避浏览器 RTL scrollLeft 差异）；页跟踪改「精确包含」算法（帧偏移升降序均成立）；自动阅读、拖拽、跳页、页内偏移恢复、`[`/`]` 调速全部适配；键盘 `←`=向前滚动。帮助面板文案随 RTL 翻转。阅读器路线图 2b 完成，整个阅读器路线图收官
- **桌面控制台/交接遗留清理（2026-09-01）**：Python 控制台 API 启动等待 9s → **30s**（60×0.5s，`manga_manager.py`）；其余四项经审计确认已在 S4 重构中解决——`IsPortOpen`/`is_port_open` 均已用 `127.0.0.1`（无 IPv6 隐患）、`album_config` 存在 `Order` 列（实体+迁移）、`RemoveTaskAsync` 删除后立即拉取任务列表刷新（不依赖轮询/SSE）、`publish.ps1` 已含 WPF 控制台自包含发布与合并配置。仅剩「AI 生成作品超级桶分类」待用户决策
- **页面缓存即时失效（2026-09-01）**：`GallerySyncService.SyncDirectoryAsync`（下载完成/增量变更路径）与 `RemoveDirectoryAsync`（删除路径）成功后调用 `LocalGalleryService.InvalidateScanCache()`，消除「下载完成后 10s 内打开阅读器缺新文件」的已知限制
- **阅读器可用区域/缩略图优化（2026-09-01）**：`getAvailableArea` 不再硬编码 44/36——ReaderLocal 运行时测量 HUD/底部栏实际高度（含缩略图展开、UI 隐藏时归零）并经 `updateChrome` 写入 `viewport.top/bottom`，`getImageLayout` 增加 chrome 参数，分页/滚动视图均生效（ContinuousView 布局 memo 依赖 chrome 自动重排）；`ThumbnailStrip` 改为窗口化渲染当前页 ±40，替代 `slice(0,25)` 上限
- **滚动模式窗口化渲染（2026-09-01）**：ContinuousView 帧启用 `content-visibility: auto`（离屏帧浏览器跳过渲染，长画廊 DOM 开销大减）+ `contain-intrinsic-size: auto 估算`（纵向按容器宽×滚动区高、横向按 0.7×滚动区高×滚动区高，先撑起完整滚动条；`auto` 关键字让浏览器记住图片加载后的真实尺寸）。偏移恢复守卫加 `dimsMap[pageIndex]` 条件，确保按真实尺寸而非估算落位。CSS 兜底 `.r-frame` 默认 800×1200
- **阅读器设置双轨统一（2026-09-01）**：`ReaderSettings.Data`（JSON）列 + 迁移 `AddReaderSettingsData`；SettingsController GET 返回 `{ data }`、PUT 接受 `{ data }` 落库（旧列保留兼容）；`useReaderEngine` 挂载时 `fetchReaderSettings` 读回应用（方向/模式/阅读顺序/适配/缩放/背景/边距/间隔/速度），偏好变更 `saveReaderSettings` 写透，`serverReadyRef` 防止首轮读取前本地值覆盖服务端。真实库副本验证：PUT → GET 原样返回、Data 列存在、JSON 落库、画廊 2728 不丢
- **全栈一致性审计 + 回归（2026-09-01）**：README 实体/API 表同步标签化现状（`work_tag` 统一表、`tag` 新字段、`tag/search|common|merge`、`work/{id}/tags`、`tag-stats`、`tagIds` 筛选、专辑标记废弃；修正错误的 `/api/local/reading-progress` 路由为 `/api/readingprogress`）；`.clinerules` 加知识库入口指引。三端全量构建 0 警告 0 错误（后端/前端/桌面控制台）。真实库副本 Python 冒烟全绿：tag-stats 3961、`big breasts` 标签筛选命中 2047、作品标签含该标签、进度偏移 0.37 往返、设置 JSON 落库、目录保护不丢画廊（2728）、专辑 631 不变、work_tag 47802
- **批量标签操作（2026-09-01）**：后端新增 `POST/DELETE /api/work/batch/tags`（`{workIds, tagIds}` 批量添加/移除，幂等按 (WorkId,TagId) 去重）；前端本地页批量模式新增「标签」按钮 + `BatchTagModal`（添加/移除切换、搜索优先选标签、确认批量执行后刷新统计）。真实库副本验证：2 作品×2 标签添加 4 条、重复 0、移除 1、关联精确、删除临时标签后孤儿 0
- **移动端弹窗底部抽屉化（2026-09-01）**：`mobile.css` 新增 `.mobile .modal` 规则——居中弹窗改全宽底部抽屉（`align-items:flex-end`、宽度 `!important` 覆盖内联 `min(…,94vw)`、顶部圆角、`env(safe-area-inset-bottom)` 安全区、`90dvh` 最大高度、上滑动画），覆盖 TagPicker/TagLibraryModal/BatchTagModal/GalleryDetail/AlbumEditModal 等全部弹窗；桌面端不变
- **PWA 化（2026-09-01）**：`public/manifest.webmanifest`（standalone、主题色 #0f0f1a、192/512 PNG + maskable 图标，PIL 按品牌色生成闪电图标）+ `public/sw.js` 最小安全 Service Worker——安装时预取外壳、运行时静态资源网络优先失败回退缓存、`/api/` 与 `/local-images/` 一律网络直连（绝不清新数据）；`main.jsx` 仅生产构建注册。验证：构建产物含 manifest/sw/图标、JSON 合法、sw 语法通过、index.html 注入 manifest 链接
- **移动端横屏适配（2026-09-01）**：`useIsMobile` 与 `mobile.css` 媒体查询从仅 `≤768px` 改为 `(≤768px), (≤1024px and ≤500px 高)`——横屏手机（844~932px 宽）不再误判桌面端；横屏作用域下 EH 网格 `auto-fill minmax(140px,1fr)`、本地卡片最小宽 150px、标签栏 44px、底部留白 48px、缩略图收窄。构建产物验证：LightningCSS 将查询改写为区间语法 `(width<=768px),(width<=1024px) and (height<=500px)`，两处均正确编译
- **画廊卡片左滑手势（2026-09-01）**：`GalleryCard` 内容包一层可滑动层（`touch-action: pan-y` 纵向滚动让位），左滑露出「阅读/删除」操作（72px×2 吸附展开），右滑/点击空白收起；滑动距离阈值 30px 吸附、40px 回弹；滑动后吞掉合成 click 防误触；`onDelete` 复用本地页确认弹窗；批量模式禁用。SortableGalleryCard 透传
- **下载监控移动端修复（2026-09-01）**：任务行操作按钮加 `dl-task-btn` 类、移动端 28px → 38px 触控目标；元数据行 `dl-task-meta` 允许换行（状态/页数/速度/错误信息不再横向挤压）；折叠迷你栏 `dl-minibar` 可换行；下载页重试/全部重试此前已接好
- **本地画廊分组筛选重构（2026-09-01）**：`BuildFilteredQuery` 的 `artist:`/`group:` 分组与搜索前缀从 JSON 字符串匹配改为 **work_tag JOIN**——修复「多作者作品只匹配数组首元素」（实测 artist:8000 旧 2 → 新 3）与子串误伤；`multi`/`unknown` 改为标签计数（≥2 个 artist/group 标签 / 无 artist/group 标签）；**移除遗留的 `AlbumKey==null` 门控**——专辑废弃后该门控让非专辑分组漏掉大量带历史 AlbumKey 的作品（实测 multi 2→794、unknown 36→822，与前端工具栏计数对齐）
- **端到端冒烟测试脚本（2026-09-01）**：新增 `scripts/smoke_test.py`——真实库副本 + 临时 API 一条龙回归（`--build` 可先构建）：tag-stats/tagIds 命中数一致/artist·multi·unknown 分组与 SQL 计数一致（含多作者修复回归）/进度偏移往返/设置 JSON 落库/tag-search/目录保护不丢画廊/无孤儿 work_tag/标签库与专辑计数稳定。用法 `python scripts/smoke_test.py [--build] [--dll …] [--db …] [--port …]`，退出码 0=全过；实测 15 项全 PASS
- **页面/封面缓存版本化（2026-09-01）**：页面图片接口 `Cache-Control: 1 天` 且 URL 不变，重下后浏览器会显示旧图 24h——`GetGalleryPages` 现按目录内文件最新 mtime 生成 `?v=` 版本参数（重下/替换文件后自动换新，配合 10s 缓存失效即时生效）；前端 `getLocalCoverUrl(gid, v)`/`getLocalPageUrl` 支持版本参数，画廊卡片/行/详情封面传 `lastModified` 做缓存键
- **下载管理增强（2026-09-01）**：① 后端新增 `POST /api/download/tasks/pause-all` / `resume-all`（`DownloadManager.PauseAll/ResumeAll` 批量暂停/恢复）；② 前端 `/downloads` 独立页**默认展开**（原默认折叠迷你栏，进页面只看到一条小栏）；标题栏新增「全部暂停/全部恢复」；任务行增强——**进度百分比、下载速度 + 预计剩余时间（每页平均耗时×剩余页）、失败页数、pending 队列位置（第 N 个等待）**；③ 桌面端本地页顶栏新增「下载」入口链接（此前只能靠 URL 进下载页）。真实库副本验证：pause-all 暂停 110 个活跃任务、resume-all 恢复 110
- **控制台退出崩溃修复（2026-09-01，真实线上问题）**：`MangaManager.Console` 在退出时反复崩溃（事件日志 `.NET Runtime 1026: System.ApplicationException: Object synchronization method was called from an unsynchronized block of code`，栈指向 `App.OnExit → Mutex.ReleaseMutex`）——`Exit_Click` 先释放 `_appMutex`，`Shutdown()` 触发 `OnExit` 再释放一次（双重释放）；第二个实例（未持有锁）退出时同样崩溃。修复：`_appMutexOwned` 记录所有权 + `ReleaseAppMutex()` 仅持有者释放一次、异常容错、置空防重入。该崩溃会连带终止控制台托管的 API 进程 → 前端 `/api` 全部失败 → 下载列表静默显示为空（本次“有任务但列表不显示”的根因）
- **Vite 代理 IPv6 加固（2026-09-01）**：`vite.config.js` 的 `/api` 代理 target 从 `http://localhost:5208` 改为 `http://127.0.0.1:5208`，避免 localhost 解析到 `::1` 导致“API 在跑却连不上”
- **控制台下载列表为空的真因与修复（2026-09-01，线上复现+验证）**：API 正常返回 107 任务、前端反序列化验证通过，但运行中的控制台是 **8/30 旧构建**（`SpeedBps` 等 DTO 契约早于 9/1 定型），线上 `speedBps` 为非整数浮点（47544.5），旧 DTO 反序列化整个列表抛 `JsonException` → `DownloadMonitor` 完全静默指数退避 → `FilteredTasks` 恒空 → 窗口显示“暂无下载任务”。修复：用当前代码重建控制台并重启（API/前端为独立进程未中断、下载断点续传不受影响），UI Automation 实测列表出现“2 下载中 · 105 等待中”与任务条目。**硬化**：`DownloadMonitor` 失败改为首次/每 6 次留一条日志（原完全静默，此类问题无法诊断）
- **搜索框自动补全完善（2026-09-01）**：① 本地页——修复“输入时下拉不出现”（原 `showSearchSuggestions` 只在 focus 时打开，新增 effect：有建议即显示）；派生池前缀匹配修复（原用完整 `artist:foo` 匹配标签名 `foo` 恒失败，现按冒号后内容匹配）；`tag:` 前缀现在会查本地标签库（任意命名空间，原文/中文）补全 `tag:xxx`；无前缀词继续派生池+标签库双源。模式统一：输入 → 下拉列表 → 点击替换当前词。② 在线页——数据源本就是 EhTagTranslation 全量翻译库（EH 标签大全），新增**本地标签库兜底**（翻译库不可用时 `/api/ehentai/tags/suggest` 改查 `tag` 表），保证在线补全始终可用。实测：suggest 返回 `female:milf`/`other:tankoubon` 等带命名空间与中文的 EH 语法
- **多标签输入误删修复（2026-09-01）**：本地/在线搜索框原为严格受控输入（`value={search}`，本地 search 还来自 URL），配合中文输入法组合输入时 React 重渲染会把输入框重置回旧值，导致“第二个标签输入时第一个被删/只能输入一个标签”。修复：两个搜索框改**非受控（`defaultValue`）+ 组合安全同步**（`composingRef` 在输入法组合中跳过外部同步）；补全应用（`applySearchTag`/`applyTag`）改为**读取输入框实时值与光标位置**替换当前词并立即写回 DOM（不再依赖可能过期的 state），彻底消除多标签误删
- **标签筛选失效/联合筛选修复（2026-09-01）**：① 前端——触发 `loadPaged` 的 effect 依赖**漏了 `tagIdsParam`**：第一次点标签恰好因 `group` 置空触发重查（“只生效一次”），之后只变 `tags` 不重查（“联合筛选失效”）；已补依赖，标签增删每次都会重查。② 后端——`tagIds` 筛选原为 **OR（命中任一）**，与“联合筛选”预期不符，改为 **AND（命中全部）**：`ids.All(id => WorkTags.Any(...))`。③ `GetTagStats` 原把旧版漫画的负 WorkId 关联也计入，侧边栏计数与筛选结果不一致（如 832 vs 814），改为只统计正 Gid。真实库副本验证：单标签 api=1773=计数 1773；双标签（chinese+monster hunter）AND 命中 49=SQL 交集（OR 为 1776）
- **带空格标签搜索不到修复（2026-09-01）**：`tag:big breasts` 搜不到——后端搜索按空格拆词，被拆成 `tag:big`+`breasts` 两个词。修复：① 后端分词支持**双引号分组**（`tag:"big breasts"` 作为一个词，引号剥离）；② `tag:` 过滤兼容**下划线写法**（`tag:big_breasts` 转空格匹配）；③ 前端补全插入带空格标签/作者名时**自动加引号**（`tag:"big breasts"`），去重逻辑同步用引号后语法。真实库副本验证：引号写法与下划线写法均命中 2047（big breasts 标签计数）
- **线上 API 为旧进程导致修复未生效（2026-09-01，已部署）**：用户反馈 `tag:"big breasts"` 仍搜不到——线上 API（PID 9:26 启动）跑的是引号分词修复**之前**的二进制，新代码未生效。实测线上 0 vs 新构建 2047，确认后重建 Debug 并以项目目录为工作目录、Development 环境重启 API（PID 167980）：`tag:"big breasts"` 线上返回 **2047**、`tag:milf` 320 正常、控制台不受影响。**注意：API/控制台运行的是独立进程，代码改动后必须重启对应进程才生效**
- **在线模块“完全无法使用”排查（2026-09-01）**：后端在线搜索/热门/里站全部正常（EX 搜索 25 条、热门/表站 200），前端 Vite 代理正常，Cookie 已配置——真正的元凶是**连通性误报**：`/api/ehentai/connectivity` 用不走代理的裸 HttpClient 直连 EH，而用户环境必须走代理（GFW），导致 `reachable:false` 频繁出现 → 页面顶部红色横幅「⚠ 无法直接访问 E-Hentai，请配置代理」常驻 → 用户误以为在线模块坏了。修复：`CheckConnectivityAsync` 改用与真实请求相同的共享 ehentai 客户端（代理+Cookie），横幅文案同步为「已按配置的代理检测」。部署后连通性 **3/3 reachable:true**，EX 搜索 25 条秒回。附带发现：EX 搜索偶发慢（>25s），属瞬时网络波动非代码问题
- **在线卡片“汉语”语言标记（2026-09-01，已部署）**：`GalleryItem` 增加 `Language`；ParseList 在**链接后 3000 字符独立窗口**解析 `language:xxx` 标签（避免行边界 `</tr>` 截断），标题 `[Chinese]/[中文]/[汉语]` 后缀兜底；前端卡片评分右侧显示绿色「汉语」徽标（语言含 chinese/中文/汉语时）。**零额外网络开销**：语言来自搜索响应已有 HTML，无额外请求。数据限制：EH 搜索行内并非总渲染语言标签（通用搜索 12/25 有语言，`language:chinese` 搜索 25/25 全命中）；已部署验证
- **控制台下载列表再次为空根因与修复（2026-09-01，已部署+回归验证）**：用户再次反馈列表为空——API 正常（110 任务）、控制台为可用的 9:32 构建、反序列化验证通过。根因：`DownloadMonitor.LoopAsync` 的 `catch (OperationCanceledException) { break; }` 把 **HTTP 超时**（TaskCanceledException 是 OperationCanceledException 子类）当成取消信号，**永久 break 掉轮询循环**——API 重启/慢响应时监控线程死亡，之后列表永远为空。修复：`catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }`，超时改按瞬时失败指数退避（首次/每 6 次留日志）。回归验证：杀掉 API → 日志出现「拉取下载任务超时 x1」→ 重启 API → 列表自动恢复（2 下载中 · 102 等待中 · 2 失败）
- **新下载作品标签化链路验证（2026-09-01）**：确认新下载作品完整接入标签系统——下载完成写 meta.json（tags 字典）→ `GallerySync.SyncDirectoryAsync` 解析并转 `["ns:name"]` AllTags → `SyncGalleryTagsAsync` 调 `EnsureTagsCoreAsync`（自动建 tag + 填 NameCn 翻译）→ work_tag 先清后建（幂等）；全量扫描/增量/下载完成三条路径均调用，专辑自动分配已移除。真实数据验证：最近 5 部下载作品 meta 标签全部有 work_tag（missing=0），翻译 6/6 有中文；多出的 `album:xxx` 为专辑迁移按设计补的标签
- **已完成任务重启后消失修复（2026-09-01，已部署）**：用户反馈三个已完成任务（3206615/3206471/3206546）前端不显示——根因：`LoadTasksFromDb` 只加载 `Status != "completed"`，API 重启后**已完成任务全部不载入内存**（DB 有 2740 条已完成，API 只返回活跃 65 条），web/控制台列表因此丢失历史完成记录。修复：启动时加载全部活跃任务 + **最近 100 条已完成**（按 CompletedAt 倒序，避免全量撑爆界面）；`GetAllTasks` 排序改为**活跃在前、已完成按完成时间倒序**；前端 web 页与控制台均新增**「已完成」状态筛选 chip**。验证：API 返回 100 completed + 活跃，三个 gid 全部回归
- **本地模块看不到新下载作品的根因与修复（2026-09-01，已部署+复现验证）**：用户澄清是**本地画廊模块**看不到 3206615/3206471/3206546——磁盘目录和 meta.json 都在，但 `local_gallery` 无记录。复现（临时目录放三部画廊+真实库副本）命中 `UNIQUE constraint failed: tag.Id`。根因：`SyncGalleryTagsAsync` 用 `db.WorkTags.Add(new WorkTag { WorkId, Tag = t })` 导航写法，**EF 的 Add 会级联把整张关系图标记为 Added**——已存在的标签（带真实 Id）被当成新增，用其 Id 再次 INSERT 撞主键 → 整个同步回滚 → 画廊不入库。迁移没踩坑是因为它用 `TagId = t.Id`（无导航级联）。修复：**已存在标签（Id≠0）改用 `TagId = t.Id` 直接引用，新标签（Id=0）保持导航 Added 由 EF 生成 Id**。部署后全扫恢复 2728→**2808** 画廊、work_tag 47802→**49279**，三部作品 meta/work_tag 完全一致（missing=0）

### 环境
- 新增根目录 `NuGet.Config`：`<clear/>` 清空继承的 fallback 包目录，修复本机（VS 机器级配置残留旧机路径）导致的 restore/构建 NU1301

## 6. 已知遗留 / 注意点

| 项 | 说明 |
|---|---|
| ~~`/api/settings/reader` 双轨~~ | **已统一（2026-09-01）**：`ReaderSettings` 新增 `Data` JSON 列，GET 返回引擎设置快照、PUT 落库；引擎挂载时读回并应用（覆盖本地）、偏好变更写透后端（首轮读取完成前不回写，避免覆盖服务端）；localStorage 仍是首帧快速路径 |
| ~~缩略图条上限 25~~ | **已解决（2026-09-01）**：窗口化渲染当前页 ±40（最多 81 张），长画廊全本可跳且 DOM/请求有界 |
| ~~滚动模式渲染~~ | **已解决（2026-09-01）**：帧加 `content-visibility: auto` + `contain-intrinsic-size: auto 估算尺寸`（浏览器级窗口化——离屏帧跳过渲染，占位尺寸先撑起完整滚动条，图片加载后自动记住真实尺寸）；偏移恢复守卫改为等待目标帧真实尺寸（dimsMap），避免按估算落位 |
| ~~页面列表 10s 缓存~~ | **已解决（2026-09-01）**：`GallerySync.SyncDirectoryAsync` / `RemoveDirectoryAsync` 成功后调用 `InvalidateScanCache()`，下载完成/文件变动即失效缓存，不再等 10s TTL |
| ~~`getAvailableArea` 硬编码~~ | **已解决（2026-09-01）**：运行时测量 `.r-hud`/`.r-bar` 实际高度（ReaderLocal 测量 + `updateChrome` 传入），缩略图展开/UI 隐藏都精确；初始兜底仍 44/36 不回归 |
遗留工作区文件 | `.codebuddy/memory/2026-08-18.md`、`scripts/verify_g.py` 未跟踪（verify_g.py 计划删除；其余工作已按功能拆分提交） |

## 7. 待办 / 路线图

### 阅读器路线图（见 reader-interaction-model.md §8）
- ~~阶段 2b：RTL 横向反序布局~~（**已完成 2026-09-01**：readingOrder 持久化 + row-reverse 布局 + 热区/键盘/滑动/自动阅读适配）
- ~~阶段 3：滚动进度细化~~（**已完成 2026-09-01**：页内偏移存储/恢复 + 模式切换锚点）
- ~~阶段 4 余项：读到每部尾部预取下一部 pages 列表~~（**已完成 2026-09-01**：读尾 5% 预取 + 会话缓存 + 切换秒开）

### 交接文档遗留待办（HANDOVER-2026-08-18）
- ~~`publish.ps1` 发布未包含 WPF 控制台~~（**已完成**：脚本第 4 步含控制台自包含发布 + 合并 appsettings）
- ~~复核 `album_config` 是否有 `Order` 列~~（**已确认存在**：`LocalEntities.AlbumConfig.Order` + 迁移）
- ~~控制台 `IsPortOpen` 健康检查用 `localhost`~~（**已修复**：C# `AppConfig.Url` 与 Python `is_port_open` 均 `127.0.0.1`）
- AI 生成作品"超级桶"分类方案未定
- ~~Python 控制台 API 启动超时 9s 偏短~~（**已修复 2026-09-01**：9s → 30s）
- ~~`DownloadMonitor` 删除任务后不主动刷新~~（**已解决**：`RemoveTaskAsync` 删除后立即 `GetDownloadTasksAsync` + `OnTasksUpdated` 重建）

## 8. 文档索引

| 文档 | 内容 |
|---|---|
| [knowledge-base.md](knowledge-base.md) | **本文件：总入口** |
| [README.md](../README.md) | 项目说明、技术栈、完整 API 表 |
| [project-overview.md](project-overview.md) | 2.0 版详细描述（功能模块） |
| [reader-interaction-model.md](reader-interaction-model.md) | 阅读器交互模型设计（正交模型/输入矩阵/自动阅读/进度/导航）+ 实施阶段 |
| [HANDOVER-2026-08-18.md](HANDOVER-2026-08-18.md) | 重装交接：数据备份清单、环境依赖、踩坑记录、待办 |
| [design/architecture.md](design/architecture.md) | 架构设计 |
| [design/design-language.md](design/design-language.md) | 暗色玻璃系设计语言 v1.0 |
| [design/qa-report.md](design/qa-report.md) | QA 报告 |
| [api/api-spec.md](api/api-spec.md) | API 规划文档 |
| [reader-features.md](reader-features.md) | 阅读器功能列表 |
| [optimization-analysis-*.md](optimization-analysis-2026-07-19.md) | 两期优化分析 |
| [backend-phase2-plan.md](backend-phase2-plan.md) / [next-phase-optimization.md](next-phase-optimization.md) | 后端阶段计划 / 下一阶段优化 |
| [local-gallery-enhancement.md](local-gallery-enhancement.md) | 本地画廊增强 |

## 9. 运行与验证

```powershell
# 启动（一键）：双击 启动管理工具.bat
# 后端
dotnet run --project src/backend/MangaManager.Api          # http://localhost:5208
# 前端
cd src/frontend/manga-ui; npm run dev                       # http://localhost:5173
# 构建验证
dotnet build src/backend/MangaManager.Api/MangaManager.Api.csproj
cd src/frontend/manga-ui; npm run build; npx eslint src/pages/ReaderLocal.jsx src/visual-test/reader

# 本地备份（工作树 + SQLite 一致性快照 + git bundle）
python scripts/devops/backup_local.py                 # 默认输出 D:\MangaManager_Backups\MangaManager_<时间戳>
python scripts/devops/backup_local.py --dest E:\Backups

# 端到端冒烟（在真实库副本上起临时 API，端口 5299）
python scripts/smoke_test.py --build                  # 首次/临时目录被清后必须带 --build
```

环境坑：
- **NuGet fallback**：本机 `C:\Program Files (x86)\NuGet\Config\Microsoft.VisualStudio.FallbackLocation.config` 残留旧机路径 `D:\Coder\Share\NuGetPackages`，仓库 `NuGet.Config` 已用 `<clear/>` 规避；彻底修复需管理员编辑该机器级配置
- **ExHentai（里站）访问**：exhentai.org 的 DNS 在本网络被污染（解析到 Facebook IP，直连返回空 200）；必须配置 `Ehentai:Proxy`（本机代理 `http://127.0.0.1:7890`）。里站 Cookie 失效时 EH 返回 `Set-Cookie: igneous=mystery` 并给空页——重新导出有效 `igneous` 即可；`ValidateAsync` 已能识别该状态
- **IPv6 localhost**：API 调用一律用 `127.0.0.1`（`localhost` 可能解析到 IPv6 超时）
- **端口**：5208/5173（曾用 5000/5001 被 NVIDIA/Dify 占用）
- **构建时 API 进程占用**：API 正在运行时 `dotnet build` 拷 DLL 会失败，改用 `-o <临时目录>` 输出即可
