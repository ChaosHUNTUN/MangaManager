using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MangaManager.Core.Entities;
using MangaManager.Data;
using MangaManager.Services;

namespace MangaManager.Tests;

/// <summary>
/// 本地画廊搜索/筛选集成测试（真实 SQLite 内存库，跑的是生产 EF 查询）。
/// 覆盖历史真实故障：`tag:"big breasts"` 引号短语搜不到、下划线写法、
/// 多标签联合筛选（AND 语义）、作者精确匹配。
/// </summary>
public sealed class LocalGallerySearchTests : IDisposable
{
    private const int GidBigOnly = 101;
    private const int GidSmallOnly = 102;
    private const int GidBoth = 103;

    private readonly SqliteConnection _connection;
    private readonly ServiceProvider _provider;
    private readonly LocalGalleryService _service;
    private readonly int _tagBigBreasts;
    private readonly int _tagSmallBreasts;
    private readonly int _tagAuthor;

    public LocalGallerySearchTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var services = new ServiceCollection();
        services.AddDbContext<MangaDbContext>(o => o.UseSqlite(_connection));
        _provider = services.BuildServiceProvider();

        using (var scope = _provider.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<MangaDbContext>().Database.EnsureCreated();
        }

        (_tagBigBreasts, _tagSmallBreasts, _tagAuthor) = Seed();

        // 搜索/筛选路径只读数据库，不触碰 E-Hentai HTTP 客户端
        _service = new LocalGalleryService(
            null!,
            _provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<LocalGalleryService>.Instance);
    }

    private (int big, int small, int author) Seed()
    {
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

        var big = new Tag { Namespace = "female", Name = "big breasts", NameCn = "巨乳", Category = "female" };
        var small = new Tag { Namespace = "female", Name = "small breasts", NameCn = "贫乳", Category = "female" };
        var author = new Tag { Namespace = "artist", Name = "someone", Category = "author" };
        db.Tags.AddRange(big, small, author);

        var galleries = new[]
        {
            new LocalGallery { Gid = GidBigOnly, Title = "Big Breasts Story", DirPath = "d1" },
            new LocalGallery { Gid = GidSmallOnly, Title = "Small Breasts Story", DirPath = "d2" },
            new LocalGallery { Gid = GidBoth, Title = "Big Breasts Collection", DirPath = "d3", Language = "chinese" },
        };
        db.LocalGalleries.AddRange(galleries);

        db.WorkTags.AddRange(
            new WorkTag { WorkId = GidBigOnly, Tag = big },
            new WorkTag { WorkId = GidSmallOnly, Tag = small },
            new WorkTag { WorkId = GidBoth, Tag = big },
            new WorkTag { WorkId = GidBoth, Tag = author });

        db.SaveChanges();
        return (big.Id, small.Id, author.Id);
    }

    private List<int> SearchGids(string? search, string? group = null, List<int>? tagIds = null)
        => _service.GetPagedGalleries(group, search, "modified-desc", 1, 50, tagIds: tagIds)
            .Items.Select(i => i.Gid).OrderBy(g => g).ToList();

    [Fact]
    public void QuotedTagPhrase_MatchesTagWithSpace()
    {
        var gids = SearchGids("tag:\"big breasts\"");

        Assert.Equal(new[] { GidBigOnly, GidBoth }, gids);
    }

    [Fact]
    public void QuotedTagPhrase_MatchesChineseTagName()
    {
        var gids = SearchGids("tag:\"巨乳\"");

        Assert.Equal(new[] { GidBigOnly, GidBoth }, gids);
    }

    [Fact]
    public void UnderscoreTagSyntax_MatchesSpaceTag()
    {
        var gids = SearchGids("tag:big_breasts");

        Assert.Equal(new[] { GidBigOnly, GidBoth }, gids);
    }

    [Fact]
    public void QuotedTagPhrase_CombinesWithOtherTermsUsingAnd()
    {
        Assert.Equal(new[] { GidBoth }, SearchGids("tag:\"big breasts\" artist:someone"));
        Assert.Empty(SearchGids("tag:\"big breasts\" artist:nobody"));
    }

    [Fact]
    public void QuotedPhraseWithoutPrefix_MatchesTitle()
    {
        var gids = SearchGids("\"big breasts\"");

        Assert.Equal(new[] { GidBigOnly, GidBoth }, gids);
    }

    [Fact]
    public void MultipleTagIds_RequireAllTags()
    {
        Assert.Equal(new[] { GidBoth }, SearchGids(null, tagIds: new List<int> { _tagBigBreasts, _tagAuthor }));
        Assert.Empty(SearchGids(null, tagIds: new List<int> { _tagBigBreasts, _tagSmallBreasts }));
    }

    [Fact]
    public void SingleTagId_ReturnsAllWorksCarryingIt()
    {
        Assert.Equal(new[] { GidBigOnly, GidBoth }, SearchGids(null, tagIds: new List<int> { _tagBigBreasts }));
    }

    [Fact]
    public void ArtistGroupFilter_MatchesWorkInAnyPosition()
    {
        Assert.Equal(new[] { GidBoth }, SearchGids(null, group: "artist:someone"));
        Assert.Empty(SearchGids(null, group: "artist:nobody"));
    }

    [Fact]
    public void Paging_ClampsPageAndReportsTotals()
    {
        var result = _service.GetPagedGalleries(null, null, "modified-desc", 9, 2);

        Assert.Equal(3, result.Total);
        Assert.Equal(2, result.TotalPages);
        Assert.Equal(2, result.Page);
        Assert.Single(result.Items);
    }

    public void Dispose()
    {
        _provider.Dispose();
        _connection.Dispose();
    }
}
