# 📚 MangaManager

E-Hentai 漫画下载、管理与阅读工具 —— 在线搜索下载、本地画廊管理、网页阅读器。

## 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 后端 | ASP.NET Core Web API | .NET 9 |
| 前端 | React + React Router | 19.2 / 7.16 |
| 构建 | Vite | 8 |
| 数据库 | SQLite（默认）/ MySQL（可选） | EF Core 9 + Migrations |
| 阅读器 | 内置网页阅读器 | - |
| 桌面 | WPF 控制台 | .NET 9 |

## 快速开始

> **一键启动（推荐）**：双击根目录 `启动管理工具.bat`。它先 `dotnet build` 再启动 WPF 桌面控制台
> （`src/desktop/MangaManager.Console`），由控制台负责启停 API/前端、下载监控与托盘图标。
> 这是项目**唯一**的启动入口（原 Python 启动器 `manga_manager.py` 已删除）。
> 下面的第 1/2 步是手动分别启动，适合开发调试。

### 环境要求

- .NET SDK 9.0+
- Node.js 20+
- 可选：MySQL 8.0+

### 1. 启动后端

```bash
cd src/backend/MangaManager.Api
dotnet run
# 默认监听 http://localhost:5208
```

### 2. 启动前端

```bash
cd src/frontend/manga-ui
npm install
npx vite
# 默认监听 http://localhost:5173
```

### 3. 访问

浏览器打开 `http://localhost:5173`

### 4. 指定画廊目录（首次必做）

启动后前端会自动检测：若后端没有检测到你配置过的库目录，会弹出引导让你**选择目录并保存**，
保存后会立即在后台扫描。之后随时可在顶部 **⚙ 设置** 页（`/settings`）调整，无需改配置文件、不用重启。

库目录 = 存放作品的根目录，每个作品是它的一个子文件夹：

```
G:\学习资料\本子\
├── 3206615-[作者] 标题\
└── 3206471-[作者] 标题\
```

也可以不走界面，直接用配置文件或环境变量指定。优先级：设置页保存的 `runtime_settings.json` > `appsettings` > 内置默认。

```jsonc
// src/backend/MangaManager.Api/appsettings.Development.json（本地开发，已 gitignore）
{ "Ehentai": { "DownloadDir": "G:\\学习资料\\本子" } }
```

> Windows 路径在 JSON 里必须写成双反斜杠 `\\`；环境变量写法 `Ehentai__DownloadDir=G:\学习资料\本子`。
> 未配置时使用内置默认 `<程序目录>/downloads`（位于构建输出目录，`clean`/重建时容易丢失）。

**⚙ 设置页还集中了其它运行时项**：E-Hentai Cookie（一键导出书签 / 剪贴板导入 / 验证登录 / 里站连通性）、网络代理（保存即生效）。

### 5. 运行测试

```bash
dotnet test src/backend/MangaManager.Tests/MangaManager.Tests.csproj
```

CI（`.github/workflows/ci.yml`）会在 push / PR 时跑：后端构建 + WPF 控制台构建 + 单元测试，
以及前端 `npm ci` + lint + build。

不想等 CI、或 Actions 不可用时，可以在本地跑同一套检查：

```powershell
pwsh -File scripts\devops\ci_local.ps1          # 跳过快照安装（假定 node_modules 已就绪）
pwsh -File scripts\devops\ci_local.ps1 -Install # 先跑 npm ci（需先停掉前端 dev server）
```

---

## 项目结构

```
MangaManager/
├── README.md
├── .clinerules                      # 全局开发规范（改核心架构后必须同步）
├── 启动管理工具.bat                  # 唯一启动入口（先构建，再启动 WPF 控制台）
├── .github/workflows/ci.yml         # CI：后端构建 + 测试 / 前端 lint + build
├── docs/                          # 设计文档
│   ├── api/api-spec.md
│   └── design/architecture.md
├── scripts/
│   ├── db/init.sql               # MySQL 初始化脚本
│   └── devops/                   # 运维脚本
│       ├── deploy.ps1            # 开发模式一键部署
│       ├── publish.ps1           # 发布打包
│       ├── check_tags.py         # 数据库检查
│       └── test_api.py           # API 测试
└── src/
    ├── backend/                   # .NET 后端
    │   ├── MangaManager.Api/     # Web API 入口 + Controllers
    │   ├── MangaManager.Core/    # 实体 + DTO
    │   ├── MangaManager.Data/    # EF Core DbContext
    │   ├── MangaManager.Services/# 业务逻辑
    │   └── MangaManager.Tests/   # xUnit 单元/集成测试
    ├── desktop/
    │   └── MangaManager.Console/ # WPF 桌面控制台（服务启停 + 下载监控 + 托盘）
    └── frontend/
        └── manga-ui/             # React 前端
```

