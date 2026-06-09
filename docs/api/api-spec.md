# API 接口文档（规划）

## 基础信息
- Base URL: `http://localhost:5000/api`
- Content-Type: `application/json`

## 漫画接口

### GET /manga
获取漫画列表

| 参数 | 类型 | 说明 |
|------|------|------|
| page | int | 页码，默认 1 |
| pageSize | int | 每页条数，默认 20 |
| search | string | 搜索关键词 |
| authorId | int | 按作者筛选 |
| tagId | int | 按标签筛选 |
| status | string | 连载状态: ongoing/completed/hiatus |
| sortBy | string | 排序: title/createdAt/updatedAt |

### GET /manga/{id}
获取单部漫画详情

### POST /manga
手动添加漫画
```json
{
  "title": "作品名",
  "path": "D:/Comics/xxx",
  "authorIds": [1, 2],
  "tagIds": [3, 5],
  "status": "ongoing",
  "description": "..."
}
```

### PUT /manga/{id}
更新漫画元数据

### DELETE /manga/{id}
删除漫画（软删除/硬删除可选）

---

## 扫描接口

### POST /scan
触发扫描任务
```json
{
  "directories": ["D:/Comics", "E:/Manga"],
  "autoTag": true
}
```

### GET /scan/{id}/status
查询扫描进度
```json
{
  "id": 1,
  "status": "running",
  "total": 150,
  "processed": 87,
  "newManga": 3,
  "errors": []
}
```

---

## 章节接口

### GET /manga/{id}/chapters
获取漫画的所有章节

### GET /chapters/{id}/pages
获取章节的页面列表（文件列表，非图片流）

---

## 阅读器接口（NeeView 集成）

### GET /neeview/status
检查 NeeView 可用性
```json
// 响应
{
  "available": true,
  "path": "D:\\Program Files (x86)\\NeeView44.0-Beta0805-fd\\NeeView44.0-Beta0805-fd\\NeeView.exe",
  "version": "44.0"
}
```

### POST /open/{chapterId}
使用 NeeView 打开章节
```json
// 请求体（可选）
{
  "fullscreen": true,
  "slideshow": false
}

// 响应
{
  "success": true,
  "message": "NeeView 已启动"
}
```

> 实现：后端 `Process.Start(neeViewPath, $"\"{chapterPath}\" --window=full")`

---

## 阅读进度接口

### GET /progress
获取阅读进度列表

### POST /progress
保存/更新进度
```json
{
  "mangaId": 1,
  "chapterId": 5,
  "pageIndex": 12
}
```

> 注意：NeeView 内部也会在 `Profile/History.json` 中记录阅读位置，后期可实现双向同步

---

## 通用响应格式

```json
// 成功
{
  "success": true,
  "data": { ... },
  "message": null
}

// 分页
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}

// 错误
{
  "success": false,
  "data": null,
  "message": "错误描述"
}
```
