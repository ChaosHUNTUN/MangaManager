using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.Entities;
using MangaManager.Core.DTOs;
using MangaManager.Data;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TagController : ControllerBase
{
    private readonly MangaDbContext _db;
    private readonly TagService _tags;

    public TagController(MangaDbContext db, TagService tags)
    {
        _db = db;
        _tags = tags;
    }

    /// <summary>获取所有标签（可按分类筛选）</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? category)
    {
        var query = _db.Tags.AsQueryable();
        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category == category);

        var tags = await query.OrderBy(t => t.Category).ThenBy(t => t.Name)
            .Select(t => new TagDto(t.Id, t.Name, t.Color, t.Category, t.Namespace, t.NameCn, t.IsBlocked))
            .ToListAsync();
        return Ok(new ApiResponse<List<TagDto>>(true, tags));
    }

    /// <summary>标签搜索（标签选择器用：原文/中文/命名空间模糊匹配，按使用次数降序）</summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? category, [FromQuery] int limit = 50, CancellationToken ct = default)
    {
        var list = await _tags.SearchTagsAsync(q, category, limit, ct);
        return Ok(new ApiResponse<object>(true, list.Select(ToDto)));
    }

    /// <summary>最常用标签（标签选择器"常用"区）</summary>
    [HttpGet("common")]
    public async Task<IActionResult> Common([FromQuery] int limit = 30, CancellationToken ct = default)
    {
        var list = await _tags.GetCommonTagsAsync(limit, ct);
        return Ok(new ApiResponse<object>(true, list.Select(ToDto)));
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

        var ns = TagService.NormalizeNs(req.Namespace);
        var exists = await _db.Tags.AnyAsync(t => t.Namespace == ns && t.Name == req.Name.Trim());
        if (exists)
            return BadRequest(new ApiResponse<object>(false, null, "标签已存在"));

        var tag = new Tag
        {
            Name = req.Name.Trim(),
            Namespace = ns,
            Color = req.Color ?? "#6366f1",
            Category = req.Category ?? TagService.CategoryOf(ns),
            NameCn = req.NameCn
        };
        _db.Tags.Add(tag);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<TagDto>(true, ToDto(tag)));
    }

    /// <summary>编辑标签（修改名称/颜色/分类，影响所有关联漫画）</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTagRequest req)
    {
        var tag = await _db.Tags.FindAsync(id);
        if (tag == null) return NotFound(new ApiResponse<object>(false, null, "标签不存在"));

        if (!string.IsNullOrWhiteSpace(req.Name) && req.Name.Trim() != tag.Name)
        {
            var exists = await _db.Tags.AnyAsync(t => t.Name == req.Name.Trim() && t.Namespace == tag.Namespace && t.Id != id);
            if (exists)
                return BadRequest(new ApiResponse<object>(false, null, "标签名已存在"));
            tag.Name = req.Name.Trim();
        }
        if (!string.IsNullOrWhiteSpace(req.Namespace)) tag.Namespace = TagService.NormalizeNs(req.Namespace);
        if (req.Color != null) tag.Color = req.Color;
        if (req.Category != null) tag.Category = req.Category;
        if (req.NameCn != null) tag.NameCn = req.NameCn;
        if (req.IsBlocked.HasValue) tag.IsBlocked = req.IsBlocked.Value;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<TagDto>(true, ToDto(tag)));
    }

    /// <summary>删除标签</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id, [FromQuery] bool force = false)
    {
        var tag = await _db.Tags.FindAsync(id);
        if (tag == null) return NotFound();
        // SQLite 未启用 FK 级联：先显式清理关联，避免残留孤儿行
        var workLinks = await _db.WorkTags.Where(w => w.TagId == id).ToListAsync();
        // 标签大多来自 EH 元数据同步，删掉有作品的标签会丢失分类且后续同步可能再建回来，
        // 因此默认拒绝；确实要删（如清理合成标签）需显式 force=true
        if (workLinks.Count > 0 && !force)
        {
            return BadRequest(new ApiResponse<object>(false, new { workCount = workLinks.Count },
                $"该标签仍关联 {workLinks.Count} 部作品。若只是去重请使用「合并」；确实要删除请加 force=true。"));
        }
        var mangaLinks = await _db.MangaTags.Where(mt => mt.TagId == id).ToListAsync();
        _db.WorkTags.RemoveRange(workLinks);
        _db.MangaTags.RemoveRange(mangaLinks);
        var orderRows = await _db.TagOrders.Where(o => o.TagId == id).ToListAsync();
        if (orderRows.Count > 0) _db.TagOrders.RemoveRange(orderRows);
        _db.Tags.Remove(tag);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { removedWorkLinks = workLinks.Count, removedMangaLinks = mangaLinks.Count }));
    }

    /// <summary>清理空标签（无任何作品关联）——删除标签唯一真正安全的场景</summary>
    [HttpPost("cleanup-empty")]
    public async Task<IActionResult> CleanupEmpty()
    {
        var emptyIds = await _db.Tags
            .Where(t => !_db.WorkTags.Any(w => w.TagId == t.Id) && !_db.MangaTags.Any(m => m.TagId == t.Id))
            .Select(t => t.Id)
            .ToListAsync();
        if (emptyIds.Count == 0)
            return Ok(new ApiResponse<object>(true, new { removed = 0 }, "没有需要清理的空标签"));

        var orderRows = await _db.TagOrders.Where(o => emptyIds.Contains(o.TagId)).ToListAsync();
        if (orderRows.Count > 0) _db.TagOrders.RemoveRange(orderRows);
        var emptyTags = await _db.Tags.Where(t => emptyIds.Contains(t.Id)).ToListAsync();
        _db.Tags.RemoveRange(emptyTags);
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { removed = emptyIds.Count },
            $"已清理 {emptyIds.Count} 个空标签"));
    }

    /// <summary>合并标签：把 fromId 的全部关联搬移到 intoId 并删除 fromId（改名/去重场景）</summary>
    [HttpPost("merge")]
    public async Task<IActionResult> Merge([FromBody] MergeTagsRequest req, CancellationToken ct)
    {
        if (req == null || req.FromId <= 0 || req.IntoId <= 0)
            return BadRequest(new ApiResponse<object>(false, null, "参数不合法"));
        var (movedWork, movedManga, error) = await _tags.MergeTagsAsync(req.FromId, req.IntoId, ct);
        if (error != null)
            return BadRequest(new ApiResponse<object>(false, null, error));
        return Ok(new ApiResponse<object>(true, new { movedWork, movedManga }));
    }

    /// <summary>获取标签内手动顺序（gid 数组；无记录返回 null）</summary>
    [HttpGet("{id}/order")]
    public async Task<IActionResult> GetOrder(int id)
    {
        var o = await _db.TagOrders.FindAsync(id);
        List<int>? gids = null;
        if (o != null)
        {
            try { gids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(o.Gids); } catch { }
        }
        return Ok(new ApiResponse<object>(true, new { tagId = id, gids }));
    }

    /// <summary>保存标签内手动顺序（连载顺序等）</summary>
    [HttpPut("{id}/order")]
    public async Task<IActionResult> SaveOrder(int id, [FromBody] SaveTagOrderRequest? req)
    {
        var tag = await _db.Tags.FindAsync(id);
        if (tag == null) return NotFound(new ApiResponse<object>(false, null, "标签不存在"));
        var o = await _db.TagOrders.FindAsync(id);
        var gids = req?.Gids ?? new List<int>();
        // 清空顺序 = 删除记录，避免空数组行让 hasOrder 仍为 true
        if (gids.Count == 0)
        {
            if (o != null) _db.TagOrders.Remove(o);
            await _db.SaveChangesAsync();
            return Ok(new ApiResponse<object>(true, new { tagId = id, saved = 0 }));
        }
        if (o == null)
        {
            o = new TagOrder { TagId = id };
            _db.TagOrders.Add(o);
        }
        o.Gids = System.Text.Json.JsonSerializer.Serialize(gids);
        o.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { tagId = id, saved = gids.Count }));
    }

    private static TagDto ToDto(Tag t) => new(t.Id, t.Name, t.Color, t.Category, t.Namespace, t.NameCn, t.IsBlocked);
}

public record CreateTagRequest(string Name, string? Color, string? Category, string? Namespace = null, string? NameCn = null);
public record UpdateTagRequest(string? Name, string? Color, string? Category, string? Namespace = null, string? NameCn = null, bool? IsBlocked = null);
public record MergeTagsRequest(int FromId, int IntoId);
public record SaveTagOrderRequest(List<int>? Gids);
