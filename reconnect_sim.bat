@echo off
:: Manual/diagnostic only - GameChanger connects to the Launch Pro by itself and doesn't need this.
:: Connects FSX PRO'S OWN view to the Launch Pro (wired first, then Wi-Fi) for setup/testing. This
:: creates a PAUSE file so the watchdog doesn't disconnect FSX Pro - run release_device.bat when done.
setlocal
cd /d "%~dp0"
title SimWatch: connect FSX Pro (manual)
call "%~dp0_find_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
"%PY%" simwatch.py reconnect
set "RC=%errorlevel%"
if not "%RC%"=="0" echo [SimWatch] reconnect exited with code %RC%. See simwatch.log
pause
exit /b %RC%
