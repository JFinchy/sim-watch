@echo off
:: Double-click after using reconnect_sim.bat / "python simwatch.py reconnect" for FSX Pro setup/testing.
:: Disconnects FSX Pro from the Launch Pro so GameChanger can reconnect to it.
cd /d "%~dp0"
title SimWatch: release device to GameChanger
python simwatch.py release-device
pause
