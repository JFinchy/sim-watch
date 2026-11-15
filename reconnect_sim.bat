@echo off
:: Manual/diagnostic only - GameChanger connects to the Launch Pro by itself and doesn't need this.
:: Connects FSX PRO'S OWN view to the Launch Pro (wired first, then Wi-Fi) for setup/testing. This
:: takes the device away from GameChanger - run release_device.bat when you're done so GameChanger
:: can reconnect.
cd /d "%~dp0"
title SimWatch: connect FSX Pro (manual)
python simwatch.py reconnect
pause
