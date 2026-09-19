@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ====================================================================
rem  MangaManager - the ONLY launcher
rem  Builds, then starts the WPF console (which manages the API + frontend,
rem  the download monitor and the tray icon).
rem  NOTE: keep this file ASCII-only - cmd.exe mis-parses UTF-8 batch text.
rem  NOTE: always build before launch - the old trap was running a stale
rem        binary after code changes.
rem ====================================================================

set "PROJ=src\desktop\MangaManager.Console\MangaManager.Console.csproj"
set "EXE=src\desktop\MangaManager.Console\bin\Debug\net9.0-windows\MangaManager.Console.exe"

rem While the console runs it locks its own output folder, so a build would
rem fail with MSB3027 - detect that first and just report it.
tasklist /fi "imagename eq MangaManager.Console.exe" 2>nul | find /i "MangaManager.Console.exe" >nul
if not errorlevel 1 (
  echo [MangaManager] WPF console is already running - see the tray icon.
  timeout /t 2 /nobreak >nul 2>&1
  exit /b 0
)

set "BUILD_OK=1"
echo [MangaManager] Building WPF console...
dotnet build "%PROJ%" -c Debug --nologo -v:m || set "BUILD_OK=0"

if not exist "%EXE%" (
  echo [ERROR] Executable not found: %EXE%
  echo         The output path may have changed (TargetFramework?).
  pause
  exit /b 1
)

if not "%BUILD_OK%"=="1" (
  echo.
  echo [WARN] Build failed; starting the existing binary ^(may be outdated^).
  echo        Exit the console and run this file again to pick up new code.
  echo.
)

echo [MangaManager] Starting WPF console...
start "" "%EXE%"
exit /b 0
