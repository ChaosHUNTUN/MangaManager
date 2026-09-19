using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Data;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

/// <summary>
/// 运行状态汇总（诊断用）：库规模、数据一致性指标、下载队列、存储目录可用性。
/// 与 /health 区分：/health 保持轻量供探活轮询，本接口做真实统计、不宜高频调用。
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class StatusController : ControllerBase
{
    private readonly MangaDbContext _db;
    private readonly DownloadManager _dm;

    public StatusController(MangaDbContext db, DownloadManager dm)
    {
        _db = db;
        _dm = dm;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var galleries = await _db.LocalGalleries.CountAsync(ct);
        var tags = await _db.Tags.CountAsync(ct);
        var workTags = await _db.WorkTags.CountAsync(ct);
        // 一致性指标：指向已不存在作品的标签关联（正常应为 0）
        var orphanWorkTags = await _db.WorkTags
            .CountAsync(w => w.WorkId > 0 && !_db.LocalGalleries.Any(g => g.Gid == w.WorkId), ct);
        var danglingTagRefs = await _db.WorkTags
            .CountAsync(w => !_db.Tags.Any(t => t.Id == w.TagId), ct);

        var tasks = _dm.GetAllTasks();
        var byStatus = tasks.GroupBy(t => t.Status)
            .ToDictionary(g => g.Key, g => g.Count());
        var dir = EhentaiFileHelper.DefaultDownloadDir;

        return Ok(new ApiResponse<object>(true, new
        {
            library = new { galleries, tags, workTags, orphanWorkTags, danglingTagRefs },
            downloads = new
            {
                total = tasks.Count,
                active = _dm.GetActiveTasks().Count,
                byStatus,
            },
            storage = new { downloadDir = dir, exists = Directory.Exists(dir) },
            serverTimeUtc = DateTime.UtcNow,
        }));
    }
}
