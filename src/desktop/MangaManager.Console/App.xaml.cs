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
    private static bool _appMutexOwned;   // 仅创建者持有，释放前必须校验，避免双重释放崩溃
    private TaskbarIcon? _trayIcon;
    private MainWindow? _mainWindow;
    private MainViewModel? _vm;
    private IDownloadMonitor? _monitor;
    private LogService? _logService;
    private Window? _dialogOwner;
    private bool _isExiting;
    private bool _exitPrompting;

    protected override void OnStartup(StartupEventArgs e)
    {
        // 单实例校验：如果已有实例在运行，激活已有窗口并退出
        _appMutex = new Mutex(true, AppMutexName, out bool createdNew);
        _appMutexOwned = createdNew;
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
        _logService = logService;
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

    /// <summary>
    /// 托盘菜单「退出」。
    ///
    /// 历史故障：确认框只显示几秒就自己消失，导致手动退出根本点不到。
    /// 原因是托盘菜单（ToolStrip/弹出窗口）关闭时会销毁属于它的窗口，
    /// 而无 owner 的 MessageBox 会让系统把"当前活动窗口"（即那个弹出窗口）
    /// 当成 owner，于是弹出窗口一销毁，确认框被连带关掉。
    ///
    /// 修法两件事：① 等菜单彻底关闭后再弹（BeginInvoke + 短暂延迟）；
    /// ② 显式指定一个长期存在的 owner 窗口（主窗口，隐藏状态也仍有句柄）。
    /// </summary>
    private void Exit_Click(object sender, RoutedEventArgs e)
        => Dispatcher.BeginInvoke(new Action(ConfirmExitAsync),
            System.Windows.Threading.DispatcherPriority.Background);

    private async void ConfirmExitAsync()
    {
        if (_exitPrompting || _isExiting) return;   // 防连点/防重入
        _exitPrompting = true;
        try
        {
            await Task.Delay(250);   // 给托盘菜单完成关闭/弹出窗口销毁留出时间

            var choice = System.Windows.MessageBox.Show(
                EnsureDialogOwner(),
                "退出将停止所有服务（API + 前端），确定退出？",
                "MangaManager", MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
            if (choice != MessageBoxResult.Yes) return;

            _isExiting = true;
            _logService?.Log("收到退出指令，正在停止服务...");
            if (_trayIcon != null) _trayIcon.ToolTipText = "MangaManager - 正在退出...";

            try
            {
                if (_vm != null) await _vm.ShutdownAsync();
                if (_monitor != null) await _monitor.DisposeAsync();
            }
            catch (Exception ex)
            {
                // 停止服务失败也必须让用户退出，否则就会卡在"退不掉"的状态
                _logService?.Log($"退出时停止服务出错（继续退出）: {ex.Message}");
            }
            finally
            {
                _trayIcon?.Dispose();
                Application.Current.Shutdown();
            }
        }
        catch (Exception ex)
        {
            _logService?.Log($"退出流程异常，强制退出: {ex.Message}");
            _isExiting = true;
            Application.Current.Shutdown();
        }
        finally
        {
            _exitPrompting = false;
        }
    }

    /// <summary>
    /// 对话框 owner：优先用主窗口（即便隐藏，句柄依然有效）；
    /// 主窗口还没建好时退化为一个不可见的 1×1 窗口，保证 MessageBox 有稳定 owner。
    /// </summary>
    private Window EnsureDialogOwner()
    {
        if (_mainWindow != null) return _mainWindow;

        if (_dialogOwner == null)
        {
            _dialogOwner = new Window
            {
                Title = "MangaManager",
                Width = 1,
                Height = 1,
                Left = -32000,
                Top = -32000,
                ShowInTaskbar = false,
                ShowActivated = false,
                WindowStyle = WindowStyle.None,
                Visibility = Visibility.Hidden,
            };
            new System.Windows.Interop.WindowInteropHelper(_dialogOwner).EnsureHandle();
        }
        return _dialogOwner;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        ReleaseAppMutex();
        base.OnExit(e);
    }

    /// <summary>安全释放单实例互斥锁：仅持有者释放一次，异常容错（避免双重释放/未持有释放崩溃）</summary>
    private static void ReleaseAppMutex()
    {
        if (_appMutex != null && _appMutexOwned)
        {
            try { _appMutex.ReleaseMutex(); }
            catch (ApplicationException) { /* 已释放或线程不持有，忽略 */ }
            _appMutexOwned = false;
        }
        _appMutex?.Dispose();
        _appMutex = null;
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
