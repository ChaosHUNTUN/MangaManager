namespace MangaManager.Core.Entities;

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
}

/// <summary>作品 × 标签 多对多（WorkId = 本地画廊 gid）</summary>
public class WorkTag
{
    public int WorkId { get; set; }
    public int TagId { get; set; }
    public Tag? Tag { get; set; }
}

/// <summary>标签内手动顺序（连载顺序等）：TagId 1:1，Gids 为手动排序的 gid 数组</summary>
public class TagOrder
{
    public int TagId { get; set; }            // PK（与 tag 一一对应）
    public string Gids { get; set; } = "[]";  // JSON int 数组：自定义顺序
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
