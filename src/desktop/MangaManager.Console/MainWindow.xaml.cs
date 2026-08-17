using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace MangaManager.Console;

public partial class MainWindow : Window
{
    private static readonly HttpClient _http = new(new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromSeconds(2),  // TCP 连接最多等 2 秒
        PooledConnectionLifetime = TimeSpan.FromMinutes(2)
    })
    { Timeout = TimeSpan.FromSeconds(5) };
    private readonly DispatcherTimer _statusTimer;
    private readonly DispatcherTimer _downloadTimer;
    private volatile bool _timersPaused;  // 服务启停期间暂停轮询，防止 UI 线程堆积
    private volatile bool _refreshingStatus;   // 防 RefreshServiceStatus 重入
    private volatile bool _refreshingTasks;    // 防 RefreshDownloadTasks 重入
    private DateTime _lastScrollTime;          // ScrollToEnd 节流
    private const int MaxLogLines = 2000;      // 日志最大行数
    private readonly string _apiUrl = "http://127.0.0.1:5208";
    private readonly string _apiProject;
    private readonly string _uiDir;

    private Process? _apiProcess;
    private Process? _uiProcess;

    /// <summary>向上查找项目根目录（包含 MangaManager.slnx 或 src 目录）</summary>
    private static string FindProjectRoot()
    {
        var dir = AppDomain.CurrentDomain.BaseDirectory;
        while (dir != null)
        {
            if (System.IO.File.Exists(System.IO.Path.Combine(dir, "MangaManager.slnx"))
                || System.IO.Directory.Exists(System.IO.Path.Combine(dir, "src", "backend")))
                return dir;
            var parent = System.IO.Path.GetDirectoryName(dir);
            if (parent == dir) break;
            dir = parent;
        }
        // 降级：使用 exe 所在目录
        return AppDomain.CurrentDomain.BaseDirectory;
    }
    private readonly ObservableCollection<DownloadTaskVm> _tasks = new();

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public MainWindow()
    {
        var root = FindProjectRoot();
        _apiProject = System.IO.Path.Combine(root, "src", "backend", "MangaManager.Api", "MangaManager.Api.csproj");
        _uiDir = System.IO.Path.Combine(root, "src", "frontend", "manga-ui");

        InitializeComponent();
        TasksList.ItemsSource = _tasks;

        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _statusTimer.Tick += async (_, _) =>
        {
            if (_refreshingStatus) return;
            _refreshingStatus = true;
            try { await RefreshServiceStatus(); } finally { _refreshingStatus = false; }
        };
        _statusTimer.Start();

        _downloadTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        _downloadTimer.Tick += async (_, _) =>
        {
            if (_refreshingTasks) return;
            _refreshingTasks = true;
            try { await RefreshDownloadTasks(); } finally { _refreshingTasks = false; }
        };
        _downloadTimer.Start();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        Log("MangaManager 管理控制台已启动");

        // 环境检测
        try
        {
            var dotnetCheck = new Process { StartInfo = new ProcessStartInfo("dotnet", "--version") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true } };
            dotnetCheck.Start(); var dotnetVer = (await dotnetCheck.StandardOutput.ReadToEndAsync()).Trim(); dotnetCheck.WaitForExit();
            Log($"✓ .NET SDK: {dotnetVer}");
        }
        catch { Log("⚠ 未检测到 dotnet 命令，API 后端将无法启动"); }

        try
        {
            var nodeCheck = new Process { StartInfo = new ProcessStartInfo("node", "--version") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true } };
            nodeCheck.Start(); var nodeVer = (await nodeCheck.StandardOutput.ReadToEndAsync()).Trim(); nodeCheck.WaitForExit();
            Log($"✓ Node.js: {nodeVer}");
        }
        catch { Log("⚠ 未检测到 node 命令，Web 前端将无法启动"); }

        await RefreshServiceStatus();
        await RefreshDownloadTasks();

        // 同步 API 端点显示文本
        var apiUri = new Uri(_apiUrl);
        TxtApiEndpoint.Text = $"{apiUri.Host}:{apiUri.Port}";

        // 启动后自动拉起前后端（若尚未运行），无需手动点击启动
        try
        {
            if (!await IsPortOpen(5208, "/health"))
            {
                Log("检测到 API 后端未运行，正在自动启动...");
                await StartApiAsync();
            }
            if (!await IsPortOpen(5173, "/"))
            {
                Log("检测到 Web 前端未运行，正在自动启动...");
                await StartUiAsync();
            }
        }
        catch (Exception ex) { Log($"自动启动服务失败: {ex.Message}"); }
    }

    private void Window_Drag(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
            DragMove();
    }

    private async void Close_Click(object sender, RoutedEventArgs e)
    {
        var result = System.Windows.MessageBox.Show(
            "关闭控制台将停止所有服务（API + 前端），确定退出？",
            "MangaManager", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result == MessageBoxResult.Yes)
        {
            await StopApi();
            await StopUi();
            Application.Current.Shutdown();
        }
    }

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        // 正常退出（Close_Click 已处理服务停止和确认）
        _statusTimer?.Stop();
        _downloadTimer?.Stop();
    }

    // ==================== 服务管理 ====================

    private async Task RefreshServiceStatus()
    {
        if (_timersPaused) return;
        bool apiRunning = await Task.Run(() => IsPortOpen(5208, "/health"));
        bool uiRunning = await Task.Run(() => IsPortOpen(5173, "/"));

        UpdateServiceUI(apiRunning, TxtApiStatus, BtnApiStart, BtnApiStop, ApiStatusDot);
        UpdateServiceUI(uiRunning, TxtUiStatus, BtnUiStart, BtnUiStop, UiStatusDot);

        if (apiRunning && uiRunning)
        {
            TxtGlobalStatus.Text = "● 全部运行中";
            TxtGlobalStatus.Foreground = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(0x10, 0xB9, 0x81));
            TxtGlobalStatus.Tag = "#1810B981";
        }
        else if (apiRunning || uiRunning)
        {
            TxtGlobalStatus.Text = "● 部分运行中";
            TxtGlobalStatus.Foreground = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(0xF5, 0x9E, 0x0B));
            TxtGlobalStatus.Tag = "#1878350F";
        }
        else
        {
            TxtGlobalStatus.Text = "● 全部停止";
            TxtGlobalStatus.Foreground = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
            TxtGlobalStatus.Tag = "#187F1D1D";
        }
    }

    private void UpdateServiceUI(bool running, TextBlock txt, Button btnStart, Button btnStop, Ellipse dot)
    {
        txt.Text = running ? "运行中" : "已停止";
        txt.Foreground = new System.Windows.Media.SolidColorBrush(
            running ? System.Windows.Media.Color.FromRgb(0x10, 0xB9, 0x81)
                    : System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
        dot.Fill = new System.Windows.Media.SolidColorBrush(
            running ? System.Windows.Media.Color.FromRgb(0x10, 0xB9, 0x81)
                    : System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
        btnStart.IsEnabled = !running;
        btnStop.IsEnabled = running;
    }

    private async Task<bool> IsPortOpen(int port, string path)
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
            var resp = await client.GetAsync($"http://localhost:{port}{path}", cts.Token);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    /// <summary>从 PATH 中查找 npx，回退到常见安装路径。</summary>
    private static string ResolveNpxPath()
    {
        const string exeName = "npx.cmd";

        // 1. 优先检查 PATH
        var pathEnv = Environment.GetEnvironmentVariable("PATH");
        if (!string.IsNullOrEmpty(pathEnv))
        {
            foreach (var dir in pathEnv.Split(System.IO.Path.PathSeparator))
            {
                var candidate = System.IO.Path.Combine(dir.Trim(), exeName);
                if (File.Exists(candidate)) return candidate;
            }
        }

        // 2. 常见 Node.js 安装路径回退
        foreach (var dir in new[]
        {
            Environment.GetEnvironmentVariable("ProgramFiles") + @"\nodejs",
            Environment.GetEnvironmentVariable("ProgramFiles(x86)") + @"\nodejs",
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + @"\Programs\nodejs"
        })
        {
            var candidate = System.IO.Path.Combine(dir, exeName);
            if (File.Exists(candidate)) return candidate;
        }

        // 3. 最终回退：靠系统解析
        return "npx";
    }

    private Process StartProcess(string fileName, string arguments, string? workingDir = null)
    {
        var psi = new ProcessStartInfo(fileName, arguments)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            StandardErrorEncoding = System.Text.Encoding.UTF8,
            WorkingDirectory = workingDir ?? System.IO.Path.GetDirectoryName(fileName) ?? ""
        };
        var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        // 使用 BeginInvoke 而非 Invoke：避免管道缓冲区塞满导致子进程 stdout 阻塞 → 父子进程互相等待死锁
        p.OutputDataReceived += (_, e) => { if (e.Data != null) Dispatcher.BeginInvoke(() => Log(e.Data)); };
        p.ErrorDataReceived += (_, e) => { if (e.Data != null) Dispatcher.BeginInvoke(() => Log($"[ERR] {e.Data}")); };
        p.Exited += (_, _) => Dispatcher.BeginInvoke(async () =>
        {
            Log($"进程已退出 (ExitCode: {p.ExitCode})");
            await RefreshServiceStatus();
        });
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    private async void BtnApiStart_Click(object sender, RoutedEventArgs e) { _ = StartApiAsync(); }
    private async void BtnApiStop_Click(object sender, RoutedEventArgs e) => await StopApi();
    private async void BtnApiRestart_Click(object sender, RoutedEventArgs e) { await StopApi(); await Task.Delay(1500); await StartApiAsync(); }

    private async void BtnUiStart_Click(object sender, RoutedEventArgs e) { _ = StartUiAsync(); }
    private async void BtnUiStop_Click(object sender, RoutedEventArgs e) => await StopUi();
    private async void BtnUiRestart_Click(object sender, RoutedEventArgs e) { await StopUi(); await Task.Delay(1500); _ = StartUiAsync(); }

    private async void BtnStartAll_Click(object sender, RoutedEventArgs e) { _ = StartApiAsync(); _ = StartUiAsync(); }
    private async void BtnStopAll_Click(object sender, RoutedEventArgs e) { await StopApi(); await StopUi(); }

    private async Task StartApiAsync()
    {
        try
        {
            _timersPaused = true;
            Log("正在启动 API 后端...");
            await Task.Run(() => KillPort(5208));
            await Task.Delay(500);
            _apiProcess = StartProcess("dotnet", $"run --project \"{_apiProject}\" --urls http://0.0.0.0:5208");

            // 等待 API 就绪后恢复轮询
            for (int i = 0; i < 20; i++)
            {
                await Task.Delay(500);
                if (await IsPortOpen(5208, "/health")) break;
            }
            _timersPaused = false;
            await RefreshServiceStatus();
            await RefreshDownloadTasks();
        }
        catch (Exception ex) { Log($"启动 API 失败: {ex.Message}"); _timersPaused = false; }
    }

    private async Task StopApi()
    {
        try
        {
            _timersPaused = true;  // 立即暂停轮询，防止 HTTP 调用堆积
            Log("正在停止 API 后端...");
            BtnApiStop.IsEnabled = false;

            // 在后台线程执行停止操作，避免阻塞 UI
            await Task.Run(() =>
            {
                try
                {
                    // 先尝试优雅关闭
                    if (_apiProcess != null && !_apiProcess.HasExited)
                    {
                        _apiProcess.Kill(); // 不用 entireProcessTree，避免卡死
                        _apiProcess.WaitForExit(5000); // 最多等 5 秒
                    }
                }
                catch { }
            });

            _apiProcess?.Dispose();
            _apiProcess = null;

            // 在后台线程清理端口
            await Task.Run(() => KillPort(5208));

            Log("API 后端已停止");
        }
        catch (Exception ex) { Log($"停止 API 失败: {ex.Message}"); }
        finally
        {
            await Dispatcher.InvokeAsync(() =>
            {
                BtnApiStop.IsEnabled = true;
                _ = RefreshServiceStatus();
            });
        }
    }

    private async Task StartUiAsync()
    {
        try
        {
            Log("正在启动 Web 前端...");
            await Task.Run(() => KillPort(5173));
            await Task.Delay(500);
            var npxPath = ResolveNpxPath();
            _uiProcess = StartProcess(npxPath, "vite --host 0.0.0.0 --port 5173", _uiDir);
        }
        catch (Exception ex) { Log($"启动 UI 失败: {ex.Message}"); }
    }

    private async Task StopUi()
    {
        try
        {
            Log("正在停止 Web 前端...");
            BtnUiStop.IsEnabled = false;

            await Task.Run(() =>
            {
                try
                {
                    if (_uiProcess != null && !_uiProcess.HasExited)
                    {
                        _uiProcess.Kill();
                        _uiProcess.WaitForExit(5000);
                    }
                }
                catch { }
            });

            _uiProcess?.Dispose();
            _uiProcess = null;

            await Task.Run(() => KillPort(5173));

            Log("Web 前端已停止");
        }
        catch (Exception ex) { Log($"停止 UI 失败: {ex.Message}"); }
        finally
        {
            await Dispatcher.InvokeAsync(() =>
            {
                BtnUiStop.IsEnabled = true;
                _ = RefreshServiceStatus();
            });
        }
    }

    internal async Task StartAllServicesAsync()
    {
        await StartApiAsync();
        await StartUiAsync();
    }

    internal async Task StopAllServicesAsync()
    {
        await StopApi();
        await StopUi();
    }

    private static void KillPort(int port)
    {
        try
        {
            var endPoint = new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, port);
            var listeners = System.Net.NetworkInformation.IPGlobalProperties
                .GetIPGlobalProperties()
                .GetActiveTcpListeners();
            foreach (var listener in listeners)
            {
                if (listener.Port == port)
                {
                    // Find and kill the process holding this port
                    var psi = new ProcessStartInfo("cmd", $"/c netstat -ano | findstr :{port}")
                    {
                        RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true
                    };
                    using var p = Process.Start(psi);
                    if (p == null) continue;
                    var output = p.StandardOutput.ReadToEnd();
                    p.WaitForExit(3000);

                    foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
                    {
                        var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                        if (parts.Length >= 5 && int.TryParse(parts[^1], out var pid))
                        {
                            try
                            {
                                using var proc = Process.GetProcessById(pid);
                                proc.Kill();
                                proc.WaitForExit(3000);
                            }
                            catch { }
                        }
                    }
                }
            }
        }
        catch { }
    }

    // ==================== 下载任务监控 ====================

    private async Task RefreshDownloadTasks()
    {
        if (_timersPaused) return;
        try
        {
            var json = await Task.Run(() =>
                _http.GetFromJsonAsync<ApiResponse<List<DownloadTaskVm>>>(
                    $"{_apiUrl}/api/download/tasks", JsonOpts));

            if (json?.Data == null) return;

            var incoming = json.Data;
            int downloading = 0, pending = 0, failed = 0;

            foreach (var t in incoming)
            {
                var existing = _tasks.FirstOrDefault(x => x.Gid == t.Gid);
                if (existing != null)
                {
                    existing.Status = t.Status;
                    existing.DownloadedPages = t.DownloadedPages;
                    existing.TotalPages = t.TotalPages;
                    existing.FailedPages = t.FailedPages;
                    existing.ErrorMsg = t.ErrorMsg;
                    existing.Speed = t.Speed;
                    existing.SpeedBps = t.SpeedBps;
                }
                else
                {
                    if (t.Title == null || t.Title.StartsWith("Gallery #"))
                        t.Title = $"Gallery {t.Gid}";
                    _tasks.Add(t);
                }

                if (t.Status == "downloading") downloading++;
                else if (t.Status == "pending") pending++;
                else if (t.Status == "failed") failed++;
            }

            // 清理已完成和已移除的任务（前端不显示已完成/已移除的）
            var activeGids = new HashSet<int>(incoming.Select(t => t.Gid));
            for (int i = _tasks.Count - 1; i >= 0; i--)
            {
                var t = _tasks[i];
                if (t.Status == "completed" || t.Status == "removed")
                    _tasks.RemoveAt(i);
                else if (!activeGids.Contains(t.Gid))
                    _tasks.RemoveAt(i);
            }

            // 更新摘要
            var parts = new List<string>();
            if (downloading > 0) parts.Add($"{downloading} 下载中");
            if (pending > 0) parts.Add($"{pending} 等待中");
            if (failed > 0) parts.Add($"{failed} 失败");
            TxtDownloadSummary.Text = parts.Count > 0 ? string.Join(" · ", parts) : "空闲";

            // 失败任务重启按钮
            BtnRestartFailed.Visibility = failed > 0 ? Visibility.Visible : Visibility.Collapsed;

            // 空状态
            TxtNoTasks.Visibility = _tasks.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            Dispatcher.BeginInvoke(() => Log($"[下载监控] API 请求失败: {ex.Message}"));
        }
    }

    private async void BtnPauseTask_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int gid)
        {
            await _http.PostAsync($"{_apiUrl}/api/download/tasks/{gid}/pause", null);
            Log($"暂停任务 GID={gid}");
        }
    }

    private async void BtnResumeTask_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int gid)
        {
            await _http.PostAsync($"{_apiUrl}/api/download/tasks/{gid}/resume", null);
            Log($"恢复任务 GID={gid}");
        }
    }

    private async void BtnRestartTask_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is int gid)
        {
            await _http.PostAsync($"{_apiUrl}/api/download/tasks/{gid}/restart", null);
            Log($"重启任务 GID={gid}");
        }
    }

    private async void BtnRemoveTask_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not int gid) return;
        try
        {
            var resp = await _http.DeleteAsync($"{_apiUrl}/api/download/tasks/{gid}");
            if (resp.IsSuccessStatusCode)
            {
                var task = _tasks.FirstOrDefault(t => t.Gid == gid);
                if (task != null) _tasks.Remove(task);
                Log($"移除任务 GID={gid}");
                // 立即同步一次，避免残留旧任务（同时消除与轮询快照的竞态）
                await RefreshDownloadTasks();
            }
            else
            {
                Log($"移除任务失败 GID={gid} (HTTP {(int)resp.StatusCode})");
            }
        }
        catch (Exception ex)
        {
            Log($"移除任务失败 GID={gid}: {ex.Message}");
        }
    }

    private async void BtnRestartFailed_Click(object sender, RoutedEventArgs e)
    {
        var resp = await _http.PostAsync($"{_apiUrl}/api/download/tasks/restart-all-failed", null);
        if (resp.IsSuccessStatusCode)
            Log("已重启所有失败任务");
    }

    // ==================== 其他 ====================

    private void OpenWeb_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("http://localhost:5173") { UseShellExecute = true });
    }

    private void OpenLocalGallery_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("http://localhost:5173/local") { UseShellExecute = true });
    }

    private void OpenEhentai_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("http://localhost:5173/ehentai") { UseShellExecute = true });
    }

    private void Minimize_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void ClearLog_Click(object sender, RoutedEventArgs e)
    {
        TxtLog.Clear();
    }

    private void Log(string message)
    {
        var timestamp = DateTime.Now.ToString("HH:mm:ss");
        var text = TxtLog;
        var newLine = $"[{timestamp}] {message}\n";

        // 超过行数上限时从头部截断
        if (text.LineCount > MaxLogLines + 100)
        {
            var lineIdx = text.GetLineIndexFromCharacterIndex(text.Text.IndexOf('\n', text.Text.Length / 5));
            if (lineIdx > 0) text.Text = text.Text[(text.GetCharacterIndexFromLineIndex(lineIdx))..];
        }

        text.AppendText(newLine);

        // ScrollToEnd 节流：每 200ms 最多滚动一次，避免高频日志导致阻塞
        var now = DateTime.UtcNow;
        if ((now - _lastScrollTime).TotalMilliseconds > 200)
        {
            _lastScrollTime = now;
            text.ScrollToEnd();
        }
        else
        {
            // 延迟滚动到后台优先级，不阻塞当前批次处理
            Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
            {
                var t = TxtLog;
                if (t != null) t.ScrollToEnd();
            });
        }
    }
}

// API 响应 DTO
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
}
