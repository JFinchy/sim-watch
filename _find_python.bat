@echo off
:: Shared Python discovery. Usage:  call "%~dp0_find_python.bat"
:: Sets PY to a Python 3.10+ interpreter and returns 0, or returns 1 if none found.
:: Search order: repo .venv, py -3 launcher, %LOCALAPPDATA%\Programs\Python\Python3*, python on PATH.
:: Deliberately has no setlocal so PY survives in the caller.
set "PY="

if exist "%~dp0.venv\Scripts\python.exe" call :try "%~dp0.venv\Scripts\python.exe"
if defined PY exit /b 0

where py >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%P in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do if not defined PY call :try "%%P"
)
if defined PY exit /b 0

if exist "%LOCALAPPDATA%\Programs\Python" (
  for /f "delims=" %%D in ('dir /b /ad /o-n "%LOCALAPPDATA%\Programs\Python\Python3*" 2^>nul') do if not defined PY call :try "%LOCALAPPDATA%\Programs\Python\%%D\python.exe"
)
if defined PY exit /b 0

where python >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%P in ('where python 2^>nul') do if not defined PY call :try "%%P"
)
if defined PY exit /b 0

echo.
echo [SimWatch] ERROR: no usable Python 3.10+ found.
echo Install Python 3.11 or newer from https://www.python.org/downloads/windows/
echo and tick "Add python.exe to PATH" ^(or keep the py launcher^), then run setup.bat.
exit /b 1

:try
if not exist "%~1" exit /b 1
"%~1" -c "import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>&1
if errorlevel 1 exit /b 1
set "PY=%~1"
exit /b 0
