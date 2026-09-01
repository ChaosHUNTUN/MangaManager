using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

/// <summary>作品 × 标签 多对多管理（work_tag 统一表；本地画廊正 Gid，旧版 Manga 负 Id）</summary>
[ApiController]
[Route("api/work")]
public class WorkTagController : ControllerBase
{
    private readonly TagService _tags;

    public WorkTagController(TagService tags) => _tags = tags;

    /// <summary>获取作品的全部标签</summary>
    [HttpGet("{workId}/tags")]
    public async Task<IActionResult> GetTags(int workId, CancellationToken ct)
    {
        var list = await _tags.GetWorkTagsAsync(workId, ct);
        return Ok(new ApiResponse<object>(true, list.Select(ToDto)));
    }

    /// <summary>为作品批量添加标签（幂等）</summary>
    [HttpPost("{workId}/tags")]
    public async Task<IActionResult> AddTags(int workId, [FromBody] AddWorkTagsRequest req, CancellationToken ct)
    {
        if (req?.TagIds == null || req.TagIds.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "未提供标签 ID"));
        var added = await _tags.AddWorkTagsAsync(workId, req.TagIds, ct);
        return Ok(new ApiResponse<object>(true, new { added }));
    }

    /// <summary>移除作品的某个标签</summary>
    [HttpDelete("{workId}/tags/{tagId}")]
    public async Task<IActionResult> RemoveTag(int workId, int tagId, CancellationToken ct)
    {
        var ok = await _tags.RemoveWorkTagAsync(workId, tagId, ct);
        return ok
            ? Ok(new ApiResponse<object>(true, new { message = "已移除" }))
            : NotFound(new ApiResponse<object>(false, null, "关联不存在"));
    }

    /// <summary>批量给多部作品添加标签（幂等）</summary>
    [HttpPost("batch/tags")]
    public async Task<IActionResult> AddBatchTags([FromBody] BatchWorkTagsRequest? req, CancellationToken ct)
    {
        if (req?.WorkIds == null || req.WorkIds.Count == 0 || req.TagIds == null || req.TagIds.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "请提供作品与标签 ID"));
        var added = await _tags.AddWorkTagsBatchAsync(req.WorkIds, req.TagIds, ct);
        return Ok(new ApiResponse<object>(true, new { added }));
    }

    /// <summary>批量移除多部作品的指定标签（幂等）</summary>
    [HttpDelete("batch/tags")]
    public async Task<IActionResult> RemoveBatchTags([FromBody] BatchWorkTagsRequest? req, CancellationToken ct)
    {
        if (req?.WorkIds == null || req.WorkIds.Count == 0 || req.TagIds == null || req.TagIds.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "请提供作品与标签 ID"));
        var removed = await _tags.RemoveWorkTagsBatchAsync(req.WorkIds, req.TagIds, ct);
        return Ok(new ApiResponse<object>(true, new { removed }));
    }

    private static TagDto ToDto(Tag t) => new(t.Id, t.Name, t.Color, t.Category, t.Namespace, t.NameCn, t.IsBlocked);
}

public record AddWorkTagsRequest(List<int> TagIds);
public record BatchWorkTagsRequest(List<int> WorkIds, List<int> TagIds);
