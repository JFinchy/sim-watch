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
