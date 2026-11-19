@echo off
:: One-time setup on a fresh Windows machine: venv, dependencies, health check, optional autostart.
setlocal
cd /d "%~dp0"
title SimWatch setup

call "%~dp0_find_python.bat"
if errorlevel 1 (
  pause
  exit /b 1
)

if not exist "%~dp0.venv\Scripts\python.exe" (
  echo Creating virtual environment in .venv using %PY% ...
  "%PY%" -m venv "%~dp0.venv"
  if errorlevel 1 (
    echo [SimWatch] ERROR: could not create .venv
    pause
    exit /b 1
  )
)
set "VPY=%~dp0.venv\Scripts\python.exe"

echo.
echo Installing core requirements ...
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo [SimWatch] ERROR: pip upgrade failed. Check your internet connection.
  pause
  exit /b 1
)
"%VPY%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo [SimWatch] ERROR: installing requirements.txt failed.
  pause
  exit /b 1
)

echo.
choice /C YN /M "Install optional video-analysis packages (OpenCV + numpy, for ball/swing-line auto-detect)"
if errorlevel 2 goto :skipvideo
"%VPY%" -m pip install -r "%~dp0requirements-video.txt"
if errorlevel 1 echo [SimWatch] WARNING: requirements-video.txt failed to install. SimWatch still works without it.
:skipvideo

echo.
if exist "%~dp0config.local.json" goto :havelocal
echo No config.local.json yet ^(per-machine exe paths / device IP, gitignored^).
choice /C YN /M "Auto-detect GameChanger, GSPro, GSPconnect, FSX Pro, Kinovea and OBS paths and write config.local.json"
if errorlevel 2 goto :havelocal
"%VPY%" simwatch.py discover --write-local
if errorlevel 1 echo [SimWatch] WARNING: auto-detect failed. Copy config.local.example.json to config.local.json and edit it.
:havelocal

echo.
echo Running health check ...
"%VPY%" simwatch.py doctor >"%TEMP%\simwatch_doctor.txt" 2>&1
set "DRC=%errorlevel%"
type "%TEMP%\simwatch_doctor.txt"
if not "%DRC%"=="0" (
  findstr /C:"invalid choice" "%TEMP%\simwatch_doctor.txt" >nul 2>&1
  if not errorlevel 1 (
    echo.
    echo [SimWatch] WARNING: this simwatch.py has no doctor command yet - skipped.
  ) else (
    echo.
    echo [SimWatch] WARNING: doctor reported problems ^(exit code %DRC%^). Fix them per SETUP.md.
  )
)

echo.
choice /C YN /M "Install autostart (start SimWatch at every sign-in)"
if errorlevel 2 goto :skipauto
call "%~dp0install_autostart.bat"
:skipauto

echo.
echo Setup finished. Next: harden the Launch Pro link ^(python simwatch.py harden^), then see SETUP.md.
pause
exit /b 0
