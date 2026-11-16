@echo off
:: Manual/diagnostic only - GameChanger connects to the Launch Pro by itself and doesn't need this.
:: Connects FSX PRO'S OWN view to the Launch Pro (wired first, then Wi-Fi) for setup/testing. This
:: creates a PAUSE file so the watchdog doesn't disconnect FSX Pro - run release_device.bat when done.
cd /d "%~dp0"
title SimWatch: connect FSX Pro (manual)
set "PYEXE=python"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
"%PYEXE%" simwatch.py reconnect
pause
