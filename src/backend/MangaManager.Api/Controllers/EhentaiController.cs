using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/ehentai")]
public class EhentaiController : ControllerBase
{
    private readonly EhentaiService _svc;

    public EhentaiController(EhentaiService svc) => _svc = svc;

    // ==================== Cookie ====================

    /// <summary>获取当前 Cookie 信息（脱敏）</summary>
    [HttpGet("cookie")]
    public IActionResult GetCookie()
    {
        var c = _svc.GetCookie();
        return Ok(new ApiResponse<object>(true, new
        {
            ipbMemberId = Mask(c.IpbMemberId),
            ipbPassHash = Mask(c.IpbPassHash),
            igneous = Mask(c.Igneous),
            label = c.Label
        }));
    }

    /// <summary>更新 Cookie</summary>
    [HttpPut("cookie")]
    public IActionResult SetCookie([FromBody] CookieUpdateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.IpbMemberId) ||
            string.IsNullOrWhiteSpace(req.IpbPassHash))
            return BadRequest(new ApiResponse<object>(false, null, "ipb_member_id 和 ipb_pass_hash 为必填"));

        _svc.SetCookie(new EhentaiService.EhentaiCookie
        {
            IpbMemberId = req.IpbMemberId.Trim(),
            IpbPassHash = req.IpbPassHash.Trim(),
            Igneous = req.Igneous?.Trim() ?? "",
            Label = req.Label?.Trim() ?? "默认"
        });
        return Ok(new ApiResponse<object>(true, new { message = "Cookie 已保存" }));
    }

    /// <summary>验证 Cookie 有效性</summary>
    [HttpPost("validate")]
    public async Task<IActionResult> Validate()
    {
        var r = await _svc.ValidateAsync();
        return Ok(new ApiResponse<object>(true, new
        {
            loggedIn = r.LoggedIn,
            exhentai = r.Exhentai,
            error = r.Error
        }));
    }

    /// <summary>连通性检测（表站+里站）</summary>
    [HttpGet("connectivity")]
    public async Task<IActionResult> CheckConnectivity()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            
            // 检查表站
            bool eReachable = false;
            try { var r = await client.GetAsync("https://e-hentai.org/", cts.Token); eReachable = r.IsSuccessStatusCode; } catch { }
            
            // 检查里站
            bool exReachable = false;
            try { var r = await client.GetAsync("https://exhentai.org/", cts.Token); exReachable = r.IsSuccessStatusCode; } catch { }
            
            return Ok(new ApiResponse<object>(true, new { reachable = eReachable || exReachable, eReachable, exReachable }));
        }
        catch (TaskCanceledException)
        {
            return Ok(new ApiResponse<object>(true, new { reachable = false, hint = "连接超时。E-Hentai 不可直接访问，需要配置代理。" }));
        }
        catch (HttpRequestException ex)
        {
            return Ok(new ApiResponse<object>(true, new { reachable = false, hint = $"网络不通: {ex.Message}" }));
        }
        catch (Exception ex)
        {
            return Ok(new ApiResponse<object>(true, new { reachable = false, hint = ex.Message }));
        }
    }

    // ==================== 浏览 ====================

    /// <summary>浏览/搜索画廊</summary>
    [HttpGet("galleries")]
    public async Task<IActionResult> GetGalleries(
        [FromQuery] string? search,
        [FromQuery] int page = 0,
        [FromQuery] bool exhentai = false,
        [FromQuery] string? nextCursor = null,
        [FromQuery] int categoryMask = 0,
        [FromQuery] int? minRating = null,
        [FromQuery] int? pageFrom = null,
        [FromQuery] int? pageTo = null,
        [FromQuery] int? advSearch = null,
        [FromQuery] bool popular = false)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            var r = await _svc.GetGalleriesAsync(search, page, exhentai, nextCursor,
                categoryMask, minRating, pageFrom, pageTo, advSearch, popular);
            return Ok(new ApiResponse<object>(true, new
            {
                r.Page, r.TotalPages, r.NextCursor, r.IsExhentai, r.Galleries
            }));
        }
        catch (TaskCanceledException)
        {
            return BadRequest(new ApiResponse<object>(false, null, "请求超时：无法连接到 E-Hentai，请检查网络或代理设置"));
        }
        catch (HttpRequestException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}。可能需要科学上网。"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>画廊详情</summary>
    [HttpGet("gallery/{gid}/{token}")]
    public async Task<IActionResult> GetDetail(int gid, string token)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));
        try
        {
            var r = await _svc.GetGalleryDetailAsync(gid, token);
            return Ok(new ApiResponse<object>(true, r));
        }
        catch (TaskCanceledException)
        {
            return BadRequest(new ApiResponse<object>(false, null, "请求超时"));
        }
        catch (HttpRequestException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>获取图片页面列表</summary>
    [HttpGet("gallery/{gid}/{token}/pages")]
    public async Task<IActionResult> GetPages(int gid, string token)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));
        try
        {
            var r = await _svc.GetPagesAsync(gid, token);
            return Ok(new ApiResponse<object>(true, new
            {
                pages = r.Pages,
                imgKey = r.ImgKey,
                showKey = r.ShowKey
            }));
        }
        catch (TaskCanceledException)
        {
            return BadRequest(new ApiResponse<object>(false, null, "请求超时"));
        }
        catch (HttpRequestException ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    // ==================== 图片代理 ====================

    /// <summary>代理 E-Hentai 图片（/s/ 路径 → 一步完成 HTML解析+图片下载）</summary>
    [HttpGet("image")]
    public async Task<IActionResult> ProxyImage([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new ApiResponse<object>(false, null, "缺少 url 参数"));
        try
        {
            // /s/ 格式：一步完成解析+下载
            if (url.Contains("/s/"))
            {
                var (data, ct) = await _svc.FetchImageFromPageAsync(url);
                if (data != null)
                {
                    Response.Headers["Cache-Control"] = "public, max-age=3600";
                    return File(data, ct);
                }
                return NotFound();
            }
            // 直接图片 URL
            var imgData = await _svc.FetchImageAsync(url);
            var contentType = imgData.Length > 3 && imgData[0] == 0xFF ? "image/jpeg" :
                              imgData.Length > 4 && imgData[0] == 0x89 ? "image/png" : "image/webp";
            Response.Headers["Cache-Control"] = "public, max-age=3600";
            return File(imgData, contentType);
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    // ==================== 本地文件 ====================

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
        // 在所有匹配的目录中查找
        if (Directory.Exists(EhentaiService.DefaultDownloadDir))
        {
            var dirs = Directory.GetDirectories(EhentaiService.DefaultDownloadDir, $"{gid}-*");
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

    // ==================== 下载（已迁移到 DownloadManager，此处保留兼容端点） ====================

    /// <summary>查询下载进度（兼容旧 API，新代码请用 /api/download/tasks/{gid}）</summary>
    [HttpGet("download/progress/{gid}")]
    public IActionResult GetDownloadProgress(int gid, [FromQuery] string? title)
    {
        // 优先从 DownloadManager 获取
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

        // 回退到旧逻辑
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

    /// <summary>下载画廊到本地（通过 DownloadManager）</summary>
    [HttpPost("download/{gid}/{token}")]
    public IActionResult Download(int gid, string token, [FromQuery] string? title)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));
        var dm = HttpContext.RequestServices.GetRequiredService<DownloadManager>();
        var task = dm.AddTask(gid, token, title ?? $"Gallery {gid}");
        return Ok(new ApiResponse<object>(true, (object?)task ?? new { message = "已加入下载队列" }));
    }

    // ==================== 搜索翻译 ====================

    /// <summary>中文搜索词 → E-Hentai 搜索语法</summary>
    [HttpGet("search/translate")]
    public IActionResult TranslateSearch([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new ApiResponse<object>(false, null, "缺少搜索词"));
        var result = EhentaiService.TranslateChineseSearch(q);
        return Ok(new ApiResponse<object>(true, new { original = q, translated = result }));
    }

    /// <summary>代理 E-Hentai 详情 HTML 页面</summary>
    [HttpGet("proxy-page/{gid}/{token}")]
    public async Task<IActionResult> ProxyPage(int gid, string token, [FromQuery] int p = 0)
    {
        if (!_svc.HasCookie())
            return Unauthorized(new ApiResponse<object>(false, null, "请先配置并保存 E-Hentai Cookie"));
        try
        {
            var (html, contentType) = await _svc.GetGalleryPageHtmlAsync(gid, token, p);
            return Content(html, contentType);
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    // ==================== 标签翻译 ====================

    /// <summary>批量翻译标签</summary>
    [HttpPost("tags/translate")]
    public IActionResult TranslateTags([FromBody] TranslateRequest req)
    {
        var result = new List<object>();
        if (req.Tags != null)
        {
            foreach (var tag in req.Tags)
            {
                var cn = EhentaiService.TranslateTag(tag);
                result.Add(new { key = tag, cn });
            }
        }
        return Ok(new ApiResponse<object>(true, result));
    }

    /// <summary>翻译单个 namespace</summary>
    [HttpGet("tags/translate-ns")]
    public IActionResult TranslateNamespace([FromQuery] string ns)
    {
        var cn = EhentaiService.TranslateNamespace(ns);
        return Ok(new ApiResponse<object>(true, new { ns, cn }));
    }

    /// <summary>搜索标签建议（对标 EhViewer TagSuggestion），支持中英文模糊搜索</summary>
    [HttpGet("tags/suggest")]
    public IActionResult SuggestTags([FromQuery] string q, [FromQuery] int limit = 30)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 1)
            return Ok(new ApiResponse<object>(true, Array.Empty<object>()));
        var results = EhentaiService.SuggestTags(q, Math.Clamp(limit, 1, 100));
        return Ok(new ApiResponse<object>(true, results));
    }

    // ==================== 标签屏蔽 ====================

    /// <summary>获取屏蔽标签列表</summary>
    [HttpGet("blocked-tags")]
    public IActionResult GetBlockedTags()
    {
        var tags = EhentaiService.GetBlockedTags();
        return Ok(new ApiResponse<object>(true, tags));
    }

    /// <summary>添加屏蔽标签（同步到 E-Hentai My Tags）</summary>
    [HttpPost("blocked-tags")]
    public async Task<IActionResult> AddBlockedTag([FromBody] BlockedTagRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Tag))
            return BadRequest(new ApiResponse<object>(false, null, "标签不能为空"));
        await _svc.AddBlockedTagAsync(req.Tag);
        return Ok(new ApiResponse<object>(true, new { message = "已添加，已同步到 E-Hentai" }));
    }

    /// <summary>删除屏蔽标签（同步到 E-Hentai My Tags）</summary>
    [HttpDelete("blocked-tags")]
    public async Task<IActionResult> RemoveBlockedTag([FromBody] BlockedTagRequest req)
    {
        await _svc.RemoveBlockedTagAsync(req.Tag ?? "");
        return Ok(new ApiResponse<object>(true, new { message = "已移除，已同步到 E-Hentai" }));
    }

    /// <summary>获取 E-Hentai My Tags 完整列表（用于校验）</summary>
    [HttpGet("blocked-tags/verify")]
    public async Task<IActionResult> VerifyBlockedTags()
    {
        try
        {
            var tags = await _svc.FetchMyTagsAsync();
            var local = EhentaiService.GetBlockedTags();
            return Ok(new ApiResponse<object>(true, new { ehentai = tags, local, ehentaiCount = tags.Count, localCount = local.Count }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    /// <summary>从 E-Hentai 同步隐藏标签到本地</summary>
    [HttpPost("blocked-tags/sync")]
    public async Task<IActionResult> SyncBlockedTags()
    {
        try
        {
            var synced = await _svc.SyncBlockedTagsFromEHAsync();
            return Ok(new ApiResponse<object>(true, new { synced, count = synced.Count, message = $"已从 E-Hentai 同步 {synced.Count} 个隐藏标签" }));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

    // ==================== 工具 ====================

    private static string Mask(string s)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= 4) return s;
        return s[..2] + new string('*', s.Length - 4) + s[^2..];
    }
}

public record CookieUpdateRequest(
    string IpbMemberId,
    string IpbPassHash,
    string? Igneous,
    string? Label);
public record TranslateRequest(List<string> Tags);
public record BlockedTagRequest(string? Tag);
