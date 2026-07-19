using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Services;

/// <summary>
/// 本地画廊服务：数据库为元数据主索引，文件系统为图片源
/// </summary>
public class LocalGalleryService
{
    private readonly EhentaiService _eh;
    private readonly IServiceScopeFactory _scopeFactory;
    private static readonly string BaseDir = EhentaiService.DefaultDownloadDir;

    /// <summary>旧版 Manga ID → 本地目录路径的映射（负数 gid 的防腐层）</summary>
    private static readonly ConcurrentDictionary<int, string> _legacyDirs = new();

    public LocalGalleryService(EhentaiService eh, IServiceScopeFactory scopeFactory)
    {
        _eh = eh;
        _scopeFactory = scopeFactory;
    }

    private MangaDbContext CreateDb() => _scopeFactory.CreateScope().ServiceProvider.GetRequiredService<MangaDbContext>();

    /// <summary>注册旧版 Manga 目录映射（用于负数虚拟 gid → 真实目录的查找）</summary>
    public static void RegisterLegacyDir(int legacyId, string dirPath)
    {
        _legacyDirs[-Math.Abs(legacyId)] = dirPath;
    }

    /// <summary>扫描本地画廊目录，返回列表（兼容旧接口，从 DB 查询）</summary>
    public List<LocalGalleryItem> ScanLocalGalleries()
    {
        using var db = CreateDb();
        return db.LocalGalleries.AsNoTracking()
            .OrderByDescending(g => g.LastModified)
            .Select(MapToItem)
            .ToList();
    }

    /// <summary>DB 查询辅助——从 LocalGallery 实体映射到 LocalGalleryItem</summary>
    private static LocalGalleryItem MapToItem(LocalGallery g) => new()
    {
        Gid = g.Gid,
        Title = g.Title,
        DirPath = g.DirPath,
        FileCount = g.FileCount,
        TotalSize = g.FileSize,
        CoverFile = g.CoverFile ?? "",
        LastModified = g.LastModified,
        Category = g.Category,
        Rating = g.Rating,
        Language = g.Language,
        Artists = DeserializeJsonList(g.Artists),
        Groups = DeserializeJsonList(g.Groups),
        DownloadedAt = g.DownloadedAt
    };

    private static List<string> DeserializeJsonList(string? json)
    {
        if (string.IsNullOrEmpty(json)) return new();
        try { return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new(); }
        catch { return new(); }
    }

    /// <summary>手动失效扫描缓存（DB 化后变为空操作，数据已由后台同步服务管理）</summary>
    public static void InvalidateScanCache()
    {
        lock (_pageFilesCacheLock) { _pageFilesCache.Clear(); }
    }

    private static readonly Dictionary<int, (List<string> Files, DateTime Time)> _pageFilesCache = new();
    private static readonly object _pageFilesCacheLock = new();
    private static readonly TimeSpan _pageFilesCacheTtl = TimeSpan.FromSeconds(10);

    /// <summary>按 gid 从 DB 查找画廊条目（O(1)）</summary>
    public LocalGalleryItem? GetCachedItem(int gid)
    {
        using var db = CreateDb();
        var entity = db.LocalGalleries.AsNoTracking().FirstOrDefault(g => g.Gid == gid);
        return entity == null ? null : MapToItem(entity);
    }

    /// <summary>获取轻量元数据列表（从 DB，替代文件扫描）</summary>
    public List<LocalGalleryMeta> GetGalleryMetas()
    {
        using var db = CreateDb();
        return db.LocalGalleries.AsNoTracking()
            .Select(g => new LocalGalleryMeta
            {
                Gid = g.Gid,
                Artists = DeserializeJsonList(g.Artists),
                Groups = DeserializeJsonList(g.Groups),
                Category = g.Category,
                Language = g.Language
            }).ToList();
    }