---

## 数据库

### 实体模型（9 张表）

| 实体 | 表名 | 说明 |
|------|------|------|
| `Tag` | `tag` | 标签静态数据：名称、中文名(NameCn)、命名空间(Namespace)、分类、颜色、屏蔽标记(IsBlocked) |
| `WorkTag` | `work_tag` | 作品×标签多对多（WorkId = 本地画廊 Gid，**统一表**） |
| `TagOrder` | `tag_order` | 单个标签内的手动排序（连载顺序等） |
| `LocalGallery` | `local_gallery` | 本地画廊元数据（数据库即主索引，文件系统为图片源） |
| `LocalReadingProgress` | `local_reading_progress` | 本地画廊阅读进度 |
| `DownloadTask` | `download_task` | E-Hentai 下载任务 |
| `AlbumConfig` | `album_config` | 专辑配置（**方案已废弃**：数据保留不使用，成员已转 album 标签） |
| `ReaderSettings` | `reader_settings` | 阅读器全局设置 |
| `ScanLog` | `scan_log` | 扫描日志 |

### 数据库迁移

使用 EF Core Migrations 管理数据库版本。启动时自动执行 `Database.Migrate()`，对已有数据库自动插入 baseline 迁移记录，后续增量迁移通过 `dotnet ef migrations add` 生成。

```bash
# 生成新迁移（在 MangaManager.Data 项目下）
cd src/backend/MangaManager.Data
dotnet ef migrations add <MigrationName> --startup-project ../MangaManager.Api
```

### 数据库切换

编辑 `src/backend/MangaManager.Api/appsettings.json`：

```json
{
  "Database": { "Provider": "sqlite" },    // "sqlite" 或 "mysql"
  "ConnectionStrings": {
    "Default": "Data Source=manga.db"       // SQLite 连接串
    // 或 "Server=localhost;Database=manga_db;User=root;Password=xxx;"
  }
}
```

---

## 标签分类体系

| 分类 | Key | 说明 |
|------|-----|------|
| 作者/创作者 | `author` | 画师、工作室 |
| 翻译团队 | `translator` | 汉化组名称 |
| 创作风格 | `style` | 画风、题材类型 |
| 女性角色 | `female` | 身体外貌特征 |
| 男性角色 | `male` | 身体外貌特征 |
| 来源作品 | `source` | 原作名称或「原创」 |
| 语言 | `language` | 翻译语种 |
| 其他标签 | `other` | 其余标签 |

- 同一部漫画中每个分类可以有任意多个标签
- 修改标签名称会影响所有关联该标签的漫画（标签 ID 不变）
- 扫描入库时上层文件夹名自动创建为 `author` 分类标签

---

## 完整 API 列表

### 标签

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/tag` | 标签列表 `?category=author` |
| GET | `/api/tag/search` | 标签搜索 `?q=&category=&limit=`（原文/中文/命名空间，按使用次数排序） |
| GET | `/api/tag/common` | 最常用标签 `?limit=` |
| GET | `/api/tag/categories` | 分类定义（含图标颜色） |
| POST | `/api/tag` | 创建 `{name, color?, category?}` |
| PUT | `/api/tag/{id}` | 编辑（改名/中文/颜色/分类，影响所有关联作品） |
| DELETE | `/api/tag/{id}` | 删除（同步清理 work_tag/manga_tag 关联） |
| POST | `/api/tag/merge` | 合并标签 `{fromId, intoId}`（搬移关联并去重、删除源） |

### 作品标签（work_tag 统一表）

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/work/{workId}/tags` | 作品标签列表（含命名空间/中文） |
| POST | `/api/work/{workId}/tags` | 批量添加 `{tagIds}`（幂等） |
| DELETE | `/api/work/{workId}/tags/{tagId}` | 移除标签 |

