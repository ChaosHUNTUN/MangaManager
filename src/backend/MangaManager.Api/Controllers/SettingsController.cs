using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MangaManager.Core.DTOs;
using MangaManager.Core.Entities;
using MangaManager.Data;
using MangaManager.Services;

namespace MangaManager.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly MangaDbContext _db;
    private readonly AppSettingsService _appSettings;
    private readonly GallerySyncService _sync;
    private readonly EhentaiAuthService _auth;

    public SettingsController(MangaDbContext db, AppSettingsService appSettings,
        GallerySyncService sync, EhentaiAuthService auth)
    {
        _db = db;
        _appSettings = appSettings;
        _sync = sync;
        _auth = auth;
    }

    /// <summary>运行时设置（库目录 / 代理）+ 当前状态，供设置页与首次配置引导使用</summary>
    [HttpGet("app")]
    public IActionResult GetAppSettings()
    {
        var s = _appSettings.Current;
        var dir = EhentaiFileHelper.DefaultDownloadDir;
        var exists = false;
        int? galleryDirCount = null;
        try
        {
            exists = Directory.Exists(dir);
            if (exists) galleryDirCount = Directory.GetDirectories(dir).Length;
        }
        catch { /* 无权限/路径异常：当作不可用目录 */ }

        return Ok(new ApiResponse<object>(true, new
        {
            downloadDir = dir,
            // 是否显式配置过（runtime_settings.json 或 appsettings）；均未配置 → 前端弹首次引导
            downloadDirConfigured = _appSettings.IsDownloadDirConfigured,
            downloadDirSource = _appSettings.DownloadDirSource,
            downloadDirExists = exists,
            galleryDirCount,
            // 未配置时的内置回退路径（程序目录/downloads），便于前端提示
            fallbackDownloadDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "downloads"),
            proxy = s.Proxy ?? "",
            cookieConfigured = _auth.HasCookie(),
        }));
    }

    /// <summary>保存运行时设置；目录变更后可自动触发追加式重扫</summary>
    [HttpPut("app")]
    public IActionResult SaveAppSettings([FromBody] AppSettingsRequest? req)
    {
        if (req == null) return BadRequest(new ApiResponse<object>(false, null, "请求体为空"));

        // 显式传入目录时必须真实存在，避免误配成空库
        if (!string.IsNullOrWhiteSpace(req.DownloadDir) && !Directory.Exists(req.DownloadDir))
            return BadRequest(new ApiResponse<object>(false, null, $"目录不存在或不可访问: {req.DownloadDir}"));

        _appSettings.Save(req.DownloadDir, req.Proxy);

        // 目录变更 → 后台追加式重扫（只增改不删；3000+ 目录耗时较久，不阻塞请求）
        var rescanStarted = false;
        if (req.Rescan != false && !string.IsNullOrWhiteSpace(req.DownloadDir))
        {
            _ = _sync.RescanAsync("设置页保存目录", pruneMissing: false);
            rescanStarted = true;
        }

        return Ok(new ApiResponse<object>(true, new { saved = true, rescanStarted },
            rescanStarted ? "已保存，正在后台重新扫描" : "已保存"));
    }

    /// <summary>手动触发一次追加式重扫（不删除已有记录）</summary>
    [HttpPost("app/rescan")]
    public IActionResult RescanLibrary()
    {
        _ = _sync.RescanAsync("手动重扫", pruneMissing: false);
        return Ok(new ApiResponse<object>(true, new { started = true }, "已开始重新扫描"));
    }

    [HttpGet("reader")]
    public async Task<IActionResult> GetReaderSettings()
    {
        var settings = await _db.ReaderSettings.FindAsync(1);
        if (settings == null)
        {
            settings = new ReaderSettings();
            _db.ReaderSettings.Add(settings);
            await _db.SaveChangesAsync();
        }

        // 返回引擎设置 JSON（当前前端唯一使用的字段；旧列保留兼容不参与）
        object? data = null;
        if (!string.IsNullOrWhiteSpace(settings.Data))
        {
            try { data = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(settings.Data); }
            catch { /* 坏数据忽略，前端回退默认 */ }
        }
        return Ok(new ApiResponse<object>(true, new { data }));
    }

    [HttpPut("reader")]
    public async Task<IActionResult> SaveReaderSettings([FromBody] ReaderSettingsData? incoming)
    {
        var settings = await _db.ReaderSettings.FindAsync(1);
        if (settings == null)
        {
            settings = new ReaderSettings();
            _db.ReaderSettings.Add(settings);
        }

        if (incoming?.Data != null)
            settings.Data = System.Text.Json.JsonSerializer.Serialize(incoming.Data);
        settings.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(new ApiResponse<object>(true, new { saved = true }, "已保存"));
    }
}

public record ReaderSettingsData(object? Data);

/// <summary>运行时设置请求；字段为 null 表示保持原值</summary>
public record AppSettingsRequest(string? DownloadDir = null, string? Proxy = null, bool? Rescan = null);
