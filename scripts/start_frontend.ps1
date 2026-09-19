# 开发调试用：单独拉起 Vite 前端（端口 5173）
# 日常启动请用根目录 `启动管理工具.bat`（WPF 控制台会同时管好 API + 前端）
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$uiDir = Join-Path $root "src\frontend\manga-ui"
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "vite", "--host", "0.0.0.0", "--port", "5173" `
    -WorkingDirectory $uiDir -PassThru -WindowStyle Hidden
Write-Output "Started Vite PID=$($proc.Id)"
