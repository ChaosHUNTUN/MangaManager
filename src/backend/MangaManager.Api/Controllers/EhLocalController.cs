using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

/// <summary>
/// E-Hentai 本地文件服务：检查下载状态、提供本地已下载图片、遗留下载接口
/// </summary>
[ApiController]
[Route("api/ehentai")]
public class EhLocalController : ControllerBase
{
    private readonly EhentaiService _svc;

    public EhLocalController(EhentaiService svc) => _svc = svc;

    // ==================== 本地文件检查 ====================

    /// <summary>检查画廊是否已下载到本地</summary>
    [HttpGet("gallery/{gid}/local")]
    public IActionResult CheckLocal(int gid, [FromQuery] string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
            return Ok(new ApiResponse<object>(true, new { downloaded = false }));
        var downloaded = EhentaiService.IsGalleryDownloaded(gid, title);
        var pages = downloaded ? EhentaiService.GetLocalGalleryPages(gid, title) : new();
        return Ok(new ApiResponse<object>(true, new
        {
            downloaded,
            pageCount = pages.Count,
            pages = pages.Select(p => $"/api/ehentai/local-image/{gid}/{Path.GetFileName(p)}").ToList()
        }));
    }

    /// <summary>提供本地画廊图片</summary>
    [HttpGet("local-image/{gid}/{filename}")]
    public IActionResult ServeLocalImage(int gid, string filename)
    {
        if (Directory.Exists(EhentaiFileHelper.DefaultDownloadDir))
        {
            var dirs = Directory.GetDirectories(EhentaiFileHelper.DefaultDownloadDir, $"{gid}-*");
            foreach (var dir in dirs)
            {
                var filePath = Path.Combine(dir, filename);
                if (System.IO.File.Exists(filePath))
                {
                    var ext = Path.GetExtension(filename).ToLower();
                    var ct = ext switch
                    {
                        ".png" => "image/png",
                        ".webp" => "image/webp",
                        ".gif" => "image/gif",
                        _ => "image/jpeg"
                    };
                    Response.Headers["Cache-Control"] = "public, max-age=86400";
                    return PhysicalFile(filePath, ct);
                }
            }
        }
        return NotFound();
    }

    // ==================== 遗留下载兼容 ====================

    /// <summary>查询下载进度（兼容旧 API，新代码请用 /api/download/tasks/{gid}）</summary>
    [HttpGet("download/progress/{gid}")]
    public IActionResult GetDownloadProgress(int gid, [FromQuery] string? title)
    {
        var dm = HttpContext.RequestServices.GetRequiredService<DownloadManager>();
        var task = dm.GetTask(gid);
        if (task != null)
        {
            return Ok(new ApiResponse<object>(true, new
            {
                progress = task.DownloadedPages,
                totalPages = task.TotalPages,
                status = task.Status,
                speed = task.SpeedText
            }));
        }

        if (string.IsNullOrWhiteSpace(title))
            return Ok(new ApiResponse<object>(true, new { progress = -1 }));
        var dir = EhentaiService.GetGalleryLocalDir(gid, title);
        var progressFile = Path.Combine(dir, ".progress");
        if (System.IO.File.Exists(progressFile))
        {
            var text = System.IO.File.ReadAllText(progressFile);
            var parts = text.Split('|');
            if (parts.Length > 0 && int.TryParse(parts[0], out var p))
                return Ok(new ApiResponse<object>(true, new { progress = p }));
        }
        if (Directory.Exists(dir) && Directory.GetFiles(dir).Any(f =>
            f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ||
            f.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
            f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)))
        {
            return Ok(new ApiResponse<object>(true, new { progress = -2 }));
        }
        return Ok(new ApiResponse<object>(true, new { progress = 0 }));
    }

    /// <summary>下载画廊到本地（通过 DownloadManager，兼容旧 API）</summary>
    [HttpPost("download/{gid}/{token}")]
    public IActionResult Download(int gid, string token, [FromQuery] string? title)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));
        var dm = HttpContext.RequestServices.GetRequiredService<DownloadManager>();
        var task = dm.AddTask(gid, token, title ?? $"Gallery {gid}");
        return Ok(new ApiResponse<object>(true, (object?)task ?? new { message = "已加入下载队列" }));
    }
}