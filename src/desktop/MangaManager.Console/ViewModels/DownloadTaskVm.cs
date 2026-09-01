using System.Windows;
using System.Windows.Media;
using MangaManager.Shared.Download;

namespace MangaManager.Console.ViewModels;

/// <summary>下载任务 UI 视图模型（从共享 DTO 映射，负责展示状态/颜色/可见性）</summary>
public class DownloadTaskVm : ViewModelBase
{
    private static readonly Dictionary<string, Brush> BrushCache = new()
    {
        ["RUN"]     = Freeze("#4ade80"),
        ["PAUSE"]   = Freeze("#facc15"),
        ["FATAL"]   = Freeze("#ef4444"),
        ["DEFAULT"] = Freeze("#60a5fa"),
    };

    private static readonly Dictionary<string, Brush> BgBrushCache = new()
    {
        ["RUN"]     = Freeze("#10b981"),
        ["PAUSE"]   = Freeze("#eab308"),
        ["FATAL"]   = Freeze("#ef4444"),
        ["DEFAULT"] = Freeze("#3b82f6"),
    };

    private static Brush Freeze(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)!);
        brush.Freeze();
        return brush;
    }

    private int _gid;
    private string _title = "";
    private string _status = "";
    private int _totalPages;
    private int _downloadedPages;
    private int _failedPages;
    private string _speedText = "0 B/s";
    private string? _errorMsg;

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
                OnPropertyChanged(nameof(RestartVisible));
                OnPropertyChanged(nameof(RemoveVisible));
                OnPropertyChanged(nameof(SpeedVisible));
                OnPropertyChanged(nameof(ErrorVisible));
            }
        }
    }

    public int TotalPages { get => _totalPages; set => Set(ref _totalPages, value); }
    public int DownloadedPages { get => _downloadedPages; set => Set(ref _downloadedPages, value); }
    public int FailedPages { get => _failedPages; set => Set(ref _failedPages, value); }
    public string? ErrorMsg { get => _errorMsg; set => Set(ref _errorMsg, value); }

    public string SpeedText
    {
        get => _speedText;
        set => Set(ref _speedText, string.IsNullOrWhiteSpace(value) ? "0 B/s" : value);
    }

    // ===== 展示计算属性 =====
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

    public double ProgressFraction => TotalPages > 0 ? (double)DownloadedPages / TotalPages : 0;

    public Visibility PauseVisible => Status is "downloading" or "pending" ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ResumeVisible => Status is "paused" ? Visibility.Visible : Visibility.Collapsed;
    public Visibility RestartVisible => Status is "failed" or "paused" ? Visibility.Visible : Visibility.Collapsed;
    public Visibility RemoveVisible => Status is not "completed" and not "removed" ? Visibility.Visible : Visibility.Collapsed;
    public Visibility SpeedVisible => Status is "downloading" ? Visibility.Visible : Visibility.Collapsed;
    public Visibility ErrorVisible => Status is "failed" ? Visibility.Visible : Visibility.Collapsed;

    public DownloadTaskVm MapFrom(DownloadTaskDto dto)
    {
        Gid = dto.Gid;
        Title = dto.Title;
        Status = dto.Status;
        TotalPages = dto.TotalPages;
        DownloadedPages = dto.DownloadedPages;
        FailedPages = dto.FailedPages;
        ErrorMsg = dto.ErrorMsg;
        SpeedText = dto.SpeedText;
        return this;
    }
}
