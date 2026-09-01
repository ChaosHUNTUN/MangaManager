using System.Diagnostics;

namespace MangaManager.Console.Services;

/// <summary>环境检测：dotnet / node 版本（与 UI 解耦，可测试）</summary>
public class EnvironmentProbe
{
    public Task<(bool Found, string Version)> GetDotnetVersionAsync()
        => RunVersionCommandAsync("dotnet", "--version");

    public Task<(bool Found, string Version)> GetNodeVersionAsync()
        => RunVersionCommandAsync("node", "--version");

    private static async Task<(bool Found, string Version)> RunVersionCommandAsync(string fileName, string args)
    {
        Process? p = null;
        try
        {
            var psi = new ProcessStartInfo(fileName, args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            p = Process.Start(psi);
            if (p == null) return (false, "");

            var outTask = p.StandardOutput.ReadToEndAsync();
            var errTask = p.StandardError.ReadToEndAsync();
            // 环境探测不应阻塞控制台启动：3 秒超时，超时直接放弃
            var delayTask = Task.Delay(3000);
            var completed = await Task.WhenAny(
                Task.WhenAll(outTask, errTask),
                delayTask);
            if (completed == delayTask)
            {
                try { p.Kill(entireProcessTree: true); } catch { }
                return (false, "");
            }

            var output = (await outTask).Trim();
            var err = (await errTask).Trim();
            return (true, string.IsNullOrWhiteSpace(output) ? err : output);
        }
        catch { return (false, ""); }
        finally
        {
            try { p?.Dispose(); } catch { }
        }
    }
}
