using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using MangaManager.Console.Infrastructure;
using MangaManager.Console.Models;
using MangaManager.Console.Services;
using MangaManager.Shared.Download;

namespace MangaManager.Console.ViewModels;

/// <summary>主视图模型：服务状态、下载任务、日志、全部命令</summary>
public class MainViewModel : ViewModelBase
{
    private static readonly Brush Green = Freeze("#10b981");
    private static readonly Brush Yellow = Freeze("#f59e0b");
    private static readonly Brush Red = Freeze("#ef4444");
    private static readonly Brush PillAll = Freeze("#1810B981");
    private static readonly Brush PillPartial = Freeze("#1878350F");
    private static readonly Brush PillNone = Freeze("#187F1D1D");

    private static Brush Freeze(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)!);
        brush.Freeze();
        return brush;
    }

    private readonly IServiceManager _serviceManager;
    private readonly IDownloadMonitor _downloadMonitor;
    private readonly IApiClient _apiClient;
    private readonly LogService _logService;
    private readonly EnvironmentProbe _envProbe;
    private readonly AppConfig _config;

    private string _globalStatusText = "● 检查中...";
    private Brush _globalStatusBrush = Yellow;
    private Brush _globalStatusPillBrush = PillPartial;
    private string _downloadSummary = "";
    private bool _hasFailedTasks;
    private bool _hasNoTasks = true;
    private string _taskFilter = "all";
    private string _logText = "";
    private DateTime _lastLogFlush = DateTime.MinValue;
    private bool _logFlushQueued;
    private DispatcherTimer? _statusTimer;
    private bool _statusRefreshing;

    public ServiceCardViewModel ApiCard { get; }
    public ServiceCardViewModel UiCard { get; }
    public ObservableCollection<DownloadTaskVm> Tasks { get; } = new();
    /// <summary>筛选后的任务列表（绑定用）</summary>
    public ObservableCollection<DownloadTaskVm> FilteredTasks { get; } = new();

    public MainViewModel(
        IServiceManager serviceManager,
        IDownloadMonitor downloadMonitor,
        IApiClient apiClient,
        LogService logService,
        EnvironmentProbe envProbe,
        AppConfig config)
    {
        _serviceManager = serviceManager;
        _downloadMonitor = downloadMonitor;
        _apiClient = apiClient;
        _logService = logService;
        _envProbe = envProbe;
        _config = config;

        ApiCard = new ServiceCardViewModel(config.Services.Api.Name, config.Services.Api.Url);
        UiCard = new ServiceCardViewModel(config.Services.Ui.Name, config.Services.Ui.Url);

        _serviceManager.StatusChanged += (_, e) =>
        {
            var card = e.Status.Key == "api" ? ApiCard : UiCard;
            card.Apply(e.Status);
            UpdateGlobalStatus();
            CommandManager.InvalidateRequerySuggested();
        };
        _downloadMonitor.TasksUpdated += OnTasksUpdated;
        _logService.Logged += OnLogLogged;

        StartAllCommand = new AsyncRelayCommand(_ => StartAllAsync(),
            _ => ApiCard.IsStartEnabled || UiCard.IsStartEnabled, LogError);
        StopAllCommand = new AsyncRelayCommand(_ => StopAllAsync(),
            _ => ApiCard.IsStopEnabled || UiCard.IsStopEnabled, LogError);
        StartApiCommand = new AsyncRelayCommand(_ => _serviceManager.StartAsync("api"), _ => ApiCard.IsStartEnabled, LogError);
        StopApiCommand = new AsyncRelayCommand(_ => _serviceManager.StopAsync("api"), _ => ApiCard.IsStopEnabled, LogError);
        RestartApiCommand = new AsyncRelayCommand(_ => _serviceManager.RestartAsync("api"), _ => ApiCard.IsRestartEnabled, LogError);
        StartUiCommand = new AsyncRelayCommand(_ => _serviceManager.StartAsync("ui"), _ => UiCard.IsStartEnabled, LogError);
        StopUiCommand = new AsyncRelayCommand(_ => _serviceManager.StopAsync("ui"), _ => UiCard.IsStopEnabled, LogError);
        RestartUiCommand = new AsyncRelayCommand(_ => _serviceManager.RestartAsync("ui"), _ => UiCard.IsRestartEnabled, LogError);
        PauseTaskCommand = new AsyncRelayCommand(p => _apiClient.PauseTaskAsync(ToGid(p)), onError: LogError);
        ResumeTaskCommand = new AsyncRelayCommand(p => _apiClient.ResumeTaskAsync(ToGid(p)), onError: LogError);
        RestartTaskCommand = new AsyncRelayCommand(p => _apiClient.RestartTaskAsync(ToGid(p)), onError: LogError);
        RemoveTaskCommand = new AsyncRelayCommand(async p => await RemoveTaskAsync(ToGid(p)), onError: LogError);
        RestartAllFailedCommand = new AsyncRelayCommand(_ => _apiClient.RestartAllFailedAsync(), onError: LogError);
        OpenWebCommand = new RelayCommand(_ => OpenBrowser(config.Services.Ui.Url));
        OpenLocalCommand = new RelayCommand(_ => OpenBrowser($"{config.Services.Ui.Url}/local"));
        OpenEhentaiCommand = new RelayCommand(_ => OpenBrowser($"{config.Services.Ui.Url}/ehentai"));
        ClearLogCommand = new RelayCommand(_ => _logService.Clear());
        OpenLogCommand = new RelayCommand(_ => OpenLogFile());
    }

    // ===== 状态 =====
    public string GlobalStatusText { get => _globalStatusText; private set => Set(ref _globalStatusText, value); }
    public Brush GlobalStatusBrush { get => _globalStatusBrush; private set => Set(ref _globalStatusBrush, value); }
    public Brush GlobalStatusPillBrush { get => _globalStatusPillBrush; private set => Set(ref _globalStatusPillBrush, value); }
    public string DownloadSummary { get => _downloadSummary; private set => Set(ref _downloadSummary, value); }
    public bool HasFailedTasks { get => _hasFailedTasks; private set => Set(ref _hasFailedTasks, value); }
    public bool HasNoTasks { get => _hasNoTasks; private set => Set(ref _hasNoTasks, value); }
    public string LogText { get => _logText; private set => Set(ref _logText, value); }
    public Visibility ApiCardVisibility => _config.Services.Api.Enabled ? Visibility.Visible : Visibility.Collapsed;
    public Visibility UiCardVisibility => _config.Services.Ui.Enabled ? Visibility.Visible : Visibility.Collapsed;

    // ===== 任务筛选 =====
    public string TaskFilter
    {
        get => _taskFilter;
        set { if (Set(ref _taskFilter, value)) RebuildFiltered(); }
    }
    public bool IsFilterAll { get => _taskFilter == "all"; set { if (value) TaskFilter = "all"; } }
    public bool IsFilterDownloading { get => _taskFilter == "downloading"; set { if (value) TaskFilter = "downloading"; } }
    public bool IsFilterPending { get => _taskFilter == "pending"; set { if (value) TaskFilter = "pending"; } }
    public bool IsFilterPaused { get => _taskFilter == "paused"; set { if (value) TaskFilter = "paused"; } }
    public bool IsFilterFailed { get => _taskFilter == "failed"; set { if (value) TaskFilter = "failed"; } }

    // ===== 命令 =====
    public ICommand StartAllCommand { get; }
    public ICommand StopAllCommand { get; }
    public ICommand StartApiCommand { get; }
    public ICommand StopApiCommand { get; }
    public ICommand RestartApiCommand { get; }
    public ICommand StartUiCommand { get; }
    public ICommand StopUiCommand { get; }
    public ICommand RestartUiCommand { get; }
    public ICommand PauseTaskCommand { get; }
    public ICommand ResumeTaskCommand { get; }
    public ICommand RestartTaskCommand { get; }
    public ICommand RemoveTaskCommand { get; }
    public ICommand RestartAllFailedCommand { get; }
    public ICommand OpenWebCommand { get; }
    public ICommand OpenLocalCommand { get; }
    public ICommand OpenEhentaiCommand { get; }
    public ICommand ClearLogCommand { get; }
    public ICommand OpenLogCommand { get; }

    public async Task InitializeAsync()
    {
        _logService.Log("MangaManager 管理控制台已启动");
        _logService.Log("正在检测运行环境...");
        // 环境探测并行
        var dotnetTask = _envProbe.GetDotnetVersionAsync();
        var nodeTask = _envProbe.GetNodeVersionAsync();
        var (dotnetOk, dotnetVer) = await dotnetTask;
        _logService.Log(dotnetOk ? $"✓ .NET SDK: {dotnetVer}" : "⚠ 未检测到 dotnet 命令，API 后端将无法启动");
        var (nodeOk, nodeVer) = await nodeTask;
        _logService.Log(nodeOk ? $"✓ Node.js: {nodeVer}" : "⚠ 未检测到 node 命令，Web 前端将无法启动");

        await _serviceManager.RefreshAsync();
        _downloadMonitor.Start();

        try
        {
            var startTasks = new List<Task>();
            if (_config.Services.Api.Enabled && ApiCard.State != ServiceState.Running)
            {
                _logService.Log("检测到 API 后端未运行，正在自动启动...");
                startTasks.Add(_serviceManager.StartAsync("api"));
            }
            if (_config.Services.Ui.Enabled && UiCard.State != ServiceState.Running)
            {
                _logService.Log("检测到 Web 前端未运行，正在自动启动...");
                startTasks.Add(_serviceManager.StartAsync("ui"));
            }
            await Task.WhenAll(startTasks);
        }
        catch (Exception ex)
        {
            _logService.Log($"自动启动服务失败: {ex.Message}");
        }

        StartStatusTimer();
    }

    public Task StartAllAsync() => _serviceManager.StartAllAsync();
    public Task StopAllAsync() => _serviceManager.StopAllAsync();

    public async Task ShutdownAsync()
    {
        _statusTimer?.Stop();
        _downloadMonitor.Stop();
        await _serviceManager.StopAllAsync();
    }

    /// <summary>周期探测服务实际状态（发现外部启动/停止），30s 一次</summary>
    private void StartStatusTimer()
    {
        if (_statusTimer != null) return;
        _statusTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(30) };
        _statusTimer.Tick += async (_, _) =>
        {
            if (_statusRefreshing) return;
            _statusRefreshing = true;
            try { await _serviceManager.RefreshAsync(); }
            catch { }
            finally { _statusRefreshing = false; }
        };
        _statusTimer.Start();
    }

    private void OnTasksUpdated(object? sender, IReadOnlyList<DownloadTaskDto> dtos)
    {
        var byGid = new Dictionary<int, DownloadTaskDto>();
        foreach (var d in dtos) byGid[d.Gid] = d;

        for (int i = Tasks.Count - 1; i >= 0; i--)
        {
            if (!byGid.ContainsKey(Tasks[i].Gid)) Tasks.RemoveAt(i);
        }
        foreach (var dto in dtos)
        {
            var vm = Tasks.FirstOrDefault(t => t.Gid == dto.Gid);
            if (vm != null) vm.MapFrom(dto);
            else Tasks.Add(new DownloadTaskVm().MapFrom(dto));
        }

        var downloading = dtos.Count(d => d.Status == "downloading");
        var pending = dtos.Count(d => d.Status == "pending");
        var failed = dtos.Count(d => d.Status == "failed");
        var parts = new List<string>();
        if (downloading > 0) parts.Add($"{downloading} 下载中");
        if (pending > 0) parts.Add($"{pending} 等待中");
        if (failed > 0) parts.Add($"{failed} 失败");
        DownloadSummary = parts.Count > 0 ? string.Join(" · ", parts) : "空闲";
        HasFailedTasks = failed > 0;
        RebuildFiltered();
    }

    private void RebuildFiltered()
    {
        FilteredTasks.Clear();
        foreach (var t in Tasks)
            if (MatchesFilter(t)) FilteredTasks.Add(t);
        HasNoTasks = FilteredTasks.Count == 0;
    }

    private bool MatchesFilter(DownloadTaskVm t) => _taskFilter switch
    {
        "downloading" => t.Status == "downloading",
        "pending"     => t.Status == "pending",
        "paused"      => t.Status == "paused",
        "failed"      => t.Status == "failed",
        _             => true
    };

    private void UpdateGlobalStatus()
    {
        bool apiRunning = ApiCard.State == ServiceState.Running;
        bool uiRunning = UiCard.State == ServiceState.Running;
        if (apiRunning && uiRunning)
        {
            GlobalStatusText = "● 全部运行中";
            GlobalStatusBrush = Green;
            GlobalStatusPillBrush = PillAll;
        }
        else if (apiRunning || uiRunning)
        {
            GlobalStatusText = "● 部分运行中";
            GlobalStatusBrush = Yellow;
            GlobalStatusPillBrush = PillPartial;
        }
        else
        {
            GlobalStatusText = "● 全部停止";
            GlobalStatusBrush = Red;
            GlobalStatusPillBrush = PillNone;
        }
    }

    private async Task RemoveTaskAsync(int gid)
    {
        await _apiClient.RemoveTaskAsync(gid);
        var task = Tasks.FirstOrDefault(t => t.Gid == gid);
        if (task != null) Tasks.Remove(task);
        RebuildFiltered();
        _logService.Log($"移除任务 GID={gid}");
        // 立即同步一次，消除与轮询快照的竞态
        var tasks = await _apiClient.GetDownloadTasksAsync();
        OnTasksUpdated(this, tasks);
    }

    private void LogError(Exception ex) => _logService.Log($"操作失败: {ex.Message}");

    private void OpenLogFile()
    {
        var path = _logService.FilePath;
        if (string.IsNullOrEmpty(path) || !File.Exists(path))
        {
            _logService.Log("日志文件尚未生成");
            return;
        }
        try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }
        catch (Exception ex) { _logService.Log($"打开日志文件失败: {ex.Message}"); }
    }

    /// <summary>日志刷新节流：最多每 200ms 全量重建一次日志文本，避免日志洪流拖垮 UI 线程</summary>
    private void OnLogLogged(object? sender, EventArgs e)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher == null) return;
        // 自动重启等后台线程也会写日志，统一回 UI 线程
        if (!dispatcher.CheckAccess())
        {
            dispatcher.BeginInvoke(() => OnLogLogged(sender, e));
            return;
        }

        var now = DateTime.UtcNow;
        if (now - _lastLogFlush < TimeSpan.FromMilliseconds(200))
        {
            if (_logFlushQueued) return;
            _logFlushQueued = true;
            dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
            {
                _logFlushQueued = false;
                _lastLogFlush = DateTime.UtcNow;
                LogText = _logService.Content;
            });
            return;
        }
        _lastLogFlush = now;
        LogText = _logService.Content;
    }

    private static int ToGid(object? parameter) => parameter is int gid ? gid : 0;

    private static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { System.Windows.MessageBox.Show($"无法打开浏览器: {ex.Message}"); }
    }
}
