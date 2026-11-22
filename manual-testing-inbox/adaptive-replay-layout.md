# Adaptive replay layout, post-shot replay, compare & shortcut map

Branch: `feature/coach-system` (rebased onto master after the ShotLab merge, 088ddbc)
Files changed: `simwatch.py`, `config.json`, `tests/test_adaptive_replay.py`, `docs/SHORTCUTS.md`, `README.md`,
`SETUP-video.md`, `drills/index.html` (Shortcuts button only), `.gitignore`, `tests/test_shotlab_supervisor.py`,
`tests/test_kinovea.py` (unified hotkey table / grid-only reference reloads)

## What to verify

SimWatch now picks the Kinovea layout from the screens (1366x768 rig = `single_small`): Capture records out of
sight, and after each shot the replay pops up as two big panes (DTL | FO) once you have seen the ball land, then
GSPro gets the screen and keyboard back. `Alt+M` ("match up") compares one angle with the reference; `Alt+S`
stays ShotLab show/hide. Window layering, focus,
Kinovea recording while hidden and the timing feel can only be checked on the rig.

## Steps

Setup: GSPro windowed (the single-display rig already is: `windowed_when_projector_off`), cameras on.

1. **Profile.** `python simwatch.py doctor` -> row `video layout` reads
   `single_small - 1 display(s) (1366x768); GSPro display 1366 px wide < 1600; replay 1366x614 at (0,0); Capture hidden: behind`.
   Row `replay vs GSPro window mode` is a WARN mentioning the projector (expected while `gspro_display.windowed`
   is false). Start the rig (`run_simwatch.bat` / `python simwatch.py video`); `simwatch.log` has
   `Video layout: single_small ...`; `python simwatch.py status` prints `Video layout (displays now): single_small ...`
   and a `Replay: auto - 8s after the shot (Driver 9s, Iron 8s, Wedge 6s, Putter no replay), shown 10s` line.
2. **Only two Kinovea windows.** Task Manager shows Kinovea for Capture + LiveReplay only (no Reference). Capture is
   not visible on top of GSPro.
