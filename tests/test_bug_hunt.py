"""Regression tests for bugs found in the bug-hunting review (pure logic, Windows stubbed)."""
import os

import simwatch as sw


def _flaky_open(monkeypatch, lock_name: str, failures: int):
    """os.open raises PermissionError for the first `failures` O_EXCL opens of `lock_name` (Windows: the
    previous holder's unlinked lock file is still delete-pending -> ERROR_ACCESS_DENIED, not EEXIST)."""
    real_open = os.open
    calls = {"n": 0}

    def fake_open(path, flags, *a, **k):
        if str(path).endswith(lock_name) and flags & os.O_EXCL and calls["n"] < failures:
            calls["n"] += 1
            raise PermissionError(13, "Access is denied", str(path))
        return real_open(path, flags, *a, **k)

    monkeypatch.setattr(sw.os, "open", fake_open)
    return calls


def test_file_lock_retries_delete_pending_permission_error(tmp_path, monkeypatch):
    calls = _flaky_open(monkeypatch, ".x.lock", failures=3)
    with sw._FileLock(tmp_path / ".x.lock", timeout=5.0):
        assert (tmp_path / ".x.lock").exists()
    assert calls["n"] == 3
    assert not (tmp_path / ".x.lock").exists()


def test_file_lock_permission_error_times_out_as_busy(tmp_path, monkeypatch):
    _flaky_open(monkeypatch, ".y.lock", failures=10**6)
    try:
        with sw._FileLock(tmp_path / ".y.lock", timeout=0.3):
            raise AssertionError("must not acquire")
    except TimeoutError:
        pass  # callers (ShotStore.append, cmd_clip_ready) handle TimeoutError; a raw PermissionError dropped data


def test_shot_append_survives_delete_pending_lock(tmp_path, monkeypatch):
    store = sw.ShotStore(tmp_path)
    _flaky_open(monkeypatch, sw.SHOTS_LOCK_NAME, failures=2)
    rec = store.append({"ts": "2026-11-20T18:00:00.000-05:00", "club": "7I", "ball": {"speed": 120.0}})
    assert rec["shot_num"] == 1
    assert [r["club"] for r in store.read("2026-11-20")] == ["7I"]


class _FakeProc:
    def __init__(self, name):
        self._name = name

    def name(self):
        if isinstance(self._name, Exception):
            raise self._name
        return self._name


def _daemon_file(tmp_path, monkeypatch, proc_name):
    import json
    monkeypatch.setattr(sw, "DAEMON_INFO_PATH", tmp_path / "simwatch_daemon.json")
    sw.DAEMON_INFO_PATH.write_text(json.dumps({"pid": 4321, "command": "startup"}), encoding="utf-8")
    monkeypatch.setattr(sw.psutil, "pid_exists", lambda pid: True)
    monkeypatch.setattr(sw.psutil, "Process", lambda pid: _FakeProc(proc_name))


def test_stale_daemon_info_with_reused_pid_is_ignored(tmp_path, monkeypatch):
    # The daemon crashed (atexit never removed the file) and Windows handed its pid to another program.
    _daemon_file(tmp_path, monkeypatch, "chrome.exe")
    assert sw.read_daemon_info() is None


def test_daemon_info_trusted_for_python_or_unreadable_process(tmp_path, monkeypatch):
    _daemon_file(tmp_path, monkeypatch, "python.exe")
    assert sw.read_daemon_info()["pid"] == 4321
    _daemon_file(tmp_path, monkeypatch, sw.psutil.AccessDenied(4321))  # elevated daemon seen from a normal shell
    assert sw.read_daemon_info()["pid"] == 4321


def _started_manager(tmp_path, monkeypatch, profile):
    from test_adaptive_replay import FakeOps, _disp
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    cfg = {"video": {"swings_dir": str(tmp_path / "Swings"), "layout": {"profile": profile}}}
    monkeypatch.setattr(sw, "generate_obs_scene_collection", lambda cfg: None)
    monkeypatch.setattr(sw, "setup_video_rig", lambda *a, **k: {})
    monkeypatch.setattr(sw, "ensure_obs_running", lambda cfg: None)
    monkeypatch.setattr(sw, "tile_video_windows", lambda cfg, wait_sec=0.0: None)
    m = sw.SwingSessionManager(cfg)
    m.layout_ctl.ops = FakeOps([_disp(1366, 768)])
    m._snapshot_existing_files = lambda: None
    m.oc_monitor.start = lambda: None
    m.hotkeys.start = lambda: None
    m.start(launch_rig=True)
    return m


def test_rig_start_gives_gspro_the_keyboard_back(tmp_path, monkeypatch):
    # Launching Kinovea at rig start can steal the foreground; parking it behind GSPro must not leave the
    # keyboard (GSPro's own keys) going to a hidden Kinovea window.
    m = _started_manager(tmp_path, monkeypatch, "auto")
    assert m.layout_ctl.layout["profile"] == "single_small"
    assert m.layout_ctl.ops.focus == 1


def test_rig_start_grid_leaves_focus_alone(tmp_path, monkeypatch):
    m = _started_manager(tmp_path, monkeypatch, "grid")
    assert m.layout_ctl.ops.focus == 0


def test_bad_trigger_timing_config_still_fires_udp_trigger(monkeypatch):
    # e.g. config.local.json with "post_trigger_sec": null or "1.5s": float() raised inside trigger_capture,
    # so no UDP datagram was sent and the exception also skipped recording the shot.
    import threading
    m = object.__new__(sw.SwingSessionManager)
    m.cfg = {"video": {"post_trigger_sec": None, "pre_trigger_sec": "3s", "udp_trigger_port": "x"}}
    m.vcfg = m.cfg["video"]
    m._state_lock = threading.Lock()
    m._stop_capture_at = 0.0
    sent = []
    monkeypatch.setattr(sw, "resolve_kinovea_backend", lambda cfg: "2025")
    monkeypatch.setattr(sw, "send_udp_trigger", lambda port: sent.append(port) or True)
    m.trigger_capture()
    assert sent == [sw.KINOVEA_DEFAULT_UDP_PORT]


def test_bad_pip_popup_seconds_does_not_raise_on_shot_path(monkeypatch):
    pip = sw.ProjectorPiPController({"video": {"projector_pip": {"enabled": True, "popup_seconds": None}}})
    monkeypatch.setattr(pip, "_apply_overlay", lambda show: True)
    pip.show_for_shot()  # raised TypeError before -> _schedule_replay was skipped for the shot
    assert pip.visible is False and pip.hide_at > 0
