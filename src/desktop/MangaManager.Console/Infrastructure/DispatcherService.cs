using System.Windows.Threading;

namespace MangaManager.Console.Infrastructure;

/// <summary>统一把后台线程回调调度回 UI 线程（Service 层不直接触碰 UI 元素）</summary>
public interface IDispatcherService
{
    void Invoke(Action action);
    /// <summary>异步排队到 UI 线程（不阻塞调用线程，日志洪流场景必须用它）</summary>
    void BeginInvoke(Action action);
    Task InvokeAsync(Action action);
}

public class DispatcherService : IDispatcherService
{
    private readonly Dispatcher _dispatcher;

    public DispatcherService(Dispatcher dispatcher) => _dispatcher = dispatcher;

    public void Invoke(Action action)
    {
        if (_dispatcher.CheckAccess()) action();
        else _dispatcher.Invoke(action);
    }

    public void BeginInvoke(Action action)
    {
        if (_dispatcher.CheckAccess()) action();
        else _dispatcher.BeginInvoke(action);
    }

    public Task InvokeAsync(Action action)
    {
        if (_dispatcher.CheckAccess())
        {
            action();
            return Task.CompletedTask;
        }
        return _dispatcher.InvokeAsync(action).Task;
    }
}
