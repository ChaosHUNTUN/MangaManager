using MangaManager.Shared.Download;

namespace MangaManager.Console.Services;

public interface IApiClient
{
    Task<bool> IsHealthyAsync(CancellationToken ct = default);
    Task<List<DownloadTaskDto>> GetDownloadTasksAsync(CancellationToken ct = default);
    Task PauseTaskAsync(int gid);
    Task ResumeTaskAsync(int gid);
    Task RestartTaskAsync(int gid);
    Task RemoveTaskAsync(int gid);
    Task RestartAllFailedAsync();
}
