# Bug-hunt review fixes (lock retry, rig-start focus, HUD no-activate, trigger config)

Branch: `feature/coach-system`
Files changed: `simwatch.py` (`_FileLock.__enter__`, `read_daemon_info`, `SwingSessionManager.start`, `SwingSessionManager.trigger_capture`, `ProjectorPiPController.show_for_shot`, `HotkeyOverlayManager._run_hud`), `tests/test_bug_hunt.py`

## What to verify

Small fixes found in a code review; unit tests cover the logic, but focus handling and the HUD only behave
for real on Windows with GSPro running.

## Steps

1. Start GSPro, then let the watchdog start the video rig (or run `python simwatch.py stop` and `schtasks /Run /TN SimWatch`).
   When the Kinovea windows have launched and been parked, press a GSPro key (e.g. `K`/`I` club change) without clicking anything.
2. Press `Alt+H` while GSPro has focus: the shortcut map appears; press a GSPro key straight after.
3. Hit 10+ shots; check `simwatch.log` and `logs/clip-ready.log` for `lock busy` / `clip-ready failed`, and that every shot in today's `shots.jsonl` has both `clips.DTL` and `clips.FO`.
4. With no SimWatch running, run `python simwatch.py stop`: it should return immediately ("Stopped 0 ...").

## Pass criteria

1. GSPro reacts to the key (it has the keyboard, not a hidden Kinovea window) and is not left minimized.
2. GSPro keeps the keyboard while the HUD is visible (it is not minimized/flickered).
3. No dropped clip-ready runs; every full swing has both angles linked.
4. `stop` does not wait 20 s on an unrelated process.
