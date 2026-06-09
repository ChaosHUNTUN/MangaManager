using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlbumsController : ControllerBase
{
    private readonly MangaDbContext _db;

    public AlbumsController(MangaDbContext db) => _db = db;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var list = await _db.AlbumConfigs.ToListAsync();
            var result = list.ToDictionary(a => a.Key, a => new
            {
                name = a.Name,
                gids = System.Text.Json.JsonSerializer.Deserialize<int[]>(a.Gids) ?? Array.Empty<int>(),
                order = System.Text.Json.JsonSerializer.Deserialize<int[]>(a.Order ?? "[]") ?? Array.Empty<int>()
            });
            return Ok(new ApiResponse<object>(true, result));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<object>(false, null, $"GetAll error: {ex.GetType().Name}: {ex.Message}"));
        }
    }

    [HttpPut]
    public async Task<IActionResult> Save([FromBody] Dictionary<string, AlbumItem> data)
    {
        var existing = await _db.AlbumConfigs.ToDictionaryAsync(a => a.Key);
        foreach (var (key, item) in data)
        {
            if (existing.TryGetValue(key, out var entity))
            {
                entity.Name = item.Name ?? key;
                entity.Gids = System.Text.Json.JsonSerializer.Serialize(item.Gids ?? new int[0]);
                entity.Order = System.Text.Json.JsonSerializer.Serialize(item.Order ?? new int[0]);
                entity.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _db.AlbumConfigs.Add(new AlbumConfig
                {
                    Key = key,
                    Name = item.Name ?? key,
                    Gids = System.Text.Json.JsonSerializer.Serialize(item.Gids ?? new int[0]),
                    Order = System.Text.Json.JsonSerializer.Serialize(item.Order ?? new int[0]),
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }
        // 删除数据库中已不存在于请求中的专辑
        var keysToDelete = existing.Keys.Except(data.Keys).ToList();
        foreach (var key in keysToDelete)
            _db.AlbumConfigs.Remove(existing[key]);

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, null, "已保存"));
    }
}

public class AlbumItem
{
    public string? Name { get; set; }
    public int[]? Gids { get; set; }
    public int[]? Order { get; set; }
}
