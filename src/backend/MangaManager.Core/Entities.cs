namespace MangaManager.Core.Entities;

public class Manga
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string FolderName { get; set; } = string.Empty;
    public string FolderPath { get; set; } = string.Empty;
    public string? CoverPath { get; set; }
    public int FileCount { get; set; }
    public long TotalSize { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = "unknown";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<MangaAuthor> MangaAuthors { get; set; } = new();
    public List<MangaTag> MangaTags { get; set; } = new();
    public ReadingProgress? ReadingProgress { get; set; }
}

public class Author
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<MangaAuthor> MangaAuthors { get; set; } = new();
}

public class MangaAuthor
{
    public int Id { get; set; }
    public int MangaId { get; set; }
    public int AuthorId { get; set; }
    public Manga Manga { get; set; } = null!;
    public Author Author { get; set; } = null!;
}

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#6366f1";
    public string Category { get; set; } = "other";  // author|translator|style|female|male|source|language|other
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<MangaTag> MangaTags { get; set; } = new();
}

public class MangaTag
{
    public int Id { get; set; }
    public int MangaId { get; set; }
    public int TagId { get; set; }
    public Manga Manga { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}

public class ReadingProgress
{
    public int Id { get; set; }
    public int MangaId { get; set; }
    public int PageIndex { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Manga Manga { get; set; } = null!;
}

/// <summary>本地画廊阅读进度（按 gid 存储，不关联 Manga 实体）</summary>
public class LocalReadingProgress
{
    public int Id { get; set; }
    public int Gid { get; set; }
    public int PageIndex { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class ScanLog
{
    public int Id { get; set; }
    public string Directory { get; set; } = string.Empty;
    public string Status { get; set; } = "running";
    public int TotalFound { get; set; }
    public int NewAdded { get; set; }
    public string? ErrorMsg { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
}

/// <summary>下载任务实体（数据库持久化 + 实时进度追踪）</summary>
public class DownloadTask
{
    public int Id { get; set; }
    public int Gid { get; set; }
    public string Token { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? CoverUrl { get; set; }
    public int TotalPages { get; set; }
    public int DownloadedPages { get; set; }
    public int FailedPages { get; set; }
    public long DownloadedBytes { get; set; }
    public string Status { get; set; } = "pending";  // pending|downloading|paused|completed|failed
    public string? ErrorMsg { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // 非持久化：实时速率计算
    [System.Text.Json.Serialization.JsonIgnore]
    public long LastBytes { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public DateTime LastSpeedTime { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public double SpeedBps { get; set; }

    /// <summary>计算下载速率 (bytes/s)</summary>
    public double CalculateSpeed()
    {
        var elapsed = (DateTime.UtcNow - LastSpeedTime).TotalSeconds;
        if (elapsed > 0.5)
        {
            SpeedBps = (DownloadedBytes - LastBytes) / Math.Max(elapsed, 0.1);
            LastBytes = DownloadedBytes;
            LastSpeedTime = DateTime.UtcNow;
        }
        return SpeedBps;
    }

    /// <summary>获取格式化的速率字符串</summary>
    public string SpeedText => SpeedBps > 1e6 ? $"{SpeedBps / 1e6:F1} MB/s"
        : SpeedBps > 1e3 ? $"{SpeedBps / 1e3:F0} KB/s"
        : $"{SpeedBps:F0} B/s";

    /// <summary>进度百分比</summary>
    public double ProgressPercent => TotalPages > 0 ? (double)DownloadedPages / TotalPages * 100 : 0;
}

/// <summary>阅读器设置（单例行，Id=1）</summary>
public class ReaderSettings
{
    public int Id { get; set; } = 1;
    public string FitMode { get; set; } = "fit-width";
    public int FitPercent { get; set; } = 100;
    public string Direction { get; set; } = "rtl";
    public string Transition { get; set; } = "fade";
    public string ReadMode { get; set; } = "paged";
    public int SlideInterval { get; set; } = 3;
    public int ScrollSpeed { get; set; } = 200;
    public bool LoopMode { get; set; } = false;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>自定义专辑配置</summary>
public class AlbumConfig
{
    public int Id { get; set; }
    public string Key { get; set; } = "";       // 匹配键（不可变）
    public string Name { get; set; } = "";       // 显示名称（可修改）
    public string Color { get; set; } = "";      // 专辑颜色 (#RRGGBB)
    public string Gids { get; set; } = "[]";     // JSON 数组: [1,2,3]
    public string Order { get; set; } = "[]";    // JSON 数组: 自定义排序 [2,1,3]
    public int Count { get; set; }               // DB 冗余列，实际由 Gids 长度推导
    public string? KeyTag { get; set; }           // EH 标准标签，如 "artist:haiboku"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>本地画廊作品的数据库缓存（主存储为 .meta.json，此表为元数据索引加速查询）</summary>
public class LocalGallery
{
    public int Gid { get; set; }                // EHentai Gallery ID（主键）
    public string Title { get; set; } = "";
    public string DirPath { get; set; } = "";   // 本地目录路径
    public string? Category { get; set; }
    public string? Language { get; set; }
    public double Rating { get; set; }
    public int FileCount { get; set; }
    public long FileSize { get; set; }
    public string? CoverFile { get; set; }      // 封面图片路径
    public string? Artists { get; set; }         // JSON: ["wada","hoge"]
    public string? Groups { get; set; }          // JSON: ["circle"]
    public string? AllTags { get; set; }         // JSON: ["artist:wada","group:circle","other:ai_generated"]
    public string? TitleJpn { get; set; }        // 原始日文标题
    public string? Uploader { get; set; }        // 上传者
    public int RatingCount { get; set; }         // 评分数
    public long Posted { get; set; }             // E-Hentai发布时间戳（Unix seconds）
    public string? OnlineUrl { get; set; }       // EH 页面链接
    public string? Token { get; set; }           // EH token
    public DateTime? DownloadedAt { get; set; }
    public DateTime LastModified { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
    public string? AlbumKey { get; set; }          // 所属专辑 Key，如 "artist:haiboku"，未分配为 null
}
