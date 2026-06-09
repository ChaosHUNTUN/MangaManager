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
        return Ok(new ApiResponse<object>(true, new { gid, pageIndex = p?.PageIndex ?? 0 }));
    }

    /// <summary>批量保存阅读进度（upsert）</summary>
    [HttpPost]
    public async Task<IActionResult> Save([FromBody] List<ReadingProgressItem> items)
    {
        if (items == null || items.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "没有数据"));

        var gids = items.Select(i => i.Gid).Distinct().ToList();
        var existing = await _db.LocalReadingProgresses
            .Where(x => gids.Contains(x.Gid))
            .ToDictionaryAsync(x => x.Gid);

        foreach (var item in items)
        {
            if (existing.TryGetValue(item.Gid, out var entity))
            {
                entity.PageIndex = item.PageIndex;
                entity.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _db.LocalReadingProgresses.Add(new LocalReadingProgress
                {
                    Gid = item.Gid,
                    PageIndex = item.PageIndex,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { saved = items.Count }));
    }
}

public record ReadingProgressItem(int Gid, int PageIndex);
