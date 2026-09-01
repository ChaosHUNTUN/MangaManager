namespace MangaManager.Shared.Download;

/// <summary>下载任务 DTO（后端与桌面端共享；字段名与现有 JSON 契约对齐，camelCase 序列化）</summary>
public class DownloadTaskDto
{
    public int Id { get; set; }
    public int Gid { get; set; }
    public string Title { get; set; } = "";
    public string? CoverUrl { get; set; }
    public int TotalPages { get; set; }
    public int DownloadedPages { get; set; }
    public int FailedPages { get; set; }
    public long DownloadedBytes { get; set; }
    public string Status { get; set; } = "pending";
    public string? ErrorMsg { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>实时速率 (bytes/s)</summary>
    public double SpeedBps { get; set; }
    /// <summary>格式化速率文本（"23 KB/s"），与现有前端契约保持一致</summary>
    public string SpeedText { get; set; } = "0 B/s";
    public double ProgressPercent { get; set; }
}
