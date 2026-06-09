using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using System.Windows.Media;

namespace MangaManager.Console;

public class DownloadTaskVm : INotifyPropertyChanged
{
    private int _gid;
    private string _title = "";
    private string _status = "pending";
    private int _totalPages;
    private int _downloadedPages;
    private int _failedPages;
    private string? _errorMsg;
    private double _speedBps;
    private string _speed = "";

    public int Gid { get => _gid; set => Set(ref _gid, value); }
    public string Title { get => _title; set => Set(ref _title, value ?? $"Gallery #{Gid}"); }

    [JsonPropertyName("status")]
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
                OnPropertyChanged(nameof(PauseVisible));
                OnPropertyChanged(nameof(ResumeVisible));
                OnPropertyChanged(nameof(RestartVisible));
                OnPropertyChanged(nameof(RemoveVisible));
                OnPropertyChanged(nameof(ErrorVisible));
                OnPropertyChanged(nameof(SpeedVisible));
                OnPropertyChanged(nameof(ProgressBrush));
            }
        }
    }

    public int TotalPages { get => _totalPages; set { if (Set(ref _totalPages, value)) { OnPropertyChanged(nameof(ProgressFraction)); OnPropertyChanged(nameof(ProgressPercent)); } } }
    public int DownloadedPages { get => _downloadedPages; set { if (Set(ref _downloadedPages, value)) { OnPropertyChanged(nameof(ProgressFraction)); OnPropertyChanged(nameof(ProgressPercent)); } } }
    public int FailedPages { get => _failedPages; set => Set(ref _failedPages, value); }
    public string? ErrorMsg { get => _errorMsg; set { if (Set(ref _errorMsg, value)) OnPropertyChanged(nameof(ErrorVisible)); } }
    public double SpeedBps { get => _speedBps; set { Set(ref _speedBps, value); OnPropertyChanged(nameof(SpeedText)); OnPropertyChanged(nameof(SpeedVisible)); } }

    [JsonPropertyName("speed")]
    public string Speed { get => _speed; set { Set(ref _speed, value); OnPropertyChanged(nameof(SpeedText)); OnPropertyChanged(nameof(SpeedVisible)); } }

    // 计算属性
    public string StatusText => Status switch
    {
        "pending" => "等待中",
        "downloading" => "下载中",
        "paused" => "已暂停",
        "completed" => "已完成",
        "failed" => "失败",
        _ => Status
    };

    public Brush StatusColor => new SolidColorBrush(
        (Color)ColorConverter.ConvertFromString(Status switch
        {
            "pending" => "#FFF59E0B",
            "downloading" => "#FF3B82F6",
            "paused" => "#FF8B5CF6",
            "completed" => "#FF10B981",
            "failed" => "#FFEF4444",
            _ => "#FF666666"
        }));

    public Brush StatusBgBrush => new SolidColorBrush(
        (Color)ColorConverter.ConvertFromString(Status switch
        {
            "pending" => "#3378350F",
            "downloading" => "#331D4ED8",
            "paused" => "#336D28D9",
            "completed" => "#33047857",
            "failed" => "#337F1D1D",
            _ => "#331A1A2E"
        }));

    public string SpeedText => !string.IsNullOrEmpty(Speed) ? Speed
        : SpeedBps > 1e6 ? $"{SpeedBps / 1e6:F1} MB/s"
        : SpeedBps > 1e3 ? $"{SpeedBps / 1e3:F0} KB/s"
        : SpeedBps > 0 ? $"{SpeedBps:F0} B/s"
        : "";

    public double ProgressPercent => TotalPages > 0 ? (double)DownloadedPages / TotalPages * 100 : 0;
    public double ProgressFraction => TotalPages > 0 ? (double)DownloadedPages / TotalPages : 0;

    public Brush ProgressBrush => new SolidColorBrush(
        (Color)ColorConverter.ConvertFromString(Status == "failed" ? "#FFEF4444"
            : Status == "paused" ? "#FF8B5CF6"
            : Status == "completed" ? "#FF10B981"
            : "#FF3B82F6"));

    // 按钮可见性
    public string PauseVisible => Status == "downloading" ? "Visible" : "Collapsed";
    public string ResumeVisible => Status == "paused" ? "Visible" : "Collapsed";
    public string RestartVisible => Status == "failed" ? "Visible" : "Collapsed";
    public string RemoveVisible => Status is "completed" or "failed" or "paused" ? "Visible" : "Collapsed";
    public string ErrorVisible => !string.IsNullOrEmpty(ErrorMsg) ? "Visible" : "Collapsed";
    public string SpeedVisible => Status == "downloading" && !string.IsNullOrEmpty(SpeedText) ? "Visible" : "Collapsed";

    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }

    protected void OnPropertyChanged(string name) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
