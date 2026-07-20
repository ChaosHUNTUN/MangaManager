using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MangaManager.Data;
using MangaManager.Services;

var builder = WebApplication.CreateBuilder(args);

// 配置下载目录（优先从 appsettings 读取，默认回退到程序目录下的 downloads）
var downloadDir = builder.Configuration.GetValue<string>("Ehentai:DownloadDir");
if (!string.IsNullOrWhiteSpace(downloadDir))
{
    EhentaiFileHelper.DefaultDownloadDir = downloadDir;
}

// CORS - 允许前端跨域
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

// 数据库：支持 SQLite（默认）和 MySQL 双模式
var dbProvider = builder.Configuration.GetValue<string>("Database:Provider") ?? "sqlite";
if (dbProvider.Equals("mysql", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddDbContext<MangaDbContext>(options =>
        options.UseMySql(
            builder.Configuration.GetConnectionString("Default"),
            ServerVersion.AutoDetect(builder.Configuration.GetConnectionString("Default"))
        ).ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));
}
else
{
    builder.Services.AddDbContext<MangaDbContext>(options =>
        options.UseSqlite(builder.Configuration.GetConnectionString("Default"))
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));
}

// 服务注册
builder.Services.AddScoped<MangaService>();
builder.Services.AddSingleton<LocalGalleryService>();
builder.Services.AddSingleton<DownloadManager>();
builder.Services.AddHostedService<GallerySyncService>();

// HttpClientFactory：E-Hentai 专用客户端（共享 Cookie、代理配置）
builder.Services.AddHttpClient("ehentai", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");
})
.ConfigurePrimaryHttpMessageHandler(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var cookies = sp.GetKeyedService<System.Net.CookieContainer>("EhentaiCookies")!;
    var handler = new HttpClientHandler
    {
        UseCookies = true,
        CookieContainer = cookies,
        AllowAutoRedirect = true,
        AutomaticDecompression = System.Net.DecompressionMethods.GZip | System.Net.DecompressionMethods.Deflate
    };
    var proxyUrl = config.GetValue<string>("Ehentai:Proxy");
    if (!string.IsNullOrWhiteSpace(proxyUrl))
        handler.Proxy = new System.Net.WebProxy(proxyUrl);
    return handler;
});
builder.Services.AddKeyedSingleton("EhentaiCookies", new System.Net.CookieContainer());
builder.Services.AddSingleton<EhentaiService>();

builder.Services.AddControllers();

var app = builder.Build();

// 全局异常处理中间件（确保所有 500 响应带 CORS 头和 JSON body）
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (Exception ex)
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var result = System.Text.Json.JsonSerializer.Serialize(
            new MangaManager.Core.DTOs.ApiResponse<object>(false, null, $"Server error: {ex.GetType().Name}"));
        await context.Response.WriteAsync(result);
    }
});

// 托管前端静态文件（发布模式）
if (Directory.Exists(Path.Combine(app.Environment.ContentRootPath, "wwwroot")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();

    // SPA fallback：所有非 API 请求返回 index.html
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        OnPrepareResponse = ctx =>
        {
            // 排除 /api 路径
            if (ctx.Context.Request.Path.StartsWithSegments("/api"))
                ctx.Context.Response.StatusCode = 404;
        }
    });
}
else
{
    // 开发模式：只用 CORS
    app.UseCors();
}

app.MapControllers();

// 健康检查端点
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow, version = "2.0" }));

