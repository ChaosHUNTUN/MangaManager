# MangaManager 项目长期记忆

## 设计语言 (Design Language v1.0 — 2026-07-28)
- **核心理念**: 暗色·玻璃·克制 — 原生暗色基底 + 毛玻璃深度 + 克制动效
- **六条核心原则**:
  1. 暗色为骨 — 从 #000 canvas 层级递进，不是"加暗色模式的亮色设计"
  2. 玻璃为衣 — backdrop-blur 毛玻璃面板, rgba(13,13,20,0.88) + blur(20px)
  3. 薰衣草紫 — #8b7aa0 主色调, #5a8a8a 极客青辅助色, 低饱和不攻击眼睛
  4. 线条优先 — Lucide React 1.5px 线性图标, 拒绝面性图标在暗色下的厚重感
  5. 克制动效 — cubic-bezier(0.16,1,0.3,1), 60-350ms, 无弹跳无旋转, prefers-reduced-motion 归零
  6. 留白呼吸 — 4px 基础单位, 卡片间距 16px, 内容最大宽 1400px
- **禁止**: Emoji 作为图标、纯色硬边框弹窗、高饱和度霓虹色、字重 < 400、动效时长 > 400ms
- 设计语言页: `src/visual-test/pages/DesignManifesto.jsx` → `/visual-test/design`
- **图标按钮全局规则** (`App.css`): `button:has(>svg)` 自动应用 `inline-flex` + `gap:6px` + 居中对齐；`.btn-primary > svg = 16px`、`.btn-outline/btn-sm/btn-danger > svg = 14px`，统一图标尺寸无需 JSX 手动指定
- **AntV 图表暗色主题** (`ChartsShowcase.jsx`): 不依赖 ConfigProvider，**每张图都要传 `theme={{ type: 'classicDark', colors10: PALETTE, background: 'transparent' }}`**；Tooltip 用 `domStyles` 覆盖为毛玻璃 (rgba(13,13,20,0.92) + blur(12px))；坐标轴 `gridStroke: rgba(255,255,255,0.03)`、label `fill: '#8b8594'`；颜色面板固定为 `#8b7aa0 #5a8a8a #a08050 #b06060 #6b8b6b #7d6f8a #4a7575 #8a6d50`

- 阅读器架构: `src/visual-test/reader/` — useReaderEngine(扁平状态机, 零扭曲getImageLayout) + PaginatedView(swipe翻页+左右点击区) + ContinuousView(grab scroll+方向感知) + ReaderToolbar(HUD+底栏+缩略图条) + reader.css。入口 `ReaderShowcase.jsx` → `/visual-test/reader`

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

### 8. ExHentai 下载 Bug 修复（2026-07-21）
- **根因**: `GetPagesAsync` → `GetGalleryPageHtmlAsync` 硬编码使用 `HOST_E` (e-hentai.org)，导致里站专有作品获取页面HTML时返回 "unavailable"，解析出 0 个图片页面
- **修复**: 
  - `GetPagesAsync`、`GetGalleryPageHtmlAsync`、`FetchImageFromPageAsync` 增加 `bool isExhentai` 参数
  - `DownloadManager.DownloadTaskAsync` 将 `detail.IsExhentai` 传递给上述方法
  - `GetGalleryPageHtmlAsync` 增加自动回退：表站返回 "unavailable" 时自动重试里站

## 项目路径
- 后端: `d:\MangaManager\src\backend\MangaManager.Api`
- 前端: `d:\MangaManager\src\frontend\manga-ui`
- 桌面: `d:\MangaManager\src\desktop\MangaManager.Console`
- 数据库: `d:\MangaManager\src\backend\MangaManager.Api\manga.db`

## 运行方式
- WPF控制台 `启动管理工具.bat` 为主入口
- 或手动: `dotnet run --project src/backend/MangaManager.Api` + `npx vite --port 5173` 在 `src/frontend/manga-ui`
