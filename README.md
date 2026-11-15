# SimWatch — Golf Sim Connection Watchdog

SimWatch keeps a Bushnell Launch Pro → GameChanger → GSPconnect → GSPro simulation chain alive on Windows, and rebuilds it in order when a link drops:

**Launch Pro ⇄ GameChanger → GSPconnect (:921) → GSPro (:9050)**

**GameChanger owns the live connection to the Launch Pro.** It auto-discovers and connects to the device by itself, no clicking needed — it just needs port `9970` free. FSX Pro is Foresight's own app and is **not** part of this chain; it is only used for setup/testing (firmware updates, calibration). See [FSX Pro vs GameChanger](#fsx-pro-vs-gamechanger) below — two apps fighting over the same device connection is what breaks things.

Everything in SimWatch is plain Windows scripting (Win32 API calls, `PrintWindow` pixel reads, `psutil` process/socket inspection, sockets, and `pywinauto`, with `SetProcessDpiAwareness(2)` for accurate coordinates on scaled displays). No AI is involved at runtime.

---

## Requirements & Setup

- **OS:** Windows (uses Win32 APIs, `winsound`, and Task Scheduler)
- **Python:** Python 3 with the packages in `requirements.txt`:
  - `psutil`
  - `pywinauto`
  - `pywin32`
  - `Pillow`

Install dependencies:
```powershell
pip install -r requirements.txt
```

> **Admin privileges:** Run from an **Administrator** terminal (or use `install_autostart.bat`, which schedules with highest privileges) if any sim app runs as admin. Windows blocks UI clicks and window automation across privilege levels.

---

## Health Checks & Recovery

### Configured Checks (`config.json`)

| Check Name | Type | What it verifies | Default Recovery Level |
|---|---|---|---|
| `Integrator running` | `process` | `GameChanger.exe` is running | 0 |
| `Launch Pro reachable` | `device_ping` | Pings the Launch Pro (`169.254.6.44`) | 0 |
| `GameChanger device session` | `device_tcp` | `GameChanger.exe` holds an established TCP session to port `9970` (reports `wired` vs `wifi`) | 0 |
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
| 2 | `restart everything` | `fs_connector`, `gspro`, `gspro_connect`, `integrator` |

- Whenever `integrator` is in the restart list, SimWatch first runs `fsx_disconnect` as a safety net so FSX Pro cannot hold port `9970`.
- After restarting, SimWatch waits `settle_sec` (default `15` s) before resuming checks.
- If all recovery levels fail, SimWatch sounds 3 alert beeps, logs an error, backs off for `giveup_backoff_sec` (`300` s / 5 minutes), and resets to level 0.
- **Gating & Pausing:** The `watch` loop idles unless `only_when_running` (`GSPro.exe`) is running, and pauses whenever an empty file named `PAUSE` exists next to `simwatch.py`.

---

## FSX Pro vs GameChanger

Both apps can connect directly to the Launch Pro's SDK port (`9970`). FSX Pro has an **"Auto connect with solo device"** toggle in **Settings › Devices** that, if left on, grabs the connection as soon as FSX Pro starts — causing GameChanger to be refused and sit disconnected.

**One-time manual fix:** Open FSX Pro → device icon (top-left) → **Settings › Devices** → turn **"Auto connect with solo device" OFF**. With it off, FSX Pro never touches the device unless you ask it to.

