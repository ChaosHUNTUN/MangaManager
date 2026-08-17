# ============================================
# MangaManager 一键部署脚本（开发模式）
# 用于当前设备快速启动所有服务
# ============================================

param(
    [switch]$UseMySQL = $false,
    [switch]$KillExisting = $true,
    [string]$MySqlBin = "",
    [string]$MySqlRootPassword = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MangaManager 部署脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 停止旧进程（仅针对本项目端口 5208/5173，避免误杀其它 dotnet/node 进程）
if ($KillExisting) {
    Write-Host "`n[1/5] 清理旧进程（仅 MangaManager 端口 5208/5173）..." -ForegroundColor Yellow
    foreach ($port in @(5208, 5173)) {
        $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            if ($procId -and $procId -ne $PID) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "  已停止端口 ${port} 上的进程 (PID $procId)" -ForegroundColor Gray
            }
        }
    }
    Start-Sleep -Seconds 2
    Write-Host "  已清理" -ForegroundColor Green
}

# 2. 确保数据库就绪
if ($UseMySQL) {
    Write-Host "`n[2/5] 初始化 MySQL 数据库..." -ForegroundColor Yellow
    if ([string]::IsNullOrWhiteSpace($MySqlBin)) { throw "请通过 -MySqlBin 指定 mysql.exe 路径" }
    if ([string]::IsNullOrWhiteSpace($MySqlRootPassword)) { throw "请通过 -MySqlRootPassword 指定 MySQL root 密码" }
    # 确保 MySQL 服务运行
    $mysqlService = Get-Service -Name "MySQL" -ErrorAction SilentlyContinue
    if ($mysqlService.Status -ne "Running") {
        Start-Service -Name "MySQL"
        Start-Sleep -Seconds 3
    }
    # 执行初始化脚本
    Get-Content "$root\scripts\db\init.sql" | & $MySqlBin -u root "-p$MySqlRootPassword" 2>&1 | Out-Null
    Write-Host "  MySQL 数据库就绪" -ForegroundColor Green
} else {
    Write-Host "`n[2/5] 使用 SQLite（无需额外配置）" -ForegroundColor Yellow
}

# 3. 启动后端 API
Write-Host "`n[3/5] 启动后端 API..." -ForegroundColor Yellow
$apiDir = "$root\src\backend\MangaManager.Api"
$logDir = "$env:TEMP\MangaManager"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if ($UseMySQL) {
    # 临时覆盖配置使用 MySQL
    $env:Database__Provider = "mysql"
    $env:ConnectionStrings__Default = "Server=localhost;Port=3306;Database=manga_db;User=root;Password=$MySqlRootPassword;Charset=utf8mb4;"
}

Start-Process -FilePath "dotnet" -ArgumentList "run --urls http://0.0.0.0:5208" -WorkingDirectory $apiDir -WindowStyle Hidden -RedirectStandardOutput "$logDir\api.log" -RedirectStandardError "$logDir\api_error.log"

Write-Host "  后端 API 已启动 (端口 5208)" -ForegroundColor Green
Write-Host "  日志: $logDir\api.log" -ForegroundColor Gray

# 4. 等待 API 就绪
Write-Host "`n[4/5] 等待 API 就绪..." -ForegroundColor Yellow
$retries = 0
while ($retries -lt 20) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5208/api/manga" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) { break }
    } catch { }
    Start-Sleep -Seconds 1
    $retries++
}
if ($retries -ge 20) {
    Write-Host "  API 启动超时！请检查日志" -ForegroundColor Red
} else {
    Write-Host "  API 已就绪" -ForegroundColor Green
}

# 5. 启动前端
Write-Host "`n[5/5] 启动前端..." -ForegroundColor Yellow
$uiDir = "$root\src\frontend\manga-ui"
Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory $uiDir -WindowStyle Hidden

Write-Host "  前端已启动 (端口 5173)" -ForegroundColor Green

# 完成
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "  后端: http://localhost:5208" -ForegroundColor White
Write-Host "  前端: http://localhost:5173" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan

# 打开浏览器
Start-Process "http://localhost:5173"
