@echo off
setlocal
cd /d "%~dp0"
title SimWatch Video Practice (Kinovea 2x2 + Hotkeys)
call "%~dp0_find_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
"%PY%" simwatch.py video
set "RC=%errorlevel%"
if not "%RC%"=="0" echo [SimWatch] simwatch.py video exited with code %RC%. See simwatch.log
pause
exit /b %RC%