    /// <summary>分页获取画廊摘要（DB 查询，筛选+排序在 SQL 层面完成）</summary>
    public GalleryPagedResult GetPagedGalleries(string? group, string? search, string? sort,
        int page, int pageSize, List<int>? albumGids = null, List<int>? albumOrder = null)
    {
        using var db = CreateDb();
        var query = db.LocalGalleries.AsNoTracking().AsQueryable();

        // 分组筛选
        if (!string.IsNullOrEmpty(group) && group != "all")
        {
            if (group.StartsWith("album:"))
            {
                // 优先按 AlbumKey 筛选，若 AlbumKey 尚未同步则回退到 albumGids
                var albumKey = group[6..];
                query = query.Where(g => g.AlbumKey == albumKey);

                // 自定义排序 / fallback
                if (sort == "custom" && albumOrder != null && albumOrder.Count > 0)
                {
                    var all = query.ToList();
                    // AlbumKey 未就绪时回退到 albumGids
                    if (all.Count == 0 && albumGids != null && albumGids.Count > 0)
                    {
                        var gidSet = new HashSet<int>(albumGids);
                        query = db.LocalGalleries.AsNoTracking().Where(g => gidSet.Contains(g.Gid));
                        all = query.ToList();
                        // 也用 albumOrder 排序
                    }
                    var orderMap = new Dictionary<int, int>();
                    for (int i = 0; i < albumOrder.Count; i++) orderMap[albumOrder[i]] = i;
                    all = all.OrderBy(g => orderMap.GetValueOrDefault(g.Gid, 9999)).ToList();
                    var total = all.Count;
                    var totalPages = (int)Math.Ceiling(total / (double)Math.Max(1, pageSize));
                    var safePage = Math.Clamp(page, 1, Math.Max(1, totalPages));
                    return new GalleryPagedResult
                    {
                        Items = all.Skip((safePage - 1) * pageSize).Take(pageSize).Select(MapToSummary).ToList(),
                        Total = total, TotalPages = totalPages, Page = safePage, PageSize = pageSize
                    };
                }

                // 非 custom 排序时也检查 fallback
                var count = query.Count();
                if (count == 0 && albumGids != null && albumGids.Count > 0)
                {
                    var gidSet = new HashSet<int>(albumGids);
                    query = db.LocalGalleries.AsNoTracking().Where(g => gidSet.Contains(g.Gid));
                }
            }
            else
            {
                // 自动分组：排除已分配作品
                query = query.Where(g => g.AlbumKey == null);

                if (group == "multi")
                {
                    // multi: JSON 数组有 2+ 元素 ↔ 字符串中有逗号（即不止一个元素）
                    query = query.Where(g =>
                        (g.Artists != null && g.Artists.Contains(",")) ||
                        (g.Groups != null && g.Groups.Contains(",")));
                }
                else if (group == "unknown")
                {
                    query = query.Where(g =>
                        (g.Artists == null || g.Artists == "[]") &&
                        (g.Groups == null || g.Groups == "[]"));
                }
                else if (group.StartsWith("artist:"))
                {
                    // SQLite: Artists LIKE '["name"%' → 匹配数组首元素
                    var namePattern = $"[\"{group[7..]}\"";
                    query = query.Where(g => g.Artists != null && g.Artists.StartsWith(namePattern));
                }
                else if (group.StartsWith("group:"))
                {
                    var namePattern = $"[\"{group[6..]}\"";
                    query = query.Where(g => g.Groups != null && g.Groups.StartsWith(namePattern));
                }
            }
        }

        // 搜索筛选
        if (!string.IsNullOrWhiteSpace(search))
        {
            var terms = search.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            foreach (var term in terms)
            {
                var lower = term.ToLower();
                var colonIdx = term.IndexOf(':');
                if (colonIdx > 0)
                {
                    var prefix = term[..colonIdx].ToLower();
                    var value = term[(colonIdx + 1)..].ToLower();
                    switch (prefix)
                    {
                        case "artist":
                            query = query.Where(g => g.Artists != null && g.Artists.ToLower().Contains(value));
                            break;
                        case "group":
                            query = query.Where(g => g.Groups != null && g.Groups.ToLower().Contains(value));
                            break;
                        case "category":
                            query = query.Where(g => g.Category != null && g.Category.ToLower().Contains(value));
                            break;
                        case "language":
                            query = query.Where(g => g.Language != null && g.Language.ToLower().Contains(value));
                            break;
                        default:
                            query = query.Where(g =>
                                g.Title.ToLower().Contains(lower) ||
                                g.Gid.ToString().Contains(lower) ||
                                (g.Artists != null && g.Artists.ToLower().Contains(lower)) ||
                                (g.Groups != null && g.Groups.ToLower().Contains(lower)));
                            break;
                    }
                }
                else
                {
                    query = query.Where(g =>
                        g.Title.ToLower().Contains(lower) ||
                        g.Gid.ToString().Contains(lower) ||
                        (g.Artists != null && g.Artists.ToLower().Contains(lower)) ||
                        (g.Groups != null && g.Groups.ToLower().Contains(lower)) ||
                        (g.Language != null && g.Language.ToLower().Contains(lower)) ||
                        (g.Category != null && g.Category.ToLower().Contains(lower)));
                }
            }
        }

        // 排序 + 分页
        query = ApplyDbSort(query, sort);

        var queryTotal = query.Count();
        var queryTotalPages = (int)Math.Ceiling(queryTotal / (double)Math.Max(1, pageSize));
        var querySafePage = Math.Clamp(page, 1, Math.Max(1, queryTotalPages));
        var queryItems = query.Skip((querySafePage - 1) * pageSize).Take(pageSize).Select(g => MapToSummary(g)).ToList();

        return new GalleryPagedResult
        {
            Items = queryItems,
            Total = queryTotal,
            TotalPages = queryTotalPages,
            Page = querySafePage,
            PageSize = pageSize
        };
    }

