using MangaManager.Shared.Download;

namespace MangaManager.Console.Services;

public interface IDownloadMonitor : IAsyncDisposable
{
    /// <summary>任务列表变化（完整快照，UI 线程触发）</summary>
    event EventHandler<IReadOnlyList<DownloadTaskDto>>? TasksUpdated;

    void Start();
    void Stop();
}
