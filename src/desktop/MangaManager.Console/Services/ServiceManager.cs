using System.Diagnostics;
using System.IO;
using MangaManager.Console.Infrastructure;
using MangaManager.Console.Models;

namespace MangaManager.Console.Services;

/// <summary>
/// API / UI 服务生命周期管理：状态机（Stopped→Starting→Running→Stopping）、
/// 防重复启动、健康检查就绪、进程树停止、端口兜底清理（带进程名校验）。
/// </summary>
public class ServiceManager : IServiceManager
{
    private readonly IProcessRunner _runner;
    private readonly IHttpProbe _probe;
    private readonly ILogSink _log;
    private readonly AppConfig _config;
    private readonly IDispatcherService _dispatcher;
    private readonly Dictionary<string, RestartPolicy> _restartState = new();

    private sealed class Runtime
    {
        public ServiceState State { get; set; } = ServiceState.Stopped;
        public ManagedProcess? Process { get; set; }
        public DateTime? StartedAt { get; set; }
    }

    /// <summary>崩溃自动重启策略（尝试次数 + 上次重启时间）</summary>
    private sealed class RestartPolicy
    {
        public int Attempts;
        public DateTime LastRestart = DateTime.MinValue;
    }

    private readonly Dictionary<string, Runtime> _runtimes = new()
    {
        ["api"] = new(),
        ["ui"] = new()
    };

    private readonly Dictionary<string, ServiceConfig> _serviceConfigs;

    public ServiceManager(IProcessRunner runner, IHttpProbe probe, ILogSink log, AppConfig config, IDispatcherService dispatcher)
    {
        _runner = runner;
        _probe = probe;
        _log = log;
        _config = config;
        _dispatcher = dispatcher;
        _serviceConfigs = new()
        {
            ["api"] = config.Services.Api,
            ["ui"] = config.Services.Ui
        };
        _runner.ProcessExited += (_, e) => OnProcessExited(e);
    }

    public event EventHandler<ServiceStatusChangedEventArgs>? StatusChanged;

    public ServiceStatus GetStatus(string serviceKey)
    {
        var rt = _runtimes[serviceKey];
        var cfg = _serviceConfigs[serviceKey];
        return new ServiceStatus(serviceKey, cfg.Name, rt.State, cfg.Url, rt.Process != null, rt.StartedAt);
    }

    public async Task RefreshAsync()
    {
        await Task.WhenAll(ProbeAsync("api"), ProbeAsync("ui"));
    }

    private async Task ProbeAsync(string key)
    {
        var rt = _runtimes[key];
        if (rt.State is ServiceState.Starting or ServiceState.Stopping) return;
        var cfg = _serviceConfigs[key];
        if (!cfg.Enabled) return;
        var reachable = await _probe.IsReachableAsync(cfg.Url, cfg.HealthPath, 2);
        var newState = reachable ? ServiceState.Running : ServiceState.Stopped;
        if (rt.State != newState)
        {
            if (!reachable) { rt.Process = null; rt.StartedAt = null; }
            SetState(rt, key, newState);
        }
    }

    public async Task StartAllAsync()
    {
        await StartAsync("api");
        await StartAsync("ui");
    }

    public async Task StopAllAsync()
    {
        await StopAsync("api");
        await StopAsync("ui");
    }

    public async Task StartAsync(string serviceKey)
    {
        var rt = _runtimes[serviceKey];
        if (rt.State is ServiceState.Starting or ServiceState.Running) return; // 防重复启动
        var cfg = _serviceConfigs[serviceKey];
        if (!cfg.Enabled) { _log.Log($"{cfg.Name} 已在配置中禁用，跳过启动"); return; }

        SetState(rt, serviceKey, ServiceState.Starting);
        _log.Log($"正在启动 {cfg.Name}...");
        try
        {
            var (fileName, args, workDir) = ResolveCommand(cfg);
            var proc = await _runner.StartAsync(new ProcessRequest(
                Key: serviceKey,
                FileName: fileName,
                Arguments: args,
                WorkingDir: workDir,
                OnOutput: m => _log.Log(m),
                OnError: m => _log.Log($"[ERR] {m}")));
            rt.Process = proc;
            rt.StartedAt = proc.StartedAt;

            if (await WaitUntilReadyAsync(cfg))
            {
                SetState(rt, serviceKey, ServiceState.Running);
                _log.Log($"{cfg.Name} 已就绪 ({cfg.Url})");
            }
            else
            {
                _log.Log($"{cfg.Name} 启动超时或未就绪");
                SetState(rt, serviceKey, ServiceState.Stopped);
            }
        }
        catch (Exception ex)
        {
            _log.Log($"启动 {cfg.Name} 失败: {ex.Message}");
            SetState(rt, serviceKey, ServiceState.Stopped);
        }
    }

