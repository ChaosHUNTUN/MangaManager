using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MangaController : ControllerBase
{
    private readonly MangaService _mangaService;

    public MangaController(MangaService mangaService) => _mangaService = mangaService;

    [HttpGet]
    public async Task<IActionResult> GetList(
        [FromQuery] string? search,
        [FromQuery] string? tags,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var tagIds = string.IsNullOrWhiteSpace(tags)
            ? null
            : tags.Split(',', StringSplitOptions.RemoveEmptyEntries)
                  .Select(int.Parse)
                  .ToList();

        var result = await _mangaService.GetListAsync(search, tagIds, page, pageSize);
        return Ok(new ApiResponse<object>(true, new
        {
            items = result.Items,
            total = result.Total,
            page = result.Page,
            pageSize = result.PageSize,
            totalPages = result.TotalPages
        }));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetDetail(int id)
    {
        var detail = await _mangaService.GetDetailAsync(id);
        if (detail == null)
            return NotFound(new ApiResponse<MangaDetail>(false, null, "漫画不存在"));
        return Ok(new ApiResponse<MangaDetail>(true, detail));
    }

    // 带 SSE 进度的扫描
    [HttpPost("scan")]
    public async Task<IActionResult> Scan([FromBody] ScanRequest request)
    {
        var clientId = request.ClientId ?? Guid.NewGuid().ToString("N")[..8];
        var result = await _mangaService.ScanDirectoryAsync(request.Directory, clientId);
        if (result.Error != null)
            return BadRequest(new ApiResponse<object>(false, null, result.Error));
        return Ok(new ApiResponse<object>(true, new { result.Total, result.Added, result.Updated }));
    }

    // SSE 进度流
    [HttpGet("scan/progress/{clientId}")]
    public async Task SSEProgress(string clientId)
    {
        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        Response.Headers.Append("Connection", "keep-alive");

        var writer = new StreamWriter(Response.Body);
        _mangaService.RegisterSSEClient(clientId, writer);

        try
        {
            // 保持连接直到客户端断开
            await Task.Delay(TimeSpan.FromMinutes(10));
        }
        catch { }
        finally
        {
            _mangaService.UnregisterSSEClient(clientId);
        }
    }

    [HttpPut("{id}/rename")]
    public async Task<IActionResult> Rename(int id, [FromBody] RenameRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewName))
            return BadRequest(new ApiResponse<object>(false, null, "名称不能为空"));

        var result = await _mangaService.RenameMangaAsync(id, request.NewName.Trim());
        if (!result.Success)
            return BadRequest(new ApiResponse<object>(false, null, result.Error));

        return Ok(new ApiResponse<object>(true, new
        {
            oldName = result.OldName,
            newName = result.NewName,
            oldPath = result.OldPath,
            newPath = result.NewPath
        }));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id, [FromQuery] bool deleteFolder = false)
    {
        var result = await _mangaService.DeleteMangaAsync(id, deleteFolder);
        if (!result.Success)
            return NotFound(new ApiResponse<object>(false, null, result.Error));

        return Ok(new ApiResponse<object>(true, new
        {
            title = result.Title,
            folderPath = result.FolderPath,
            folderDeleted = deleteFolder,
            warning = result.Error
        }));
    }
}

public record RenameRequest(string NewName);
