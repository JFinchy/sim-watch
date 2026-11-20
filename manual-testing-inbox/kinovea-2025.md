# Kinovea 2025 integration (UDP trigger + clip-ready)

Branch: master (working tree)
Files changed: `simwatch.py` (Kinovea backend, SwingSessionManager trigger/clip handling, PiP window
matching, `clip-ready` subcommand), `config.json` (`video` keys), `tests/test_kinovea.py`,
`SETUP-video.md`, `.gitignore`

## What to verify

SimWatch now generates Kinovea 2025 window descriptors and preferences, triggers recording with a UDP
packet, and lets Kinovea call `simwatch.py clip-ready` to organize, link and replay each clip. Only the
real rig can prove that cameras, Kinovea's command execution, file locking and LiveReplay work together.

## Steps

1. Install Kinovea 2025.2 and follow `SETUP-video.md` sections 1-2 (aliases DTL/FO). Close all Kinovea windows.
2. `python simwatch.py video`. The log shows `-> 2025 backend`. Three windows open: `Kinovea [Capture]`,
   `Kinovea [LiveReplay]`, `Kinovea [Reference]`.
3. In Capture, check Preferences > Capture > Automation: UDP trigger on, port 8875, audio off. Check each screen's
   Post-recording command (`... clip-ready "%filepath%" DTL` / `FO`, enabled), delay 3.0 s, max duration 4.5 s.
4. Hit a 7-iron. Within about 6 s: two raw files in `%LOCALAPPDATA%\SimWatch\Captures\<date>\DTL|FO`, and
   `Swings\Sessions\<date>\NNN_7I_..._DTL.mp4` / `_FO.mp4` with `.kva` files. LiveReplay plays both with swing lines.
   `shots.jsonl` has `clip` set to the DTL name, and the drills hub gets a `clip` event.
5. Hit a putt (club PT). Nothing records, and the Reference row doesn't reload. Then go Driver -> PT -> 7-iron:
   the Reference row reloads to the Iron reference on the 7-iron (it used to stay on Driver after a putt).
6. Press Alt+C with no shot. A `NNN_Swing_DTL/FO` pair appears.
7. Clap test (`SETUP-video.md` section 4): the clap sits about 3.0 s into the clip.
8. Projector on: the PiP pops up on a shot, auto-hides, and pops up again on the next shot (it used to stay hidden).
9. Legacy: set `video.kinovea_backend: "legacy"` with 2024.1 installed. One shot gives one 4.5 s recording per camera
   (no double recording or early stop), and `Preferences.xml` has `InstancesOwnPreferences=true`.

## Pass criteria

Every full swing gives exactly one DTL and one FO clip, correctly named and linked to its shot. Putts give none.
Kinovea never shows a command error. Re-running `video` with no config change doesn't restart Kinovea windows.

## Review fixes (2026-11-19)

1. Hit with Driver, then select PT, then press Alt+R (cycle reference). The Reference row must load the Driver reference, not an Iron or random pro clip.
2. Press Alt+C (manual clip) once, then hit a real shot. The real shot's clips must link to it (named with its shot number and club), not show as `Swing`.

## Review fixes, round 2 (2026-11-19: clip link lock, shot numbers, midnight, pythonw, swap thread)

Branch: `feature/coach-system` (working tree). Files: `simwatch.py`, `tests/test_review_fixes.py`,
`tests/test_kinovea.py`, `README.md`, `SETUP.md`, `SETUP-video.md`.

1. **No console flash (F):** restart `python simwatch.py video` so it rewrites Kinovea prefs. In Capture, each
   screen's Post-recording command should start with `"...\pythonw.exe"`. Put GSPro fullscreen and hit a
   7-iron. No black console window appears and GSPro keeps focus. `logs\clip-ready.log` gets a
   `clip-ready: ... -> <date>/NNN_7I_..._DTL.mp4 (shot ..., linked=True)` line for each angle, and
   `simwatch.log` gets no `clip-ready` lines (J).
2. **Shot right after a club change (G):** in GSPro switch Driver -> 7-iron and swing within about 2 s of the
   switch. Both clips must show the full backswing (the trigger isn't delayed by the Reference reload). The
   log shows `Sent Kinovea UDP trigger` before or while the Reference window reloads, never 4-6 s after the shot.
3. **Repeated device shot number (B):** hit 3 shots, restart GameChanger (its ShotNumber restarts at 1), hit 2
   more. In `Swings\Sessions\<date>\shots.jsonl`, `shot_num` keeps counting up (4, 5) while `device_shot_num`
   shows 1, 2. Both new shots get their own `NNN_..._DTL/FO.mp4` pair and `clips` {DTL, FO} in their record.
   No clip is named `Swing` and none lands on an older shot.
4. **Both angles linked (B):** for any shot, the record has `"clip": "<DTL name>"` and
   `"clips": {"DTL": ..., "FO": ...}`.
5. **Midnight (C, optional):** swing at about 23:59:55. The DTL/FO library copies and the link land in the
   previous day's folder, under that day's shot. The LiveReplay copy lands in the new day's `DTL`/`FO` folder.
   The PiP still pops.
6. **Video rig start retry (H):** rename `kinovea_exe`'s folder (or point `video.kinovea_exe` at a bad path),
   start `python simwatch.py watch` with GSPro up. The log shows `Video rig start failed ...; retry #1 in 15s`,
   then retries at 30/60/120/300 s. Fix the path: the rig starts on the next retry without restarting GSPro.

Pass: every full swing still gives exactly one linked DTL + FO pair. No console window over GSPro. A shot
right after a club change is captured in full. Shot numbers never repeat within a day.
