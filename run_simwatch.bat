@echo off
setlocal
cd /d "%~dp0"
title SimWatch
:: Pass --no-pause for unattended use (autostart). In that mode output goes to logs\launcher.log
:: and any failure raises a visible message box instead of closing silently.
set "NOPAUSE=0"
if /I "%~1"=="--no-pause" set "NOPAUSE=1"
set "SW_LOG=%~dp0logs\launcher.log"
if not exist "%~dp0logs" mkdir "%~dp0logs"

call "%~dp0_find_python.bat"
if errorlevel 1 (
  set "FAILMSG=Python 3.10 or newer was not found. Run setup.bat."
  goto :fail
)

>>"%SW_LOG%" echo [%date% %time%] launching: "%PY%" simwatch.py startup
if "%NOPAUSE%"=="1" (
  "%PY%" simwatch.py startup >>"%SW_LOG%" 2>&1
) else (
  "%PY%" simwatch.py startup
)
set "RC=%errorlevel%"
>>"%SW_LOG%" echo [%date% %time%] simwatch.py exited with code %RC%
if not "%RC%"=="0" (
  set "FAILMSG=simwatch.py startup failed with exit code %RC%."
  goto :fail
)
if "%NOPAUSE%"=="0" pause
exit /b 0

:fail
>>"%SW_LOG%" echo [%date% %time%] FAILED: %FAILMSG%
echo.
echo [SimWatch] %FAILMSG%
echo See %SW_LOG% and simwatch.log
if "%NOPAUSE%"=="1" (
  set "SW_MSG=SimWatch did not start. %FAILMSG%"
  powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:SW_MSG + [Environment]::NewLine + 'Details: ' + $env:SW_LOG, 'SimWatch', 'OK', 'Error')"
) else (
  pause
)
exit /b 1
