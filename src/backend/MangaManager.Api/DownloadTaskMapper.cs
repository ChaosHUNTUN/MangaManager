using MangaManager.Core.Entities;
using MangaManager.Shared.Download;

namespace MangaManager.Api;

/// <summary>下载任务实体 → 共享 DTO 映射（Token 不进入 DTO，避免泄露）</summary>
public static class DownloadTaskMapper
{
    public static DownloadTaskDto ToDto(DownloadTask t) => new()
    {
        Id = t.Id,
        Gid = t.Gid,
        Title = t.Title,
        CoverUrl = t.CoverUrl,
        TotalPages = t.TotalPages,
        DownloadedPages = t.DownloadedPages,
        FailedPages = t.FailedPages,
        DownloadedBytes = t.DownloadedBytes,
        Status = t.Status,
        ErrorMsg = t.ErrorMsg,
        CreatedAt = t.CreatedAt,
        StartedAt = t.StartedAt,
        CompletedAt = t.CompletedAt,
        UpdatedAt = t.UpdatedAt,
        SpeedBps = t.SpeedBps,
        SpeedText = t.SpeedText,
        ProgressPercent = t.ProgressPercent
    };

    public static List<DownloadTaskDto> ToDtos(IEnumerable<DownloadTask> tasks) => tasks.Select(ToDto).ToList();
}
