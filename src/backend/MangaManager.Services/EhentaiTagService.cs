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

    public static string? TranslateNamespace(string ns) => TranslateTag($"n:{ns}");

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