"""
Split EhentaiService.cs (1488 lines) into 6 files:
  1. EhentaiModels.cs     - DTOs (lines ~1406-1488)
  2. EhentaiFileHelper.cs  - File helpers (lines ~890-925, ~1032)
  3. EhentaiHtmlParser.cs  - HTML parsing (lines ~187-388, ~745-800, ~1035-1068)
  4. EhentaiTagService.cs  - Tag translation (lines ~1069-1263)
  5. EhentaiBlockedTagService.cs - Blocked tags (lines ~1265-1404)
  6. EhentaiService.cs     - Trimmed core (~lines 1-186, 609-889, 926-1034)
"""
import re

base = "src/backend/MangaManager.Services/"
src = open(base + "EhentaiService.cs", encoding="utf-8").read()

# ======= EXTRACT DTOs =======
models_start = src.index("    // =========== DTOs ===========")
models_code = src[models_start:]
# Remove leading comment
models_code = re.sub(r'\s*// =========== DTOs ===========\s*', '', models_code, count=1)
models_content = """using System.Text.Json.Serialization;
using System.Text.Json;
using System.Web;

namespace MangaManager.Services;

/// <summary>E-Hentai API 数据模型（从 EhentaiService 拆分）</summary>
""" + models_code

open(base + "EhentaiModels.cs", "w", encoding="utf-8").write(models_content)
print(f"1. EhentaiModels.cs: {models_code.count(chr(10))} lines")

# ======= EXTRACT FILE HELPERS =======
file_helper_code = """
using System.Web;

namespace MangaManager.Services;

/// <summary>E-Hentai 本地文件工具（从 EhentaiService 拆分）</summary>
public static class EhentaiFileHelper
{
    public static readonly string DefaultDownloadDir = @\"G:\\学习资料\\本子\";

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

    private static string SanitizeFileName(string name) =>
        string.Join("_", name.Split(Path.GetInvalidFileNameChars()));
}
"""
open(base + "EhentaiFileHelper.cs", "w", encoding="utf-8").write(file_helper_code.strip())
print("2. EhentaiFileHelper.cs: created")

