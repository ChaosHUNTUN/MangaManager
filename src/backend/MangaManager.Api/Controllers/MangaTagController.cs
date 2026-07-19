using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

/// <summary>
/// 漫画标签关联操作
/// </summary>
[ApiController]
[Route("api/manga/{mangaId}/tags")]
public class MangaTagController : ControllerBase
{
    private readonly MangaDbContext _db;

    public MangaTagController(MangaDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetTags(int mangaId)
    {
        var tags = await _db.MangaTags
            .Where(mt => mt.MangaId == mangaId)
            .Include(mt => mt.Tag)
            .Select(mt => new TagDto(mt.Tag.Id, mt.Tag.Name, mt.Tag.Color, mt.Tag.Category))
            .ToListAsync();
        return Ok(new ApiResponse<List<TagDto>>(true, tags));
    }

    [HttpPut]
    public async Task<IActionResult> SetTags(int mangaId, [FromBody] List<int> tagIds)
    {
        if (tagIds.Count > 100)
            return BadRequest(new ApiResponse<object>(false, null, "最多 100 个标签"));

        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null) return NotFound();

        var oldTags = await _db.MangaTags.Where(mt => mt.MangaId == mangaId).ToListAsync();
        _db.MangaTags.RemoveRange(oldTags);

        foreach (var tagId in tagIds.Distinct())
        {
            var tag = await _db.Tags.FindAsync(tagId);
            if (tag != null)
                _db.MangaTags.Add(new MangaTag { MangaId = mangaId, TagId = tagId });
        }
        await _db.SaveChangesAsync();

        var tags = await _db.MangaTags
            .Where(mt => mt.MangaId == mangaId)
            .Include(mt => mt.Tag)
            .Select(mt => new TagDto(mt.Tag.Id, mt.Tag.Name, mt.Tag.Color, mt.Tag.Category))
            .ToListAsync();

        return Ok(new ApiResponse<List<TagDto>>(true, tags));
    }
}