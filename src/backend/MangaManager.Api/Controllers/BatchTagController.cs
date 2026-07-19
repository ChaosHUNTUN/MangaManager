using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

/// <summary>
/// 批量标签操作：一次性给多个漫画添加标签
/// </summary>
[ApiController]
[Route("api/manga/batch/tags")]
public class BatchTagController : ControllerBase
{
    private readonly MangaDbContext _db;

    public BatchTagController(MangaDbContext db) => _db = db;

    [HttpPost]
    public async Task<IActionResult> BatchAddTags([FromBody] BatchTagRequest req)
    {
        foreach (var mangaId in req.MangaIds)
        {
            foreach (var tagId in req.TagIds)
            {
                var exists = await _db.MangaTags.AnyAsync(mt => mt.MangaId == mangaId && mt.TagId == tagId);
                if (!exists)
                {
                    var tag = await _db.Tags.FindAsync(tagId);
                    if (tag != null)
                        _db.MangaTags.Add(new MangaTag { MangaId = mangaId, TagId = tagId });
                }
            }
        }
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { count = req.MangaIds.Count * req.TagIds.Count }));
    }
}

public record BatchTagRequest(List<int> MangaIds, List<int> TagIds);