### 本地画廊

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/local/galleries/paged` | 分页列表（`group/search/sort/page/pageSize/tagIds/albumGids`；`tagIds` 多标签 **AND**） |
| POST | `/api/local/galleries/gids` | 当前筛选下的完整有序 gid 列表（阅读器跨作品导航用） |
| GET | `/api/local/galleries/meta` | 轻量元数据（封面墙初始化，已去掉 AllTags 以瘦身载荷） |
| GET | `/api/local/galleries/tag-stats` | 标签统计（每标签关联作品数，标签云/选择器用） |
| GET | `/api/local/galleries/random` | 随机抽取 N 部作品 |
| GET | `/api/local/gallery/{gid}` | 画廊详情 |
| GET | `/api/local/gallery/{gid}/pages` | 页列表 |
| GET | `/api/local/gallery/{gid}/page/{idx}` | 单张图片 |
| GET | `/api/local/gallery/{gid}/cover` | 封面图片 |
| DELETE | `/api/local/gallery/{gid}` | 删除画廊 `?deleteDir=true` |
| POST | `/api/local/gallery/{gid}/redownload` | 重新下载 |
| POST | `/api/local/redownload-batch` | 批量重新下载 |
| POST | `/api/local/check-downloaded` | 批量检查是否已下载 |
| POST | `/api/local/import` | 导入外部作品 |
| POST | `/api/local/batch-import` | 批量导入 |
| GET | `/api/local/gallery/{gid}/meta-tags` | 获取元数据标签 |
| PUT | `/api/local/gallery/{gid}/meta-tags` | 更新元数据标签 |
| POST | `/api/local/repair-metadata` | 修复缺失元数据 |
| GET | `/api/readingprogress/{gid}` | 阅读进度（含页内偏移 scrollOffset） |
| POST | `/api/readingprogress` | 批量保存进度 upsert（并发冲突自动重试） |
| POST | `/api/readingprogress/mark` | 批量标记已读/未读 `{gids, finished}` |

### 设置 / 运行状态

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/settings/app` | 运行时设置（库目录 / Cookie / 代理） |
| PUT | `/api/settings/app` | 保存设置（改代理/目录保存即生效） |
| POST | `/api/settings/app/rescan` | 按当前目录重扫（只增改不删） |
| GET/PUT | `/api/settings/reader` | 阅读器全局设置 |
| GET | `/api/status` | 运行状态诊断（库规模、孤儿 work_tag、下载队列、存储可用性） |

### 专辑管理

> 专辑方案已废弃（`FEATURES.enableAlbums=false`）：数据保留、前端 UI 隐藏，以下接口仅人工/兼容调用。

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/albums` | 获取所有专辑 |
| PUT | `/api/albums` | 全量保存专辑配置 |
| PATCH | `/api/albums/{key}/rename` | 单独重命名专辑 `{name}` |

### 下载管理

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/download/tasks` | 所有下载任务 |
| GET | `/api/download/tasks/active` | 活跃任务 |
| GET | `/api/download/tasks/{gid}` | 单个任务进度 |
| POST | `/api/download/tasks` | 添加下载任务 |
| POST | `/api/download/tasks/{gid}/pause` | 暂停 |
| POST | `/api/download/tasks/{gid}/resume` | 恢复 |
| POST | `/api/download/tasks/{gid}/restart` | 重启失败任务 |
| POST | `/api/download/tasks/restart-all-failed` | 重启所有失败 |
| POST | `/api/download/tasks/resume-legacy` | 恢复遗留任务 |
| DELETE | `/api/download/tasks/{gid}` | 删除任务（**同步删除本地下载文件**） |
| GET | `/api/download/events` | SSE 实时进度推送 `?gid=` |

---

## 扫描引擎特性

### 智能叶子识别

递归扫描目录，找到直接包含图片（`.jpg/.png/.webp/.bmp/.gif`）的最深层文件夹作为漫画单元。如果子文件夹包含图片，则以子文件夹为叶子。

### 编号前缀自动处理

文件夹名如 `3379665-作品名` → 自动去除编号前缀，漫画标题设为 `作品名`，同时重命名实际文件夹。