3. **Capture records while hidden - `behind`.** Hit 3 shots (or `Alt+C` 3 times, 10 s apart). Each one produces
   DTL + FO clips in `Swings\Sessions\<today>\` (`NNN_..._DTL.mp4` / `_FO.mp4`) and `logs\clip-ready.log` lines.
4. **Same for `offscreen`, then `minimized`.** In `config.local.json` set `{"video": {"layout": {"capture_hide": "offscreen"}}}`,
   restart SimWatch (`python simwatch.py stop`, then start again), repeat step 3. Then `"minimized"`, repeat.
   Note which methods recorded every swing (write it under Pass criteria / in PRIORITIES). Put back the best one.
5. **Replay timing.** Hit a 7-iron. You should see the full ball flight, landing and GSPro's shot result / metrics
   for about 8 s with nothing covering them; then the replay appears over the top ~80 % of the screen (GSPro's
   bottom data bar still visible), two panes looping in slow motion, for ~10 s, then disappears. Repeat with
   Driver (~9 s) and a wedge (~6 s). A putt: no replay. If the replay covers the landing, note the club and how
   many seconds more you need (`video.replay.delay_by_club`).
6. **GSPro keeps the keyboard.** While the replay shows and right after it hides, use a GSPro key you normally use
   (e.g. change club / aim). GSPro reacts without clicking it first. Click on the replay window once, wait for it
   to hide: GSPro is in front and takes keys again.
7. **Early close.** (Only with `video.replay.dismiss_on_input: true`:) during a replay press any key (after ~2 s): it closes. Hit a shot while a replay shows: it
   closes at once and a new one follows. `Alt+X` closes it. `Alt+K` keeps it open past 10 s; `Alt+K` again
   closes it. `Alt+A` beeps and turns auto replay off (next shot: no replay; `Alt+V` still shows it); `Alt+A` again
   turns it back on.
8. **Compare.** With a My-Go-To clip for the current club category (press `Alt+G` after a good swing if none),
   press `Alt+M`: after ~2-4 s a Kinovea window shows `you | My-Go-To` DTL. `Alt+M` again: FO pair. Again: back to
   your DTL | FO. `Alt+R` while comparing reloads the pair with the next reference (a pro with no clips logs
   `Compare DTL: no Rory_McIlroy DTL reference for ... - add one to ...` and beeps low). `Alt+X` closes it.
9. **Shortcut map (one table everywhere).** `Alt+H` shows the grouped map (Replay / Compare / Reference /
   Session / System) on top of GSPro, without GSPro losing the keyboard, and it hides itself after ~15 s.
   `python simwatch.py keys` prints the same map; hovering ShotLab's `⌨ Alt+H shortcuts` pill lists the same keys
   and descriptions (incl. `Alt+M` compare and `Alt+S` ShotLab); the drills hub (bridge running) **Shortcuts**
   button top-right shows the same; `docs/SHORTCUTS.md` matches. No key appears twice.
   Final map: Alt+V replay now, Alt+K hold, Alt+X dismiss, Alt+A auto on/off, Alt+L / Alt+Shift+L lines,
   Alt+M compare, Alt+R reference, Alt+G bookmark, Alt+C manual capture, Alt+O folder, Alt+D drills,
   Alt+H map, Alt+S ShotLab, Alt+P PiP.
9b. **Alt+S is still ShotLab.** With GSPro focused press `Alt+S`: ShotLab comes to the front (no compare window
   opens); again: ShotLab minimizes and GSPro has the keyboard.
10. **Hotkey registration.** `simwatch.log` has `Hotkeys: N registered, M failed` and, for Alt+G, a line
    `Could not register hotkey Alt+G (bookmark_goto): another program already uses it. Ctrl+Alt+G works instead. Free alternative: ...`.
    `Ctrl+Alt+G` bookmarks. `doctor` (while SimWatch runs) lists the same under `hotkey registration`; on the HUD
    Alt+G is red, and ShotLab's Keys pill shows Alt+G as `use Ctrl+Alt`. Check the new keys `Alt+V/K/X/A/M`
    registered (not in the failed list).
11. **Projector / dual (if available).** Turn the projector on. Within ~5 s the log says `Video layout: dual ...`;
    GSPro is on the projector, the laptop screen shows LiveReplay full-screen (DTL | FO) permanently, refreshed
    after each shot. Turn the projector off: back to `single_small` and the replay times out normally.
12. **Club changes never reload a missing Reference window.** In `single_small`, change clubs in GSPro a few
    times (Driver -> 7I -> PW): `simwatch.log` shows `Active club changed -> ...` but no Kinovea relaunch, and no
    Reference window appears. Then set `{"video": {"layout": {"profile": "grid"}}}` in `config.local.json`,
    restart, and scroll quickly through clubs with `I`/`K` and stop on a wedge: the Reference window relaunches
    ONCE (~1.5 s after you stop) with wedge clips. Hit a shot within a second of a club change: it still records
    (the trigger never waits for the reload). Run `python simwatch.py stop` right after a club change: no Kinovea
    window relaunches afterwards.

## Pass criteria

- Profile `single_small` on 1366x768, `dual` with the projector on, shown in log/status/doctor.
- Every swing records with the chosen `capture_hide` method (record which of behind / offscreen / minimized work).
- Landing + metrics visible before the replay for Driver/Iron/Wedge; no replay for putts.
- GSPro accepts keyboard input after every replay without clicking it; GSPro never minimizes.
- `Alt+M` cycles DTL pair -> FO pair -> normal replay; `Alt+S` toggles ShotLab only; HUD / `keys` / ShotLab pill /
  drills hub show the same map; grid-only reference reloads are debounced and never block a shot; failed
  keys are reported with a working alternative.
