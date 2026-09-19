using MangaManager.Services;

namespace MangaManager.Tests;

/// <summary>
/// 本地搜索框分词：空格分隔、双引号内保持整体。
/// 历史 bug：`tag:"big breasts"` 被拆成两个词导致查不到任何结果。
/// </summary>
public class SearchTermTokenizerTests
{
    [Fact]
    public void KeepsQuotedPhraseAsSingleTerm()
        => Assert.Equal(new[] { "tag:big breasts" }, LocalGalleryService.SplitSearchTerms("tag:\"big breasts\""));

    [Fact]
    public void SplitsPlainTermsOnWhitespace()
        => Assert.Equal(new[] { "alpha", "beta" }, LocalGalleryService.SplitSearchTerms("alpha beta"));

    [Fact]
    public void CollapsesRepeatedWhitespaceAndTrimsEnds()
        => Assert.Equal(new[] { "alpha", "beta" }, LocalGalleryService.SplitSearchTerms("  alpha    beta  "));

    [Fact]
    public void HandlesMixedQuotedAndPlainTerms()
        => Assert.Equal(new[] { "tag:big breasts", "artist:someone" },
            LocalGalleryService.SplitSearchTerms("""tag:"big breasts" artist:someone"""));

    [Fact]
    public void StripsQuotesAndKeepsTrailingTokenWhenQuoteIsUnbalanced()
        => Assert.Equal(new[] { "tag:big breasts" }, LocalGalleryService.SplitSearchTerms("""tag:"big breasts"""));

    [Fact]
    public void ReturnsEmptyForBlankInput()
        => Assert.Empty(LocalGalleryService.SplitSearchTerms("   "));
}
