# SimWatch ↔ ShotLab integration

Branch: `JFinchy/continue-shotlab-work`
Files changed: `simwatch.py` (`ShotLabSupervisor`, `launch_shotlab`, `probe_shotlab_health`, `doctor_shotlab_rows`, `STATUS_EXTRAS`, `health` SSE broadcast, `shotlab` command, `HOTKEY_ACTIONS` + Alt+S `toggle_shotlab`, hotkey registration status), `config.json` (`shotlab` section, `toggle_shotlab`), `setup.bat`, `shotlab/main.js` (`/api/health`, no-focus launch, `rigHealth`), `shotlab/renderer/*` + `preload.js` (Rig and Keys pills), `tests/test_shotlab_supervisor.py`, `README.md`

## What to verify

SimWatch now launches and supervises ShotLab alongside the rig, and ShotLab shows the watchdog's rig verdict. The state machine is unit-tested with fakes; only the rig can show real Electron exit codes, real focus behaviour next to GSPro, and the elevated-launch side effects.

## Steps

1. Run `setup.bat`, answer **Y** to "Install ShotLab desktop app". Confirm `shotlab\node_modules\electron\dist\electron.exe` exists.
2. `python simwatch.py doctor` → rows `ShotLab installed` = PASS and `ShotLab :8766` = INFO "not running".
3. Start the rig normally (`run_simwatch.bat`). Within ~10s of GSPro being up, ShotLab should open **behind GSPro without taking focus** (GSPro keeps keyboard input; press `I` in GSPro to confirm).
4. Open `simwatch_status.json` → `"shotlab": {"state": "running", "bridge_connected": true, ...}`.
5. In ShotLab's top bar the **Rig** pill reads `Rig OK`. Unplug/close GameChanger: the pill should go to `Rig: checking` and then `Rig: recovering`, with the failing check named on hover, and back to `Rig OK` after recovery.
6. **Crash relaunch:** in Task Manager, End task on the ShotLab `electron.exe` (main process). Within ~15s it relaunches; `simwatch.log` shows `ShotLab exited with code 1; relaunch in 10s`.
7. **User close:** close ShotLab with the window X. It must **not** reopen. `simwatch_status.json` shows `user_closed`. Close GSPro, start GSPro again → ShotLab reopens.
8. `python simwatch.py shotlab` while ShotLab is closed → it opens; while open → the existing window is focused (no second copy).
9. **Adopted:** stop SimWatch, start ShotLab via `run_shotlab.bat`, start SimWatch. Status shows `adopted`; SimWatch never launches a second copy.
10. **Alt+S:** with GSPro focused press `Alt+S` → ShotLab comes to the front. Press again → it minimizes and GSPro has focus again (press `I` in GSPro to confirm). Close ShotLab, press `Alt+S` → it opens in front.
11. **Seeing the keys:** press `Alt+H` → cheat sheet lists Alt+S with no red note. Hover ShotLab's `⌨ Alt+H shortcuts` pill → same list. Run `python simwatch.py hotkeys` while the watchdog runs → it prints the list and tells you to press Alt+H; it must NOT stop the running watchdog.
12. Note whether ShotLab launched by the (elevated) watchdog blocks drag-and-drop of CSV files from Explorer (expected Windows UIPI behaviour; the FSX CSV button's file picker still works).

## Pass criteria

- ShotLab comes up with the rig, never steals focus from GSPro, and is relaunched after a crash but not after you close it.
- No ShotLab state ever appears in the rig's `failing` list or triggers a GSPro/GameChanger restart.
- Rig pill tracks the watchdog state live.

## Tempo sounds + rest between swings (2026-11-20)

Branch: `master`. Files: `shotlab/renderer/audio.js`, `app.js`, `index.html`, `shotlab/main.js`, `shotlab/tests/tempo.test.js`.

1. In ShotLab pick Tempo `24/8`, then cycle the sound dropdown (Tones, Woodblock, Click, Beep, Soft, Swoosh). Each changes from the next beat without restarting, and the three beats stay distinguishable (takeaway, top, impact).
2. Set the rest to `8 s rest`. After the impact beat there is silence, a quiet low tick about 1 s before the next takeaway, then the next swing's beats. `Non-stop` returns to the continuous loop.
3. Restart ShotLab: the sound and rest choices are remembered (the tempo itself starts Off).
4. Rig speakers: Click and Woodblock are audible from the mat; Soft is quiet enough for Kids Asleep.
