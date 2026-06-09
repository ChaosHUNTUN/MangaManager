using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReaderController : ControllerBase
{
    private readonly MangaDbContext _db;

    public ReaderController(MangaDbContext db)
    {
        _db = db;
    }

    // 获取漫画的所有图片文件列表
    [HttpGet("manga/{mangaId}/pages")]
    public async Task<IActionResult> GetPages(int mangaId)
    {
        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null)
            return NotFound(new ApiResponse<object>(false, null, "漫画不存在"));

        if (!Directory.Exists(manga.FolderPath))
            return NotFound(new ApiResponse<object>(false, null, "文件夹不存在"));

        var files = Directory.GetFiles(manga.FolderPath)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .Select((path, index) => new PageItem(
                Index: index,
                FileName: Path.GetFileName(path),
                Url: $"/api/reader/manga/{mangaId}/page/{index}"
            ))
            .ToList();

        return Ok(new ApiResponse<List<PageItem>>(true, files));
    }

    // 获取单张图片
    [HttpGet("manga/{mangaId}/page/{pageIndex}")]
    public async Task<IActionResult> GetPage(int mangaId, int pageIndex)
    {
        var manga = await _db.Mangas.FindAsync(mangaId);
        if (manga == null)
            return NotFound();

        if (!Directory.Exists(manga.FolderPath))
            return NotFound();

        var files = Directory.GetFiles(manga.FolderPath)
            .Where(f => IsImageFile(f))
            .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (pageIndex < 0 || pageIndex >= files.Count)
            return NotFound();

        var filePath = files[pageIndex];
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        var contentType = ext switch
        {
            ".webp" => "image/webp",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".bmp" => "image/bmp",
            ".gif" => "image/gif",
            _ => "application/octet-stream"
        };

        return PhysicalFile(filePath, contentType);
    }

    private static bool IsImageFile(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext is ".jpg" or ".jpeg" or ".png" or ".webp" or ".bmp" or ".gif";
    }

    public record PageItem(int Index, string FileName, string Url);
}
