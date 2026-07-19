using Microsoft.AspNetCore.Mvc;
using MangaManager.Core.DTOs;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

/// <summary>
/// E-Hentai Cookie 管理 + 浏览/搜索 + 图片代理 + 搜索翻译
/// （标签翻译/屏蔽 → EhTagsController，本地文件/遗留下载 → EhLocalController）
/// </summary>
[ApiController]
[Route("api/ehentai")]
public class EhentaiController : ControllerBase
{
    private readonly EhentaiService _svc;

    public EhentaiController(EhentaiService svc) => _svc = svc;

    // ==================== Cookie ====================

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

    [HttpGet("connectivity")]
    public async Task<IActionResult> CheckConnectivity()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            
            bool eReachable = false;
            try { var r = await client.GetAsync("https://e-hentai.org/", cts.Token); eReachable = r.IsSuccessStatusCode; } catch { }
            
            bool exReachable = false;
            try { var r = await client.GetAsync("https://exhentai.org/", cts.Token); exReachable = r.IsSuccessStatusCode; } catch { }
            
            return Ok(new ApiResponse<object>(true, new { reachable = eReachable || exReachable, eReachable, exReachable }));
        }
        catch (TaskCanceledException)
        {
            return Ok(new ApiResponse<object>(true, new { reachable = false, hint = "连接超时" }));
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
            return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiResponse<object>(false, null, ex.Message));
        }
    }

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
        catch (TaskCanceledException) { return BadRequest(new ApiResponse<object>(false, null, "请求超时")); }
        catch (HttpRequestException ex) { return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}")); }
        catch (Exception ex) { return BadRequest(new ApiResponse<object>(false, null, ex.Message)); }
    }

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
        catch (TaskCanceledException) { return BadRequest(new ApiResponse<object>(false, null, "请求超时")); }
        catch (HttpRequestException ex) { return BadRequest(new ApiResponse<object>(false, null, $"网络错误: {ex.Message}")); }
        catch (Exception ex) { return BadRequest(new ApiResponse<object>(false, null, ex.Message)); }
    }

    // ==================== 图片代理 ====================

    [HttpGet("image")]
    public async Task<IActionResult> ProxyImage([FromQuery] string url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return BadRequest(new ApiResponse<object>(false, null, "缺少 url 参数"));
        try
        {
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
            var imgData = await _svc.FetchImageAsync(url);
            var contentType = imgData.Length > 3 && imgData[0] == 0xFF ? "image/jpeg" :
                              imgData.Length > 4 && imgData[0] == 0x89 ? "image/png" : "image/webp";
            Response.Headers["Cache-Control"] = "public, max-age=3600";
            return File(imgData, contentType);
        }
        catch (Exception ex) { return BadRequest(new ApiResponse<object>(false, null, ex.Message)); }
    }

    // ==================== 搜索翻译 + 页面代理 ====================

    [HttpGet("search/translate")]
    public IActionResult TranslateSearch([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new ApiResponse<object>(false, null, "缺少搜索词"));
        var result = EhentaiService.TranslateChineseSearch(q);
        return Ok(new ApiResponse<object>(true, new { original = q, translated = result }));
    }

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
        catch (Exception ex) { return BadRequest(new ApiResponse<object>(false, null, ex.Message)); }
    }

    // ==================== 工具 ====================

    private static string Mask(string s)
    {
        if (string.IsNullOrEmpty(s) || s.Length <= 4) return s;
        return s[..2] + new string('*', s.Length - 4) + s[^2..];
    }
}

public record CookieUpdateRequest(string IpbMemberId, string IpbPassHash, string? Igneous, string? Label);
public record TranslateRequest(List<string> Tags);
public record BlockedTagRequest(string? Tag);