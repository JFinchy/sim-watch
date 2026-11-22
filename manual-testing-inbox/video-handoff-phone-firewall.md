# Practice-video handoff, phone access to the drills hub, narrowed firewall rules

Branch: `master`
Files changed: `simwatch.py`, `run_simwatch.bat`, `config.json`, `drills/index.html` (one line: `BRIDGE_URL`),
`.gitignore`, `README.md`, `SETUP.md`, `tests/test_handoff_phone_firewall.py`

## What to verify

1. `video` / `run_practice_video.bat` no longer kills the background daemon. It asks the daemon to start
   its video rig without GSPro (`VIDEO_ON`). A second `watch`/`startup` exits cleanly. `stop` shuts down
   cleanly and the launcher shows no error box.
2. Opt-in phone access (`bridge.lan`) with a pairing token.
3. `harden` firewall rules are now limited by remote address.

All of this is Windows process/firewall/network behaviour that the macOS tests can only stub.

## Steps

Use an Administrator PowerShell in the repo folder, with the SimWatch sign-in task running (sign in, or
run `schtasks /Run /TN SimWatch`).

### A. Daemon handoff and stop
1. `.venv\Scripts\python.exe simwatch.py status` should show `SimWatch daemon: running (pid N, `startup`)`.
2. With GSPro **closed**, double-click `run_practice_video.bat`. It should print "SimWatch is already running
   in the background (pid N ...): asked it to start the video rig" and wait at "Press any key". No error box,
   and `status` should still show the same pid.
3. Within about 10 s the Kinovea 2x2 grid opens and the hotkeys work (`Alt+H`). `simwatch.log` should have
   "Practice video request received (VIDEO_ON)". `simwatch_status.json` should have `"video_request": true`.
4. Hit a shot with GameChanger running (or press the manual trigger hotkey). A clip should be captured.
5. Run `.venv\Scripts\python.exe simwatch.py video off`. The log should say "Practice video request
   cleared". With GSPro still closed, the hotkeys stop working. The Kinovea windows stay open.
6. Double-click `run_simwatch.bat`. It should print "SimWatch is already running ... not starting a second
   `startup`" and exit 0. The task's daemon keeps running (same pid in `status`).
7. Run `.venv\Scripts\python.exe simwatch.py stop`. It should print "Asked SimWatch (pid ...) to stop" and
   return within about 10 s. **No** "SimWatch did not start" message box. `logs\launcher.log` should end
   with `simwatch.py exited with code 0`, and `schtasks /Query /TN SimWatch` should show the task as Ready,
   not Running.
8. Run `schtasks /Run /TN SimWatch`. After about 30 s `status` should show a new daemon pid.
9. Repeat step 7 from a **non-elevated** prompt. It should still stop the elevated daemon (via
   `STOP_REQUEST`).
10. Run `stop` within the first 20 s after `schtasks /Run` (the daemon is still in its boot delay). After
    20 s it is terminated, and there should still be no message box.

### B. Phone access
1. In `config.local.json` add `"bridge": {"lan": true}`. Then run `simwatch.py stop` followed by
   `schtasks /Run /TN SimWatch`.
2. Run `simwatch.py harden --apply` and answer `y` only to the step "Firewall inbound Allow TCP 8765 for the
   drills hub". Confirm the home Wi-Fi/Ethernet profile is Private: `Get-NetConnectionProfile`.
3. Run `simwatch.py phone`. It should print `http://192.168.x.y:8765/?token=...` (and a QR code if
   `pip install qrcode` was done).
4. On the phone, on the same Wi-Fi, open that URL. The drills hub loads and the bridge indicator goes live.
   Hit a shot: it should appear on the phone.
5. On the phone, open `http://192.168.x.y:8765/` **without** the token (e.g. a new private tab). Expect a
   401 JSON "pairing token required". In the normal tab, reload without `?token`: it should still work
   (cookie).
6. On the PC, the hub at `http://127.0.0.1:8765/` and `open_drills.bat` (file://) should still work with
   no token.
7. Doctor: the `bridge LAN (phone)` row shows the URL, and `firewall: bridge LAN (phone)` should be PASS.
8. If Windows shows a firewall prompt for Python when the daemon starts, note it here. Don't click Cancel:
   that creates a Block rule. Expected: no prompt, because SimWatch's python rule already exists.
9. Set `lan` back to false and restart. The phone should now fail to connect. Doctor shows
   `firewall: bridge LAN (phone)` as INFO with the `Remove-NetFirewallRule` command.

### C. Narrowed firewall rules
1. Before applying, `simwatch.py doctor` should WARN "broader than needed" for the old SimWatch rules (and
   for any installer-created Any rules it names).
2. Run `simwatch.py harden --apply` and answer `y` to the "Firewall inbound Allow for ..." steps.
3. Check the scopes with
   `Get-NetFirewallRule -DisplayName 'SimWatch allow*' | % { $_.DisplayName; ($_ | Get-NetFirewallAddressFilter).RemoteAddress }`.
   Expected: python and GSPconnect `127.0.0.1`; GameChanger and FSX Pro `169.254.0.0/255.255.0.0` and
   `LocalSubnet`.
4. Fully restart: power-cycle the Launch Pro, reboot the PC, and let the task start everything. GameChanger
   should discover and connect to the Launch Pro, and shots should reach GSPro and the drills hub.
5. Close GameChanger, connect FSX Pro to the Launch Pro (`reconnect_sim.bat`), then run
   `release_device.bat`. FSX Pro discovery should work too.
6. `doctor`: every `firewall:` row should be PASS. A remaining WARN should only name non-SimWatch rules:
   decide whether to delete them in `wf.msc`.

## Pass criteria

- A: no killed daemon, no "SimWatch did not start" box, `stop` then `schtasks /Run` restarts, and the
  practice rig runs without GSPro until `video off`.
- B: the phone works with the token, gets 401 without it, and loopback/file:// behave as before.
- C: GameChanger and FSX Pro still discover and connect after a full reboot with the narrowed rules, and
  doctor shows the firewall rows as PASS.

## Restart command (2026-11-20)

Seen on the rig: after a clean `stop` the launcher log said "stopped by simwatch.py stop" but a `cmd` stayed alive and
the task kept showing Running, so `schtasks /run` did nothing until `schtasks /end`.

1. From the Administrator prompt: `python simwatch.py restart`. Expect "Stopped N ...", possibly "still shows Running ... ending it",
   then "SimWatch is running (pid ...)" within about 90 s.
2. `python simwatch.py status` shows the daemon running, the layout line, and all green.
