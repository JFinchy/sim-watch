# Watchdog reliability fixes

Branch: master (working tree)
Files changed: `simwatch.py` (evaluate_checks, check_device_ping/tcp, _watch_step, recover/_run_recovery_step,
recover_device, release_fsx_for_recovery, wait_device_sockets_clear, wait_port, PAUSE helpers, startup,
club_category), `config.json` (`pause_max_hours`, `device.offline_ticks`, `device.socket_clear_sec`,
`device_recovery`, `startup.wait_timeout_sec`=180, `startup.wait_link_sec`), `install_autostart.bat`,
`tests/test_watchdog_reliability.py`

## What to verify

The watchdog now separates device-side failures (Launch Pro off/unplugged) from the GSPconnect/GSPro
chain, restarts only GameChanger with 5 -> 15 -> 30 min backoff for device-only problems, never moves the
mouse during automatic recovery, expires stale PAUSE files, and registers autostart without the 72 h
limit. Unit tests stub all of Windows, so the real process/socket/Task Scheduler behaviour needs the rig.

## Steps

Run `run_simwatch.bat` (or `python simwatch.py watch`) with GSPro up, and keep `simwatch.log` open
(`Get-Content simwatch.log -Wait` in PowerShell).

1. **Device offline -> nothing restarts.** Power off the Launch Pro (or pull its cable). Expect after
   ~15 s (3 ticks): `Launch Pro unreachable (off or asleep); waiting for hardware without restarting apps.`
   No `>>> recovery` lines for 5+ minutes. Power it back on -> GameChanger reconnects, `All green.`
2. **GSPconnect still recovered while device is off.** With the Launch Pro still off, run
   `taskkill /F /IM GSPconnect.exe`. Expect within ~15-20 s:
   `Launch Pro looks offline, but ... failing - recovering that chain anyway.` followed by
   `>>> recovery level N: ...` and GSPconnect relaunching.
3. **Device-only -> GameChanger only, with backoff.** Launch Pro ON and pingable, but make GameChanger lose
   its session (e.g. in GameChanger disconnect the device, or briefly unplug/replug the Launch Pro USB/Ethernet so
   ping recovers but GameChanger doesn't reconnect). Expect `>>> device recovery: restart GameChanger
   (device session only)` - GSPro and GSPconnect are NOT restarted - then
   `Device-only recovery #1 done; if still failing, next GameChanger restart in >= 5 min.` If still broken,
   the next attempt comes no sooner than 5 min, then 15 min, then every 30 min. Once the session is back,
   the counter resets.
4. **No mouse movement.** Run `python simwatch.py reconnect` (FSX Pro grabs the device), then delete
   `PAUSE` by hand (not release-device). On the next device-only recovery expect
   `FSX Pro is holding the Launch Pro - closing FSX Pro so GameChanger can connect`; FSX Pro.exe closes and
   the mouse cursor never moves. (`release_device.bat` still clicks FSX Pro's Disconnect - that's expected.)
5. **Socket wait.** During step 3, `netstat -ano | findstr 9970` shows the old session gone (no
   ESTABLISHED/TIME_WAIT) before GameChanger relaunches, or a log line `socket(s) to the Launch Pro still
   open after 10s; relaunching anyway`.
6. **Stale PAUSE.** In PowerShell in the repo folder:
   `Set-Content PAUSE "paused_at: $((Get-Date).AddHours(-5).ToString('s'))"` -> within one tick the log shows
   `PAUSE file is 5.0 h old (limit 4 h); ignoring and removing it` and `PAUSE` is deleted. A fresh
   `python simwatch.py reconnect` PAUSE (contains `paused_at:` now) still pauses normally.
7. **Startup wait.** Reboot with the Launch Pro cable in. `simwatch.log` shows
   `Device network adapter '...' is up (link-local address present).` before `Waiting for: Launch Pro reachable`.
   With the cable out it waits <= 60 s for the adapter, then up to the remaining 180 s budget for ping.
8. **GSPro :9050 wait.** Restart GSPro via recovery level 1 (or `python simwatch.py recover 1`): the log says
   `:9050 listening` and GSPconnect connects normally (no failed GSPconnect<->GSPro handshake).
9. **Putter.** Select the putter in GSPro and hit a putt: the log's club category reads `Putter`, not `Iron`.
10. **Autostart.** Run `install_autostart.bat` (accept UAC), then
    `schtasks /Query /TN SimWatch /XML` -> contains `<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>`,
    `<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>`,
    `<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>`, `<RunLevel>HighestAvailable</RunLevel>`,
    `<RestartOnFailure><Interval>PT1M</Interval><Count>3</Count>`, a `LogonTrigger` with `<Delay>PT10S</Delay>`,
    and the action `run_simwatch.bat` with `--no-pause`. Sign out/in -> SimWatch starts.

## Pass criteria

Steps 1-3 restart exactly what's described (nothing / GSPconnect chain / GameChanger only, with the stated
backoff); the cursor never moves during automatic recovery; a 5 h-old PAUSE is removed; the task XML shows
PT0S, battery-safe settings and 3 restarts; putts log as `Putter`.
