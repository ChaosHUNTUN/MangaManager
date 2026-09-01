using System.Diagnostics;

namespace MangaManager.Console.Services;

public interface IProcessRunner
{
    /// <summary>进程退出事件（携带服务 Key，便于 ServiceManager 按服务更新状态）</summary>
    event EventHandler<ProcessExitedEventArgs>? ProcessExited;

    Task<ManagedProcess> StartAsync(ProcessRequest request);
    Task StopAsync(ManagedProcess process, int timeoutMs = 5000);
}

public record ProcessRequest(
    string Key,
    string FileName,
    string Arguments,
    string? WorkingDir,
    Action<string>? OnOutput = null,
    Action<string>? OnError = null);

public record ManagedProcess(int Id, DateTime StartedAt, Process Process);

public record ProcessExitedEventArgs(string Key, int ExitCode);
