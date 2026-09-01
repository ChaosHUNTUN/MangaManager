using MangaManager.Console.Infrastructure;
using MangaManager.Console.Models;
using MangaManager.Shared.Download;

namespace MangaManager.Console.Services;

/// <summary>
/// 后台下载任务监控：独立循环轮询 → 与内存快照合并 → 事件通知（UI 线程）。
/// 失败时指数退避且静默（API 未运行不刷日志）。
/// </summary>
public class DownloadMonitor : IDownloadMonitor
{
    private readonly IApiClient _api;
    private readonly ILogSink _log;
    private readonly AppConfig _config;
    private readonly IDispatcherService _dispatcher;
    private readonly CancellationTokenSource _cts = new();
    private readonly List<DownloadTaskDto> _snapshot = new();
    private Task? _loop;
    private int _consecutiveFailures;

    public DownloadMonitor(IApiClient api, ILogSink log, AppConfig config, IDispatcherService dispatcher)
    {
        _api = api;
        _log = log;
        _config = config;
        _dispatcher = dispatcher;
    }

    public event EventHandler<IReadOnlyList<DownloadTaskDto>>? TasksUpdated;

    public void Start()
    {
        if (_loop != null) return;
        _loop = Task.Run(() => LoopAsync(_cts.Token));
    }

    public void Stop() => _cts.Cancel();

    public async ValueTask DisposeAsync()
    {
        Stop();
        if (_loop != null)
        {
            try { await _loop; } catch { }
        }
        _cts.Dispose();
    }

    private async Task LoopAsync(CancellationToken ct)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(1, _config.Monitoring.IntervalSeconds));
        while (!ct.IsCancellationRequested)
        {
            var delay = interval;
            try
            {
                var incoming = await _api.GetDownloadTasksAsync(ct);
                _consecutiveFailures = 0;
                Merge(incoming);
                var copy = _snapshot.ToList();
                _dispatcher.Invoke(() => TasksUpdated?.Invoke(this, copy));
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                // API 未运行等场景：指数退避，避免日志刷屏；
                // 但首次/每 6 次留一条日志，防止"拉取失败→列表静默为空"这类问题无法诊断
                _consecutiveFailures++;
                if (_consecutiveFailures == 1 || _consecutiveFailures % 6 == 0)
                    _log.Log($"[DownloadMonitor] 拉取下载任务失败 x{_consecutiveFailures}: {ex.Message}");
                delay = GetBackoffDelay();
            }

            try { await Task.Delay(delay, ct); } catch (OperationCanceledException) { break; }
        }
    }

    private TimeSpan GetBackoffDelay()
    {
        var seq = _config.Monitoring.FailureBackoffSeconds;
        if (seq == null || seq.Length == 0) return TimeSpan.FromSeconds(5);
        var idx = Math.Clamp(_consecutiveFailures - 1, 0, seq.Length - 1);
        return TimeSpan.FromSeconds(Math.Max(1, seq[idx]));
    }

    private void Merge(List<DownloadTaskDto> incoming)
    {
        var activeGids = new HashSet<int>(incoming.Select(t => t.Gid));
        for (int i = _snapshot.Count - 1; i >= 0; i--)
        {
            var t = _snapshot[i];
            if (t.Status is "completed" or "removed" || !activeGids.Contains(t.Gid))
                _snapshot.RemoveAt(i);
        }

        foreach (var t in incoming)
        {
            var idx = _snapshot.FindIndex(x => x.Gid == t.Gid);
            if (idx >= 0)
            {
                _snapshot[idx] = t;
            }
            else
            {
                if (string.IsNullOrEmpty(t.Title) || t.Title.StartsWith("Gallery #"))
                    t.Title = $"Gallery {t.Gid}";
                _snapshot.Add(t);
            }
        }
    }
}