    private static LocalGallerySummary MapToSummary(LocalGallery g) => new()
    {
        Gid = g.Gid,
        Title = g.Title,
        FileCount = g.FileCount,
        TotalSize = g.FileSize,
        Category = g.Category,
        Language = g.Language,
        Rating = g.Rating,
        LastModified = g.LastModified,
        Artists = DeserializeJsonList(g.Artists),
        Groups = DeserializeJsonList(g.Groups)
    };

    private static IQueryable<LocalGallery> ApplyDbSort(IQueryable<LocalGallery> query, string? sort)
    {
        if (string.IsNullOrEmpty(sort)) return query.OrderByDescending(g => g.LastModified);
        var parts = sort.Split('-');
        var desc = parts.Length > 1 && parts[1] == "desc";
        return parts[0] switch
        {
            "modified" => desc ? query.OrderByDescending(g => g.LastModified) : query.OrderBy(g => g.LastModified),
            "title" => desc ? query.OrderByDescending(g => g.Title) : query.OrderBy(g => g.Title),
            "pages" => desc ? query.OrderByDescending(g => g.FileCount) : query.OrderBy(g => g.FileCount),
            "size" => desc ? query.OrderByDescending(g => g.FileSize) : query.OrderBy(g => g.FileSize),
            _ => query.OrderByDescending(g => g.LastModified)
        };
    }

    // 内存排序（album: 大批量 gid 时全量加载实体后排序）
    private static IEnumerable<LocalGallery> ApplyMemSort(IEnumerable<LocalGallery> items, string? sort)
    {
        if (string.IsNullOrEmpty(sort)) return items.OrderByDescending(g => g.LastModified);
        var parts = sort.Split('-');
        var desc = parts.Length > 1 && parts[1] == "desc";
        return parts[0] switch
        {
            "modified" => desc ? items.OrderByDescending(g => g.LastModified) : items.OrderBy(g => g.LastModified),
            "title" => desc ? items.OrderByDescending(g => g.Title) : items.OrderBy(g => g.Title),
            "pages" => desc ? items.OrderByDescending(g => g.FileCount) : items.OrderBy(g => g.FileCount),
            "size" => desc ? items.OrderByDescending(g => g.FileSize) : items.OrderBy(g => g.FileSize),
            _ => items.OrderByDescending(g => g.LastModified)
        };
    }



