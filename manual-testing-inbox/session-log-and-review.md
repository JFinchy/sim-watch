# Session runner, structured log, miss dial & weekly review

Branch: `feature/coach-system`
Files changed: `drills/index.html`, `drills/tools/validate_data.js` (see `git log` on the branch)

## What to verify

A timed coached session (15/30/45/60 min templates) that tags every shot through the bridge v2 context API, ends with a structured log plus a stats card from `/api/session-stats`, a driver miss dial, and a 7-day review. Needs a human on the mat and a real sim, not just the demo bridge.

## Steps

1. Run `python simwatch.py bridge` (or add `--demo` to test without the rig). Open `drills/index.html` over file:// on the Windows PC.
2. Tonight's Session card: click "Start coached session". Pick 30 min, set the body-state chips, click "Start session".
3. Check `http://127.0.0.1:8765/api/status`: `context` shows your `session_id`, `phase: warmup`, `cluster: 0`. Click "Next block" and confirm phase becomes `cold`, then `block`, cluster 1, 2.
4. On the cold block confirm the "first 3-5 shots" reminder; on a feel block the driver cluster/rest reminder. Hit shots and confirm the live count rises. Tap "Rest 25 s".
5. Reload the page mid-session: the Tonight card says "Resume coached session"; resuming restores the block and context.
6. Finish, fill the log (summary, findings, takeaway, next step, fault tags incl. "Driver hook", clubs, drills, feel rating, dial). Tick "Promote takeaway to active cue" and save.
7. Check the stats card (cold vs rest, first 3 vs last 3 per club with "smaller is better", averages) and the dial needle. Confirm the Goals & Delivery Chart view shows today's check-in.
8. Feels & Blocks tab: weekly review (sessions, minutes, one-feel rule, metric table, fault counts, drills, block day N/M). Start a new session and confirm the "Check the dial both ways" prompt appears.
9. Stop the bridge and run a short session: Hit/Miss buttons work, nothing blocks, log saves, dial set by hand.
10. Phone: open on the phone, check no horizontal scroll and big tap targets.

## Pass criteria

Context shows on `/api/status` and shots carry session/phase/cluster; stats card numbers match `GET /api/session-stats`; state survives reload; offline path works; promote opens the 2-cue chooser when two cues are active; no console errors beyond missing shorts / offline bridge.
