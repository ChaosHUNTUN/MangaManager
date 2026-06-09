using System.Diagnostics;
using System.Windows;
using Hardcodet.Wpf.TaskbarNotification;

namespace MangaManager.Console;

public partial class App : Application
{
    private static readonly string AppMutexName = "Global\\MangaManager.Console.SingleInstance";
    private static Mutex? _appMutex;
    private TaskbarIcon? _trayIcon;
    private MainWindow? _mainWindow;

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

        // 托盘模式：窗口隐藏时不退出，只有显式调用 Exit_Click 才退出
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        _trayIcon = (TaskbarIcon)FindResource("TrayIcon");
        _trayIcon.TrayMouseDoubleClick += (_, _) => ShowWindow();

        // 手动创建并显示主窗口
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
            _mainWindow = new MainWindow();
            _mainWindow.Closing += (_, e) =>
            {
                e.Cancel = true;
                _mainWindow.Hide();
            };
        }
        else
        {
            _mainWindow.Show();
            _mainWindow.WindowState = WindowState.Normal;
            _mainWindow.Activate();
        }
    }

    private void ShowWindow_Click(object sender, RoutedEventArgs e) => ShowWindow();

    private void StartAll_Click(object sender, RoutedEventArgs e)
    {
        ShowWindow();
        _mainWindow?.Dispatcher.Invoke(() =>
        {
            var win = _mainWindow;
            typeof(MainWindow).GetMethod("StartApi", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.Invoke(win, null);
            typeof(MainWindow).GetMethod("StartUi", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.Invoke(win, null);
        });
    }

    private void StopAll_Click(object sender, RoutedEventArgs e)
    {
        _mainWindow?.Dispatcher.Invoke(() =>
        {
            var win = _mainWindow;
            typeof(MainWindow).GetMethod("StopApi", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.Invoke(win, null);
            typeof(MainWindow).GetMethod("StopUi", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.Invoke(win, null);
        });
    }

    private void OpenWeb_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo("http://localhost:5173") { UseShellExecute = true });
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        _trayIcon?.Dispose();
        _mainWindow?.Close();
        _appMutex?.ReleaseMutex();
        Environment.Exit(0);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        _appMutex?.ReleaseMutex();
        base.OnExit(e);
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
