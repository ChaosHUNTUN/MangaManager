using System.Collections.ObjectModel;
using System.Diagnostics;
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
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private readonly DispatcherTimer _statusTimer;
    private readonly DispatcherTimer _downloadTimer;
    private readonly string _apiUrl = "http://localhost:5000";
    private readonly string _apiProject = @"d:\MangaManager\src\backend\MangaManager.Api\MangaManager.Api.csproj";
    private readonly string _uiDir = @"d:\MangaManager\src\frontend\manga-ui";

    private Process? _apiProcess;
    private Process? _uiProcess;
    private readonly ObservableCollection<DownloadTaskVm> _tasks = new();

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public MainWindow()
    {
        InitializeComponent();
        TasksList.ItemsSource = _tasks;

        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _statusTimer.Tick += async (_, _) => await RefreshServiceStatus();
        _statusTimer.Start();

        _downloadTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _downloadTimer.Tick += async (_, _) => await RefreshDownloadTasks();
        _downloadTimer.Start();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        Log("MangaManager 管理控制台已启动");
        await RefreshServiceStatus();
        await RefreshDownloadTasks();
    }

    private void Window_Drag(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
            DragMove();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Hide(); // 最小化到托盘
    }

    private void CloseBtn_MouseEnter(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (sender is Button btn) btn.Foreground = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromRgb(0xEF, 0x44, 0x44));
    }

    private void CloseBtn_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (sender is Button btn) btn.Foreground = new System.Windows.Media.SolidColorBrush(
            System.Windows.Media.Color.FromRgb(0x88, 0x88, 0x88));
    }

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        // 最小化到托盘，不退出
        e.Cancel = true;
        Hide();
    }

    // ==================== 服务管理 ====================

    private async Task RefreshServiceStatus()
    {
        bool apiRunning = await IsPortOpen(5000, "/api/download/tasks");
        bool uiRunning = await IsPortOpen(5173, "/");

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
        p.OutputDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => Log(e.Data)); };
        p.ErrorDataReceived += (_, e) => { if (e.Data != null) Dispatcher.Invoke(() => Log($"[ERR] {e.Data}")); };
        p.Exited += (_, _) => Dispatcher.Invoke(async () =>
        {
            Log($"进程已退出 (ExitCode: {p.ExitCode})");
            await RefreshServiceStatus();
        });
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    private async void BtnApiStart_Click(object sender, RoutedEventArgs e) => StartApi();
    private async void BtnApiStop_Click(object sender, RoutedEventArgs e) => await StopApi();
    private async void BtnApiRestart_Click(object sender, RoutedEventArgs e) { await StopApi(); await Task.Delay(1500); StartApi(); }

    private async void BtnUiStart_Click(object sender, RoutedEventArgs e) => StartUi();
    private async void BtnUiStop_Click(object sender, RoutedEventArgs e) => await StopUi();
    private async void BtnUiRestart_Click(object sender, RoutedEventArgs e) { await StopUi(); await Task.Delay(1500); StartUi(); }

    private void BtnStartAll_Click(object sender, RoutedEventArgs e) { StartApi(); StartUi(); }
    private async void BtnStopAll_Click(object sender, RoutedEventArgs e) { await StopApi(); await StopUi(); }

    private async void StartApi()
    {
        try
        {
            Log("正在启动 API 后端...");
            await Task.Run(() => KillPort(5000));
            await Task.Delay(500);
            _apiProcess = StartProcess("dotnet", $"run --project \"{_apiProject}\" --urls http://0.0.0.0:5000");
        }
        catch (Exception ex) { Log($"启动 API 失败: {ex.Message}"); }
    }

    private async Task StopApi()
    {
        try
        {
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
            await Task.Run(() => KillPort(5000));

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

    private async void StartUi()
    {
        try
        {
            Log("正在启动 Web 前端...");
            await Task.Run(() => KillPort(5173));
            await Task.Delay(500);
            var npxPath = System.IO.File.Exists(@"C:\Program Files\nodejs\npx.cmd")
                ? @"C:\Program Files\nodejs\npx.cmd" : "npx";
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

    private static void KillPort(int port)
    {
        try
        {
            var psi = new ProcessStartInfo("cmd", $"/c netstat -ano | findstr :{port} | findstr LISTENING")
            {
                RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true
            };
            using var p = Process.Start(psi);
            if (p == null) return;
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(3000);

            foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 5 && int.TryParse(parts[4], out var pid))
                {
                    try
                    {
                        var proc = Process.GetProcessById(pid);
                        proc.Kill();
                        proc.WaitForExit(3000);
                    }
                    catch { }
                }
            }
        }
        catch { }
    }

    // ==================== 下载任务监控 ====================

    private async Task RefreshDownloadTasks()
    {
        try
        {
            var json = await _http.GetFromJsonAsync<ApiResponse<List<DownloadTaskVm>>>(
                $"{_apiUrl}/api/download/tasks", JsonOpts);

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
        catch
        {
            // API 不可用，静默处理
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
        if (sender is Button btn && btn.Tag is int gid)
        {
            await _http.DeleteAsync($"{_apiUrl}/api/download/tasks/{gid}");
            var task = _tasks.FirstOrDefault(t => t.Gid == gid);
            if (task != null) _tasks.Remove(task);
            Log($"移除任务 GID={gid}");
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

    private void OpenDownloads_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("http://localhost:5173/downloads") { UseShellExecute = true });
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
        TxtLog.AppendText($"[{timestamp}] {message}\n");
        TxtLog.ScrollToEnd();
    }
}

// API 响应 DTO
public class ApiResponse<T>
{
    public bool Success { get; set; }
    public T? Data { get; set; }
    public string? Message { get; set; }
}
