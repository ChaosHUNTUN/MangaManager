# ============================================================
# Local equivalent of .github/workflows/ci.yml
# Use it when GitHub Actions is unavailable (billing lock, offline, not pushed yet).
#
# Usage: pwsh -File scripts\devops\ci_local.ps1 [-Install]
#   -Install  also runs "npm ci" (reinstalls node_modules - stop the dev server first)
#
# NOTE: keep this file ASCII-only so it also parses under Windows PowerShell 5.1,
#       which reads .ps1 as ANSI unless the file carries a UTF-8 BOM.
# ============================================================
param([switch]$Install)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$uiDir = Join-Path $root "src\frontend\manga-ui"
$failed = @()

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        $script:failed += $Name
        Write-Host "[FAIL] $Name" -ForegroundColor Red
    } else {
        Write-Host "[OK] $Name" -ForegroundColor Green
    }
}

Push-Location $root
try {
    Invoke-Step "backend restore" { dotnet restore src/backend/MangaManager.slnx --nologo }
    Invoke-Step "backend build (Release)" { dotnet build src/backend/MangaManager.slnx -c Release --no-restore --nologo }
    Invoke-Step "WPF console build (Release)" { dotnet build src/desktop/MangaManager.Console/MangaManager.Console.csproj -c Release --nologo }
    Invoke-Step "backend tests" { dotnet test src/backend/MangaManager.Tests/MangaManager.Tests.csproj -c Release --no-build --nologo }

    Push-Location $uiDir
    try {
        if ($Install) { Invoke-Step "frontend npm ci" { npm ci } }
        Invoke-Step "frontend lint" { npm run lint }
        Invoke-Step "frontend build" { npm run build }
    } finally { Pop-Location }
} finally { Pop-Location }

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed steps:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "All checks passed." -ForegroundColor Green
exit 0
