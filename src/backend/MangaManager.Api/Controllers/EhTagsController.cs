using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Services;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

/// <summary>
/// E-Hentai 标签翻译与屏蔽管理
/// </summary>
[ApiController]
[Route("api/ehentai")]
public class EhTagsController : ControllerBase
{
    private readonly EhentaiService _svc;
    private readonly EhentaiBlockedTagService _blockedTag;
    private readonly MangaDbContext _db;

    public EhTagsController(EhentaiService svc, EhentaiBlockedTagService blockedTag, MangaDbContext db)
    {
        _svc = svc;
        _blockedTag = blockedTag;
        _db = db;
    }

    // ==================== 标签翻译 ====================

    /// <summary>批量翻译标签</summary>
    [HttpPost("tags/translate")]
    public IActionResult TranslateTags([FromBody] TranslateRequest req)
    {
        var result = new List<object>();
        if (req.Tags != null)
        {
            foreach (var tag in req.Tags)
            {
                var cn = EhentaiTagService.TranslateTag(tag);
                result.Add(new { key = tag, cn });
            }
        }
        return Ok(new ApiResponse<object>(true, result));
    }

    /// <summary>翻译单个 namespace</summary>
    [HttpGet("tags/translate-ns")]
    public IActionResult TranslateNamespace([FromQuery] string ns)
    {
        var cn = EhentaiTagService.TranslateNamespace(ns);
        return Ok(new ApiResponse<object>(true, new { ns, cn }));
    }

    /// <summary>搜索标签建议（对标 EhViewer），支持中英文模糊搜索</summary>
    [HttpGet("tags/suggest")]
    public IActionResult SuggestTags([FromQuery] string q, [FromQuery] int limit = 30)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 1)
            return Ok(new ApiResponse<object>(true, Array.Empty<object>()));
        var max = Math.Clamp(limit, 1, 100);
        var results = EhentaiTagService.SuggestTags(q, max);

        // 兜底：翻译库不可用时，用本地标签库（全量 EH 标签记录）补全，保证在线搜索也能自动补全
        if (results.Count == 0)
        {
            var kw = q.Trim();
            var rows = _db.Tags.AsNoTracking()
                .Where(t => t.Name.Contains(kw) || (t.NameCn != null && t.NameCn.Contains(kw)))
                .OrderByDescending(t => t.Name.Contains(kw))
                .ThenBy(t => t.Name)
                .Take(max)
                .ToList();
            results = rows.Select(t => new TagSuggestion
            {
                Key = string.IsNullOrEmpty(t.Namespace) ? t.Name : $"{t.Namespace}:{t.Name}",
                Cn = t.NameCn ?? "",
                Namespace = t.Namespace ?? "",
                Tag = t.Name,
                EhSyntax = string.IsNullOrEmpty(t.Namespace) ? t.Name : $"{t.Namespace}:{t.Name.Replace(" ", "_")}",
                MatchType = (t.NameCn != null && t.NameCn.Contains(kw)) ? "cn" : "en"
            }).ToList();
        }
        return Ok(new ApiResponse<object>(true, results));
    }

    // ==================== 标签屏蔽 ====================

    /// <summary>获取屏蔽标签列表</summary>
    [HttpGet("blocked-tags")]
    public IActionResult GetBlockedTags()
    {
        var tags = _blockedTag.GetBlockedTags();
        return Ok(new ApiResponse<object>(true, tags));
    }

    /// <summary>添加屏蔽标签（同步到 E-Hentai My Tags）</summary>
    [HttpPost("blocked-tags")]
    public async Task<IActionResult> AddBlockedTag([FromBody] BlockedTagRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Tag))
            return BadRequest(new ApiResponse<object>(false, null, "标签不能为空"));
        await _blockedTag.AddBlockedTagAsync(req.Tag);
        return Ok(new ApiResponse<object>(true, new { message = "已添加，已同步到 E-Hentai" }));
    }

    /// <summary>删除屏蔽标签（同步到 E-Hentai My Tags）</summary>
    [HttpDelete("blocked-tags")]
    public async Task<IActionResult> RemoveBlockedTag([FromBody] BlockedTagRequest req)
    {
        await _blockedTag.RemoveBlockedTagAsync(req.Tag ?? "");
        return Ok(new ApiResponse<object>(true, new { message = "已移除，已同步到 E-Hentai" }));
    }

    /// <summary>获取 E-Hentai My Tags 完整列表（用于校验）</summary>
    [HttpGet("blocked-tags/verify")]
    public async Task<IActionResult> VerifyBlockedTags()
    {
        try
        {
            var tags = await _blockedTag.FetchMyTagsAsync();
            var local = _blockedTag.GetBlockedTags();
            return Ok(new ApiResponse<object>(true, new { ehentai = tags, local, ehentaiCount = tags.Count, localCount = local.Count }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>从 E-Hentai 同步隐藏标签到本地</summary>
    [HttpPost("blocked-tags/sync")]
    public async Task<IActionResult> SyncBlockedTags()
    {
        try
        {
            var synced = await _blockedTag.SyncBlockedTagsFromEHAsync();
            return Ok(new ApiResponse<object>(true, new { synced, count = synced.Count, message = $"已从 E-Hentai 同步 {synced.Count} 个隐藏标签" }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }
}

// Request record types are defined in EhentaiController.cs
