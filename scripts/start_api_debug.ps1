$ErrorActionPreference = "Stop"
$apiDir = "D:\MangaManager\src\backend\MangaManager.Api"
$exe = Join-Path $apiDir "bin\Debug\net9.0\MangaManager.Api.exe"

$env:ASPNETCORE_ENVIRONMENT = "Development"

$proc = Start-Process -FilePath $exe -WorkingDirectory $apiDir -ArgumentList "--urls", "http://0.0.0.0:5208" -PassThru -WindowStyle Hidden
Write-Output "Started MangaManager.Api PID=$($proc.Id)"
