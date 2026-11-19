@echo off
:: Registers a scheduled task "SimWatch" that starts SimWatch at every sign-in (10 s delay, highest
:: privileges). Creating a HIGHEST-privilege task REQUIRES administrator rights; this script
:: re-launches itself elevated (UAC prompt) if needed.
:: Uses PowerShell Register-ScheduledTask (not schtasks /Create) so the task gets settings schtasks
:: cannot set: no 72-hour execution time limit (PT0S), runs/keeps running on battery, and
:: restarts up to 3 times (1 minute apart) if it fails.
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

:: Paths go through environment variables so spaces in the repo path need no extra quoting.
set "SW_LAUNCHER=%~dp0run_simwatch.bat"
set "SW_DIR=%~dp0"
set "PS=$ErrorActionPreference='Stop';"
set "PS=%PS% $u=[Security.Principal.WindowsIdentity]::GetCurrent().Name;"
set "PS=%PS% $a=New-ScheduledTaskAction -Execute $env:SW_LAUNCHER -Argument '--no-pause' -WorkingDirectory $env:SW_DIR;"
set "PS=%PS% $t=New-ScheduledTaskTrigger -AtLogOn -User $u; $t.Delay='PT10S';"
set "PS=%PS% $p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Highest;"
set "PS=%PS% $s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable;"
set "PS=%PS% $null=Register-ScheduledTask -TaskName 'SimWatch' -Action $a -Trigger $t -Principal $p -Settings $s -Force;"
powershell -NoProfile -ExecutionPolicy Bypass -Command "%PS%"
if errorlevel 1 (
  echo.
  echo [SimWatch] ERROR: Register-ScheduledTask failed to create the task.
  pause
  exit /b 1
)
echo.
echo Installed. SimWatch will start at sign-in. Failures show a message box and log to logs\launcher.log.
echo Check:      schtasks /Query /TN "SimWatch" /XML   (ExecutionTimeLimit should be PT0S)
echo To remove:  schtasks /Delete /TN "SimWatch" /F
pause
exit /b 0
