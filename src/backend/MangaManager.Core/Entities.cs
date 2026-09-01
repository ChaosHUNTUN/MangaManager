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
    /// <summary>EH 命名空间（artist/group/female/male/style/source/language/other…；自定义为 other）</summary>
    public string Namespace { get; set; } = "other";
    /// <summary>中文翻译（来自 EH 翻译字典）</summary>
    public string? NameCn { get; set; }
    /// <summary>是否屏蔽（并入标签表的屏蔽标记，不做额外管控）</summary>
    public bool IsBlocked { get; set; }
    public string Color { get; set; } = "#6366f1";
    public string Category { get; set; } = "other";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<MangaTag> MangaTags { get; set; } = new();
}

/// <summary>作品 × 标签 多对多（统一表：本地画廊用正 Gid，旧版 Manga 用负 Id）</summary>
public class WorkTag
{
    public int WorkId { get; set; }
    public int TagId { get; set; }
    public Tag? Tag { get; set; }
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
    /// <summary>当前阅读器引擎设置的 JSON 快照（双轨统一后前端读写此字段；旧列保留兼容）</summary>
    public string? Data { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
