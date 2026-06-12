# MangaManager 下一阶段优化任务

> 来源: 2026-06-09 全面审计 (28问题) + 用户观测 (7问题)
> 状态: 进行中 (第一批已完成 ✅，待进入第二批)

---

## 一、来自审计的优化项 (19项)

### 数据库层面
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| DB-1 | 无正式迁移系统 | 🟡 | 使用 EnsureCreated() + 手写 SQL，应引入 EF Core Migrations |
| DB-2 | SQLite WAL 模式未配置 | 🟡 | 并发读写可能 "database is locked"，启用 `PRAGMA journal_mode=WAL` |
| DB-3 | 无数据库备份机制 | 🟡 | 需定期备份策略 |
| DB-4 | AlbumConfig.Gids/Order 为 JSON 字符串 | 🟡 | 每次需反序列化，可用 EF Core 9 JSON columns |
| DB-5 | 双重数据存储不同步 | 🟡 | 数据库 album_config + .meta.json 可能不一致 |
| DB-6 | 本地画廊阅读进度未设索引 | 🟢 | LocalReadingProgress.Gid 有唯一索引，但 ScanGalleries 无缓存 |

### 后端架构
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| BE-2 | CORS AllowAnyOrigin 不安全 | 🟡 | 生产环境应限制为前端地址 |
| BE-3 | HttpClient 未用 IHttpClientFactory | 🟡 | 直接 new HttpClient，不利用连接池 |
| BE-4 | 单例服务依赖 Scoped DbContext | 🔴 | EhentaiService/LocalGalleryService/DownloadManager 需验证 scope 管理 |
| BE-5 | DownloadManager 构造同步加载 | 🟡 | LoadTasksFromDb() 阻塞启动 |
| BE-6 | 无健康检查端点 | 🟡 | 缺 /health 或 /ready |
| BE-7 | 静态文件配置缺陷 | 🟡 | 开发/生产逻辑混在一起 |
| BE-10 | 标签翻译 fire-and-forget | 🟡 | `_ = EhentaiService.InitTagTranslationsAsync()` 异常静默吞掉 |

### 后端接口
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| API-1 | GET /api/local/gallery/{gid} 依赖外部存储 | 🟡 | Directory.GetFiles() 磁盘故障直接 500 |
| API-3 | PUT /api/albums 无事务保护 | 🟡 | 先删后增，中间崩溃数据丢失 |
| API-4 | POST /api/local/import 无文件大小限制 | 🟡 | 可能导入任意大文件 |
| API-6 | 批量导入无进度反馈 | 🟡 | 大量导入时前端只能等 |
| API-7 | EhentaiService 超时 25 秒 | 🟢 | 可能导致请求队列堆积 |

### 前端接口调用
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| FE-API-1 | request() 与 raw fetch() 混用 | 🟡 | api.js 错误处理不一致 |
| FE-API-3 | saveReadingProgress 静默失败 | 🟡 | catch 块无日志 |
| FE-API-4 | 缺少请求去重/防抖 | 🟡 | 快速切换时无 AbortController |
| FE-API-5 | 缺少重试机制 | 🟡 | 网络波动不自动重试 |

### 前端数据逻辑
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| FE-LOGIC-1 | doAlbumDrop 的 useCallback 闭包 | 🟡 | 需验证 ref 修复完整性 |
| FE-LOGIC-2 | 自动匹配 useEffect 与 saveAlbums 循环 | 🟡 | 可能形成循环触发 |
| FE-LOGIC-3 | 每次进阅读器重新请求画廊列表 | 🟡 | ReaderLocal 挂载时全量加载 |
| FE-LOGIC-4 | beforeunload 不可靠 | 🟡 | 移动端 Safari 不支持异步保存 |
| FE-LOGIC-5 | progressRef 卸载丢失 | 🟡 | 关闭标签页进度丢失 |
| FE-LOGIC-7 | searchTagPool 重建开销大 | 🟡 | useMemo 依赖整个 galleries 数组 |
| FE-LOGIC-8 | EHentai 内嵌阅读器代码重复 | 🟡 | 与 ReaderLocal 大量重复代码 |