# ======= EXTRACT HTML PARSER =======
html_parser_code = """
using System.Text.RegularExpressions;
using System.Web;

namespace MangaManager.Services;

/// <summary>E-Hentai HTML 解析工具（从 EhentaiService 拆分）</summary>
public static class EhentaiHtmlParser
{
    private const string HOST_E = "https://e-hentai.org";
    private const string HOST_EX = "https://exhentai.org";

    /// <summary>解析画廊列表 HTML</summary>
    public static GalleryListResult ParseList(string html, string host, int page)
    {
        var r = new GalleryListResult { Page = page, Galleries = new() };

        var nextMatch = Regex.Match(html, @"nexturl\s*=\s*""[^""]*next=(\d+)""");
        if (nextMatch.Success) r.NextCursor = nextMatch.Groups[1].Value;

        var linkRegex = new Regex(
            @"<a\s+href=""(?<url>https?://[^/]+/g/(?<gid>\d+)/(?<token>[a-f0-9]{10})/)""",
            RegexOptions.IgnoreCase);

        var linkMatches = linkRegex.Matches(html);
        if (linkMatches.Count == 0) return r;

        foreach (Match link in linkMatches)
        {
            var gid = int.Parse(link.Groups["gid"].Value);
            var token = link.Groups["token"].Value;

            var trStart = html.LastIndexOf("<tr", link.Index, StringComparison.OrdinalIgnoreCase);
            var trEnd = html.IndexOf("</tr>", link.Index + link.Length, StringComparison.OrdinalIgnoreCase);
            if (trStart < 0 || trEnd < 0) { trStart = Math.Max(0, link.Index - 3000); trEnd = Math.Min(html.Length, link.Index + 3000); }
            var ctx = html[trStart..(trEnd + 5)];

            var thumbMatch = Regex.Match(ctx,
                @"class=""glthumb""[^>]*>.*?<img[^>]*(?:data-src|src)=""(?<thumb>[^""]+)""",
                RegexOptions.Singleline | RegexOptions.IgnoreCase);
            if (!thumbMatch.Success)
                thumbMatch = Regex.Match(ctx,
                    @"<img[^>]*(?:data-src|src)=""(?<thumb>(?:https?:)?(?://)?(?:ehgt\.org|exhentai\.org/t/)[^""]+)""",
                    RegexOptions.IgnoreCase);

            var titleMatch = Regex.Match(ctx,
                @"<div\s+class=""glink""[^>]*>(?<title>.+?)</div>",
                RegexOptions.Singleline | RegexOptions.IgnoreCase);
            var title = titleMatch.Success
                ? HttpUtility.HtmlDecode(Regex.Replace(titleMatch.Groups["title"].Value, @"<[^>]+>", "").Trim())
                : $"#{gid}";

            string? thumbUrl = null;
            if (thumbMatch.Success) thumbUrl = FixThumbUrl(thumbMatch.Groups["thumb"].Value, host);

            int fileCount = 0;
            var pageMatch = Regex.Match(ctx, @"(\d+)\s*pages?", RegexOptions.IgnoreCase);
            if (!pageMatch.Success) pageMatch = Regex.Match(ctx, @"class=""gpc""[^>]*>\s*(\d+)", RegexOptions.IgnoreCase);
            if (pageMatch.Success) int.TryParse(pageMatch.Groups[1].Value, out fileCount);

            double rating = 0;
            var irDiv = Regex.Match(ctx, @"class=""ir""[^>]*style=""([^""]+)""", RegexOptions.IgnoreCase);
            if (irDiv.Success)
            {
                var style = irDiv.Groups[1].Value;
                var bpMatch = Regex.Match(style, @"background-position\s*:\s*(-?\d+)px\s+(-?\d+)px", RegexOptions.IgnoreCase);
                if (bpMatch.Success && int.TryParse(bpMatch.Groups[1].Value, out int xPx))
                    rating = Math.Round(Math.Max(0, Math.Min(5, 5.0 + xPx / 16.0)), 1);
                else
                {
                    var wMatch = Regex.Match(style, @"width\s*:\s*(\d+)px", RegexOptions.IgnoreCase);
                    if (wMatch.Success && int.TryParse(wMatch.Groups[1].Value, out int w))
                        rating = Math.Round(Math.Max(0, Math.Min(5, w / 16.0)), 1);
                }
            }

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

    /// <summary>借鉴 EhViewer EhUrl.getFixedPreviewThumbUrl 逻辑</summary>
    public static string FixThumbUrl(string url, string host)
    {
        if (string.IsNullOrWhiteSpace(url)) return url;
        if (url.StartsWith("//")) url = "https:" + url;
        if (url.Contains("exhentai.org/t/"))
            url = url.Replace("https://exhentai.org/t/", "https://ehgt.org/");
        else if (url.StartsWith("/") && !url.StartsWith("//"))
            url = host.TrimEnd('/') + url;
        return url;
    }

    /// <summary>从 API 返回的 tags（namespace:tag 格式）构造 TagGroup 列表</summary>
    public static List<TagGroup> BuildTagGroups(List<string>? tags)
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
        foreach (var kv in dict) groups.Add(new TagGroup { Namespace = kv.Key, Tags = kv.Value });
        return groups;
    }

    /// <summary>从 HTML #gdd 表格提取指定 key 的值</summary>
    public static string? ExtractDetailField(string html, string key)
    {
        var match = Regex.Match(html, $@"<td[^>]*class=""gdt1""[^>]*>{key}:</td>\s*<td[^>]*class=""gdt2""[^>]*>(.+?)</td>", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        var value = HttpUtility.HtmlDecode(Regex.Replace(match.Groups[1].Value, @"<[^>]+>", "").Trim());
        value = Regex.Replace(value, @"[\u00a0\u2000-\u200f\u202f\u205f\u3000]", " ").Trim();
        return string.IsNullOrEmpty(value) ? null : value;
    }

    /// <summary>从 HTML 提取 Parent 链接</summary>
    public static string? ExtractDetailParent(string html)
    {
        var match = Regex.Match(html, @"Parent:</td>\s*<td[^>]*class=""gdt2""[^>]*>.*?href=""([^""]+)""", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value : null;
    }

    /// <summary>从 HTML 解析标签分组</summary>
    public static List<TagGroup> ParseTagGroupsFromHtml(string html)
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
                var t = HttpUtility.HtmlDecode(Regex.Replace(a.Groups[1].Value, @"<[^>]+>", "").Trim());
                if (!string.IsNullOrWhiteSpace(t)) groupTags.Add(t);
            }
            if (groupTags.Count > 0) tagGroups.Add(new TagGroup { Namespace = nsName, Tags = groupTags });
        }
        return tagGroups;
    }

    /// <summary>从 HTML 中解析缩略图链接，对标 EhViewer 多模式匹配</summary>
    public static List<PageItem> ParsePreviewMatches(string html)
    {
        var result = new List<PageItem>();
        var regex1 = new Regex(
            @"<a\s+href=""([^""]*?/s/[0-9a-f]{10}/\d+-\d+)""[^>]*?>.*?<div[^>]*?title=""Page\s+(\d+):",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        var matches1 = regex1.Matches(html);
        if (matches1.Count > 0)
        {
            foreach (Match m in matches1)
            {
                var pagePath = m.Groups[1].Value;
                if (!pagePath.StartsWith("/") && !pagePath.StartsWith("http")) pagePath = "/" + pagePath;
                if (pagePath.StartsWith("http")) { var uri = new Uri(pagePath); pagePath = uri.AbsolutePath; }
                var pageNum = int.Parse(m.Groups[2].Value);
                result.Add(new PageItem { Index = pageNum, ImageUrl = pagePath, Width = 0, Height = 0, FileSize = 0 });
            }
        }
        else
        {
            var regex2 = new Regex(@"href=""(?:https?://[^/]+)?(/s/([0-9a-f]{10})/(\d+)-(\d+))""", RegexOptions.IgnoreCase);
            var matches2 = regex2.Matches(html);
            foreach (Match m in matches2)
            {
                var pagePath = m.Groups[1].Value;
                var pageNum = int.Parse(m.Groups[4].Value);
                result.Add(new PageItem { Index = pageNum, ImageUrl = pagePath, Width = 0, Height = 0, FileSize = 0 });
            }
        }
        return result;
    }

    /// <summary>中文搜索词 → E-Hentai 标签语法</summary>
    public static string TranslateChineseSearch(string q)
    {
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
            ["cg"] = "cg", ["游戏"] = "game cg", ["cg集"] = "game cg",
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
        foreach (var kv in map) translated = Regex.Replace(translated, kv.Key, kv.Value, RegexOptions.IgnoreCase);
        return translated;
    }
}
"""
open(base + "EhentaiHtmlParser.cs", "w", encoding="utf-8").write(html_parser_code.strip())
print("3. EhentaiHtmlParser.cs: created")

# ======= EXTRACT TAG SERVICE (static methods) =======
tag_service_code = """
using System.Text;
using System.Text.Json;

