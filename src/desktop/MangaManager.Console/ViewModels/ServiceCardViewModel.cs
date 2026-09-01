using System.Windows.Media;
using MangaManager.Console.Models;
using MangaManager.Console.Services;

namespace MangaManager.Console.ViewModels;

/// <summary>单个服务卡片（API / UI）状态</summary>
public class ServiceCardViewModel : ViewModelBase
{
    private static readonly Brush Green = Freeze("#10b981");
    private static readonly Brush Yellow = Freeze("#f59e0b");
    private static readonly Brush Red = Freeze("#ef4444");

    private static Brush Freeze(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)!);
        brush.Freeze();
        return brush;
    }

    private ServiceState _state = ServiceState.Stopped;

    public string Name { get; }
    public string Endpoint { get; }
    /// <summary>短端点文本（host:port），与旧版显示一致</summary>
    public string EndpointShort { get; }

    public ServiceCardViewModel(string name, string endpoint)
    {
        Name = name;
        Endpoint = endpoint;
        EndpointShort = ToShort(endpoint);
    }

    private static string ToShort(string url)
    {
        try
        {
            var uri = new Uri(url);
            return $"{uri.Host}:{uri.Port}";
        }
        catch { return url; }
    }

    public ServiceState State
    {
        get => _state;
        private set
        {
            if (Set(ref _state, value))
            {
                OnPropertyChanged(nameof(StateText));
                OnPropertyChanged(nameof(StateBrush));
                OnPropertyChanged(nameof(DotBrush));
                OnPropertyChanged(nameof(IsStartEnabled));
                OnPropertyChanged(nameof(IsStopEnabled));
                OnPropertyChanged(nameof(IsRestartEnabled));
            }
        }
    }

    public string StateText => State switch
    {
        ServiceState.Running  => "运行中",
        ServiceState.Starting => "启动中…",
        ServiceState.Stopping => "停止中…",
        _                     => "已停止"
    };

    public Brush StateBrush => State switch
    {
        ServiceState.Running  => Green,
        ServiceState.Starting => Yellow,
        ServiceState.Stopping => Yellow,
        _                     => Red
    };

    public Brush DotBrush => StateBrush;

    public bool IsStartEnabled => State is ServiceState.Stopped;
    public bool IsStopEnabled => State is ServiceState.Running or ServiceState.Starting;
    public bool IsRestartEnabled => State is ServiceState.Running or ServiceState.Stopped;

    public void Apply(ServiceStatus status)
    {
        State = status.State;
    }
}
