# 📚 MangaManager 项目详细描述

> **版本**: 2.0  
> **仓库**: https://github.com/ChaosHUNTUN/MangaManager.git  
> **最后更新**: 2026-06-12  

---

## 一、项目概述

MangaManager 是一个 **E-Hentai 漫画下载、本地管理与在线阅读** 的全栈工具。用户可通过浏览器搜索 E-Hentai 画廊、一键下载到本地、使用标签系统分类管理，并借助内置网页阅读器（支持 4 种缩放模式、滚动翻页、幻灯片、沉浸模式）进行阅读。

项目采用三层架构：
- **前端**：React 19 + React Router 7 + Vite 8（端口 5173）
- **后端**：ASP.NET Core 9 Web API（端口 5000）
- **桌面控制台**：WPF (.NET 9) 作为服务启停 + 下载监控面板

数据库默认使用 SQLite（开发/单机），支持切换到 MySQL（生产）。

---

## 二、目录结构

```
MangaManager/
├── README.md                          # 项目说明
├── docs/                              # 设计文档
│   ├── api/api-spec.md               # API 接口规划文档
│   ├── design/                        # 架构设计 / 部署分析 / QA 报告
│   ├── project-overview.md           # 本文件
│   └── *.md                          # 各功能模块文档
├── scripts/                           # 运维脚本
│   ├── db/init.sql                   # MySQL 初始化 DDL
│   ├── devops/
│   │   ├── publish.ps1               # 一键发布（自包含 win-x64）
│   │   ├── deploy.ps1                # 开发模式一键部署
│   │   ├── test_api.py               # API 自动化测试
│   │   └── check_tags.py             # 数据库标签检查
│   ├── list_albums.py                # 列出专辑配置
│   └── update_album_names.py         # 批量更新专辑中文名
├── src/
│   ├── backend/                       # .NET 9 后端
│   │   ├── MangaManager.Api/         # Web API 入口 + Controllers
│   │   ├── MangaManager.Core/        # 实体模型 + DTO
│   │   ├── MangaManager.Data/        # EF Core DbContext
│   │   ├── MangaManager.Services/    # 业务逻辑层
│   │   └── MangaManager.slnx         # 解决方案文件
│   ├── frontend/
│   │   └── manga-ui/                 # React 19 前端
│   └── desktop/
│       └── MangaManager.Console/     # WPF 桌面控制台
├── dist/                              # 发布产物
├── 未翻译专辑翻译表.xlsx              # 翻译工作文件
└── 启动管理工具.bat                    # 遗留 Python 管理工具入口
```

---

## 三、技术栈详情

| 层 | 技术 | 版本 | 说明 |
|:---|:-----|:-----|:-----|
| 后端框架 | ASP.NET Core Web API | .NET 9 | C# 13 |
| 前端框架 | React + React Router | 19.2 / 7.16 | JSX 函数组件 + Hooks |
| 构建工具 | Vite | 8 | HMR 开发服务器 |
| 数据库 | SQLite / MySQL | EF Core | 默认 WAL 模式 |
| ORM | Entity Framework Core | 9.x | DbContext + EnsureCreated |
| 桌面框架 | WPF | .NET 9-windows | 系统托盘 + 服务管理 |
| HTTP 客户端 | HttpClientFactory | - | E-Hentai 专用命名客户端 |
| 图片代理 | 后端代理转发 | - | 绕过 E-Hentai 防盗链 |
| 实时推送 | SSE / WebSocket | - | 下载进度 + 扫描进度 |

---

## 四、核心功能模块

### 4.1 本地画廊管理（`/` 首页）

- **画廊列表**：封面墙（grid）或列表（list）两种视图，支持分页（30/60/120）
- **搜索过滤**：标题搜索 + E-Hentai 标签翻译搜索（中文输入自动翻译为英文标签查询）
- **排序**：按修改时间、标题、页数、大小 共 8 种排序方式
- **自定义专辑**：可将作品拖入自定义专辑分组，支持拖拽排序
- **批量操作**：批量删除、批量重新下载
- **导入外部作品**：从本地文件夹导入图片，自动添加元数据标签
- **筛选状态保持**：从阅读器返回后自动恢复搜索/排序/专辑筛选条件（通过 sessionStorage）

