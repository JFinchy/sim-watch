# Tonight launcher + Mat mode + live auto-scoring

Branch: `master` (working tree)
Files changed: `drills/index.html` (SESSION section, CSS, schema v3: `sessions`, `sessionPrefs`, `activeSession`; `mergeDrills` carries the default `target` onto user-edited drills)

## What to verify

The drills hub now opens on a "Tonight" card that plans a 20/30/45-minute session. **Start session** opens a full-screen Mat mode with a rep counter, timers, auto-advance and presenter-clicker keys. When the shot bridge is running, shots auto-score against `drill.target`. Headless tests passed. A human still needs to check readability from 6-10 ft, the real clicker, real Launch Pro shots (carry is often null), and the metronome audio.

## Steps

1. On the sim PC, open `drills/index.html` (file://) on the screen you use at the mat. The **Tonight · <mode> · N drills · ~M min** card should be at the very top, with **▶ Start session** visible without scrolling.
2. Tap **🌙 Kids Asleep**, then **45 min**. The plan list changes. Reload the page: the same mode, minutes and plan come back.
3. Press **⇄** on a Focus row: the drill swaps. Press **✕** on a row: it disappears. Press **↺ Reset plan**: the original plan returns.
4. Pick **Real Balls** and **20 min**, then press **▶ Start session**. From the mat (6-10 ft, gloves on), check that you can read the drill title, the yellow cue and the big rep counter.
5. Use the presenter clicker: **PgDn** = next drill, **PgUp** = previous. On the keyboard: **Space / H / 1** = hit, **M / X / 2** = miss, **Backspace** = undo, **T** = tempo. The page's own M (mark done) and arrow shortcuts must NOT fire while Mat mode is open.
6. On a drill with a rep goal (e.g. "15 pause reps"), log 15 reps. A green "Rep goal reached" banner shows and the next drill opens about 2.5 s later. Pressing Undo during the banner keeps you on the drill.
7. Press **Tempo ▶ 27** (or the preset shown). The metronome plays at that preset. Press it again to stop.
8. Start the bridge: `python simwatch.py bridge` (or the normal watchdog). Within 15 s the pill shows **Sim live**.
9. Move to **One-Side Miss Fairway Start-Line Test** (or any drill with a target) and hit real balls:
   - Each shot appears big (speed, HLA, plus carry only when present) and is auto-marked ✓/✗ using HLA 0° ±4°.
   - `http://127.0.0.1:8765/api/status` shows `active_drill` = that drill id.
   - The new clip filename has `_D-...`.
10. On a drill without a target, hit a ball and then tap ✓. The shot itself gets the score; no second rep is added.
11. Run a short **Kids Asleep** session that includes **HackMotion Wedge Wrist Extension Clamp** (carry target). Foam-ball shots are logged but never auto-scored, and carry and ball speed are hidden.
12. Stop the bridge (Ctrl+C). The pill flips to **Sim offline (manual scoring)** and tapping still works.
13. Press **Esc** and choose **End & summary** (Enter). The summary shows drills done, minutes, total balls, hit rate, best/needs-work, per-drill "±N% vs last" and a trend sparkline.
14. Set Quality 4, edit the notes, then press **Save to day log**. Then press **Open day log**: the Goals & Delivery Chart tab shows today with status Met (or Partial if you skipped a drill), your notes, and the drills ticked as completed.
15. Reload. The Tonight card shows "Last: NN% ... , <weekday>". Editor tab → Export Full Backup: the JSON contains `"sessions"`. Importing it restores them.
16. Mid-session, reload the page. The card offers **▶ Resume session**, and your logged reps are still there.

## Pass criteria

- Readable from the mat. The clicker drives next/prev.
- Hits and misses log with no page shortcuts firing underneath.
- Auto-advance works.
- Real Launch Pro shots auto-score on HLA even when carry is null. Foam-mode carry/speed is never scored.
- The `active_drill` tag follows the current drill, and goes back to null at the end.
- The summary saves into the existing daily log, with no duplicate notes on re-save.
- Session history survives reload and export/import.

## Planner follow-up (orchestrator pass)

- Pick **45 min**: plan should total ~40–45 min (up to 4 focus blocks), not ~33.
- On **Real Balls** / **Kids Asleep**, mobility drills (e.g. T-Spine Open Books) should only appear as the Warm-up, never as a Focus block. On **Gym-Sore** they may lead.
- Long drill names in the plan list wrap to two lines instead of truncating to "Structur…".
- Scoring targets now live in `drills/drills_data.js` (`target` on 9 drills); `node drills/tools/validate_data.js` validates them.
