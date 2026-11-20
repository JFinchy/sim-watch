# Shot-data bridge (shots.jsonl + local HTTP/SSE API for the drills hub)

Branch: `master` (working tree)
Files changed: `simwatch.py`, `config.json` (`bridge` block), `README.md`, `tests/test_shot_bridge.py`

## What to verify

Every real shot GSPro receives over OpenConnect (:921) should be written to
`Swings\Sessions\YYYY-MM-DD\shots.jsonl` and served on `http://127.0.0.1:8765`. Unit tests and the
macOS `--demo` run cover the server and mapping logic. Only the rig can show whether the raw-socket
sniffer really sees GameChanger's traffic, which fields the Launch Pro actually sends (carry and club
data may be null), and whether clip linking and the `_D-<id>` filename tag work with real Kinovea recordings.

## Steps

1. Open an **Administrator** PowerShell in the repo folder (the raw :921 sniffer needs admin).
   Stop the background daemon first so the port is free: `python simwatch.py stop`
2. Start GSPro and GameChanger as usual, then run: `python simwatch.py bridge`
3. In the console (or `simwatch.log`), confirm these lines appear:
   - `Shot bridge listening on http://127.0.0.1:8765/ (drills hub + /api/status)`
   - `OpenConnect (:921) passive shot monitor active`
4. In a browser, open `http://127.0.0.1:8765/api/status`. Expect `"ok": true`, `"version": 1`, `"sniffer_ok": true`.
5. **Do step 6 first** (open the live feed): since the hardening pass, the active drill clears after 60s with no event stream open, so without it you must hit step 7's shot within a minute. Then set a drill from a second PowerShell:
   `Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8765/api/drill -ContentType 'application/json' -Body '{"drill_id":"test-drill"}'`
   Expect `active_drill : test-drill`. Then try a bad id (`"drill_id":"../x"`) and expect an HTTP 400 error.
6. Optional live feed: in the second PowerShell run `curl.exe -N http://127.0.0.1:8765/api/events` and leave it open.
7. Hit one real shot.
8. Check that the console logs `Shot N recorded (club=..., speed=..., drill=test-drill)`, that the curl window shows an
   `event: shot` block, and that a new line appears at the end of
   `Get-Content .\Swings\Sessions\$(Get-Date -Format yyyy-MM-dd)\shots.jsonl -Tail 1`.
   Note which of `carry`, `spin`, `spin_axis` and `club_data` are null.
9. Open `http://127.0.0.1:8765/api/shots` and confirm the shot is listed. Open `http://127.0.0.1:8765/` and confirm the drills hub loads.
10. Ctrl+C the bridge. Run the full rig (`python simwatch.py watch`, or `run_simwatch.bat`), POST the drill again
    (step 5), and hit a shot. The saved session clip should be named like `001_7Iron_..._D-testdrill_DTL.mp4`,
    and that shot's line in `shots.jsonl` should have `"clip": "<that filename>"` within a few seconds.
11. Busy-port check: while `watch` is running, run `python simwatch.py bridge` in another window. It should exit with
    "Shot bridge could not start", and `watch` should keep running normally.

## Pass criteria

- The log shows `OpenConnect (:921) passive shot monitor active`, and `/api/status` reports `sniffer_ok: true`.
- One real shot produces exactly one `shots.jsonl` line with a non-null `ball.speed`, plus a matching SSE `shot` event.
- `drill_id` and the `_D-<id>` filename tag match the drill that was set, and `clip` is filled in under `watch`.
- A busy port never stops the watchdog.

## Hardening pass

Covers: origin/Host allowlist, JSON-only drill POST, SSE cap, drill expiry, single recorder, the bridge sniffer
when video is off, and the `clip` SSE event. Run from the repo folder in PowerShell.

1. Start `python simwatch.py bridge --demo --demo-interval 3` (no rig needed).
2. Foreign origin is refused:
   `curl.exe -i -H "Origin: https://evil.example" http://127.0.0.1:8765/api/status`. Expect `403` and no
   `Access-Control-Allow-Origin` header.
3. `null` origin still works: `curl.exe -i -H "Origin: null" http://127.0.0.1:8765/api/status`. Expect `200` with
   `Access-Control-Allow-Origin: null` and `Vary: Origin` (never `*`).