### 4.2 E-Hentai 在线搜索（`/ehentai`）

- **Cookie 认证**：支持 ipb_member_id + ipb_pass_hash + igneous 三件套，兼容 ExHentai
- **画廊浏览**：懒加载列表，支持搜索、分类过滤、评分筛选、分页
- **画廊详情**：标签展示（含中文翻译）、预览图、页数/大小信息
- **一键下载**：添加到下载队列，后台异步下载
- **标签翻译**：E-Hentai 命名空间标签自动翻译为中文
- **标签屏蔽**：支持添加/删除屏蔽标签，过滤不感兴趣的内容
- **图片代理**：后端代理 E-Hentai 图片，绕过防盗链

### 4.3 下载管理器

- **任务队列**：pending → downloading → paused/completed/failed 状态机
- **实时进度**：SSE 事件流 + WebSocket 双通道推送下载进度
- **速率计算**：实时显示下载速度（B/s、KB/s、MB/s）
- **任务控制**：暂停/恢复/取消/重试/重试全部失败
- **遗留恢复**：支持从旧版 `.progress` 文件恢复未完成下载
- **下载后处理**：自动解包、提取封面、写入 `.eh` 元数据文件

### 4.4 阅读器

#### 本地阅读器（`/reader-local/:gid`）
- **4 种缩放模式**：适应宽度 / 适应高度 / 适应页面 / 原始大小
- **2 种阅读模式**：翻页模式（paged）+ 滚动模式（scroll）
- **3 种翻页效果**：淡入淡出 / 滑动 / 无效果
- **幻灯片模式**：自动翻页，间隔 1-30 秒，支持循环
- **沉浸模式**：3 秒无操作自动隐藏 UI
- **缩略图导航**：T 键打开缩略图网格快速跳转
- **键盘快捷键**：←→/AD 翻页、空格切换幻灯片、F 切换缩放、Esc 返回
- **画廊内导航**：上一部/下一部切换（基于 reader-local-list）
- **阅读进度**：自动保存/恢复每部作品的阅读页码
- **设置持久化**：所有阅读器设置保存到数据库

#### 在线阅读器（`/reader/:id`）
- 用于旧版 `Manga` 实体扫描入库的漫画
- 功能与本地阅读器类似

### 4.5 扫描引擎

- **智能叶子识别**：递归扫描目录，找到直接包含图片的最深层文件夹作为漫画单元
- **编号前缀处理**：自动去除文件夹名的 `数字-` 前缀
- **SSE 实时进度**：四阶段（scanning → loading → processing → complete）
- **自动标签**：上层文件夹名自动创建为 author 分类标签

### 4.6 标签系统

- **8 大分类**：作者、翻译团队、创作风格、女性角色、男性角色、来源作品、语言、其他
- **多对多关联**：每部漫画每个分类可有多个标签
- **标签自动补全**：输入时从 E-Hentai 标签库获取建议
- **批量操作**：支持批量添加标签到多部漫画

### 4.7 WPF 桌面控制台

- **服务管理**：一键启动/停止 API 后端（dotnet run）+ 前端（vite）
- **下载监控**：实时显示下载任务列表、进度、速率
- **系统托盘**：最小化到托盘，后台运行
- **快捷入口**：一键打开浏览器访问前端页面
- **单实例运行**：防止重复启动

---

## 五、后端架构

### 5.1 项目分层

```
MangaManager.Api         → Controllers（路由 + 参数校验）
    ↓ 依赖
MangaManager.Services    → 业务逻辑（EhentaiService, MangaService, 
                           LocalGalleryService, DownloadManager）
    ↓ 依赖
MangaManager.Data        → EF Core DbContext（MangaDbContext）
    ↓ 依赖
MangaManager.Core        → 实体（Entities.cs）+ DTO（DTOs.cs）
```

