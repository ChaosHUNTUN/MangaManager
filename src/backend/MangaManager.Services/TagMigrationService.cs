using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Services;

/// <summary>
/// 一次性数据迁移（幂等，work_tag 有数据即跳过）：
/// 1. local_gallery 的 AllTags/Artists/Groups JSON → tag 表 + work_tag 关联
/// 2. album_config → category=album 标签（专辑数据保留不使用，成员转为标签关联，弥补导入作品标签缺失）
/// 3. manga_tag 历史数据 → work_tag（WorkId = -MangaId，统一表）
/// 4. 屏蔽标签种子并入 tag.IsBlocked
/// </summary>
public class TagMigrationService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TagMigrationService> _logger;
    private readonly EhentaiBlockedTagService _blocked;

    public TagMigrationService(IServiceScopeFactory scopeFactory, ILogger<TagMigrationService> logger, EhentaiBlockedTagService blocked)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _blocked = blocked;
    }

    public async Task<bool> RunAsync(bool force = false)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

        var alreadyMigrated = !force && await db.WorkTags.AnyAsync();
        if (alreadyMigrated)
        {
            _logger.LogInformation("[TagMigration] work_tag 已有数据，跳过迁移");
        }
        else
        {
            await RunMainMigrationAsync(db);
        }

        // 无论是否首次迁移，都回填缺失的中文翻译（迁移可能在翻译字典加载前执行过）
        await BackfillNameCnAsync(db);

        _logger.LogInformation("[TagMigration] 迁移完成");
        return !alreadyMigrated;
    }

    private async Task RunMainMigrationAsync(MangaDbContext db)
    {
        // ── 1) 画廊标签 ──
        var galleries = await db.LocalGalleries.AsNoTracking()
            .Select(g => new { g.Gid, g.AllTags, g.Artists, g.Groups })
            .ToListAsync();
        var allPairs = new List<(string ns, string name)>();
        var galleryPairs = new Dictionary<int, List<(string, string)>>();
        foreach (var g in galleries)
        {
            var pairs = TagService.ParseAllTagsJson(g.AllTags);
            foreach (var a in ParseStringList(g.Artists)) pairs.Add(("artist", a));
            foreach (var gr in ParseStringList(g.Groups)) pairs.Add(("group", gr));
            pairs = pairs.Select(p => (TagService.NormalizeNs(p.ns), p.name.Trim())).Distinct().ToList();
            galleryPairs[g.Gid] = pairs;
            allPairs.AddRange(pairs);
        }

        var tagMap = await TagService.EnsureTagsCoreAsync(db, allPairs);
        await db.SaveChangesAsync();

        var links = new List<WorkTag>();
        foreach (var (gid, pairs) in galleryPairs)
        {
            foreach (var p in pairs)
            {
                if (tagMap.TryGetValue(p, out var t))
                    links.Add(new WorkTag { WorkId = gid, TagId = t.Id });
            }
        }
        db.WorkTags.AddRange(links);
        _logger.LogInformation("[TagMigration] 画廊标签：{Gids} 个作品 / {Tags} 个标签 / {Links} 条关联",
            galleryPairs.Count, tagMap.Count, links.Count);

        // ── 2) 专辑 → album 标签 ──
        var albums = await db.AlbumConfigs.AsNoTracking().ToListAsync();
        var albumPairs = albums.Select(a => ("album", a.Name.Trim())).Distinct().ToList();
        var albumTagMap = await TagService.EnsureTagsCoreAsync(db, albumPairs);
        await db.SaveChangesAsync();

        var albumLinks = new List<WorkTag>();
        foreach (var a in albums)
        {
            if (!albumTagMap.TryGetValue(("album", a.Name.Trim()), out var t)) continue;
            List<int> gids = new();
            try { gids = JsonSerializer.Deserialize<List<int>>(a.Gids) ?? new(); } catch { }
            foreach (var gid in gids.Distinct())
                albumLinks.Add(new WorkTag { WorkId = gid, TagId = t.Id });
        }
        db.WorkTags.AddRange(albumLinks);
        _logger.LogInformation("[TagMigration] 专辑标签：{Albums} 个专辑 / {Links} 条关联", albums.Count, albumLinks.Count);

        // ── 3) 屏蔽标签种子 ──
        try
        {
            var blocked = _blocked.GetBlockedTags();
            var allTags = await db.Tags.ToListAsync();
            int marked = 0;
            foreach (var b in blocked)
            {
                var colon = b.IndexOf(':');
                Tag? tag = colon > 0
                    ? allTags.FirstOrDefault(t =>
                        t.Namespace == TagService.NormalizeNs(b[..colon])
                        && string.Equals(t.Name, b[(colon + 1)..], StringComparison.OrdinalIgnoreCase))
                    : allTags.FirstOrDefault(t => string.Equals(t.Name, b, StringComparison.OrdinalIgnoreCase));
                if (tag != null && !tag.IsBlocked) { tag.IsBlocked = true; marked++; }
            }
            _logger.LogInformation("[TagMigration] 屏蔽标签并入：{Marked} 条", marked);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TagMigration] 屏蔽标签并入失败");
        }

        await db.SaveChangesAsync();
    }

    /// <summary>补 NameCn：迁移若在翻译字典加载前执行，标签中文为空，这里统一回填</summary>
    private async Task BackfillNameCnAsync(MangaDbContext db)
    {
        try
        {
            var noCn = await db.Tags.Where(t => t.NameCn == null).ToListAsync();
            if (noCn.Count == 0) return;
            int filled = 0;
            foreach (var t in noCn)
            {
                var cn = EhentaiTagService.TranslateTag($"{t.Namespace}:{t.Name}");
                if (!string.IsNullOrWhiteSpace(cn)) { t.NameCn = cn; filled++; }
            }
            if (filled > 0) await db.SaveChangesAsync();
            _logger.LogInformation("[TagMigration] NameCn 回填：{Filled}/{Total}", filled, noCn.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[TagMigration] NameCn 回填失败");
        }
    }

    private static List<string> ParseStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }
}
