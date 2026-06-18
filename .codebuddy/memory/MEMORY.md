# MangaManager 项目长期记忆

## 技术架构
- **三层架构**: React 19 前端(5173端口) / ASP.NET Core 9 API(5000端口) / WPF桌面控制台
- **数据库**: SQLite(开发)/MySQL双模式，EF Core 9 迁移管理
- **核心功能**: E-Hentai在线搜索下载、本地画廊管理、阅读器

## 重大项目决策（2026-06-17/18）

### 1. 本地画廊元数据 DB 化
- **决策**: 新建 `local_gallery` 表替代纯文件系统扫描，`.meta.json` 保留为备份和详情页数据源
- **表结构**: Gid(PK)/Title/DirPath/Category/Language/Rating/FileCount/FileSize/CoverFile/Artists(JSON)/Groups(JSON)/OnlineUrl/Token/DownloadedAt/LastModified/SyncedAt
- **索引**: Category/Language/DownloadedAt/LastModified
- **后台同步**: `GallerySyncService` (BackgroundService) — 启动全量扫描→写DB，FileSystemWatcher 实时增量，5分钟一致性检查
- **Service 改造**: `LocalGalleryService` 注入 `IServiceScopeFactory`，查询全部改为 EF LINQ

### 2. 专辑配置扩展
- **新增字段**: `Count`(INTEGER) / `KeyTag`(TEXT, EH标准标签)
- **新增 API**: `GET /api/albums/summary`(简略列表) / `GET /api/albums/{key}/detail`(含gids+keyTag)
- **自动同步**: Save时 `Count = gids.Length`, Key含冒号自动设为KeyTag

### 3. 性能优化汇总
- 扫描缓存从 5s→30s (后因 DB 化移除)
- GetCover 改用 DB 查询替代磁盘扫描
- GetPageFilePath 添加 10s 文件列表缓存
- GetDetailAsync 合并重复 meta.json 读取
- 翻译搜索预建索引缓存
- 翻页从磁盘扫描 → SQL LIMIT/OFFSET (毫秒级)

### 4. 前端 Bug 修复
- `loadGalleries()` 未定义 → `loadMetas()+loadPaged()`
- 两个 useEffect 重复调用 `/api/local/galleries/paged` → 合并为一个
- 翻译 useEffect StrictMode 双重调用 → 防重复 ref
- 阅读器退出丢失筛选状态 → `reader-local-return-url` sessionStorage
- Esc 在切换画廊后退错位置 → 导航到完整返回URL
- 随机模式退出阅读器后丢失 → URL `random=true` 标记 + sessionStorage 缓存

### 5. 在线画廊默认值
- `exhentai`/`popularMode` 默认 `true`，自动加载里站热门

### 6. 下载断点续传
- 进程崩溃后自动 `pending` 入队，保留 `.progress` 从断点恢复

### 7. WPF 控制台稳定性
- `SocketsHttpHandler.ConnectTimeout=2s` 限制 TCP 连接超时
- `_timersPaused` 标志在服务启停期间暂停轮询
- HTTP 调用移出 UI 线程

## 项目路径
- 后端: `d:\MangaManager\src\backend\MangaManager.Api`
- 前端: `d:\MangaManager\src\frontend\manga-ui`
- 桌面: `d:\MangaManager\src\desktop\MangaManager.Console`
- 数据库: `d:\MangaManager\src\backend\MangaManager.Api\manga.db`

## 运行方式
- WPF控制台 `启动管理工具.bat` 为主入口
- 或手动: `dotnet run --project src/backend/MangaManager.Api` + `npx vite --port 5173` 在 `src/frontend/manga-ui`
