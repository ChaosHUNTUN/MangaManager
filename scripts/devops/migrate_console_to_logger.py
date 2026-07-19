import re, os

files = [
    {
        "path": "src/backend/MangaManager.Services/EhentaiService.cs",
        "class": "EhentaiService",
        "field_after": "private readonly IHttpClientFactory _httpClientFactory;",
        "old_ctor": "IHttpClientFactory httpClientFactory, IWebHostEnvironment env",
        "new_ctor": "IHttpClientFactory httpClientFactory, IWebHostEnvironment env, ILogger<EhentaiService> logger",
        "ctor_body_first": "_httpClientFactory = httpClientFactory;",
    },
    {
        "path": "src/backend/MangaManager.Services/DownloadManager.cs",
        "class": "DownloadManager",
        "field_after": "private readonly IServiceScopeFactory _scopeFactory;",
        "old_ctor": "IServiceScopeFactory scopeFactory",
        "new_ctor": "IServiceScopeFactory scopeFactory, ILogger<DownloadManager> logger",
        "ctor_body_first": "_scopeFactory = scopeFactory;",
    },
    {
        "path": "src/backend/MangaManager.Services/MangaService.cs",
        "class": "MangaService",
        "field_after": "private static readonly string BaseDir = ",
        "old_ctor": "IServiceScopeFactory scopeFactory",
        "new_ctor": "IServiceScopeFactory scopeFactory, ILogger<MangaService> logger",
        "ctor_body_first": "_scopeFactory = scopeFactory;",
    },
    {
        "path": "src/backend/MangaManager.Services/LocalGalleryService.cs",
        "class": "LocalGalleryService",
        "field_after": "private readonly IServiceScopeFactory _scopeFactory;",
        "old_ctor": "EhentaiService eh, IServiceScopeFactory scopeFactory",
        "new_ctor": "EhentaiService eh, IServiceScopeFactory scopeFactory, ILogger<LocalGalleryService> logger",
        "ctor_body_first": "_eh = eh;",
    },
    {
        "path": "src/backend/MangaManager.Api/Controllers/LocalGalleryController.cs",
        "class": "LocalGalleryController",
        "field_after": "private readonly LocalGalleryService _galleryService;",
        "old_ctor": "LocalGalleryService galleryService, EhentaiService ehService",
        "new_ctor": "LocalGalleryService galleryService, EhentaiService ehService, ILogger<LocalGalleryController> logger",
        "ctor_body_first": "_galleryService = galleryService;",
    },
]

for f in files:
    fpath = f["path"]
    cls = f["class"]
    content = open(fpath, encoding="utf-8").read()
    original = content

    # 1. Add using Microsoft.Extensions.Logging
    if "using Microsoft.Extensions.Logging;" not in content:
        if "using Microsoft.Extensions.DependencyInjection;" in content:
            content = content.replace(
                "using Microsoft.Extensions.DependencyInjection;",
                "using Microsoft.Extensions.DependencyInjection;\nusing Microsoft.Extensions.Logging;"
            )
        else:
            lines = content.split("\n")
            last_using = -1
            for i, l in enumerate(lines):
                if l.strip().startswith("using "):
                    last_using = i
            if last_using >= 0:
                lines.insert(last_using + 1, "using Microsoft.Extensions.Logging;")
                content = "\n".join(lines)

    # 2. Add _logger field
    logger_field = f"    private readonly ILogger<{cls}> _logger;"
    if logger_field not in content:
        content = content.replace(f["field_after"], f["field_after"] + "\n" + logger_field)

    # 3. Update constructor signature
    old_ctor = f["old_ctor"]
    new_ctor = f["new_ctor"]
    if old_ctor in content and new_ctor not in content:
        content = content.replace(old_ctor, new_ctor)

    # 4. Add _logger = logger; in constructor body
    body_line = f["ctor_body_first"]
    logger_assign = "_logger = logger;"
    if logger_assign not in content:
        content = content.replace(
            body_line,
            logger_assign + "\n        " + body_line
        )

    # 5. Replace Console.WriteLine -> _logger.LogInformation
    content = re.sub(r"Console\.WriteLine\(", "_logger.LogInformation(", content)
    # Replace System.Diagnostics.Debug.WriteLine -> _logger.LogDebug
    content = re.sub(r"System\.Diagnostics\.Debug\.WriteLine\(", "_logger.LogDebug(", content)

    if content != original:
        open(fpath, "w", encoding="utf-8").write(content)
        print(f"OK: {fpath}")
    else:
        print(f"SKIP (no change): {fpath}")

print("Done.")