### 5.2 Controller 清单（10 个）

| Controller | 路由前缀 | 功能 |
|:---|:---|:---|
| `MangaController` | `/api/manga` | 漫画 CRUD、扫描、重命名、删除 |
| `TagController` | `/api/tag` | 标签 CRUD、分类定义 |
| `AlbumsController` | `/api/albums` | 专辑配置读写 |
| `CoverController` | `/api/cover` | 封面图片服务 |
| `ReaderController` | `/api/reader` | 阅读器页面图片服务 |
| `ReadingProgressController` | `/api/readingprogress` | 阅读进度读写 |
| `SettingsController` | `/api/settings` | 阅读器设置读写 |
| `LocalGalleryController` | `/api/local` | 本地画廊 CRUD、导入、重新下载 |
| `EhentaiController` | `/api/ehentai` | E-Hentai 浏览/搜索/下载/标签 |
| `DownloadController` | `/api/download` | 下载任务管理 + SSE/WebSocket 推送 |
| `FilesystemController` | `/api/filesystem` | 文件系统浏览（磁盘/目录） |

### 5.3 Service 层（4 个核心服务）

| 服务 | 生命周期 | 职责 |
|:---|:---|:---|
| `MangaService` | Scoped | 漫画扫描、搜索、标签关联、CRUD |
| `LocalGalleryService` | Singleton | 本地画廊文件管理、导入导出、元数据 |
| `EhentaiService` | Singleton | E-Hentai API 交互、Cookie 管理、标签翻译 |
| `DownloadManager` | Singleton | 下载队列管理、并发控制、进度推送 |

### 5.4 数据库表

| 表名 | 实体 | 说明 |
|:---|:---|:---|
| `manga` | `Manga` | 旧版漫画主表（扫描入库） |
| `tag` | `Tag` | 标签（8 分类） |
| `manga_tag` | `MangaTag` | 漫画-标签多对多 |
| `author` | `Author` | 作者 |
| `manga_author` | `MangaAuthor` | 漫画-作者多对多 |
| `reading_progress` | `ReadingProgress` | 旧版阅读进度 |
| `scan_log` | `ScanLog` | 扫描日志 |
| `download_task` | `DownloadTask` | 下载任务（持久化） |
| `reader_settings` | `ReaderSettings` | 阅读器设置（单行） |
| `album_config` | `AlbumConfig` | 自定义专辑配置 |
| `local_reading_progress` | `LocalReadingProgress` | 本地画廊阅读进度 |

### 5.5 关键设计

- **响应格式**：统一 `ApiResponse<T>` 包装 `{ success, data, message }`
- **数据库双模式**：`appsettings.json` 中 `Database:Provider` 切换 sqlite/mysql
- **WAL 模式**：SQLite 启用 WAL + NORMAL synchronous，支持并发读写
- **自动备份**：每日自动备份 SQLite 数据库，保留最近 7 个
- **CORS**：开发模式 AllowAnyOrigin，生产模式同源托管
- **SPA fallback**：生产模式所有非 `/api` 请求返回 `index.html`
- **全局异常处理**：中间件捕获所有未处理异常，返回 JSON 500 响应

---

## 六、前端架构

### 6.1 页面路由

| 路由 | 组件 | 功能 |
|:---|:---|:---|
| `/` | `LocalGallery` | 本地画廊首页（封面墙 + 筛选 + 专辑） |
| `/local` | `LocalGallery` | 同上 |
| `/ehentai` | `EHentai` | E-Hentai 在线搜索/浏览/下载 |
| `/reader-local/:gid` | `ReaderLocal` | 本地画廊阅读器 |
| `/reader/:id` | `Reader` | 旧版漫画阅读器 |
| `/manga/:id` | `Detail` | 旧版漫画详情 |
| `/downloads` | `DownloadMonitor` | 下载任务监控页面 |
| `*` | `NotFound` | 404 页面 |

### 6.2 组件树

