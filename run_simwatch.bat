@echo off
cd /d "%~dp0"
title SimWatch
set "PYEXE=python"
if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
"%PYEXE%" simwatch.py startup
if /I not "%~1"=="--no-pause" pause
