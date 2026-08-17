@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 优先使用 Python 启动器（py），其次回退到 PATH 中的 pythonw.exe
where py >nul 2>nul
if %errorlevel%==0 (
  start /MIN "" py -3w "%~dp0manga_manager.py"
  exit /b 0
)

where pythonw.exe >nul 2>nul
if %errorlevel%==0 (
  start /MIN "" pythonw.exe "%~dp0manga_manager.py"
  exit /b 0
)

echo [错误] 未找到 Python。请安装 Python 3 并勾选 "Add python.exe to PATH"。
pause
