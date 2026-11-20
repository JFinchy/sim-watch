"""Regression tests for the clip-link / shot-store / shot-path review fixes (pure logic, Windows stubbed)."""
import json
import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import simwatch as sw
from test_kinovea import _bare_manager, _cfg, _iso
from test_shot_bridge import OC_FULL


def _day(ts: str) -> str:
    return ts[:10]


# ------------------------------------------------------------------ A: cross-process shots.jsonl lock

def test_set_clip_and_append_from_two_stores_never_lose_shots(tmp_path):
    """Two ShotStore instances (= two processes: their thread locks are separate, only the file lock is
    shared) - one appending, one rewriting via set_clip - must not lose a single appended shot."""
    writer, linker = sw.ShotStore(tmp_path), sw.ShotStore(tmp_path)
    base = datetime(2026, 11, 17, 10, 0, 0).astimezone()
    first = writer.append({"ts": base.isoformat(timespec="milliseconds"), "ball": {"speed": 100}})
    n = 40

    def append_many():
        for i in range(1, n + 1):
            writer.append({"ts": (base + timedelta(seconds=i)).isoformat(timespec="milliseconds"),
                           "ball": {"speed": 100 + i}})

    def link_many():
        for i in range(n):
            linker.set_clip(first["ts"], f"001_x_{i}_DTL.mp4", "DTL")

    threads = [threading.Thread(target=append_many), threading.Thread(target=link_many)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(20)
    recs = writer.read(_day(first["ts"]))
    assert len(recs) == n + 1
    assert [r["shot_num"] for r in recs] == list(range(1, n + 2))
    assert recs[0]["clip"] == f"001_x_{n - 1}_DTL.mp4"
    assert not (tmp_path / _day(first["ts"]) / sw.SHOTS_LOCK_NAME).exists()


def test_busy_lock_set_clip_raises_but_append_still_records(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "SHOTS_LOCK_TIMEOUT_SEC", 0.2)
    store = sw.ShotStore(tmp_path)
    rec = store.append({"ts": "2026-11-17T10:00:00.000-08:00", "ball": {"speed": 100}})
    lock = tmp_path / "2026-11-17" / sw.SHOTS_LOCK_NAME
    lock.write_text("123")  # another process holds it (fresh, not stale)
    with pytest.raises(TimeoutError):
        store.set_clip(rec["ts"], "001_DTL.mp4", "DTL")
    store.append({"ts": "2026-11-17T10:01:00.000-08:00", "ball": {"speed": 101}})  # never dropped
    assert [r["shot_num"] for r in store.read("2026-11-17")] == [1, 2]


def test_set_clip_retries_replace_permission_error(tmp_path, monkeypatch):
    store = sw.ShotStore(tmp_path)
    rec = store.append({"ts": "2026-11-17T10:00:00.000-08:00", "ball": {"speed": 100}})
    real, fails = sw.write_text_if_changed, []

    def flaky(path, data, backup=True):
        if len(fails) < 2:
            fails.append(1)
            raise PermissionError("sharing violation (OneDrive)")
        return real(path, data, backup=backup)

    monkeypatch.setattr(sw, "write_text_if_changed", flaky)
    assert store.set_clip(rec["ts"], "001_DTL.mp4", "DTL") is True
    assert len(fails) == 2 and store.read("2026-11-17")[0]["clip"] == "001_DTL.mp4"


def test_clip_ready_link_failure_leaves_event_for_watchdog(tmp_path, monkeypatch):
    now = time.time()
    cfg = _cfg(tmp_path)
    store = sw.ShotStore(Path(cfg["bridge"]["sessions_dir"]))
    shot = store.append({"ts": _iso(now - 3), "club": "7I", "ball": {"speed": 118, "carry": 160}})
    src = tmp_path / "Cap" / "DTL_a.mp4"
    src.parent.mkdir(parents=True)
    src.write_bytes(b"\x00" * 64)

    def busy(self, *a, **k):
        raise TimeoutError("lock busy")

    monkeypatch.setattr(sw.ShotStore, "set_clip", busy)
    res = sw.clip_ready(cfg, src, "DTL", now=now, wait=False)
    assert res["linked"] is False and res["ts"] == shot["ts"] and res["angle"] == "DTL"
    ev_dir = Path(cfg["bridge"]["sessions_dir"]) / res["date"] / sw.CLIP_EVENTS_DIR
    (ev,) = [json.loads(p.read_text()) for p in ev_dir.glob("*.json")]
    assert {k: ev[k] for k in ("ts", "clip", "angle", "linked")} == {
        "ts": shot["ts"], "clip": res["clip"], "angle": "DTL", "linked": False}


def _consumer(tmp_path, monkeypatch, hub=None):
    cfg = _cfg(tmp_path)
    cfg["video"]["kinovea_backend"] = "2025"
    m, calls = _bare_manager(cfg)
    m.hub = hub
    m.last_saved_dtl = m.last_saved_fo = None
    m._retiled_on_first_clip = True
    monkeypatch.setattr(sw, "tile_video_windows", lambda *a, **k: None)
    return m, cfg, calls


def _write_event(cfg, ev, date=None):
    d = Path(cfg["bridge"]["sessions_dir"]) / (date or time.strftime("%Y-%m-%d")) / sw.CLIP_EVENTS_DIR
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{time.time_ns()}_{ev['angle']}.json").write_text(json.dumps(ev))


@pytest.mark.parametrize("with_hub", [True, False])
def test_watchdog_applies_unlinked_clip_event(tmp_path, monkeypatch, with_hub):
    cfg = _cfg(tmp_path)
    store = sw.ShotStore(Path(cfg["bridge"]["sessions_dir"]))
    shot = store.append({"ts": _iso(time.time() - 2), "club": "7I", "ball": {"speed": 118}})
    hub = sw.ShotHub(store) if with_hub else None
    m, cfg, calls = _consumer(tmp_path, monkeypatch, hub)
    _write_event(cfg, {"ts": shot["ts"], "clip": "001_7I_DTL.mp4", "angle": "DTL", "linked": False},
                 _day(shot["ts"]))
    m._consume_clip_events()
    rec = store.read(_day(shot["ts"]))[0]
    assert rec["clip"] == "001_7I_DTL.mp4" and rec["clips"] == {"DTL": "001_7I_DTL.mp4"}
    assert calls == ["pip"]


def test_watchdog_retries_failed_clip_link(tmp_path, monkeypatch):
    cfg = _cfg(tmp_path)
    store = sw.ShotStore(Path(cfg["bridge"]["sessions_dir"]))
    shot = store.append({"ts": _iso(time.time() - 2), "club": "7I", "ball": {"speed": 118}})
    m, cfg, _ = _consumer(tmp_path, monkeypatch, sw.ShotHub(store))
    real = sw.ShotStore.link_clip
    attempts = []

    def flaky(self, *a, **k):
        attempts.append(1)
        if len(attempts) == 1:
            raise TimeoutError("still busy")
        return real(self, *a, **k)

    monkeypatch.setattr(sw.ShotStore, "link_clip", flaky)
    _write_event(cfg, {"ts": shot["ts"], "clip": "001_7I_FO.mp4", "angle": "FO", "linked": False},
                 _day(shot["ts"]))
    t0 = time.time()
    m._consume_clip_events(now=t0)
    assert store.read(_day(shot["ts"]))[0].get("clip") is None and len(m._pending_clip_links) == 1
    m._consume_clip_events(now=t0 + 1)  # backoff not elapsed yet
    assert len(attempts) == 1
    m._consume_clip_events(now=t0 + 5)
    assert store.read(_day(shot["ts"]))[0]["clips"] == {"FO": "001_7I_FO.mp4"}
    assert m._pending_clip_links == []


# ------------------------------------------------------------------ B: day-unique shot numbers

def test_store_assigns_day_unique_shot_num_and_keeps_device_number(tmp_path):
    store = sw.ShotStore(tmp_path)
    day = tmp_path / "2026-11-17"
    day.mkdir()
    (day / "shots.jsonl").write_text('{"ts":"2026-11-17T08:00:00.000-08:00","shot_num":5}\n')  # legacy line
    a = store.append(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:00:00.000-08:00"))  # ShotNumber 7
    b = store.append(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:01:00.000-08:00"))  # GC restart: 7 again
    assert (a["shot_num"], a["device_shot_num"]) == (6, 7)
    assert (b["shot_num"], b["device_shot_num"]) == (7, 7)
    assert sw.clip_library_name(b, "DTL", ".mp4").startswith("007_")


def test_morning_clip_file_does_not_hide_new_shot_with_same_number(tmp_path):
    lib = tmp_path / "lib"
    lib.mkdir()
    (lib / "001_7I_DTL.mp4").write_bytes(b"x")  # this morning's shot 1 (before a ShotNumber reset)
    now = time.time()
    shot = {"ts": _iso(now - 3), "shot_num": 1, "club": "7I", "ball": {"speed": 118}, "clip": None}
    assert sw.find_shot_for_clip([shot], now, "DTL", lib) is shot
    shot["clips"] = {"DTL": "001_7I_DTL.mp4"}
    assert sw.find_shot_for_clip([shot], now, "DTL", lib) is None
    assert sw.find_shot_for_clip([shot], now, "FO", lib) is shot
    assert sw.find_shot_for_clip([dict(shot, clips=None)], now, "FO", lib, taken={(shot["ts"], "FO")}) is None


def test_angle_detection_handles_unique_path_suffix(tmp_path):
    assert sw.shot_has_angle_clip({"clip": "004_7I_DTL_2.mp4"}, "DTL")
    assert sw.shot_has_angle_clip({"clip": "004_7I_FO-1.mp4"}, "FO")
    assert not sw.shot_has_angle_clip({"clip": "004_7I_FO_2.mp4"}, "DTL")
    (tmp_path / "004_7I_DTL_2.mp4").write_bytes(b"x")
    assert sw._has_angle_clip(tmp_path, 4, "DTL") and not sw._has_angle_clip(tmp_path, 4, "FO")


# ------------------------------------------------------------------ C: midnight

def test_clip_after_midnight_links_previous_days_shot(tmp_path):
    midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    cfg = _cfg(tmp_path)
    sessions = Path(cfg["bridge"]["sessions_dir"])
    store = sw.ShotStore(sessions)
    shot = store.append({"ts": _iso(midnight - 2), "club": "7I", "ball": {"speed": 118, "carry": 160}})
    src = tmp_path / "Cap" / "DTL_mid.mp4"
    src.parent.mkdir(parents=True)
    src.write_bytes(b"\x00" * 64)
    res = sw.clip_ready(cfg, src, "DTL", now=midnight + 5, wait=False)
    yday, today = _day(shot["ts"]), datetime.fromtimestamp(midnight + 5).strftime("%Y-%m-%d")
    assert yday != today and res["ts"] == shot["ts"] and res["linked"] and res["date"] == yday
    assert (sessions / yday / res["clip"]).exists()
    assert list((sessions / yday / sw.CLIP_EVENTS_DIR).glob("*.json"))
    assert Path(res["replay"]).parent == sessions / today / "DTL"  # LiveReplay watches the clip's day
    assert store.read(yday)[0]["clips"] == {"DTL": res["clip"]}
    assert sw.clip_search_dates(midnight + 60, 20) == [today]


def test_consumer_reads_yesterdays_events_shortly_after_midnight(tmp_path, monkeypatch):
    m, cfg, calls = _consumer(tmp_path, monkeypatch)
    midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yday = (midnight - timedelta(days=1)).strftime("%Y-%m-%d")
    dirs = m._clip_event_dirs(now=(midnight + timedelta(minutes=2)).timestamp())
    assert [d.parent.name for d in dirs] == [midnight.strftime("%Y-%m-%d"), yday]
    assert len(m._clip_event_dirs(now=(midnight + timedelta(hours=1)).timestamp())) == 1
    _write_event(cfg, {"ts": None, "clip": "009_7I_DTL.mp4", "angle": "DTL", "linked": False}, yday)
    m._consume_clip_events(now=(midnight + timedelta(seconds=30)).timestamp())
    assert m.last_saved_dtl.name == "009_7I_DTL.mp4" and calls == ["pip"]


# ------------------------------------------------------------------ D: bridge --demo

class _MainSleep:
    """Stand-in for the time module: sleep() on the main thread ends cmd_bridge after `n` naps."""

    def __init__(self, n):
        self.n = n

    def __getattr__(self, name):
        return getattr(time, name)

    def sleep(self, s):
        if threading.current_thread() is not threading.main_thread():
            return time.sleep(s)
        self.n -= 1
        if self.n < 0:
            raise KeyboardInterrupt


def test_bridge_demo_uses_separate_dir_and_no_real_sniffer(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "BRIDGE_HUB", None)
    started = []
    monkeypatch.setattr(sw.OpenConnectMonitor, "start", lambda self: started.append(self))
    monkeypatch.setattr(sw, "time", _MainSleep(1))
    cfg = {"bridge": {"sessions_dir": str(tmp_path / "Sessions"), "demo_sessions_dir": str(tmp_path / "Demo")}}
    sw.cmd_bridge(cfg, demo=True, demo_interval=0.5, port=0)
    assert started == []
    assert not (tmp_path / "Sessions").exists()
    (f,) = list((tmp_path / "Demo").glob("*/shots.jsonl"))
    (rec,) = [json.loads(line) for line in f.read_text().splitlines()]
    assert rec["demo"] is True and rec["device_shot_num"] == 1
    assert sw.bridge_sessions_dir({}, demo=True) == sw.HERE / sw.BRIDGE_DEMO_SESSIONS_DIR
    assert sw.bridge_sessions_dir({}) == sw.HERE / "Swings/Sessions"


# ------------------------------------------------------------------ E: harden static IP ordering

def test_harden_static_ip_rolls_back_dhcp_and_removes_old_only_after_add():
    from test_doctor import _ctx
    cmd = next(c for _, c, _ in sw.harden_steps(_ctx()) if "New-NetIPAddress" in c)
    i_check = cmd.index("Get-NetIPAddress")
    i_off = cmd.index("-Dhcp Disabled")
    i_add = cmd.index("New-NetIPAddress")
    i_rollback = cmd.index("-Dhcp Enabled")
    i_throw = cmd.index("throw")
    i_remove = cmd.index("Remove-NetIPAddress")
    assert i_check < i_off < i_add < i_rollback < i_throw < i_remove
    assert "catch {" in cmd and "-ErrorAction Stop" in cmd[i_add:i_rollback]


# ------------------------------------------------------------------ F: windowless clip-ready

def test_clip_ready_command_prefers_pythonw(tmp_path):
    py = tmp_path / "Py 3" / "python.exe"
    py.parent.mkdir()
    py.write_bytes(b"")
    assert sw.windowless_python(str(py)) == str(py)  # no pythonw.exe -> python.exe
    (py.parent / "pythonw.exe").write_bytes(b"")
    assert sw.windowless_python(str(py)) == str(py.parent / "pythonw.exe")
    line = sw.kinovea_clip_ready_instruction("DTL", python_exe=str(py), script=r"C:\a b\simwatch.py")
    assert line.startswith(f'""{py.parent / "pythonw.exe"}" ')


# ------------------------------------------------------------------ G: reference swap off the sniffer thread

def test_club_change_swap_never_blocks_trigger(tmp_path, monkeypatch):
    cfg = _cfg(tmp_path)
    cfg["video"]["kinovea_backend"] = "2025"
    m, _ = _bare_manager(cfg)
    del m.trigger_capture
    m._ref_swap_sync = False
    m.active_reference = "My-Go-To"
    sw._KINOVEA_BACKEND_CACHE.clear()
    release, swapping, reloads, sent = threading.Event(), threading.Event(), [], []

    def slow_rig(cfg, club=None, **k):
        swapping.set()
        release.wait(5)
        reloads.append(club)

    monkeypatch.setattr(sw, "setup_video_rig", slow_rig)
    monkeypatch.setattr(sw, "tile_video_windows", lambda *a, **k: None)
    monkeypatch.setattr(sw, "send_udp_trigger", lambda port: sent.append(port) or True)
    m._on_club_change("DR")
    assert swapping.wait(2)                     # swap in progress on the worker thread...
    t0 = time.monotonic()
    m.trigger_capture()                          # ...and the trigger still goes out at once
    assert sent == [8875] and time.monotonic() - t0 < 0.5
    m._on_club_change("7I")
    m._on_club_change("DR")                      # coalesced: latest pending club is Driver again
    worker = m._ref_swap_thread
    release.set()
    worker.join(5)
    assert reloads == ["DR"] and m._swing_cat == "Driver" and m._ref_swap_thread is None


def test_trigger_fires_before_shot_is_recorded(tmp_path):
    m, calls = _bare_manager(_cfg(tmp_path))

    class _Hub:
        def record_shot(self, shot):
            calls.append("record")
            return shot

    m.hub = _Hub()
    m._on_openconnect_shot({"club": "7I", "ball_speed": 118.0, "carry": 160, "timestamp": time.time(),
                            "shot": {"ball": {"vla": 17}}})
    assert calls == ["trigger", "record", "pip"]


# ------------------------------------------------------------------ H: video rig start retried

def test_failed_video_start_is_retried_with_backoff(monkeypatch, tmp_path):
    from test_watchdog_reliability import _cfg as watch_cfg
    clock = {"t": 1_000_000.0}
    monkeypatch.setattr(sw.time, "time", lambda: clock["t"])
    monkeypatch.setattr(sw, "CHECKS", {k: (lambda c, cfg: (True, "ok"))
                                       for k in ("device_ping", "device_tcp", "bridge_link")})
    for name in ("_sleep_with_video", "write_status", "_bridge_note_health"):
        monkeypatch.setattr(sw, name, lambda *a, **k: None)
    monkeypatch.setattr(sw, "enforce_gspro_window_state", lambda cfg: None)
    monkeypatch.setattr(sw, "suppress_background_focus", lambda cfg: None)
    monkeypatch.setattr(sw, "PAUSE_PATH", tmp_path / "PAUSE")

    class VM:
        _started = False
        attempts = 0

        def start(self, launch_rig=True):
            self.attempts += 1
            if self.attempts == 1:
                raise OSError("Kinovea not installed yet")
            self._started = True

        def tick(self, **k):
            pass

    vm, st = VM(), sw._WatchState()
    sw._watch_step(watch_cfg(), st, vm)
    assert vm.attempts == 1 and st.gate_running and st.video_failures == 1
    clock["t"] += 5
    sw._watch_step(watch_cfg(), st, vm)
    assert vm.attempts == 1                      # backoff (15 s) not elapsed
    clock["t"] += 15
    sw._watch_step(watch_cfg(), st, vm)
    assert vm.attempts == 2 and vm._started and st.video_failures == 0
    clock["t"] += 60
    sw._watch_step(watch_cfg(), st, vm)
    assert vm.attempts == 2                      # started: never re-run


# ------------------------------------------------------------------ I: OpenConnect heartbeat / dedup

def test_openconnect_skips_heartbeats_and_dedups_over_30s(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(sw.time, "time", lambda: clock["t"])
    got = []
    mon = sw.OpenConnectMonitor(got.append, lambda club: None)
    beat = dict(OC_FULL, ShotDataOptions={"ContainsBallData": True, "IsHeartBeat": True})
    mon._feed_text(json.dumps(beat))
    mon._feed_text(json.dumps(dict(OC_FULL, ShotDataOptions={"ContainsBallData": False})))
    assert got == []
    mon._feed_text(json.dumps(OC_FULL))
    clock["t"] += 10                              # re-sent 10 s later (old 2 s window let it through)
    mon._feed_text(json.dumps(OC_FULL))
    assert len(got) == 1
    other = json.loads(json.dumps(OC_FULL))
    other["BallData"]["TotalSpin"] = 6100         # same ShotNumber, different ball -> a real shot
    mon._feed_text(json.dumps(other))
    assert len(got) == 2
    clock["t"] += 31
    mon._feed_text(json.dumps(OC_FULL))           # outside the window -> counted again
    assert len(got) == 3


# ------------------------------------------------------------------ J: clip-ready has its own log file

def test_clip_ready_logs_to_its_own_file(tmp_path, monkeypatch):
    log = tmp_path / "logs" / "clip-ready.log"
    monkeypatch.setattr(sw, "CLIP_READY_LOG", log)
    monkeypatch.setattr(sw, "HERE", tmp_path)  # the "watch" branch opens <HERE>/simwatch.log
    monkeypatch.setattr(threading, "excepthook", threading.excepthook)
    seen = {}
    monkeypatch.setattr(sw.logging, "basicConfig", lambda **k: seen.update(k))
    sw._configure_logging("clip-ready")
    files = [h for h in seen["handlers"] if isinstance(h, logging.FileHandler)]
    assert len(files) == 1 and Path(files[0].baseFilename) == log
    assert not any(isinstance(h, sw.RotatingFileHandler) for h in seen["handlers"])
    files[0].close()
    log.write_text("x" * 50)
    sw.clip_ready_log_handler(log, max_bytes=10).close()  # oversized at startup -> rolled once
    assert (log.parent / "clip-ready.log.1").read_text() == "x" * 50
    sw._configure_logging("watch")
    assert any(isinstance(h, sw.RotatingFileHandler) for h in seen["handlers"])
    for h in seen["handlers"]:
        h.close()
