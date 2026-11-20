# SimWatch — Golf Sim Connection Watchdog

SimWatch keeps a Bushnell Launch Pro → GameChanger → GSPconnect → GSPro simulation chain alive on Windows, and rebuilds it in order when a link drops:

**Launch Pro ⇄ GameChanger → GSPconnect (:921) → GSPro (:9050)**

**GameChanger owns the live connection to the Launch Pro.** It auto-discovers and connects to the device by itself, no clicking needed — it just needs port `9970` free. FSX Pro is Foresight's own app and is **not** part of this chain; it is only used for setup/testing (firmware updates, calibration). See [FSX Pro vs GameChanger](#fsx-pro-vs-gamechanger) below — two apps fighting over the same device connection is what breaks things.

Everything in SimWatch is plain Windows scripting (Win32 API calls, `PrintWindow` pixel reads, `psutil` process/socket inspection, sockets, and `pywinauto`, with `SetProcessDpiAwareness(2)` for accurate coordinates on scaled displays). No AI is involved at runtime.

---

## Requirements & Setup

- **OS:** Windows (uses Win32 APIs, `winsound`, and Task Scheduler)
- **Python:** 3.10+ (3.11+ recommended). Core packages in `requirements.txt` (`psutil`, `pywinauto`, `pywin32`, `Pillow`); optional ball detection / swing tracing in `requirements-video.txt` (`opencv-python`, `numpy`).

**Fresh machine:** follow [`SETUP.md`](SETUP.md). The short version:
```powershell
setup.bat                      # creates .venv, installs deps, runs doctor, offers autostart
python simwatch.py doctor      # PASS/WARN/FAIL table: config, exe paths, ports, task, device link, power, firewall
python simwatch.py harden      # dry-run plan to harden the Launch Pro link (static IP, power, firewall); --apply (elevated) runs it step by step
```

Machine-specific paths go in `config.local.json` (gitignored; overlays `config.json`, see `config.local.example.json`). `python simwatch.py discover --write-local` detects exe paths and writes it for you.

`config.json` is validated on load: `watch`/`startup` refuse to start on errors (unknown app keys, unknown check types, bad recovery references) instead of failing silently later. Exe paths are machine-specific — check them in `doctor` output.

> **Admin privileges:** Run from an **Administrator** terminal (or use `install_autostart.bat`, which schedules with highest privileges) if any sim app runs as admin. Windows blocks UI clicks and window automation across privilege levels.

---

## Health Checks & Recovery

### Configured Checks (`config.json`)

| Check Name | Type | What it verifies | Default Recovery Level |
|---|---|---|---|
| `Integrator running` | `process` | `GameChanger.exe` is running | 0 |
| `Launch Pro reachable` | `device_ping` | Pings the Launch Pro (`169.254.6.44`) | 0 |
| `GameChanger device session` | `device_tcp` | `GameChanger.exe` holds an established TCP session to Launch Pro IP or ports `9970`/`9971` (reports `wired` vs `wifi`) | 0 |
| `GSPro OpenConnect` | `gspro_link` | Established TCP connection on OpenConnect port `:921` | 0 |
| `GSPconnect to GSPro` | `bridge_link` | `GSPconnect.exe` holds an established TCP connection to GSPro on `:9050` (this hop can break while `:921` still looks fine) | 1 |
| `GSPconnect responding` | `responsive` | `^APIv1 Connect$` window exists and is pumping messages (`IsHungAppWindow` is false) | 0 |
| `GameChanger responding` | `responsive` | `^Game ?Changer` window exists and is pumping messages (`IsHungAppWindow` is false) | 0 |

`simwatch.py` also supports additional check types for custom configurations:
- `usb`: checks `Get-PnpDevice` via PowerShell for a matching `name_like` device with status `OK`.
- `indicator`: captures a window via `PrintWindow` and checks whether a pixel region (`dx`, `dy`, `radius`) looks green (use `python simwatch.py calibrate` to generate the config snippet).
- `text`: searches UIA descendant text in a window for `healthy_text_re`.

### Escalating Recovery

A check must fail `fail_threshold` (default `3`) times in a row (checked every `interval_sec`, default `5` s) before recovery triggers. Recovery escalates from the lowest suggested `recovery_level` of the failing checks, stepping up one level on subsequent failure cycles:

| Level | Name | Apps Restarted (stopped in reverse order, started in listed order) |
|---|---|---|
| 0 | `restart GSPro Connect + GameChanger` | `gspro_connect`, `integrator` |
| 1 | `restart GSPro and the chain behind it` | `gspro`, `gspro_connect`, `integrator` |

- Whenever `integrator` is in the restart list, SimWatch first runs `fsx_disconnect` as a safety net so FSX Pro cannot hold port `9970`.
- After restarting, SimWatch waits `settle_sec` (default `15` s) before resuming checks.
- If all recovery levels fail, SimWatch sounds 3 alert beeps, logs an error, backs off for `giveup_backoff_sec` (`300` s / 5 minutes), and resets to level 0.
- **Gating & Pausing:** The `watch` loop idles unless `only_when_running` (`GSPro.exe`) is running, and pauses whenever a file named `PAUSE` exists next to `simwatch.py` (a PAUSE older than `pause_max_hours`, default 4, is ignored and deleted).

---

## FSX Pro vs GameChanger

Both apps can connect directly to the Launch Pro's SDK port (`9970`). FSX Pro has an **"Auto connect with solo device"** toggle in **Settings › Devices** that, if left on, grabs the connection as soon as FSX Pro starts — causing GameChanger to be refused and sit disconnected.

**One-time manual fix:** Open FSX Pro → device icon (top-left) → **Settings › Devices** → turn **"Auto connect with solo device" OFF**. With it off, FSX Pro never touches the device unless you ask it to.

