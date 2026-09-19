namespace MangaManager.Core.Entities;

/// <summary>本地画廊阅读进度（按 gid 存储）</summary>
public class LocalReadingProgress
{
    public int Id { get; set; }
    public int Gid { get; set; }
    public int PageIndex { get; set; }
    /// <summary>滚动模式页内偏移（0~1，null=分页模式或未知）</summary>
    public double? ScrollOffset { get; set; }
    /// <summary>作品总页数（用于计算完成度；未知为 null）</summary>
    public int? TotalPages { get; set; }
    /// <summary>是否已读完（读到最后一页自动置位，也可手动标记/取消）</summary>
    public bool Finished { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>自定义专辑配置</summary>
public class AlbumConfig
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public string Gids { get; set; } = "[]";
    public string Order { get; set; } = "[]";
    public int Count { get; set; }
    public string? KeyTag { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>本地画廊作品的数据库缓存（主存储为 .meta.json）</summary>
public class LocalGallery
{
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public string DirPath { get; set; } = "";
    public string? Category { get; set; }
    public string? Language { get; set; }
    public double Rating { get; set; }
    public int FileCount { get; set; }
    public long FileSize { get; set; }
    public string? CoverFile { get; set; }
    public string? Artists { get; set; }         // JSON
    public string? Groups { get; set; }           // JSON
    public string? AllTags { get; set; }          // JSON
    public string? TitleJpn { get; set; }
    public string? Uploader { get; set; }
    public int RatingCount { get; set; }
    public long Posted { get; set; }
    public string? OnlineUrl { get; set; }
    public string? Token { get; set; }
    public DateTime? DownloadedAt { get; set; }
    public DateTime LastModified { get; set; }
    public DateTime SyncedAt { get; set; } = DateTime.UtcNow;
    public string? AlbumKey { get; set; }
}
