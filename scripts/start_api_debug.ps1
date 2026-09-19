# 开发调试用：单独拉起后端 API（Debug 二进制，不重新构建）
# 日常启动请用根目录 `启动管理工具.bat`（WPF 控制台会同时管好 API + 前端）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiDir = Join-Path $root "src\backend\MangaManager.Api"
$exe = Join-Path $apiDir "bin\Debug\net9.0\MangaManager.Api.exe"

if (-not (Test-Path $exe)) {
    throw "未找到 $exe，请先执行：dotnet build `"$apiDir`""
}

$env:ASPNETCORE_ENVIRONMENT = "Development"

$proc = Start-Process -FilePath $exe -WorkingDirectory $apiDir -ArgumentList "--urls", "http://0.0.0.0:5208" -PassThru -WindowStyle Hidden
Write-Output "Started MangaManager.Api PID=$($proc.Id)"
