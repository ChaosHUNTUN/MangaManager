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
        var mangaIdSet = new HashSet<int>(req.MangaIds);
        var tagIdSet = new HashSet<int>(req.TagIds);

        // 一次查询获取所有已存在的关联
        var existingPairs = await _db.MangaTags
            .Where(mt => mangaIdSet.Contains(mt.MangaId) && tagIdSet.Contains(mt.TagId))
            .Select(mt => new { mt.MangaId, mt.TagId })
            .ToListAsync();

        var existingSet = existingPairs.Select(p => (p.MangaId, p.TagId)).ToHashSet();
        var validTags = await _db.Tags.Where(t => tagIdSet.Contains(t.Id)).Select(t => t.Id).ToHashSetAsync();

        var added = 0;
        foreach (var mangaId in req.MangaIds)
        {
            foreach (var tagId in req.TagIds)
            {
                if (!existingSet.Contains((mangaId, tagId)) && validTags.Contains(tagId))
                {
                    _db.MangaTags.Add(new MangaTag { MangaId = mangaId, TagId = tagId });
                    added++;
                }
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { count = added }));
    }
}

public record BatchTagRequest(List<int> MangaIds, List<int> TagIds);