If you need FSX Pro's own live connection (e.g. for firmware updates or calibration):
```powershell
python simwatch.py reconnect         # connect FSX Pro to the Launch Pro (takes it from GameChanger)
python simwatch.py release-device    # disconnect FSX Pro so GameChanger can reconnect
```
Automatic recovery also calls `fsx_disconnect` before every GameChanger restart as a safety net.

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
3. Launches apps in `startup.order`: `fs_connector` (FSX Pro, not connected to device) → `gspro` (runs `gspro_configure` + waits for `:9050`) → `gspro_connect` (only launched if GSPro didn't already spawn `GSPconnect.exe`) → `integrator` (GameChanger, which claims the Launch Pro).
4. Waits `settle_sec` (`15` s), runs a full health check, and enters the `watch` loop.

### Autostart on Sign-In

Right-click **`install_autostart.bat`** → **Run as administrator**. This creates a Windows Scheduled Task named `SimWatch` that runs `run_simwatch.bat` at logon (`ONLOGON`) with highest privileges (`HIGHEST`) after a 30-second delay.

To remove the scheduled task:
```powershell
schtasks /Delete /TN "SimWatch" /F
```

---

## Helper Batch Scripts

| Script | Purpose |
|---|---|
| `run_simwatch.bat` | Launches `python simwatch.py startup` in the repo directory (cold start + watch loop). |
| `install_autostart.bat` | Registers the `SimWatch` Task Scheduler job to run `run_simwatch.bat` at logon as admin. |
| `reconnect_sim.bat` | Manual/diagnostic: runs `python simwatch.py reconnect` to attach FSX Pro to the Launch Pro. |
| `release_device.bat` | Runs `python simwatch.py release-device` to disconnect FSX Pro so GameChanger can reconnect. |

---

## Configuration (`config.json`)

- **Top-level:**
  - `interval_sec` (`5`): seconds between check cycles in `watch`.
  - `fail_threshold` (`3`): consecutive failed cycles before triggering recovery.
  - `settle_sec` (`15`): wait time after `startup` or `recover` before checking again.
  - `giveup_backoff_sec` (`300`): sleep duration after all recovery levels fail.
  - `only_when_running` (`"GSPro.exe"`): process name required for `watch` to run checks.
- **`device`:** `ip` (`"169.254.6.44"`), `port` (`9970`), `retry_sec` (`60`), `max_attempts` (`5`), `allow_wifi` (`true`), `close_settings` (`false`).
- **`projector`:** `match_regex` (`null`), `side` (`"left"` or `"right"`).
- **`gspro_display`:** `windowed` (`false`).
- **`apps`:** list of managed apps (`fs_connector`, `integrator`, `gspro_connect`, `gspro`) with `key`, `process`, `exe`, `window_title_re`, `start_timeout_sec`, `start_wait_sec`, optional `args` / `ensure_actions`, and `post_start` actions (`gspro_configure`, `wait_port`, `wait`, `click_button_re`, `click_at`, `fsx_connect`).
- **`checks`:** list of health checks and their `recovery_level`.
- **`recovery`:** ordered list of escalation levels (`name` and `restart` app keys).
- **`startup`:** `boot_delay_sec`, `wait_for`, `wait_timeout_sec`, and `order`.

---

## CLI Commands

All commands accept an optional `--config <path>` flag (defaults to `config.json` next to `simwatch.py`).

```powershell
python simwatch.py check                 # run every health check once and print results
python simwatch.py watch                 # watch forever and escalate recovery on failure
python simwatch.py startup               # cold start everything in order, then watch
python simwatch.py recover [level]       # run one recovery level now (default 0)
python simwatch.py displays              # show detected displays and projector decision
python simwatch.py reconnect             # manual: connect FSX Pro to the Launch Pro
python simwatch.py release-device        # disconnect FSX Pro so GameChanger can reconnect
python simwatch.py discover              # list golf-related processes, TCP ports, and windows
python simwatch.py dump "<title regex>"  # print UIA controls for a matching window
python simwatch.py calibrate             # hover over a green status light -> indicator config snippet
```

---

## Repository Layout & Logging

- `simwatch.py` — main watchdog, UI/display automation, and CLI entrypoint
- `config.json` — apps, checks, recovery levels, device, projector, and startup settings
- `requirements.txt` — Python package dependencies
- `assets/fsx_icon_wired.png`, `assets/fsx_icon_wifi.png` — reference icons for FSX Pro tile matching
- `run_simwatch.bat`, `install_autostart.bat`, `reconnect_sim.bat`, `release_device.bat` — Windows helper scripts
- `simwatch.log` — runtime log file (UTF-8, `HH:MM:SS` timestamps) written next to `simwatch.py` alongside console output

> **Note:** GSPro still opens on its main menu — SimWatch does not select Practice or a course for you.
