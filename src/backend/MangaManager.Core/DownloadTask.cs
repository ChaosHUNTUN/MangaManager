namespace MangaManager.Core.Entities;

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

    public string SpeedText => SpeedBps > 1e6 ? $"{SpeedBps / 1e6:F1} MB/s"
        : SpeedBps > 1e3 ? $"{SpeedBps / 1e3:F0} KB/s"
        : $"{SpeedBps:F0} B/s";

    public double ProgressPercent => TotalPages > 0 ? (double)DownloadedPages / TotalPages * 100 : 0;
}
