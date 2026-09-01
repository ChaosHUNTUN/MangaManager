namespace MangaManager.Console.Services;

/// <summary>日志接收器（由 ViewModel 实现，写入 UI 日志区）</summary>
public interface ILogSink
{
    void Log(string message);
}
