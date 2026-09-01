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

        // 返回引擎设置 JSON（当前前端唯一使用的字段；旧列保留兼容不参与）
        object? data = null;
        if (!string.IsNullOrWhiteSpace(settings.Data))
        {
            try { data = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(settings.Data); }
            catch { /* 坏数据忽略，前端回退默认 */ }
        }
        return Ok(new ApiResponse<object>(true, new { data }));
    }

    [HttpPut("reader")]
    public async Task<IActionResult> SaveReaderSettings([FromBody] ReaderSettingsData? incoming)
    {
        var settings = await _db.ReaderSettings.FindAsync(1);
        if (settings == null)
        {
            settings = new ReaderSettings();
            _db.ReaderSettings.Add(settings);
        }

        if (incoming?.Data != null)
            settings.Data = System.Text.Json.JsonSerializer.Serialize(incoming.Data);
        settings.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { saved = true }, "已保存"));
    }
}

public record ReaderSettingsData(object? Data);
