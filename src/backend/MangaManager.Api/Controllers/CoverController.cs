using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CoverController : ControllerBase
{
    private readonly MangaDbContext _db;

    public CoverController(MangaDbContext db)
    {
        _db = db;
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetCover(int id)
    {
        var manga = await _db.Mangas.FindAsync(id);
        if (manga?.CoverPath == null || !System.IO.File.Exists(manga.CoverPath))
            return NotFound();

        var ext = Path.GetExtension(manga.CoverPath).ToLowerInvariant();
        var contentType = ext switch
        {
            ".webp" => "image/webp",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".bmp" => "image/bmp",
            ".gif" => "image/gif",
            _ => "application/octet-stream"
        };

        return PhysicalFile(manga.CoverPath, contentType);
    }
}
