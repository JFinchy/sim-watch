"""Regression tests for code-review fixes: bad optional numbers, sniffer-thread survival, PiP hide spam."""
import logging
import sys
import types

import pytest

import simwatch as sw
from test_watchdog_reliability import _cfg, harness  # noqa: F401  (fixture re-export)


# ------------------------------------------------------------------ cfg_number / bad optional settings

@pytest.mark.parametrize("value,expected", [
    (3, 3.0), ("4", 4.0), (2.5, 2.5), ("y", 7.0), (None, 7.0), (True, 7.0), (-1, 7.0),
    (float("nan"), 7.0), (float("inf"), 7.0), ([1], 7.0),
])
def test_cfg_number(value, expected):
    assert sw.cfg_number(value, 7) == expected


def test_bad_offline_ticks_does_not_break_watch_step(harness):  # noqa: F811
    """validate_config only WARNS about device.offline_ticks; it used to raise ValueError on every tick."""
    results, calls, st, step, _ = harness
    cfg = _cfg(device={"ip": "169.254.6.44", "offline_ticks": "y"})
    results.update(device_ping=False, device_tcp=False)
    step(cfg, n=2)
    assert st.last_status == "device_check"  # default of 3 ticks applies
    step(cfg)
    assert st.last_status == "device_offline" and calls == []


def test_null_device_section_does_not_break_watch_step(harness):  # noqa: F811
    results, calls, st, step, _ = harness
    step(_cfg(device=None))
    assert st.last_status is True


def test_bad_socket_clear_sec_falls_back(monkeypatch):
    seen = []
    monkeypatch.setattr(sw, "kill_app", lambda app: None)
    monkeypatch.setattr(sw, "launch_app", lambda cfg, app, t: None)
    monkeypatch.setattr(sw, "release_fsx_for_recovery", lambda cfg: None)
    monkeypatch.setattr(sw, "wait_device_sockets_clear", lambda cfg, timeout: seen.append(timeout))
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    cfg = {"apps_by_key": {"integrator": {"key": "integrator", "process": "GameChanger.exe"}},
           "device": {"socket_clear_sec": "ten"}, "settle_sec": 0}
    sw._run_recovery_step(cfg, {"name": "t", "restart": ["integrator"]}, "test")
    assert seen == [10.0]


def test_backoff_sec_scalar_is_not_iterated_per_char():
    # "300" used to become [3.0, 0.0, 0.0]: a 3 s wait, then GameChanger restarts with no backoff at all.
    assert sw.device_backoff_sec({"device_recovery": {"backoff_sec": "300"}}, 1) == 300.0
    assert sw.device_backoff_sec({"device_recovery": {"backoff_sec": "300"}}, 3) == 300.0
    assert sw.device_backoff_sec({"device_recovery": {"backoff_sec": 600}}, 2) == 600.0


# ------------------------------------------------------------------ OpenConnect monitor survives bad input

SHOT = ('{"DeviceID":"LP","ShotNumber":%d,"Player":{"Club":"%s"},'
        '"BallData":{"Speed":112.4,"CarryDistance":151.2},"ShotDataOptions":{"ContainsBallData":true}}')


def test_raising_club_callback_does_not_kill_shot_detection():
    shots = []

    def boom(club):
        raise OSError("Kinovea descriptor locked")

    m = sw.OpenConnectMonitor(shots.append, boom)
    m._feed_text(SHOT % (1, "7I"))           # must not raise into _run()
    m._feed_text(SHOT % (2, "DR"))
    assert [s["shot_num"] for s in shots] == [1, 2]


def test_malformed_ball_data_does_not_raise():
    shots = []
    m = sw.OpenConnectMonitor(shots.append, lambda c: None)
    m._feed_text('{"ShotNumber":1,"BallData":{"Speed":"fast"}}')
    m._feed_text('{"ShotNumber":2,"BallData":{"Speed":100},"ShotDataOptions":"x"}')
    m._feed_text(SHOT % (3, "7I"))
    assert [s["shot_num"] for s in shots] == [3]


# ------------------------------------------------------------------ PiP auto-hide with OBS gone

@pytest.fixture()
def fake_win32(monkeypatch):
    for name in ("win32con", "win32gui"):
        mod = types.ModuleType(name)
        mod.SW_HIDE = 0
        mod.ShowWindow = lambda *a: None
        monkeypatch.setitem(sys.modules, name, mod)


def test_pip_auto_hide_with_window_gone_logs_once(fake_win32, monkeypatch, caplog):
    pip = sw.ProjectorPiPController({"video": {}})
    monkeypatch.setattr(pip, "_find_window", lambda: None)  # OBS was closed while the PiP was up
    pip.visible, pip.pinned, pip.hide_at = True, False, 1.0
    with caplog.at_level(logging.INFO, logger="simwatch"):
        for _ in range(5):
            pip.tick()
    assert pip.visible is False
    assert not [r for r in caplog.records if "auto-hidden" in r.getMessage()]


def test_pip_auto_hide_logs_real_hide(fake_win32, monkeypatch, caplog):
    pip = sw.ProjectorPiPController({"video": {}})
    monkeypatch.setattr(pip, "_find_window", lambda: 1234)
    pip.visible, pip.pinned, pip.hide_at = True, False, 1.0
    with caplog.at_level(logging.INFO, logger="simwatch"):
        pip.tick()
        pip.tick()
    assert pip.visible is False
    assert len([r for r in caplog.records if "auto-hidden" in r.getMessage()]) == 1
