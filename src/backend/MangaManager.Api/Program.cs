using Microsoft.EntityFrameworkCore;
using MangaManager.Data;
using MangaManager.Services;

var builder = WebApplication.CreateBuilder(args);

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
        ));
}
else
{
    builder.Services.AddDbContext<MangaDbContext>(options =>
        options.UseSqlite(builder.Configuration.GetConnectionString("Default")));
}

// 服务注册
builder.Services.AddScoped<MangaService>();
builder.Services.AddSingleton<NeeViewService>();
builder.Services.AddSingleton<LocalGalleryService>();
builder.Services.AddSingleton<DownloadManager>();

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

// WebSocket 支持
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

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

// 确保数据库已创建（增量迁移：先补充缺失列，再 EnsureCreated）
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

    // 先为已有数据库补充缺失的列（在 EnsureCreated 之前，否则 EF 模型验证会失败）
    try
    {
        db.Database.ExecuteSqlRaw(@"ALTER TABLE album_config ADD COLUMN ""Order"" TEXT NOT NULL DEFAULT '[]'");
    }
    catch (Exception ex) { Console.WriteLine($"[DB] Order列迁移跳过: {ex.Message}"); }
    try
    {
        db.Database.ExecuteSqlRaw(@"ALTER TABLE album_config ADD COLUMN CreatedAt TEXT NOT NULL DEFAULT '2000-01-01T00:00:00'");
        Console.WriteLine("[DB] CreatedAt列已添加");
    }
    catch (Exception ex) { Console.WriteLine($"[DB] CreatedAt列迁移跳过: {ex.Message}"); }

    db.Database.EnsureCreated();

    // 为已有数据库补充缺失的 download_task 表
    try
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS download_task (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Gid INTEGER NOT NULL,
                Token TEXT NOT NULL,
                Title TEXT,
                CoverUrl TEXT,
                TotalPages INTEGER NOT NULL DEFAULT 0,
                DownloadedPages INTEGER NOT NULL DEFAULT 0,
                FailedPages INTEGER NOT NULL DEFAULT 0,
                DownloadedBytes INTEGER NOT NULL DEFAULT 0,
                Status TEXT NOT NULL DEFAULT 'pending',
                ErrorMsg TEXT,
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                StartedAt TEXT,
                CompletedAt TEXT,
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_download_task_Gid ON download_task(Gid);
        ");

        // reader_settings 表
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS reader_settings (
                Id INTEGER PRIMARY KEY CHECK (Id = 1),
                FitMode TEXT NOT NULL DEFAULT 'fit-width',
                FitPercent INTEGER NOT NULL DEFAULT 100,
                Direction TEXT NOT NULL DEFAULT 'rtl',
                Transition TEXT NOT NULL DEFAULT 'fade',
                ReadMode TEXT NOT NULL DEFAULT 'paged',
                SlideInterval INTEGER NOT NULL DEFAULT 3,
                ScrollSpeed INTEGER NOT NULL DEFAULT 200,
                LoopMode INTEGER NOT NULL DEFAULT 0,
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO reader_settings (Id) VALUES (1);
        ");
        Console.WriteLine("[DB] reader_settings 表已就绪");


        // album_config 表（如果不存在则创建）
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS album_config (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Key TEXT NOT NULL,
                Name TEXT NOT NULL DEFAULT '',
                Gids TEXT NOT NULL DEFAULT '[]',
                ""Order"" TEXT NOT NULL DEFAULT '[]',
                CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_album_config_Key ON album_config(Key);
        ");
        Console.WriteLine("[DB] album_config 表已就绪");

        // local_reading_progress 表
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS local_reading_progress (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Gid INTEGER NOT NULL,
                PageIndex INTEGER NOT NULL DEFAULT 0,
                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_local_reading_progress_Gid ON local_reading_progress(Gid);
        ");
        Console.WriteLine("[DB] local_reading_progress 表已就绪");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] 迁移表失败: {ex.Message}");
    }

    // 启用 WAL 模式（仅 SQLite）：允许并发读写，避免 "database is locked" 错误
    if (dbProvider.Equals("sqlite", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL");
            db.Database.ExecuteSqlRaw("PRAGMA synchronous=NORMAL");
            Console.WriteLine("[DB] WAL 模式已启用");
        }
        catch (Exception ex) { Console.WriteLine($"[DB] WAL 模式设置失败: {ex.Message}"); }

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
                Console.WriteLine($"[DB] 自动备份: {backupName}");
                // 保留最近 7 个备份
                var oldBackups = Directory.GetFiles(backupDir, "manga_*.db")
                    .Select(f => new FileInfo(f))
                    .OrderByDescending(f => f.LastWriteTime)
                    .Skip(7);
                foreach (var old in oldBackups) { old.Delete(); Console.WriteLine($"[DB] 清理旧备份: {old.Name}"); }
            }
        }
        catch (Exception ex) { Console.WriteLine($"[DB] 自动备份失败: {ex.Message}"); }
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
        Console.WriteLine($"[DB] 手动备份: {backupName}");
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
        await EhentaiService.InitTagTranslationsAsync();
        Console.WriteLine("[Init] 标签翻译已加载");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Init] 标签翻译加载失败（将使用原始标签）: {ex.Message}");
    }
});

// 异步初始化 DownloadManager（加载未完成任务）
var downloadManager = app.Services.GetRequiredService<DownloadManager>();
_ = downloadManager.InitializeAsync();

app.Run();
