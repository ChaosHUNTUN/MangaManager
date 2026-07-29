using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MangaManager.Services;

/// <summary>E-Hentai 认证服务（Cookie 加载/保存/验证）</summary>
public class EhentaiAuthService
{
    private readonly ILogger<EhentaiAuthService> _logger;
    private readonly CookieContainer _cookieContainer;
    private readonly string _cookieFile;

    private EhentaiCookie _cookie = new();

    private const string HOST_E = "https://e-hentai.org";
    private const string HOST_EX = "https://exhentai.org";

    public EhentaiAuthService(IWebHostEnvironment env, ILogger<EhentaiAuthService> logger,
        [FromKeyedServices("EhentaiCookies")] CookieContainer cookieContainer)
    {
        _logger = logger;
        _cookieContainer = cookieContainer;
        _cookieFile = Path.Combine(env.ContentRootPath, "ehentai_cookies.json");
        Load();
        ApplyCookies();
    }

    #region Cookie 存取

    public EhentaiCookie GetCookie() => _cookie;

    public bool SetCookie(EhentaiCookie cookie)
    {
        _cookie = cookie;
        Save();
        ApplyCookies();
        return true;
    }

    public bool HasCookie() =>
        !string.IsNullOrWhiteSpace(_cookie.IpbMemberId) &&
        !string.IsNullOrWhiteSpace(_cookie.IpbPassHash);

    private void Load()
    {
        try { if (File.Exists(_cookieFile)) _cookie = JsonSerializer.Deserialize<EhentaiCookie>(File.ReadAllText(_cookieFile), EhentaiJsonOptions.Instance) ?? new(); }
        catch (Exception ex) { _logger.LogDebug(ex, "[Auth] LoadCookies failed, using empty cookie"); _cookie = new(); }
    }

    private void Save()
    {
        try { File.WriteAllText(_cookieFile, JsonSerializer.Serialize(_cookie, EhentaiJsonOptions.Instance)); }
        catch (Exception ex) { _logger.LogDebug(ex, "[Auth] SaveCookies failed"); }
    }

    private void ApplyCookies()
    {
        var cc = _cookieContainer;
        cc.Add(new Cookie("ipb_member_id", _cookie.IpbMemberId ?? "", "/", ".e-hentai.org") { Expires = DateTime.Now.AddYears(1) });
        cc.Add(new Cookie("ipb_pass_hash", _cookie.IpbPassHash ?? "", "/", ".e-hentai.org") { Expires = DateTime.Now.AddYears(1) });
        if (!string.IsNullOrWhiteSpace(_cookie.Igneous))
        {
            cc.Add(new Cookie("igneous", _cookie.Igneous, "/", ".e-hentai.org") { Expires = DateTime.Now.AddYears(1) });
            cc.Add(new Cookie("igneous", _cookie.Igneous, "/", ".exhentai.org") { Expires = DateTime.Now.AddYears(1) });
        }
        cc.Add(new Cookie("sl", "dm_2", "/", ".e-hentai.org") { Expires = DateTime.Now.AddYears(1) });
    }

    #endregion

    #region 登录验证

    /// <summary>验证 Cookie 是否有效（检测登录状态 + ExHentai 权限）</summary>
    public async Task<ValidateResult> ValidateAsync(IHttpClientFactory httpClientFactory)
    {
        if (!HasCookie()) return new(false, false, "未配置 Cookie。请在设置中填入 E-Hentai Cookie 信息。");
        var http = httpClientFactory.CreateClient("ehentai");
        try
        {
            var resp = await http.GetAsync($"{HOST_E}/?inline_set=dm_l");
            var html = await resp.Content.ReadAsStringAsync();
            bool loggedIn = html.Contains("home.php") || html.Contains("nbw");
            bool ex = false;
            try
            {
                var er = await http.GetAsync($"{HOST_EX}/?inline_set=dm_l");
                var eh = await er.Content.ReadAsStringAsync();
                if (eh.Contains("Your IP address has been temporarily banned"))
                    return new ValidateResult(loggedIn, false, "IP 被暂时封禁，请稍后重试或更换网络。");
                ex = !eh.Contains("This gallery is unavailable") && !eh.Contains("content warning");
            }
            catch (Exception ex2) { _logger.LogDebug(ex2, "[Auth] ExHentai check failed"); }

            if (!loggedIn)
                return new ValidateResult(false, false, "Cookie 无效或已过期。请重新登录 E-Hentai 并更新 Cookie。");

            return new ValidateResult(true, ex, null);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Auth] Validate failed");
            return new ValidateResult(false, false, $"网络错误: {ex.Message}");
        }
    }

    #endregion
}
