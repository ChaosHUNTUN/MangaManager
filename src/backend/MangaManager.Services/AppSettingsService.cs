using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MangaManager.Services;

/// <summary>
/// 运行时可改设置（库目录 / 代理），由前端设置页写入。
///
/// 优先级：runtime_settings.json &gt; appsettings.json &gt; 内置默认（程序目录/downloads）。
/// 保存后立即生效（热应用），无需重启进程。
/// </summary>
public class AppSettingsService
{
    private readonly ILogger<AppSettingsService> _logger;
    private readonly string _file;
    private readonly object _lock = new();
    private readonly bool _configuredFromAppSettings;
    private readonly string? _appSettingsProxy;

    private AppSettings _current = new();

    public AppSettingsService(IWebHostEnvironment env, IConfiguration config, ILogger<AppSettingsService> logger)
    {
        _logger = logger;
        _file = Path.Combine(env.ContentRootPath, "runtime_settings.json");
        // appsettings(.Development).json 里显式配过目录也算"已配置"，避免对已有用户弹首次引导
        _configuredFromAppSettings = !string.IsNullOrWhiteSpace(config.GetValue<string>("Ehentai:DownloadDir"));
        _appSettingsProxy = config.GetValue<string>("Ehentai:Proxy");
        Load();
        // 首次运行（尚无 runtime_settings.json）时以 appsettings 的代理为初始值，
        // 这样设置页能显示当前生效代理；用户保存过一次后以其保存值为准（清空即直连）
        if (!File.Exists(_file) && !string.IsNullOrWhiteSpace(_appSettingsProxy))
            _current.Proxy = _appSettingsProxy;
        ApplyDownloadDir();
    }

    /// <summary>设置变更通知（GallerySyncService 等订阅后重载）</summary>
    public event Action? Changed;

    public sealed class AppSettings
    {
        /// <summary>画廊（下载）根目录；null/空 = 未由用户设置</summary>
        public string? DownloadDir { get; set; }
        /// <summary>HTTP 代理，如 http://127.0.0.1:7890；空 = 直连</summary>
        public string? Proxy { get; set; }
    }

    public AppSettings Current
    {
        get { lock (_lock) return new AppSettings { DownloadDir = _current.DownloadDir, Proxy = _current.Proxy }; }
    }

    /// <summary>当前生效代理 URL（动态代理每请求读取，改完即生效）</summary>
    public string? ProxyUrl
    {
        get { lock (_lock) return _current.Proxy; }
    }

    /// <summary>用户是否显式设置过库目录（未设置时前端提示首次配置）</summary>
    public bool HasConfiguredDownloadDir
    {
        get { lock (_lock) return !string.IsNullOrWhiteSpace(_current.DownloadDir); }
    }

    /// <summary>目录是否来自 appsettings（而非运行时设置）</summary>
    public bool ConfiguredFromAppSettings => _configuredFromAppSettings;

    /// <summary>任意来源是否已显式配置过库目录</summary>
    public bool IsDownloadDirConfigured => HasConfiguredDownloadDir || _configuredFromAppSettings;

    /// <summary>目录来源：runtime / appsettings / default</summary>
    public string DownloadDirSource =>
        HasConfiguredDownloadDir ? "runtime" : (_configuredFromAppSettings ? "appsettings" : "default");

    /// <summary>保存设置并热应用；传 null 表示该字段不变</summary>
    public AppSettings Save(string? downloadDir, string? proxy)
    {
        lock (_lock)
        {
            if (downloadDir != null) _current.DownloadDir = string.IsNullOrWhiteSpace(downloadDir) ? null : downloadDir.Trim();
            if (proxy != null) _current.Proxy = string.IsNullOrWhiteSpace(proxy) ? null : proxy.Trim();
        }
        Persist();
        ApplyDownloadDir();
        _logger.LogInformation("[AppSettings] 已保存：库目录={Dir} 代理={Proxy}",
            EhentaiFileHelper.DefaultDownloadDir, ProxyUrl ?? "(直连)");
        Changed?.Invoke();
        return Current;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_file)) return;
            var loaded = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(_file), EhentaiJsonOptions.Instance);
            if (loaded != null) _current = loaded;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[AppSettings] 读取 {File} 失败，使用默认值", _file);
            _current = new AppSettings();
        }
    }

    private void Persist()
    {
        try
        {
            var json = JsonSerializer.Serialize(_current, EhentaiJsonOptions.Instance);
            File.WriteAllText(_file, json);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[AppSettings] 写入 {File} 失败", _file);
        }
    }

    private void ApplyDownloadDir()
    {
        lock (_lock)
        {
            if (!string.IsNullOrWhiteSpace(_current.DownloadDir))
                EhentaiFileHelper.DefaultDownloadDir = _current.DownloadDir!;
        }
    }
}

/// <summary>
/// 动态代理：每次请求读取当前设置，使代理变更无需重启进程即可生效。
/// 未配置代理或目标是本机地址时直连（返回目标地址本身表示不使用代理）。
/// </summary>
public sealed class DynamicWebProxy : IWebProxy
{
    private readonly AppSettingsService _settings;

    public DynamicWebProxy(AppSettingsService settings) => _settings = settings;

    public ICredentials? Credentials { get; set; }

    public Uri GetProxy(Uri destination)
    {
        if (destination.IsLoopback) return destination;
        var url = _settings.ProxyUrl;
        if (string.IsNullOrWhiteSpace(url)) return destination;
        return Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri : destination;
    }

    public bool IsBypassed(Uri host) => GetProxy(host) == host;
}
