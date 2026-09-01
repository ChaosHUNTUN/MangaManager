# 全量标签化管理改造设计

> 版本：1.0（2026-08-31）
> 目标：抛弃"专辑"作为作品组织方式，改为**全量标签 + 多对多关联**：每个作品的每个标签都是系统内的静态数据（可统一管理颜色/分类/翻译/屏蔽），任意标签筛选都能命中该作品；下载新作品时自动补齐缺失标签。

## 0. 决策记录（2026-09-01 用户拍板）
1. **专辑**：`album_config` 数据独立保留但不再使用，专辑方案完全废弃；迁移时把每个专辑转成 `category=album` 标签并把成员 Gids 关联过去——**弥补导入作品标签缺失**（导入的作品元数据不全，但之前被分配过专辑，用专辑标签兜底）
2. **标签范围**：记录全部 EH 标签（含杂项），全量入库
3. **屏蔽标签**：并入 `tag.IsBlocked` 字段，不做额外管控（现有浏览过滤逻辑保持）
4. **关联表合并**：统一为 `work_tag`（本地画廊正 Gid，旧版 Manga 负 Id），`manga_tag` 历史数据迁移后不再使用
5. **手动加标签**：用户可从 tag 库为任意作品添加标签；因标签量大，选择器交互单独设计（见 §9）

## 1. 现状盘点

| 层 | 现状 | 问题 |
|---|---|---|
| 标签实体 | `tag` 表（Name 唯一 / Color / Category），`manga_tag` 关联仅用于旧版 Manga | 本地画廊**未接入**标签表 |
| 本地画廊 | `local_gallery.Artists/Groups/AllTags` 为 **JSON 字符串** | 筛选用 `StartsWith('["name"')` 字符串匹配（代码里有 TODO 警告：序列化格式一变就静默失效）；无法做标签级统计/改名/合并 |
| 专辑 | `album_config`（Gids/Order/KeyTag JSON），启动时自动按 artist/group 建专辑并反复写库 | 数据冗余、同步漂移、启动有大量 album_config 更新写库 |
| 同步 | `GallerySyncService` 解析 `.meta.json` → 只写入 JSON 字段 | 没有把标签落成实体 |
| 翻译 | `EhentaiTagService` 静态字典 `ns:tag → 中文` | 未落库，改名/统一无从谈起 |
| 屏蔽 | `EhentaiBlockedTagService` 独立维护 | 与标签实体分离，两套体系 |

## 2. 目标模型

```
tag（标签静态数据）
  Id / Name（EH 原文）/ NameCn（中文翻译）/ Category / Color / Namespace
  └── 全局唯一（Namespace + Name）

gallery_tag（作品 × 标签，多对多）
  Gid + TagId 唯一索引 → 任意标签筛选 = JOIN 命中

local_gallery.Artists/Groups/AllTags → 降级为展示缓存（保留，由同步维护）
album_config → 废弃或迁移（见 §5）
```

### 标签分类（namespace → category 映射）
| EH Namespace | 系统 Category | 说明 |
|---|---|---|
| artist | author | 作者/画师 |
| group | translator | 汉化组/工作室 |
| female / male | female / male | 女/男角色特征 |
| style | style | 画风/题材 |
| source | source | 原作 |
| language | language | 语种 |
| translator / 其他 | other | 其余 |

## 3. 核心设计

### 3.1 表结构（P0 已落地）
```csharp
public class Tag  // 扩展现有表
{
    public int Id { get; set; }
    public string Name { get; set; } = "";        // EH 原文
    public string? NameCn { get; set; }           // 中文翻译（新增）
    public string Namespace { get; set; } = "other"; // 新增：artist/group/female...
    public string Category { get; set; } = "other";
    public string Color { get; set; } = "#6366f1";
    public bool IsBlocked { get; set; }           // 屏蔽标记（并入，不做管控）
}
// 唯一索引：(Namespace, Name)

public class WorkTag  // 新增统一关联表
{
    public int WorkId { get; set; }               // 本地画廊正 Gid；旧版 Manga 负 Id
    public int TagId { get; set; }
    public Tag? Tag { get; set; }
}
// 唯一索引：(Gid, TagId)；另一列索引：(TagId)
```

迁移：`20260901000000_AddWorkTagSystem`（新增列 + 建表 + 换唯一索引）。

### 3.2 服务（P0 已落地）
- `TagService`：`EnsureTagsCoreAsync`（批量幂等 upsert，同上下文未保存的新标签也纳入去重）、`GetWorkTagsAsync` / `AddWorkTagsAsync` / `RemoveWorkTagAsync`、`SearchTagsAsync`（选择器搜索，按使用次数排序）、`GetCommonTagsAsync`（常用标签）
- `TagMigrationService`：一次性迁移（幂等），启动时在 `Database.Migrate()` 后执行
- `GallerySyncService`：全量/增量同步画廊时自动把 meta 标签写入 tag 表 + work_tag（**下载新作品自动补齐标签**）

