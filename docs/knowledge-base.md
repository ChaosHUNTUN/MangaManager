# MangaManager 项目知识库

> 用途：后续会话 / 新接手任务时**先读本文档**，即可恢复项目全貌。细节内容通过链接跳转。
> 最后更新：2026-09-01（含阅读器交互模型、桌面控制台重构、移动端适配、全量标签化管理 P0–P4）

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
| SettingsController | `/api/settings/reader` | 阅读器设置 JSON 快照读写（`ReaderSettings.Data` 列；localStorage 快速路径 + 后端持久化双轨） |
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
```

环境坑：
- **NuGet fallback**：本机 `C:\Program Files (x86)\NuGet\Config\Microsoft.VisualStudio.FallbackLocation.config` 残留旧机路径 `D:\Coder\Share\NuGetPackages`，仓库 `NuGet.Config` 已用 `<clear/>` 规避；彻底修复需管理员编辑该机器级配置
- **ExHentai（里站）访问**：exhentai.org 的 DNS 在本网络被污染（解析到 Facebook IP，直连返回空 200）；必须配置 `Ehentai:Proxy`（本机代理 `http://127.0.0.1:7890`）。里站 Cookie 失效时 EH 返回 `Set-Cookie: igneous=mystery` 并给空页——重新导出有效 `igneous` 即可；`ValidateAsync` 已能识别该状态
- **IPv6 localhost**：API 调用一律用 `127.0.0.1`（`localhost` 可能解析到 IPv6 超时）
- **端口**：5208/5173（曾用 5000/5001 被 NVIDIA/Dify 占用）
- **构建时 API 进程占用**：API 正在运行时 `dotnet build` 拷 DLL 会失败，改用 `-o <临时目录>` 输出即可