    public async Task StopAsync(string serviceKey)
    {
        var rt = _runtimes[serviceKey];
        if (rt.State is ServiceState.Stopped or ServiceState.Stopping) return;
        var cfg = _serviceConfigs[serviceKey];
        if (!cfg.Enabled) { rt.StartedAt = null; SetState(rt, serviceKey, ServiceState.Stopped); return; }

        SetState(rt, serviceKey, ServiceState.Stopping);
        _log.Log($"正在停止 {cfg.Name}... (state={rt.State}, hasProcess={rt.Process != null})");
        var owned = rt.Process != null; // 只有自己启动的服务才做端口兜底清理，避免误杀外部进程
        try
        {
            if (rt.Process != null)
            {
                await _runner.StopAsync(rt.Process);
                rt.Process = null;
            }
            if (owned) await SafeKillPortAsync(cfg);
            _log.Log($"{cfg.Name} 已停止");
        }
        catch (Exception ex)
        {
            _log.Log($"停止 {cfg.Name} 失败: {ex.Message}");
        }
        finally
        {
            rt.StartedAt = null;
            SetState(rt, serviceKey, ServiceState.Stopped);
        }
    }

    public async Task RestartAsync(string serviceKey)
    {
        await StopAsync(serviceKey);
        await Task.Delay(1500);
        await StartAsync(serviceKey);
    }

    private void OnProcessExited(ProcessExitedEventArgs e)
    {
        if (!_runtimes.TryGetValue(e.Key, out var rt)) return;
        if (rt.State is ServiceState.Starting or ServiceState.Running)
        {
            var cfg = _serviceConfigs[e.Key];
            _log.Log($"{cfg.Name} 进程已退出 (ExitCode: {e.ExitCode})");
            rt.Process = null;
            rt.StartedAt = null;
            SetState(rt, e.Key, ServiceState.Stopped);
            MaybeAutoRestart(e.Key);
        }
    }

