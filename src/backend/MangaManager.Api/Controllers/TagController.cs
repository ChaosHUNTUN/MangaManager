using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.Entities;
using MangaManager.Core.DTOs;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TagController : ControllerBase
{
    private readonly MangaDbContext _db;

    public TagController(MangaDbContext db) => _db = db;

    /// <summary>获取所有标签（可按分类筛选）</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? category)
    {
        var query = _db.Tags.AsQueryable();
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);

        var tags = await query.OrderBy(t => t.Category).ThenBy(t => t.Name)
            .Select(t => new TagDto(t.Id, t.Name, t.Color, t.Category))
            .ToListAsync();
        return Ok(new ApiResponse<List<TagDto>>(true, tags));
    }

    /// <summary>获取标签分类定义</summary>
    [HttpGet("categories")]
    public IActionResult GetCategories()
    {
        var categories = new List<object>
        {
            new { key = "author",     label = "作者/创作者",   icon = "✏️", color = "#8b5cf6" },
            new { key = "translator", label = "翻译团队",     icon = "🌐", color = "#06b6d4" },
            new { key = "style",      label = "创作风格",     icon = "🎨", color = "#10b981" },
            new { key = "female",     label = "女性角色",     icon = "👩", color = "#ec4899" },
            new { key = "male",       label = "男性角色",     icon = "👨", color = "#3b82f6" },
            new { key = "source",     label = "来源作品",     icon = "📖", color = "#f59e0b" },
            new { key = "language",   label = "语言",         icon = "🗣️", color = "#14b8a6" },
            new { key = "other",      label = "其他标签",     icon = "🏷️", color = "#6366f1" }
        };
        return Ok(new ApiResponse<object>(true, categories));
    }

    /// <summary>创建标签（带分类）</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTagRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new ApiResponse<object>(false, null, "标签名不能为空"));

        var exists = await _db.Tags.AnyAsync(t => t.Name == req.Name);
        if (exists)
            return BadRequest(new ApiResponse<object>(false, null, "标签已存在"));

        var tag = new Tag
        {
            Name = req.Name,
            Color = req.Color ?? "#6366f1",
            Category = req.Category ?? "other"
        };
        _db.Tags.Add(tag);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<TagDto>(true, new TagDto(tag.Id, tag.Name, tag.Color, tag.Category)));
    }

    /// <summary>编辑标签（修改名称/颜色/分类，影响所有关联漫画）</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTagRequest req)
    {
        var tag = await _db.Tags.FindAsync(id);
        if (tag == null) return NotFound(new ApiResponse<object>(false, null, "标签不存在"));

        if (!string.IsNullOrWhiteSpace(req.Name) && req.Name != tag.Name)
        {
            var exists = await _db.Tags.AnyAsync(t => t.Name == req.Name && t.Id != id);
            if (exists)
                return BadRequest(new ApiResponse<object>(false, null, "标签名已存在"));
            tag.Name = req.Name;
        }
        if (req.Color != null) tag.Color = req.Color;
        if (req.Category != null) tag.Category = req.Category;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<TagDto>(true, new TagDto(tag.Id, tag.Name, tag.Color, tag.Category)));
    }

    /// <summary>删除标签</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var tag = await _db.Tags.FindAsync(id);
        if (tag == null) return NotFound();
        _db.Tags.Remove(tag);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, null));
    }
}

public record CreateTagRequest(string Name, string? Color, string? Category);
public record UpdateTagRequest(string? Name, string? Color, string? Category);