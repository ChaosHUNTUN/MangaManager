using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Services;

/// <summary>
/// 标签服务：全量标签静态数据 + 作品 × 标签多对多（统一表 work_tag）
/// 本地画廊用正 Gid，旧版 Manga 用负 Id 作为 WorkId
/// </summary>
public class TagService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TagService> _logger;

    public TagService(IServiceScopeFactory scopeFactory, ILogger<TagService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    private MangaDbContext CreateDb() => _scopeFactory.CreateScope().ServiceProvider.GetRequiredService<MangaDbContext>();

    // EH namespace → 系统分类（与 TagController 分类定义一致，另加 album）
    public static readonly Dictionary<string, string> NsToCategory = new(StringComparer.OrdinalIgnoreCase)
    {
        ["artist"] = "author",
        ["group"] = "translator",
        ["female"] = "female",
        ["male"] = "male",
        ["style"] = "style",
        ["source"] = "source",
        ["language"] = "language",
        ["other"] = "other",
        ["album"] = "album",
    };

    public static readonly Dictionary<string, string> CategoryColors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["author"] = "#8b5cf6",
        ["translator"] = "#06b6d4",
        ["style"] = "#10b981",
        ["female"] = "#ec4899",
        ["male"] = "#3b82f6",
        ["source"] = "#f59e0b",
        ["language"] = "#14b8a6",
        ["other"] = "#6366f1",
        ["album"] = "#a78bfa",
    };

    public static string NormalizeNs(string? ns) => string.IsNullOrWhiteSpace(ns) ? "other" : ns.Trim().ToLower();

    public static string CategoryOf(string ns) => NsToCategory.GetValueOrDefault(NormalizeNs(ns), "other");

    public static string ColorOf(string ns) => CategoryColors.GetValueOrDefault(CategoryOf(ns), "#6366f1");

    private sealed class TupleStringComparer : IEqualityComparer<(string, string)>
    {
        public bool Equals((string, string) x, (string, string) y) =>
            string.Equals(x.Item1, y.Item1, StringComparison.OrdinalIgnoreCase)
            && string.Equals(x.Item2, y.Item2, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode((string, string) x) =>
            HashCode.Combine(x.Item1.ToLowerInvariant(), x.Item2.ToLowerInvariant());
    }

    private static readonly IEqualityComparer<(string, string)> TupleComparer = new TupleStringComparer();

    /// <summary>解析 AllTags JSON（"ns:name" 数组）为 (ns, name) 列表</summary>
    public static List<(string ns, string name)> ParseAllTagsJson(string? json)
    {
        var result = new List<(string, string)>();
        if (string.IsNullOrWhiteSpace(json)) return result;
        try
        {
            var arr = System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new();
            foreach (var item in arr)
            {
                var colon = item.IndexOf(':');
                if (colon > 0)
                {
                    var ns = item[..colon];
                    var name = item[(colon + 1)..];
                    if (!string.IsNullOrWhiteSpace(name)) result.Add((ns, name));
                }
                else if (!string.IsNullOrWhiteSpace(item))
                {
                    result.Add(("other", item));
                }
            }
        }
        catch { /* JSON 格式异常忽略 */ }
        return result;
    }

    /// <summary>
    /// 在指定 DbContext 上批量确保标签存在（幂等）。返回 (ns,name) → Tag 映射。
    /// 供迁移/同步在单个事务作用域内复用。
    /// </summary>
    public static async Task<Dictionary<(string Ns, string Name), Tag>> EnsureTagsCoreAsync(
        MangaDbContext db, IEnumerable<(string ns, string name)> pairs, CancellationToken ct = default)
    {
        var distinct = pairs
            .Where(p => !string.IsNullOrWhiteSpace(p.name))
            .Select(p => (ns: NormalizeNs(p.ns), name: p.name.Trim()))
            .Distinct()
            .ToList();
        var result = new Dictionary<(string, string), Tag>();
        if (distinct.Count == 0) return result;

        var all = await db.Tags.AsNoTracking().ToListAsync(ct);
        // 合并当前上下文中已 Add 但尚未 SaveChanges 的标签（同一批次多个画廊共享新标签时避免重复创建）
        var tracked = db.ChangeTracker.Entries<Tag>()
            .Where(e => e.State == EntityState.Added)
            .Select(e => e.Entity)
            .ToList();
        var byKey = all.Concat(tracked).ToDictionary(t => (t.Namespace, t.Name), TupleComparer);

        foreach (var (ns, name) in distinct)
        {
            if (byKey.TryGetValue((ns, name), out var existing))
            {
                result[(ns, name)] = existing;
                continue;
            }
            var tag = new Tag
            {
                Namespace = ns,
                Name = name,
                Category = CategoryOf(ns),
                Color = ColorOf(ns),
                NameCn = EhentaiTagService.TranslateTag($"{ns}:{name}")
            };
            db.Tags.Add(tag);
            byKey[(ns, name)] = tag;
            result[(ns, name)] = tag;
        }
        return result;
    }

    // ==================== API 实例方法 ====================

    /// <summary>获取作品的全部标签（按分类+名称排序）</summary>
    public async Task<List<Tag>> GetWorkTagsAsync(int workId, CancellationToken ct = default)
    {
        using var db = CreateDb();
        return await db.WorkTags.AsNoTracking()
            .Where(w => w.WorkId == workId)
            .Join(db.Tags.AsNoTracking(), w => w.TagId, t => t.Id, (_, t) => t)
            .OrderBy(t => t.Category).ThenBy(t => t.Name)
            .ToListAsync(ct);
    }

    /// <summary>为作品批量添加标签（幂等；tagIds 中不存在的忽略）</summary>
    public async Task<int> AddWorkTagsAsync(int workId, IEnumerable<int> tagIds, CancellationToken ct = default)
    {
        using var db = CreateDb();
        var ids = tagIds.Distinct().ToList();
        if (ids.Count == 0) return 0;
        var existing = await db.WorkTags.Where(w => w.WorkId == workId && ids.Contains(w.TagId))
            .Select(w => w.TagId).ToListAsync(ct);
        var toAdd = ids.Except(existing).ToList();
        foreach (var tagId in toAdd)
            db.WorkTags.Add(new WorkTag { WorkId = workId, TagId = tagId });
        await db.SaveChangesAsync(ct);
        return toAdd.Count;
    }

    /// <summary>移除作品的某个标签</summary>
    public async Task<bool> RemoveWorkTagAsync(int workId, int tagId, CancellationToken ct = default)
    {
        using var db = CreateDb();
        var link = await db.WorkTags.FirstOrDefaultAsync(w => w.WorkId == workId && w.TagId == tagId, ct);
        if (link == null) return false;
        db.WorkTags.Remove(link);
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>批量给多部作品添加标签（幂等；按 (WorkId, TagId) 去重）</summary>
    public async Task<int> AddWorkTagsBatchAsync(IEnumerable<int> workIds, IEnumerable<int> tagIds, CancellationToken ct = default)
    {
        using var db = CreateDb();
        var wids = workIds.Distinct().ToList();
        var tids = tagIds.Distinct().ToList();
        if (wids.Count == 0 || tids.Count == 0) return 0;

        var existing = await db.WorkTags
            .Where(w => wids.Contains(w.WorkId) && tids.Contains(w.TagId))
            .Select(w => new { w.WorkId, w.TagId })
            .ToListAsync(ct);
        var existSet = existing.Select(x => (x.WorkId, x.TagId)).ToHashSet();

        var toAdd = new List<WorkTag>();
        foreach (var wid in wids)
            foreach (var tid in tids)
                if (!existSet.Contains((wid, tid)))
                    toAdd.Add(new WorkTag { WorkId = wid, TagId = tid });
        db.WorkTags.AddRange(toAdd);
        await db.SaveChangesAsync(ct);
        return toAdd.Count;
    }

    /// <summary>批量移除多部作品的指定标签（幂等；不存在的关联忽略）</summary>
    public async Task<int> RemoveWorkTagsBatchAsync(IEnumerable<int> workIds, IEnumerable<int> tagIds, CancellationToken ct = default)
    {
        using var db = CreateDb();
        var wids = workIds.Distinct().ToList();
        var tids = tagIds.Distinct().ToList();
        if (wids.Count == 0 || tids.Count == 0) return 0;

        var links = await db.WorkTags
            .Where(w => wids.Contains(w.WorkId) && tids.Contains(w.TagId))
            .ToListAsync(ct);
        db.WorkTags.RemoveRange(links);
        await db.SaveChangesAsync(ct);
        return links.Count;
    }

    /// <summary>标签搜索（用于标签选择器：按原文/中文/命名空间模糊匹配，按使用次数降序）</summary>
    public async Task<List<Tag>> SearchTagsAsync(string? q, string? category, int limit = 50, CancellationToken ct = default)
    {
        using var db = CreateDb();
        var query = db.Tags.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var kw = q.Trim();
            query = query.Where(t => t.Name.Contains(kw) || (t.NameCn != null && t.NameCn.Contains(kw)) || t.Namespace.Contains(kw));
        }
        return await query
            .GroupJoin(db.WorkTags.AsNoTracking(), t => t.Id, w => w.TagId, (t, ws) => new { Tag = t, Count = ws.Count() })
            .OrderByDescending(x => x.Count).ThenBy(x => x.Tag.Name)
            .Take(Math.Clamp(limit, 1, 200))
            .Select(x => x.Tag)
            .ToListAsync(ct);
    }

    /// <summary>最常用标签（标签选择器"常用"区）</summary>
    public async Task<List<Tag>> GetCommonTagsAsync(int limit = 30, CancellationToken ct = default)
    {
        using var db = CreateDb();
        return await db.WorkTags.AsNoTracking()
            .GroupBy(w => w.TagId)
            .OrderByDescending(g => g.Count())
            .Take(Math.Clamp(limit, 1, 100))
            .Select(g => db.Tags.First(t => t.Id == g.Key))
            .ToListAsync(ct);
    }

    /// <summary>合并标签：把 from 标签的全部关联（work_tag/manga_tag）搬移到 into 标签并删除 from。
    /// 幂等语义：同作品/同漫画已有 into 关联则跳过；返回 (movedWorkLinks, movedMangaLinks)。</summary>
    public async Task<(int WorkLinks, string? Error)> MergeTagsAsync(int fromId, int intoId, CancellationToken ct = default)
    {
        if (fromId == intoId)
            return (0, "不能合并同一个标签");

        using var db = CreateDb();
        var from = await db.Tags.FirstOrDefaultAsync(t => t.Id == fromId, ct);
        var into = await db.Tags.FirstOrDefaultAsync(t => t.Id == intoId, ct);
        if (from == null || into == null)
            return (0, "标签不存在");

        // 1) work_tag：搬移关联（同 WorkId 已有 into 则去重）
        var fromWorkLinks = await db.WorkTags.Where(w => w.TagId == fromId).ToListAsync(ct);
        var intoWorkIds = (await db.WorkTags.Where(w => w.TagId == intoId).Select(w => w.WorkId).ToListAsync(ct)).ToHashSet();
        var movedWork = 0;
        foreach (var link in fromWorkLinks)
        {
            if (!intoWorkIds.Contains(link.WorkId))
            {
                db.WorkTags.Add(new WorkTag { WorkId = link.WorkId, TagId = intoId });
                intoWorkIds.Add(link.WorkId);
                movedWork++;
            }
            db.WorkTags.Remove(link);
        }

        // 2) 元数据合并：目标缺中文则继承源中文；屏蔽标记取并集
        if (string.IsNullOrWhiteSpace(into.NameCn) && !string.IsNullOrWhiteSpace(from.NameCn))
            into.NameCn = from.NameCn;
        if (from.IsBlocked) into.IsBlocked = true;

        // 3) 删除源标签
        db.Tags.Remove(from);
        await db.SaveChangesAsync(ct);
        _logger.LogInformation("[TagService] 合并标签 {FromId} → {IntoId}：搬移关联 {Work} 条",
            fromId, intoId, movedWork);
        return (movedWork, null);
    }
}
