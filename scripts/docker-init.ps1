# MangaManager Docker 环境初始化脚本
# 用法: .\scripts\docker-init.ps1

Write-Host "=== MangaManager Docker 初始化 ===" -ForegroundColor Cyan

# 创建数据目录
$dirs = @(
    "data\api-data",
    "data\downloads"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  创建: $dir" -ForegroundColor Green
    } else {
        Write-Host "  已存在: $dir" -ForegroundColor Gray
    }
}

# 复制 .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  创建 .env (从 .env.example 复制)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "初始化完成! 运行以下命令启动:" -ForegroundColor Cyan
Write-Host "  docker compose up -d" -ForegroundColor White
Write-Host ""
Write-Host "仅启动 API (配合本地前端开发):" -ForegroundColor Gray
Write-Host "  docker compose up api -d" -ForegroundColor White
Write-Host "  cd src/frontend/manga-ui && npm run dev" -ForegroundColor White
