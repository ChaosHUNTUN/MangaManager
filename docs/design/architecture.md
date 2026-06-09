# MangaManager 设计思路

## 一、核心功能规划

### 第一期 MVP（最小可用版本）
1. **漫画扫描入库** — 指定目录，自动识别漫画文件夹，提取基本信息
2. **漫画浏览** — 封面墙展示，按名称/作者/标签筛选
3. **阅读器（集成 NeeView）** — 通过网页触发调用本地 NeeView 打开漫画
4. **元数据管理** — 手动编辑标题、作者、标签、连载状态

### 第二期
5. **自动元数据抓取** — 从网络源拉取漫画信息
6. **重复文件检测** — 基于文件哈希的去重
7. **阅读进度追踪** — 多用户进度记录（NeeView 内部也有历史记录可同步）
8. **收藏/评分系统**

### 第三期
9. **局域网共享** — 多设备访问
10. **OPDS 协议支持** — 兼容第三方阅读器
11. **深度集成 NeeView** — 脚本自动化、进度同步

---

## 二、数据模型设计

### 核心实体

```
┌──────────────┐       ┌──────────────┐
│   Manga      │       │   Author     │
│   (漫画)     │───────│   (作者)     │
├──────────────┤ N   M ├──────────────┤
│ Id           │       │ Id           │
│ Title        │       │ Name         │
│ CoverPath    │       │ Aliases      │
│ Path         │       └──────────────┘
│ Status       │
│ Description  │       ┌──────────────┐
│ CreatedAt    │       │   Tag        │
│ UpdatedAt    │───────│   (标签)     │
└──────────────┤ N   M ├──────────────┤
               │       │ Id           │
               │       │ Name         │
               │       │ Color        │
               │       └──────────────┘
               │
     1 ────────│──────── * 
               │
┌──────────────┐       ┌──────────────┐
│   Chapter    │       │  Reading     │
│   (章节)     │       │  Progress    │
├──────────────┤       │  (阅读进度)   │
│ Id           │       ├──────────────┤
│ MangaId      │       │ Id           │
│ Number       │       │ MangaId      │
│ Title        │       │ ChapterId    │
│ PageCount    │       │ PageIndex    │
│ Path         │       │ UpdatedAt    │
└──────────────┘       └──────────────┘

┌──────────────┐
│   ScanTask   │
│   (扫描任务)  │
├──────────────┤
│ Id           │
│ Directory    │
│ Status       │
│ StartedAt    │
│ FinishedAt   │
│ NewCount     │
│ ErrorLog     │
└──────────────┘
```

### 数据库表关系

```
manga ──< manga_author >── author
manga ──< manga_tag >── tag
manga ──< chapter
manga ──< reading_progress
```

---

## 三、API 路由规划

```
GET    /api/manga              # 漫画列表（分页、搜索、筛选）
GET    /api/manga/{id}         # 漫画详情
POST   /api/manga              # 手动添加
PUT    /api/manga/{id}         # 更新元数据
DELETE /api/manga/{id}         # 删除

GET    /api/manga/{id}/chapters        # 章节列表
GET    /api/chapters/{id}/pages        # 章节页列表
GET    /api/chapters/{id}/page/{num}   # 获取图片

GET    /api/authors            # 作者列表
POST   /api/authors            # 添加作者
PUT    /api/authors/{id}       # 更新作者

GET    /api/tags               # 标签列表
POST   /api/tags               # 添加标签

POST   /api/scan               # 触发目录扫描
GET    /api/scan/{id}/status   # 扫描进度

GET    /api/progress           # 阅读进度
POST   /api/progress           # 更新进度

GET    /api/cover/{id}         # 获取封面图
```

---

## 四、前端页面规划

```
/                         首页（统计面板 + 最近添加）
/manga                    漫画墙（封面网格）
/manga/:id                漫画详情（封面、信息、章节列表、阅读按钮）
/scan                     扫描管理（选择目录、查看进度）
/tags                     标签管理
/settings                 设置页面（含 NeeView 路径配置）
```

> **注意**：阅读功能由 NeeView 承担，前端不内置阅读器。
> 点击「阅读」按钮时通过自定义协议 `neeviewext://` 或后端 API 调用 `Process.Start()` 启动 NeeView。

---

## 五、技术选型理由

| 选择 | 理由 |
|------|------|
| .NET 9 Web API | 已有环境，性能好，开发快 |
| EF Core + MySQL | 已有 MySQL，EF Core 迁移方便 |
| React + Vite | 轻量快速，组件生态丰富 |
| SQLite 开发 / MySQL 生产 | 零配置起步，后期切换无痛 |
| 缩略图生成 | .NET 内置 System.Drawing 或 SkiaSharp |
| 文件扫描 | C# 原生 IO，配合并行处理 |
| **NeeView** 作为阅读器 | 已有本地安装，功能强大，支持命令行+脚本接口 |

---

## 六、NeeView 集成方案

### 现状确认

