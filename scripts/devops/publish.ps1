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
Write-Host "`n[1/4] 构建 React 前端..." -ForegroundColor Yellow
Push-Location "$root\src\frontend\manga-ui"
try {
    npm install --silent 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Write-Host "  前端构建完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 2. 发布后端（自包含）
Write-Host "`n[2/4] 发布 .NET 后端（自包含 win-x64）..." -ForegroundColor Yellow
$publishDir = "$OutputDir\MangaManager"
Push-Location "$root\src\backend\MangaManager.Api"
try {
    dotnet publish -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=false `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        -o $publishDir 2>&1 | Out-Null
    Write-Host "  后端发布完成" -ForegroundColor Green
} finally {
    Pop-Location
}

# 3. 复制前端产物到 wwwroot
Write-Host "`n[3/4] 复制前端文件到 wwwroot..." -ForegroundColor Yellow
$wwwroot = "$publishDir\wwwroot"
if (Test-Path $wwwroot) { Remove-Item -Recurse -Force $wwwroot }
Copy-Item -Recurse "$root\src\frontend\manga-ui\dist\*" $wwwroot
Write-Host "  前端文件已复制到 wwwroot" -ForegroundColor Green

# 4. 创建默认配置
Write-Host "`n[4/4] 生成默认配置..." -ForegroundColor Yellow
$appSettings = @"
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "Database": {
    "Provider": "sqlite"
  },
  "ConnectionStrings": {
    "Default": "Data Source=manga.db"
  },
  "NeeView": {
    "Path": ""
  },
  "Urls": "http://0.0.0.0:5000"
}
"@
$appSettings | Out-File -FilePath "$publishDir\appsettings.json" -Encoding utf8 -Force

# 创建启动说明
$readme = @"
MangaManager v$Version
======================

使用方法：
  1. 双击 MangaManager.Api.exe 启动服务
  2. 本机浏览器打开 http://localhost:5000
  3. 局域网设备访问 http://你的电脑IP:5000
  3. 在设置中配置 NeeView 路径（可选）
  4. 点击「扫描入库」导入漫画

数据存储：
  - 漫画数据：manga.db（SQLite 数据库）
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
