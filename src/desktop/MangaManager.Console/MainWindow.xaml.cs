using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using MangaManager.Console.ViewModels;

namespace MangaManager.Console;

/// <summary>
/// 视图层：只保留窗口级行为（加载/拖拽/最小化/关闭确认/日志滚动），
/// 全部业务逻辑在 MainViewModel 与 Services。
/// </summary>
public partial class MainWindow : Window
{
    private MainViewModel? _vm;
    private bool _restoreMaximized;

    private static string WindowStatePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MangaManager", "window.json");

    public MainWindow()
    {
        InitializeComponent();
        Closing += (_, _) => SaveWindowState();
        RestoreWindowState();
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _vm = DataContext as MainViewModel;
        if (_restoreMaximized) WindowState = WindowState.Maximized;
        if (_vm != null) _ = _vm.InitializeAsync();
    }

    private void Window_Drag(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (e.ChangedButton == System.Windows.Input.MouseButton.Left)
            DragMove();
    }

    private void Minimize_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        // 关闭 = 最小化到托盘，服务继续运行；真正退出请用托盘菜单
        Hide();
    }

    private void TxtLog_TextChanged(object sender, TextChangedEventArgs e)
    {
        TxtLog.ScrollToEnd();
    }

    private void RestoreWindowState()
    {
        try
        {
            if (!File.Exists(WindowStatePath)) return;
            var s = JsonSerializer.Deserialize<WindowStateData>(File.ReadAllText(WindowStatePath));
            if (s == null) return;

            double vsLeft = SystemParameters.VirtualScreenLeft;
            double vsTop = SystemParameters.VirtualScreenTop;
            double vsRight = vsLeft + SystemParameters.VirtualScreenWidth;
            double vsBottom = vsTop + SystemParameters.VirtualScreenHeight;
            bool visible = s.Width >= 200 && s.Height >= 150
                && s.Left >= vsLeft - 100 && s.Top >= vsTop - 100
                && s.Left + 100 <= vsRight && s.Top + 100 <= vsBottom;
            if (visible)
            {
                Left = s.Left;
                Top = s.Top;
                Width = s.Width;
                Height = s.Height;
            }
            _restoreMaximized = s.Maximized;
        }
        catch { /* 状态文件损坏时忽略 */ }
    }

    private void SaveWindowState()
    {
        try
        {
            var dir = Path.GetDirectoryName(WindowStatePath);
            if (dir != null) Directory.CreateDirectory(dir);
            var data = new WindowStateData
            {
                Left = Left,
                Top = Top,
                Width = Width,
                Height = Height,
                Maximized = WindowState == WindowState.Maximized
            };
            File.WriteAllText(WindowStatePath, JsonSerializer.Serialize(data));
        }
        catch { /* 保存失败不影响运行 */ }
    }
}

internal class WindowStateData
{
    public double Left { get; set; }
    public double Top { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
    public bool Maximized { get; set; }
}