| 项目 | 详情 |
|------|------|
| 安装路径 | `D:\Program Files (x86)\NeeView44.0-Beta0805-fd\NeeView44.0-Beta0805-fd\` |
| 版本 | 44.0-Beta0805 (Rev. b3ae158b) |
| 类型 | Portable ZIP-fd 版 (免安装) |
| 运行时 | .NET 9.0 Desktop Runtime |
| 许可证 | MIT License (开源) |

### NeeView 对外接口能力

#### 1. 命令行参数（官方文档）
```
NeeView.exe [选项...] [文件或文件夹...]
```
| 参数 | 说明 |
|------|------|
| `文件/文件夹路径` | 直接打开指定图片、压缩包或文件夹 |
| `-s` / `--slideshow` | 幻灯片模式启动 |
| `--window=full` | 全屏模式启动 |
| `--new-window=on\|off` | 新窗口打开 |
| `-o <路径>` | 指定书架位置 |
| `--script=<路径>` | 启动时执行指定脚本 |

**示例**：
```
NeeView.exe "D:\Comics\作品名\第01话"
NeeView.exe --window=full "D:\Comics\volume.zip"
NeeView.exe --script="script:\OnStartup.nvjs"
```

#### 2. 脚本系统（.nvjs / JavaScript）
NeeView 内置 **Jint** (C# 的 JS 引擎)，支持通过脚本控制几乎所有功能：

```javascript
// 打开指定漫画
nv.Command.LoadAs.Execute("D:\\Comics\\manga\\第01话");

// 全屏模式
nv.Command.FullScreen.Execute();

// 翻页
nv.Command.NextPage.Execute();
nv.Command.PrevPage.Execute();

// 获取当前页面信息
var page = nv.Book.Pages[nv.Book.CurrentPage];
console.log(page.Path);
```

**事件脚本**（自动触发）：
| 文件名 | 触发时机 |
|--------|----------|
| `OnStartup.nvjs` | 应用启动时 |
| `OnBookLoaded.nvjs` | 打开书籍后 |
| `OnPageChanged.nvjs` | 页面切换时 |
| `OnPageEnd.nvjs` | 翻到末尾时 |

#### 3. 自定义 URL 协议
NeeView 支持注册 `neeviewext://` 协议，可从网页直接调起：
```
<a href="neeviewext://open?path=D:/Comics/manga">阅读</a>
```

### 集成架构

```
┌──────────────────────────────────────────────────────┐
│  React 前端 (manga-ui)                                │
│                                                       │
│  [阅读按钮] → 两种调用方式：                           │
│    ① 自定义协议: neeviewext://open?path=...            │
│    ② 后端 API: POST /api/open → Process.Start()       │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│  .NET Web API (MangaManager.Api)                     │
│                                                       │
│  POST /api/open/{chapterId}                           │
│    → 查询章节路径                                      │
│    → Process.Start("NeeView.exe", "章节路径")          │
│    → 返回成功/失败                                     │
│                                                       │
│  GET /api/neeview/status                              │
│    → 检查 NeeView.exe 是否存在                         │
│    → 返回路径、版本信息                                │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│  NeeView (本地 WPF 应用)                              │
│                                                       │
│  • 打开漫画文件夹/压缩包                               │
│  • 双页浏览、全屏、手势                                │
│  • 支持: jpg/png/bmp/gif/pdf/zip/rar/cbz/cbr/7z      │
│  • 自动记忆阅读位置 (History.json)                     │
│  • 脚本扩展能力                                        │
└──────────────────────────────────────────────────────┘
```

### 网页调用本地应用的方案对比

| 方案 | 可行性 | 优点 | 缺点 |
|------|:------:|------|------|
| **自定义 URL 协议** (`neeviewext://`) | 🟡 需配置 | 纯前端，无需后端 | 需要 NeeView 注册协议 |
| **后端 Process.Start()** | 🟢 推荐 | 可靠，C# 原生支持 | 需要后端 API |
| **Electron/WebView2** | ❌ 过度 | - | 引入重量依赖 |

**推荐方案**：后端 `Process.Start()` + 前端 `POST /api/open`

---

## 七、文件组织结构约定

### 漫画目录规范（扫描器识别规则）
```
漫画根目录/
├── [作者名] 作品名/
│   ├── cover.jpg          ← 封面图（自动识别）
│   ├── 第01话/
│   │   ├── 001.jpg
│   │   ├── 002.jpg
│   │   └── ...
│   ├── 第02话/
│   └── ...
├── [作者名] 另一部作品/
└── ...
```

### 支持的文件格式
- 图片：jpg, jpeg, png, webp, bmp, gif
- 压缩包：zip, rar, cbz, cbr（后期支持）

---

## 八、开发路线图

```
Phase 1 (当前) ──── 项目结构搭建 + 数据模型 + API 骨架
Phase 2 ─────────── 目录扫描器 + 封面提取 + 漫画入库
Phase 3 ─────────── 前端基础页面 + 漫画墙浏览
Phase 4 ─────────── 阅读器核心功能
Phase 5 ─────────── 搜索 + 筛选 + 标签系统
Phase 6 ─────────── 阅读进度追踪
Phase 7 ─────────── 性能优化 + 打包部署
```
