using MangaManager.Services;

namespace MangaManager.Tests;

/// <summary>中文搜索词 → 英文标签映射（在线模块搜索框会先过这一步）。</summary>
public class EhentaiTagServiceTests
{
    [Theory]
    [InlineData("巨乳", "big breasts")]
    [InlineData("全彩", "full color")]
    [InlineData("汉化", "chinese")]
    [InlineData("无修", "uncensored")]
    public void TranslateChineseSearch_MapsCommonChineseTerms(string input, string expected)
        => Assert.Equal(expected, EhentaiTagService.TranslateChineseSearch(input));

    [Fact]
    public void TranslateChineseSearch_LeavesEnglishQueriesUntouched()
        => Assert.Equal("big breasts", EhentaiTagService.TranslateChineseSearch("big breasts"));

    [Fact]
    public void TranslateChineseSearch_MapsTermsInsideLargerQuery()
        => Assert.Equal("big breasts language:chinese", EhentaiTagService.TranslateChineseSearch("巨乳 language:汉化"));

    [Fact]
    public void SuggestTags_ReturnsEmptyBeforeIndexIsLoaded()
        => Assert.Empty(EhentaiTagService.SuggestTags("breasts"));
}

