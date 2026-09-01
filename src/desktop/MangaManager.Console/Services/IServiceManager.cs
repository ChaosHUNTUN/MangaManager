using MangaManager.Console.Models;

namespace MangaManager.Console.Services;

public interface IServiceManager
{
    event EventHandler<ServiceStatusChangedEventArgs>? StatusChanged;

    ServiceStatus GetStatus(string serviceKey);
    /// <summary>探测各服务实际可达状态（用于启动前同步现实，不启动进程）</summary>
    Task RefreshAsync();
    Task StartAsync(string serviceKey);
    Task StopAsync(string serviceKey);
    Task RestartAsync(string serviceKey);
    Task StartAllAsync();
    Task StopAllAsync();
}

public record ServiceStatus(string Key, string Name, ServiceState State, string? Endpoint, bool HasProcess, DateTime? StartedAt);

public class ServiceStatusChangedEventArgs : EventArgs
{
    public ServiceStatus Status { get; }
    public ServiceStatusChangedEventArgs(ServiceStatus status) => Status = status;
}