### 前端交互界面
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| FE-UI-1 | 无加载骨架屏 | 🟡 | 只显示"加载中..." |
| FE-UI-2 | 无离线降级 | 🟡 | 后端不可用前端直接崩溃 |
| FE-UI-3 | 没有虚拟滚动 | 🟡 | 1000+ 画廊时 DOM 过多卡顿 |
| FE-UI-4 | 拖拽无视觉反馈 | 🟡 | 看不到目标位置空位指示 |
| FE-UI-5 | 详情弹窗在大屏下过小 | 🟢 | maxWidth: 520 固定 |
| FE-UI-6 | Toast 消息易被覆盖 | 🟢 | 快速操作 toast 被覆盖 |
| FE-UI-7 | 键盘快捷键无提示 | 🟢 | 用户不知道快捷键 |

### 桌面控制台
| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| CON-2 | 关闭按钮只隐藏不退出 | 🟡 | 无托盘图标实现 |
| CON-3 | 无权限检测 | 🟡 | 启动前不检测命令是否存在 |
| CON-4 | 轮询频率高 | 🟡 | 每 2-3 秒轮询 |
| CON-5 | RefreshServiceStatus 不可靠 | 🟡 | 只检查两个端点 |
| CON-6 | 进程生命周期管理不完善 | 🟡 | async void 启动 |
| CON-7 | 无开机自启选项 | 🟢 | 用户需手动启动 |

---

## 二、来自用户观测的优化项 (4项)

| # | 问题 | 优先级 | 说明 |
|---|------|--------|------|
| U-opt1 | 控制台下载管理按钮冗余 | 🟡 | 控制台已有实时下载列表，直接移除该按钮和对应页面 |
| U-opt2 | 专辑管理侧边栏/工具栏功能冗余 | 🟡 | 侧边栏只能筛选/拖放，工具栏多了编辑/删除，需去冗余 |
| U-opt5 | 本地/在线搜索行为不一致 | 🟡 | 语法/补全源不同，需统一 |
| U-opt7 | 竖向滚动条过多 | 🟡 | CSS/布局问题，酌情优化 |

---

## 三、建议的优化顺序

### 第一批（安全性 / 稳定性）✅ 已完成
1. ✅ BE-4: 验证 Singleton 服务的 Scope 管理 — 确认无泄漏
2. ✅ BE-2: CORS 限制 — dev/prod 已区分，无需额外修改
3. ✅ BE-5: DownloadManager 异步加载 — InitializeAsync() 替代构造同步
4. ✅ BE-10: 标签翻译异常处理 — fire-and-forget 加日志

### 第二批（性能 / 体验）✅ 已完成
5. ✅ FE-API-4: 请求去重/AbortController — ReaderLocal 使用可取消请求
6. ✅ DB-2: SQLite WAL 模式 — PRAGMA journal_mode=WAL
7. ✅ FE-LOGIC-8: 统一阅读器代码 — 提取共享 PageImage 组件
8. ✅ U-opt2: 专辑管理去冗余 — 编辑删除移入侧边栏
9. ⏭️ FE-UI-3: 虚拟滚动 — 跳过（已有分页30/页，收益有限）

### 第三批（运维 / 工程化）
10. DB-1: EF Core Migrations
11. BE-6: 健康检查端点
12. BE-3: HttpClientFactory
13. DB-3: 数据库备份

### 第四批（交互 / UI打磨）
14. FE-UI-1: 加载骨架屏
15. FE-UI-4: 拖拽视觉反馈
16. FE-UI-7: 键盘快捷键提示
17. U-opt1: 控制台去冗余
18. U-opt7: 滚动条优化
19. CON-2/CON-3/CON-5/CON-6: 控制台完善

---

*文档创建时间: 2026-06-09*
*当前阶段: 修复后验证阶段*

---

## 四、后续优化（详见 optimization-analysis-2026-06-09.md）

2026-06-09 进行了全项目深度审计，生成了更详细的优化分析报告。关键发现：

1. **LocalGallery.jsx 巨型组件 (92KB/2400行)** — 需拆分为 ~10 个独立模块
2. **EHentai 内嵌阅读器与 ReaderLocal 代码重复** — 应合并为统一阅读器
3. **Home.jsx 遗留未使用组件** — 可安全删除
4. **图片加载骨架屏缺失** — 简单 CSS 改动
5. **阅读器退出进度保存不可靠** — 应改为逐页保存
6. **搜索自动补全 useMemo 开销大** — 可用 ref 缓存优化
7. **API 响应缓存** — 画廊列表可加 5 分钟内存缓存
8. **标签翻译数据库预加载** — 启动时 await 替代 fire-and-forget

不需要优化的：虚拟滚动（已有分页）、TypeScript迁移、状态管理库、PWA（过度工程化）
