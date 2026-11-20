# SimWatch setup (fresh Windows 10/11 machine)

Work top to bottom. Every step ends with something you can check. `simwatch.py doctor` is the final gate.

Signal chain: **Launch Pro** (USB-ethernet, 169.254.x link-local, ports 9970/9971) → **GameChanger** → **GSPconnect**
(OpenConnect on `127.0.0.1:921`) → **GSPro** (`:9050`). SimWatch watches the whole chain. A shot bridge on
`127.0.0.1:8765` listens in on `:921` for the drills hub.

## 1. Prerequisites

- [ ] **Python 3.11+** (3.10 at minimum) from python.org. Tick "Add python.exe to PATH" or keep the `py` launcher.
- [ ] **GSPro** + **GSPconnect** (default `C:\GSProV1\Core\GSP\GSPro.exe`, `C:\GSProV1\Core\GSPC\GSPconnect.exe`).
- [ ] **GameChanger**: unzip it to `C:\SimTools\GameChanger\`, **not** Downloads or Temp. Then unblock the files
      (PowerShell): `Get-ChildItem C:\SimTools\GameChanger -Recurse | Unblock-File`
- [ ] **FSX Pro** (`C:\Program Files (x86)\FSX Pro\FSX Pro.exe`). Use it only for setup and testing. In FSX Pro go to
      Settings > Devices and turn **off** "Auto connect with solo device".
- [ ] For video only: **Kinovea 2025.1+** and **OBS Studio**. See [SETUP-video.md](SETUP-video.md).

## 2. Install

- [ ] Clone or copy the repo (spaces in the path are fine) and double-click **`setup.bat`**. It creates `.venv` and
      installs `requirements.txt`. It also offers OpenCV (optional), offers to **auto-detect your exe paths into
      `config.local.json`**, runs `doctor` and offers autostart.
- [ ] Autostart is optional: run `install_autostart.bat` (it asks for UAC). Remove it with
      `schtasks /Delete /TN "SimWatch" /F`.

## 3. Per-machine settings: `config.local.json`

`config.json` holds the shared defaults. Your own exe paths and device IP go in **`config.local.json`**. Git ignores
this file. SimWatch deep-merges it over `config.json` at load, and it matches `apps` entries by `key`, so you only
override what differs:

```json
{ "apps": [ { "key": "integrator", "exe": "C:\\SimTools\\GameChanger\\GameChanger.exe" } ],
  "video": { "kinovea_exe": "C:\\Program Files\\Kinovea\\Kinovea.exe" } }
