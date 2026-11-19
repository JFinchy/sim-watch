# Bridge session context (shot record v2, /api/context, /api/session-stats)

Branch: `feature/coach-system`
Files changed: `simwatch.py` (shot-data bridge section), `tests/test_shot_bridge.py`

## What to verify

Every shot is now stamped with the hub's coaching context (drill, feel, block, session, phase, cluster, one-shot note) and carries derived metrics (smash, face-to-path, start offline yards); `/api/session-stats` summarises a session from `shots.jsonl`. Unit tests use synthetic shots; a human needs to confirm real GSPro/OpenConnect shots on the Windows rig get tagged and the numbers are sane.

## Steps

1. On the Windows rig start the watchdog (`python simwatch.py watch`) or bridge-only (`python simwatch.py bridge`), and open http://127.0.0.1:8765/.
2. In the drills hub, start a coached block (pick a feel, set phase/cluster as the UI allows). Or by hand:
   `curl -X POST http://127.0.0.1:8765/api/context -H "Content-Type: application/json" -d "{\"feel_id\":\"feel1\",\"block_id\":\"b1\",\"session_id\":\"s1\",\"phase\":\"cold\",\"cluster\":1,\"note\":\"test note\"}"`
3. Hit 6+ shots with the same club; change `phase` to `"block"` and `cluster` to `2` partway through.
4. Open `Swings/Sessions/<today>/shots.jsonl`. Check each line has `feel_id`, `block_id`, `session_id`, `phase`, `cluster`, `derived` (`smash`, `face_to_path`, `start_offline_yd`), and that `note` is set on the first shot only, null after.
5. `curl "http://127.0.0.1:8765/api/session-stats?date=<today>&session_id=s1"` and check shot_count, cold_start (basis `tagged` while phase was `cold`), dispersion first3/last3, by_cluster, by_feel, strike_consistency.
6. Close the hub page, wait over 60 s, `curl http://127.0.0.1:8765/api/status`: `context` must be all null.
7. Optional, no rig: `python simwatch.py bridge --demo` and confirm demo shots carry path/face/aoa and a smash near 1.2-1.5.

## Pass criteria

Shots are tagged with the context set at the time, the note appears once, derived values match hand calculation (smash = ball speed / club speed, face_to_path = face - path, start_offline_yd = carry * sin(HLA), positive = right), stats numbers are plausible, and context clears after the idle timeout. Old `shots.jsonl` files (v1 lines) still load via `/api/shots` with null context keys.
