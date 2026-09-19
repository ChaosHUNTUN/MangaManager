using MangaManager.Services;

namespace MangaManager.Tests;

/// <summary>
/// 标签纯逻辑测试：命名空间归一化、分类/颜色映射、AllTags JSON 解析。
/// 这几处是标签化管理系统（全量标签 + work_tag）的数据入口，出错会静默污染整库。
/// </summary>
public class TagServiceTests
{
    [Theory]
    [InlineData(null, "other")]
    [InlineData("", "other")]
    [InlineData("   ", "other")]
    [InlineData("ARTIST", "artist")]
    [InlineData("  Female  ", "female")]
    public void NormalizeNs_NormalizesNamespace(string? input, string expected)
        => Assert.Equal(expected, TagService.NormalizeNs(input));

    [Theory]
    [InlineData("artist", "author")]
    [InlineData("group", "translator")]
    [InlineData("female", "female")]
    [InlineData("album", "album")]
    [InlineData("Artist", "author")]
    [InlineData("", "other")]
    [InlineData("nonexistent-ns", "other")]
    public void CategoryOf_MapsNamespaceToCategory(string input, string expected)
        => Assert.Equal(expected, TagService.CategoryOf(input));

    [Fact]
    public void ColorOf_ReturnsColorForEveryKnownCategory()
    {
        foreach (var ns in TagService.NsToCategory.Keys)
        {
            var color = TagService.ColorOf(ns);
            Assert.Matches("^#[0-9a-fA-F]{6}$", color);
        }
    }

    [Fact]
    public void ColorOf_UnknownNamespaceFallsBackToDefault()
        => Assert.Equal("#6366f1", TagService.ColorOf("no-such-namespace"));

    [Fact]
    public void ParseAllTagsJson_ReturnsEmptyForBlankInput()
    {
        Assert.Empty(TagService.ParseAllTagsJson(null));
        Assert.Empty(TagService.ParseAllTagsJson(""));
        Assert.Empty(TagService.ParseAllTagsJson("   "));
    }

    [Fact]
    public void ParseAllTagsJson_SplitsNamespaceAndKeepsSpacesInName()
    {
        var pairs = TagService.ParseAllTagsJson("""["female:big breasts","artist:someone"]""");

        Assert.Equal(2, pairs.Count);
        Assert.Equal(("female", "big breasts"), pairs[0]);
        Assert.Equal(("artist", "someone"), pairs[1]);
    }

    [Fact]
    public void ParseAllTagsJson_TreatsItemsWithoutNamespaceAsOther()
    {
        var pairs = TagService.ParseAllTagsJson("""["no-namespace-here"]""");

        Assert.Equal(("other", "no-namespace-here"), Assert.Single(pairs));
    }

    [Fact]
    public void ParseAllTagsJson_SkipsEmptyNamesAndInvalidJson()
    {
        Assert.Empty(TagService.ParseAllTagsJson("""["female:","artist:   "]"""));
        Assert.Empty(TagService.ParseAllTagsJson("{ not json }"));
    }
}

