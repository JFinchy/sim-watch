@echo off
:: Double-click after using reconnect_sim.bat / "python simwatch.py reconnect" for FSX Pro setup/testing.
:: Disconnects FSX Pro from the Launch Pro and removes PAUSE so GameChanger can reconnect.
cd /d "%~dp0"
title SimWatch: release device to GameChanger
set "PYEXE=python"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
"%PYEXE%" simwatch.py release-device
pause
