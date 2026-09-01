# ============================================
# MangaManager 一键发布脚本
# 输出：自包含 Windows x64 单文件夹
# ============================================
param(
    [string]$OutputDir = "..\..\publish",
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MangaManager v$Version 发布脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. 构建前端
Write-Host "`n[1/5] 构建 React 前端..." -ForegroundColor Yellow
Push-Location "$root\src\frontend\manga-ui"
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
    Write-Host "  前端构建完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 2. 发布后端（自包含）
Write-Host "`n[2/5] 发布 .NET 后端（自包含 win-x64）..." -ForegroundColor Yellow
$publishDir = "$OutputDir\MangaManager"
Push-Location "$root\src\backend\MangaManager.Api"
try {
    dotnet publish -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=false `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        -o $publishDir
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish 失败" }
    Write-Host "  后端发布完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 3. 复制前端产物到 wwwroot
Write-Host "`n[3/5] 复制前端文件到 wwwroot..." -ForegroundColor Yellow
$wwwroot = "$publishDir\wwwroot"
if (Test-Path $wwwroot) { Remove-Item -Recurse -Force $wwwroot }
Copy-Item -Recurse "$root\src\frontend\manga-ui\dist\*" $wwwroot
Write-Host "  前端文件已复制到 wwwroot" -ForegroundColor Green

# 4. 发布桌面控制台（自包含）
Write-Host "`n[4/5] 发布桌面控制台（自包含 win-x64）..." -ForegroundColor Yellow
Push-Location "$root\src\desktop\MangaManager.Console"
try {
    dotnet publish -c Release -r win-x64 --self-contained true `
        -p:DebugType=none -p:DebugSymbols=false `
        -o $publishDir
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish 控制台失败" }
    Write-Host "  控制台发布完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 5. 生成合并配置（API 与控制台共用同一份 appsettings.json）
Write-Host "`n[5/5] 生成合并配置..." -ForegroundColor Yellow
$appSettings = @"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    },
    "MaxLines": 2000,
    "MaxFileSizeKB": 5120
  },
  "Database": {
    "Provider": "sqlite"
  },
  "ConnectionStrings": {
    "Default": "Data Source=manga.db"
  },
  "Urls": "http://0.0.0.0:5208",
  "Services": {
    "Api": {
      "Name": "API 后端",
      "Url": "http://127.0.0.1:5208",
      "HealthPath": "/health",
      "ExePath": "MangaManager.Api.exe",
      "ReadyTimeoutSeconds": 15,
      "AutoRestart": true
    },
    "Ui": {
      "Name": "Web 前端",
      "Url": "http://127.0.0.1:5208",
      "HealthPath": "/",
      "Enabled": false
    }
  },
  "Monitoring": {
    "IntervalSeconds": 5,
    "FailureBackoffSeconds": [ 5, 10, 20, 40, 60 ],
    "HttpTimeoutSeconds": 5
  }
}
"@
$appSettings | Out-File -FilePath "$publishDir\appsettings.json" -Encoding utf8 -Force

# 创建启动说明
$readme = @"
MangaManager v$Version
======================

使用方法：
  1. 双击 MangaManager.Console.exe（桌面控制台，自动拉起 API 服务）
  2. 本机浏览器打开 http://localhost:5208
  3. 局域网设备访问 http://你的电脑IP:5208
  4. 使用网页阅读器在线阅读漫画
  5. 关闭控制台窗口 = 最小化到托盘（服务继续运行），托盘菜单可退出

数据存储：
  - 漫画数据：manga.db（SQLite 数据库）
  - 下载漫画：downloads\ 目录
  - 修改端口：编辑 appsettings.json 中的 Urls

如需 MySQL 数据库：
  编辑 appsettings.json，将 Database.Provider 改为 "mysql"
  并修改 ConnectionStrings.Default 为 MySQL 连接字符串
"@
$readme | Out-File -FilePath "$publishDir\README.txt" -Encoding utf8 -Force

Write-Host "  配置已生成" -ForegroundColor Green

# 清理无用文件
Write-Host "`n清理冗余文件..." -ForegroundColor Yellow
Get-ChildItem $publishDir -Recurse -Include "*.pdb" | Remove-Item -Force -ErrorAction SilentlyContinue

# 统计大小
$size = (Get-ChildItem $publishDir -Recurse | Measure-Object -Property Length -Sum).Sum
$sizeMB = [math]::Round($size / 1MB, 1)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  发布完成！" -ForegroundColor Green
Write-Host "  输出目录: $publishDir" -ForegroundColor White
Write-Host "  总大小: $sizeMB MB" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