### SSE 实时进度

扫描过程中通过 Server-Sent Events 推送四阶段进度：

```
scanning（扫描目录） → loading（加载数据库） → processing（处理漫画） → complete
```

前端进度条实时显示当前处理的漫画名称和进度百分比。

---

## 网页阅读器

进入详情页 → 点击「🌐 网页阅读」

### 功能

| 功能 | 说明 |
|------|------|
| 缩放模式 | 适应宽度 / 适应高度 / 适应屏幕 / 原始大小 / 百分比 |
| 阅读方向 | 左→右 / 右→左（日漫模式） |
| 翻页模式 | 分页 / 滚动（可调速度） |
| 缩略图导航 | `T` 键或按钮打开 5 列网格 |
| 幻灯片 | 空格切换，间隔 1-30 秒，支持循环 |
| 沉浸模式 | 3 秒无操作自动隐藏 UI |
| 图片预加载 | 当前页 ±2 页预加载 |
| 断点续读 | 自动保存/恢复阅读进度 |

### 快捷键

| 键 | 功能 |
|:--:|------|
| `←` `A` | 上一页 |
| `→` `D` | 下一页 |
| `空格` | 幻灯片 |
| `T` | 缩略图 |
| `F` | 缩放模式 |
| `Esc` | 返回 |

---

## 前端页面路由

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` `/local` | 本地画廊 | 封面墙/列表、搜索、标签筛选、专辑管理、拖拽排序 |
| `/ehentai` | E-Hentai | 在线搜索浏览、Cookie 管理、画廊详情、一键下载 |
| `/reader-local/:gid` | 阅读器 | 统一阅读器（缩放/方向/缩略图/幻灯片/沉浸模式） |
| `/downloads` | 下载监控 | 实时进度、暂停/恢复/重启/批量操作 |

---

## E-Hentai 网络源

借鉴 [EhViewer](https://github.com/xiaojieonly/Ehviewer_CN_SXJ) 的 Cookie 认证方式，集成了 E-Hentai/ExHentai 画廊浏览功能。

### 配置

1. 访问 `http://localhost:5173/ehentai`
2. 展开「🔑 Cookie」面板
3. 填入 `ipb_member_id` + `ipb_pass_hash` + `igneous`（可从 EhViewer 导出）
4. 点击「💾 保存 Cookie」→「📡 验证」检查状态

### API

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/ehentai/cookie` | 获取 Cookie（脱敏） |
| PUT | `/api/ehentai/cookie` | 更新 Cookie `{ipbMemberId, ipbPassHash, igneous, label}` |
| POST | `/api/ehentai/validate` | 验证 Cookie 有效性 |
| GET | `/api/ehentai/galleries` | 浏览/搜索画廊 `?search=&page=&exhentai=` |
| GET | `/api/ehentai/gallery/{gid}/{token}` | 画廊详情（JSON API） |
| GET | `/api/ehentai/gallery/{gid}/{token}/pages` | 图片页面列表 |

### Cookie 存储

- 存储在 `ehentai_cookies.json`（已加入 `.gitignore`）
- 可预留标签 `label` 用于区分多账号切换

## 发布部署

```bash
# Windows x64 自包含发布
cd scripts/devops
powershell -File publish.ps1
```

发布产物在 `src/backend/MangaManager.Api/publish/`，双击 `MangaManager.Api.exe` 即可运行，端口 5208 上同时托管 API 和前端静态文件。

---

## 开发约定

- 后端 `Controllers` 只做路由和参数校验，业务逻辑在 `Services`
- 响应统一使用 `ApiResponse<T>` 包装：`{success, data, message}`
- 数据库使用 EF Core Migrations（启动时自动 `Database.Migrate()`，已有数据库自动插入 baseline）
- 前端状态使用 URL 作为唯一数据源（`useSearchParams`），不再使用 `sessionStorage` 持久化筛选状态
- 前端 API 调用封装在 `src/api.js`，组件通过 import 使用
- 所有页面组件放在 `src/pages/` 下
- 唯一启动入口是 `启动管理工具.bat`（WPF 控制台），不要再加第二个启动器
- 改动业务逻辑后跑 `dotnet test`；CI 会强制校验后端构建 + 测试与前端 lint + build
