using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Data;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OpenController : ControllerBase
{
    private readonly MangaDbContext _db;
    private readonly NeeViewService _neeView;

    public OpenController(MangaDbContext db, NeeViewService neeView)
    {
        _db = db;
        _neeView = neeView;
    }

    // 启动 NeeView 打开漫画
    [HttpPost("{mangaId}")]
    public async Task<IActionResult> Open(int mangaId, [FromBody] OpenRequest? request = null)
    {
        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null)
            return NotFound(new ApiResponse<object>(false, null, "漫画不存在"));

        var fullscreen = request?.Fullscreen ?? true;
        var success = _neeView.OpenFolder(mangaId, manga.FolderPath, fullscreen);

        if (!success)
            return BadRequest(new ApiResponse<object>(false, null, "启动 NeeView 失败"));

        return Ok(new ApiResponse<object>(true, new
        {
            manga.Id,
            manga.Title,
            status = "launched",
            message = "📖 NeeView 已启动，正在打开漫画..."
        }));
    }

    // 轮询检测 NeeView 状态
    [HttpGet("status/{mangaId}")]
    public async Task<IActionResult> GetStatus(int mangaId)
    {
        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null)
            return NotFound(new ApiResponse<object>(false, null, "漫画不存在"));

        var status = _neeView.GetStatus(mangaId, manga.FolderPath);

        return Ok(new ApiResponse<object>(true, new
        {
            mangaId,
            isRunning = status.IsRunning,
            isReadingManga = status.IsReadingManga,
            message = status.Message
        }));
    }

    // 检查 NeeView 是否可用
    [HttpGet("neeview/status")]
    public IActionResult NeeViewStatus()
    {
        var available = _neeView.IsAvailable();
        return Ok(new ApiResponse<object>(true, new
        {
            available,
            version = available ? _neeView.GetVersion() : null
        }));
    }
}
