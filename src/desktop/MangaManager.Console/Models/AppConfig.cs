using System.IO;
using Microsoft.Extensions.Configuration;

namespace MangaManager.Console.Models;

/// <summary>应用配置（appsettings.json 强类型绑定）</summary>
public class AppConfig
{
    public ServicesConfig Services { get; set; } = new();
    public MonitoringConfig Monitoring { get; set; } = new();
    public LoggingConfig Logging { get; set; } = new();

    /// <summary>从指定目录加载 appsettings.json 并绑定</summary>
    public static AppConfig LoadFrom(string baseDir)
    {
        var config = new ConfigurationBuilder()
            .SetBasePath(baseDir)
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: false)
            .Build();
        return config.Get<AppConfig>() ?? new AppConfig();
    }

    /// <summary>解析相对路径（相对项目根），绝对路径原样返回</summary>
    public string ResolvePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "";
        return Path.IsPathRooted(path) ? path : Path.GetFullPath(Path.Combine(ProjectRoot, path));
    }

    /// <summary>项目根目录（AppConfig 加载后由组合根注入）</summary>
    public string ProjectRoot { get; set; } = AppDomain.CurrentDomain.BaseDirectory;
}

public class ServicesConfig
{
    public ServiceConfig Api { get; set; } = new();
    public ServiceConfig Ui { get; set; } = new();
}

public class ServiceConfig
{
    /// <summary>是否启用该服务（发布模式下前端由 API 托管时可关闭）</summary>
    public bool Enabled { get; set; } = true;
    public string Name { get; set; } = "";
    public string Url { get; set; } = "http://127.0.0.1:5208";
    public string HealthPath { get; set; } = "/health";
    public string DevCommand { get; set; } = "dotnet";
    public string DevArguments { get; set; } = "";
    public string ProjectPath { get; set; } = "";
    public string WorkingDir { get; set; } = "";
    public string ExePath { get; set; } = "";
    public int ReadyTimeoutSeconds { get; set; } = 10;
    /// <summary>进程意外退出后自动重启（退避 5s/15s/30s，最多 3 次）</summary>
    public bool AutoRestart { get; set; } = true;
}

public class MonitoringConfig
{
    public int IntervalSeconds { get; set; } = 5;
    public int[] FailureBackoffSeconds { get; set; } = { 5, 10, 20, 40, 60 };
    public int HttpTimeoutSeconds { get; set; } = 5;
}

public class LoggingConfig
{
    public int MaxLines { get; set; } = 2000;
    /// <summary>日志文件轮转上限（KB）</summary>
    public long MaxFileSizeKB { get; set; } = 5120;
}
