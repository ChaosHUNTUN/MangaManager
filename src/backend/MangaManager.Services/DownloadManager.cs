using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MangaManager.Core.Entities;
using MangaManager.Data;

namespace MangaManager.Services;

/// <summary>
/// 下载管理器：队列管理、并发控制、进度追踪、异常重启
/// 通过 SSE 事件流向所有连接的客户端广播下载状态更新
/// </summary>
public class DownloadManager
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DownloadManager> _logger;
    private readonly ConcurrentDictionary<int, DownloadTask> _tasks = new();    // gid → 任务
    private readonly ConcurrentQueue<int> _queue = new();                       // 等待队列
    private readonly SemaphoreSlim _semaphore = new(2, 2);                     // 最多 2 个并发下载
    private readonly object _dbLock = new();
    private CancellationTokenSource? _cts;
    private Task? _workerTask;

    // SSE 通道集合（用于向 HTTP 长连接客户端推送下载进度）
    private readonly ConcurrentDictionary<int, System.Threading.Channels.Channel<string>> _sseChannels = new();

    // 进度广播事件
    public event Action<DownloadTask>? OnTaskUpdated;

    public DownloadManager(IServiceScopeFactory scopeFactory, ILogger<DownloadManager> logger)
    {
        _logger = logger;
        _scopeFactory = scopeFactory;
        StartWorker();
    }

    /// <summary>异步初始化：从数据库加载未完成任务（不阻塞构造）</summary>
    public async Task InitializeAsync()
    {
        await Task.Run(LoadTasksFromDb);
    }

    // ==================== 公开 API ====================

    /// <summary>获取所有任务（含已完成）</summary>
    public List<DownloadTask> GetAllTasks() => _tasks.Values.OrderByDescending(t => t.CreatedAt).ToList();

    /// <summary>获取活跃任务（pending + downloading + paused）</summary>
    public List<DownloadTask> GetActiveTasks() =>
        _tasks.Values.Where(t => t.Status is "pending" or "downloading" or "paused").OrderBy(t => t.CreatedAt).ToList();

    /// <summary>获取单个任务</summary>
    public DownloadTask? GetTask(int gid) => _tasks.TryGetValue(gid, out var t) ? t : null;

    /// <summary>添加下载任务（自动去重）</summary>
    public DownloadTask? AddTask(int gid, string token, string title, string? coverUrl = null)
    {
        if (_tasks.TryGetValue(gid, out var existing))
        {
            if (existing.Status is "completed") return existing; // 已完成则跳过
            if (existing.Status is "paused")
            {
                ResumeTask(gid);
                return existing;
            }
            return existing; // 已在队列或下载中
        }

        var task = new DownloadTask
        {
            Gid = gid,
            Token = token,
            Title = title,
            CoverUrl = coverUrl,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _tasks[gid] = task;
        _queue.Enqueue(gid);
        SaveTaskToDb(task);
        BroadcastUpdate(task);

        // 触发工作线程
        _ = ProcessQueueAsync();

        return task;
    }

    /// <summary>暂停任务</summary>
    public bool PauseTask(int gid)
    {
        if (!_tasks.TryGetValue(gid, out var t) || t.Status is not ("pending" or "downloading")) return false;
        t.Status = "paused";
        t.UpdatedAt = DateTime.UtcNow;
        UpdateTaskInDb(t);
        BroadcastUpdate(t);
        return true;
    }

    /// <summary>恢复任务</summary>
    public bool ResumeTask(int gid)
    {
        if (!_tasks.TryGetValue(gid, out var t) || t.Status != "paused") return false;
        t.Status = "pending";
        t.ErrorMsg = null;
        t.UpdatedAt = DateTime.UtcNow;
        _queue.Enqueue(gid);
        UpdateTaskInDb(t);
        BroadcastUpdate(t);
        _ = ProcessQueueAsync();
        return true;
    }

    /// <summary>取消/移除任务</summary>
    public bool RemoveTask(int gid)
    {
        if (!_tasks.TryRemove(gid, out var t)) return false;
        DeleteTaskFromDb(gid);
        BroadcastUpdate(new DownloadTask { Gid = gid, Status = "removed" });
        return true;
    }

    /// <summary>重启失败任务</summary>
    public DownloadTask? RestartTask(int gid)
    {
        if (!_tasks.TryGetValue(gid, out var t) || t.Status != "failed") return null;

        // 删除本地进度文件和已下载的部分文件
        try
        {
            var dir = EhentaiFileHelper.GetGalleryLocalDir(gid, t.Title);
            if (Directory.Exists(dir))
            {
                var progressFile = Path.Combine(dir, ".progress");
                if (File.Exists(progressFile)) File.Delete(progressFile);
            }
        }
        catch { }

        t.DownloadedPages = 0;
        t.FailedPages = 0;
        t.DownloadedBytes = 0;
        t.Status = "pending";
        t.ErrorMsg = null;
        t.StartedAt = null;
        t.CompletedAt = null;
        t.UpdatedAt = DateTime.UtcNow;

        _queue.Enqueue(gid);
        UpdateTaskInDb(t);
        BroadcastUpdate(t);
        _ = ProcessQueueAsync();
        return t;
    }

    /// <summary>重启所有失败任务</summary>
    public int RestartAllFailed()
    {
        var failed = _tasks.Values.Where(t => t.Status == "failed").ToList();
        foreach (var t in failed) RestartTask(t.Gid);
        return failed.Count;
    }

    /// <summary>从本地遗留 .progress 文件恢复下载任务（兼容旧版本未通过 DownloadManager 管理的任务）</summary>
    public DownloadTask? ResumeLegacyTask(int gid, string token, string title)
    {
        // 如果已有任务，直接返回
        if (_tasks.TryGetValue(gid, out var existing))
        {
            if (existing.Status is "completed") return existing;
            if (existing.Status is "failed" or "paused")
            {
                RestartTask(gid);
                return _tasks.GetValueOrDefault(gid);
            }
            return existing;
        }

        // 优先通过 gid 前缀匹配目录（避免 title 中特殊字符导致路径不匹配）
        var downloadDir = Directory.GetDirectories(EhentaiFileHelper.DefaultDownloadDir, $"{gid}-*").FirstOrDefault();
        if (downloadDir == null)
        {
            downloadDir = EhentaiFileHelper.GetGalleryLocalDir(gid, title);
        }
        var progressFile = Path.Combine(downloadDir, ".progress");

        // 检查是否有遗留进度文件或已有图片文件
        bool hasProgress = System.IO.File.Exists(progressFile);
        bool hasFiles = Directory.Exists(downloadDir) && Directory.GetFiles(downloadDir)
            .Any(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                   || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                   || f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                   || f.EndsWith(".gif", StringComparison.OrdinalIgnoreCase));

        if (!hasProgress && !hasFiles)
        {
            return AddTask(gid, token, title);
        }

        // 用实际目录名作为 title
        var actualDirName = Path.GetFileName(downloadDir);
        var dashIdx = actualDirName.IndexOf('-');
        var actualTitle = dashIdx > 0 ? actualDirName[(dashIdx + 1)..] : actualDirName;

        // 读取 .progress 获取断点
        int downloadedPages = 0;
        long downloadedBytes = 0;
        if (hasProgress)
        {
            try
            {
                var text = System.IO.File.ReadAllText(progressFile).Trim();
                var parts = text.Split('|');
                if (parts.Length > 0) int.TryParse(parts[0], out downloadedPages);
                if (parts.Length > 2) long.TryParse(parts[2], out downloadedBytes);
            }
            catch { }
        }

        // 如果没有 .progress 但有文件，通过文件数量推断
        if (downloadedPages == 0 && hasFiles)
        {
            downloadedPages = Directory.GetFiles(downloadDir)
                .Count(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                         || f.EndsWith(".gif", StringComparison.OrdinalIgnoreCase));
        }

        // 统计已下载的文件大小
        if (downloadedBytes == 0 && hasFiles)
        {
            try
            {
                downloadedBytes = Directory.GetFiles(downloadDir)
                    .Where(f => f.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase)
                             || f.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                             || f.EndsWith(".webp", StringComparison.OrdinalIgnoreCase)
                             || f.EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
                    .Sum(f => new FileInfo(f).Length);
            }
            catch { }
        }

        var task = new DownloadTask
        {
            Gid = gid,
            Token = token,
            Title = actualTitle,
            DownloadedPages = downloadedPages,
            DownloadedBytes = downloadedBytes,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _tasks[gid] = task;
        _queue.Enqueue(gid);
        SaveTaskToDb(task);
        BroadcastUpdate(task);
        _ = ProcessQueueAsync();

        _logger.LogInformation($"[DownloadManager] 恢复遗留任务 {title}: 从第 {downloadedPages + 1} 页继续, 已下载 {downloadedBytes} bytes");
        return task;
    }

    /// <summary>获取或创建 SSE 通道（用于 HTTP 长连接进度推送）</summary>
    public System.Threading.Channels.Channel<string> GetOrCreateSseChannel(int? gid = null)
    {
        var key = gid ?? 0;
        return _sseChannels.GetOrAdd(key, _ =>
            System.Threading.Channels.Channel.CreateBounded<string>(new System.Threading.Channels.BoundedChannelOptions(64)
            {
                FullMode = System.Threading.Channels.BoundedChannelFullMode.DropOldest
            }));
    }

    // ==================== 内部逻辑 ====================

    private void BroadcastUpdate(DownloadTask task)
    {
        OnTaskUpdated?.Invoke(task);

        var json = JsonSerializer.Serialize(new
        {
            type = "download_update",
            data = new
            {
                task.Gid, task.Title, task.TotalPages, task.DownloadedPages,
                task.FailedPages, task.DownloadedBytes, task.Status, task.ErrorMsg,
                task.CoverUrl,
                progress = task.ProgressPercent,
                speed = task.SpeedText,
                speedBps = task.SpeedBps
            }
        });

        // SSE 广播（全局通道 + 单任务通道）
        BroadcastSse(0, json);
        BroadcastSse(task.Gid, json);
    }

    private void BroadcastSse(int key, string data)
    {
        if (_sseChannels.TryGetValue(key, out var ch))
        {
            ch.Writer.TryWrite($"data: {data}\n\n");
        }
    }

    private void StartWorker()
    {
        _cts = new CancellationTokenSource();
        _workerTask = Task.Run(() => ProcessLoopAsync(_cts.Token));
    }

    private async Task ProcessLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            if (_queue.TryDequeue(out var gid))
            {
                if (!_tasks.TryGetValue(gid, out var task) || task.Status != "pending")
                    continue;

                _ = Task.Run(async () => await ExecuteTaskAsync(task, ct), ct);
            }
            await Task.Delay(500, ct);
        }
    }

    private async Task ProcessQueueAsync()
    {
        // 非阻塞触发
        await Task.CompletedTask;
    }

    private async Task ExecuteTaskAsync(DownloadTask task, CancellationToken ct)
    {
        await _semaphore.WaitAsync(ct);
        try
        {
            if (task.Status != "pending") return;

            task.Status = "downloading";
            task.StartedAt = DateTime.UtcNow;
            task.UpdatedAt = DateTime.UtcNow;
            task.LastSpeedTime = DateTime.UtcNow;
            task.LastBytes = 0;
            task.SpeedBps = 0;
            UpdateTaskInDb(task);
            BroadcastUpdate(task);

            await DownloadTaskAsync(task, ct);

            if (task.Status == "downloading")
            {
                // 部分成功 → failed，允许用户重试下载
                task.Status = task.FailedPages > 0 ? "failed" : "completed";
                task.CompletedAt = DateTime.UtcNow;
            }
        }
        catch (Exception ex)
        {
            task.Status = "failed";
            task.ErrorMsg = ex.Message;
            task.CompletedAt = DateTime.UtcNow;
            _logger.LogInformation($"[DownloadManager] 任务 {task.Gid} 异常: {ex.Message}");
        }
        finally
        {
            task.UpdatedAt = DateTime.UtcNow;
            task.CalculateSpeed();
            UpdateTaskInDb(task);
            BroadcastUpdate(task);
            _semaphore.Release();
        }
    }

    private async Task DownloadTaskAsync(DownloadTask task, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var ehService = scope.ServiceProvider.GetRequiredService<EhentaiService>();

        // 获取详情和总页数
        var detail = await ehService.GetGalleryDetailAsync(task.Gid, task.Token);
        task.Title = detail.Title;
        task.TotalPages = detail.FileCount > 0 ? detail.FileCount : task.TotalPages;
        task.UpdatedAt = DateTime.UtcNow;
        UpdateTaskInDb(task);
        BroadcastUpdate(task);

        // 用 gid 前缀匹配已有目录（支持从遗留目录继续下载）
        var downloadDir = System.IO.Directory.GetDirectories(EhentaiFileHelper.DefaultDownloadDir, $"{task.Gid}-*").FirstOrDefault();
        if (downloadDir == null)
        {
            downloadDir = EhentaiFileHelper.GetGalleryLocalDir(task.Gid, task.Title);
        }
        System.IO.Directory.CreateDirectory(downloadDir);

        // 读取 .progress 断点续传
        var progressFile = System.IO.Path.Combine(downloadDir, ".progress");
        int startFrom = task.DownloadedPages; // 优先用任务已有的 DownloadedPages（来自 ResumeLegacyTask）
        if (System.IO.File.Exists(progressFile))
        {
            var text = await System.IO.File.ReadAllTextAsync(progressFile, ct);
            text = text.Trim();
            var parts = text.Split('|');
            if (parts.Length > 0 && int.TryParse(parts[0], out var saved) && saved > startFrom)
                startFrom = saved; // .progress 中的值更大则用它
            if (parts.Length > 1 && int.TryParse(parts[1], out var total) && task.TotalPages == 0)
                task.TotalPages = total;
            if (parts.Length > 2 && long.TryParse(parts[2], out var bytes) && bytes > task.DownloadedBytes)
                task.DownloadedBytes = bytes;
            _logger.LogInformation($"[DownloadManager] {task.Title} 从第 {startFrom + 1} 页继续 (已下载 {task.DownloadedBytes} bytes)");
        }

        var pages = await ehService.GetPagesAsync(task.Gid, task.Token);
        if (task.TotalPages == 0) task.TotalPages = pages.Pages.Count;

        task.DownloadedPages = startFrom;
        task.UpdatedAt = DateTime.UtcNow;
        UpdateTaskInDb(task);
        BroadcastUpdate(task);

        _logger.LogInformation($"[DownloadManager] 开始下载 {task.Title} ({task.TotalPages} 页)");

        int success = task.DownloadedPages, failed = task.FailedPages;
        long totalBytes = task.DownloadedBytes;

        for (int i = startFrom; i < pages.Pages.Count; i++)
        {
            ct.ThrowIfCancellationRequested();

            // 检查暂停
            if (task.Status == "paused") break;

            var p = pages.Pages[i];
            byte[]? imageData = null;

            for (int retry = 0; retry < 3; retry++)
            {
                try
                {
                    if (p.ImageUrl.Contains("/s/"))
                    {
                        var (data, _) = await ehService.FetchImageFromPageAsync(p.ImageUrl);
                        if (data != null) { imageData = data; break; }
                    }
                    else
                    {
                        imageData = await ehService.FetchImageAsync(p.ImageUrl);
                        break;
                    }
                }
                catch (Exception ex)
                {
                    if (retry < 2)
                    {
                        _logger.LogInformation($"[DownloadManager] {task.Title} 第 {i + 1} 页重试 {retry + 1}: {ex.Message}");
                        await Task.Delay(1000 * (retry + 1), ct);
                    }
                }
            }

            if (imageData != null && imageData.Length > 0)
            {
                var ext = ".jpg";
                if (imageData.Length > 3 && imageData[0] == 0xFF && imageData[1] == 0xD8) ext = ".jpg";
                else if (imageData.Length > 4 && imageData[0] == 0x89 && imageData[1] == 0x50) ext = ".png";
                else if (imageData.Length > 4 && imageData[0] == 0x52 && imageData[1] == 0x49) ext = ".webp";
                else if (imageData.Length > 3 && imageData[0] == 0x47 && imageData[1] == 0x49) ext = ".gif";

                var filePath = Path.Combine(downloadDir, $"{i + 1:D4}{ext}");
                await File.WriteAllBytesAsync(filePath, imageData, ct);
                success++;
                totalBytes += imageData.Length;

                // 更新进度文件（扩展格式）
                try
                {
                    await File.WriteAllTextAsync(progressFile, $"{i + 1}|{task.TotalPages}|{totalBytes}", ct);
                }
                catch { }

                // 更新任务状态
                task.DownloadedPages = i + 1;
                task.DownloadedBytes = totalBytes;
                task.FailedPages = failed;
                task.CalculateSpeed();
                task.UpdatedAt = DateTime.UtcNow;

                // 每 5 页或最后一张时更新数据库和广播
                if ((i + 1) % 5 == 0 || i >= pages.Pages.Count - 1)
                {
                    UpdateTaskInDb(task);
                }
                BroadcastUpdate(task);

                if (i < pages.Pages.Count - 1)
                    await Task.Delay(500, ct);
            }
            else
            {
                failed++;
                task.FailedPages = failed;
                task.UpdatedAt = DateTime.UtcNow;
                if ((i + 1) % 5 == 0)
                {
                    UpdateTaskInDb(task);
                    BroadcastUpdate(task);
                }
            }
        }

        // 下载完成
        if (task.Status == "downloading")
        {
            try { if (File.Exists(progressFile)) File.Delete(progressFile); } catch { }

            var ehFile = Path.Combine(downloadDir, ".eh");
            await File.WriteAllLinesAsync(ehFile, new[] { $"gid={task.Gid}", $"token={task.Token}" });

            // 写入元数据文件
            await WriteMetaJsonAsync(downloadDir, task.Gid);

            task.DownloadedPages = success;
            task.FailedPages = failed;
            task.DownloadedBytes = totalBytes;
        }
    }

    // ==================== 数据库持久化 ====================

    private void LoadTasksFromDb()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var tasks = db.DownloadTasks
                .Where(t => t.Status != "completed")
                .ToList();

            foreach (var t in tasks)
            {
                // 修复空 title
                if (string.IsNullOrEmpty(t.Title) || t.Title.StartsWith("Gallery #"))
                {
                    t.Title = $"Gallery {t.Gid}";
                }

                // 中断的任务自动恢复（断点续传：.progress 文件保留已下载页码）
                if (t.Status == "downloading")
                {
                    t.Status = "pending";
                    t.ErrorMsg = null;
                    t.UpdatedAt = DateTime.UtcNow;
                }
                _tasks[t.Gid] = t;
                if (t.Status == "pending") _queue.Enqueue(t.Gid);
            }
            db.SaveChanges();
            _logger.LogInformation($"[DownloadManager] 加载了 {tasks.Count} 个未完成任务");
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 加载任务失败: {ex.Message}");
        }
    }

    private void SaveTaskToDb(DownloadTask task)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            db.DownloadTasks.Add(task);
            db.SaveChanges();
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 保存任务失败: {ex.Message}");
        }
    }

    private void UpdateTaskInDb(DownloadTask task)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var existing = db.DownloadTasks.FirstOrDefault(t => t.Gid == task.Gid);
            if (existing != null)
            {
                existing.Title = task.Title;
                existing.TotalPages = task.TotalPages;
                existing.DownloadedPages = task.DownloadedPages;
                existing.FailedPages = task.FailedPages;
                existing.DownloadedBytes = task.DownloadedBytes;
                existing.Status = task.Status;
                existing.ErrorMsg = task.ErrorMsg;
                existing.StartedAt = task.StartedAt;
                existing.CompletedAt = task.CompletedAt;
                existing.UpdatedAt = DateTime.UtcNow;
                db.SaveChanges();
            }
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 更新任务失败: {ex.Message}");
        }
    }

    private void DeleteTaskFromDb(int gid)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var task = db.DownloadTasks.FirstOrDefault(t => t.Gid == gid);
            if (task != null) { db.DownloadTasks.Remove(task); db.SaveChanges(); }
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 删除任务失败: {ex.Message}");
        }
    }

    /// <summary>下载完成后写入 .meta.json 元数据文件</summary>
    private async Task WriteMetaJsonAsync(string dir, int gid)
    {
        try
        {
            // 从 .eh 文件读取 token
            var ehFile = Path.Combine(dir, ".eh");
            string? token = null;
            if (File.Exists(ehFile))
            {
                foreach (var line in await File.ReadAllLinesAsync(ehFile))
                {
                    if (line.StartsWith("token=")) { token = line[6..]; break; }
                }
            }
            if (string.IsNullOrEmpty(token)) return;

            using var scope = _scopeFactory.CreateScope();
            var ehService = scope.ServiceProvider.GetRequiredService<EhentaiService>();
            var detail = await ehService.GetGalleryDetailAsync(gid, token);

            var meta = new
            {
                gid = detail.Gid,
                title = detail.Title,
                titleJpn = detail.TitleJpn,
                category = detail.Category,
                uploader = detail.Uploader,
                rating = detail.Rating,
                ratingCount = detail.RatingCount,
                fileCount = detail.FileCount,
                fileSize = detail.FileSize,
                language = detail.Language,
                tags = detail.TagGroups?.ToDictionary(
                    g => g.Namespace.ToLower(),
                    g => g.Tags
                ),
                downloadedAt = DateTime.UtcNow.ToString("o")
            };

            var json = System.Text.Json.JsonSerializer.Serialize(meta, new System.Text.Json.JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
            await File.WriteAllTextAsync(Path.Combine(dir, ".meta.json"), json);
            _logger.LogInformation($"[DownloadManager] 元数据已写入: {dir}/.meta.json");

            // 自动分配作品到匹配的专辑
            await AutoAssignToAlbumsAsync(scope, gid, detail.TagGroups);

            // 主动触发 GallerySync 同步此目录到 DB（修复下载完成时 FileSystemWatcher 竞态窗口）
            var gallerySync = scope.ServiceProvider.GetRequiredService<GallerySyncService>();
            await gallerySync.SyncDirectoryAsync(dir);
            _logger.LogInformation("[DownloadManager] 已同步到数据库: GID={Gid}, dir={Dir}", gid, dir);
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 写入元数据/AutoAssign失败 (gid={gid}): {ex.Message}");
        }
    }

    /// <summary>根据作品标签自动分配到匹配的专辑（KeyTag 格式: "namespace:tag"）</summary>
    private static async Task AutoAssignToAlbumsAsync(IServiceScope scope, int gid, List<EhentaiService.TagGroup>? tagGroups)
    {
        if (tagGroups == null || tagGroups.Count == 0) return;
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var albums = db.AlbumConfigs.Where(a => a.KeyTag != null).ToList();
            var matchedAlbums = new List<(string Key, int Priority)>();

            foreach (var album in albums)
            {
                if (string.IsNullOrEmpty(album.KeyTag)) continue;
                var colonIdx = album.KeyTag.IndexOf(':');
                if (colonIdx <= 0) continue;
                var ns = album.KeyTag[..colonIdx].ToLower();
                var tag = album.KeyTag[(colonIdx + 1)..];

                var group = tagGroups.FirstOrDefault(g => g.Namespace.Equals(ns, StringComparison.OrdinalIgnoreCase));
                if (group != null && group.Tags.Any(t => t.Equals(tag, StringComparison.OrdinalIgnoreCase)))
                {
                    var priority = ns switch { "artist" => 1, "group" => 2, _ => 3 };
                    matchedAlbums.Add((album.Key, priority));
                }
            }

            if (matchedAlbums.Count == 0) return;

            // 添加到所有匹配专辑的 Gids
            foreach (var (albumKey, _) in matchedAlbums)
            {
                var album = albums.First(a => a.Key == albumKey);
                var gids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(album.Gids) ?? new();
                if (!gids.Contains(gid))
                {
                    gids.Add(gid);
                    album.Gids = System.Text.Json.JsonSerializer.Serialize(gids);
                    album.Count = gids.Count;
                }
            }

            // AlbumKey 设为最高优先级匹配的专辑
            var best = matchedAlbums.OrderBy(m => m.Priority).First().Key;
            var gallery = await db.LocalGalleries.FindAsync(gid);
            if (gallery != null) gallery.AlbumKey = best;

            await db.SaveChangesAsync();
            Console.WriteLine($"[DownloadManager] 自动分配 gid={gid} 到 {matchedAlbums.Count} 个专辑: [{string.Join(", ", matchedAlbums.Select(m => m.Key))}]");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DownloadManager] 自动分配异常 (gid={gid}): {ex.Message}");
        }
    }
}
