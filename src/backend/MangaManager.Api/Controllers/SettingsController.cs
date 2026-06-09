using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly MangaDbContext _db;

    public SettingsController(MangaDbContext db) => _db = db;

    [HttpGet("reader")]
    public async Task<IActionResult> GetReaderSettings()
    {
        var settings = await _db.ReaderSettings.FindAsync(1);
        if (settings == null)
        {
            settings = new ReaderSettings();
            _db.ReaderSettings.Add(settings);
            await _db.SaveChangesAsync();
        }
        return Ok(new ApiResponse<ReaderSettings>(true, settings));
    }

    [HttpPut("reader")]
    public async Task<IActionResult> SaveReaderSettings([FromBody] ReaderSettings incoming)
    {
        var settings = await _db.ReaderSettings.FindAsync(1);
        if (settings == null)
        {
            settings = new ReaderSettings();
            _db.ReaderSettings.Add(settings);
        }

        settings.FitMode = incoming.FitMode;
        settings.FitPercent = incoming.FitPercent;
        settings.Direction = incoming.Direction;
        settings.Transition = incoming.Transition;
        settings.ReadMode = incoming.ReadMode;
        settings.SlideInterval = incoming.SlideInterval;
        settings.ScrollSpeed = incoming.ScrollSpeed;
        settings.LoopMode = incoming.LoopMode;
        settings.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<ReaderSettings>(true, settings, "已保存"));
    }
}
