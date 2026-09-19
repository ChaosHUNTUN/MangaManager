using MangaManager.Services;

namespace MangaManager.Tests;

/// <summary>下载目录/文件名规则：{下载根目录}/{gid}-{清洗后的标题}/。</summary>
public class EhentaiFileHelperTests
{
    [Fact]
    public void SanitizeFileName_ReplacesInvalidCharacters()
    {
        var input = "a/b\\c:d*e?f\"g<h>i|j";

        var result = EhentaiFileHelper.SanitizeFileName(input);

        Assert.DoesNotContain(result, c => Path.GetInvalidFileNameChars().Contains(c));
        if (OperatingSystem.IsWindows())
        {
            Assert.Equal("a_b_c_d_e_f_g_h_i_j", result);
        }
    }

    [Fact]
    public void SanitizeFileName_KeepsNormalTitlesIntact()
        => Assert.Equal("[Author] Title (Chinese)", EhentaiFileHelper.SanitizeFileName("[Author] Title (Chinese)"));

    [Fact]
    public void GetGalleryLocalDir_PrefixesGidAndSanitizesTitle()
    {
        var original = EhentaiFileHelper.DefaultDownloadDir;
        var root = Path.Combine(Path.GetTempPath(), "MangaManager.Tests", Guid.NewGuid().ToString("N"));
        try
        {
            EhentaiFileHelper.DefaultDownloadDir = root;

            var dir = EhentaiFileHelper.GetGalleryLocalDir(1234567, "a/b:c");

            Assert.Equal(Path.Combine(root, "1234567-a_b_c"), dir);
        }
        finally
        {
            EhentaiFileHelper.DefaultDownloadDir = original;
        }
    }
}