    /// <summary>随机抽取 N 部作品（DB 随机排序）</summary>
    public GalleryPagedResult GetRandomGalleries(int count = 20)
    {
        using var db = CreateDb();
        var all = db.LocalGalleries.AsNoTracking().ToList();
        var picked = all.OrderBy(_ => Random.Shared.Next()).Take(count).ToList();

        return new GalleryPagedResult
        {
            Items = picked.Select(MapToSummary).ToList(),
            Total = picked.Count,
            TotalPages = 1,
            Page = 1,
            PageSize = count
        };
    }

    /// <summary>计算侧边栏分组信息（DB 加载 + 内存聚合）</summary>
    public List<GroupInfo> GetGalleryGroups()
    {
        using var db = CreateDb();
        var all = db.LocalGalleries.AsNoTracking()
            .Select(g => new { g.Gid, g.Artists, g.Groups })
            .ToList();

        var map = new Dictionary<string, GroupInfo>();
        foreach (var g in all)
        {
            var artists = DeserializeJsonList(g.Artists);
            var grps = DeserializeJsonList(g.Groups);

            if (artists.Count == 1 && grps.Count == 0)
            {
                var key = $"artist:{artists[0]}";
                if (!map.ContainsKey(key)) map[key] = new GroupInfo { Key = key, Type = "artist", Name = artists[0], Count = 0 };
                map[key].Count++;
            }
            else if (grps.Count == 1 && artists.Count == 0)
            {
                var key = $"group:{grps[0]}";
                if (!map.ContainsKey(key)) map[key] = new GroupInfo { Key = key, Type = "group", Name = grps[0], Count = 0 };
                map[key].Count++;
            }
            else if (artists.Count == 1 && grps.Count == 1)
            {
                var key = $"artist:{artists[0]}";
                if (!map.ContainsKey(key)) map[key] = new GroupInfo { Key = key, Type = "artist", Name = artists[0], Count = 0 };
                map[key].Count++;
            }
            else if (artists.Count + grps.Count > 1)
            {
                if (!map.ContainsKey("multi")) map["multi"] = new GroupInfo { Key = "multi", Type = "multi", Name = "多作者", Count = 0 };
                map["multi"].Count++;
            }
            else
            {
                if (!map.ContainsKey("unknown")) map["unknown"] = new GroupInfo { Key = "unknown", Type = "unknown", Name = "未分类", Count = 0 };
                map["unknown"].Count++;
            }
        }


        return map.Values.OrderByDescending(g => g.Count).ToList();
    }

