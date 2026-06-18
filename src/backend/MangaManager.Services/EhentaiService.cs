using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Web;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MangaManager.Services;

/// <summary>
/// E-Hentai / ExHentai 网络源服务
/// 借鉴 EhViewer 的认证和 API 调用方式
/// </summary>
public class EhentaiService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly CookieContainer _cookieContainer;
    private readonly string _cookieFile;

    private EhentaiCookie _cookie = new();
    private static readonly JsonSerializerOptions _jsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private const string HOST_E = "https://e-hentai.org";
    private const string HOST_EX = "https://exhentai.org";
    private const string API_URL = "https://api.e-hentai.org/api.php";

    /// <summary>获取共享的 HttpClient（由 IHttpClientFactory 管理）</summary>
    private HttpClient _http => _httpClientFactory.CreateClient("ehentai");

    public EhentaiService(IHttpClientFactory httpClientFactory, IWebHostEnvironment env,
        [FromKeyedServices("EhentaiCookies")] CookieContainer cookieContainer)
    {
        _httpClientFactory = httpClientFactory;
        _cookieContainer = cookieContainer;
        _cookieFile = Path.Combine(env.ContentRootPath, "ehentai_cookies.json");
        LoadCookies();
        ApplyCookies();
    }

    // =========== Cookie ===========

    public EhentaiCookie GetCookie() => _cookie;

    public bool SetCookie(EhentaiCookie cookie)
    {
        _cookie = cookie;
        SaveCookies();
        ApplyCookies();
        return true;
    }

    public bool HasCookie() =>
        !string.IsNullOrWhiteSpace(_cookie.IpbMemberId) &&
        !string.IsNullOrWhiteSpace(_cookie.IpbPassHash);

    private void LoadCookies()
    {
        try { if (File.Exists(_cookieFile)) _cookie = JsonSerializer.Deserialize<EhentaiCookie>(File.ReadAllText(_cookieFile), _jsonOpts) ?? new(); }
        catch { _cookie = new(); }
    }

    private void SaveCookies()
    {
        try { File.WriteAllText(_cookieFile, JsonSerializer.Serialize(_cookie, _jsonOpts)); } catch { }
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

    // =========== 验证 ===========

    public async Task<ValidateResult> ValidateAsync()
    {
        if (!HasCookie()) return new(false, false, "未配置 Cookie。请在设置中填入 E-Hentai Cookie 信息。");
        try
        {
            var resp = await _http.GetAsync($"{HOST_E}/?inline_set=dm_l");
            var html = await resp.Content.ReadAsStringAsync();
            bool loggedIn = html.Contains("home.php") || html.Contains("nbw");
            bool ex = false;
            try
            {
                var er = await _http.GetAsync($"{HOST_EX}/?inline_set=dm_l");
                var eh = await er.Content.ReadAsStringAsync();
                if (eh.Contains("Your IP address has been temporarily banned")) return new(loggedIn, false, "IP 被暂时封禁，请稍后重试或更换网络。");
                ex = !eh.Contains("This gallery is unavailable") && !eh.Contains("content warning");
            }
            catch { }
            if (!loggedIn) return new(false, false, "Cookie 已失效，请重新获取。");
            return new(loggedIn, ex, ex ? null : "里站权限未开通(igneous 不正确)。");
        }
        catch (Exception ex) { return new(false, false, $"网络错误: {ex.Message}"); }
    }

    // =========== 浏览/搜索 ===========

    public async Task<GalleryListResult> GetGalleriesAsync(string? search = null, int page = 0, bool exhentai = false, string? nextCursor = null,
        int categoryMask = 0, int? minRating = null, int? pageFrom = null, int? pageTo = null, int? advSearch = null,
        bool popular = false)
    {
        var host = exhentai ? HOST_EX : HOST_E;
        string url;
        if (popular)
        {
            // 热门页面
            url = $"{host}/popular";
            if (!string.IsNullOrWhiteSpace(nextCursor))
                url += $"?next={nextCursor}";
        }
        else
        {
            var ub = new UriBuilder(host) { Path = "/" };
            var q = System.Web.HttpUtility.ParseQueryString("");
            q["inline_set"] = "dm_l";
            if (!string.IsNullOrWhiteSpace(search))
                q["f_search"] = search;
            if (!string.IsNullOrWhiteSpace(nextCursor))
                q["next"] = nextCursor;

        // 分类筛选：f_cats 使用排除法（位取反）
        if (categoryMask != 0 && categoryMask != 0x3ff) // 0x3ff = ALL_CATEGORY
            q["f_cats"] = ((~categoryMask) & 0x3ff).ToString();

        // 高级搜索
        if (advSearch.HasValue && advSearch.Value > 0)
        {
            q["advsearch"] = "1";
            if ((advSearch.Value & 0x1) != 0) q["f_sname"] = "on";   // 搜索名称
            if ((advSearch.Value & 0x2) != 0) q["f_stags"] = "on";   // 搜索标签
            if ((advSearch.Value & 0x4) != 0) q["f_sdesc"] = "on";   // 搜索描述
            if ((advSearch.Value & 0x8) != 0) q["f_storr"] = "on";   // 搜索种子名
            if ((advSearch.Value & 0x10) != 0) q["f_sto"] = "on";    // 仅有种子的
            if ((advSearch.Value & 0x20) != 0) q["f_sdt1"] = "on";   // 搜索低权重标签
            if ((advSearch.Value & 0x40) != 0) q["f_sdt2"] = "on";   // 搜索被踩标签
            if ((advSearch.Value & 0x80) != 0) q["f_sh"] = "on";     // 显示已删除
            if ((advSearch.Value & 0x100) != 0) q["f_sfl"] = "on";   // 禁用语言过滤
            if ((advSearch.Value & 0x200) != 0) q["f_sfu"] = "on";   // 禁用上传者过滤
            if ((advSearch.Value & 0x400) != 0) q["f_sft"] = "on";   // 禁用标签过滤
        }

        // 最低评分
        if (minRating.HasValue && minRating.Value >= 2 && minRating.Value <= 5)
        {
            q["f_sr"] = "on";
            q["f_srdd"] = minRating.Value.ToString();
        }

        // 页数范围
        if (pageFrom.HasValue || pageTo.HasValue)
        {
            q["f_sp"] = "on";
            if (pageFrom.HasValue) q["f_spf"] = pageFrom.Value.ToString();
            if (pageTo.HasValue) q["f_spt"] = pageTo.Value.ToString();
        }

        ub.Query = q.ToString();
        url = ub.ToString();
        }

        var resp = await _http.GetAsync(url);
        var html = await resp.Content.ReadAsStringAsync();
        var result = ParseList(html, host, page);
        result.IsExhentai = exhentai;
        return result;
    }

    private GalleryListResult ParseList(string html, string host, int page)
    {
        var r = new GalleryListResult { Page = page, Galleries = new() };

        // 提取 next=GID 游标（主页和搜索都使用这种分页）
        var nextMatch = Regex.Match(html, @"nexturl\s*=\s*""[^""]*next=(\d+)""");
        if (nextMatch.Success) r.NextCursor = nextMatch.Groups[1].Value;

        // 找画廊详情链接
        var linkRegex = new Regex(
            @"<a\s+href=""(?<url>https?://[^/]+/g/(?<gid>\d+)/(?<token>[a-f0-9]{10})/)""",
            RegexOptions.IgnoreCase);

        var linkMatches = linkRegex.Matches(html);
        if (linkMatches.Count == 0) return r;

        foreach (Match link in linkMatches)
        {
            var gid = int.Parse(link.Groups["gid"].Value);
            var token = link.Groups["token"].Value;

            // EhViewer 策略：找到包含此链接的 <tr> 行（gtr0/gtr1），在该行内精确查找缩略图
            // 从链接位置往前找最近的 <tr class="gtr0|gtr1">，往后找 </tr>
            var trStart = html.LastIndexOf("<tr", link.Index, StringComparison.OrdinalIgnoreCase);
            var trEnd = html.IndexOf("</tr>", link.Index + link.Length, StringComparison.OrdinalIgnoreCase);
            if (trStart < 0 || trEnd < 0)
            {
                trStart = Math.Max(0, link.Index - 3000);
                trEnd = Math.Min(html.Length, link.Index + 3000);
            }
            var ctx = html[trStart..(trEnd + 5)];

            // 缩略图：在行内查找 class="glthumb" 内的 img（EhViewer 精确策略）
            var thumbMatch = Regex.Match(ctx,
                @"class=""glthumb""[^>]*>.*?<img[^>]*(?:data-src|src)=""(?<thumb>[^""]+)""",
                RegexOptions.Singleline | RegexOptions.IgnoreCase);

            // 备用：行内任意 ehgt.org 或 exhentai.org/t/ 图片
            if (!thumbMatch.Success)
            {
                thumbMatch = Regex.Match(ctx,
                    @"<img[^>]*(?:data-src|src)=""(?<thumb>(?:https?:)?(?://)?(?:ehgt\.org|exhentai\.org/t/)[^""]+)""",
                    RegexOptions.IgnoreCase);
            }

            // 标题
            var titleMatch = Regex.Match(ctx,
                @"<div\s+class=""glink""[^>]*>(?<title>.+?)</div>",
                RegexOptions.Singleline | RegexOptions.IgnoreCase);
            var title = titleMatch.Success
                ? HttpUtility.HtmlDecode(Regex.Replace(titleMatch.Groups["title"].Value, @"<[^>]+>", "").Trim())
                : $"#{gid}";

            string? thumbUrl = null;
            if (thumbMatch.Success)
                thumbUrl = FixThumbUrl(thumbMatch.Groups["thumb"].Value, host);

            // 页数：class="gpc" 或 "Page X" 文本
            int fileCount = 0;
            var pageMatch = Regex.Match(ctx, @"(\d+)\s*pages?", RegexOptions.IgnoreCase);
            if (!pageMatch.Success)
                pageMatch = Regex.Match(ctx, @"class=""gpc""[^>]*>\s*(\d+)", RegexOptions.IgnoreCase);
            if (pageMatch.Success) int.TryParse(pageMatch.Groups[1].Value, out fileCount);

            // 评分：class="ir" 的 style 中 background-position 的 X 偏移
            // E-Hentai 星星背景图: 每颗星 16px 宽，5星 = 80px
            double rating = 0;
            // 先尝试提取整个 style 属性内容
            var irDiv = Regex.Match(ctx, @"class=""ir""[^>]*style=""([^""]+)""", RegexOptions.IgnoreCase);
            if (irDiv.Success)
            {
                var style = irDiv.Groups[1].Value;
                // background-position: -XXpx -1px
                var bpMatch = Regex.Match(style, @"background-position\s*:\s*(-?\d+)px\s+(-?\d+)px", RegexOptions.IgnoreCase);
                if (bpMatch.Success && int.TryParse(bpMatch.Groups[1].Value, out int xPx))
                {
                    rating = Math.Round(Math.Max(0, Math.Min(5, 5.0 + xPx / 16.0)), 1);
                }
                else
                {
                    // 备用：width:XXpx 模式
                    var wMatch = Regex.Match(style, @"width\s*:\s*(\d+)px", RegexOptions.IgnoreCase);
                    if (wMatch.Success && int.TryParse(wMatch.Groups[1].Value, out int w))
                        rating = Math.Round(Math.Max(0, Math.Min(5, w / 16.0)), 1);
                }
            }

            // 分类
            var catMatch = Regex.Match(ctx, @"class=""(?:cs|cn|ce|cr|ct|cy)""[^>]*>([^<]+)<", RegexOptions.IgnoreCase);
            var category = catMatch.Success ? catMatch.Groups[1].Value.Trim() : null;

            r.Galleries.Add(new GalleryItem
            {
                Gid = gid, Token = token, Title = title, ThumbUrl = thumbUrl,
                FileCount = fileCount, Rating = rating, Category = category,
                IsExhentai = host == HOST_EX
            });
        }

        return r;
    }

    /// <summary>
    /// 借鉴 EhViewer EhUrl.getFixedPreviewThumbUrl 逻辑
    /// </summary>
    private static string FixThumbUrl(string url, string host)
    {
        if (string.IsNullOrWhiteSpace(url)) return url;

        // 补全协议
        if (url.StartsWith("//"))
            url = "https:" + url;

        // exhentai.org/t/ → ehgt.org/ (CDN)
        if (url.Contains("exhentai.org/t/"))
        {
            url = url.Replace("https://exhentai.org/t/", "https://ehgt.org/");
        }
        else if (url.StartsWith("/") && !url.StartsWith("//"))
        {
            url = host.TrimEnd('/') + url;
        }

        return url;
    }

    // =========== 详情解析辅助方法 ===========

    /// <summary>从 API 返回的 tags（namespace:tag 格式）构造 TagGroup 列表</summary>
    private static List<TagGroup> BuildTagGroups(List<string>? tags)
    {
        var groups = new List<TagGroup>();
        if (tags == null || tags.Count == 0) return groups;

        var dict = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in tags)
        {
            var colon = t.IndexOf(':');
            if (colon > 0)
            {
                var ns = t[..colon].Trim();
                var tag = t[(colon + 1)..].Trim();
                if (!string.IsNullOrEmpty(tag))
                {
                    if (!dict.ContainsKey(ns)) dict[ns] = new();
                    dict[ns].Add(tag);
                }
            }
            else
            {
                if (!dict.ContainsKey("other")) dict["other"] = new();
                dict["other"].Add(t.Trim());
            }
        }
        foreach (var kv in dict)
            groups.Add(new TagGroup { Namespace = kv.Key, Tags = kv.Value });
        return groups;
    }

    /// <summary>从 HTML #gdd 表格提取指定 key 的值</summary>
    private static string? ExtractDetailField(string html, string key)
    {
        var match = Regex.Match(html, $@"<td[^>]*class=""gdt1""[^>]*>{key}:</td>\s*<td[^>]*class=""gdt2""[^>]*>(.+?)</td>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        var value = System.Web.HttpUtility.HtmlDecode(Regex.Replace(match.Groups[1].Value, @"<[^>]+>", "").Trim());
        // 清理 &nbsp; (\xa0) 等空白字符
        value = Regex.Replace(value, @"[\u00a0\u2000-\u200f\u202f\u205f\u3000]", " ").Trim();
        return string.IsNullOrEmpty(value) ? null : value;
    }

    /// <summary>从 HTML 提取 Parent 链接</summary>
    private static string? ExtractDetailParent(string html)
    {
        var match = Regex.Match(html, @"Parent:</td>\s*<td[^>]*class=""gdt2""[^>]*>.*?href=""([^""]+)""", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    /// <summary>从 HTML 解析标签分组</summary>
    private static List<TagGroup> ParseTagGroupsFromHtml(string html)
    {
        var tagGroups = new List<TagGroup>();
        var tagListMatch = Regex.Match(html, @"<div[^>]*id=""taglist""[^>]*>(.+?)</div>", RegexOptions.Singleline);
        if (!tagListMatch.Success) return tagGroups;
        var tagBlock = tagListMatch.Groups[1].Value;
        var trMatches = Regex.Matches(tagBlock, @"<tr[^>]*>(.+?)</tr>", RegexOptions.Singleline);
        foreach (Match tr in trMatches)
        {
            var row = tr.Groups[1].Value;
            var nsMatch = Regex.Match(row, @"<td[^>]*>(.+?):</td>", RegexOptions.Singleline);
            var nsName = nsMatch.Success ? Regex.Replace(nsMatch.Groups[1].Value, @"<[^>]+>", "").Trim() : "other";
            var groupTags = new List<string>();
            var aMatches = Regex.Matches(row, @"<a[^>]*>(.+?)</a>", RegexOptions.Singleline);
            foreach (Match a in aMatches)
            {
                var t = System.Web.HttpUtility.HtmlDecode(Regex.Replace(a.Groups[1].Value, @"<[^>]+>", "").Trim());
                if (!string.IsNullOrWhiteSpace(t)) groupTags.Add(t);
            }
            if (groupTags.Count > 0)
                tagGroups.Add(new TagGroup { Namespace = nsName, Tags = groupTags });
        }
        return tagGroups;
    }

    // =========== 画廊详情 ===========

    public async Task<GalleryDetail> GetGalleryDetailAsync(int gid, string token)
    {
        // 第1步：先尝试表站，如果不可用则尝试里站
        var host = HOST_E; // 表站优先
        var htmlUrl = $"{host}/g/{gid}/{token}/";
        string? apiUid = null, apiKey = null;
        bool isExhentai = false;

        try
        {
            var htmlResp = await _http.GetAsync(htmlUrl);
            var html = await htmlResp.Content.ReadAsStringAsync();

            // 如果表站返回 "This gallery is unavailable"，尝试里站
            if (html.Contains("This gallery is unavailable") || html.Contains("Gallery Not Available"))
            {
                host = HOST_EX;
                htmlUrl = $"{host}/g/{gid}/{token}/";
                htmlResp = await _http.GetAsync(htmlUrl);
                html = await htmlResp.Content.ReadAsStringAsync();
                isExhentai = true;
            }

            // 提取 apiuid 和 apikey
            var uidMatch = Regex.Match(html, @"var\s+apiuid\s*=\s*(\d+)");
            var keyMatch = Regex.Match(html, @"var\s+apikey\s*=\s*""([^""]+)""");
            if (uidMatch.Success) apiUid = uidMatch.Groups[1].Value;
            if (keyMatch.Success) apiKey = keyMatch.Groups[1].Value;
        }
        catch { /* HTML 获取失败，尝试直接用 API */ }

        // 第2步：用 apiuid/apikey 调用 JSON API
        if (!string.IsNullOrEmpty(apiUid) && !string.IsNullOrEmpty(apiKey))
        {
            var payload = new
            {
                method = "gdata",
                gidlist = new[] { new object[] { gid, token } },
                @namespace = 1
            };
            // 添加 apiuid/apikey 到请求（E-Hentai API 通过 URL 参数或请求头传递）
            var apiUrlWithAuth = $"{API_URL}?apiuid={apiUid}&apikey={apiKey}";
            var body = await PostJson(apiUrlWithAuth, payload);
            var r = JsonSerializer.Deserialize<GdataResponse>(body, _jsonOpts);

            if (r?.Gmetadata != null && r.Gmetadata.Count > 0 &&
                !(r.Gmetadata[0].Title ?? "").Contains("error", StringComparison.OrdinalIgnoreCase))
            {
                var m = r.Gmetadata[0];
                if (m.Token == null) m.Token = token;

                // 从 API tags 构造 tagGroups（API 带 @namespace=1 时返回 namespace:tag 格式）
                var tagGroups = BuildTagGroups(m.Tags);

                // 尝试从 HTML 补充 language 等字段
                string? language = null; int ratingCount = 0; int favoriteCount = 0;
                int torrentCount = 0; string? parentGallery = null; string? visible = null;
                bool isFavorited = false; string? favoriteName = null;
                try
                {
                    var htmlResp2 = await _http.GetAsync(htmlUrl);
                    var html2 = await htmlResp2.Content.ReadAsStringAsync();
                    language = ExtractDetailField(html2, "Language");
                    visible = ExtractDetailField(html2, "Visible");
                    parentGallery = ExtractDetailParent(html2);
                    var rcMatch = Regex.Match(html2, @"id=""rating_count""[^>]*>(\d+)", RegexOptions.IgnoreCase);
                    if (rcMatch.Success) int.TryParse(rcMatch.Groups[1].Value, out ratingCount);
                    var fcMatch = Regex.Match(html2, @"Favorited:</td>.*?(\d+)", RegexOptions.Singleline | RegexOptions.IgnoreCase);
                    if (fcMatch.Success) int.TryParse(fcMatch.Groups[1].Value, out favoriteCount);
                    var favMatch = Regex.Match(html2, @"id=""gdf""[^>]*>([^<]+)", RegexOptions.IgnoreCase);
                    var favText = favMatch.Success ? favMatch.Groups[1].Value.Trim() : "";
                    isFavorited = !favText.Contains("Add to Favorites", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(favText);
                    if (isFavorited) favoriteName = favText;
                    var torMatch = Regex.Match(html2, @"Torrent Download\s*\((\d+)\)", RegexOptions.IgnoreCase);
                    if (torMatch.Success) int.TryParse(torMatch.Groups[1].Value, out torrentCount);
                    // 如果 API 没返回 tagGroups，从 HTML 补充
                    if (tagGroups.Count == 0)
                        tagGroups = ParseTagGroupsFromHtml(html2);
                }
                catch { /* HTML 补充失败不影响主流程 */ }

                return new GalleryDetail
                {
                    Gid = m.Gid, Token = m.Token ?? token,
                    Title = m.Title ?? "未知", TitleJpn = m.TitleJpn,
                    Category = m.Category ?? "other", Uploader = m.Uploader ?? "未知",
                    Posted = m.PostedLong, FileCount = m.FilecountInt,
                    FileSize = m.FilesizeLong, Rating = m.Rating ?? "0",
                    ThumbUrl = m.Thumb, Tags = m.Tags ?? new(),
                    TagGroups = tagGroups, Language = language,
                    RatingCount = ratingCount, FavoriteCount = favoriteCount,
                    IsFavorited = isFavorited, FavoriteName = favoriteName,
                    TorrentCount = torrentCount, ParentGallery = parentGallery, Visible = visible,
                    IsExhentai = isExhentai
                };
            }
        }

        // 第3步：回退到 HTML 解析（增强版：对标 EhViewer GalleryDetailParser）
        try
        {
            var htmlResp = await _http.GetAsync(htmlUrl);
            var html = await htmlResp.Content.ReadAsStringAsync();

            var titleMatch = Regex.Match(html, @"<h1[^>]*id=""gn""[^>]*>(.+?)</h1>", RegexOptions.Singleline);
            var title = titleMatch.Success ? HttpUtility.HtmlDecode(Regex.Replace(titleMatch.Groups[1].Value, @"<[^>]+>", "").Trim()) : $"Gallery #{gid}";

            var jpMatch = Regex.Match(html, @"<h1[^>]*id=""gj""[^>]*>(.+?)</h1>", RegexOptions.Singleline);
            var titleJpn = jpMatch.Success ? HttpUtility.HtmlDecode(Regex.Replace(jpMatch.Groups[1].Value, @"<[^>]+>", "").Trim()) : null;

            // 分类（从 #gdc 中提取）
            var catMatch = Regex.Match(html, @"<div[^>]*id=""gdc""[^>]*>(.+?)</div>", RegexOptions.Singleline);
            var category = catMatch.Success ? HttpUtility.HtmlDecode(Regex.Replace(catMatch.Groups[1].Value, @"<[^>]+>", "").Trim()) : "other";

            // 上传者（#gdn）
            var uploaderMatch = Regex.Match(html, @"<div[^>]*id=""gdn""[^>]*>.*?<a[^>]*>(.+?)</a>", RegexOptions.Singleline);
            var uploader = uploaderMatch.Success ? uploaderMatch.Groups[1].Value.Trim() : "未知";

            // 从 #gdd 表格中提取元数据
            long posted = 0; int fileCount = 0; long fileSize = 0;
            string? language = null; int ratingCount = 0; int favoriteCount = 0;
            string? parentGallery = null; string? visible = null;

            var gddBlock = Regex.Match(html, @"<div[^>]*id=""gdd""[^>]*>(.+?)</table>", RegexOptions.Singleline);
            if (gddBlock.Success)
            {
                var block = gddBlock.Groups[1].Value;
                // 解析每一行: <td class="gdt1">Key:</td><td class="gdt2">Value</td>
                var rows = Regex.Matches(block, @"<td[^>]*class=""gdt1""[^>]*>(.+?):</td>\s*<td[^>]*class=""gdt2""[^>]*>(.+?)</td>", RegexOptions.Singleline);
                foreach (Match row in rows)
                {
                    var key = Regex.Replace(row.Groups[1].Value, @"<[^>]+>", "").Trim().ToLower();
                    var value = HttpUtility.HtmlDecode(Regex.Replace(row.Groups[2].Value, @"<[^>]+>", "").Trim());
                    switch (key)
                    {
                        case "posted": if (DateTime.TryParse(value, out var dt)) posted = ((DateTimeOffset)dt).ToUnixTimeSeconds(); break;
                        case "language": language = value; break;
                        case "file size":
                            if (value.Contains("GB")) fileSize = (long)(double.Parse(value.Replace("GB", "").Trim()) * 1e9);
                            else if (value.Contains("MB")) fileSize = (long)(double.Parse(value.Replace("MB", "").Trim()) * 1e6);
                            else if (value.Contains("KB")) fileSize = (long)(double.Parse(value.Replace("KB", "").Trim()) * 1e3);
                            break;
                        case "length": int.TryParse(value.Replace("pages", "").Trim(), out fileCount); break;
                        case "favorited": if (int.TryParse(value.Split(' ')[0], out var fc)) favoriteCount = fc; break;
                        case "parent": var pl = Regex.Match(row.Groups[2].Value, @"href=""([^""]+)"""); if (pl.Success) parentGallery = pl.Groups[1].Value; break;
                        case "visible": visible = value; break;
                    }
                }
            }

            // 评分
            var ratingMatch = Regex.Match(html, @"id=""rating_label""[^>]*>([\d.]+)", RegexOptions.IgnoreCase);
            var rating = ratingMatch.Success ? ratingMatch.Groups[1].Value : "0";
            var rcMatch = Regex.Match(html, @"id=""rating_count""[^>]*>(\d+)", RegexOptions.IgnoreCase);
            if (rcMatch.Success) int.TryParse(rcMatch.Groups[1].Value, out ratingCount);

            // 收藏状态
            var favMatch = Regex.Match(html, @"id=""gdf""[^>]*>([^<]+)", RegexOptions.IgnoreCase);
            var favText = favMatch.Success ? favMatch.Groups[1].Value.Trim() : "";
            var isFavorited = !favText.Contains("Add to Favorites", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(favText);

            // 种子
            var torMatch = Regex.Match(html, @"Torrent Download\s*\((\d+)\)", RegexOptions.IgnoreCase);
            var torrentCount = torMatch.Success ? int.Parse(torMatch.Groups[1].Value) : 0;

            // 标签分组（EhViewer 策略：从 #taglist 中按 <tr> 分组）
            var tagGroups = new List<TagGroup>();
            var tags = new List<string>();
            var tagListMatch = Regex.Match(html, @"<div[^>]*id=""taglist""[^>]*>(.+?)</div>", RegexOptions.Singleline);
            if (tagListMatch.Success)
            {
                var tagBlock = tagListMatch.Groups[1].Value;
                var trMatches = Regex.Matches(tagBlock, @"<tr[^>]*>(.+?)</tr>", RegexOptions.Singleline);
                foreach (Match tr in trMatches)
                {
                    var row = tr.Groups[1].Value;
                    var nsMatch = Regex.Match(row, @"<td[^>]*>(.+?):</td>", RegexOptions.Singleline);
                    var nsName = nsMatch.Success ? Regex.Replace(nsMatch.Groups[1].Value, @"<[^>]+>", "").Trim() : "other";

                    var groupTags = new List<string>();
                    var aMatches = Regex.Matches(row, @"<a[^>]*>(.+?)</a>", RegexOptions.Singleline);
                    foreach (Match a in aMatches)
                    {
                        var t = HttpUtility.HtmlDecode(Regex.Replace(a.Groups[1].Value, @"<[^>]+>", "").Trim());
                        if (!string.IsNullOrWhiteSpace(t))
                        {
                            groupTags.Add(t);
                            tags.Add(t);
                        }
                    }
                    if (groupTags.Count > 0)
                        tagGroups.Add(new TagGroup { Namespace = nsName, Tags = groupTags });
                }
            }

            // 缩略图
            var thumbMatch = Regex.Match(html, @"<div[^>]*id=""gd1""[^>]*>.*?url\(([^)]+)\)", RegexOptions.Singleline);
            var thumb = thumbMatch.Success ? thumbMatch.Groups[1].Value.Trim() : null;

            return new GalleryDetail
            {
                Gid = gid, Token = token, Title = title, TitleJpn = titleJpn,
                Category = category, Uploader = uploader, Posted = posted,
                FileCount = fileCount, FileSize = fileSize, Rating = rating,
                ThumbUrl = thumb, Tags = tags, TagGroups = tagGroups,
                Language = language, RatingCount = ratingCount, FavoriteCount = favoriteCount,
                IsFavorited = isFavorited, FavoriteName = isFavorited ? favText : null,
                TorrentCount = torrentCount, ParentGallery = parentGallery, Visible = visible,
                IsExhentai = isExhentai
            };
        }
        catch (Exception ex)
        {
            throw new Exception($"获取画廊详情失败: {ex.Message}");
        }
    }

    // =========== 图片页 ===========

    public async Task<PageResult> GetPagesAsync(int gid, string token)
    {
        var pages = new List<PageItem>();

        // 对标 EhViewer GalleryDetailParser 的正则：
        // PATTERN_PAGES: Length: X pages
        var totalPagesRegex = new Regex(@"Length:</td><td[^>]*>([\d,]+) pages</td>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);

        // 缩略图链接正则（多种格式，对标 EhViewer 的多模式匹配）
        // 模式1: <a href="/s/xxx/gid-page"><div title="Page N:...">
        var previewRegex1 = new Regex(
            @"<a\s+href=""([^""]*?/s/[0-9a-f]{10}/\d+-\d+)""[^>]*>.*?<div[^>]*title=""Page\s+(\d+):",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        // 模式2: 更宽松的 /s/ 链接匹配（兜底）
        var previewRegex2 = new Regex(
            @"href=""(?:https?://[^/]+)?(/s/([0-9a-f]{10})/(\d+)-(\d+))""",
            RegexOptions.IgnoreCase);

        try
        {
            // 第1步：请求 p=0，解析总页数和第一页缩略图
            var (firstHtml, _) = await GetGalleryPageHtmlAsync(gid, token, 0);

            // 解析总页数
            int totalImages = 0;
            var totalMatch = totalPagesRegex.Match(firstHtml);
            if (totalMatch.Success)
            {
                var numStr = totalMatch.Groups[1].Value.Replace(",", "");
                int.TryParse(numStr, out totalImages);
                Console.WriteLine($"[EH] Total pages from 'Length': {totalImages}");
            }

            if (totalImages <= 0)
            {
                // 备用：尝试 "Showing X-Y of Z"
                var showingRegex = new Regex(@"Showing\s+\d+-\d+\s+of\s+([\d,]+)",
                    RegexOptions.IgnoreCase);
                var sm = showingRegex.Match(firstHtml);
                if (sm.Success)
                {
                    var numStr = sm.Groups[1].Value.Replace(",", "");
                    int.TryParse(numStr, out totalImages);
                    Console.WriteLine($"[EH] Total pages from 'Showing': {totalImages}");
                }
            }

            // 解析第一页缩略图
            var firstPageMatches = ParsePreviewMatches(firstHtml);
            Console.WriteLine($"[EH] p=0 found {firstPageMatches.Count} preview URLs");
            pages.AddRange(firstPageMatches);

            // 计算每页缩略图数量（动态计算，因为用户可能设置了20/40张）
            int previewPerPage = firstPageMatches.Count > 0 ? firstPageMatches.Count : 40;
            Console.WriteLine($"[EH] previewPerPage = {previewPerPage}");

            // 如果总页数未知，尝试从分页导航中推断
            if (totalImages <= 0)
            {
                // 从 HTML 中提取分页链接的最大页码
                var pageLinkRegex = new Regex(@"\?p=(\d+)", RegexOptions.IgnoreCase);
                var plMatches = pageLinkRegex.Matches(firstHtml);
                int maxPageIdx = 0;
                foreach (Match pm in plMatches)
                {
                    if (int.TryParse(pm.Groups[1].Value, out var pn) && pn > maxPageIdx)
                        maxPageIdx = pn;
                }
                if (maxPageIdx > 0)
                {
                    totalImages = (maxPageIdx + 1) * previewPerPage;
                    Console.WriteLine($"[EH] Estimated total from page nav: {totalImages} (maxPageIdx={maxPageIdx})");
                }
            }

            // 如果还是不知道总页数，至少也要根据已获取的页数和当前页码判断
            // 关键修复：用 totalImages 和 previewPerPage 计算需要多少页
            if (totalImages > 0 && previewPerPage > 0)
            {
                int totalPreviewPages = (totalImages + previewPerPage - 1) / previewPerPage;
                Console.WriteLine($"[EH] Need to fetch {totalPreviewPages} preview pages total");

                for (int p = 1; p < totalPreviewPages; p++)
                {
                    try
                    {
                        Console.WriteLine($"[EH] Fetching preview page p={p}...");
                        var (pageHtml, _) = await GetGalleryPageHtmlAsync(gid, token, p);
                        var pageMatches = ParsePreviewMatches(pageHtml);
                        Console.WriteLine($"[EH] p={p} found {pageMatches.Count} preview URLs");
                        pages.AddRange(pageMatches);
                        await Task.Delay(300);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[EH] GetPages p={p} error: {ex.Message}");
                    }
                }
            }
            else
            {
                // 兜底：如果总页数未知，持续遍历直到没有新图片
                Console.WriteLine($"[EH] Unknown total, iterating until empty...");
                int p = 1;
                while (true)
                {
                    try
                    {
                        var (pageHtml, _) = await GetGalleryPageHtmlAsync(gid, token, p);
                        var pageMatches = ParsePreviewMatches(pageHtml);
                        Console.WriteLine($"[EH] p={p} found {pageMatches.Count} preview URLs");
                        if (pageMatches.Count == 0) break;
                        pages.AddRange(pageMatches);
                        p++;
                        await Task.Delay(300);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[EH] GetPages p={p} error: {ex.Message}");
                        break;
                    }
                }
            }

            pages = pages.GroupBy(p => p.Index).Select(g => g.First())
                         .OrderBy(p => p.Index).ToList();
        }
        catch (Exception ex) { Console.WriteLine($"[EH] GetPages error: {ex.Message}"); }

        Console.WriteLine($"[EH] Total pages: {pages.Count}");
        return new PageResult(pages, "", "");
    }

    /// <summary>从 HTML 中解析缩略图链接，对标 EhViewer 多模式匹配</summary>
    private List<PageItem> ParsePreviewMatches(string html)
    {
        var result = new List<PageItem>();

        // 模式1：标准 <a href="/s/xxx/gid-page"><div title="Page N:..."> 格式
        var regex1 = new Regex(
            @"<a\s+href=""([^""]*?/s/[0-9a-f]{10}/\d+-\d+)""[^>]*?>.*?<div[^>]*?title=""Page\s+(\d+):",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var matches1 = regex1.Matches(html);

        if (matches1.Count > 0)
        {
            foreach (Match m in matches1)
            {
                var pagePath = m.Groups[1].Value;
                // 确保路径以 / 开头
                if (!pagePath.StartsWith("/") && !pagePath.StartsWith("http"))
                    pagePath = "/" + pagePath;
                // 去掉可能的完整 URL 前缀
                if (pagePath.StartsWith("http"))
                {
                    var uri = new Uri(pagePath);
                    pagePath = uri.AbsolutePath;
                }
                var pageNum = int.Parse(m.Groups[2].Value);
                result.Add(new PageItem
                {
                    Index = pageNum,
                    ImageUrl = pagePath,
                    Width = 0, Height = 0, FileSize = 0
                });
            }
        }
        else
        {
            // 模式2：宽松的 /s/ 链接匹配（兜底）
            var regex2 = new Regex(
                @"href=""(?:https?://[^/]+)?(/s/([0-9a-f]{10})/(\d+)-(\d+))""",
                RegexOptions.IgnoreCase);
            var matches2 = regex2.Matches(html);
            foreach (Match m in matches2)
            {
                var pagePath = m.Groups[1].Value;
                var pageNum = int.Parse(m.Groups[4].Value);
                result.Add(new PageItem
                {
                    Index = pageNum,
                    ImageUrl = pagePath,
                    Width = 0, Height = 0, FileSize = 0
                });
            }
        }

        return result;
    }

    /// <summary>从 /s/ 页面提取实际图片 URL 并返回图片数据（对标 EhViewer SpiderWorker.downloadImage）</summary>
    public async Task<(byte[]? Data, string ContentType)> FetchImageFromPageAsync(string pagePath)
    {
        var fullUrl = pagePath.StartsWith("http") ? pagePath : $"{HOST_E}{pagePath}";

        // 第1步：GET /s/ 页面，提取 <img id="img" src="...">
        // EhViewer 策略：Referer 指向画廊详情页
        using var pageReq = new HttpRequestMessage(HttpMethod.Get, fullUrl);
        pageReq.Headers.Add("Referer", $"{HOST_E}/");
        var pageResp = await _http.SendAsync(pageReq);
        var html = await pageResp.Content.ReadAsStringAsync();
        var imgMatch = Regex.Match(html, @"<img[^>]*id=""img""[^>]*src=""([^""]+)""", RegexOptions.IgnoreCase);
        if (!imgMatch.Success)
        {
            imgMatch = Regex.Match(html, @"<img[^>]*src=""(https?://[^""]+\.(?:jpg|png|webp))""", RegexOptions.IgnoreCase);
        }
        if (!imgMatch.Success)
            return (null, "");

        var imgUrl = imgMatch.Groups[1].Value;

        // 第2步：下载图片（Referer 指向 /s/ 页面本身，对标 EhViewer）
        using var imgReq = new HttpRequestMessage(HttpMethod.Get, imgUrl);
        imgReq.Headers.Add("Referer", fullUrl);
        var imgResp = await _http.SendAsync(imgReq);
        imgResp.EnsureSuccessStatusCode();
        var data = await imgResp.Content.ReadAsByteArrayAsync();

        var ct = data.Length > 3 && data[0] == 0xFF && data[1] == 0xD8 ? "image/jpeg" :
                 data.Length > 4 && data[0] == 0x89 && data[1] == 0x50 ? "image/png" :
                 "image/webp";

        return (data, ct);
    }

    /// <summary>代理 E-Hentai 详情 HTML 页面</summary>
    public async Task<(string Html, string ContentType)> GetGalleryPageHtmlAsync(int gid, string token, int pageIdx = 0)
    {
        var url = $"{HOST_E}/g/{gid}/{token}/?p={pageIdx}";
        var resp = await _http.GetAsync(url);
        var html = await resp.Content.ReadAsStringAsync();
        return (html, "text/html; charset=utf-8");
    }

    private async Task<string> PostJson(string url, object payload)
    {
        var json = JsonSerializer.Serialize(payload, _jsonOpts);
        Console.WriteLine($"[EH] POST {url} body={json[..Math.Min(200, json.Length)]}");
        var content = new StringContent(json, Encoding.UTF8, "application/json");
        var resp = await _http.PostAsync(url, content);
        var body = await resp.Content.ReadAsStringAsync();
        Console.WriteLine($"[EH] RESP {resp.StatusCode}: {body[..Math.Min(300, body.Length)]}");
        resp.EnsureSuccessStatusCode();
        return body;
    }

    // =========== 图片代理 & 下载 & 搜索翻译 ===========

    /// <summary>从 /s/{pToken}/{gid}-{page} 页面提取实际图片 URL</summary>
    public async Task<(string? ImageUrl, string? ShowKey)> GetImageFromPageAsync(string pageUrl)
    {
        var fullUrl = pageUrl.StartsWith("http") ? pageUrl : $"{HOST_E}{pageUrl}";
        var resp = await _http.GetAsync(fullUrl);
        var html = await resp.Content.ReadAsStringAsync();

        // EhViewer GalleryPageParser：<img id="img" src="...">
        var imgMatch = Regex.Match(html, @"<img[^>]*id=""img""[^>]*src=""([^""]+)""", RegexOptions.IgnoreCase);
        if (!imgMatch.Success)
            imgMatch = Regex.Match(html, @"<img[^>]*src=""(https?://[^""]+\.(?:jpg|png|webp))""", RegexOptions.IgnoreCase);

        // EhViewer GalleryPageParser：var showkey="..."
        var skMatch = Regex.Match(html, @"var showkey=""([0-9a-z]+)""");

        return (imgMatch.Success ? imgMatch.Groups[1].Value : null,
                skMatch.Success ? skMatch.Groups[1].Value : null);
    }

    /// <summary>代理获取 E-Hentai 图片（绕过 referrer 限制）</summary>
    public async Task<byte[]> FetchImageAsync(string url)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Add("Referer", "https://e-hentai.org/");
        req.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        var resp = await _http.SendAsync(req);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsByteArrayAsync();
    }

    // 默认下载目录
    public static readonly string DefaultDownloadDir = @"G:\学习资料\本子";

    /// <summary>获取画廊本地目录路径（{下载目录}/{gid}-{标题}/）</summary>
    public static string GetGalleryLocalDir(int gid, string title)
    {
        return Path.Combine(DefaultDownloadDir, $"{gid}-{SanitizeFileName(title)}");
    }

    /// <summary>检查画廊是否已下载（目录存在且有图片文件）</summary>
    public static bool IsGalleryDownloaded(int gid, string title)
    {
        var dir = GetGalleryLocalDir(gid, title);
        if (!Directory.Exists(dir)) return false;
        var files = Directory.GetFiles(dir, "*.jpg")
            .Concat(Directory.GetFiles(dir, "*.png"))
            .Concat(Directory.GetFiles(dir, "*.webp"))
            .Concat(Directory.GetFiles(dir, "*.gif"))
            .ToList();
        return files.Count > 0;
    }

    /// <summary>获取本地画廊的图片路径列表（已排序）</summary>
    public static List<string> GetLocalGalleryPages(int gid, string title)
    {
        var dir = GetGalleryLocalDir(gid, title);
        if (!Directory.Exists(dir)) return new();
        var files = Directory.GetFiles(dir)
            .Where(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                     || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                     || f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                     || f.EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f)
            .ToList();
        return files;
    }

    /// <summary>下载画廊到本地目录（持久化，支持断点续传）</summary>
    public async Task DownloadGalleryAsync(int gid, string token, string? title)
    {
        var detail = await GetGalleryDetailAsync(gid, token);
        var downloadDir = GetGalleryLocalDir(gid, detail.Title);
        Directory.CreateDirectory(downloadDir);

        var progressFile = Path.Combine(downloadDir, ".progress");
        int startFrom = 0;

        // 检查是否有未完成的下载
        if (File.Exists(progressFile))
        {
            var lines = await File.ReadAllLinesAsync(progressFile);
            if (lines.Length > 0 && int.TryParse(lines[0], out var saved))
                startFrom = saved;
            Console.WriteLine($"[EH] 从第 {startFrom + 1} 页继续下载 {detail.Title}");
        }

        var pages = await GetPagesAsync(gid, token);
        Console.WriteLine($"[EH] 开始下载 {detail.Title} ({pages.Pages.Count} 页)");

        int success = 0, failed = 0;
        for (int i = startFrom; i < pages.Pages.Count; i++)
        {
            var p = pages.Pages[i];
            // p.ImageUrl 是 /s/ 路径，需要通过 FetchImageFromPageAsync 获取真实图片 URL
            byte[]? imageData = null;

            // 重试最多 3 次（对标 EhViewer 的重试逻辑）
            for (int retry = 0; retry < 3; retry++)
            {
                try
                {
                    if (p.ImageUrl.Contains("/s/"))
                    {
                        // 从 /s/ 页面解析真实图片 URL 并下载
                        var (data, _) = await FetchImageFromPageAsync(p.ImageUrl);
                        if (data != null) { imageData = data; break; }
                    }
                    else
                    {
                        // 直接图片 URL：带 Referer 下载
                        using var req = new HttpRequestMessage(HttpMethod.Get, p.ImageUrl);
                        req.Headers.Add("Referer", "https://e-hentai.org/");
                        var resp = await _http.SendAsync(req);
                        resp.EnsureSuccessStatusCode();
                        imageData = await resp.Content.ReadAsByteArrayAsync();
                        break;
                    }
                }
                catch (Exception ex)
                {
                    if (retry < 2)
                    {
                        Console.WriteLine($"[EH] 第 {i + 1} 页重试 {retry + 1}: {ex.Message}");
                        await Task.Delay(1000 * (retry + 1)); // 递增延迟
                    }
                    else
                    {
                        Console.WriteLine($"[EH] 第 {i + 1} 页下载失败: {ex.Message}");
                    }
                }
            }

            if (imageData != null && imageData.Length > 0)
            {
                var ext = ".jpg";
                // 检测实际格式
                if (imageData.Length > 3 && imageData[0] == 0xFF && imageData[1] == 0xD8) ext = ".jpg";
                else if (imageData.Length > 4 && imageData[0] == 0x89 && imageData[1] == 0x50) ext = ".png";
                else if (imageData.Length > 4 && imageData[0] == 0x52 && imageData[1] == 0x49) ext = ".webp";
                else if (imageData.Length > 3 && imageData[0] == 0x47 && imageData[1] == 0x49) ext = ".gif";

                var filePath = Path.Combine(downloadDir, $"{i + 1:D4}{ext}");
                await File.WriteAllBytesAsync(filePath, imageData);
                success++;

                // 更新进度文件（断点续传）
                try { await File.WriteAllTextAsync(progressFile, (i + 1).ToString()); } catch { }

                // 下载间隔（对标 EhViewer downloadDelay）
                if (i < pages.Pages.Count - 1)
                    await Task.Delay(500);
            }
            else
            {
                failed++;
            }
        }

        Console.WriteLine($"[EH] 下载完成: {success} 成功, {failed} 失败");

        // 清理进度文件
        try { if (File.Exists(progressFile)) File.Delete(progressFile); } catch { }

        // 保存元文件（gid, token 等，供本地画廊使用）
        try
        {
            var ehFile = Path.Combine(downloadDir, ".eh");
            await File.WriteAllLinesAsync(ehFile, new[] { $"gid={gid}", $"token={token}" });
        }
        catch { }
    }

    private static string SanitizeFileName(string name) =>
        string.Join("_", name.Split(Path.GetInvalidFileNameChars()));

    /// <summary>中文搜索词 → E-Hentai 标签语法</summary>
    public static string TranslateChineseSearch(string q)
    {
        // 简单映射常见中文搜索 → 英文标签
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["巨乳"] = "big breasts", ["贫乳"] = "small breasts",
            ["全彩"] = "full color", ["汉化"] = "chinese", ["中文"] = "chinese",
            ["无修"] = "uncensored", ["同人"] = "doujinshi",
            ["漫画"] = "manga", ["单行本"] = "tankoubon",
            ["萝莉"] = "lolicon", ["正太"] = "shotacon",
            ["熟女"] = "milf", ["人妻"] = "milf",
            ["ntr"] = "netorare", ["纯爱"] = "romance",
            ["扶她"] = "futanari", ["触手"] = "tentacles",
            ["怀孕"] = "pregnant", ["母乳"] = "lactation",
            ["足交"] = "footjob", ["口交"] = "blowjob",
            ["肛交"] = "anal", ["群交"] = "group",
            ["ntr"] = "netorare", ["cg"] = "cg",
            ["游戏"] = "game cg", ["cg集"] = "game cg",
            ["非人类"] = "monster", ["妖怪"] = "youkai",
            ["精灵"] = "elf", ["猫耳"] = "catgirl",
            ["兔女郎"] = "bunny girl", ["女仆"] = "maid",
            ["护士"] = "nurse", ["教师"] = "teacher",
            ["水手服"] = "schoolgirl uniform", ["泳装"] = "swimsuit",
            ["丝袜"] = "pantyhose", ["裸体围裙"] = "naked apron",
            ["捆绑"] = "bondage", ["调教"] = "discipline",
            ["洗脑"] = "mind control", ["催眠"] = "mind control",
            ["ai"] = "ai generated", ["ai生成"] = "ai generated",
        };
        var translated = q;
        foreach (var kv in map)
            translated = Regex.Replace(translated, kv.Key, kv.Value, RegexOptions.IgnoreCase);
        return translated;
    }

    // =========== 标签翻译 ===========

    private static Dictionary<string, string>? _tagTranslations;
    private static readonly object _tagLock = new();

    /// <summary>搜索倒排索引：词片段 → 匹配的 tag 条目列表</summary>
    private static List<(string Key, string Cn, string Ns, string Tag, string EhSyntax)>? _tagSearchIndex;
    private const string TAG_DB_URL = "https://raw.githubusercontent.com/xiaojieonly/EhTagTranslation/main/tag-translations/tag-translations-zh-rCN.json";
    private static string TagDbPath => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "eh_tag_translations.json");

    /// <summary>初始化标签翻译数据库（启动时调用一次）</summary>
    public static async Task InitTagTranslationsAsync()
    {
        try
        {
            // 先尝试从本地缓存加载
            if (File.Exists(TagDbPath) && (DateTime.UtcNow - File.GetLastWriteTimeUtc(TagDbPath)).TotalDays < 7)
            {
                var json = await File.ReadAllTextAsync(TagDbPath);
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (dict != null && dict.Count > 0)
                {
                    lock (_tagLock)
                    {
                        _tagTranslations = dict;
                        _tagSearchIndex = BuildSearchIndex(dict);
                    }
                    return;
                }
            }

            // 从 GitHub 下载二进制格式数据（EhViewer 格式：4字节大端长度头 + 文本行）
            using var hc = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            var rawBytes = await hc.GetByteArrayAsync(TAG_DB_URL);
            var decoded = ParseTagBinary(rawBytes);

            if (decoded != null && decoded.Count > 0)
            {
                lock (_tagLock) _tagTranslations = decoded;
                // 缓存为 JSON 格式
                await File.WriteAllTextAsync(TagDbPath, JsonSerializer.Serialize(decoded));
            }

            // 构建搜索倒排索引
            lock (_tagLock)
            {
                if (_tagTranslations != null)
                    _tagSearchIndex = BuildSearchIndex(_tagTranslations);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EH] 标签翻译加载失败: {ex.Message}");
        }
    }

    /// <summary>预构建搜索用扁平列表（避免每次搜索遍历字典）</summary>
    private static List<(string Key, string Cn, string Ns, string Tag, string EhSyntax)> BuildSearchIndex(Dictionary<string, string> dict)
    {
        var list = new List<(string, string, string, string, string)>(dict.Count);
        foreach (var kv in dict)
        {
            var key = kv.Key;
            var cn = kv.Value;
            var colonIdx = key.IndexOf(':');
            var nsPrefix = colonIdx > 0 ? key[..(colonIdx + 1)] : "";
            var tagName = colonIdx > 0 ? key[(colonIdx + 1)..] : key;
            var nsFull = nsPrefix switch
            {
                "a:" => "artist", "c:" => "character", "cos:" => "cosplayer",
                "f:" => "female", "g:" => "group", "l:" => "language",
                "m:" => "male", "x:" => "mixed", "o:" => "other",
                "p:" => "parody", "r:" => "reclass", "n:" => "rows",
                "temp:" => "temp", _ => ""
            };
            var ehSyntax = string.IsNullOrEmpty(nsFull) ? tagName : $"{nsFull}:{tagName.Replace(" ", "_")}";
            list.Add((key, cn, nsFull, tagName, ehSyntax));
        }
        return list;
    }

    /// <summary>解析 EhViewer 二进制标签翻译格式</summary>
    private static Dictionary<string, string>? ParseTagBinary(byte[] raw)
    {
        if (raw.Length < 4) return null;
        // 4字节大端长度头
        var totalBytes = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3];
        if (totalBytes <= 0 || totalBytes > raw.Length - 4) return null;

        var text = Encoding.UTF8.GetString(raw, 4, totalBytes);
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var result = new Dictionary<string, string>(lines.Length);

        foreach (var line in lines)
        {
            var idx = line.IndexOf('\r');
            if (idx <= 0 || idx >= line.Length - 1) continue;
            var key = line[..idx];
            var b64 = line[(idx + 1)..];
            try { result[key] = Encoding.UTF8.GetString(Convert.FromBase64String(b64)); }
            catch { /* skip invalid */ }
        }
        return result;
    }

    // namespace 全名 → 短前缀映射（翻译字典使用短前缀）
    private static readonly Dictionary<string, string> NsPrefixMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["artist"] = "a:", ["character"] = "c:", ["cosplayer"] = "cos:",
        ["female"] = "f:", ["group"] = "g:", ["language"] = "l:",
        ["male"] = "m:", ["mixed"] = "x:", ["other"] = "o:",
        ["parody"] = "p:", ["reclass"] = "r:", ["rows"] = "n:",
        ["temp"] = "temp:", ["misc"] = "",
    };

    /// <summary>获取标签翻译（namespace:tag → 中文翻译）</summary>
    public static string? TranslateTag(string namespaceAndTag)
    {
        Dictionary<string, string>? dict;
        lock (_tagLock) dict = _tagTranslations;
        if (dict == null) return null;

        // 先直接查
        if (dict.TryGetValue(namespaceAndTag, out var v)) return v;

        // 尝试将长 namespace 转换为短前缀再查
        var colonIdx = namespaceAndTag.IndexOf(':');
        if (colonIdx > 0)
        {
            var ns = namespaceAndTag[..colonIdx];
            var tag = namespaceAndTag[(colonIdx + 1)..];
            if (NsPrefixMap.TryGetValue(ns, out var prefix))
            {
                var shortKey = prefix + tag;
                if (dict.TryGetValue(shortKey, out v)) return v;
            }
        }
        return null;
    }

    /// <summary>获取 namespace 翻译（如 "female" → "女性"）</summary>
    public static string? TranslateNamespace(string ns)
    {
        return TranslateTag($"n:{ns}");
    }

    /// <summary>搜索标签建议（对标 EhViewer TagSuggestion），使用预构建索引避免全表扫描</summary>
    public static List<TagSuggestion> SuggestTags(string query, int limit = 30)
    {
        var results = new List<TagSuggestion>();
        List<(string Key, string Cn, string Ns, string Tag, string EhSyntax)>? index;
        lock (_tagLock) index = _tagSearchIndex;
        if (index == null || string.IsNullOrWhiteSpace(query)) return results;

        var q = query.ToLowerInvariant().Trim();
        var seen = new HashSet<string>();

        foreach (var (key, cn, nsFull, tagName, ehSyntax) in index)
        {
            // 搜索：英文标签名、中文翻译
            bool keyMatch = tagName.Contains(q, StringComparison.OrdinalIgnoreCase);
            bool cnMatch = cn.Contains(q, StringComparison.OrdinalIgnoreCase);

            if (!keyMatch && !cnMatch) continue;

            if (!seen.Add(ehSyntax.ToLowerInvariant())) continue;

            results.Add(new TagSuggestion
            {
                Key = key,
                Cn = cn,
                Namespace = nsFull,
                Tag = tagName,
                EhSyntax = ehSyntax,
                MatchType = cnMatch ? "cn" : "en"
            });

            if (results.Count >= limit * 3) break; // 多收集一些再排序截取
        }

        results = results
            .OrderByDescending(r => r.MatchType == "cn" ? 1 : 0)
            .ThenBy(r =>
            {
                var idx = r.MatchType == "cn"
                    ? r.Cn.IndexOf(q, StringComparison.OrdinalIgnoreCase)
                    : r.Tag.IndexOf(q, StringComparison.OrdinalIgnoreCase);
                return idx < 0 ? int.MaxValue : idx;
            })
            .Take(limit)
            .ToList();

        return results;
    }

    // =========== 标签屏蔽（集成 E-Hentai My Tags） ===========

    private static HashSet<string> _blockedTags = new();
    private static readonly object _blockLock = new();
    private static string BlockedTagsPath => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "eh_blocked_tags.json");

    public static void InitBlockedTags()
    {
        try
        {
            if (File.Exists(BlockedTagsPath))
            {
                var json = File.ReadAllText(BlockedTagsPath);
                var list = JsonSerializer.Deserialize<List<string>>(json);
                lock (_blockLock) _blockedTags = list != null ? new HashSet<string>(list) : new();
            }
        }
        catch { }
    }

    private static void SaveBlockedTags()
    {
        List<string> list;
        lock (_blockLock) list = _blockedTags.ToList();
        File.WriteAllText(BlockedTagsPath, JsonSerializer.Serialize(list));
    }

    public static List<string> GetBlockedTags()
    {
        lock (_blockLock) return _blockedTags.OrderBy(t => t).ToList();
    }

    /// <summary>添加屏蔽标签（本地 + E-Hentai My Tags）</summary>
    public async Task AddBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Add(tag)) return; }
        SaveBlockedTags();

        // 同步到 E-Hentai My Tags（设置为隐藏）
        try
        {
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["usertag_action"] = "add",
                ["tagname_new"] = tag,
                ["taghide_new"] = "on",
                ["tagwatch_new"] = "",
                ["tagweight_new"] = "-1",
                ["tagcolor_new"] = "",
            });
            await _http.PostAsync($"{HOST_E}/mytags", content);
        }
        catch { /* 网络失败不影响本地存储 */ }
    }

    /// <summary>移除屏蔽标签（本地 + E-Hentai My Tags）</summary>
    public async Task RemoveBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Remove(tag)) return; }
        SaveBlockedTags();

        // 同步到 E-Hentai My Tags（删除对应标签）
        try
        {
            // 先获取 mytags 页面找到该 tag 的 ID
            var html = await _http.GetStringAsync($"{HOST_E}/mytags");
            var escapedTag = Regex.Escape(tag);
            var idMatch = Regex.Match(html, $@"id=""usertag_(\d+)"".*?""{escapedTag}""", RegexOptions.Singleline);
            if (!idMatch.Success)
                idMatch = Regex.Match(html, $@"id=""usertag_(\d+)"".*?{escapedTag}", RegexOptions.Singleline);
            if (idMatch.Success)
            {
                var uid = idMatch.Groups[1].Value;
                var content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["usertag_action"] = "remove",
                    [$"usertag_{uid}"] = "on",
                });
                await _http.PostAsync($"{HOST_E}/mytags", content);
            }
        }
        catch { /* 网络失败不影响本地存储 */ }
    }

    public static bool IsTagBlocked(string tag)
    {
        lock (_blockLock) return _blockedTags.Contains(tag);
    }

    /// <summary>从 E-Hentai 获取 My Tags 列表（用于校验和同步）</summary>
    public async Task<List<MyTagInfo>> FetchMyTagsAsync()
    {
        var result = new List<MyTagInfo>();
        try
        {
            var html = await _http.GetStringAsync($"{HOST_E}/mytags");
            var matches = Regex.Matches(html, @"<div\s+id=""tagpreview_(\d+)""[^>]*title=""([^""]+)""[^>]*>([^<]+)</div>");
            foreach (Match m in matches)
            {
                var uid = m.Groups[1].Value;
                var fullTag = m.Groups[2].Value;
                var isHide = Regex.IsMatch(html, $@"id=""taghide_{uid}""\s+checked");
                var isWatch = Regex.IsMatch(html, $@"id=""tagwatch_{uid}""\s+checked");
                result.Add(new MyTagInfo
                {
                    Id = uid,
                    Tag = fullTag,
                    IsHidden = isHide,
                    IsWatched = isWatch,
                });
            }
        }
        catch (Exception ex)
        {
            throw new Exception($"获取 My Tags 失败: {ex.Message}");
        }
        return result;
    }

    /// <summary>同步：将 E-Hentai 上的隐藏标签拉取到本地屏蔽列表</summary>
    public async Task<List<string>> SyncBlockedTagsFromEHAsync()
    {
        var myTags = await FetchMyTagsAsync();
        var hiddenTags = myTags.Where(t => t.IsHidden).Select(t => t.Tag).ToList();
        lock (_blockLock)
        {
            foreach (var t in hiddenTags)
                _blockedTags.Add(t);
        }
        SaveBlockedTags();
        return hiddenTags;
    }

    public class MyTagInfo
    {
        public string Id { get; set; } = "";
        public string Tag { get; set; } = "";
        public bool IsHidden { get; set; }
        public bool IsWatched { get; set; }
    }

    // =========== DTOs ===========

    public class EhentaiCookie
    {
        [JsonPropertyName("ipb_member_id")] public string IpbMemberId { get; set; } = "";
        [JsonPropertyName("ipb_pass_hash")] public string IpbPassHash { get; set; } = "";
        [JsonPropertyName("igneous")] public string Igneous { get; set; } = "";
        [JsonPropertyName("label")] public string Label { get; set; } = "默认";
    }

    public record ValidateResult(bool LoggedIn, bool Exhentai, string? Error);
    public class GalleryListResult { public int Page { get; set; } public int TotalPages { get; set; } public string? NextCursor { get; set; } public bool IsExhentai { get; set; } public List<GalleryItem> Galleries { get; set; } = new(); }
    public class GalleryItem { public int Gid { get; set; } public string Token { get; set; } = ""; public string? Title { get; set; } public string? ThumbUrl { get; set; } public int FileCount { get; set; } public double Rating { get; set; } public string? Category { get; set; } public bool IsExhentai { get; set; } }
    public class TagGroup { public string Namespace { get; set; } = ""; public List<string> Tags { get; set; } = new(); }
    public class GalleryDetail
    {
        public int Gid { get; set; } public string Token { get; set; } = "";
        public string Title { get; set; } = ""; public string? TitleJpn { get; set; }
        public string Category { get; set; } = "other"; public string Uploader { get; set; } = "";
        public long Posted { get; set; } public int FileCount { get; set; }
        public long FileSize { get; set; } public string Rating { get; set; } = "0";
        public string? ThumbUrl { get; set; }
        public List<string> Tags { get; set; } = new();          // 兼容旧格式
        public List<TagGroup> TagGroups { get; set; } = new();    // namespace 分组
        public string? Language { get; set; }
        public int RatingCount { get; set; }
        public int FavoriteCount { get; set; }
        public bool IsFavorited { get; set; }
        public string? FavoriteName { get; set; }
        public int TorrentCount { get; set; }
        public string? ParentGallery { get; set; }
        public string? Visible { get; set; }
        public bool IsExhentai { get; set; }
    }
    public class PageItem { public int Index { get; set; } public string ImageUrl { get; set; } = ""; public int Width { get; set; } public int Height { get; set; } public long FileSize { get; set; } }
    public record PageResult(List<PageItem> Pages, string ImgKey, string ShowKey);

    public class TagSuggestion
    {
        public string Key { get; set; } = "";        // 原始 key: "f:big breasts"
        public string Cn { get; set; } = "";         // 中文翻译: "巨乳"
        public string Namespace { get; set; } = "";  // 全名: "female"
        public string Tag { get; set; } = "";        // 标签名: "big breasts"
        public string EhSyntax { get; set; } = "";   // E-Hentai 搜索语法: "female:big_breasts"
        public string MatchType { get; set; } = "";  // "cn" 或 "en"
    }

    private class GdataResponse { public List<GmItem> Gmetadata { get; set; } = new(); }
    private class GmItem
    {
        public int Gid { get; set; } public string Token { get; set; } = "";
        public string? Title { get; set; } public string? TitleJpn { get; set; }
        public string? Category { get; set; } public string? Uploader { get; set; }
        public JsonElement Posted { get; set; }
        public JsonElement Filecount { get; set; }
        public JsonElement Filesize { get; set; }
        public string? Rating { get; set; }
        public string? Thumb { get; set; } public List<string> Tags { get; set; } = new();

        public long PostedLong => TryGetLong(Posted);
        public int FilecountInt => TryGetInt(Filecount);
        public long FilesizeLong => TryGetLong(Filesize);

        private static long TryGetLong(JsonElement e) =>
            e.ValueKind == JsonValueKind.Number ? e.GetInt64() :
            e.ValueKind == JsonValueKind.String && long.TryParse(e.GetString(), out var v) ? v : 0;

        private static int TryGetInt(JsonElement e) =>
            e.ValueKind == JsonValueKind.Number ? e.GetInt32() :
            e.ValueKind == JsonValueKind.String && int.TryParse(e.GetString(), out var v) ? v : 0;
    }
    private class GtokenResponse { public List<TkItem> TokenList { get; set; } = new(); }
    private class TkItem { public int Gid { get; set; } public string Token { get; set; } = ""; public string Imgkey { get; set; } = ""; public string Showkey { get; set; } = ""; }
    private class ShowPageResponse
    {
        public S1? s1 { get; set; } public S1? i2 { get; set; } public S1? i3 { get; set; }
        public string? GetImage() => s1?.i ?? i2?.i ?? i3?.i;
        public int GetWidth() => s1?.w ?? i2?.w ?? i3?.w ?? 0;
        public int GetHeight() => s1?.h ?? i2?.h ?? i3?.h ?? 0;
        public long GetFileSize() => s1?.s ?? i2?.s ?? i3?.s ?? 0;
        public class S1 { public string i { get; set; } = ""; public int? w { get; set; } public int? h { get; set; } public long? s { get; set; } }
    }
}
