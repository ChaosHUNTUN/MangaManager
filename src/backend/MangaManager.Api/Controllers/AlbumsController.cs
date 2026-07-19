using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;
using MangaManager.Services;

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
            // 先用 raw SQL 确保 CreatedAt 列存在，避免 EF 查询失败
            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
            var hasCreatedAt = false;
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('album_config') WHERE name='CreatedAt'";
                using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                    hasCreatedAt = (long)reader.GetValue(0) > 0;
            }
            if (!hasCreatedAt)
            {
                using var alterCmd = conn.CreateCommand();
                alterCmd.CommandText = "ALTER TABLE album_config ADD COLUMN CreatedAt TEXT NOT NULL DEFAULT '2000-01-01T00:00:00'";
                await alterCmd.ExecuteNonQueryAsync();
            }

            var list = await _db.AlbumConfigs.ToListAsync();
            var result = list.ToDictionary(a => a.Key, a => new
            {
                name = a.Name,
                color = string.IsNullOrEmpty(a.Color) ? null : a.Color,
                keyTag = a.KeyTag,
                gids = System.Text.Json.JsonSerializer.Deserialize<int[]>(a.Gids) ?? Array.Empty<int>(),
                order = System.Text.Json.JsonSerializer.Deserialize<int[]>(a.Order ?? "[]") ?? Array.Empty<int>(),
                createdAt = a.CreatedAt.ToString("o"),
                updatedAt = a.UpdatedAt.ToString("o")
            });
            return Ok(new ApiResponse<object>(true, result));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<object>(false, null, $"GetAll error: {ex.GetType().Name}: {ex.Message}"));
        }
    }

    /// <summary>获取单个专辑详情（含关键标签及翻译）</summary>
    [HttpGet("{key}")]
    public async Task<IActionResult> GetDetail(string key)
    {
        try
        {
            var entity = await _db.AlbumConfigs.FirstOrDefaultAsync(a => a.Key == key);
            if (entity == null)
                return NotFound(new ApiResponse<object>(false, null, $"专辑 '{key}' 不存在"));

            var gids = System.Text.Json.JsonSerializer.Deserialize<int[]>(entity.Gids) ?? Array.Empty<int>();

            // 解析关键标签：优先用存储的 KeyTag，回退到从 Key 推导
            string? tagNs = null, tagValue = null, nsCn = null, tagCn = null;
            var rawKeyTag = entity.KeyTag;
            if (!string.IsNullOrEmpty(rawKeyTag))
            {
                var colonIdx = rawKeyTag.IndexOf(':');
                if (colonIdx > 0)
                {
                    tagNs = rawKeyTag.Substring(0, colonIdx);
                    tagValue = rawKeyTag.Substring(colonIdx + 1);
                    nsCn = EhentaiService.TranslateNamespace(tagNs);
                    tagCn = EhentaiService.TranslateTag(rawKeyTag);
                }
            }
            else
            {
                // 回退：从 Key 推导
                var colonIdx = key.IndexOf(':');
                if (colonIdx > 0)
                {
                    tagNs = key.Substring(0, colonIdx);
                    tagValue = key.Substring(colonIdx + 1);
                    nsCn = EhentaiService.TranslateNamespace(tagNs);
                    tagCn = EhentaiService.TranslateTag(key);
                }
                else
                {
                    tagValue = key;
                    if (gids.Length > 0)
                    {
                        var tags = LocalGalleryService.GetCachedMetaTags(gids[0]);
                        if (tags != null)
                        {
                            foreach (var (ns, vals) in tags)
                            {
                                if (vals.Contains(key, StringComparer.OrdinalIgnoreCase))
                                {
                                    tagNs = ns;
                                    nsCn = EhentaiService.TranslateNamespace(ns);
                                    tagCn = EhentaiService.TranslateTag($"{ns}:{key}");
                                    break;
                                }
                            }
                        }
                    }
                    if (tagNs == null)
                    {
                        tagCn = EhentaiService.TranslateTag(key);
                        if (tagCn == key)
                        {
                            foreach (var ns in new[] { "artist", "group", "parody", "character", "language", "female", "male", "misc" })
                            {
                                var testCn = EhentaiService.TranslateTag($"{ns}:{key}");
                                if (testCn != $"{ns}:{key}")
                                {
                                    tagNs = ns;
                                    nsCn = EhentaiService.TranslateNamespace(ns);
                                    tagCn = testCn;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            var keyTag = tagNs != null ? new { ns = tagNs, nsCn, tag = tagValue, cn = tagCn } : null;

            return Ok(new ApiResponse<object>(true, new
            {
                key = entity.Key,
                name = entity.Name,
                color = string.IsNullOrEmpty(entity.Color) ? null : entity.Color,
                count = entity.Count,
                gidCount = gids.Length,
                createdAt = entity.CreatedAt.ToString("o"),
                updatedAt = entity.UpdatedAt.ToString("o"),
                keyTag,
                gids
            }));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<object>(false, null, $"GetDetail error: {ex.GetType().Name}: {ex.Message}"));
        }
    }

    /// <summary>查询所有专辑简略信息（key, name, color, count, createdAt）</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        try
        {
            var list = await _db.AlbumConfigs
                .OrderByDescending(a => a.CreatedAt)
                .Select(a => new
                {
                    key = a.Key,
                    name = a.Name,
                    color = string.IsNullOrEmpty(a.Color) ? null : a.Color,
                    count = a.Count,
                    createdAt = a.CreatedAt.ToString("o")
                })
                .ToListAsync();
            return Ok(new ApiResponse<object>(true, list));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiResponse<object>(false, null, $"GetSummary error: {ex.GetType().Name}: {ex.Message}"));
        }
    }

    /// <summary>根据专辑 Key 查询详细信息（简略信息 + gid 列表 + 关键标签）</summary>
    [HttpGet("{key}/detail")]
    public async Task<IActionResult> GetDetailV2(string key)
    {
        // 复用 GetDetail 逻辑，直接委托
        return await GetDetail(key);
    }

    [HttpPut]
    public async Task<IActionResult> Save([FromBody] Dictionary<string, AlbumItem> data)
    {
        if (data == null || data.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "没有数据，拒绝保存以避免清空专辑"));

        var existing = await _db.AlbumConfigs.ToDictionaryAsync(a => a.Key);
        var usedColors = existing.Values.Select(e => e.Color).Where(c => !string.IsNullOrEmpty(c)).ToHashSet();
        foreach (var (key, item) in data)
        {
            var gids = item.Gids ?? new int[0];
            if (existing.TryGetValue(key, out var entity))
            {
                entity.Name = item.Name ?? key;
                entity.Gids = System.Text.Json.JsonSerializer.Serialize(gids);
                entity.Order = System.Text.Json.JsonSerializer.Serialize(item.Order ?? new int[0]);
                entity.Count = gids.Length;
                entity.KeyTag = key.Contains(':') ? key : entity.KeyTag;
                entity.UpdatedAt = DateTime.UtcNow;
                if (string.IsNullOrEmpty(entity.Color))
                {
                    entity.Color = AlbumColorGenerator.GenerateAlbumColor(usedColors);
                    usedColors.Add(entity.Color);
                }
            }
            else
            {
                var newColor = AlbumColorGenerator.GenerateAlbumColor(usedColors);
                usedColors.Add(newColor);
                _db.AlbumConfigs.Add(new AlbumConfig
                {
                    Key = key,
                    Name = item.Name ?? key,
                    Color = newColor,
                    Gids = System.Text.Json.JsonSerializer.Serialize(gids),
                    Order = System.Text.Json.JsonSerializer.Serialize(item.Order ?? new int[0]),
                    Count = gids.Length,
                    KeyTag = key.Contains(':') ? key : null,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }
        var keysToDelete = existing.Keys.Except(data.Keys).ToList();
        foreach (var key in keysToDelete)
            _db.AlbumConfigs.Remove(existing[key]);

        await _db.SaveChangesAsync();

        // 同步 local_gallery.AlbumKey：先清空受影响专辑的所有记录，再批量写入
        var affectedKeys = data.Keys.Concat(keysToDelete).Distinct().ToList();
        if (affectedKeys.Count > 0)
        {
            // SQLite 对大型 IN 子句敏感，分批处理
            for (int i = 0; i < affectedKeys.Count; i += 50)
            {
                var batch = affectedKeys.Skip(i).Take(50).ToList();
                await _db.LocalGalleries
                    .Where(g => g.AlbumKey != null && batch.Contains(g.AlbumKey))
                    .ExecuteUpdateAsync(s => s.SetProperty(g => g.AlbumKey, g => null));
            }
        }

        foreach (var (key, item) in data)
        {
            var gids = item.Gids ?? new int[0];
            if (gids.Length == 0) continue;
            for (int i = 0; i < gids.Length; i += 100)
            {
                var batch = gids.Skip(i).Take(100).ToList();
                await _db.LocalGalleries
                    .Where(g => batch.Contains(g.Gid))
                    .ExecuteUpdateAsync(s => s.SetProperty(g => g.AlbumKey, key));
            }
        }

        return Ok(new ApiResponse<object>(true, null, "已保存"));
    }

    /// <summary>更新专辑属性（名称、颜色）</summary>
    [HttpPatch("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] AlbumUpdateRequest req)
    {
        var entity = await _db.AlbumConfigs.FirstOrDefaultAsync(a => a.Key == key);
        if (entity == null)
            return NotFound(new ApiResponse<object>(false, null, $"专辑 '{key}' 不存在"));

        if (!string.IsNullOrWhiteSpace(req.Name))
            entity.Name = req.Name.Trim();

        if (!string.IsNullOrWhiteSpace(req.Color) && req.Color.StartsWith("#") && req.Color.Length == 7)
            entity.Color = req.Color;

        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, new
        {
            key = entity.Key,
            name = entity.Name,
            color = entity.Color
        }, "已更新"));
    }

    /// <summary>单独重命名专辑（保留兼容旧前端）</summary>
    [HttpPatch("{key}/rename")]
    public async Task<IActionResult> Rename(string key, [FromBody] AlbumRenameRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new ApiResponse<object>(false, null, "名称不能为空"));

        var entity = await _db.AlbumConfigs.FirstOrDefaultAsync(a => a.Key == key);
        if (entity == null)
            return NotFound(new ApiResponse<object>(false, null, $"专辑 '{key}' 不存在"));

        entity.Name = req.Name.Trim();
        entity.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new ApiResponse<object>(true, new { key = entity.Key, name = entity.Name }, "已重命名"));
    }
}

public class AlbumRenameRequest
{
    public string Name { get; set; } = "";
}

public class AlbumUpdateRequest
{
    public string? Name { get; set; }
    public string? Color { get; set; }
}

public class AlbumItem
{
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int[]? Gids { get; set; }
    public int[]? Order { get; set; }
}

/// <summary>专辑颜色工具</summary>
internal static class AlbumColorGenerator
{
    // 预定义调色板：24 种柔和/高辨识度颜色，优先从这里面选
    private static readonly string[] Palette = {
        "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
        "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
        "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#fb923c",
        "#facc15", "#a3e635", "#34d399", "#2dd4bf", "#38bdf8", "#818cf8"
    };

    /// <summary>生成一个不与 usedColors 重复的颜色</summary>
    public static string GenerateAlbumColor(HashSet<string>? usedColors = null)
    {
        var used = usedColors ?? new HashSet<string>();
        // 先从调色板中选未使用的
        foreach (var c in Palette)
            if (!used.Contains(c)) return c;
        // 如果调色板用完，随机生成
        var rng = new Random();
        string hex;
        do
        {
            hex = $"#{(rng.Next(256) << 16 | rng.Next(256) << 8 | rng.Next(256)):X6}".ToLowerInvariant();
        } while (used.Contains(hex));
        return hex;
    }
}
