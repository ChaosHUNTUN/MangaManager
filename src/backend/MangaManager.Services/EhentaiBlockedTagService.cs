using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace MangaManager.Services;

/// <summary>E-Hentai 标签屏蔽服务（本地屏蔽列表 + E-Hentai My Tags 同步）</summary>
public class EhentaiBlockedTagService
{
    private readonly ILogger<EhentaiBlockedTagService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly HashSet<string> _blockedTags = new();
    private readonly object _blockLock = new();
    private readonly string _blockedTagsPath;
    private const string HOST_E = "https://e-hentai.org";

    private HttpClient _http => _httpClientFactory.CreateClient("ehentai");

    public EhentaiBlockedTagService(ILogger<EhentaiBlockedTagService> logger, IHttpClientFactory httpClientFactory)
    {
        _logger = logger;
        _httpClientFactory = httpClientFactory;
        _blockedTagsPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "eh_blocked_tags.json");
    }

    /// <summary>从本地文件加载屏蔽标签列表</summary>
    public void Initialize()
    {
        try
        {
            if (File.Exists(_blockedTagsPath))
            {
                var list = JsonSerializer.Deserialize<List<string>>(File.ReadAllText(_blockedTagsPath));
                lock (_blockLock) { _blockedTags.UnionWith(list ?? []); }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[BlockedTag] 加载屏蔽标签失败");
        }
    }

    /// <summary>持久化屏蔽标签到文件</summary>
    private void Save()
    {
        List<string> list;
        lock (_blockLock) list = _blockedTags.ToList();
        File.WriteAllText(_blockedTagsPath, JsonSerializer.Serialize(list));
    }

    /// <summary>获取所有屏蔽标签</summary>
    public List<string> GetBlockedTags()
    {
        lock (_blockLock) return _blockedTags.OrderBy(t => t).ToList();
    }

    /// <summary>检查标签是否被屏蔽</summary>
    public bool IsTagBlocked(string tag)
    {
        lock (_blockLock) return _blockedTags.Contains(tag);
    }

    /// <summary>添加屏蔽标签（本地 + 同步 E-Hentai My Tags）</summary>
    public async Task AddBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Add(tag)) return; }
        Save();

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
        catch (Exception ex) { _logger.LogDebug(ex, "[BlockedTag] MyTags sync failed (Add), local storage unaffected"); }
    }

    /// <summary>移除屏蔽标签（本地 + 同步 E-Hentai My Tags）</summary>
    public async Task RemoveBlockedTagAsync(string tag)
    {
        lock (_blockLock) { if (!_blockedTags.Remove(tag)) return; }
        Save();

        try
        {
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
        catch (Exception ex) { _logger.LogDebug(ex, "[BlockedTag] MyTags sync failed (Remove), local storage unaffected"); }
    }

    /// <summary>从 E-Hentai 获取 My Tags 列表</summary>
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
            throw new Exception($"获取 My Tags 失败: {ex.Message}", ex);
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
        Save();
        return hiddenTags;
    }
}

/// <summary>E-Hentai My Tag 信息</summary>
public class MyTagInfo
{
    public string Id { get; set; } = "";
    public string Tag { get; set; } = "";
    public bool IsHidden { get; set; }
    public bool IsWatched { get; set; }
}
