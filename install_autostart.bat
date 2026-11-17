@echo off
:: Registers a scheduled task "SimWatch" that starts SimWatch at every sign-in (10 s delay, highest
:: privileges). Creating a HIGHEST-privilege task REQUIRES administrator rights; this script
:: re-launches itself elevated (UAC prompt) if needed.
setlocal
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo Administrator rights are required to create the autostart task. Requesting elevation...
  set "SW_SELF=%~f0"
  powershell -NoProfile -Command "Start-Process -FilePath $env:SW_SELF -Verb RunAs"
  if errorlevel 1 (
    echo.
    echo Elevation was cancelled or failed. Right-click install_autostart.bat and choose Run as administrator.
    pause
    exit /b 1
  )
  echo An elevated window was opened to finish the install.
  exit /b 0
)

schtasks /Create /TN "SimWatch" /TR "\"%~dp0run_simwatch.bat\" --no-pause" /SC ONLOGON /RL HIGHEST /DELAY 0000:10 /F
if errorlevel 1 (
  echo.
  echo [SimWatch] ERROR: schtasks failed to create the task.
  pause
  exit /b 1
)
echo.
echo Installed. SimWatch will start at sign-in. Failures show a message box and log to logs\launcher.log.
echo To remove:  schtasks /Delete /TN "SimWatch" /F
pause
exit /b 0