4. DNS-rebinding guard: `curl.exe -i -H "Host: evil.example" http://127.0.0.1:8765/api/status`. Expect `421`.
5. text/plain post is refused: `curl.exe -i -X POST -H "Content-Type: text/plain" -d "{\"drill_id\":\"x\"}" http://127.0.0.1:8765/api/drill`.
   Expect `415`, and `/api/status` still shows the previous `active_drill`.
6. Open `drills/index.html` by double-clicking it (`file://`). Confirm the bridge pill goes live, demo shots appear,
   and picking a drill sets `active_drill` in `/api/status` (the browser's preflight + JSON POST must succeed).
7. Close that tab and wait about 70s with no `curl.exe -N .../api/events` open. Expect the log line
   `Active drill <id> cleared: no drills page connected for 6Ns` (N = whatever the reaper tick landed on), and `/api/status` shows `"active_drill": null`.
8. SSE cap: open 9 windows running `curl.exe -N http://127.0.0.1:8765/api/events`. The 9th should get
   `HTTP/1.0 503` with "too many live-event clients". Close one and retry: it connects.
9. Single recorder: keep the bridge running and start `python simwatch.py watch` in another window. The watch
   log must say `Shot bridge already running in another process (port 8765 busy); not recording shots here`.
   Hit a real shot (or let the demo run): `shots.jsonl` gets exactly one line per shot, not two.
10. Video off: stop both, set `"video": {"enabled": false}` in `config.json`, run `python simwatch.py watch` from
    an Administrator PowerShell with GSPro + GameChanger up. `/api/status` should report `"sniffer_ok": true`,
    and a real shot should add one line to `shots.jsonl`. Restore `video.enabled` afterwards.
11. Clip event: under the full rig (`video.enabled: true`), keep `curl.exe -N http://127.0.0.1:8765/api/events`
    open and hit a shot. After the `event: shot` block, an `event: clip` block with the saved clip filename should
    follow once Kinovea's recording is saved.

### Hardening pass criteria

- Steps 2-5 give exactly 403 / 200 with `null` reflected / 421 / 415.
- The `file://` page still goes live and can set the drill (step 6).
- The drill expires on its own about 60s after the page closes (step 7).
- No shot is ever duplicated in `shots.jsonl` when two SimWatch processes are running (step 9).

## Review fixes, round 2 (2026-11-19: two writers, demo dir, dedup)

Branch: `feature/coach-system` (working tree). Files: `simwatch.py`, `tests/test_review_fixes.py`, `README.md`.

1. **Two writers, no lost shots (A):** with the full rig running (`watch`, video on), hit 10 shots at a normal
   pace. `shots.jsonl` has exactly 10 new lines, `shot_num` is consecutive, and every full swing has `clips`
   {DTL, FO}. No `.shots.lock` file is left behind in `Swings\Sessions\<date>\` afterwards.
2. **Link retried by the watchdog (A):** open today's `shots.jsonl` in a program that holds it locked (e.g.
   `powershell -c "$f=[IO.File]::Open('<path>\shots.jsonl','Open','Read','None'); Start-Sleep 20; $f.Close()"`),
   then hit a shot during those 20 s. `logs\clip-ready.log` says `could not link clip to shot (watchdog will
   retry)`. Within about a minute after the lock is released, the shot's record has its `clip`/`clips` (the
   watchdog wrote it). The new shot line itself is not lost.
3. **Demo stays separate (D):** `python simwatch.py bridge --demo --port 8766`. Demo shots go to
   `Swings\Sessions-demo\<date>\shots.jsonl` with `"demo": true`. `Swings\Sessions\<date>\shots.jsonl` doesn't
   change. `curl.exe http://127.0.0.1:8766/api/status` shows `"demo": true` and `"sniffer_ok": false`.
4. **Heartbeats / repeats (I):** leave GSPro idle for 2 minutes with the rig connected. No new lines appear in
   `shots.jsonl`. Then hit a shot: exactly one line, even if GSPconnect reconnects within 30 s afterwards.

Pass: no shot is lost or duplicated, clip links survive a busy file, and demo shots never reach the real sessions.
