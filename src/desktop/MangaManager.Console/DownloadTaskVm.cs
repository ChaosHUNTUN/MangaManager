using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Media;

namespace MangaManager.Console;

/// <summary>下载任务视图模型，用于 DataGrid 绑定。</summary>
public class DownloadTaskVm : INotifyPropertyChanged
{
    // ========== 缓存画刷，避免每次 get 创建新对象 ==========
    private static readonly Dictionary<string, Brush> BrushCache = new()
    {
        ["RUN"]      = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#4ade80")!),
        ["PAUSE"]    = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#facc15")!),
        ["FATAL"]    = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#ef4444")!),
        ["DEFAULT"]  = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#60a5fa")!),
    };

    private static readonly Dictionary<string, Brush> BgBrushCache = new()
    {
        ["RUN"]      = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#10b981")!),
        ["PAUSE"]    = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#eab308")!),
        ["FATAL"]    = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#ef4444")!),
        ["DEFAULT"]  = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3b82f6")!),
    };

    // ========== 字段 ==========
    private int _gid;
    private string _title = "";
    private string _status = "";
    private string _artist = "";
    private int _totalPages;
    private int _downloadedPages;
    private int _failedPages;
    private decimal _speed;
    private long _speedBps;
    private string? _errorMsg;
    private string _apiSpeedText = "";  // API 返回的格式化速度字符串 ("23 KB/s")

    public event PropertyChangedEventHandler? PropertyChanged;

    // ========== 属性 ==========
    public int Gid { get => _gid; set => Set(ref _gid, value); }
    public string Title { get => _title; set => Set(ref _title, value); }

    public string Status
    {
        get => _status;
        set
        {
            if (Set(ref _status, value))
            {
                OnPropertyChanged(nameof(StatusText));
                OnPropertyChanged(nameof(StatusColor));
                OnPropertyChanged(nameof(StatusBgBrush));
                OnPropertyChanged(nameof(ProgressBrush));
                OnPropertyChanged(nameof(PauseVisible));
                OnPropertyChanged(nameof(ResumeVisible));
                OnPropertyChanged(nameof(DeleteVisible));
            }
        }
    }

    public string Artist { get => _artist; set => Set(ref _artist, value); }
    public int TotalPages { get => _totalPages; set => Set(ref _totalPages, value); }
    public int DownloadedPages { get => _downloadedPages; set => Set(ref _downloadedPages, value); }
    public int FailedPages { get => _failedPages; set => Set(ref _failedPages, value); }
    public decimal Speed { get => _speed; set => Set(ref _speed, value); }
    public long SpeedBps { get => _speedBps; set => Set(ref _speedBps, value); }
    public string? ErrorMsg { get => _errorMsg; set => Set(ref _errorMsg, value); }

    /// <summary>绑定 API 返回的 speedText 字段 (json 名 "speedText")</summary>
    [JsonPropertyName("speedText")]
    public string ApiSpeedText
    {
        get => _apiSpeedText;
        set { if (Set(ref _apiSpeedText, value)) { OnPropertyChanged(nameof(SpeedText)); OnPropertyChanged(nameof(SubText)); } }
    }

    // ========== 计算属性 ==========
    public string StatusText => Status switch
    {
        "downloading" => "下载中",
        "pending"     => "等待中",
        "paused"      => "已暂停",
        "failed"      => "失败",
        "completed"   => "已完成",
        _             => Status
    };

    public Brush StatusColor => Status switch
    {
        "downloading" => BrushCache["RUN"],
        "pending"     => BrushCache["DEFAULT"],
        "paused"      => BrushCache["PAUSE"],
        "failed"      => BrushCache["FATAL"],
        _             => BrushCache["DEFAULT"]
    };

    public Brush StatusBgBrush => Status switch
    {
        "downloading" => BgBrushCache["RUN"],
        "pending"     => BgBrushCache["DEFAULT"],
        "paused"      => BgBrushCache["PAUSE"],
        "failed"      => BgBrushCache["FATAL"],
        _             => BgBrushCache["DEFAULT"]
    };

    public Brush ProgressBrush => Status switch
    {
        "downloading" => BrushCache["RUN"],
        "failed"      => BrushCache["FATAL"],
        _             => BrushCache["DEFAULT"]
    };

    public double ProgressFraction => TotalPages > 0
        ? (double)DownloadedPages / TotalPages
        : 0;

    // ========== 按钮可见性 (使用 System.Windows.Visibility 枚举) ==========
    public Visibility PauseVisible =>
        Status is "downloading" or "pending" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility ResumeVisible =>
        Status is "paused" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility DeleteVisible =>
        Status is "pending" or "paused" or "failed" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility SpeedVisible =>
        Status is "downloading" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility ErrorVisible =>
        Status is "failed" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility RestartVisible =>
        Status is "failed" or "paused" ? Visibility.Visible : Visibility.Collapsed;

    public Visibility RemoveVisible =>
        Status is "pending" or "downloading" or "paused" or "failed" or "completed" ? Visibility.Visible : Visibility.Collapsed;

    [System.Text.Json.Serialization.JsonIgnore]
    public string SpeedText => string.IsNullOrEmpty(_apiSpeedText) ? "0 B/s" : _apiSpeedText;

    public string SubText
    {
        get
        {
            if (Status == "failed") return ErrorMsg ?? StatusText;
            if (Status == "downloading") return $"{DownloadedPages}/{TotalPages} — {SpeedText}";
            if (Status == "completed") return $"{DownloadedPages}/{TotalPages} — 已完成";
            if (Status == "paused") return $"{DownloadedPages}/{TotalPages} — 已暂停";
            return $"{DownloadedPages}/{TotalPages} — {StatusText}";
        }
    }

    // ========== 辅助方法 ==========
    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }

    protected void OnPropertyChanged(string name)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
