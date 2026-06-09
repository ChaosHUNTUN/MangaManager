# MangaManager 部署分析 & 一键部署方案

## 一、当前部署架构

```
新设备上需要手动部署 5 个组件：

┌──────────────────────────────────────────────────┐
│ 1. .NET 9 Runtime (SDK for dev)                  │  ~200 MB 下载
├──────────────────────────────────────────────────┤
│ 2. MySQL 8.0+ 数据库                             │  ~300 MB 下载
│    ├── 创建 manga_db 数据库                       │
│    ├── 执行 init.sql (6张表)                      │
│    └── 配置 root 密码                             │
├──────────────────────────────────────────────────┤
│ 3. Node.js 18+ (仅前端构建时需要)                 │  ~60 MB 下载
├──────────────────────────────────────────────────┤
│ 4. NeeView (可选，阅读功能需要)                   │  ~60 MB 下载
├──────────────────────────────────────────────────┤
│ 5. MangaManager 源码                              │
│    ├── dotnet restore && dotnet build            │
│    ├── npm install && npm run build              │
│    └── 配置 appsettings.json                     │
└──────────────────────────────────────────────────┘
```

### 部署痛点

| 痛点 | 说明 |
|------|------|
| 🔴 MySQL 重依赖 | 300MB+ 安装包，需要配置服务、用户、密码 |
| 🔴 多运行时 | .NET 9 + Node.js + MySQL，3 个独立运行时 |
| 🟡 NeeView 路径硬编码 | 每台设备路径不同 |
| 🟡 前端需要 Node.js 构建 | 无法直接复制静态文件 |
| 🟢 .NET 后端 | 可发布为自包含单文件，无需安装 .NET Runtime |

---

## 二、部署方案对比

### 方案 A：SQLite 替代 MySQL（推荐）

```
┌─────────────────────────────────────┐
│         MangaManager.exe            │  ← .NET 自包含单文件 (~80MB)
│  ┌───────────────────────────────┐  │
│  │   内嵌 Kestrel Web 服务器      │  │
│  │   + React 前端 (静态文件)      │  │
│  │   + SQLite 数据库 (单文件)     │  │
│  │   + NeeView 进程调用           │  │
│  └───────────────────────────────┘  │
│                                     │
│  新设备部署：复制文件夹即可运行       │
│  依赖：仅需 .NET 9 Runtime (或自包含) │
└─────────────────────────────────────┘
```

**优点**：
- 零数据库安装
- 数据文件 `manga.db` 可随项目一起备份
- .NET 可发布为自包含单文件（连 Runtime 都不需要）
- 部署 = 解压 ZIP + 双击 exe

**缺点**：
- SQLite 不支持远程访问（单机场景无影响）
- 并发写入性能略低于 MySQL（单用户场景无影响）

### 方案 B：Docker 容器化

```yaml
# docker-compose.yml
services:
  manga-api:
    build: ./src/backend
    ports: ["5000:5000"]
  manga-db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: 123456
  manga-ui:
    build: ./src/frontend
    ports: ["80:80"]
```

**优点**：一键启动所有服务
**缺点**：需要 Docker Desktop（Windows 上较重，2GB+）

### 方案 C：NSIS/Inno Setup 安装包

打包为 Windows 安装程序 `.exe`，自动安装 .NET Runtime + 复制文件 + 创建快捷方式。

**优点**：用户友好，双击安装
**缺点**：需要额外工具，包体较大

---

## 三、推荐方案：SQLite + 自包含发布

### 改造内容

| 改造项 | 说明 |
|--------|------|
| 数据层切换 | Pomelo.MySQL → Microsoft.Data.Sqlite（.NET 内置，零依赖） |
| 前端嵌入 | React build 产物放入 `wwwroot`，API 同时托管静态文件 |
| 自包含发布 | `dotnet publish -r win-x64 --self-contained` → 单文件夹 |
| 配置外部化 | NeeView 路径从配置文件读取，首次运行自动检测 |

### 发布产物结构

```
MangaManager-v1.0/
├── MangaManager.exe          ← 双击启动
├── appsettings.json          ← 用户可编辑配置
├── manga.db                  ← SQLite 数据库（自动创建）
├── wwwroot/                  ← React 前端静态文件
├── *.dll                     ← .NET 运行时（自包含）
└── NeeView/                  ← 可选：内嵌 NeeView Portable
```

### 新设备部署步骤

```
1. 复制 MangaManager-v1.0 文件夹到目标设备
2. （可选）安装 NeeView，在 appsettings.json 中配置路径
3. 双击 MangaManager.exe
4. 浏览器打开 http://localhost:5000
```

**总大小**：约 80-100 MB（自包含 .NET 运行时 + 前端 + 数据库驱动）

---

## 四、实施步骤（已完成 ✅）

1. ✅ 分析当前架构
2. ✅ 改造 EF Core 支持 SQLite/MySQL 双模式
3. ✅ 后端托管 React 静态文件（`wwwroot` + SPA fallback）
4. ✅ 编写 `publish.ps1` 发布脚本
5. ✅ 编写 `deploy.ps1` 部署脚本
6. ✅ 测试 SQLite 模式扫描入库

## 五、使用方法

### 开发模式（当前设备）
```powershell
# 使用 SQLite（零配置）
.\scripts\devops\deploy.ps1

# 使用 MySQL
.\scripts\devops\deploy.ps1 -UseMySQL
```

### 发布模式（生成安装包）
```powershell
.\scripts\devops\publish.ps1 -OutputDir "D:\MangaManager-release" -Version "1.0.0"
```

发布后产物为单文件夹，复制到新设备即可运行：
```
D:\MangaManager-release\MangaManager\
├── MangaManager.Api.exe    ← 双击启动
├── appsettings.json        ← 用户配置
├── manga.db                ← SQLite 数据库（自动创建）
├── wwwroot\                ← 前端静态文件
└── README.txt              ← 使用说明
```

### 新设备部署流程
```
1. 复制 MangaManager 文件夹到目标设备
2. （可选）安装 NeeView，编辑 appsettings.json 设置路径
3. 双击 MangaManager.Api.exe
4. 浏览器打开 http://localhost:5000
5. 点击「扫描入库」导入漫画
```

### 数据库切换

| 场景 | appsettings.json 配置 |
|------|----------------------|
| SQLite（默认，推荐） | `"Database": { "Provider": "sqlite" }` |
| MySQL | `"Database": { "Provider": "mysql" }` + MySQL 连接字符串 |

> MySQL 模式需要先手动创建 `manga_db` 数据库（执行 `scripts/db/init.sql`）