API（P0 已落地）：
| 接口 | 说明 |
|---|---|
| `GET /api/work/{workId}/tags` | 作品标签列表（含命名空间/中文） |
| `POST /api/work/{workId}/tags` | 批量添加标签 `{tagIds}`（幂等） |
| `DELETE /api/work/{workId}/tags/{tagId}` | 移除标签 |
| `GET /api/tag/search?q=&category=&limit=` | 标签搜索（选择器） |
| `GET /api/tag/common?limit=` | 最常用标签 |
| `GET/POST/PUT/DELETE /api/tag` | 标签 CRUD（扩展命名空间/中文/屏蔽） |
| `POST /api/tag/merge` | 合并标签 `{fromId,intoId}`：搬移 work_tag/manga_tag 关联（去重）→ 继承 NameCn/IsBlocked → 删除源标签 |

> 删除标签时先显式清理 `work_tag`/`manga_tag` 关联（SQLite 未启用 FK 级联，避免孤儿行）。

### 3.2 标签服务
- `TagService`：
  - `EnsureTags(IEnumerable<(ns, name)>)`：按 (ns,name) upsert，缺失即创建，自动分配分类颜色，翻译从 `EhentaiTagService` 取 NameCn
  - `SetGalleryTags(gid, tags)` / `GetGalleryTags(gid)`：作品级增删
  - 改名/合并：改 `tag.Name` → 所有关联作品自动生效（多对多的天然优势）
- 筛选：`/api/local/galleries?tagIds=1,2,3` 走 JOIN；搜索 `artist:xxx` 走标签表模糊匹配

### 3.3 下载/同步管线自动补齐标签
1. `DownloadManager` 下载完成后写 `.meta.json`（已有）
2. `GallerySyncService` 解析 meta 时：`EnsureTags` 全量入库 + 写 `gallery_tag` 关联 + 更新 JSON 缓存字段
3. 首次启动迁移历史数据（见 §4）

### 3.4 前端
- 侧边栏从"专辑树"改为**分类标签云**（作者/汉化组/画风/女角/男角/来源/语言/其他，各带计数），点击即筛选
- 画廊详情：标签 chips 展示（中文优先）+ 增删 + 管理入口（改名/改色/合并/屏蔽）
- **搜索建议（2026-09-01 已接标签库）**：无前缀词输入时查询 `/api/tag/search`，补全为 `tag:原文` 语法（中文/原文都命中）；artist/group/category/language 前缀仍走本地派生池快速补全
- **标签库管理弹窗（2026-09-01）**：本地页工具栏「标签管理」入口——搜索/分类浏览 + 改名/改中文/改色/改分类（PUT）+ 合并到其他标签（merge）+ 删除；屏蔽标签按决策不提供管控
- 专辑 UI 通过 `FEATURES.enableAlbums=false` 隐藏（复用 import 的开关模式）

## 4. 历史数据迁移

一次性迁移（启动检测 `gallery_tag` 为空且 local_gallery 有数据时执行）：
1. 遍历 `local_gallery`，解析 `AllTags/Artists/Groups`（或读 `.meta.json` 全量 tags）
2. 对每个 (ns, name)：`EnsureTags` 创建/复用标签
3. 写 `gallery_tag` 关联
4. 统计迁移进度（日志/SSE），支持断点续跑

规模预估：2686 画廊 × 平均 ~20 标签 ≈ 5 万条关联，SQLite 批量插入分钟级完成。

## 5. 专辑迁移（已定：专辑数据保留不使用，转 album 标签）

`album_config` 数据保留但**不再读写/展示**；迁移时每个专辑创建 `namespace=album, category=album` 标签并把成员 Gids 关联（P0 已实现）。这样：
- artist:/group: 专辑成员同时拥有 artist/group 标签（来自 meta）与 album 标签（来自专辑）——无损
- **导入作品**（meta 标签缺失）至少获得其所属专辑的 album 标签，可被筛选到
- 前端专辑 UI 通过功能开关隐藏（与导入开关同模式）

**废弃完整性（2026-09-01 补齐）**：审计发现并移除所有仍在自动写专辑的路径——
- `DownloadManager` 下载完成后的 `AutoAssignToAlbumsAsync`（匹配/新建/兜底专辑 + 写 `local_gallery.AlbumKey`）已整体删除
- `LocalGalleryService.GetGalleryGroups` 每次调用自动补建 artist/group 专辑的副作用块已删除（该接口返回的从来只是多作者/未分类派生分组，建专辑是纯写库噪音；`existingAlbumKeyTags` 为死代码）
- 前端 `useAlbumConfig` 在 `FEATURES.enableAlbums=false` 时不再加载专辑配置、不再自动匹配新作品进专辑；卡片不再显示专辑色条/角标；侧边栏折叠标签改"标签"；URL 残留 `album:` 分组自动回退"全部"
- 保留：`album_config` 数据本身、`AlbumsController` 显式 CRUD（仅人工调用，前端入口已隐藏）、迁移服务的一次性读取

