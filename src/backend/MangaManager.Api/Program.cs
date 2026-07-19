using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
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
                        Console.WriteLine("[DB] 检测到已有数据库，插入 InitialCreate baseline 迁移记录...");
                        if (!hasHistoryTable)
                        {
                            cmd.CommandText = "CREATE TABLE IF NOT EXISTS __EFMigrationsHistory (MigrationId TEXT PRIMARY KEY, ProductVersion TEXT)";
                            cmd.ExecuteNonQuery();
                        }
                        cmd.CommandText = "INSERT OR IGNORE INTO __EFMigrationsHistory VALUES ('20260612043946_InitialCreate', '9.0.0')";
                        cmd.ExecuteNonQuery();
                        Console.WriteLine("[DB] Baseline 迁移记录已插入");
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
            Console.WriteLine($"[DB] Baseline 检测跳过: {ex.Message}");
        }
    }

    db.Database.Migrate();
    Console.WriteLine("[DB] 数据库迁移完成");

    // 一次性同步：将已有 album_config.Gids 写入 local_gallery.AlbumKey
    try
    {
        var albums = db.AlbumConfigs.ToList();
        // 清理"幽灵 gid"：移除本地库中不存在的 gid
        var existingGidSet = db.LocalGalleries.Select(g => g.Gid).ToHashSet();
        var cleaned = 0;
        foreach (var album in albums)
        {
            if (string.IsNullOrEmpty(album.Gids) || album.Gids == "[]") continue;
            var gids = System.Text.Json.JsonSerializer.Deserialize<int[]>(album.Gids);
            if (gids == null || gids.Length == 0) continue;
            var valid = gids.Where(g => existingGidSet.Contains(g)).ToArray();
            if (valid.Length < gids.Length)
            {
                album.Gids = System.Text.Json.JsonSerializer.Serialize(valid);
                // 同步清理 Order（只保留有效的 gid 排序）
                if (!string.IsNullOrEmpty(album.Order) && album.Order != "[]")
                {
                    var orderArr = System.Text.Json.JsonSerializer.Deserialize<int[]>(album.Order);
                    if (orderArr != null)
                        album.Order = System.Text.Json.JsonSerializer.Serialize(
                            orderArr.Where(o => existingGidSet.Contains(o)).ToArray());
                }
                album.Count = valid.Length;
                cleaned++;
            }
            // AlbumKey 同步
            for (int i = 0; i < valid.Length; i += 100)
            {
                var batch = valid.Skip(i).Take(100).ToList();
                db.LocalGalleries
                    .Where(g => batch.Contains(g.Gid))
                    .ExecuteUpdate(s => s.SetProperty(g => g.AlbumKey, album.Key));
            }
        }
        if (cleaned > 0) db.SaveChanges();
        Console.WriteLine($"[DB] 数据清理: {cleaned} 个专辑移除了无效 gid，AlbumKey 同步完成");
    }
    catch (Exception ex) { Console.WriteLine($"[DB] 数据清理跳过: {ex.Message}"); }

    // 一次性修复：为 KeyTag 为空的专辑推断命名空间前缀（artist/group/other）
    try
    {
        var albumsToFix = db.AlbumConfigs.ToList().Where(a => a.KeyTag == null && !a.Key.Contains(':')).ToList();
        var fixedCount = 0;
        foreach (var album in albumsToFix)
        {
            if (string.IsNullOrEmpty(album.Gids) || album.Gids == "[]") continue;
            var gids = System.Text.Json.JsonSerializer.Deserialize<int[]>(album.Gids);
            if (gids == null || gids.Length == 0) continue;

            var sampleGallery = db.LocalGalleries.FirstOrDefault(g => gids.Contains(g.Gid));
            if (sampleGallery == null) continue;

            string? ns = null;
            var key = album.Key;
            var name = album.Name;

            // 1) 优先匹配 Artists
            if (!string.IsNullOrEmpty(sampleGallery.Artists))
            {
                var artists = System.Text.Json.JsonSerializer.Deserialize<List<string>>(sampleGallery.Artists);
                if (artists != null && artists.Any(a =>
                    string.Equals(a, key, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(a, name, StringComparison.OrdinalIgnoreCase)))
                    ns = "artist";
            }
            // 2) 其次匹配 Groups
            if (ns == null && !string.IsNullOrEmpty(sampleGallery.Groups))
            {
                var groups = System.Text.Json.JsonSerializer.Deserialize<List<string>>(sampleGallery.Groups);
                if (groups != null && groups.Any(g =>
                    string.Equals(g, key, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(g, name, StringComparison.OrdinalIgnoreCase)))
                    ns = "group";
            }
            // 3) 从 Category/Language 推断 "other" 类型（如 "ai generated" / "chinese" 等）
            if (ns == null)
                ns = "other";

            if (ns != null)
            {
                album.KeyTag = $"{ns}:{key}";
                fixedCount++;
            }
        }
        if (fixedCount > 0)
        {
            db.SaveChanges();
            Console.WriteLine($"[DB] KeyTag 修复: {fixedCount} 个专辑");
        }
    }
    catch (Exception ex) { Console.WriteLine($"[DB] KeyTag 修复跳过: {ex.Message}"); }

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
