@echo off
cd /d "%~dp0"
title SimWatch Video Practice (Kinovea 2x2 + Hotkeys)
set "PYEXE=python"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
"%PYEXE%" simwatch.py video
pause
