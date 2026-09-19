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
    private readonly ConcurrentDictionary<int, CancellationTokenSource> _taskCts = new();  // gid → 单任务取消令牌
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
    public List<DownloadTask> GetAllTasks() => _tasks.Values
        .OrderBy(t => t.Status == "completed" ? 1 : 0)   // 活跃任务在前，已完成在后
        .ThenByDescending(t => t.Status == "completed" ? (t.CompletedAt ?? t.UpdatedAt) : t.CreatedAt)
        .ToList();

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
        _taskCts[gid] = new CancellationTokenSource();
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
        _taskCts.TryAdd(gid, new CancellationTokenSource());
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
        // 无论任务是否在内存字典中，都尝试删除 DB 记录（API 重启后历史已完成任务不在内存中）
        _tasks.TryRemove(gid, out var t);
        if (_taskCts.TryRemove(gid, out var cts))
        {
            try { cts.Cancel(); } finally { cts.Dispose(); }
        }
        var deleted = DeleteTaskFromDb(gid);
        if (!deleted && t == null) return false;
        BroadcastUpdate(new DownloadTask { Gid = gid, Status = "removed" });

        // 同步删除本地文件，释放下载目录空间（等待下载循环响应取消，避免文件被占用）
        if (t is { Status: "pending" or "downloading" })
            Thread.Sleep(1000);
        DeleteLocalFiles(gid);
        return true;
    }

    /// <summary>删除本地下载目录（{gid}-*），带重试；失败不阻断任务移除</summary>
    private void DeleteLocalFiles(int gid)
    {
        try
        {
            var baseDir = EhentaiFileHelper.DefaultDownloadDir;
            if (!Directory.Exists(baseDir)) return;
            var dir = Directory.GetDirectories(baseDir, $"{gid}-*").FirstOrDefault();
            if (dir == null) return;

            for (int i = 0; i < 3; i++)
            {
                try
                {
                    Directory.Delete(dir, true);
                    break;
                }
                catch (IOException) { Thread.Sleep(500); }
                catch (UnauthorizedAccessException) { Thread.Sleep(500); }
            }
            LocalGalleryService.InvalidateScanCache();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[Download] 删除本地文件失败 gid={Gid}，可稍后手动清理", gid);
        }
    }

    /// <summary>重启失败任务</summary>
    public DownloadTask? RestartTask(int gid)
    {
        if (!_tasks.TryGetValue(gid, out var t) || t.Status != "failed") return null;
        if (_taskCts.TryRemove(gid, out var oldCts))
        {
            try { oldCts.Cancel(); } finally { oldCts.Dispose(); }
        }

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
        catch { /* ReEnqueueFailed: best-effort cleanup */ }

        t.DownloadedPages = 0;
        t.FailedPages = 0;
        t.DownloadedBytes = 0;
        t.Status = "pending";
        t.ErrorMsg = null;
        t.StartedAt = null;
        t.CompletedAt = null;
        t.UpdatedAt = DateTime.UtcNow;

        _taskCts[gid] = new CancellationTokenSource();
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

    /// <summary>暂停全部活跃任务（pending/downloading），返回数量</summary>
    public int PauseAll()
    {
        var gids = _tasks.Values
            .Where(t => t.Status is "pending" or "downloading")
            .Select(t => t.Gid).ToList();
        foreach (var g in gids) PauseTask(g);
        return gids.Count;
    }

    /// <summary>恢复全部暂停任务，返回数量</summary>
    public int ResumeAll()
    {
        var gids = _tasks.Values
            .Where(t => t.Status == "paused")
            .Select(t => t.Gid).ToList();
        foreach (var g in gids) ResumeTask(g);
        return gids.Count;
    }

    /// <summary>从本地遗留 .progress 文件恢复下载任务（兼容旧版本未通过 DownloadManager 管理的任务）</summary>
    public DownloadTask? ResumeLegacyTask(int gid, string token, string title)
    {
        // 如果已有任务，直接返回
        if (_tasks.TryGetValue(gid, out var existing))
        {
            if (existing.Status is "completed") return existing;
            if (existing.Status == "failed")
                RestartTask(gid);
            else if (existing.Status == "paused")
                ResumeTask(gid);
            return _tasks.GetValueOrDefault(gid);
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
            catch { /* progress format may be partial */ }
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
            catch { /* directory scan for existing files, skip on error */ }
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
        _taskCts[gid] = new CancellationTokenSource();
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

    /// <summary>释放 SSE 通道（客户端断开时调用，防止 Channel 泄漏）</summary>
    public void ReleaseSseChannel(int? gid = null)
    {
        var key = gid ?? 0;
        if (_sseChannels.TryRemove(key, out var ch))
            ch.Writer.TryComplete();
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
        var taskCts = _taskCts.GetOrAdd(task.Gid, _ => new CancellationTokenSource());
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(ct, taskCts.Token);
        await _semaphore.WaitAsync(linkedCts.Token);
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

            await DownloadTaskAsync(task, linkedCts.Token);

            if (task.Status == "downloading")
            {
                // 未下载任何页 → failed（可能是 GetPages 返回空）
                if (task.DownloadedPages == 0 && task.TotalPages > 0)
                {
                    task.Status = "failed";
                    task.ErrorMsg = task.ErrorMsg ?? "未获取到任何图片页面，可能是网络问题或画廊已删除";
                }
                else if (task.FailedPages > 0)
                {
                    double successRate = task.TotalPages > 0 ? (double)task.DownloadedPages / task.TotalPages : 0;
                    // 成功率 >= 95% 视为完成（最后几页因网络波动失败可接受）
                    if (successRate >= 0.95)
                    {
                        task.Status = "completed";
                        task.ErrorMsg = $"{task.FailedPages} 页下载失败（成功率 {(successRate * 100):F1}%），可能是 EH 限速";
                    }
                    else
                    {
                        task.Status = "failed";
                        task.ErrorMsg = $"{task.FailedPages} 页下载失败（成功率 {(successRate * 100):F1}%）";
                    }
                }
                else
                {
                    task.Status = "completed";
                }
                task.CompletedAt = DateTime.UtcNow;

                // 下载完成后显式入库：不再依赖 FileSystemWatcher 的延迟兜底
                // （历史上"下载完成但本地库没有该作品"就出在这条隐式链路上）
                if (task.Status == "completed")
                {
                    try
                    {
                        var sync = _scopeFactory.CreateScope().ServiceProvider
                            .GetRequiredService<GallerySyncService>();
                        await sync.SyncDirectoryAsync(EhentaiFileHelper.GetGalleryLocalDir(task.Gid, task.Title));
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[DownloadManager] 完成后入库失败 gid={Gid}（watcher 仍会兜底）", task.Gid);
                    }
                }
            }
        }
        catch (OperationCanceledException) when (taskCts.IsCancellationRequested)
        {
            if (_tasks.ContainsKey(task.Gid))
            {
                task.Status = "failed";
                task.ErrorMsg = "任务已被移除或取消";
                task.CompletedAt = DateTime.UtcNow;
                _logger.LogInformation("[DownloadManager] 任务 {Gid} 已取消", task.Gid);
            }
        }
        catch (Exception ex)
        {
            if (_tasks.ContainsKey(task.Gid))
            {
                task.Status = "failed";
                task.ErrorMsg = ex.Message;
                task.CompletedAt = DateTime.UtcNow;
                _logger.LogInformation($"[DownloadManager] 任务 {task.Gid} 异常: {ex.Message}");
            }
        }
        finally
        {
            if (_tasks.ContainsKey(task.Gid))
            {
                task.UpdatedAt = DateTime.UtcNow;
                task.CalculateSpeed();
                UpdateTaskInDb(task);
                BroadcastUpdate(task);
            }
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

        var pages = await ehService.GetPagesAsync(task.Gid, task.Token, detail.IsExhentai);
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
            string? lastError = null;

            for (int retry = 0; retry < 3; retry++)
            {
                try
                {
                    if (p.ImageUrl.Contains("/s/"))
                    {
                        var (data, _) = await ehService.FetchImageFromPageAsync(p.ImageUrl, detail.IsExhentai);
                        if (data != null) { imageData = data; break; }
                        if (retry < 2) lastError = $"缩略页返回空数据 (URL: {p.ImageUrl})";
                    }
                    else
                    {
                        imageData = await ehService.FetchImageAsync(p.ImageUrl);
                        break;
                    }
                }
                catch (Exception ex)
                {
                    lastError = ex.Message;
                    if (retry < 2)
                    {
                        _logger.LogInformation("[DownloadManager] {Title} 第 {Page} 页重试 {Retry}: {Msg}", task.Title, i + 1, retry + 1, ex.Message);
                        await Task.Delay(1000 * (retry + 1), ct);
                    }
                }
            }

            if (imageData == null && lastError != null)
            {
                _logger.LogWarning("[DownloadManager] {Title} 第 {Page} 页下载失败 (共{Total}页): {Msg}", task.Title, i + 1, pages.Pages.Count, lastError);
                task.ErrorMsg = $"第 {i + 1} 页: {lastError}";
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
                catch { /* progress write is advisory, ignore failures */ }

                // 更新任务状态
                task.DownloadedPages = i + 1;
                task.DownloadedBytes = totalBytes;

                // 大画廊渐进延迟，避免触发 EH 限速
                if (task.TotalPages > 200 && i > 0 && i % 50 == 0)
                {
                    await Task.Delay(2000, ct);  // 每 50 页暂停 2s
                }
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
            try { if (File.Exists(progressFile)) File.Delete(progressFile); } catch { /* cleanup is best-effort */ }

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
            // 活跃任务全量 + 最近 100 条已完成（历史完成记录不在重启后消失；全量 2000+ 条会撑爆列表）
            var tasks = db.DownloadTasks
                .Where(t => t.Status != "completed")
                .ToList();
            tasks.AddRange(db.DownloadTasks
                .Where(t => t.Status == "completed")
                .OrderByDescending(t => t.CompletedAt ?? t.UpdatedAt)
                .Take(100)
                .ToList());

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
                _taskCts[t.Gid] = new CancellationTokenSource();
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

    private bool DeleteTaskFromDb(int gid)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var task = db.DownloadTasks.FirstOrDefault(t => t.Gid == gid);
            if (task == null) return false;
            db.DownloadTasks.Remove(task);
            db.SaveChanges();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 删除任务失败: {ex.Message}");
            return false;
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

            // 主动触发 GallerySync 同步此目录到 DB（修复下载完成时 FileSystemWatcher 竞态窗口）
            var gallerySync = scope.ServiceProvider.GetRequiredService<GallerySyncService>();
            await gallerySync.SyncDirectoryAsync(dir);
            _logger.LogInformation("[DownloadManager] 已同步到数据库: GID={Gid}, dir={Dir}", gid, dir);
        }
        catch (Exception ex)
        {
            _logger.LogInformation($"[DownloadManager] 写入元数据失败 (gid={gid}): {ex.Message}");
        }
    }
}
