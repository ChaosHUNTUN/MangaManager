using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MangaManager.Services;

public class NeeViewService
{
    private readonly string _neeViewPath;
    private readonly string _neeViewProfileDir;
    private readonly ILogger<NeeViewService> _logger;

    public NeeViewService(IConfiguration config, ILogger<NeeViewService> logger)
    {
        _neeViewPath = config.GetValue<string>("NeeView:Path")
            ?? @"D:\Program Files (x86)\NeeView44.0-Beta0805-fd\NeeView44.0-Beta0805-fd\NeeView.exe";

        // NeeView 的 Profile 目录（存储 History.json）
        var neeDir = Path.GetDirectoryName(_neeViewPath);
        _neeViewProfileDir = !string.IsNullOrEmpty(neeDir) ? Path.Combine(neeDir, "Profile") : string.Empty;

        _logger = logger;
    }

    public bool IsAvailable()
    {
        return File.Exists(_neeViewPath);
    }

    public string GetVersion()
    {
        if (!IsAvailable()) return "未知";
        var info = FileVersionInfo.GetVersionInfo(_neeViewPath);
        return info.FileVersion ?? "未知";
    }

    public bool OpenFolder(int mangaId, string folderPath, bool fullscreen = true)
    {
        if (!IsAvailable() || !Directory.Exists(folderPath))
        {
            _logger.LogWarning("NeeView 不可用或路径无效: {Path}", folderPath);
            return false;
        }

        try
        {
            var args = fullscreen ? $"--window=full \"{folderPath}\"" : $"\"{folderPath}\"";
            var psi = new ProcessStartInfo
            {
                FileName = _neeViewPath,
                Arguments = args,
                UseShellExecute = true
            };
            Process.Start(psi);

            _logger.LogInformation("NeeView 已启动: {Path}", folderPath);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "启动 NeeView 失败");
            return false;
        }
    }

    // 检测 NeeView 状态：进程是否在运行 + 是否正在阅读指定漫画
    public NeeViewStatus GetStatus(int mangaId, string expectedFolderPath)
    {
        var neeViewProcesses = Process.GetProcessesByName("NeeView");

        bool isRunning = neeViewProcesses.Length > 0;
        bool isReadingManga = false;

        if (isRunning)
        {
            // 方式1: 检查 History.json 中最新记录是否匹配此路径
            isReadingManga = CheckHistoryMatches(expectedFolderPath);

            // 方式2: 检查进程主窗口标题（备选）
            if (!isReadingManga)
            {
                isReadingManga = CheckWindowTitleMatches(neeViewProcesses, expectedFolderPath);
            }
        }

        return new NeeViewStatus
        {
            IsRunning = isRunning,
            IsReadingManga = isReadingManga,
            Message = isReadingManga ? "📖 正在阅读..."
                     : isRunning ? "📖 NeeView 运行中（非当前漫画）"
                     : null
        };
    }

    // 检查 NeeView 的 History.json 是否记录了目标路径
    private bool CheckHistoryMatches(string expectedFolderPath)
    {
        try
        {
            var historyFile = Path.Combine(_neeViewProfileDir, "History.json");
            if (!File.Exists(historyFile)) return false;

            var json = File.ReadAllText(historyFile);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.ValueKind != JsonValueKind.Array) return false;

            // 取最后一条（最新的）
            if (root.GetArrayLength() == 0) return false;

            var lastEntry = root[root.GetArrayLength() - 1];
            if (lastEntry.TryGetProperty("Path", out var pathProp))
            {
                var path = pathProp.GetString() ?? "";
                // 标准化路径比较
                return PathsMatch(path, expectedFolderPath);
            }
        }
        catch
        {
            // 读取失败，忽略
        }
        return false;
    }

    // 检查 NeeView 进程的窗口标题
    private static bool CheckWindowTitleMatches(Process[] processes, string expectedFolderPath)
    {
        foreach (var proc in processes)
        {
            try
            {
                var title = proc.MainWindowTitle;
                if (!string.IsNullOrEmpty(title) && title.Contains(
                    Path.GetFileName(expectedFolderPath), StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            catch
            {
                // 无法访问窗口标题
            }
        }
        return false;
    }

    // 标准化路径比较
    private static bool PathsMatch(string path1, string path2)
    {
        var normalized1 = path1.TrimEnd('\\', '/').ToLowerInvariant();
        var normalized2 = path2.TrimEnd('\\', '/').ToLowerInvariant();
        return normalized1.Equals(normalized2, StringComparison.OrdinalIgnoreCase);
    }
}

public class NeeViewStatus
{
    public bool IsRunning { get; set; }
    public bool IsReadingManga { get; set; }
    public string? Message { get; set; }
}
