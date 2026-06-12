# 📚 MangaManager

本地漫画文件管理系统 —— 目录扫描入库、标签分类管理、网页阅读。

## 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 后端 | ASP.NET Core Web API | .NET 9 |
| 前端 | React + React Router | 19.2 / 7.16 |
| 构建 | Vite | 8 |
| 数据库 | SQLite（开发）/ MySQL（生产） | EF Core |
| 阅读器 | 内置网页阅读器 | - |

## 快速开始

### 环境要求

- .NET SDK 9.0+
- Node.js 20+
- 可选：MySQL 8.0+

### 1. 启动后端

```bash
cd src/backend/MangaManager.Api
dotnet run
# 默认监听 http://localhost:5000
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

---

## 项目结构

```
MangaManager/
├── README.md
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
    │   └── MangaManager.Services/# 业务逻辑
    └── frontend/
        └── manga-ui/             # React 前端
```

---

## 数据库

### 实体模型

| 实体 | 表名 | 说明 |
|------|------|------|
| `Manga` | `manga` | 漫画主表：标题、路径、封面、文件数 |
| `Tag` | `tag` | 标签表：名称、颜色、分类 |
| `MangaTag` | `manga_tag` | 漫画-标签多对多 |
| `Author` | `author` | 作者 |
| `MangaAuthor` | `manga_author` | 漫画-作者多对多 |
| `ReadingProgress` | `reading_progress` | 阅读进度（1对1） |
| `ScanLog` | `scan_log` | 扫描日志 |

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

### 漫画

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/manga` | 漫画列表 `?search=&tags=1,2` |
| GET | `/api/manga/{id}` | 漫画详情 |
| POST | `/api/manga/scan` | 扫描目录入库 `{directory, clientId?}` |
| GET | `/api/manga/scan/progress/{clientId}` | SSE 扫描进度流 |
| PUT | `/api/manga/{id}/rename` | 重命名漫画 `{newName}` |
| DELETE | `/api/manga/{id}` | 删除漫画 `?deleteFolder=true` |
| GET | `/api/manga/{mangaId}/tags` | 获取漫画标签 |
| PUT | `/api/manga/{mangaId}/tags` | 设置漫画标签 `[id,...]` |
| POST | `/api/manga/batch/tags` | 批量添加 `{mangaIds, tagIds}` |

### 标签

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/tag` | 标签列表 `?category=author` |
| GET | `/api/tag/categories` | 分类定义（含图标颜色） |
| POST | `/api/tag` | 创建 `{name, color?, category?}` |
| PUT | `/api/tag/{id}` | 编辑（影响所有关联漫画） |
| DELETE | `/api/tag/{id}` | 删除 |

### 阅读器

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/reader/manga/{id}/pages` | 页面列表 |
| GET | `/api/reader/manga/{id}/page/{idx}` | 单张图片 |

### 封面

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/cover/{id}` | 封面图片 |

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
| 缩放模式 | 适应宽度 / 适应高度 / 适应屏幕 / 原始大小 |
| 阅读方向 | 左→右 / 右→左（日漫模式） |
| 缩略图导航 | `T` 键或按钮打开 5 列网格 |
| 幻灯片 | 空格切换，间隔 1-30 秒，支持循环 |
| 沉浸模式 | 3 秒无操作自动隐藏 UI |
| 图片预加载 | 当前页 ±2 页预加载 |

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

---

## 前端页面路由

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | 首页 | 封面墙、搜索、标签筛选、扫描入口 |
| `/ehentai` | E-Hentai | 网络源浏览/搜索、Cookie 管理、画廊详情 |
| `/manga/:id` | 详情 | 元数据、标签编辑、重命名、删除、阅读入口 |
| `/reader/:id` | 阅读器 | 网页阅读（缩放/方向/缩略图/幻灯片） |

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

发布产物在 `src/backend/MangaManager.Api/publish/`，双击 `MangaManager.Api.exe` 即可运行，端口 5000 上同时托管 API 和前端静态文件。

---

## 开发约定

- 后端 `Controllers` 只做路由和参数校验，业务逻辑在 `Services`
- 响应统一使用 `ApiResponse<T>` 包装：`{success, data, message}`
- 数据库迁移使用 `EnsureCreated()`，生产环境建议用 Migration
- 前端 API 调用封装在 `src/api.js`，组件通过 import 使用
- 所有页面组件放在 `src/pages/` 下