namespace MangaManager.Services;

/// <summary>E-Hentai 标签翻译服务（从 EhentaiService 拆分）</summary>
public static class EhentaiTagService
{
    private static Dictionary<string, string>? _tagTranslations;
    private static readonly object _tagLock = new();
    private static List<(string Key, string Cn, string Ns, string Tag, string EhSyntax)>? _tagSearchIndex;
    private const string TAG_DB_URL = "https://raw.githubusercontent.com/xiaojieonly/EhTagTranslation/main/tag-translations/tag-translations-zh-rCN.json";
    private static string TagDbPath => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "eh_tag_translations.json");

    private static readonly Dictionary<string, string> NsPrefixMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["artist"] = "a:", ["character"] = "c:", ["cosplayer"] = "cos:",
        ["female"] = "f:", ["group"] = "g:", ["language"] = "l:",
        ["male"] = "m:", ["mixed"] = "x:", ["other"] = "o:",
        ["parody"] = "p:", ["reclass"] = "r:", ["rows"] = "n:",
        ["temp"] = "temp:", ["misc"] = "",
    };

    /// <summary>初始化标签翻译数据库（启动时调用一次）</summary>
    public static async Task InitTagTranslationsAsync()
    {
        try
        {
            if (File.Exists(TagDbPath) && (DateTime.UtcNow - File.GetLastWriteTimeUtc(TagDbPath)).TotalDays < 7)
            {
                var json = await File.ReadAllTextAsync(TagDbPath);
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (dict != null && dict.Count > 0)
                {
                    lock (_tagLock) { _tagTranslations = dict; _tagSearchIndex = BuildSearchIndex(dict); }
                    return;
                }
            }

            using var hc = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            var rawBytes = await hc.GetByteArrayAsync(TAG_DB_URL);
            var decoded = ParseTagBinary(rawBytes);
            if (decoded != null && decoded.Count > 0)
            {
                lock (_tagLock) _tagTranslations = decoded;
                await File.WriteAllTextAsync(TagDbPath, JsonSerializer.Serialize(decoded));
            }
            lock (_tagLock) { if (_tagTranslations != null) _tagSearchIndex = BuildSearchIndex(_tagTranslations); }
        }
        catch (Exception ex) { Console.WriteLine($"[EH] 标签翻译加载失败: {ex.Message}"); }
    }

    private static List<(string Key, string Cn, string Ns, string Tag, string EhSyntax)> BuildSearchIndex(Dictionary<string, string> dict)
    {
        var list = new List<(string, string, string, string, string)>(dict.Count);
        foreach (var kv in dict)
        {
            var key = kv.Key; var cn = kv.Value;
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

    private static Dictionary<string, string>? ParseTagBinary(byte[] raw)
    {
        if (raw.Length < 4) return null;
        var totalBytes = (raw[0] << 24) | (raw[1] << 16) | (raw[2] << 8) | raw[3];
        if (totalBytes <= 0 || totalBytes > raw.Length - 4) return null;
        var text = Encoding.UTF8.GetString(raw, 4, totalBytes);
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var result = new Dictionary<string, string>(lines.Length);
        foreach (var line in lines)
        {
            var idx = line.IndexOf('\r');
            if (idx <= 0 || idx >= line.Length - 1) continue;
            var key = line[..idx]; var b64 = line[(idx + 1)..];
            try { result[key] = Encoding.UTF8.GetString(Convert.FromBase64String(b64)); } catch { }
        }
        return result;
    }

    /// <summary>获取标签翻译（namespace:tag → 中文翻译）</summary>
    public static string? TranslateTag(string namespaceAndTag)
    {
        Dictionary<string, string>? dict;
        lock (_tagLock) dict = _tagTranslations;
        if (dict == null) return null;
        if (dict.TryGetValue(namespaceAndTag, out var v)) return v;
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
    public static string? TranslateNamespace(string ns) => TranslateTag($"n:{ns}");

    /// <summary>搜索标签建议</summary>
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
            bool keyMatch = tagName.Contains(q, StringComparison.OrdinalIgnoreCase);
            bool cnMatch = cn.Contains(q, StringComparison.OrdinalIgnoreCase);
            if (!keyMatch && !cnMatch) continue;
            if (!seen.Add(ehSyntax.ToLowerInvariant())) continue;
            results.Add(new TagSuggestion { Key = key, Cn = cn, Namespace = nsFull, Tag = tagName, EhSyntax = ehSyntax, MatchType = cnMatch ? "cn" : "en" });
            if (results.Count >= limit * 3) break;
        }
        results = results.OrderByDescending(r => r.MatchType == "cn" ? 1 : 0)
            .ThenBy(r => { var idx = r.MatchType == "cn" ? r.Cn.IndexOf(q, StringComparison.OrdinalIgnoreCase) : r.Tag.IndexOf(q, StringComparison.OrdinalIgnoreCase); return idx < 0 ? int.MaxValue : idx; })
            .Take(limit).ToList();
        return results;
    }
}
"""
open(base + "EhentaiTagService.cs", "w", encoding="utf-8").write(tag_service_code.strip())
print("4. EhentaiTagService.cs: created")

# ======= EXTRACT BLOCKED TAG SERVICE =======
blocked_code = """
using System.Text.Json;