```
App
├── OfflineBanner（后端离线时显示）
├── LocalGallery（首页）
│   ├── AlbumSidebar（专辑侧边栏，支持拖拽排序）
│   ├── GalleryCard / GalleryRow（画廊卡片/列表行）
│   └── GalleryDetail（详情弹窗）
├── EHentai（在线画廊）
│   └── EhentaiReader（在线预览弹窗）
├── ReaderLocal（本地阅读器）
│   └── PageImage（图片渲染组件）
├── Reader（旧版阅读器）
├── Detail（旧版详情页）
└── DownloadMonitor（下载监控）
```

### 6.3 核心 Hooks

| Hook | 文件 | 功能 |
|:---|:---|:---|
| `useReaderSettings` | `useReaderSettings.js` | 阅读器设置持久化（数据库读写） |
| `useGalleryDrag` | `hooks/useGalleryDrag.js` | 画廊拖拽排序（专辑内） |

### 6.4 API 层

所有后端调用封装在 `api.js`，共 **50+ 个函数**，按模块组织：
- 漫画/标签 CRUD
- 本地画廊（列表/详情/页面/封面/导入/删除/重新下载）
- E-Hentai（Cookie/画廊/搜索/标签翻译/图片代理）
- 下载任务（增删改查/暂停恢复/SSE）
- 阅读进度/阅读器设置
- 专辑配置
- 文件系统浏览

### 6.5 状态管理

- **无全局状态库**：纯 React `useState` + `useRef` 管理组件状态
- **跨页面状态**：通过 `sessionStorage` 传递（阅读器列表、画廊筛选恢复）
- **阅读器设置**：通过 API 持久化到数据库 `reader_settings` 表

---

## 七、发布部署

### 7.1 开发模式

```bash
# 终端 1 - 后端
cd src/backend/MangaManager.Api
dotnet run
# → http://localhost:5000

# 终端 2 - 前端
cd src/frontend/manga-ui
npm install
npx vite
# → http://localhost:5173
```

### 7.2 发布流程（`publish.ps1`）

1. `npm run build` 构建前端 → `dist/`
2. `dotnet publish -r win-x64 --self-contained` 发布后端
3. 复制前端产物到 `wwwroot/`
4. 生成默认 `appsettings.json` + `README.txt`
5. 清理 `.pdb` 调试文件

产物：自包含 Windows x64 单文件夹，双击 `MangaManager.Api.exe` 启动，端口 5000 同时托管 API 和前端。

---

## 八、当前数据规模

| 指标 | 数量 |
|:---|:---|
| 本地画廊作品 | 约 200+ 部 |
| 自定义专辑 | 148 个 Key |
| 已翻译专辑名 | 138 个 |
| 未翻译专辑名 | 70 个（多为纯英文/罗马字名称） |
| 标签分类 | 8 个 |
| E-Hentai 标签翻译 | 完整命名空间翻译库 |

---

## 九、开发约定

- Controller 只做路由和参数校验，业务逻辑在 Service
- 统一响应格式 `ApiResponse<T>`
- 前端 API 调用统一在 `api.js`，组件通过 import 使用
- 页面组件放在 `pages/`，可复用组件放在 `components/`
- 数据库迁移用 `EnsureCreated()` + 手动 ALTER TABLE
- `.eh` 文件存储下载画廊的 gid/token 元数据
- `ehentai_cookies.json` 存储 Cookie（已 gitignore）

---

## 十、近期重要更新（2026-06）

1. **删除 `OpenController`**：移除 NeeView 外部阅读器集成，统一使用内置网页阅读器
2. **移除 `NeeViewService`**：清理外部阅读器服务代码
3. **本地画廊筛选状态保持**：从阅读器返回后恢复搜索/排序/专辑筛选（sessionStorage）
4. **专辑名称批量翻译**：148 个专辑 Key 批量更新为中文显示名
5. **E-Hentai 链接域名切换**：详情弹窗根据 `isExhentai` 动态切换链接域名
6. **前端性能优化**：图片懒加载、请求取消（AbortController）、预加载