    /// <summary>获取画廊详情（优先本地 meta.json，页面列表懒加载）</summary>
    public async Task<LocalGalleryDetail> GetDetailAsync(int gid)
    {
        try
        {
            var dir = FindLocalDir(gid);
            if (dir == null) return new LocalGalleryDetail { Gid = gid };

            var dirName = Path.GetFileName(dir);
            var dashIdx = dirName.IndexOf('-');
            var title = dashIdx > 0 ? dirName[(dashIdx + 1)..] : dirName;

            // 从 meta.json 一次性读取所有元数据（合并原来两段读取）
            string? category = null, language = null, rating = "0";
            int ratingCount = 0, fileCount = 0;
            long totalSize = 0;
            List<string> artists = new(), groups = new(), tags = new();
            var tagGroups = new List<EhentaiService.TagGroup>();
            var metaFile = Path.Combine(dir, ".meta.json");
            if (File.Exists(metaFile))
            {
                try
                {
                    var metaJson = await File.ReadAllTextAsync(metaFile);
                    using var doc = System.Text.Json.JsonDocument.Parse(metaJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("category", out var cat)) category = cat.GetString();
                    if (root.TryGetProperty("language", out var lang)) language = lang.GetString();
                    if (root.TryGetProperty("rating", out var rat))
                    {
                        if (rat.ValueKind == System.Text.Json.JsonValueKind.String) rating = rat.GetString() ?? "0";
                        else if (rat.TryGetDouble(out var rv)) rating = rv.ToString("F1");
                    }
                    if (root.TryGetProperty("ratingCount", out var rc) && rc.TryGetInt32(out var rcv)) ratingCount = rcv;
                    if (root.TryGetProperty("fileCount", out var fc) && fc.TryGetInt32(out var fcv)) fileCount = fcv;
                    if (root.TryGetProperty("fileSize", out var fs) && fs.TryGetInt64(out var fsv)) totalSize = fsv;

                    // 一次性解析 tags → artists/groups/tagGroups/tags
                    if (root.TryGetProperty("tags", out var tgs) && tgs.ValueKind == System.Text.Json.JsonValueKind.Object)
                    {
                        foreach (var ns in tgs.EnumerateObject())
                        {
                            if (ns.Value.ValueKind != System.Text.Json.JsonValueKind.Array) continue;
                            var nsTags = ns.Value.EnumerateArray()
                                .Select(x => x.GetString()!)
                                .Where(x => x != null)
                                .ToList();
                            if (nsTags.Count == 0) continue;

                            tagGroups.Add(new EhentaiService.TagGroup { Namespace = ns.Name, Tags = nsTags });
                            tags.AddRange(nsTags);

                            if (ns.Name == "artist") artists = nsTags;
                            else if (ns.Name == "group") groups = nsTags;
                        }
                    }
                }
                catch { }
            }

            // 如果没有 meta.json 或缺少 fileCount，回退到文件系统扫描
            if (fileCount == 0)
            {
                var files = EnumerateImageFilesSafe(dir).OrderBy(f => f).ToList();
                fileCount = files.Count;
                foreach (var f in files)
                {
                    try { totalSize += new FileInfo(f).Length; } catch { }
                }
            }

            return new LocalGalleryDetail
            {
                Gid = gid,
                Title = title,
                Category = category ?? "other",
                FileCount = fileCount,
                TotalSize = totalSize,
                Rating = rating,
                RatingCount = ratingCount,
                Language = language,
                TagGroups = gid < 0 ? new() : tagGroups,
                Tags = tags,
                DirPath = dir,
                Pages = new()  // 页面列表由 /api/local/gallery/{gid}/pages 按需提供
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[LocalGallery] GetDetailAsync gid={gid} error: {ex.Message}");
            return new LocalGalleryDetail { Gid = gid, Title = $"Error: {ex.Message}" };
        }
    }

    /// <summary>获取画廊页面列表（直接从文件系统，带短期缓存）</summary>
    public List<LocalPageItem> GetGalleryPages(int gid)
    {
        var files = GetCachedPageFiles(gid);
        if (files == null) return new();
        return files.Select((f, i) => new LocalPageItem
        {
            Index = i + 1,
            FileName = Path.GetFileName(f),
            Url = $"/api/local/gallery/{gid}/page/{i}"
        }).ToList();
    }

    /// <summary>获取缓存的页面文件列表（按 gid 缓存 10 秒，避免同一画廊反复枚举目录）</summary>
    private List<string>? GetCachedPageFiles(int gid)
    {
        var now = DateTime.UtcNow;
        lock (_pageFilesCacheLock)
        {
            if (_pageFilesCache.TryGetValue(gid, out var entry) && (now - entry.Time) < _pageFilesCacheTtl)
                return entry.Files;
        }
        var dir = FindLocalDir(gid);
        if (dir == null) return null;
        try
        {
            var files = Directory.GetFiles(dir).Where(f => IsImageFile(f)).OrderBy(f => f).ToList();
            lock (_pageFilesCacheLock) { _pageFilesCache[gid] = (files, now); }
            return files;
        }
        catch { return null; }
    }

    /// <summary>安全枚举图片文件（忽略无法访问的）</summary>
    private static IEnumerable<string> EnumerateImageFilesSafe(string dir)
    {
        try { return Directory.GetFiles(dir).Where(f => IsImageFile(f)); }
        catch { return Array.Empty<string>(); }
    }

    /// <summary>从 EH 获取画廊详情（用于补全元数据）</summary>
    public async Task<EhentaiService.GalleryDetail?> GetEHDetailAsync(int gid, string token)
    {
        try { return await _eh.GetGalleryDetailAsync(gid, token); }
        catch { return null; }
    }

    /// <summary>获取本地图片文件路径（使用缓存的文件列表）</summary>
    public string? GetPageFilePath(int gid, int pageIndex)
    {
        var files = GetCachedPageFiles(gid);
        if (files == null || pageIndex < 0 || pageIndex >= files.Count) return null;
        return files[pageIndex];
    }

    private string? FindLocalDir(int gid)
    {
        // 负数 gid：旧版 Manga 防腐层，从注册的映射中查找
        if (gid < 0)
        {
            _legacyDirs.TryGetValue(gid, out var dir);
            return dir;
        }
        if (!Directory.Exists(BaseDir)) return null;
        return Directory.GetDirectories(BaseDir, $"{gid}-*").FirstOrDefault();
    }

    /// <summary>导入外部作品：从源目录复制/链接图片到下载目录，创建 meta.json</summary>
    public async Task<LocalGalleryItem> ImportGalleryAsync(string sourceDir, string title, string? category,
        string? language, List<string>? artists, List<string>? groups, List<string>? otherTags,
        bool copyFiles = true)
    {
        if (!Directory.Exists(sourceDir))
            throw new Exception("源目录不存在");

        var imageFiles = Directory.GetFiles(sourceDir)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f)
            .ToList();

        if (imageFiles.Count == 0)
            throw new Exception("源目录中没有图片文件");

        // 生成唯一 GID（使用时间戳 + 随机数）
        var gid = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 100000000 + new Random().Next(1000, 9999));
        // 确保不重复
        while (Directory.GetDirectories(BaseDir, $"{gid}-*").Any())
            gid = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 100000000 + new Random().Next(1000, 9999));

        // 安全化标题（移除非法字符）
        var safeTitle = string.Join("_", (title ?? "未命名").Split(Path.GetInvalidFileNameChars()));
        if (safeTitle.Length > 80) safeTitle = safeTitle[..80];
        var targetDir = Path.Combine(BaseDir, $"{gid}-{safeTitle}");
        Directory.CreateDirectory(targetDir);

        // 复制或链接图片文件
        for (int i = 0; i < imageFiles.Count; i++)
        {
            var src = imageFiles[i];
            var ext = Path.GetExtension(src);
            var dst = Path.Combine(targetDir, $"{i + 1:D4}{ext}");
            if (copyFiles)
                File.Copy(src, dst);
            else
                File.CreateSymbolicLink(dst, src);
        }

        // 构建 tags 字典
        var tags = new Dictionary<string, List<string>>();
        if (artists != null && artists.Count > 0) tags["artist"] = artists;
        if (groups != null && groups.Count > 0) tags["group"] = groups;
        if (language != null) tags["language"] = new List<string> { language };
        if (otherTags != null && otherTags.Count > 0) tags["other"] = otherTags;

        // 写入 meta.json
        var meta = new
        {
            gid,
            title = safeTitle,
            titleJpn = (string?)null,
            category = category ?? "other",
            uploader = "",
            rating = "0",
            ratingCount = 0,
            fileCount = imageFiles.Count,
            fileSize = imageFiles.Sum(f => new FileInfo(f).Length),
            language,
            tags,
            downloadedAt = DateTime.UtcNow.ToString("o")
        };
        var json = System.Text.Json.JsonSerializer.Serialize(meta, new System.Text.Json.JsonSerializerOptions
        { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        await File.WriteAllTextAsync(Path.Combine(targetDir, ".meta.json"), json);

        // 返回新建的 LocalGalleryItem
        return new LocalGalleryItem
        {
            Gid = gid,
            Title = safeTitle,
            DirPath = targetDir,
            FileCount = imageFiles.Count,
            TotalSize = meta.fileSize,
            CoverFile = imageFiles[0],
            LastModified = Directory.GetLastWriteTime(targetDir),
            Category = category,
            Language = language,
            Artists = artists ?? new(),
            Groups = groups ?? new(),
            DownloadedAt = DateTime.UtcNow
        };
    }

    /// <summary>批量导入：扫描父目录下的子文件夹，每个子文件夹作为一个作品</summary>
    public async Task<List<object>> BatchImportAsync(string parentDir, bool copyFiles = true)
    {
        if (!Directory.Exists(parentDir))
            throw new Exception("目录不存在");

        var subDirs = Directory.GetDirectories(parentDir);
        if (subDirs.Length == 0)
            throw new Exception("没有找到子文件夹");

        var results = new List<object>();
        foreach (var subDir in subDirs)
        {
            try
            {
                var folderName = Path.GetFileName(subDir);
                var item = await ImportGalleryAsync(subDir, folderName, "other", null, null, null, null, copyFiles);
                results.Add(new { success = true, gid = item.Gid, title = item.Title, fileCount = item.FileCount });
            }
            catch (Exception ex)
            {
                results.Add(new { success = false, folder = Path.GetFileName(subDir), error = ex.Message });
            }
        }
        return results;
    }

    /// <summary>更新已有作品的 meta.json 标签</summary>
    public async Task UpdateMetaTagsAsync(int gid, Dictionary<string, List<string>> tags,
        string? title = null, string? category = null, string? language = null)
    {
        var dir = FindLocalDir(gid);
        if (dir == null) throw new Exception($"未找到 gid={gid} 的本地目录");

        var metaFile = Path.Combine(dir, ".meta.json");
        // 读取现有 meta.json
        Dictionary<string, object>? existingMeta = null;
        if (File.Exists(metaFile))
        {
            try
            {
                existingMeta = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(
                    File.ReadAllText(metaFile));
            }
            catch { }
        }

        var meta = new Dictionary<string, object>
        {
            ["gid"] = gid,
            ["tags"] = tags,
            ["downloadedAt"] = existingMeta?.GetValueOrDefault("downloadedAt") ?? DateTime.UtcNow.ToString("o")
        };
        // 保留或更新其他字段
        meta["title"] = title ?? existingMeta?.GetValueOrDefault("title")?.ToString() ?? Path.GetFileName(dir);
        meta["titleJpn"] = existingMeta?.GetValueOrDefault("titleJpn")?.ToString() ?? "";
        meta["category"] = category ?? existingMeta?.GetValueOrDefault("category")?.ToString() ?? "other";
        meta["uploader"] = existingMeta?.GetValueOrDefault("uploader")?.ToString() ?? "";
        meta["rating"] = existingMeta?.GetValueOrDefault("rating")?.ToString() ?? "0";
        meta["ratingCount"] = existingMeta?.GetValueOrDefault("ratingCount") ?? 0;
        meta["fileCount"] = existingMeta?.GetValueOrDefault("fileCount") ?? 0;
        meta["fileSize"] = existingMeta?.GetValueOrDefault("fileSize") ?? 0;
        meta["language"] = language ?? existingMeta?.GetValueOrDefault("language")?.ToString() ?? "";

        var json = System.Text.Json.JsonSerializer.Serialize(meta, new System.Text.Json.JsonSerializerOptions
        { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        await File.WriteAllTextAsync(metaFile, json);
    }

    /// <summary>读取作品的 meta.json 标签（用于编辑）</summary>
    public Dictionary<string, List<string>>? GetMetaTags(int gid)
    {
        var dir = FindLocalDir(gid);
        if (dir == null) return null;
        var metaFile = Path.Combine(dir, ".meta.json");
        if (!File.Exists(metaFile)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(metaFile));
            if (doc.RootElement.TryGetProperty("tags", out var tags))
            {
                return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, List<string>>>(tags.GetRawText());
            }
        }
        catch { }
        return null;
    }

    /// <summary>获取缓存的 meta 标签（不读文件，避免专辑详情页大量 IO）</summary>
    public static Dictionary<string, List<string>>? GetCachedMetaTags(int gid)
    {
        // 直接读取 meta.json（后续可加内存缓存）
        var localDir = FindLocalDirStatic(gid);
        if (localDir == null) return null;
        var metaFile = Path.Combine(localDir, ".meta.json");
        if (!File.Exists(metaFile)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(metaFile));
            if (doc.RootElement.TryGetProperty("tags", out var tags))
            {
                return System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, List<string>>>(tags.GetRawText());
            }
        }
        catch { }
        return null;
    }

    private static string? FindLocalDirStatic(int gid)
    {
        if (gid < 0)
        {
            _legacyDirs.TryGetValue(gid, out var dir);
            return dir;
        }
        if (!Directory.Exists(BaseDir)) return null;
        return Directory.GetDirectories(BaseDir, $"{gid}-*").FirstOrDefault();
    }

    private static bool IsImageFile(string path) => Path.GetExtension(path).ToLower() switch
    {
        ".jpg" or ".jpeg" or ".png" or ".webp" or ".gif" or ".bmp" => true,
        _ => false
    };
}

