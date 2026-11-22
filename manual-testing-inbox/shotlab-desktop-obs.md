# ShotLab v2 Desktop App, Swing DB, Audio Caddie & OBS Studio Overlays

Branch: `JFinchy/continue-shotlab-work`
Files changed: `shotlab/*`, `run_shotlab.bat`, `simwatch.py` (`ShotHub.current_club`, `set_club`, `send_gspro_club_keys`, `POST /api/gspro/club`), `tests/test_shot_bridge.py`, `.gitignore`

## What to verify on the Windows sim rig

All physics, club classifier (including Markov stickiness, partial-swing guard & >=90% calibrated convergence), coach diagnostics (including Quiet Mode), Strokes Gained, SQLite Swing DB, SVG visualizers, Audio Caddie, OBS overlay files, and SimWatch bridge endpoints are covered by automated unit tests (`shotlab/tests/*.test.js` and `tests/test_shot_bridge.py`). Only the Windows rig can verify:
1. `run_shotlab.bat` first-time `npm install` and Electron window launch on Windows 10/11.
2. Live shot flow from **Launch Pro → GameChanger → GSPconnect (:921) → SimWatch Bridge (:8765) → ShotLab Electron App → OBS Studio Browser Sources (:8766)**.
3. Whether `POST /api/gspro/club` (`PostMessage` `WM_KEYDOWN`/`WM_KEYUP` for `I`/`K`) changes GSPro's active club in-game without stealing focus (and if Unity ignores background `PostMessage`, note whether a brief focus/SendInput fallback is needed).
4. Windows Web Audio / Web Speech playback (Audio Caddie + Tour Tempo) and Kinovea video clip playback inside Electron.

## Steps

### Core Launch, Bridge & Club Brain
1. Confirm Node.js 20+ is installed (`node -v`).
2. Start SimWatch as Administrator (`run_simwatch.bat` or `python simwatch.py bridge`) with GSPro + GameChanger running.
3. Double-click `run_shotlab.bat`. Confirm Electron installs (first run only) and the ShotLab desktop window opens with `Bridge :8765 Live` and `:921 Sniffer OK` green pills in the top bar.
4. Change clubs in GSPro (press `I` or `K` in GSPro) and verify the `GSPro:` pill in ShotLab updates live via SSE `club` events.
5. Hit 3–5 shots across 3 different clubs (e.g. Driver, 7-Iron, PW):
   - Verify Shot Shape name + curved flight icon + hover `? Why` rationale make sense for the real flight.
   - Verify Delivery verdict (Compression vs Flipping Floater / Early Cast / Over-Hold) and Clubface Strike Map + "Distance Left on the Table" reflect your strike feel.
   - Click **✓ Confirm** or the actual club button on each shot and confirm calibration stats increment and persist across closing/reopening ShotLab.
   - Hit a 75% knockdown / partial iron shot and verify the **Partial-Swing Guard** labels it as a partial swing instead of misclassifying or auto-switching GSPro.
6. Test **⇄ Sync GSPro** button: select a different club in GSPro (e.g., DR), hit a 7-Iron (or click 7I), then click **⇄ Sync GSPro** and verify whether GSPro steps down to 7I.

6b. **Switch lock:** click **⇄ Sync GSPro** twice quickly. The second click should toast "previous switch still settling" and GSPro must step exactly once to the target (no overshoot).
6c. **Bridge reconnect:** with ShotLab open, stop SimWatch (close its window). Within ~5s the bridge pill should go `Offline`; restart SimWatch and confirm it flips back to `Live` on its own and the next shot arrives. (If SimWatch hangs rather than exits, ShotLab now drops the stream after 45s of no heartbeat.)

6d. **No club read (sticker missed):** peel the club sticker off (or cover it with a finger of tape) and hit 3 shots.
   - The yellow **"No club read"** notice appears above the metric tiles; club speed, smash, path and AoA tiles show `—` with a `NO READ` tag and "no club read".
   - Delivery reads "Launch & Spin On Window" or a fault ending "(ball-flight estimate)", never "Pure Compression". The clubface map shows `?` instead of a strike dot.
   - The shot is graded against the club selected in GSPro, not a guessed one. Auto-Switch does not fire.
   - The session chip shows `Club read 0/3`; with Audio Caddie on, the callout includes "No club read".
   - Check `Swings/Sessions/<today>/shots.jsonl`: those shots have `"club_data": null` (not zeros). If they show zeros with a club speed, note it here: GameChanger is sending something the guard doesn't catch.

