# Watchdog hardening

Branch: `master` (uncommitted working tree)
Files changed: simwatch.py, config.json, tests/ (plus pyproject.toml for pytest config)

## What to verify

A hardening pass on the watchdog: crash-proof `watch` loop, config validation, a `doctor` command, a status heartbeat file, richer logging, no destructive side effects on Kinovea/OBS files, and race/overwrite fixes in the video rig. The unit tests (`python -m pytest`, 55 tests) run on macOS and cover the pure logic, but none of the Windows behavior (Win32 windows, real Kinovea/OBS/GSPro, Task Scheduler) can be exercised there, so a human must confirm it on the sim PC. Run from an ADMIN terminal in the repo folder.

## Steps

1. Doctor output. Run `python simwatch.py doctor`. Expect a STATUS/ITEM/DETAIL table. Then run `echo %ERRORLEVEL%`.
2. Doctor with a missing exe. Temporarily rename `C:\GSProV1\Core\GSP\GSPro.exe` (or edit an `exe` path in a copy of the config) and run `python simwatch.py doctor --config <copy>`. Restore the file afterwards.
3. Deliberately broken config is rejected. Copy `config.json` to `bad.json`, change a check `"type": "process"` to `"type": "bogus"` and a recovery restart key to `"ghost"`. Run `python simwatch.py watch --config bad.json` and `python simwatch.py startup --config bad.json`. Then run `python simwatch.py check --config bad.json` (should only log the errors, not exit).
4. Watchdog survives a forced exception. Run this one-liner from the repo folder, let it run 30 s, then Ctrl+C: `python -c "import simwatch as s; s._watch_step=lambda *a: 1/0; s.watch(s.load_config(s.HERE/'config.json'))"`. (This forces every iteration to raise ZeroDivisionError.)
5. Status heartbeat. While `watch` runs, open `simwatch_status.json` next to `simwatch.py` repeatedly (`type simwatch_status.json`). Create an empty file named `PAUSE` next to the script, wait 10 s, re-read, then delete `PAUSE`. Close GSPro.exe (gate down), re-read, restart GSPro. Kill GameChanger.exe and re-read during the failure window.
6. Log format. Open `simwatch.log`; each line should look like `2026-... INFO [MainThread] ...`.
7. Kinovea instances survive another's restart. With `python simwatch.py video` running (Capture, LiveReplay, Reference all open), run `python simwatch.py reference Tiger_Woods` (restarts only Reference, with force reload). Check that Capture and LiveReplay keep playing/streaming. Also confirm `%APPDATA%\Kinovea\Temp` still has its contents before/after (`dir %APPDATA%\Kinovea\Temp`).
8. Bookmark with a locked file. Press Alt+G once (creates `Swings\My-Go-To\<cat>\GoTo_<club>_DTL.mp4`). Open that exact file in the Reference Kinovea window (or any player that locks it exclusively), swing/trigger so a newer clip exists, press Alt+G again (or `python simwatch.py bookmark`).
9. Recovery ladder. Run `python simwatch.py recover 0`, then `python simwatch.py recover 1`, then `python simwatch.py recover 2`. Then, with `watch` running, kill GSPconnect.exe repeatedly to force a level-1 check failure.
10. Prefs/OBS backups. Delete `Preferences.Capture.xml.bak` if present, run `python simwatch.py obs-setup` twice, and compare file timestamps of `%APPDATA%\Kinovea\Preferences.Capture.xml`, `Preferences.LiveReplay.xml`, `Preferences.Reference.xml` and `%APPDATA%\obs-studio\basic\scenes\SimWatch_PiP.json` and any `.bak` neighbours between the two runs.
11. Capture start/stop. With `watch` running and GSPro up, hit a shot (or press Alt+C). Confirm Kinovea Capture starts recording and stops about `post_trigger_sec` later. Start a recording with Alt+C and immediately create the `PAUSE` file: recording must still stop and the PiP must auto-hide. Close the Capture window mid-recording and confirm the log shows "Kinovea stop-recording command failed; will retry" (no crash).
12. Unlabeled clip collision. Drop two video files with no DTL/FO in the name into today's `Swings\Sessions\<date>\DTL` folder within a few seconds of each other. Confirm both appear in `Swings\Sessions\<date>` with a `_2` suffix on the second and neither was overwritten.

## Pass criteria

1. Table shows PASS/WARN/FAIL rows for Python version, platform, admin, modules, config validation, every app exe, Kinovea/OBS exe, ports 921/9050/9970/9971 (PASS when listening or connected, WARN otherwise), and scheduled task `SimWatch` (PASS if `install_autostart.bat` was run). Exit code is `0` with no FAIL rows.
2. The missing exe shows `FAIL` for that app and the exit code is `1`.
3. `watch` and `startup` exit immediately with `Refusing to run ... config error(s)` listing the bogus type and the ghost key. `check` logs the errors as `ERROR config error: ...` and still runs.
4. The log shows `ERROR [MainThread] watch iteration failed (ZeroDivisionError: division by zero); continuing in 5s` with a traceback, repeated each interval (ZeroDivisionError for the one-liner), and the process keeps running. `simwatch_status.json` shows `"state": "error"` with the message.
5. `simwatch_status.json` updates every cycle (timestamp advances every ~5 s): `healthy` when all green, `paused` with `PAUSE`, `waiting_for_gate` with GSPro closed, `degraded`/`recovering` with the failing check names in `failing` when GameChanger is killed, `device_offline` when the Launch Pro is off. The file is never partially written or unparsable.
6. Every log line has level and `[ThreadName]`; swallowed-failure warnings (e.g. PiP, OBS, Kinovea prefs) now appear at WARNING at most once per minute per cause.
7. Capture and LiveReplay windows are unaffected by the Reference restart; `%APPDATA%\Kinovea\Temp` is untouched; log shows no Temp wipe.
8. The second bookmark logs `Go-To clip ... is locked; saved as GoTo_<club>_DTL_2.mp4 instead`; the Reference window is NOT closed or killed; the new `_2` clip is newest in `My-Go-To\<cat>`.
9. Level 0 restarts GSPconnect + GameChanger. Level 1 restarts GSPro, GSPconnect, GameChanger. `recover 2` prints `Invalid recovery level 2 (valid: 0..1)` (the redundant third level was removed). After level 1 fails in `watch`, the log shows `All recovery levels failed` plus 3 beeps and a 300 s backoff.
10. First run may create one `.bak` next to a changed file; the second run creates no new backups and does not change file timestamps (skipped, identical).
11. Recording starts on the shot and stops after `post_trigger_sec`, including while paused; PiP hides after `popup_seconds` even while paused; a failed stop command is retried every tick (up to ~10 s) and then gives up with an ERROR.
12. Both clips exist; `_2` suffix on the second; no overwrite.

## Addendum: code-review robustness fixes (uncommitted, `feature/coach-system`)

Steps:

A. With `watch` running and video enabled, take a shot so the OBS PiP pops up, then close OBS before `popup_seconds` elapses. Wait 30 s.
B. Set `"offline_ticks": "y"` under `device` in `config.local.json`, restart `watch`, power the Launch Pro off for ~30 s, then put the value back.

Pass criteria:

A. `simwatch.log` has no repeating `Projector PiP auto-hidden` lines (it used to log twice a second forever). The next shot after OBS is restarted pops the PiP again.
B. `config warning: device.offline_ticks must be a non-negative number` at startup, then normal `device_offline` handling after 3 ticks. No `watch iteration failed (ValueError ...)` lines.
