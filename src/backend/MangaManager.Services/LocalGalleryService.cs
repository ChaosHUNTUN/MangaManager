using System.Text.Json.Serialization;

namespace MangaManager.Services;

/// <summary>
/// 本地画廊服务：扫描下载目录，解析 gid，结合 EHentai 数据
/// </summary>
public class LocalGalleryService
{
    private readonly EhentaiService _eh;
    private static readonly string BaseDir = EhentaiService.DefaultDownloadDir;

    public LocalGalleryService(EhentaiService eh) => _eh = eh;

    /// <summary>扫描本地画廊目录，返回列表</summary>
    public List<LocalGalleryItem> ScanLocalGalleries()
    {
        var result = new List<LocalGalleryItem>();
        if (!Directory.Exists(BaseDir)) return result;

        foreach (var dir in Directory.GetDirectories(BaseDir))
        {
            var dirName = Path.GetFileName(dir);
            // 目录格式：{gid}-{标题}
            var dashIdx = dirName.IndexOf('-');
            if (dashIdx <= 0 || !int.TryParse(dirName[..dashIdx], out var gid)) continue;

            var title = dirName[(dashIdx + 1)..];
            var files = Directory.GetFiles(dir)
                .Where(f => IsImageFile(f))
                .OrderBy(f => f)
                .ToList();

            if (files.Count == 0) continue;

            // 找封面（第一张图片）
            var cover = files.FirstOrDefault(f =>
                Path.GetFileNameWithoutExtension(f).EndsWith("0001") ||
                Path.GetFileNameWithoutExtension(f).EndsWith("01")) ?? files[0];

            var item = new LocalGalleryItem
            {
                Gid = gid,
                Title = title,
                DirPath = dir,
                FileCount = files.Count,
                TotalSize = files.Sum(f => new FileInfo(f).Length),
                CoverFile = cover,
                LastModified = Directory.GetLastWriteTime(dir)
            };

            // 读取 .meta.json 元数据
            var metaFile = Path.Combine(dir, ".meta.json");
            if (File.Exists(metaFile))
            {
                try
                {
                    var metaJson = File.ReadAllText(metaFile);
                    using var doc = System.Text.Json.JsonDocument.Parse(metaJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("category", out var cat)) item.Category = cat.GetString();
                    if (root.TryGetProperty("rating", out var rat) && rat.ValueKind == System.Text.Json.JsonValueKind.String && double.TryParse(rat.GetString(), out var rv)) item.Rating = rv;
                    else if (root.TryGetProperty("rating", out var ratN) && ratN.TryGetDouble(out var rv2)) item.Rating = rv2;
                    if (root.TryGetProperty("language", out var lang)) item.Language = lang.GetString();
                    if (root.TryGetProperty("downloadedAt", out var da) && DateTime.TryParse(da.GetString(), out var dt)) item.DownloadedAt = dt;
                    if (root.TryGetProperty("tags", out var tags))
                    {
                        if (tags.TryGetProperty("artist", out var a) && a.ValueKind == System.Text.Json.JsonValueKind.Array)
                            item.Artists = a.EnumerateArray().Select(x => x.GetString()!).Where(x => x != null).ToList();
                        if (tags.TryGetProperty("group", out var gr) && gr.ValueKind == System.Text.Json.JsonValueKind.Array)
                            item.Groups = gr.EnumerateArray().Select(x => x.GetString()!).Where(x => x != null).ToList();
                    }
                }
                catch { /* 解析失败则跳过 */ }
            }

            result.Add(item);
        }

        return result.OrderByDescending(g => g.LastModified).ToList();
    }

    /// <summary>获取画廊详情（优先本地，否则从 EH 获取）</summary>
    public async Task<LocalGalleryDetail> GetDetailAsync(int gid)
    {
        // 先从本地扫描中找到目录
        var dir = FindLocalDir(gid);
        if (dir == null) return new LocalGalleryDetail { Gid = gid };

        var dirName = Path.GetFileName(dir);
        var dashIdx = dirName.IndexOf('-');
        var title = dashIdx > 0 ? dirName[(dashIdx + 1)..] : dirName;

        var files = Directory.GetFiles(dir)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f)
            .ToList();

        var pages = files.Select((f, i) => new LocalPageItem
        {
            Index = i + 1,
            FileName = Path.GetFileName(f),
            Url = $"/api/local/gallery/{gid}/page/{i}"
        }).ToList();

        // 尝试获取 EH 详情（标签等）
        EhentaiService.GalleryDetail? ehDetail = null;
        try
        {
            // 从目录名无法获取 token，先尝试找 .eh 元文件
            var ehFile = Path.Combine(dir, ".eh");
            string? token = null;
            if (File.Exists(ehFile))
            {
                var lines = File.ReadAllLines(ehFile);
                token = lines.FirstOrDefault(l => l.StartsWith("token="))?[6..];
            }
            if (!string.IsNullOrEmpty(token))
            {
                ehDetail = await _eh.GetGalleryDetailAsync(gid, token);
            }
        }
        catch { /* EH 不可用不影响本地浏览 */ }

        return new LocalGalleryDetail
        {
            Gid = gid,
            Title = ehDetail?.Title ?? title,
            TitleJpn = ehDetail?.TitleJpn,
            Category = ehDetail?.Category ?? "other",
            Uploader = ehDetail?.Uploader ?? "",
            FileCount = files.Count,
            TotalSize = files.Sum(f => new FileInfo(f).Length),
            Rating = ehDetail?.Rating ?? "0",
            RatingCount = ehDetail?.RatingCount ?? 0,
            FavoriteCount = ehDetail?.FavoriteCount ?? 0,
            Language = ehDetail?.Language,
            Posted = ehDetail?.Posted ?? 0,
            Token = ehDetail?.Token ?? "",
            TagGroups = ehDetail?.TagGroups ?? new(),
            Tags = ehDetail?.Tags ?? new(),
            Pages = pages,
            DirPath = dir
        };
    }

    /// <summary>从 EH 获取画廊详情（用于补全元数据）</summary>
    public async Task<EhentaiService.GalleryDetail?> GetEHDetailAsync(int gid, string token)
    {
        try { return await _eh.GetGalleryDetailAsync(gid, token); }
        catch { return null; }
    }

    /// <summary>获取本地图片文件路径</summary>
    public string? GetPageFilePath(int gid, int pageIndex)
    {
        var dir = FindLocalDir(gid);
        if (dir == null) return null;
        var files = Directory.GetFiles(dir)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f)
            .ToList();
        if (pageIndex < 0 || pageIndex >= files.Count) return null;
        return files[pageIndex];
    }

    private string? FindLocalDir(int gid)
    {
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
        meta["language"] = language ?? existingMeta?.GetValueOrDefault("language")?.ToString();

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
