# SimWatch - orientation for agents

Windows-only golf-simulator watchdog (Windows 10/11, Python 3.10+). It keeps GSPro, GSPconnect,
GameChanger and FSX Pro healthy, recovers a dropped Launch Pro connection, and drives a Kinovea
2x2 swing-video grid plus OBS projector PiP. It imports winsound/pywin32/pywinauto, so it CANNOT
run on macOS/Linux; you can only read, edit and run pure-logic tests and the drills tooling there.

## File map
- `simwatch.py` - the whole app (single file, argparse subcommands: startup, watch, check, recover, video, bookmark, reconnect, release-device, ...)
- `config.json` - app paths, device IP/ports, recovery steps, video/hotkey settings
- `*.bat` - launchers; `_find_python.bat` is shared Python discovery (sets PY); `setup.bat` is first-time install
- `requirements.txt` (core), `requirements-video.txt` (optional OpenCV), `requirements-dev.txt` (pytest)
- `Swings/` - Kinovea workspaces, OBS scene collection, My-Go-To and Pros reference clips
- `drills/` - offline drills hub (`index.html`, `drills_data.js`, `shorts/`, `tools/`)
- `SETUP.md` - install checklist; `README.md` - feature docs
- `docs/SHORTCUTS.md` - generated hotkey map (`python simwatch.py keys md`; source: `HOTKEY_ACTIONS` in simwatch.py + `video.hotkeys`)
- `manual-testing-inbox/` - human verification queue

## Commands
- Tests: `python -m pytest` from repo root (tests/ — pure logic only; Windows calls are stubbed so it runs on macOS)
- Drills data validator: `node drills/tools/validate_data.js`
- Runtime log: `simwatch.log` (repo root); launcher log: `logs/launcher.log`; `PAUSE` file pauses the watchdog

## Rules
- Never read, grep or cat any `.env` file (`.env.example` is fine).
- Do not hardcode Python paths in .bat files; use `call "%~dp0_find_python.bat"`. Save .bat files with CRLF endings and quote all paths (the repo path may contain spaces).
- Manual-testing convention: a change that is implementation-complete but not exercised on the rig adds `manual-testing-inbox/<feature-slug>.md` (with `Branch:` at the top) and a line in `manual-testing-inbox/PRIORITIES.md` (Critical/Important/Minor). Pass moves the line to Backlog (dated); Fail adds a note. See `manual-testing-inbox/README.md`.
