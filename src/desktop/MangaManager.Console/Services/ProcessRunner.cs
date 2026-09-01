using System.Diagnostics;
using System.IO;
using System.Text;
using MangaManager.Console.Infrastructure;

namespace MangaManager.Console.Services;

/// <summary>
/// 进程启停封装：输出/退出事件统一回 UI 线程；停止时杀整棵进程树
/// （dotnet run 会派生子进程，避免"主进程死、子进程泄漏"）
/// </summary>
public class ProcessRunner : IProcessRunner
{
    private readonly IDispatcherService _dispatcher;

    public ProcessRunner(IDispatcherService dispatcher) => _dispatcher = dispatcher;

    public event EventHandler<ProcessExitedEventArgs>? ProcessExited;

    public Task<ManagedProcess> StartAsync(ProcessRequest request)
    {
        var psi = new ProcessStartInfo(request.FileName, request.Arguments)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = request.WorkingDir ?? Path.GetDirectoryName(request.FileName) ?? ""
        };
        var p = new Process { StartInfo = psi, EnableRaisingEvents = true };

        p.OutputDataReceived += (_, e) =>
        {
            // BeginInvoke：非阻塞排队，避免日志洪流阻塞线程池并淹没 UI 线程
            if (e.Data != null) _dispatcher.BeginInvoke(() => request.OnOutput?.Invoke(e.Data));
        };
        p.ErrorDataReceived += (_, e) =>
        {
            if (e.Data != null) _dispatcher.BeginInvoke(() => request.OnError?.Invoke(e.Data));
        };
        p.Exited += (_, _) =>
        {
            int code = -1;
            try { code = p.ExitCode; } catch { /* 进程可能已被释放 */ }
            _dispatcher.BeginInvoke(() => ProcessExited?.Invoke(this, new ProcessExitedEventArgs(request.Key, code)));
        };

        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return Task.FromResult(new ManagedProcess(p.Id, DateTime.Now, p));
    }

    public Task StopAsync(ManagedProcess process, int timeoutMs = 5000)
    {
        var p = process.Process;
        // 在后台线程执行杀进程逻辑，避免阻塞 UI 线程；
        // 用 taskkill /T /F 杀进程树，规避 Process.Kill(entireProcessTree:true) 可能挂死的问题
        return Task.Run(() =>
        {
            try
            {
                if (p.HasExited) return;

                var psi = new ProcessStartInfo("taskkill", $"/PID {p.Id} /T /F")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                using (var tk = Process.Start(psi))
                {
                    if (tk != null && !tk.WaitForExit(timeoutMs))
                    {
                        try { tk.Kill(); } catch { }
                    }
                }

                // 兜底：主进程本身（单进程 Kill 不枚举树，不会挂死）
                try
                {
                    if (!p.HasExited)
                    {
                        p.Kill();
                        p.WaitForExit(Math.Min(timeoutMs, 3000));
                    }
                }
                catch { }
            }
            catch { /* 进程可能已退出 */ }
            finally
            {
                try { p.Dispose(); } catch { }
            }
        });
    }
}