If you need FSX Pro's own live connection (e.g. for firmware updates or calibration):
```powershell
python simwatch.py reconnect         # connect FSX Pro to the Launch Pro (takes it from GameChanger)
python simwatch.py release-device    # disconnect FSX Pro so GameChanger can reconnect
```
Automatic recovery never closes or clicks FSX Pro. While FSX Pro holds the Launch Pro, the watchdog logs it and
leaves FSX Pro and GameChanger alone (no GameChanger restarts) until you run `release-device` or close FSX Pro.

---

## GSPro Launch Dialog & Projector

When GSPro starts, it shows its **GSPro Configuration** Unity dialog. SimWatch (`gspro_configure`) fills it in and clicks **Play!**:

- **Projector detection:** Windows only reports a second display while the projector is connected and awake. If more than one display is detected, the projector is treated as **ON**, and GSPro is placed **full screen on the leftmost display** (`projector.side: "left"`), at the largest resolution that fits it. Otherwise, it uses **Display 1**.
- Set `projector.match_regex` (matched against the monitor's PnP ID and name, e.g. `"BNQ|EPS|OPT"`) if you ever attach a second *non-projector* monitor.
- `gspro_display.windowed` (default `false` = full screen) controls the **Windowed** checkbox in both modes.
- After clicking **Play!**, `post_start` waits for port `9050` to open (up to `150` s) and sleeps `20` s so GSPro and GSPconnect finish initializing.
- Test display detection anytime with `python simwatch.py displays`.

---

## Driving FSX Pro's Screen (Manual / Diagnostic)

`reconnect` and `release-device` automate FSX Pro's UI by clicking fixed coordinates (in a `1366x768` reference frame scaled to the window) and reading pixels, because FSX Pro is a Unity app without standard UIA controls.

- Path: device icon (top-left) → **Settings › Devices** → **Search** → result tile.
- **Wired vs Wi-Fi detection:** `fsx_tiles()` compares each search result tile's icon against `assets/fsx_icon_wired.png` and `assets/fsx_icon_wifi.png`.
- `reconnect`: tries **wired first**, then Wi-Fi if `device.allow_wifi` is `true`; retries every `device.retry_sec` (`60` s) up to `device.max_attempts` (`5`), then beeps and gives up. If the button is stuck on `Disconnect` with no live session, it forces a disconnect first.
- `release-device`: clicks **Disconnect** if FSX Pro is holding the device.
- **Safety:** Search and Disconnect occupy the exact same button position; SimWatch checks the button's color (`_fsx_button_is_disconnect`) before clicking so it never clicks Disconnect by accident.
- It briefly focuses FSX Pro while clicking, then restores focus to the previous foreground window.

---

## Startup & Autostart

`python simwatch.py startup` performs a cold start after a PC reboot:
1. Waits `startup.boot_delay_sec` (`20` s) for Windows/Wi-Fi/USB to settle.
2. Waits up to `startup.wait_timeout_sec` (`90` s) for the `startup.wait_for` checks (`Launch Pro reachable`) to pass.
3. Launches apps in `startup.order`: `gspro` (runs `gspro_configure` + waits for `:9050`) → `gspro_connect` (only launched if GSPro didn't already spawn `GSPconnect.exe`) → `integrator` (GameChanger, which claims the Launch Pro).
4. Waits `settle_sec` (`15` s), runs a full health check, and enters the `watch` loop.

### How the pieces fit (one front door)

`run_simwatch.bat` is the only thing you need to start. SimWatch owns everything else:

```
Launch Pro → GameChanger → GSPconnect → GSPro          (rig chain: checks + escalating recovery)
                               │ :921 sniffed
                               ▼
              SimWatch bridge :8765  ──►  drills hub (browser)
              (shots, club, context,  ──►  ShotLab desktop app ──► OBS Browser Sources :8766
               rig health events)           ▲
                                            └── supervised by the watchdog (launch / crash relaunch / hang restart)
Kinovea 2x2 + OBS Projector PiP          (video rig, started with GSPro)
```

- **ShotLab** (`shotlab` in `config.json`) starts once GSPro is up and opens behind GSPro without taking focus. If it crashes or hangs, the watchdog relaunches it with backoff (`restart_backoff_sec`). If you close it yourself, it stays closed until the next GSPro session; `python simwatch.py shotlab` reopens it now. A ShotLab started by hand (`run_shotlab.bat`) is monitored but never killed.
- ShotLab is supervised **separately from `checks`**: a ShotLab problem never marks the rig unhealthy or restarts GSPro/GameChanger. Its state is the `shotlab` section of `simwatch_status.json`, and `doctor` reports it.
- The other direction: SimWatch pushes its watchdog verdict over the bridge (`health` SSE event), shown as the **Rig** pill in ShotLab's top bar (Rig OK / recovering / Launch Pro off, with failing checks on hover).

### Autostart on Sign-In

Right-click **`install_autostart.bat`** → **Run as administrator**. This creates a Windows Scheduled Task named `SimWatch` that runs `run_simwatch.bat --no-pause` at logon (`ONLOGON`) with highest privileges (`HIGHEST`) after a 10-second delay.

To remove the scheduled task:
```powershell
schtasks /Delete /TN "SimWatch" /F
```

### One daemon at a time (stop / restart / practice video)

Only one `watch`/`startup`/`video` daemon runs at a time (the `Local\SimWatchSingleton` mutex plus
`simwatch_daemon.json`). A second copy **never kills the running one**:

- A second `watch`/`startup` (e.g. double-clicking `run_simwatch.bat` while the sign-in task is running) prints
  "SimWatch is already running ..." and exits 0.
- **Restart** the background daemon (e.g. after `git pull`): `python simwatch.py stop`, then
  `schtasks /Run /TN SimWatch` (or run `run_simwatch.bat`). `stop` writes `STOP_REQUEST`; the daemon notices it
  within one loop (~5-10 s), shuts the bridge/rig down cleanly and exits 0. If it hasn't exited after 20 s (still
  in its startup sequence, or hung) it is terminated. Either way `run_simwatch.bat` sees `STOP_REQUEST`, logs
  "stopped by simwatch.py stop", deletes it and exits 0, so there is **no** "SimWatch did not start" box, no
  task restart, and the task ends (so `schtasks /Run` works again). This also works from a non-elevated
  prompt against the elevated task.
- After a crash the mutex is gone, so the task's own restart (or the next sign-in) starts normally.
- **Practice video** (`python simwatch.py video` / `run_practice_video.bat`) while the daemon runs: it writes a
  `VIDEO_ON` file and exits 0. The daemon then starts its video rig (Kinovea grid, OBS PiP, hotkeys, :921 shot
  capture) **even without GSPro**, and keeps it on until you run `python simwatch.py video off` (or delete
  `VIDEO_ON`); after that the rig follows GSPro again (Kinovea windows stay open; close them yourself). This works
  even with `video.enabled: false` and with the bridge disabled. `VIDEO_ON` is a request to the *current*
  daemon: a newly started daemon deletes a leftover one. With no daemon running, `video` runs standalone in its
  console as before (Ctrl+C or `simwatch.py stop` ends it).

---

## Helper Batch Scripts

| Script | Purpose |
|---|---|
| `run_simwatch.bat` | Launches `python simwatch.py startup` in the repo directory (cold start + watch loop + video rig). |
| `run_shotlab.bat` | Opens ShotLab by hand (dev/offline use; installs Electron on first run). Not needed day to day, since the watchdog launches it. |
| `run_practice_video.bat` | Practice video (`python simwatch.py video`): Kinovea rig (adaptive layout + replay) + hotkeys without GSPro. If the background daemon is running it asks that daemon to start its rig (until `simwatch.py video off`) instead of starting a second copy. |
| `open_drills.bat` | Opens the offline Golf Drills, Routines & Daily Delivery Hub webpage (`drills/index.html`). |
| `install_autostart.bat` | Registers the `SimWatch` Task Scheduler job to run `run_simwatch.bat` at logon as admin. |
| `reconnect_sim.bat` | Manual/diagnostic: runs `python simwatch.py reconnect` to attach FSX Pro to the Launch Pro. |
| `release_device.bat` | Runs `python simwatch.py release-device` to disconnect FSX Pro so GameChanger can reconnect. |

---

## Video Coaching Rig: Adaptive Kinovea Layout, Post-Shot Replay, OBS Projector PiP & Swing Library

> Camera placement, Kinovea 2025.2 install and one-time settings: see [SETUP-video.md](SETUP-video.md). Kinovea 2024.1 still works as a legacy fallback (`video.kinovea_backend`).

SimWatch pairs with **Kinovea** and **OBS Studio** without USB camera conflicts: **Kinovea owns both USB cameras directly** (`DTL` and `FO` at full camera FPS), while **OBS captures Kinovea's LiveReplay window** when the projector is on.

### Adaptive Layout & Post-Shot Replay (default)
SimWatch picks the Kinovea layout from the connected displays when the video rig starts and again whenever they
change (projector on/off, resolution), logs it (`Video layout: ...`) and shows it in `status` and `doctor`.
Four Kinovea panes on one small screen were too small to see, so the default never shows four panes:

| Profile (`video.layout.profile`) | When (`auto`) | What you see |
|---|---|---|
| `single_small` | one display narrower than `large_min_width` (1600), e.g. the 1366x768 rig | GSPro owns the screen. After each shot the replay pops up as **2 large panes (DTL \| FO)** over the top 80 % of the screen (GSPro's bottom data bar stays visible), then goes away. |
| `single_large` | one display at least 1600 px wide | Same flow, replay over the top-centre 75 % x 65 %; optional always-on corner strip (`profiles.single_large.strip`). |
| `dual` | two or more displays | GSPro on the projector/TV (same choice as `choose_display`), the other screen is a **dedicated replay screen** (DTL \| FO of the last swing, always on). |
| `grid` | only when set explicitly | The old 2x2 grid (LiveReplay top, Reference bottom). |

- **Capture keeps recording out of sight:** `video.layout.capture_hide` = `behind` (default: parked below GSPro on
  GSPro's display, still a normal open window), `offscreen` (moved right of every display) or `minimized`.
  Whether Kinovea 2025 keeps recording while minimized has to be checked on the rig, so `behind` is the default.
- **Replay timing (`video.replay`):** after a shot SimWatch stays on GSPro for `delay_sec` so you see the ball land and
  read the shot result, then shows the replay for `show_sec` (10 s = about one loop of the 4.5 s clip at 50 %
  speed), then hands the keyboard back to GSPro. Per club category (`delay_by_club`): **Driver 9 s, Iron 8 s, Wedge
  6 s, Putter no replay**; unknown club 8 s; `Alt+C` manual trigger 4 s. If the clip isn't saved yet at show time it
  waits up to `clip_wait_sec` more. A new shot or `Alt+X` closes it early (opt-in `dismiss_on_input: true` also closes it on any key/mouse
  input after the first 1.5 s, including a bumped mouse); `Alt+K` keeps it open; `Alt+A` turns auto replay off/on
  (`Alt+V` always works). The replay loops at `video.replay_speed_pct` (Kinovea LiveReplay's own setting).
- **GSPro focus:** replay windows are shown without activation (`SWP_NOACTIVATE`); if a Kinovea window still took
  the foreground, SimWatch gives it back to GSPro (only from Kinovea/SimWatch, never from an app you switched to).
  **Run GSPro windowed/borderless** (`gspro_display.windowed: true`): a window over exclusive-fullscreen GSPro can
  minimize it, and `doctor` warns when auto replay is on and GSPro isn't windowed.
- **Compare (`Alt+M`, "match up"):** cycles **DTL: you \| reference -> FO: you \| reference -> back to your DTL \| FO**. The
  reference is the active one (`Alt+R` cycles My-Go-To -> pros -> your previous swing; pressing it while comparing
  reloads the comparison). It uses its own Kinovea window, `Compare`, loaded with the two files; each step takes
  ~2-4 s because Kinovea can only load files into a window when it starts. With no reference clip for the club
  category it says where to put one instead of comparing you with yourself.
- The `Reference` Kinovea window is only launched for the `grid` profile. There, a GSPro club change reloads it for the
  new club category once the club has been stable for `video.club_reload_debounce_sec` (1.5 s, so scrolling
  through clubs relaunches Kinovea once), on a background thread: a shot right after a club change is never
  delayed, and no reload runs after SimWatch stops. Other profiles have no Reference window to reload.

### 2x2 TV Layout (`video.layout.profile: "grid"`)
- **Top Half (`LiveReplay`):** Side-by-side **My DTL** + **My FO** auto-replaying your most recent swing at 50% speed (`IsReplayWatcher`). (`Capture` records from both USB cameras in the background.)
- **Bottom Half (`Reference`):** Side-by-side **Pro** or **My Go-To** DTL + FO swings, automatically matched to your active club category (`Driver`, `Iron`, or `Wedge`).

### OBS Studio Projector Picture-in-Picture (PiP)
When playing on the projector:
1. Run `python simwatch.py obs-setup` once to generate `Swings/OBS_SimWatch_SceneCollection.json`.
2. In OBS Studio: **Scene Collection › Import** `OBS_SimWatch_SceneCollection.json`, then right-click the preview › **Windowed Projector (Preview)**.
3. Whenever a shot lands (via OpenConnect `:921`; Kinovea 2025+ records on SimWatch's UDP trigger, the audio trigger is off), SimWatch pops the borderless OBS PiP onto the corner of your projector for **12 seconds** (`video.projector_pip.popup_seconds`) and then automatically hides it so your view is unobstructed when aiming. Press **`Alt+P`** anytime to bring it back and pin/unpin it.

### Single Organized Swing Library (`Swings/`)
```text
Swings/
├── Sessions/
│   └── YYYY-MM-DD/
│       ├── DTL/                        # Live DTL clips watched by Kinovea
│       ├── FO/                         # Live FO clips watched by Kinovea
│       ├── 001_7I_168y_118mph_DTL.mp4  # Auto-named by OpenConnect shot data
│       └── 001_7I_168y_118mph_FO.mp4
├── My-Go-To/
│   ├── Driver/                         # Bookmarked via Alt+G or `bookmark`
│   ├── Iron/
│   └── Wedge/
├── Pros/
│   ├── Rory_McIlroy/                   # Drop Driver_DTL.mp4, Driver_FO.mp4, Iron_DTL.mp4, etc.
│   ├── Tiger_Woods/
│   └── Tommy_Fleetwood/
└── Workspaces/                         # Auto-generated Kinovea .xml workspaces
```

### Automatic & Draggable Swing Plane Lines (Kinovea `.kva`)
SimWatch automatically pairs captured DTL and FO clips (plus `My-Go-To/` clips) with Kinovea 2.0 `.kva` sidecars set to `AlwaysVisible`, using Frame-0 ball detection (OpenCV when installed, otherwise calibrated template defaults in `Swings/Workspaces/swing_lines_template.json`) and GSPro's active club category (`Driver` ~48°, `Iron` ~60°, `Wedge` ~64°):

- **DTL Suite:** **V-Slot** (`Shaft Plane` + parallel `Shoulder Plane` offset `+8°` from the ball), **Tush Line** (vertical pelvis depth wall), and **Spine & Head** (posture tilt & head height).
- **FO Suite:** **Head Box** (sway circle), **Lead Hip Wall**, **Trail Hip Wall**, and **Ball Line** (vertical ball reference).
- **Hybrid Drag Calibration + Custom Kinovea Tools:** SimWatch installs custom posture tools (`Golf_DTL_VPlane.xml` & `Golf_FO_Box.xml`) into `<Kinovea install dir>\DrawingTools\Custom\` (needs admin once; SimWatch logs the exact step if it can't write there), and lets you drag any endpoint directly inside Kinovea, save (`Ctrl+S`), and press **`Alt+Shift+L`** (or `python simwatch.py save-lines`) so future swings match your exact mat & camera setup.

### Global Hotkeys & On-Screen Shortcut Map
All shortcuts are defined once (`HOTKEY_ACTIONS` in `simwatch.py`: action, default key, group, description;
overridable per action in `config.json` -> `video.hotkeys`, `""` turns one off, a list gives aliases) and every view
renders that one table:
- **`Alt+H` on the rig** pops the grouped map up over GSPro (top-centre, auto-hides after `video.hud_seconds`). A key
  another app has already claimed is shown in red.
- **ShotLab's `⌨ Alt+H shortcuts` pill** (top bar): hover it to see the list with live registration state
  (`/api/status` -> `hotkeys`).
- **`python simwatch.py keys`** (or `hotkeys`, which also pops up the HUD) prints the map, including which keys the
  running SimWatch actually registered; the console / `simwatch.log` prints it each time hotkeys are registered.
- [docs/SHORTCUTS.md](docs/SHORTCUTS.md) (`python simwatch.py keys md` regenerates it), the bridge's
  `/api/shortcuts` and the drills hub's **Shortcuts** button.

Hotkeys are live while SimWatch's video rig runs (`video.enabled`).

| Group | Shortcut | Action |
|---|---|---|
| Replay | `Alt+V` | Show the last swing replay now |
| Replay | `Alt+K` | Keep the replay open (again: close) |
| Replay | `Alt+X` | Close the replay / comparison, back to GSPro |
| Replay | `Alt+A` | Auto replay after each shot on/off |
| Replay | `Alt+L` / `Alt+Shift+L` | Toggle swing plane lines (and apply missing `.kva` sidecars) / save dragged lines as default |
| Compare | `Alt+M` | **M**atch up with the reference: DTL you \| ref -> FO you \| ref -> back |
| Reference | `Alt+R` | Next reference (My-Go-To -> pros -> previous swing) |
| Session / Bookmark | `Alt+G` | Save last swing as My-Go-To (`Swings/My-Go-To/<ClubCategory>/`) |
| Session / Bookmark | `Alt+C` / `Alt+O` / `Alt+D` | Manual capture / open today's folder / open drills hub |
| System | `Alt+H` | Shortcut map HUD |
| System | `Alt+S` | **ShotLab**: bring it to the front; press again to minimize it (GSPro gets focus back). Opens it if closed. |
| System | `Alt+P` | Pin / unpin the OBS projector PiP |

Keys are `Alt+<letter>` because GSPro uses many single-letter keys; every plain `Alt+<key>` also answers to
`Ctrl+Alt+<key>`. A key another program already owns is logged at startup with a free alternative
(`Could not register hotkey Alt+G (bookmark_goto): ... Ctrl+Alt+G works instead. Free alternative: ...`), shown in
red on the HUD and in ShotLab's pill, and listed by `doctor` ("hotkey registration"). `doctor` also flags duplicates,
bare keys, `Alt+Enter` (GSPro's fullscreen toggle) and other risky combinations.

---

## Golf Drills, Routines & Daily Delivery Hub (`drills/`)

Open `drills/index.html` directly (or double-click `open_drills.bat`, run `python simwatch.py drills`, or press **`Alt+D`**) for an offline interactive drill & practice workspace:

- **3 Session Modes:** Switch between **Real Balls** (full sim & GSPro metrics), **Almost Golf Balls (Kids Asleep)** (silent start-line & strike routines), and **Gym-Sore / Recovery** (mobility + slow-mo Kinovea rehearsals).
- **Keyboard & Arrow Navigation:** Use **`←` / `→`** (or Next/Prev Drill buttons) to step through drills and **`↑` / `↓`** (or Prev/Next Section buttons) to jump sections.
- **Shorts & Coaching Write-Ups:** Plays local `.mp4` shorts from `drills/shorts/` (or linked YouTube Shorts) alongside animated biomechanical diagrams, **The Why**, step-by-step instructions, and **Kinovea DTL/FO checkpoints**.
- **Swing Checklist (`✅ Swing Checklist`):** Per-phase swing cues (setup to finish) with a daily check, a "My Focus" star list, DTL/FO checks, an "Am I standing up?" Kinovea guide, drill chips that jump into the Drill Deck, your own custom items, and fullscreen **Pre-shot cards** for the hitting mat. Included in backup export/import.
- **Goals & Daily Delivery Chart:** Log daily delivery check-ins (`Met`, `Partial`, `Gym-Sore Recovery`, `Missed`) across all three ball modes with a **30-day SVG delivery chart**, **91-day consistency heatmap**, streak tracking, and JSON export/import backup.
- **GSPro Courses, Drill Playgrounds & Historical Rounds (`⛳ GSPro Courses & Rounds`):** Browse all **66** installed GSPro courses categorized by what you are looking for (`Drills, Range & Playgrounds`, `Short Courses & Par 3s`, `Kids Asleep / Almost (<125y)`, `Forgiving & Confidence`, `Bucket-List Majors & Tour`, `Links, Coastal & Dunes`, `Mountain, Desert & Altitude`, `Fantasy, Wild & Group Fun`), plus **9** saved `.crd` custom practice rounds (`C:\GSProV1\Core\GSP\CustomRounds`) and built-in **Par 3 / Junior tee** filters. Includes an unrestricted-date **Historical & Sim Round Logger** with smart Par auto-fill (including Par 3 tees -> Par 54/27), bulk CSV/JSON paste & file import, CSV export, per-course stats (`Plays`, `Best`, `Avg`, `Last`), and a **Score vs. Par Trend SVG Chart**.

---

## Shot-Data Bridge (drills hub auto-scoring)

`watch`, `startup` and `video` also start a small local server (stdlib only, bound to `127.0.0.1`) that
records every shot the OpenConnect (:921) sniffer sees and serves it to `drills/index.html`.

- **Storage:** one JSON line per shot in `Swings/Sessions/YYYY-MM-DD/shots.jsonl`: `ts` (local ISO-8601 with
  offset), `shot_num` (day-unique sequence; also the `NNN_` of clip names), `device_shot_num` (the launch
  monitor's ShotNumber, which can reset mid-day), `club`, `ball` {speed, carry, total, hla, vla, spin,
  spin_axis}, `club_data` {speed, path, face, aoa} or null, `clip` (session clip filename once Kinovea's
  recording is saved; DTL preferred), `clips` {DTL, FO} and `drill_id`. Anything the launch monitor didn't
  send is `null`. Linking a clip rewrites that day's file atomically, under a lock file (`.shots.lock`)
  shared by the watchdog and Kinovea's `clip-ready` command, so neither can drop the other's write.
- **Shot detection:** OpenConnect heartbeats and messages with `ContainsBallData: false` are ignored; the
  same shot re-sent within 30 s (same ShotNumber, ball speed, spin and HLA) is recorded once.
- **API** (`http://127.0.0.1:8765`): `GET /api/status`, `GET /api/shots?date=YYYY-MM-DD`, `GET /api/events`
  (Server-Sent Events: `status`, `shot`, `clip` {ts, clip} when a saved clip is linked, 15s heartbeat; max 8
  clients, more get 503; a client that stops reading for 10s is dropped), `POST /api/drill
  {"drill_id": "..."|null}` (sets the active drill; ids are 1-80 chars of `A-Za-z0-9_-`; requires
  `Content-Type: application/json`). `GET /` serves the `drills/` folder only.
- **Browser access:** the `Host` header must be `127.0.0.1` or `localhost` (blocks DNS rebinding; other hosts
  get 421). CORS is never `*`: only `http://127.0.0.1:<port>`, `http://localhost:<port>` and the `null` origin
  (the page opened from `file://`) are allowed, and any other `Origin` gets 403. Requiring JSON on
  `POST /api/drill` forces a CORS preflight, so a cross-site form or `text/plain` post can't change the drill.
  Known residual risk: a hostile web page can also send `Origin: null` from a sandboxed iframe, so it could read
  your shot numbers and set or clear the drill tag. It can't reach any other file or setting. Open the hub
  via `http://127.0.0.1:8765/` instead of `file://` if you care about that.
- **Drill expiry:** the active drill is cleared (and logged) after 60s with no drills page connected to
  `/api/events`, so a closed tab can't tag later shots. A drill set from curl/PowerShell also expires after 60s
  unless an event stream is open.
- **One recorder:** if the port is busy (e.g. `python simwatch.py bridge` is already running), `watch`/`video`
  log "Shot bridge already running in another process ... not recording shots here" and don't write
  `shots.jsonl` themselves. With `video.enabled: false`, `watch` runs its own :921 sniffer for the bridge
  (only while the `only_when_running` app is up).
- While a drill is active its id is stored on each shot and added to clip names as `_D-<id>`.
- **Config:** `"bridge": {"enabled": true, "port": 8765, "sessions_dir": "Swings/Sessions", "lan": false}`. A
  busy port is logged and the watchdog carries on without the bridge.
- **Phone over home Wi-Fi (opt-in, `bridge.lan: true`):** the bridge then listens on all interfaces
  (`0.0.0.0:<port>`). Clients on this PC (127.0.0.1) behave exactly as above, no token. Every other client
  must present the pairing token from `bridge_token.txt` (created on first use, gitignored) on **every**
  request, static files included: pass it once as `?token=...` and the server sets an `HttpOnly;
  SameSite=Strict` cookie (1 year) that the page's fetch/SSE calls then send automatically. Without it: 401.
  For token-authenticated LAN clients the `Host` may be an IP literal or this PC's hostname (`name` or
  `name.<suffix>`) on the bridge port (else 421), and an `Origin`, if sent, must be that same
  `http://<host>:<port>` (else 403). A DNS-rebinding page can't know the token and never receives the
  cookie (it's scoped to the real host), so the localhost protections are unchanged.
  Setup: set `"bridge": {"lan": true}` in `config.local.json`, `simwatch.py stop` + restart, run
  `simwatch.py harden --apply` (adds firewall rule "SimWatch bridge LAN (phone)": inbound TCP `<port>`,
  Private profile, `RemoteAddress LocalSubnet` only; your home Wi-Fi must be a **Private** network), then
  `python simwatch.py phone` prints `http://192.168.x.y:8765/?token=...` (plus a QR code if the optional
  `qrcode` package is installed). `status` and `doctor` print the URL too. Revoke all paired phones: delete
  `bridge_token.txt` and restart. With `lan` back to false, doctor reports a leftover firewall rule as INFO.
  When served over http the drills page talks to `location.origin`; opened from `file://` it uses
  `http://127.0.0.1:8765`.
- **Testing:** `python simwatch.py bridge` runs only the server + sniffer; add `--demo` (optionally
  `--demo-interval 2`, `--port 8766`) to emit a synthetic shot every few seconds. The demo runs on macOS too.
  Demo shots go to `Swings/Sessions-demo/` (`bridge.demo_sessions_dir`), are tagged `"demo": true`, and the
  real :921 sniffer is not started, so demo and real shots never mix.

## Manual Setup & What We Need From You (One-Time Checklist)

### How Auto-Created Swing Plane Lines Work (No Manual Drawing Required)

You **do not** have to draw lines yourself from scratch. Whenever a DTL or FO `.mp4` clip is recorded (or whenever you press **`Alt+L`** / `python simwatch.py lines`), SimWatch automatically creates a `.kva` sidecar file next to the video so all overlays appear immediately in Kinovea:

- **DTL (`4` automatic overlays):**
  - `Shaft Plane` (`48°` Driver, `60°` Iron, `64°` Wedge) anchored automatically at the ball
  - `Shoulder Plane` (`shaft_deg + 8°` forming a V-Slot corridor) anchored at the ball
  - `Tush Line` (vertical posterior wall)
  - `Spine & Head` (address spine angle)
- **FO (`4` automatic overlays):**
  - `Head Box`
  - `Lead Hip Wall`
  - `Trail Hip Wall`
  - `Ball Line`

With **`opencv-python`** installed (`detect_ball_in_mp4`), SimWatch reads Frame 0 of each new clip, finds the golf ball automatically, and snaps `Shaft Plane`, `Shoulder Plane`, and `Ball Line` onto the ball.

- **What "drag and save (`Alt+Shift+L`)" means:** Because your posture lines (`Tush Line`, `Spine & Head`, `Head Box`, `Hip Walls`) are **already drawn on screen**, you only ever need to nudge an endpoint **once** if your fixed camera angle places your body slightly left or right of the default screen position. Open one recorded clip in Kinovea, drag the already-drawn handle onto your actual hip/head position, press **`Ctrl+S`** inside Kinovea, and press **`Alt+Shift+L`** (`python simwatch.py save-lines`). That updates `Swings/Workspaces/swing_lines_template.json` so every future clip spawns all lines in your exact stance spot automatically.
- **1-Click Kinovea Toolbar Tools:** SimWatch also installs `Golf_DTL_VPlane.xml` and `Golf_FO_Box.xml` into Kinovea's Custom Drawing Tools (`<Kinovea install dir>\DrawingTools\Custom\`) so you can stamp either template onto any ad-hoc clip in one click.

---

### One-Time & Optional Items Needed From You

1. **Optional: Install Updated Python Dependencies (`opencv-python`)**
   - Included in `requirements.txt` for automatic Frame-0 golf ball detection (`python -m pip install -r requirements.txt`). Without `opencv-python`, SimWatch falls back to saved template ball coordinates.
2. **Optional (~60 seconds): One-Time Posture Line Calibration (`Alt+Shift+L`)**
   - Record one swing -> inspect the auto-generated lines in Kinovea -> if the `Tush Line`, `Spine & Head`, `Head Box`, or `Hip Walls` sit slightly off your stance for your camera angle, drag their handles onto your body -> press **`Ctrl+S`** in Kinovea -> press **`Alt+Shift+L`**.
3. **Promote Your First "Go-To" Swings (`Swings/My-Go-To/`)**
   - `Swings/My-Go-To/Driver/`, `Iron/`, and `Wedge/` start empty. After hitting a pure swing (GSPro OpenConnect automatically tracks your active club), press **`Alt+G`** (or run `python simwatch.py bookmark [Driver|Iron|Wedge]`) to copy your latest DTL + FO clips into `Swings/My-Go-To/<Club>/` as your permanent reference benchmark.
4. **Optional: Drop In Pro Reference Videos (`Swings/Pros/`)**
   - `Swings/Pros/Rory_McIlroy/`, `Swings/Pros/Tiger_Woods/`, and `Swings/Pros/Tommy_Fleetwood/` exist on disk and start empty (`My-Go-To` / `Pros` fall back to today's session clips in `Reference.xml` until populated). Drop `.mp4` clips using these exact names and press **`Alt+R`** (`python simwatch.py reference [name]`) to cycle references:
     - `Driver_DTL.mp4`, `Driver_FO.mp4`
     - `Iron_DTL.mp4`, `Iron_FO.mp4`
     - `Wedge_DTL.mp4`, `Wedge_FO.mp4`
5. **Optional: Add Local Drill Short Videos (`drills/shorts/`) or YouTube Shorts**
   - All 14 drills in `drills/index.html` work immediately offline with built-in animated SVG biomechanical diagrams. To show video clips instead, either drop `.mp4` files matching `drills/shorts/README.txt` (`01_mobility_setup.mp4` through `14_driver_startline.mp4`) into `drills/shorts/`, or paste any YouTube Short URL inside the **`➕ Add / Edit Drill`** tab (`Alt+D`).
6. **Optional (If Using `Alt+P` Projector PiP): One-Time OBS Studio Import**
   - Open OBS Studio -> `Scene Collection` -> `Import` -> choose `Swings/OBS_SimWatch_SceneCollection.json` -> switch to **`SimWatch PiP`** -> right-click the preview canvas -> **`Windowed Projector (Preview)`**. Once open, **`Alt+P`** automatically shows, hides, and docks the projector PiP on your projector.
7. **Optional: Log or Bulk-Import Past GSPro Rounds**
   - Press **`Alt+D`** -> **`⛳ GSPro Courses & Rounds`** and use the **Historical & Sim Round Logger** or **`📥 Bulk CSV / Paste Import`** to bring in past rounds.

---

## Configuration (`config.json`)

- **Top-level:**
  - `interval_sec` (`5`): seconds between check cycles in `watch`.
  - `fail_threshold` (`3`): consecutive failed cycles before triggering recovery.
  - `settle_sec` (`15`): wait time after `startup` or `recover` before checking again.
  - `post_recover_grace_sec` (`35`): extra discovery grace window after `startup` / `recover` while GameChanger establishes its Launch Pro TCP session.
  - `giveup_backoff_sec` (`300`): sleep duration after all recovery levels fail.
  - `only_when_running` (`"GSPro.exe"`): process name required for `watch` to run checks.
- **`device`:** `ip` (`"169.254.6.44"`), `port` (`9970`), `retry_sec` (`60`), `max_attempts` (`5`), `allow_wifi` (`true`), `close_settings` (`false`).
- **`projector`:** `match_regex` (`null`), `side` (`"left"` or `"right"`).
- **`gspro_display`:** `windowed` (`false`), `borderless_when_pip` (`true`), `windowed_when_projector_off` (`true`), `suppress_focus_when_green` (`true`).
- **`video`:** `enabled`, `swings_dir`, `kinovea_exe`, `obs_exe`, `dtl_camera`, `fo_camera`, `replay_speed_pct`, `pre_trigger_sec`, `post_trigger_sec`, `default_reference`, `pros`, `projector_pip`, `swing_lines` (including `auto_detect_ball` & `auto_trace_path`), `layout` (`profile`, `large_min_width`, `capture_hide`, `replay_hide`, `display_poll_sec`, per-profile `profiles`), `replay` (`mode`, `delay_sec`, `delay_by_club`, `show_sec`, `manual_delay_sec`, `clip_wait_sec`, `dismiss_on_input`, `input_grace_sec`, `cancel_on_club_change`, `restore_focus`), `hud_seconds`, `hotkeys`.
- **`apps`:** list of managed apps (`fs_connector`, `integrator`, `gspro_connect`, `gspro`) with `key`, `process`, `exe`, `window_title_re`, `start_timeout_sec`, `start_wait_sec`, optional `args` / `start_no_activate` / `ensure_actions`, and `post_start` actions (`gspro_configure`, `wait_port`, `wait`, `click_button_re`, `click_at`, `fsx_connect`).
- **`checks`:** list of health checks and their `recovery_level` (checks marked `"device": true` are capped at Level 0 and skipped when `device_ping` indicates the hardware is off/asleep).
- **`recovery`:** ordered list of escalation levels (`name` and `restart` app keys).
- **`startup`:** `boot_delay_sec`, `wait_for`, `wait_timeout_sec`, and `order`.

---

## CLI Commands

All commands accept an optional `--config <path>` flag (defaults to `config.json` next to `simwatch.py`).

```powershell
python simwatch.py doctor                # validate config, paths, ports, task, device link, power, firewall (exit 1 on FAIL)
python simwatch.py check                 # run every health check once and print results
python simwatch.py watch                 # watch forever, escalate recovery, and run video rig
python simwatch.py startup               # cold start everything in order, then watch
python simwatch.py stop                  # ask the background daemon to exit cleanly (forced after 20 s)
python simwatch.py recover [level]       # run one recovery level now (default 0)
python simwatch.py displays              # show detected displays and projector decision
python simwatch.py video [off]           # Kinovea rig (adaptive layout) + hotkeys, no GSPro; hands off to a running daemon (VIDEO_ON)
python simwatch.py status                # bridge status, today's shots, daemon + VIDEO_ON state, video layout/replay, phone URL, log tail
python simwatch.py keys [md]             # print the grouped shortcut map; `md` regenerates docs/SHORTCUTS.md
python simwatch.py phone                 # drills-hub URL (with pairing token) for a phone on your Wi-Fi (bridge.lan)
python simwatch.py drills                # open the local Golf Drills & Daily Delivery Hub
python simwatch.py bridge [--demo]       # run only the shot-data bridge (:8765) + :921 sniffer
python simwatch.py shotlab               # open ShotLab now (or focus it); the watchdog adopts it
python simwatch.py obs-setup             # generate Swings/ layout, workspaces & OBS scene JSON
python simwatch.py lines [apply|on|off|toggle]  # apply or toggle Kinovea swing plane .kva lines
python simwatch.py save-lines [club]     # save dragged .kva line coords as the new default
python simwatch.py bookmark [club]       # save latest DTL + FO clips to Swings/My-Go-To/
python simwatch.py reference [name]      # switch the active reference (My-Go-To, a pro, Last-Swing) used by compare / grid
python simwatch.py hotkeys               # print the shortcut map & show the HUD (until Ctrl+C)
python simwatch.py reconnect             # manual: connect FSX Pro to the Launch Pro
python simwatch.py release-device        # disconnect FSX Pro so GameChanger can reconnect
python simwatch.py discover              # list golf/video processes, TCP ports, and windows
python simwatch.py dump "<title regex>"  # print UIA controls for a matching window
python simwatch.py calibrate             # hover over a green status light -> indicator config snippet
```

---

## Repository Layout & Logging

- `simwatch.py` — main watchdog, UI/display automation, Kinovea/OBS/Shot rig, and CLI entrypoint
- `config.json` — apps, checks, recovery levels, device, projector, and video settings
- `requirements.txt` / `requirements-video.txt` / `requirements-dev.txt` — core, optional OpenCV, and test dependencies
- `setup.bat`, `_find_python.bat` — one-shot install and shared Python discovery used by every launcher
- `SETUP.md` — fresh-machine install checklist
- `tests/` — pytest suite (`python -m pytest`; runs on any OS)
- `drills/tools/validate_data.js` — `node drills/tools/validate_data.js` checks drill/course data integrity
- `manual-testing-inbox/` — what still needs a human pass on the Windows rig (`PRIORITIES.md`)
- `assets/fsx_icon_wired.png`, `assets/fsx_icon_wifi.png` — reference icons for FSX Pro tile matching
- `run_simwatch.bat`, `run_practice_video.bat`, `open_drills.bat`, `install_autostart.bat`, `reconnect_sim.bat`, `release_device.bat` — Windows helper scripts
- `drills/` — offline Golf Drills, Routines & Daily Delivery Hub (`index.html`, `drills_data.js`, `shorts/`)
- `Swings/` — organized session recordings, `My-Go-To/`, `Pros/`, `Workspaces/`, and `OBS_SimWatch_SceneCollection.json`
- `simwatch.log` — rotating runtime log file (UTF-8, level + thread name per line, full tracebacks, max 2 MB × 3 backups)
- `logs/clip-ready.log` — Kinovea's post-recording `clip-ready` runs (separate file: two processes can't share one rotating log on Windows)
- `simwatch_status.json` — rewritten every cycle: `timestamp`, `state` (`healthy`, `degraded`, `recovering`, `device_offline`, `backoff`, `paused`, `error`, …), failing checks, recovery level
- `logs/launcher.log` — autostart (`run_simwatch.bat --no-pause`) output; a startup failure also pops a message box instead of closing silently
- `*.bak` — one rolling backup written before SimWatch overwrites Kinovea preferences or the OBS scene collection (only when content changes)

> **Note:** GSPro still opens on its main menu — SimWatch does not select Practice or a course for you.
