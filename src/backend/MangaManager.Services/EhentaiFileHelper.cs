namespace MangaManager.Services;

/// <summary>E-Hentai 本地文件工具（从 EhentaiService 拆分）</summary>
public static class EhentaiFileHelper
{
    /// <summary>下载根目录，启动时由 Program.cs 注入配置值</summary>
    public static string DefaultDownloadDir { get; set; } = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "downloads");

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