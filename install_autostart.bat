@echo off
:: Right-click -> Run as administrator. Starts SimWatch (with admin rights) every time you sign in.
schtasks /Create /TN "SimWatch" /TR "\"%~dp0run_simwatch.bat\"" /SC ONLOGON /RL HIGHEST /DELAY 0000:30 /F
echo.
echo Installed. To remove:  schtasks /Delete /TN "SimWatch" /F
pause