```

- [ ] Create it with `.venv\Scripts\python.exe simwatch.py discover --write-local`. That checks running apps, the
      usual install folders and the Uninstall registry. Or copy `config.local.example.json` and edit it. JSON needs
      doubled backslashes.
- [ ] Keys you may need: `apps[].exe` (`integrator` = GameChanger, `gspro_connect`, `gspro`, `fs_connector` = FSX Pro),
      `video.kinovea_exe`, `video.obs_exe`, `device.ip` (the Launch Pro address) and optionally `device.host_ip` (the PC
      side of the link, default `169.254.6.1`). The device checks have no `ip` of their own and use `device.ip`, so
      that one key is all you change. (Lists without a `key`, such as `checks`, are replaced whole by the overlay.)

## 4. GSPro side

- [ ] In GSPro settings, choose **Open Connect v1** (GSPconnect, window "APIv1 Connect") as the launch monitor
      connector. It listens on `:921`.
- [ ] In GameChanger, set the OpenConnect / GSPro target to **`127.0.0.1` port `921`**. Do **not** use `localhost`.
      Windows can resolve `localhost` to IPv6 `::1`, and the shot-bridge sniffer only sees IPv4 loopback, so shots
      would never reach the drills hub. `doctor` checks this when it can find GameChanger's settings file.

## 5. Harden the Launch Pro connection

Most dropped connections come from Windows power-saving the USB NIC, the APIPA address delay after a replug, a
"Public" network profile or a firewall Block rule.

- [ ] Plug in the Launch Pro and power it on, then run `.venv\Scripts\python.exe simwatch.py harden`. This is a
      **dry run**: it prints the exact PowerShell for your PC, with the adapter detected automatically:
      - a static `169.254.6.1/16` on the device adapter (if adding it fails, DHCP is switched back on and no
        existing address is removed, so the adapter is never left without one)
      - a persistent `/32` route to the device
      - interface metric 5 and the Private network profile, plus the Unidentified Networks = Private policy (a
        direct-cabled link is an 'Unidentified network' that otherwise comes back Public after an adapter restart)
      - firewall Allow rules for python.exe, GameChanger, GSPconnect and FSX Pro, and removal of any matching Block rules
      - adapter power management off
      - USB selective suspend off and PCIe ASPM off
      - the High performance plan
      - no sleep, no hibernate or fast startup
      - no time limit and battery-OK settings on the SimWatch task
- [ ] Apply it from an **Administrator** terminal with `simwatch.py harden --apply`. It asks before each command and
      logs to `simwatch.log`. If the adapter isn't detected, pass its name from `Get-NetAdapter`:
      `simwatch.py harden "Ethernet 3" --apply`.
- [ ] Unplug and replug the Launch Pro afterwards. If GameChanger was running, `--apply` offers to restart it (it
      loses its Launch Pro session when the adapter changes).

## 6. Run as Administrator

The shot-bridge sniffer opens a raw socket with `SIO_RCVALL`, and the window automation clicks elevated sim apps.
Both **require Administrator**. The autostart task already runs elevated. For manual runs (`run_simwatch.bat`,
`simwatch.py watch`, `bridge`), use an elevated terminal. Otherwise the bridge serves no shots and clicks silently
fail.

## 7. Cameras / Kinovea / OBS

See **[SETUP-video.md](SETUP-video.md)** for camera placement, Kinovea capture setup and the OBS PiP. You can also
run `simwatch.py obs-setup` for the scene collection.

## 8. Final gate: `doctor`

- [ ] From an Administrator terminal: `.venv\Scripts\python.exe simwatch.py doctor`. Fix every **FAIL**. The exit code
      is non-zero while any FAIL remains. Each row carries a one-line fix. WARN rows are worth fixing, and most of them
      are covered by `harden`.
- [ ] Then: `run_simwatch.bat` (apps + watchdog), `run_practice_video.bat` (Kinovea grid; `Alt+H` = hotkeys),
      `open_drills.bat`.

## Troubleshooting

| Symptom / doctor row | Fix |
|---|---|
| `sniffer raw socket` FAIL / drills hub shows no shots | Run elevated. Make sure GameChanger targets `127.0.0.1:921`. |
| `firewall: ...` FAIL (Block rule) | Someone cancelled a firewall prompt. Run `simwatch.py harden --apply`, or delete the rule in `wf.msc`. |
| `FSX Pro device hold` FAIL | FSX Pro grabbed the Launch Pro. Run `release_device.bat` (or close FSX Pro). |
| `GameChanger exe` WARN (Downloads / Zone.Identifier) | Move it to `C:\SimTools\GameChanger`, run `Unblock-File`, update `config.local.json`. |
| `device adapter` / `device ping` WARN | Launch Pro off, asleep or unplugged. Replug it. After `harden`, the address is static, so no 60 s wait. |
| `adapter power mgmt` / `USB selective suspend` WARN | `simwatch.py harden --apply`. |
| `scheduled task` WARN (PT72H / AC-only) | `harden --apply` (task step), or rerun `install_autostart.bat`. |
| `PAUSE file` stale | `reconnect_sim.bat` left the watchdog paused. Run `release_device.bat` or delete `PAUSE`. |
| `Kinovea version` WARN | Upgrade to Kinovea 2025.1+ (the older capture backend is legacy). |
| `config.local.json` FAIL | Invalid JSON. Fix it or delete it and rerun `discover --write-local`. |
| "no usable Python 3.10+ found" | Install Python, then run `setup.bat`. |

- Logs: `simwatch.log` (repo root, rotating), `logs\launcher.log` and `logs\clip-ready.log` (Kinovea's post-recording command).
- Pause the watchdog by creating a file named `PAUSE` next to `simwatch.py`. Delete it to resume. A PAUSE older
  than `pause_max_hours` (default 4) is ignored and deleted, so a forgotten one can't stop the watchdog for good.
- `simwatch.py stop` stops background instances.

## Updating

Run `git pull`, then `setup.bat` again (it's safe to repeat). Your machine-specific settings live in
`config.local.json`, so pulls never conflict with them.
