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
5. Set a drill from a second PowerShell:
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
