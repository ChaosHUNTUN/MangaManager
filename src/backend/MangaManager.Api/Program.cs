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
builder.Services.AddSingleton<EhentaiService>();
builder.Services.AddSingleton<LocalGalleryService>();
builder.Services.AddSingleton<DownloadManager>();
builder.Services.AddHttpClient();
builder.Services.AddControllers();

var app = builder.Build();

// WebSocket 支持
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

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

// 确保数据库已创建（增量迁移：先补充缺失列，再 EnsureCreated）
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MangaDbContext>();

    // 先为已有数据库补充缺失的列（在 EnsureCreated 之前，否则 EF 模型验证会失败）
    try
    {
        db.Database.ExecuteSqlRaw(@"ALTER TABLE album_config ADD COLUMN ""Order"" TEXT NOT NULL DEFAULT '[]'");
    }
    catch { /* 列已存在或表不存在 */ }

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


        // album_config 表（如果不存在则创建）\n        db.Database.ExecuteSqlRaw(@\"\n            CREATE TABLE IF NOT EXISTS album_config (\n                Id INTEGER PRIMARY KEY AUTOINCREMENT,\n                Key TEXT NOT NULL,\n                Name TEXT NOT NULL DEFAULT '',\n                Gids TEXT NOT NULL DEFAULT '[]',\n                \"\"Order\"\" TEXT NOT NULL DEFAULT '[]',\n                UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))\n            );\n            CREATE UNIQUE INDEX IF NOT EXISTS IX_album_config_Key ON album_config(Key);\n        \");\n        Console.WriteLine(\"[DB] album_config 表已就绪\");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB] 迁移表失败: {ex.Message}");
    }
}

// 初始化标签翻译（后台异步）和屏蔽列表
EhentaiService.InitBlockedTags();
_ = EhentaiService.InitTagTranslationsAsync();

app.Run();