## 6. 分阶段实施

| 阶段 | 内容 | 验证 |
|---|---|---|
| P0 数据层 | 扩展 `tag`（Namespace/NameCn/IsBlocked）+ 新增 `work_tag` + 迁移 + TagService + API + 同步钩子 | **已完成（2026-09-01）**，端到端验证通过（5 标签/5 关联/API/幂等重启） |
| P1 服务层 | `TagService`（upsert/关联/筛选 JOIN）+ GallerySync 接入 | **已完成**（下载新作品自动补标签） |
| P2 后端 API | 标签筛选/管理/统计接口；专辑接口标记废弃 | **已完成（2026-09-01）**：`tagIds` JOIN 筛选、`tag:` 搜索语法、`/api/local/galleries/tag-stats`；端到端验证通过（milf→2 部 / custom→1 部 / tag:milf→2 / 增删生效） |
| P3 前端 | 详情标签编辑（TagPicker）、搜索联动 | **已完成（2026-09-01）**：`TagPicker`（搜索/分类/常用/已选/新建）+ 画廊详情标签展示与增删；**侧边栏标签云**（按分类分区 + 计数 + 点击筛选，URL `tags=1,2` 驱动，工具条激活 chips 可移除，跨作品导航同步）；`tag:` 搜索语法 |
| P4 收尾 | 专辑 UI 开关关闭、真实库迁移验证、文档更新 | **已完成（2026-09-01）**：`FEATURES.enableAlbums=false` 隐藏专辑 UI，AlbumSidebar 切为纯标签云；真实库（2728 画廊）迁移验证通过：TAGS=3961、WORK_TAG=47802、ALBUM_TAGS=632、NameCn=3052，分类分布正确（other 1475/author 788/album 632/female 432/translator 385/male 238/language 11）。期间修复两个真实 bug：① `BackfillNameCnAsync` 用 `AsNoTracking()` 导致 NameCn 回填不落库（日志 3052 但库中 0）→ 去掉 AsNoTracking 后实际落库 3052；② `EhentaiFileHelper.DefaultDownloadDir` setter 自动建目录 + GallerySync 空目录清空 DB（测试副本 2728→0）→ setter 不再建目录、目录数为 0 且 DB 有记录时跳过清理并告警，回归验证画廊不丢 |

## 9. 手动添加标签交互设计（标签选择器）

标签量大（全量 EH 标签可达数万），选择器必须分层：

1. **搜索优先**：顶部搜索框，输入即过滤（匹配原文/中文/命名空间），命中即点选；数据来自 `GET /api/tag/search`（按使用次数排序，常用标签靠前）
2. **分类分组浏览**：无搜索词时按分类分区（作者/汉化组/画风/女角/男角/来源/语言/其他/专辑），横向分区 + 纵向滚动，每区显示标签计数
3. **常用/最近**：首屏展示"常用"区（`/api/tag/common`，按 work_tag 关联数排序）+ 最近使用（前端记录）
4. **已选区**：顶部已选 chips（可移除），实时显示本作品已有标签
5. **新建兜底**：搜索无结果时显示"创建自定义标签 [输入]"，`POST /api/tag` 创建（namespace=other）后立即选中
6. **交互约束**：单作品标签上限（如 100，与批量接口一致）；添加即时生效（乐观更新 + 失败回滚 toast）

组件落点：`TagPicker`（详情弹窗内嵌），移动端全屏底部抽屉。

## 7. 收益与风险

### 收益
- 筛选正确性与性能（JOIN vs JSON StartsWith）；任意标签可筛
- 标签级元数据（颜色/分类/中文/屏蔽）统一管理，改名/合并一次生效
- 下载自动补齐，系统自维护，无需手工建专辑
- 移除 album_config 同步漂移与启动写库噪音

### 风险与注意
- 迁移正确性：历史 JSON 格式与 meta.json 差异需兼容
- 标签规模：EH 全量标签可能上万（含 rare 标签），需合理容量（SQLite 无压力）
- 前端改动面大（侧边栏/详情/搜索）
- 屏蔽标签体系是否并入标签表（建议并入，`Tag.IsBlocked`）
- 需要保留"多作者/未分类"这类派生分组的等价物（可由标签计数派生）

## 8. 开放问题（已确认，见 §0）
1. 专辑迁移选 B：数据保留不使用，成员转 album 标签 ✅（2026-09-01）
2. 记录全部 EH 标签（含杂项）✅
3. 屏蔽标签并入 `tag.IsBlocked`，不做管控 ✅
4. 统一为 `work_tag`，`manga_tag` 迁移后废弃 ✅
