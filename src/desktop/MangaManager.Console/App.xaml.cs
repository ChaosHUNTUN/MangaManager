using System.Diagnostics;
using System.IO;
using System.Windows;
using Hardcodet.Wpf.TaskbarNotification;
using MangaManager.Console.Infrastructure;
using MangaManager.Console.Models;
using MangaManager.Console.Services;
using MangaManager.Console.ViewModels;

namespace MangaManager.Console;

/// <summary>
/// 组合根：单实例 / 托盘 / 依赖组装。业务逻辑全部在 Services 与 ViewModels。
/// </summary>
public partial class App : Application
{
    private static readonly string AppMutexName = "Global\\MangaManager.Console.SingleInstance";
    private static Mutex? _appMutex;
    private TaskbarIcon? _trayIcon;
    private MainWindow? _mainWindow;
    private MainViewModel? _vm;
    private IDownloadMonitor? _monitor;
    private bool _isExiting;

    protected override void OnStartup(StartupEventArgs e)
    {
        // 单实例校验：如果已有实例在运行，激活已有窗口并退出
        _appMutex = new Mutex(true, AppMutexName, out bool createdNew);
        if (!createdNew)
        {
            WakeExistingInstance();
            Shutdown();
            return;
        }

        base.OnStartup(e);

        // 托盘模式：窗口隐藏时不退出，只有显式调用 Exit 才退出
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        _trayIcon = (TaskbarIcon)FindResource("TrayIcon");
        _trayIcon.TrayMouseDoubleClick += (_, _) => ShowWindow();

        // ── 组合根：组装依赖 ──
        var config = AppConfig.LoadFrom(AppDomain.CurrentDomain.BaseDirectory);
        config.ProjectRoot = FindProjectRoot();

        var dispatcher = new DispatcherService(Dispatcher);
        var logService = new LogService(config.Logging.MaxLines,
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "console.log"),
            config.Logging.MaxFileSizeKB);
        var runner = new ProcessRunner(dispatcher);
        var probe = new HttpProbe();
        var apiClient = new ApiClient(config.Services.Api.Url, config.Monitoring.HttpTimeoutSeconds);
        var serviceManager = new ServiceManager(runner, probe, logService, config, dispatcher);
        var monitor = new DownloadMonitor(apiClient, logService, config, dispatcher);
        var envProbe = new EnvironmentProbe();
        _monitor = monitor;
        _vm = new MainViewModel(serviceManager, monitor, apiClient, logService, envProbe, config);

        ShowWindow();
    }

    /// <summary>向已有实例发送消息，激活其窗口</summary>
    private static void WakeExistingInstance()
    {
        var currentProcess = Process.GetCurrentProcess();
        var processes = Process.GetProcessesByName(currentProcess.ProcessName);
        foreach (var p in processes)
        {
            if (p.Id != currentProcess.Id && p.MainWindowHandle != IntPtr.Zero)
            {
                NativeMethods.ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
                NativeMethods.SetForegroundWindow(p.MainWindowHandle);
                break;
            }
        }
    }

    private void ShowWindow()
    {
        if (_mainWindow == null)
        {
            _mainWindow = new MainWindow { DataContext = _vm };
            _mainWindow.Closing += (_, e) =>
            {
                if (_isExiting) return; // 真正退出时允许关闭
                e.Cancel = true;
                _mainWindow.Hide();
            };
            _mainWindow.Show();
        }
        else
        {
            _mainWindow.Show();
            _mainWindow.WindowState = WindowState.Normal;
            _mainWindow.Activate();
        }
    }

    /// <summary>标记退出流程开始（允许窗口真正关闭，不再隐藏到托盘）</summary>
    internal void MarkExiting() => _isExiting = true;

    private void ShowWindow_Click(object sender, RoutedEventArgs e) => ShowWindow();

    private async void StartAll_Click(object sender, RoutedEventArgs e)
    {
        ShowWindow();
        if (_vm != null) await _vm.StartAllAsync();
    }

    private async void StopAll_Click(object sender, RoutedEventArgs e)
    {
        if (_vm != null) await _vm.StopAllAsync();
    }

    private void OpenWeb_Click(object sender, RoutedEventArgs e) => _vm?.OpenWebCommand.Execute(null);

    private async void Exit_Click(object sender, RoutedEventArgs e)
    {
        var result = System.Windows.MessageBox.Show(
            "退出将停止所有服务（API + 前端），确定退出？",
            "MangaManager", MessageBoxButton.YesNo, MessageBoxImage.Question);
        if (result != MessageBoxResult.Yes) return;

        _isExiting = true;
        if (_vm != null) await _vm.ShutdownAsync();
        if (_monitor != null) await _monitor.DisposeAsync();
        _trayIcon?.Dispose();
        _appMutex?.ReleaseMutex();
        Application.Current.Shutdown();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        _appMutex?.ReleaseMutex();
        base.OnExit(e);
    }

    /// <summary>向上查找项目根目录（包含 MangaManager.slnx 或 src 目录）</summary>
    private static string FindProjectRoot()
    {
        var dir = AppDomain.CurrentDomain.BaseDirectory;
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir, "MangaManager.slnx"))
                || Directory.Exists(Path.Combine(dir, "src", "backend")))
                return dir;
            var parent = Path.GetDirectoryName(dir);
            if (parent == dir) break;
            dir = parent;
        }
        // 降级：使用 exe 所在目录
        return AppDomain.CurrentDomain.BaseDirectory;
    }
}

/// <summary>P/Invoke 辅助方法</summary>
internal static class NativeMethods
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    internal static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    internal static extern bool SetForegroundWindow(IntPtr hWnd);
}
