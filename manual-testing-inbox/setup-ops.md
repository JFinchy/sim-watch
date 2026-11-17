# Setup & launcher hardening

Branch: `master` (uncommitted working tree)
Files changed: `_find_python.bat` (new), `setup.bat` (new), `run_simwatch.bat`, `run_practice_video.bat`, `release_device.bat`, `reconnect_sim.bat`, `install_autostart.bat`, `requirements.txt`, `requirements-video.txt` (new), `requirements-dev.txt` (new), `.gitignore`, `SETUP.md` (new), `CLAUDE.md` (new), `drills/shorts/README.txt`, `Swings/My-Go-To/README.txt`, `Swings/Pros/README.txt`, `manual-testing-inbox/*`

## What to verify

The .bat launchers were written on macOS and never executed. A human on Windows must confirm Python discovery, venv setup, the autostart elevation, and that a silent autostart failure now produces a visible message box.

## Steps

1. Use a path containing a space (for example `C:\sim watch`). Fresh clone or copy the repo there, open a normal (non-admin) Command Prompt, `cd /d "C:\sim watch"`.
2. Run `setup.bat`. Expect: `.venv` created, pip installs requirements.txt, Y/N prompt for OpenCV (answer Y), `doctor` runs (or warns it is not available), Y/N prompt for autostart (answer N).
3. Run `_find_python.bat` then `echo %PY%` via: `cmd /c "call _find_python.bat && echo %PY%"`. Expect the `.venv\Scripts\python.exe` path. Rename `.venv` to `.venv_x` and repeat; expect `py`/AppData/PATH Python. Rename it back.
4. Run `install_autostart.bat` from the non-admin prompt. Expect a UAC prompt, then an elevated window reporting "Installed". Verify: `schtasks /Query /TN SimWatch`.
5. Failure visibility: rename `simwatch.py` to `simwatch.py.off`, run `run_simwatch.bat --no-pause`. Expect a message box "SimWatch did not start..." and new lines in `logs\launcher.log`. Rename it back.
6. Reboot or sign out/in with the task installed and simwatch.py intact. Expect GSPro etc. to launch as before and `logs\launcher.log` to contain "launching" and "exited with code 0".
7. Run `run_simwatch.bat` (no argument): output shows in the console and it pauses at the end.
8. Run `reconnect_sim.bat`, then `release_device.bat`, then `run_practice_video.bat`; each should behave as before and report a non-zero exit code if it fails.
9. Cleanup: `schtasks /Delete /TN "SimWatch" /F`.

## Pass criteria

All steps behave as described; no "was unexpected at this time" or "system cannot find the path" errors with a spaced path; autostart failure is never silent.
