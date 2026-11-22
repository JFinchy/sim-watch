@echo off
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%shotlab"

where node >nul 2>&1
if errorlevel 1 (
    echo [ShotLab] Node.js 20+ is required. Download LTS from https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ShotLab] npm was not found in PATH. Reinstall Node.js 20+ LTS from https://nodejs.org/
    pause
    exit /b 1
)

set "NODE_MAJOR=0"
for /f "delims=v." %%v in ('node -v') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 20 (
    echo [ShotLab] Node.js 20+ is required ^(found v%NODE_MAJOR%^). Download LTS from https://nodejs.org/
    pause
    exit /b 1
)

pushd "%APP%"
if errorlevel 1 (
    echo [ShotLab] Could not open directory "%APP%".
    pause
    exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo [ShotLab] First run detected - installing Electron desktop dependencies...
    call npm install
    if errorlevel 1 (
        echo [ShotLab] npm install failed.
        popd
        pause
        exit /b 1
    )
)
if not exist "node_modules\electron\dist\electron.exe" (
  rem npm 11+ skips package install scripts unless approved, so Electron's binary download never runs.
  echo [ShotLab] Downloading the Electron runtime...
  node "node_modules\electron\install.js"
)
if not exist "node_modules\electron\dist\electron.exe" echo [ShotLab] WARNING: Electron did not install ^(check free disk space, then rerun^).

echo [ShotLab] Launching ShotLab Desktop + OBS Overlay Server (http://127.0.0.1:8766)...
call npm start -- %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
if not "%EXIT_CODE%"=="0" (
    echo [ShotLab] Exited with error code %EXIT_CODE%.
    pause
)
endlocal & exit /b %EXIT_CODE%