namespace MangaManager.Services;

/// <summary>E-Hentai 标签屏蔽服务（从 EhentaiService 拆分）</summary>
public class EhentaiBlockedTagService
{
    private static HashSet<string> _blockedTags = new();
    private static readonly object _blockLock = new();
    private static string BlockedTagsPath => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "eh_blocked_tags.json");

    private readonly HttpClient _http;

    public EhentaiBlockedTagService(HttpClient http) { _http = http; }

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

    public static List<string> GetBlockedTags() { lock (_blockLock) return _blockedTags.OrderBy(t => t).ToList(); }

    public static bool IsTagBlocked(string tag) { lock (_blockLock) return _blockedTags.Contains(tag); }

    public async Task AddBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Add(tag)) return; }
        SaveBlockedTags();
        try
        {
            var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["usertag_action"] = "add", ["tagname_new"] = tag, ["taghide_new"] = "on",
                ["tagwatch_new"] = "", ["tagweight_new"] = "-1", ["tagcolor_new"] = "",
            });
            await _http.PostAsync("https://e-hentai.org/mytags", content);
        }
        catch { }
    }

    public async Task RemoveBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Remove(tag)) return; }
        SaveBlockedTags();
        try
        {
            var html = await _http.GetStringAsync("https://e-hentai.org/mytags");
            var escapedTag = Regex.Escape(tag);
            var idMatch = Regex.Match(html, $@"id=""usertag_(\d+)"".*?""{escapedTag}""", RegexOptions.Singleline);
            if (!idMatch.Success) idMatch = Regex.Match(html, $@"id=""usertag_(\d+)"".*?{escapedTag}", RegexOptions.Singleline);
            if (idMatch.Success)
            {
                var uid = idMatch.Groups[1].Value;
                var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["usertag_action"] = "remove", [$"usertag_{uid}"] = "on", });
                await _http.PostAsync("https://e-hentai.org/mytags", content);
            }
        }
        catch { }
    }

    public async Task<List<MyTagInfo>> FetchMyTagsAsync()
    {
        var result = new List<MyTagInfo>();
        try
        {
            var html = await _http.GetStringAsync("https://e-hentai.org/mytags");
            var matches = Regex.Matches(html, @"<div\s+id=""tagpreview_(\d+)""[^>]*title=""([^""]+)""[^>]*>([^<]+)</div>");
            foreach (Match m in matches)
            {
                var uid = m.Groups[1].Value; var fullTag = m.Groups[2].Value;
                var isHide = Regex.IsMatch(html, $@"id=""taghide_{uid}""\s+checked");
                var isWatch = Regex.IsMatch(html, $@"id=""tagwatch_{uid}""\s+checked");
                result.Add(new MyTagInfo { Id = uid, Tag = fullTag, IsHidden = isHide, IsWatched = isWatch });
            }
        }
        catch (Exception ex) { throw new Exception($"获取 My Tags 失败: {ex.Message}"); }
        return result;
    }

    public async Task<List<string>> SyncBlockedTagsFromEHAsync()
    {
        var myTags = await FetchMyTagsAsync();
        var hiddenTags = myTags.Where(t => t.IsHidden).Select(t => t.Tag).ToList();
        lock (_blockLock) { foreach (var t in hiddenTags) _blockedTags.Add(t); }
        SaveBlockedTags();
        return hiddenTags;
    }

    public class MyTagInfo { public string Id { get; set; } = ""; public string Tag { get; set; } = ""; public bool IsHidden { get; set; } public bool IsWatched { get; set; } }
}
"""
open(base + "EhentaiBlockedTagService.cs", "w", encoding="utf-8").write(blocked_code.strip())
print("5. EhentaiBlockedTagService.cs: created")

# ======= TRIM EhentaiService.cs =======
# Remove: DTOs, file helpers, HTML parsing, tag translation, blocked tags
# Keep: Cookie, validate, search, detail, pages, image proxy, download

trimmed = src

# Remove DTOs section
dto_start = trimmed.index("    // =========== DTOs ===========")
trimmed = trimmed[:dto_start].rstrip()

# Remove tag translation section  
tag_start = trimmed.index("    // =========== 标签翻译 ===========")
trimmed = trimmed[:tag_start].rstrip()

# Remove static file helpers
# DefaultDownloadDir, GetGalleryLocalDir, IsGalleryDownloaded, GetLocalGalleryPages
trimmed = re.sub(
    r'\s*// 默认下载目录\s*public static readonly string DefaultDownloadDir.*?(?=\s*/// <summary>下载画廊)',
    '', trimmed, flags=re.DOTALL
)
trimmed = re.sub(
    r'\s*/// <summary>获取画廊本地目录路径[\s\S]*?/// <summary>下载画廊',
    '\n\n    /// <summary>下载画廊',
    trimmed, count=1
)
trimmed = re.sub(
    r'\s*private static string SanitizeFileName\(string name\).*?\n    }',
    '', trimmed
)

# Remove HTML parsing methods (keep them as references to EhentaiHtmlParser)
# ParseList, FixThumbUrl, BuildTagGroups, ExtractDetailField, ExtractDetailParent, ParseTagGroupsFromHtml, ParsePreviewMatches, TranslateChineseSearch
trimmed = re.sub(
    r'\s*private GalleryListResult ParseList.*?(?=    // =========== 详情解析辅助方法 ===========)',
    '', trimmed, flags=re.DOTALL
)

# Remove detail helper section and its methods
trimmed = re.sub(
    r'\s*// =========== 详情解析辅助方法[\s\S]*?(?=    // =========== 画廊详情)',
    '\n\n    // =========== 画廊详情', trimmed
)

# Remove ParsePreviewMatches (after GetPagesAsync, before FetchImageFromPageAsync)  
trimmed = re.sub(
    r'\s*/// <summary>从 HTML 中解析缩略图链接[\s\S]*?(?=    /// <summary>从 /s/ 页面提取)',
    '', trimmed
)

# Remove TranslateChineseSearch
trimmed = re.sub(
    r'\s*/// <summary>中文搜索词[\s\S]*?(?=    // =========== 标签翻译)',
    '', trimmed
)

# Remove remaining // =========== 标签翻译 comment if still present
trimmed = re.sub(r'\s*// =========== 标签翻译\s*', '', trimmed)

# Clean up multiple blank lines
trimmed = re.sub(r'\n\s*\n\s*\n\s*\n', '\n\n\n', trimmed)
trimmed = re.sub(r'\n\s*\n\s*\n', '\n\n', trimmed)

# Update internal references
# ParseList -> EhentaiHtmlParser.ParseList, BuildTagGroups -> EhentaiHtmlParser.BuildTagGroups, etc.
trimmed = trimmed.replace('ParseList(html, host, page)', 'EhentaiHtmlParser.ParseList(html, host, page)')
trimmed = trimmed.replace('BuildTagGroups(m.Tags)', 'EhentaiHtmlParser.BuildTagGroups(m.Tags)')
trimmed = trimmed.replace('ExtractDetailField(html2, "Language")', 'EhentaiHtmlParser.ExtractDetailField(html2, "Language")')
trimmed = trimmed.replace('ExtractDetailField(html2, "Visible")', 'EhentaiHtmlParser.ExtractDetailField(html2, "Visible")')
trimmed = trimmed.replace('ExtractDetailParent(html2)', 'EhentaiHtmlParser.ExtractDetailParent(html2)')
trimmed = trimmed.replace('ParseTagGroupsFromHtml(html2)', 'EhentaiHtmlParser.ParseTagGroupsFromHtml(html2)')
trimmed = trimmed.replace('ParsePreviewMatches(firstHtml)', 'EhentaiHtmlParser.ParsePreviewMatches(firstHtml)')
trimmed = trimmed.replace('ParsePreviewMatches(pageHtml)', 'EhentaiHtmlParser.ParsePreviewMatches(pageHtml)')
# DefaultDownloadDir references (keep only the ones in core service)
trimmed = trimmed.replace('EhentaiService.DefaultDownloadDir', 'EhentaiFileHelper.DefaultDownloadDir')
# File helpers
trimmed = trimmed.replace('GetGalleryLocalDir(gid, detail.Title)', 'EhentaiFileHelper.GetGalleryLocalDir(gid, detail.Title)')

# Remove unused usings that were only needed by moved code
# Actually, keep them - they may still be needed

open(base + "EhentaiService.cs", "w", encoding="utf-8").write(trimmed)
lines_remaining = trimmed.count('\n')
print(f"6. EhentaiService.cs: trimmed to ~{lines_remaining} lines")

print("\n=== Split complete. Now update all references... ===")

# ======= UPDATE ALL REFERENCES =======
# Files that reference EhentaiService static members need updating

references = [
    ("src/backend/MangaManager.Api/Program.cs", [
        ("EhentaiService.InitTagTranslationsAsync()", "EhentaiTagService.InitTagTranslationsAsync()"),
        ("EhentaiService.InitBlockedTags()", "EhentaiBlockedTagService.InitBlockedTags()"),
    ]),
    ("src/backend/MangaManager.Api/Controllers/EhentaiController.cs", [
        ("EhentaiService.TranslateChineseSearch", "EhentaiHtmlParser.TranslateChineseSearch"),
        ("EhentaiService.TranslateTag", "EhentaiTagService.TranslateTag"),
        ("EhentaiService.TranslateNamespace", "EhentaiTagService.TranslateNamespace"),
        ("EhentaiService.SuggestTags", "EhentaiTagService.SuggestTags"),
        ("EhentaiService.GetBlockedTags", "EhentaiBlockedTagService.GetBlockedTags"),
        ("EhentaiService.IsTagBlocked", "EhentaiBlockedTagService.IsTagBlocked"),
    ]),
    ("src/backend/MangaManager.Api/Controllers/EhTagsController.cs", [
        ("EhentaiService.TranslateTag", "EhentaiTagService.TranslateTag"),
        ("EhentaiService.TranslateNamespace", "EhentaiTagService.TranslateNamespace"),
        ("EhentaiService.SuggestTags", "EhentaiTagService.SuggestTags"),
    ]),
    ("src/backend/MangaManager.Api/Controllers/EhLocalController.cs", [
        ("EhentaiService.DefaultDownloadDir", "EhentaiFileHelper.DefaultDownloadDir"),
    ]),
    ("src/backend/MangaManager.Services/LocalGalleryService.cs", [
        ("EhentaiService.DefaultDownloadDir", "EhentaiFileHelper.DefaultDownloadDir"),
        ("EhentaiService.IsGalleryDownloaded", "EhentaiFileHelper.IsGalleryDownloaded"),
        ("EhentaiService.GetLocalGalleryPages", "EhentaiFileHelper.GetLocalGalleryPages"),
        ("EhentaiService.GetGalleryLocalDir", "EhentaiFileHelper.GetGalleryLocalDir"),
    ]),
    ("src/backend/MangaManager.Services/DownloadManager.cs", [
        ("EhentaiService.DefaultDownloadDir", "EhentaiFileHelper.DefaultDownloadDir"),
        ("EhentaiService.GetGalleryLocalDir", "EhentaiFileHelper.GetGalleryLocalDir"),
    ]),
]

for fpath, replacements in references:
    try:
        content = open(fpath, encoding="utf-8").read()
        changed = False
        for old, new in replacements:
            if old in content:
                content = content.replace(old, new)
                changed = True
        if changed:
            open(fpath, "w", encoding="utf-8").write(content)
            print(f"  Updated: {fpath} ({len(replacements)} replacements)")
        else:
            print(f"  No change: {fpath}")
    except Exception as e:
        print(f"  ERROR {fpath}: {e}")

print("\nAll done!")