using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Services;

/// <summary>
/// 后台服务：启动时全量同步本地画廊到数据库，运行时用 FileSystemWatcher 增量更新
/// </summary>
public class GallerySyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<GallerySyncService> _logger;
    private static readonly string DownloadDir = EhentaiService.DefaultDownloadDir;

    public GallerySyncService(IServiceScopeFactory scopeFactory, ILogger<GallerySyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("[GallerySync] 启动全量同步...");

        // 启动时全量同步（不阻塞启动）
        try
        {
            await FullSyncAsync(ct);
            _logger.LogInformation("[GallerySync] 全量同步完成");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[GallerySync] 全量同步异常，后台服务继续运行");
        }

        // 启动文件系统监听
        using var watcher = StartWatcher();
        if (watcher == null)
        {
            _logger.LogWarning("[GallerySync] 下载目录不存在，跳过文件监听");
        }

        // 每 5 分钟做一次轻量一致性检查
        while (!ct.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(5), ct);
            try { await ConsistencyCheckAsync(ct); }
            catch (Exception ex) { _logger.LogWarning(ex, "[GallerySync] 一致性检查异常"); }
        }

        _logger.LogInformation("[GallerySync] 服务已停止");
    }

    /// <summary>全量扫描下载目录并写入 DB</summary>
    public async Task FullSyncAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

        if (!Directory.Exists(DownloadDir))
        {
            _logger.LogWarning("[GallerySync] 下载目录不存在: {Dir}", DownloadDir);
            return;
        }

        var dirs = Directory.GetDirectories(DownloadDir);
        int added = 0, updated = 0, unchanged = 0, processed = 0;

        // 一次查询加载全部已有记录到内存
        var existing = await db.LocalGalleries.ToDictionaryAsync(g => g.Gid, ct);
        var processedGids = new HashSet<int>();
        _logger.LogInformation("[GallerySync] 扫描 {Count} 个目录 (DB 已有 {Existing})...", dirs.Length, existing.Count);

        foreach (var dir in dirs)
        {
            if (ct.IsCancellationRequested) break;
            try
            {
                var item = ParseDirectory(dir);
                if (item == null) continue;

                if (existing.TryGetValue(item.Gid, out var entity))
                {
                    if (HasChanged(entity, item))
                    {
                        UpdateEntity(entity, item);
                        updated++;
                    }
                    else
                    {
                        unchanged++;
                    }
                }
                else
                {
                    db.LocalGalleries.Add(item);
                    added++;
                }
                processedGids.Add(item.Gid);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[GallerySync] 目录解析失败 {Dir}: {Msg}", dir, ex.Message);
            }

            processed++;
            // 每 200 个目录保存一次，每 500 个输出一次进度
            if (processed % 200 == 0)
            {
                await db.SaveChangesAsync(ct);
                await Task.Yield();
            }
            if (processed % 500 == 0)
            {
                _logger.LogInformation("[GallerySync] 进度: {Processed}/{Total}", processed, dirs.Length);
            }
        }

        // 清理已删除的目录
        var deletedGids = existing.Keys.Except(processedGids).ToList();
        if (deletedGids.Count > 0)
        {
            var deletedEntities = deletedGids.Select(gid => existing[gid]).ToList();
            db.LocalGalleries.RemoveRange(deletedEntities);
        }

        await db.SaveChangesAsync(ct);

        // 批量更新所有已处理画廊的 SyncedAt，一条 SQL 代替 N 条
        var now = DateTime.UtcNow;
        await db.LocalGalleries
            .Where(g => processedGids.Contains(g.Gid))
            .ExecuteUpdateAsync(s => s.SetProperty(g => g.SyncedAt, now), ct);

        _logger.LogInformation(
            "[GallerySync] 全量同步: 新增 {Added}, 更新 {Updated}, 未变 {Unchanged}, 删除 {Deleted}",
            added, updated, unchanged, deletedGids.Count);
    }

    /// <summary>增量同步单个目录</summary>
    public async Task SyncDirectoryAsync(string dirPath)
    {
        try
        {
            var item = ParseDirectory(dirPath);
            if (item == null) return;

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var existing = await db.LocalGalleries.FindAsync(item.Gid);
            if (existing != null)
                UpdateEntity(existing, item);
            else
                db.LocalGalleries.Add(item);
            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning("[GallerySync] 增量同步失败 {Dir}: {Msg}", dirPath, ex.Message);
        }
    }

    /// <summary>从 DB 删除已不存在的目录</summary>
    public async Task RemoveDirectoryAsync(string dirPath)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
        var entity = await db.LocalGalleries.FirstOrDefaultAsync(g => g.DirPath == dirPath);
        if (entity != null)
        {
            db.LocalGalleries.Remove(entity);
            await db.SaveChangesAsync();
            _logger.LogInformation("[GallerySync] 已删除记录: {Dir}", dirPath);
        }
    }

    // ==================== 内部辅助 ====================

    private LocalGallery? ParseDirectory(string dir)
    {
        var dirName = Path.GetFileName(dir);
        var dashIdx = dirName.IndexOf('-');
        if (dashIdx <= 0 || !int.TryParse(dirName[..dashIdx], out var gid)) return null;

        var title = dirName[(dashIdx + 1)..];
        var files = Directory.GetFiles(dir)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f)
            .ToList();

        if (files.Count == 0) return null;

        var cover = files.FirstOrDefault(f =>
            Path.GetFileNameWithoutExtension(f).EndsWith("0001") ||
            Path.GetFileNameWithoutExtension(f).EndsWith("01")) ?? files[0];

        var item = new LocalGallery
        {
            Gid = gid,
            Title = title,
            DirPath = dir,
            FileCount = files.Count,
            FileSize = files.Sum(f => SafeFileLength(f)),
            CoverFile = cover,
            LastModified = Directory.GetLastWriteTime(dir),
            SyncedAt = DateTime.UtcNow
        };

        // 读取 .meta.json
        var metaFile = Path.Combine(dir, ".meta.json");
        if (File.Exists(metaFile))
        {
            try
            {
                var json = File.ReadAllText(metaFile);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("category", out var cat)) item.Category = cat.GetString();
                if (root.TryGetProperty("language", out var lang)) item.Language = lang.GetString();
                if (root.TryGetProperty("rating", out var rat))
                {
                    if (rat.ValueKind == JsonValueKind.String && double.TryParse(rat.GetString(), out var rv)) item.Rating = rv;
                    else if (rat.TryGetDouble(out var rv2)) item.Rating = rv2;
                }
                if (root.TryGetProperty("downloadedAt", out var da) && DateTime.TryParse(da.GetString(), out var dt)) item.DownloadedAt = dt;
                if (root.TryGetProperty("tags", out var tags))
                {
                    if (tags.TryGetProperty("artist", out var a) && a.ValueKind == JsonValueKind.Array)
                        item.Artists = JsonSerializer.Serialize(a.EnumerateArray().Select(x => x.GetString()).Where(x => x != null));
                    if (tags.TryGetProperty("group", out var gr) && gr.ValueKind == JsonValueKind.Array)
                        item.Groups = JsonSerializer.Serialize(gr.EnumerateArray().Select(x => x.GetString()).Where(x => x != null));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning("[GallerySync] meta.json 解析失败 {File}: {Msg}", metaFile, ex.Message);
            }
        }

        // 读取 .eh 文件的 token 和在线链接
        var ehFile = Path.Combine(dir, ".eh");
        if (File.Exists(ehFile))
        {
            try
            {
                foreach (var line in File.ReadLines(ehFile))
                {
                    if (line.StartsWith("token=")) item.Token = line[6..];
                    else if (line.StartsWith("url=")) item.OnlineUrl = line[4..];
                }
            }
            catch { }
        }

        return item;
    }

    private static void UpdateEntity(LocalGallery entity, LocalGallery source)
    {
        entity.Title = source.Title;
        entity.DirPath = source.DirPath;
        entity.Category = source.Category;
        entity.Language = source.Language;
        entity.Rating = source.Rating;
        entity.FileCount = source.FileCount;
        entity.FileSize = source.FileSize;
        entity.CoverFile = source.CoverFile;
        entity.Artists = source.Artists;
        entity.Groups = source.Groups;
        entity.OnlineUrl = source.OnlineUrl;
        entity.Token = source.Token;
        entity.DownloadedAt = source.DownloadedAt;
        entity.LastModified = source.LastModified;
        entity.SyncedAt = DateTime.UtcNow;
    }

    /// <summary>比较关键字段是否有变化（不含 SyncedAt）</summary>
    private static bool HasChanged(LocalGallery entity, LocalGallery source)
    {
        return entity.Title != source.Title
            || entity.DirPath != source.DirPath
            || entity.Category != source.Category
            || entity.Language != source.Language
            || entity.Rating != source.Rating
            || entity.FileCount != source.FileCount
            || entity.FileSize != source.FileSize
            || entity.CoverFile != source.CoverFile
            || entity.Artists != source.Artists
            || entity.Groups != source.Groups
            || entity.OnlineUrl != source.OnlineUrl
            || entity.Token != source.Token
            || entity.DownloadedAt != source.DownloadedAt
            || entity.LastModified != source.LastModified;
    }

    private async Task ConsistencyCheckAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
        var all = await db.LocalGalleries.ToListAsync(ct);
        var missing = all.Where(g => !Directory.Exists(g.DirPath)).ToList();
        if (missing.Count > 0)
        {
            db.LocalGalleries.RemoveRange(missing);
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("[GallerySync] 一致性检查: 清理 {Count} 条失效记录", missing.Count);
        }
    }

    private FileSystemWatcher? StartWatcher()
    {
        if (!Directory.Exists(DownloadDir)) return null;

        var watcher = new FileSystemWatcher(DownloadDir)
        {
            IncludeSubdirectories = false,
            NotifyFilter = NotifyFilters.DirectoryName | NotifyFilters.LastWrite
        };

        watcher.Created += async (s, e) =>
        {
            // 等待写入完成
            await Task.Delay(2000);
            await SyncDirectoryAsync(e.FullPath);
        };

        watcher.Deleted += async (s, e) =>
        {
            await RemoveDirectoryAsync(e.FullPath);
        };

        watcher.Renamed += async (s, e) =>
        {
            await RemoveDirectoryAsync(e.OldFullPath);
            await Task.Delay(2000);
            await SyncDirectoryAsync(e.FullPath);
        };

        watcher.EnableRaisingEvents = true;
        _logger.LogInformation("[GallerySync] FileSystemWatcher 已启动");
        return watcher;
    }

    private static long SafeFileLength(string path)
    {
        try { return new FileInfo(path).Length; }
        catch { return 0; }
    }

    private static bool IsImageFile(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".bmp" => true,
        _ => false
    };
}