### ShotLab v2 Features Checklist
7. **SQLite Swing DB & Patterns (`shotlab/data/swings.sqlite`):**
   - Confirm shots save to `shotlab/data/swings.sqlite` and survive restarting ShotLab.
   - Open the Dispersion / Patterns view: verify the **2D Bird's-Eye Dispersion Plot** shows shot dots, rotated **80% confidence ellipse**, mean crosshair, **DECADE Aim** marker (when lateral bias ≥ 3y), and per-shot / average **Strokes Gained**.
   - Check multi-session **Trend Sparklines** (Score / Smash / Carry / SG / Fault %), **Warmup & Fatigue Curve**, and **14-Club Bag Gapping** table.
8. **Kids-Asleep / Quiet Mode (Almost Golf Balls):**
   - Switch Practice Mode to **Quiet (`almost`)** and hit 3 foam-ball shots.
   - Verify carry, spin, smash, and Strokes Gained are excluded from grading while **Start Line (±1.5° HLA gate)**, **Club Path**, **AoA**, and **Est. Face-to-Path** grade accurately and GSPro Auto-Switch stays paused.
9. **Active Feel Lab & Drills Hub Bridge:**
   - Select an **Active Feel** from the Drills Hub bridge, hit 3+ shots, switch to a second feel, and hit 3+ shots.
   - Confirm **A/B Feel Verdicts** separate and compare Score, Smash, SG, and 80% dispersion width by feel.
   - Trigger 3 repeated fault shots (or via Demo archetypes) and confirm the targeted **Drills Hub** recommendation appears.
10. **Synced Kinovea Video Compare & My-Go-To:**
    - Record a shot with Kinovea DTL + Face-On capture running and verify the clips link to the shot row.
    - Open **Compare vs. Best** side-by-side playback, verify synced scrub/play, and click **Promote to My Go-To** to confirm the benchmark sticks across restarts.
11. **Audio Caddie, Tour Tempo & Mat Glance:**
    - Toggle **Audio Caddie** on and hit 2 shots quickly; confirm R/Y/G grade chime plays and Web Speech reads club/shape/carry/smash/cue without queuing stale callouts. Repeat in Quiet Mode and confirm it speaks start line + path instead of carry/smash.
    - Start **Tour Tempo** (`24/8`, `27/9`, `21/7`, `18/9`) and confirm crisp 3-tone cadence (Takeaway → Top → Impact) and clean stop with zero lingering beeps.
    - Enter **Mat Glance** view and verify key numbers are legible from the hitting mat.
12. **OBS Studio Transparent Overlays (All 9 Widgets):**
    - Test existing widgets (`?widget=hud` `1280×156`, `?widget=compact` `330×420`) and the 3 new v2 widgets in OBS Browser Sources:
      - `?widget=tracer` (`640×360`): verify animated 3D shot tracer draw-in, glowing ball head, fairway grid, and Carry/Apex/Curve/Ball Speed telemetry pill.
      - `?widget=dispersion` (`360×310`): verify translucent dark glass panel, club + shot count, 80% Width (`±Xy`), Avg SG, and 2D dispersion plot.
      - `?widget=ticker` (`1280×48`): verify single-line broadcast bar with `SHOTLAB` badge, session count, Avg Score/Carry/SG, active club, active feel (or practice mode pill), and local DB total swings.
    - Verify 100% transparent outer backgrounds (no dark halo/box corners) and optional `&autohide=12` fade-out.

## Pass criteria

- `run_shotlab.bat` launches cleanly and connects to SimWatch `:8765`.
- Real Launch Pro shots flow end-to-end into ShotLab, `shotlab/data/swings.sqlite`, and all 9 OBS Browser Sources with transparent backgrounds and accurate R/Y/G grading.
- Club calibration (`shotlab/data/state.json`) and SQLite swing history (`shotlab/data/swings.sqlite`) persist across restarts.
- Audio Caddie chimes/speech and Tour Tempo 3-tone cadence play cleanly on Windows speakers/headphones without overlapping or leaking timers.
- Note whether `PostMessage` switches GSPro's club cleanly or if Unity requires foreground focus for `I`/`K`.
