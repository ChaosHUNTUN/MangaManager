using System.Collections.Concurrent;
using System.IO;
using System.Text;

namespace MangaManager.Console.Services;

/// <summary>内存日志服务（ILogSink 实现；行数上限，供 ViewModel 展示）</summary>
public class LogService : ILogSink
{
    private readonly Queue<string> _lines = new();
    private readonly int _maxLines;
    private readonly string? _logFile;
    private readonly long _maxFileSizeBytes;
    private readonly ConcurrentQueue<string> _pendingFileLines = new();
    private readonly SemaphoreSlim _fileSignal = new(0);
    private readonly CancellationTokenSource _cts = new();
    private Task? _fileWriter;

    public LogService(int maxLines = 2000, string? logFile = null, long maxFileSizeKB = 5120)
    {
        _maxLines = Math.Max(50, maxLines);
        _logFile = logFile;
        _maxFileSizeBytes = Math.Max(64, maxFileSizeKB) * 1024;
        if (_logFile != null)
            _fileWriter = Task.Run(() => FileWriterLoopAsync());
    }

    /// <summary>日志文件路径（供"打开日志文件"使用）</summary>
    public string? FilePath => _logFile;

    /// <summary>有新增日志（UI 线程或调用方线程触发）</summary>
    public event EventHandler? Logged;

    public string Content => string.Join(Environment.NewLine, _lines);

    public void Log(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        _lines.Enqueue(line);
        while (_lines.Count > _maxLines) _lines.Dequeue();
        // 文件写入交给后台批处理，不在 UI 线程逐行做文件 IO
        if (_logFile != null)
        {
            _pendingFileLines.Enqueue(line);
            _fileSignal.Release();
        }
        Logged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>后台文件写入：信号触发后一次性排空所有积压行，批量追加</summary>
    private async Task FileWriterLoopAsync()
    {
        while (!_cts.IsCancellationRequested)
        {
            try { await _fileSignal.WaitAsync(_cts.Token); }
            catch (OperationCanceledException) { break; }

            var sb = new StringBuilder();
            while (_pendingFileLines.TryDequeue(out var line)) sb.AppendLine(line);
            RotateIfNeeded();
            try { File.AppendAllText(_logFile!, sb.ToString()); }
            catch { /* 日志文件不可写时忽略 */ }
        }
    }

    /// <summary>按大小轮转：超过上限把当前文件改名为 .1 并重新开始</summary>
    private void RotateIfNeeded()
    {
        try
        {
            var fi = new FileInfo(_logFile!);
            if (fi.Exists && fi.Length > _maxFileSizeBytes)
            {
                var backup = _logFile + ".1";
                if (File.Exists(backup)) File.Delete(backup);
                File.Move(_logFile!, backup);
            }
        }
        catch { /* 轮转失败不影响写入 */ }
    }

    public void Clear()
    {
        _lines.Clear();
        Logged?.Invoke(this, EventArgs.Empty);
    }
}
