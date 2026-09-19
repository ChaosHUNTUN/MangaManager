using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReadingProgressController : ControllerBase
{
    private readonly MangaDbContext _db;
    public ReadingProgressController(MangaDbContext db) => _db = db;

    /// <summary>获取单个漫画的阅读进度</summary>
    [HttpGet("{gid}")]
    public async Task<IActionResult> Get(int gid)
    {
        var p = await _db.LocalReadingProgresses.FirstOrDefaultAsync(x => x.Gid == gid);
        return Ok(new ApiResponse<object>(true, new
        {
            gid,
            pageIndex = p?.PageIndex ?? 0,
            scrollOffset = p?.ScrollOffset,
            totalPages = p?.TotalPages,
            finished = p?.Finished ?? false,
        }));
    }

    /// <summary>批量标记已读 / 未读（用于"按标签批量标记已读"等多选场景）</summary>
    [HttpPost("mark")]
    public async Task<IActionResult> Mark([FromBody] MarkProgressRequest req, CancellationToken ct)
    {
        if (req?.Gids == null || req.Gids.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "没有指定作品"));

        var gids = req.Gids.Distinct().ToList();
        var existing = await _db.LocalReadingProgresses
            .Where(x => gids.Contains(x.Gid))
            .ToDictionaryAsync(x => x.Gid, ct);

        foreach (var gid in gids)
        {
            if (existing.TryGetValue(gid, out var entity))
            {
                entity.Finished = req.Finished;
                entity.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _db.LocalReadingProgresses.Add(new LocalReadingProgress
                {
                    Gid = gid,
                    PageIndex = 0,
                    ScrollOffset = null,
                    Finished = req.Finished,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new ApiResponse<object>(true, new { marked = gids.Count, finished = req.Finished }));
    }

    /// <summary>批量保存阅读进度（upsert）</summary>
    [HttpPost]
    public async Task<IActionResult> Save([FromBody] List<ReadingProgressItem> items)
    {
        if (items == null || items.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "没有数据"));

        try
        {
            await SaveCoreAsync(items);
        }
        catch (DbUpdateException)
        {
            // 并发写入同一 gid 时「先查后插」可能触发唯一索引冲突（如防抖保存与 sendBeacon 同时到达）
            // 清空跟踪状态后整体重试一次
            _db.ChangeTracker.Clear();
            await SaveCoreAsync(items);
        }

        return Ok(new ApiResponse<object>(true, new { saved = items.Count }));
    }

    private async Task SaveCoreAsync(List<ReadingProgressItem> items)
    {
        var gids = items.Select(i => i.Gid).Distinct().ToList();
        var existing = await _db.LocalReadingProgresses
            .Where(x => gids.Contains(x.Gid))
            .ToDictionaryAsync(x => x.Gid);

        foreach (var item in items)
        {
            if (existing.TryGetValue(item.Gid, out var entity))
            {
                entity.PageIndex = item.PageIndex;
                entity.ScrollOffset = item.ScrollOffset;
                if (item.TotalPages.HasValue) entity.TotalPages = item.TotalPages;
                // 读到最后一页自动标记已读；手动取消已读由 mark 接口负责，这里不反向清除
                if (item.Finished.HasValue) entity.Finished = item.Finished.Value;
                entity.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _db.LocalReadingProgresses.Add(new LocalReadingProgress
                {
                    Gid = item.Gid,
                    PageIndex = item.PageIndex,
                    ScrollOffset = item.ScrollOffset,
                    TotalPages = item.TotalPages,
                    Finished = item.Finished ?? false,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        await _db.SaveChangesAsync();
    }
}

public record ReadingProgressItem(int Gid, int PageIndex, double? ScrollOffset = null,
    int? TotalPages = null, bool? Finished = null);

public record MarkProgressRequest(List<int> Gids, bool Finished = true);
