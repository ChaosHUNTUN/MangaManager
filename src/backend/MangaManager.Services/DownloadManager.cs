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
        if (!_tasks.TryRemove(gid, out var t)) return false;
        if (_taskCts.TryRemove(gid, out var cts))
        {
            try { cts.Cancel(); } finally { cts.Dispose(); }
        }
        DeleteTaskFromDb(gid);
        BroadcastUpdate(new DownloadTask { Gid = gid, Status = "removed" });
        return true;
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

    /// <summary>自动分配作品到专辑：优先匹配已有 KeyTag 专辑 → 无匹配则自动创建 → 兜底到未分类</summary>
    private static async Task AutoAssignToAlbumsAsync(IServiceScope scope, int gid, List<TagGroup>? tagGroups)
    {
        if (tagGroups == null || tagGroups.Count == 0) return;
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();
            var allAlbums = db.AlbumConfigs.ToList();
            var albumsWithKeyTag = allAlbums.Where(a => !string.IsNullOrEmpty(a.KeyTag)).ToList();
            var matchedAlbums = new List<(string Key, int Priority)>();

            // 第1步：匹配已有 KeyTag 专辑（仅限 artist / group 命名空间）
            foreach (var album in albumsWithKeyTag)
            {
                var colonIdx = album.KeyTag!.IndexOf(':');
                if (colonIdx <= 0) continue;
                var ns = album.KeyTag[..colonIdx].ToLower();
                // 只允许 artist 和 group 命名空间的 KeyTag 参与自动匹配，
                // 排除 other / language / parody 等泛化标签（避免产生“超级桶”）
                if (ns is not "artist" and not "group") continue;
                var tag = album.KeyTag[(colonIdx + 1)..];
                var group = tagGroups.FirstOrDefault(g => g.Namespace.Equals(ns, StringComparison.OrdinalIgnoreCase));
                if (group != null && group.Tags.Any(t => t.Equals(tag, StringComparison.OrdinalIgnoreCase)))
                {
                    var priority = ns switch { "artist" => 1, "group" => 2, _ => 3 };
                    matchedAlbums.Add((album.Key, priority));
                }
            }

            var assignedAlbumKey = (string?)null;

            if (matchedAlbums.Count > 0)
            {
                // 已有匹配 → 直接加入
                assignedAlbumKey = AddGidToMatchedAlbums(db, allAlbums, gid, matchedAlbums);
            }
            else
            {
                // 第2步：无匹配 → 自动创建专辑
                assignedAlbumKey = AutoCreateAlbumFromTags(db, allAlbums, gid, tagGroups);
            }

            // 第3步：多作者检查
            var artistTags = tagGroups
                .Where(g => g.Namespace.Equals("artist", StringComparison.OrdinalIgnoreCase))
                .SelectMany(g => g.Tags).Distinct().ToList();
            var groupTags = tagGroups
                .Where(g => g.Namespace.Equals("group", StringComparison.OrdinalIgnoreCase))
                .SelectMany(g => g.Tags).Distinct().ToList();
            if (artistTags.Count > 1 || groupTags.Count > 1)
            {
                assignedAlbumKey = EnsureFunctionalAlbum(db, allAlbums, gid, "multi", "多作者", "#e85347", assignedAlbumKey);
            }

            // 第4步：兜底 — 如果仍然没有任何专辑分配，放入未分类
            if (assignedAlbumKey == null)
            {
                assignedAlbumKey = EnsureFunctionalAlbum(db, allAlbums, gid, "__uncategorized__", "未分类", "#888888", null);
            }

            await db.SaveChangesAsync();
            Console.WriteLine($"[DownloadManager] AutoAssign gid={gid} → Album={assignedAlbumKey}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DownloadManager] 自动分配异常 (gid={gid}): {ex.Message}");
        }
    }

    /// <summary>将 gid 加入匹配专辑列表，返回最高优先级的专辑 key</summary>
    private static string AddGidToMatchedAlbums(MangaDbContext db, List<AlbumConfig> allAlbums,
        int gid, List<(string Key, int Priority)> matchedAlbums)
    {
        foreach (var (albumKey, _) in matchedAlbums)
        {
            var album = allAlbums.First(a => a.Key == albumKey);
            var gids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(album.Gids) ?? new();
            if (!gids.Contains(gid))
            {
                gids.Add(gid);
                album.Gids = System.Text.Json.JsonSerializer.Serialize(gids);
                album.Count = gids.Count;
            }
        }
        return matchedAlbums.OrderBy(m => m.Priority).First().Key;
    }

    /// <summary>从作品的 artist/group 标签自动创建专辑，返回新专辑的 key</summary>
    private static string? AutoCreateAlbumFromTags(MangaDbContext db, List<AlbumConfig> allAlbums,
        int gid, List<TagGroup> tagGroups)
    {
        var artistTags = tagGroups
            .Where(g => g.Namespace.Equals("artist", StringComparison.OrdinalIgnoreCase))
            .SelectMany(g => g.Tags).Where(t => !string.IsNullOrWhiteSpace(t)).Distinct().ToList();
        var groupTags = tagGroups
            .Where(g => g.Namespace.Equals("group", StringComparison.OrdinalIgnoreCase))
            .SelectMany(g => g.Tags).Where(t => !string.IsNullOrWhiteSpace(t)).Distinct().ToList();

        // 优先用 artist 创建（排除无意义的 artist 名）
        var blacklist = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "unknown", "original", "various", "none" };
        var usableArtist = artistTags.Where(a => !blacklist.Contains(a)).ToList();
        var usableGroup = groupTags.Where(a => !blacklist.Contains(a)).ToList();

        string? chosenTag = null;
        string tagNs = "artist";

        if (usableArtist.Count >= 1)
        {
            chosenTag = usableArtist[0];
            tagNs = "artist";
        }
        else if (usableGroup.Count >= 1)
        {
            chosenTag = usableGroup[0];
            tagNs = "group";
        }

        if (string.IsNullOrEmpty(chosenTag)) return null;

        // 生成 key（简单处理特殊字符）
        var safeKey = chosenTag.Replace(" ", "_").Replace("/", "-").Replace("\\", "-");
        // 已存在同名 KeyTag 专辑 → 直接用（理论不会走到这里，因为已匹配过）
        var existing = allAlbums.FirstOrDefault(a => a.Key.Equals(safeKey, StringComparison.OrdinalIgnoreCase));
        if (existing != null)
        {
            var egids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(existing.Gids) ?? new();
            if (!egids.Contains(gid)) { egids.Add(gid); existing.Gids = System.Text.Json.JsonSerializer.Serialize(egids); existing.Count = egids.Count; }
            return existing.Key;
        }

        // 自动创建专辑：颜色循环
        var autoColors = new[] { "#4a90d9", "#6b4e9e", "#d4782f", "#3d8b5e", "#b85c7c", "#5b8fa8", "#c48038", "#5e548e" };
        var color = autoColors[Math.Abs(safeKey.GetHashCode()) % autoColors.Length];

        var newAlbum = new AlbumConfig
        {
            Key = safeKey,
            Name = chosenTag,
            Color = color,
            KeyTag = $"{tagNs}:{chosenTag}",
            Gids = System.Text.Json.JsonSerializer.Serialize(new List<int> { gid }),
            Count = 1,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.AlbumConfigs.Add(newAlbum);
        allAlbums.Add(newAlbum); // 保持本地列表同步
        Console.WriteLine($"[DownloadManager] 自动创建专辑: {safeKey} ({chosenTag})");
        return safeKey;
    }

    /// <summary>确保功能性专辑存在并添加 gid，设置 AlbumKey（可选覆盖）</summary>
    private static string? EnsureFunctionalAlbum(MangaDbContext db, List<AlbumConfig> allAlbums,
        int gid, string albumKey, string albumName, string color, string? primaryAlbumKey)
    {
        var album = allAlbums.FirstOrDefault(a => a.Key == albumKey);
        if (album == null)
        {
            album = new AlbumConfig
            {
                Key = albumKey,
                Name = albumName,
                Color = color,
                Gids = System.Text.Json.JsonSerializer.Serialize(new List<int>()),
                Count = 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.AlbumConfigs.Add(album);
            allAlbums.Add(album);
        }

        // 不覆盖 KeyTag — 功能性专辑不参与标签匹配
        var gids = System.Text.Json.JsonSerializer.Deserialize<List<int>>(album.Gids) ?? new();
        if (!gids.Contains(gid))
        {
            gids.Add(gid);
            album.Gids = System.Text.Json.JsonSerializer.Serialize(gids);
            album.Count = gids.Count;
        }

        // AlbumKey 设为功能性专辑（如果 primary 为 null 则覆盖，否则保留 primary）
        var gallery = db.LocalGalleries.Find(gid);
        if (gallery != null && primaryAlbumKey == null)
            gallery.AlbumKey = albumKey;

        return primaryAlbumKey ?? albumKey;
    }
}
