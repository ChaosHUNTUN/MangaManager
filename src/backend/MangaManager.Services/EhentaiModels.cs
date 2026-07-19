using System.Text.Json.Serialization;
using System.Text.Json;
using System.Web;

namespace MangaManager.Services;

/// <summary>E-Hentai API 数据模型（从 EhentaiService 拆分）</summary>

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
    public List<string> Tags { get; set; } = new();
    public List<TagGroup> TagGroups { get; set; } = new();
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
    public string Key { get; set; } = "";
    public string Cn { get; set; } = "";
    public string Namespace { get; set; } = "";
    public string Tag { get; set; } = "";
    public string EhSyntax { get; set; } = "";
    public string MatchType { get; set; } = "";
}

internal class GdataResponse { public List<GmItem> Gmetadata { get; set; } = new(); }
internal class GmItem
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
internal class GtokenResponse { public List<TkItem> TokenList { get; set; } = new(); }
internal class TkItem { public int Gid { get; set; } public string Token { get; set; } = ""; public string Imgkey { get; set; } = ""; public string Showkey { get; set; } = ""; }
internal class ShowPageResponse
{
    public S1? s1 { get; set; } public S1? i2 { get; set; } public S1? i3 { get; set; }
    public string? GetImage() => s1?.i ?? i2?.i ?? i3?.i;
    public int GetWidth() => s1?.w ?? i2?.w ?? i3?.w ?? 0;
    public int GetHeight() => s1?.h ?? i2?.h ?? i3?.h ?? 0;
    public long GetFileSize() => s1?.s ?? i2?.s ?? i3?.s ?? 0;
    public class S1 { public string i { get; set; } = ""; public int? w { get; set; } public int? h { get; set; } public long? s { get; set; } }
}