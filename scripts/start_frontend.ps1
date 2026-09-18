$ErrorActionPreference = "Stop"
$uiDir = "D:\MangaManager\src\frontend\manga-ui"
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "vite", "--host", "0.0.0.0", "--port", "5173" `
    -WorkingDirectory $uiDir -PassThru -WindowStyle Hidden
Write-Output "Started Vite PID=$($proc.Id)"
