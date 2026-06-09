using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/local")]
public class LocalGalleryController : ControllerBase
{
    private readonly LocalGalleryService _svc;

    public LocalGalleryController(LocalGalleryService svc) => _svc = svc;

    /// <summary>扫描本地画廊列表</summary>
    [HttpGet("galleries")]
    public IActionResult GetGalleries()
    {
        var list = _svc.ScanLocalGalleries();
        return Ok(new ApiResponse<object>(true, list));
    }

    /// <summary>获取本地画廊详情（含 EH 标签）</summary>
    [HttpGet("gallery/{gid}")]
    public async Task<IActionResult> GetDetail(int gid)
    {
        try
        {
            var d = await _svc.GetDetailAsync(gid);
            return Ok(new ApiResponse<object>(true, d));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>获取本地画廊的图片页面列表</summary>
    [HttpGet("gallery/{gid}/pages")]
    public async Task<IActionResult> GetPages(int gid)
    {
        try
        {
            var d = await _svc.GetDetailAsync(gid);
            return Ok(new ApiResponse<object>(true, d.Pages));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>提供本地图片文件</summary>
    [HttpGet("gallery/{gid}/page/{pageIndex}")]
    public IActionResult GetPage(int gid, int pageIndex)
    {
        var filePath = _svc.GetPageFilePath(gid, pageIndex);
        if (filePath == null || !System.IO.File.Exists(filePath))
            return NotFound();

        var ext = Path.GetExtension(filePath).ToLower();
        var ct = ext switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".bmp" => "image/bmp",
            _ => "image/jpeg"
        };
        Response.Headers["Cache-Control"] = "public, max-age=86400";
        return PhysicalFile(filePath, ct);
    }

    /// <summary>提供本地封面图片</summary>
    [HttpGet("gallery/{gid}/cover")]
    public IActionResult GetCover(int gid)
    {
        try
        {
            var dir = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
            if (dir == null) return NotFound();

            var files = Directory.GetFiles(dir)
                .Where(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f)
                .ToList();

            if (files.Count == 0) return NotFound();
            var cover = files.FirstOrDefault(f => Path.GetFileNameWithoutExtension(f).EndsWith("0001")) ?? files[0];

            var ext = Path.GetExtension(cover).ToLower();
            var ct = ext switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
            Response.Headers["Cache-Control"] = "public, max-age=86400";
            return PhysicalFile(cover, ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Cover] gid={gid} error: {ex.Message}");
            return StatusCode(500, new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>批量检查本地是否存在这些 gid</summary>
    [HttpPost("check-downloaded")]
    public IActionResult CheckDownloaded([FromBody] CheckDownloadedRequest req)
    {
        var result = new List<int>();
        if (req.Gids != null)
        {
            foreach (var gid in req.Gids)
            {
                var dir = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
                if (dir != null) result.Add(gid);
            }
        }
        return Ok(new ApiResponse<object>(true, result));
    }

    /// <summary>删除本地画廊（删除整个目录）</summary>
    [HttpDelete("gallery/{gid}")]
    public IActionResult DeleteGallery(int gid)
    {
        var dir = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
        if (dir == null)
            return NotFound(new ApiResponse<object>(false, null, "未找到该画廊"));

        try
        {
            Directory.Delete(dir, true);
            return Ok(new ApiResponse<object>(true, new { message = "已删除" }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, $"删除失败: {ex.Message}"));
        }
    }

    /// <summary>重新下载画廊（先删除再触发下载）</summary>
    [HttpPost("gallery/{gid}/redownload")]
    public async Task<IActionResult> Redownload(int gid, [FromQuery] string? title, [FromQuery] string? token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return BadRequest(new ApiResponse<object>(false, null, "缺少 token 参数"));

        // 删除旧目录
        var dir = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
        if (dir != null)
        {
            try { Directory.Delete(dir, true); }
            catch (Exception ex) { return BadRequest(new ApiResponse<object>(false, null, $"删除旧文件失败: {ex.Message}")); }
        }

        // 触发重新下载
        var ehSvc = HttpContext.RequestServices.GetRequiredService<EhentaiService>();
        _ = Task.Run(async () => await ehSvc.DownloadGalleryAsync(gid, token, title));

        return Ok(new ApiResponse<object>(true, new { message = "重新下载任务已启动" }));
    }

    /// <summary>批量重新下载（自动读取 .eh 文件中的 token）</summary>
    [HttpPost("redownload-batch")]
    public IActionResult BatchRedownload([FromBody] BatchRedownloadRequest req)
    {
        if (req.Gids == null || req.Gids.Count == 0)
            return BadRequest(new ApiResponse<object>(false, null, "未提供画廊 ID"));

        var ehSvc = HttpContext.RequestServices.GetRequiredService<EhentaiService>();
        var results = new List<object>();
        int success = 0, skipped = 0, failed = 0;

        foreach (var gid in req.Gids)
        {
            var dir = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
            if (dir == null)
            {
                skipped++;
                results.Add(new { gid, status = "skipped", reason = "未找到本地目录" });
                continue;
            }

            // 读取 .eh 文件获取 token
            string? token = null;
            var ehFile = System.IO.Path.Combine(dir, ".eh");
            if (System.IO.File.Exists(ehFile))
            {
                var lines = System.IO.File.ReadAllLines(ehFile);
                token = lines.FirstOrDefault(l => l.StartsWith("token="))?[6..];
            }

            if (string.IsNullOrEmpty(token))
            {
                skipped++;
                results.Add(new { gid, status = "skipped", reason = "缺少 token（未找到 .eh 元文件）" });
                continue;
            }

            var dirName = Path.GetFileName(dir);
            var dashIdx = dirName.IndexOf('-');
            var title = dashIdx > 0 ? dirName[(dashIdx + 1)..] : dirName;

            // 删除旧目录
            try { Directory.Delete(dir, true); }
            catch (Exception ex)
            {
                failed++;
                results.Add(new { gid, status = "failed", reason = $"删除旧文件失败: {ex.Message}" });
                continue;
            }

            // 触发下载
            var capturedGid = gid;
            var capturedToken = token;
            var capturedTitle = title;
            _ = Task.Run(async () => await ehSvc.DownloadGalleryAsync(capturedGid, capturedToken, capturedTitle));

            success++;
            results.Add(new { gid, status = "ok" });
        }

        return Ok(new ApiResponse<object>(true, new
        {
            total = req.Gids.Count,
            success,
            skipped,
            failed,
            results
        }));
    }

    /// <summary>导入外部作品：从指定目录复制图片并创建 meta.json</summary>
    [HttpPost("import")]
    public async Task<IActionResult> ImportGallery([FromBody] ImportRequest req)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(req.SourceDir))
                return BadRequest(new ApiResponse<object>(false, null, "请提供源目录路径"));
            if (string.IsNullOrWhiteSpace(req.Title))
                return BadRequest(new ApiResponse<object>(false, null, "请提供标题"));

            var item = await _svc.ImportGalleryAsync(
                req.SourceDir, req.Title, req.Category, req.Language,
                req.Artists, req.Groups, req.OtherTags, req.CopyFiles);

            return Ok(new ApiResponse<object>(true, item, "导入成功"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>获取作品的标签元数据（用于编辑）</summary>
    [HttpGet("gallery/{gid}/meta-tags")]
    public IActionResult GetMetaTags(int gid)
    {
        var tags = _svc.GetMetaTags(gid);
        if (tags == null) return Ok(new ApiResponse<object>(true, new Dictionary<string, List<string>>()));
        return Ok(new ApiResponse<object>(true, tags));
    }

    /// <summary>更新作品的标签元数据</summary>
    /// <summary>批量导入：扫描父目录下所有子文件夹，每个作为一个作品</summary>
    [HttpPost("batch-import")]
    public async Task<IActionResult> BatchImport([FromBody] BatchImportRequest req)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(req.ParentDir))
                return BadRequest(new ApiResponse<object>(false, null, "请提供父目录路径"));

            var results = await _svc.BatchImportAsync(req.ParentDir, req.CopyFiles);
            int success = results.Count(r => ((dynamic)r).success == true);
            int failed = results.Count(r => ((dynamic)r).success == false);
            return Ok(new ApiResponse<object>(true, new { success, failed, total = results.Count, results }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    [HttpPut("gallery/{gid}/meta-tags")]
    public async Task<IActionResult> UpdateMetaTags(int gid, [FromBody] UpdateMetaTagsRequest req)
    {
        try
        {
            await _svc.UpdateMetaTagsAsync(gid, req.Tags ?? new(), req.Title, req.Category, req.Language);
            return Ok(new ApiResponse<object>(true, null, "标签已更新"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>补全旧画廊元数据：扫描没有 .meta.json 的目录，从 EH 获取详情写入</summary>
    [HttpPost("repair-metadata")]
    public async Task<IActionResult> RepairMetadata()
    {
        var baseDir = EhentaiService.DefaultDownloadDir;
        if (!Directory.Exists(baseDir))
            return BadRequest(new ApiResponse<object>(false, null, "下载目录不存在"));

        var dirs = Directory.GetDirectories(baseDir);
        var needRepair = new List<(int gid, string dir, string? token)>();

        foreach (var dir in dirs)
        {
            if (System.IO.File.Exists(Path.Combine(dir, ".meta.json"))) continue;
            var dirName = Path.GetFileName(dir);
            var dashIdx = dirName.IndexOf('-');
            if (dashIdx <= 0 || !int.TryParse(dirName[..dashIdx], out var gid)) continue;

            string? token = null;
            var ehFile = Path.Combine(dir, ".eh");
            if (System.IO.File.Exists(ehFile))
            {
                foreach (var line in await System.IO.File.ReadAllLinesAsync(ehFile))
                {
                    if (line.StartsWith("token=")) { token = line[6..]; break; }
                }
            }
            needRepair.Add((gid, dir, token));
        }

        // SSE 推送进度
        Response.Headers.Append("Content-Type", "text/event-stream");
        Response.Headers.Append("Cache-Control", "no-cache");
        var clientId = Guid.NewGuid().ToString("N");

        int total = needRepair.Count, repaired = 0, failed = 0;
        await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new { type = "start", total })}\n\n");
        await Response.Body.FlushAsync();

        foreach (var (gid, dir, token) in needRepair)
        {
            try
            {
                if (string.IsNullOrEmpty(token))
                {
                    failed++;
                    await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new { type = "progress", gid, title = Path.GetFileName(dir), repaired, failed, total })}\n\n");
                    await Response.Body.FlushAsync();
                    continue;
                }

                var detail = await _svc.GetEHDetailAsync(gid, token);
                if (detail != null)
                {
                    var meta = new
                    {
                        gid = detail.Gid,
                        title = detail.Title,
                        titleJpn = detail.TitleJpn,
                        category = detail.Category,
                        uploader = detail.Uploader,
                        rating = detail.Rating,
                        ratingCount = detail.RatingCount,
                        fileCount = detail.FileCount,
                        fileSize = detail.FileSize,
                        language = detail.Language,
                        tags = detail.TagGroups?.ToDictionary(g => g.Namespace.ToLower(), g => g.Tags),
                        downloadedAt = DateTime.UtcNow.ToString("o")
                    };
                    var json = System.Text.Json.JsonSerializer.Serialize(meta, new System.Text.Json.JsonSerializerOptions
                    { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
                    await System.IO.File.WriteAllTextAsync(Path.Combine(dir, ".meta.json"), json);
                    repaired++;
                }
                else failed++;

                await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new { type = "progress", gid, title = Path.GetFileName(dir), repaired, failed, total })}\n\n");
                await Response.Body.FlushAsync();

                // 请求间隔，避免被限流
                await Task.Delay(3000);
            }
            catch (Exception ex)
            {
                failed++;
                await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new { type = "progress", gid, title = Path.GetFileName(dir), repaired, failed, total, error = ex.Message })}\n\n");
                await Response.Body.FlushAsync();
            }
        }

        await Response.WriteAsync($"data: {System.Text.Json.JsonSerializer.Serialize(new { type = "done", repaired, failed, total })}\n\n");
        await Response.Body.FlushAsync();
        return new EmptyResult();
    }
}

public record BatchRedownloadRequest(List<int> Gids);

public record CheckDownloadedRequest(List<int> Gids);

public record BatchImportRequest(string ParentDir, bool CopyFiles = true);

public record ImportRequest(
    string SourceDir,
    string Title,
    string? Category,
    string? Language,
    List<string>? Artists,
    List<string>? Groups,
    List<string>? OtherTags,
    bool CopyFiles = true
);

public record UpdateMetaTagsRequest(
    Dictionary<string, List<string>>? Tags,
    string? Title,
    string? Category,
    string? Language
);
