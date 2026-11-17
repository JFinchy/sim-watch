# SimWatch setup (fresh Windows 10/11 machine)

## 1. Prerequisites
- **Python 3.11 or newer** (3.10 is the hard minimum: simwatch.py uses `X | None` annotations without `from __future__ import annotations`). Tick "Add python.exe to PATH" or keep the `py` launcher.
- Install the sim software and note the exe paths:
  - GSPro and GSPconnect (default `C:\GSProV1\Core\GSP\GSPro.exe`, `C:\GSProV1\Core\GSPC\GSPconnect.exe`)
  - GameChanger (any folder you unzipped it to)
  - FSX Pro (`C:\Program Files (x86)\FSX Pro\FSX Pro.exe`); in FSX Pro Settings > Devices turn OFF "Auto connect with solo device"
  - Kinovea (`C:\Program Files\Kinovea\Kinovea.exe`) and OBS Studio (`C:\Program Files\obs-studio\bin\64bit\obs64.exe`) for the video features

## 2. Point config.json at your installs
Edit these keys (JSON needs doubled backslashes):
- `apps[].exe` for each of the four apps: FSX Pro, GameChanger (the shipped value is a Downloads path on another PC, change it), GSPconnect, GSPro
- `video.kinovea_exe`, `video.obs_exe`, `video.swings_dir` (relative to the repo, default `Swings`)
- `device.ip`, `device.port`, `device.ports` (your Launch Pro address)
- `projector.match_regex` only if a second real monitor is attached

## 3. Install
1. Clone or copy the repo (spaces in the path are fine).
2. Double-click `setup.bat`. It creates `.venv`, installs `requirements.txt`, optionally installs `requirements-video.txt` (OpenCV + numpy, only needed for ball auto-detect and swing-path tracing), runs the health check and offers autostart.
3. Run `.venv\Scripts\python.exe simwatch.py doctor` any time to re-check.
4. Autostart: `install_autostart.bat`. It needs administrator rights (the task runs with highest privileges) and asks for UAC elevation itself. Remove with `schtasks /Delete /TN "SimWatch" /F`.

## 4. First-run checks
- `run_simwatch.bat` starts the apps and the watchdog; the console shows progress.
- `run_practice_video.bat` opens the Kinovea 2x2 grid; `Alt+H` shows the hotkey cheat sheet.
- `open_drills.bat` opens the offline drills hub.
- Optional: `simwatch.py obs-setup` for the OBS scene collection in `Swings\`.

## 5. Troubleshooting
- Logs: `simwatch.log` (repo root, rotating) and `logs\launcher.log` (launcher output; autostart failures also show a message box).
- Create a file named `PAUSE` next to `simwatch.py` to pause the watchdog; delete it to resume.
- `reconnect_sim.bat` connects FSX Pro's own view to the Launch Pro (creates PAUSE); `release_device.bat` disconnects it and removes PAUSE so GameChanger can reconnect.
- `simwatch.py stop` stops background instances.
- "no usable Python 3.10+ found": install Python, or run `setup.bat`.

## 6. Updating
`git pull`, then run `setup.bat` again (safe to repeat) to pick up new requirements. Keep your local `config.json` edits when merging.