    /// <summary>崩溃自动重启：5s/15s/30s 退避，最多 3 次；稳定运行 60s 后重置计数</summary>
    private void MaybeAutoRestart(string key)
    {
        var cfg = _serviceConfigs[key];
        if (!cfg.AutoRestart) return;
        if (!_restartState.TryGetValue(key, out var st))
        {
            st = new RestartPolicy();
            _restartState[key] = st;
        }

        var now = DateTime.UtcNow;
        if (st.Attempts > 0 && now - st.LastRestart > TimeSpan.FromSeconds(60))
            st.Attempts = 0;
        if (st.Attempts >= 3)
        {
            _log.Log($"{cfg.Name} 多次崩溃，已停止自动重启");
            return;
        }

        var delay = new[] { 5, 15, 30 }[Math.Min(st.Attempts, 2)];
        st.Attempts++;
        st.LastRestart = now;
        _log.Log($"{cfg.Name} 将在 {delay}s 后自动重启 (第 {st.Attempts} 次)");

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(delay));
                await StartAsync(key);
            }
            catch (Exception ex)
            {
                _log.Log($"自动重启 {cfg.Name} 失败: {ex.Message}");
            }
        });
    }

    private void SetState(Runtime rt, string key, ServiceState state)
    {
        rt.State = state;
        var status = GetStatus(key);
        // 可能从后台线程触发（自动重启），统一经调度器回 UI 线程
        _dispatcher.BeginInvoke(() => StatusChanged?.Invoke(this, new ServiceStatusChangedEventArgs(status)));
    }

    private (string FileName, string Arguments, string? WorkingDir) ResolveCommand(ServiceConfig cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ExePath))
        {
            var exe = _config.ResolvePath(cfg.ExePath);
            return (exe, "", Path.GetDirectoryName(exe));
        }

        var args = cfg.DevArguments.Replace("{ProjectPath}", _config.ResolvePath(cfg.ProjectPath));
        var workDir = !string.IsNullOrWhiteSpace(cfg.WorkingDir)
            ? _config.ResolvePath(cfg.WorkingDir)
            : Path.GetDirectoryName(_config.ResolvePath(cfg.ProjectPath)) ?? "";
        return (ResolveCommandPath(cfg.DevCommand), args, workDir);
    }

    /// <summary>解析命令路径：绝对路径直返；否则在 PATH 与常见 Node 目录中查找（Windows 下补 .exe/.cmd/.bat）</summary>
    private static string ResolveCommandPath(string command)
    {
        if (string.IsNullOrWhiteSpace(command)) return command;
        if (Path.IsPathRooted(command)) return command;
        if (command.Contains(Path.DirectorySeparatorChar) || command.Contains(Path.AltDirectorySeparatorChar))
            return Path.GetFullPath(command);

        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            foreach (var ext in new[] { ".exe", ".cmd", ".bat", "" })
            {
                var candidate = Path.Combine(dir.Trim(), command + ext);
                if (File.Exists(candidate)) return candidate;
            }
        }

        // 常见 Node.js 安装路径回退（npx）
        foreach (var dir in new[]
        {
            Environment.GetEnvironmentVariable("ProgramFiles") + @"\nodejs",
            Environment.GetEnvironmentVariable("ProgramFiles(x86)") + @"\nodejs",
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Programs\nodejs"
        })
        {
            if (string.IsNullOrWhiteSpace(dir)) continue;
            foreach (var ext in new[] { ".cmd", ".exe", "" })
            {
                var candidate = Path.Combine(dir, command + ext);
                if (File.Exists(candidate)) return candidate;
            }
        }

        return command;
    }

    private async Task<bool> WaitUntilReadyAsync(ServiceConfig cfg)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(Math.Max(1, cfg.ReadyTimeoutSeconds));
        while (DateTime.UtcNow < deadline)
        {
            if (await _probe.IsReachableAsync(cfg.Url, cfg.HealthPath, 2)) return true;
            await Task.Delay(500);
        }
        return false;
    }

    private static Task SafeKillPortAsync(ServiceConfig cfg)
    {
        try
        {
            var port = new Uri(cfg.Url).Port;
            return Task.Run(() => KillPortIfOwned(port));
        }
        catch { return Task.CompletedTask; }
    }

    /// <summary>端口兜底清理：只杀 dotnet/node 相关进程，绝不误杀无关进程</summary>
    private static void KillPortIfOwned(int port)
    {
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "dotnet", "node", "npx", "MangaManager.Api", "MangaManager.Console"
        };
        var pid = GetOwningPid(port);
        if (pid == null) return;
        try
        {
            using var proc = Process.GetProcessById(pid.Value);
            if (!allowed.Contains(proc.ProcessName)) return;
            proc.Kill(entireProcessTree: true);
            proc.WaitForExit(3000);
        }
        catch { /* 进程可能已退出 */ }
    }

    private static int? GetOwningPid(int port)
    {
        try
        {
            var psi = new ProcessStartInfo("cmd", $"/c netstat -ano | findstr :{port}")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p == null) return null;
            var outputTask = p.StandardOutput.ReadToEndAsync();
            // 超时防挂：cmd 管道异常时最多等 3 秒
            if (!outputTask.Wait(3000))
            {
                try { p.Kill(); } catch { }
                return null;
            }
            var output = outputTask.Result;
            try { p.WaitForExit(1000); } catch { }

            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 5
                    && parts[^1].All(char.IsDigit)
                    && parts.Length >= 4
                    && parts[3].Equals("LISTENING", StringComparison.OrdinalIgnoreCase)
                    && int.TryParse(parts[^1], out var pid))
                {
                    return pid;
                }
            }
        }
        catch { }
        return null;
    }
}
