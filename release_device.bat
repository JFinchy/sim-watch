@echo off
:: Double-click after using reconnect_sim.bat / "python simwatch.py reconnect" for FSX Pro setup/testing.
:: Disconnects FSX Pro from the Launch Pro and removes PAUSE so GameChanger can reconnect.
setlocal
cd /d "%~dp0"
title SimWatch: release device to GameChanger
call "%~dp0_find_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)
"%PY%" simwatch.py release-device
set "RC=%errorlevel%"
if not "%RC%"=="0" echo [SimWatch] release-device exited with code %RC%. See simwatch.log
pause
exit /b %RC%