public class LocalGalleryItem
{
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public string DirPath { get; set; } = "";
    public int FileCount { get; set; }
    public long TotalSize { get; set; }
    public string CoverFile { get; set; } = "";
    public DateTime LastModified { get; set; }
    // 从 .meta.json 读取的元数据（可能为 null）
    public string? Category { get; set; }
    public double Rating { get; set; }
    public string? Language { get; set; }
    public List<string> Artists { get; set; } = new();
    public List<string> Groups { get; set; } = new();
    public DateTime? DownloadedAt { get; set; }
}

public class LocalGalleryDetail
{
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public string? TitleJpn { get; set; }
    public string Category { get; set; } = "other";
    public string Uploader { get; set; } = "";
    public int FileCount { get; set; }
    public long TotalSize { get; set; }
    public string Rating { get; set; } = "0";
    public int RatingCount { get; set; }
    public int FavoriteCount { get; set; }
    public string? Language { get; set; }
    public long Posted { get; set; }
    public string Token { get; set; } = "";
    public List<EhentaiService.TagGroup> TagGroups { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<LocalPageItem> Pages { get; set; } = new();
    public string DirPath { get; set; } = "";
}

public class LocalPageItem
{
    public int Index { get; set; }
    public string FileName { get; set; } = "";
    public string Url { get; set; } = "";
}

/// <summary>轻量元数据（仅分组所需字段，体积小）</summary>
public class LocalGalleryMeta
{
    public int Gid { get; set; }
    public List<string> Artists { get; set; } = new();
    public List<string> Groups { get; set; } = new();
    public string? Category { get; set; }
    public string? Language { get; set; }
}

/// <summary>侧边栏分组信息</summary>
public class GroupInfo
{
    public string Key { get; set; } = "";
    public string Type { get; set; } = "";  // artist | group | multi | unknown
    public string Name { get; set; } = "";
    public int Count { get; set; }
}

/// <summary>分页查询结果</summary>
public class GalleryPagedResult
{
    public List<LocalGallerySummary> Items { get; set; } = new();
    public int Total { get; set; }
    public int TotalPages { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 30;
}

/// <summary>画廊摘要（用于画廊卡片，不含 Pages/Tags/EH 详情）</summary>
public class LocalGallerySummary
{
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public int FileCount { get; set; }
    public long TotalSize { get; set; }
    public string? Category { get; set; }
    public double Rating { get; set; }
    public string? Language { get; set; }
    public DateTime LastModified { get; set; }
    public List<string> Artists { get; set; } = new();
    public List<string> Groups { get; set; } = new();
}