// EF Core Migrations：自动建库/升级，兼容已有数据库
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

    // 检测已有数据库（有数据表但无迁移历史记录）→ 插入 baseline 标记（仅首次升级时需要）
    if (dbProvider.Equals("sqlite", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var conn = db.Database.GetDbConnection();
            var wasClosed = conn.State == System.Data.ConnectionState.Closed;
            if (wasClosed) conn.Open();
            try
            {
                using var cmd = conn.CreateCommand();

                // 查询一次 sqlite_master 即可同时获取 history 和 manga 表信息
                cmd.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='__EFMigrationsHistory'";
                var hasHistoryTable = (long)cmd.ExecuteScalar()! > 0;
                var hasHistoryRecords = false;
                if (hasHistoryTable)
                {
                    // 已有迁移记录 → 不是旧数据库，快速跳过
                    cmd.CommandText = "SELECT COUNT(*) FROM __EFMigrationsHistory";
                    hasHistoryRecords = (long)cmd.ExecuteScalar()! > 0;
                }

                if (!hasHistoryRecords)
                {
                    // 无迁移记录 → 检查是否有旧版 manga 表需要 baseline
                    cmd.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='manga'";
                    if ((long)cmd.ExecuteScalar()! > 0)
                    {
                        app.Logger.LogInformation("[DB] 检测到已有数据库，插入 InitialCreate baseline 迁移记录...");
                        if (!hasHistoryTable)
                        {
                            cmd.CommandText = "CREATE TABLE IF NOT EXISTS __EFMigrationsHistory (MigrationId TEXT PRIMARY KEY, ProductVersion TEXT)";
                            cmd.ExecuteNonQuery();
                        }
                        cmd.CommandText = "INSERT OR IGNORE INTO __EFMigrationsHistory VALUES ('20260612043946_InitialCreate', '9.0.0')";
                        cmd.ExecuteNonQuery();
                        app.Logger.LogInformation("[DB] Baseline 迁移记录已插入");
                    }
                }
            }
            finally
            {
                if (wasClosed) conn.Close();
            }
        }
        catch (Exception ex)
        {
            app.Logger.LogInformation($"[DB] Baseline 检测跳过: {ex.Message}");
        }
    }

    db.Database.Migrate();
    app.Logger.LogInformation("[DB] 数据库迁移完成");

    // 一次性回填 AllTags：旧记录在迁移前未存储 AllTags（为 null 或"[]"），从 .meta.json 重读回填
    var dlDir = app.Configuration.GetValue<string>("Ehentai:DownloadDir") ?? EhentaiFileHelper.DefaultDownloadDir;
    if (!string.IsNullOrEmpty(dlDir) && Directory.Exists(dlDir))
    {
        var staleCount = db.LocalGalleries.Count(g => g.AllTags == null || g.AllTags == "" || g.AllTags == "[]");
        if (staleCount > 0)
        {
            app.Logger.LogInformation($"[DB] 检测到 {staleCount} 条旧记录 AllTags 为空，开始从 .meta.json 回填...");
            var updated = 0;
            var galleries = db.LocalGalleries.Where(g => g.AllTags == null || g.AllTags == "" || g.AllTags == "[]").ToList();
            foreach (var g in galleries)
            {
                try
                {
                    var dirName = EhentaiFileHelper.GetGalleryLocalDir(g.Gid, g.Title ?? "");
                    var parentDir = Path.GetDirectoryName(dirName);
                    if (parentDir == null || !Directory.Exists(parentDir)) continue;
                    var dir = Directory.GetDirectories(parentDir, $"{g.Gid}-*").FirstOrDefault();
                    if (dir == null) continue;
                    var metaFile = Path.Combine(dir, ".meta.json");
                    if (!File.Exists(metaFile)) continue;
                    var metaJson = File.ReadAllText(metaFile);
                    using var doc = System.Text.Json.JsonDocument.Parse(metaJson);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("tags", out var tags) && tags.ValueKind == System.Text.Json.JsonValueKind.Object)
                    {
                        var allTagList = new List<string>();
                        foreach (var nsProp in tags.EnumerateObject())
                        {
                            if (nsProp.Value.ValueKind == System.Text.Json.JsonValueKind.Array)
                            {
                                foreach (var tagEl in nsProp.Value.EnumerateArray())
                                {
                                    var tagVal = tagEl.GetString();
                                    if (!string.IsNullOrEmpty(tagVal))
                                        allTagList.Add($"{nsProp.Name.ToLower()}:{tagVal}");
                                }
                            }
                        }
                        if (allTagList.Count > 0)
                        {
                            g.AllTags = System.Text.Json.JsonSerializer.Serialize(allTagList);
                            updated++;
                        }
                    }
                }
                catch { }
            }
            db.SaveChanges();
            app.Logger.LogInformation($"[DB] AllTags 回填完成: {updated}/{staleCount} 条");
        }
    }

    // 启用 WAL 模式（仅 SQLite）：允许并发读写，避免 "database is locked" 错误
    if (dbProvider.Equals("sqlite", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL");
            db.Database.ExecuteSqlRaw("PRAGMA synchronous=NORMAL");
            app.Logger.LogInformation("[DB] WAL 模式已启用");
        }
        catch (Exception ex) { app.Logger.LogInformation($"[DB] WAL 模式设置失败: {ex.Message}"); }

        // 每日自动备份（距上次备份超过24小时则执行）
        try
        {
            var dbPath = Path.Combine(app.Environment.ContentRootPath, "manga.db");
            var backupDir = Path.Combine(app.Environment.ContentRootPath, "backups");
            Directory.CreateDirectory(backupDir);
            var latestBackup = Directory.GetFiles(backupDir, "manga_*.db")
                .Select(f => new FileInfo(f))
                .OrderByDescending(f => f.LastWriteTime)
                .FirstOrDefault();
            if (latestBackup == null || (DateTime.UtcNow - latestBackup.LastWriteTimeUtc).TotalHours > 24)
            {
                var backupName = $"manga_{DateTime.UtcNow:yyyyMMdd_HHmmss}.db";
                File.Copy(dbPath, Path.Combine(backupDir, backupName));
                app.Logger.LogInformation($"[DB] 自动备份: {backupName}");
                // 保留最近 7 个备份
                var oldBackups = Directory.GetFiles(backupDir, "manga_*.db")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.LastWriteTime)
                    .Skip(7);
                foreach (var old in oldBackups) { old.Delete(); app.Logger.LogInformation($"[DB] 清理旧备份: {old.Name}"); }
            }
        }
        catch (Exception ex) { app.Logger.LogInformation($"[DB] 自动备份失败: {ex.Message}"); }
    }
}

// 手动备份 API
app.MapPost("/api/admin/backup", () =>
{
    try
    {
        var dbPath = Path.Combine(app.Environment.ContentRootPath, "manga.db");
        var backupDir = Path.Combine(app.Environment.ContentRootPath, "backups");
        Directory.CreateDirectory(backupDir);
        var backupName = $"manga_{DateTime.UtcNow:yyyyMMdd_HHmmss}_manual.db";
        File.Copy(dbPath, Path.Combine(backupDir, backupName));
        app.Logger.LogInformation($"[DB] 手动备份: {backupName}");
        return Results.Ok(new { success = true, file = backupName });
    }
    catch (Exception ex) { return Results.Problem($"Backup failed: {ex.Message}"); }
});

// 初始化标签翻译（后台异步）和屏蔽列表
EhentaiService.InitBlockedTags();
_ = Task.Run(async () =>
{
    try
    {
        await EhentaiTagService.InitTagTranslationsAsync();
        app.Logger.LogInformation("[Init] 标签翻译已加载");
    }
    catch (Exception ex)
    {
        app.Logger.LogInformation($"[Init] 标签翻译加载失败（将使用原始标签）: {ex.Message}");
    }
});

// 异步初始化 DownloadManager（加载未完成任务）
var downloadManager = app.Services.GetRequiredService<DownloadManager>();
_ = downloadManager.InitializeAsync();

app.Run();