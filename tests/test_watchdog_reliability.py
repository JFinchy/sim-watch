"""Watchdog reliability logic (pure logic; all Windows / process / network calls are stubbed)."""
import os
import time
from collections import namedtuple
from datetime import datetime, timedelta

import pytest

import simwatch as sw

Addr = namedtuple("Addr", "ip port")
Conn = namedtuple("Conn", "pid status laddr raddr")


@pytest.fixture(autouse=True)
def _reset_device_runtime():
    sw._DEVICE_RUNTIME["learned_ip"] = None
    yield
    sw._DEVICE_RUNTIME["learned_ip"] = None


# ------------------------------------------------------------------ watch-step harness

DEVICE_CHECKS = [
    {"name": "ping", "type": "device_ping", "ip": "169.254.6.44", "device": True},
    {"name": "tcp", "type": "device_tcp", "app": "integrator", "device": True},
    {"name": "bridge", "type": "bridge_link", "recovery_level": 1},
]


def _cfg(**over):
    cfg = {
        "interval_sec": 0, "fail_threshold": 3, "post_recover_grace_sec": 0, "only_when_running": None,
        "checks": DEVICE_CHECKS,
        "recovery": [{"name": "l0", "restart": ["gspro_connect", "integrator"]},
                     {"name": "l1", "restart": ["gspro", "gspro_connect", "integrator"]}],
        "device_recovery": {"restart": ["integrator"], "backoff_sec": [300, 900, 1800]},
        "apps_by_key": {}, "device": {"ip": "169.254.6.44"},
    }
    cfg.update(over)
    return cfg


@pytest.fixture()
def harness(monkeypatch, tmp_path):
    """Stub checks + recovery; `results` dict controls each check, `calls` records recoveries."""
    results = {"device_ping": True, "device_tcp": True, "bridge_link": True}
    calls = []
    clock = {"t": 1_000_000.0}
    monkeypatch.setattr(sw, "CHECKS", {k: (lambda kk: lambda c, cfg: (results[kk], kk))(k) for k in results})
    monkeypatch.setattr(sw, "recover", lambda cfg, lvl: calls.append(("ladder", lvl)))
    monkeypatch.setattr(sw, "recover_device", lambda cfg: calls.append(("device",)))
    monkeypatch.setattr(sw, "_sleep_with_video", lambda *a, **k: None)
    monkeypatch.setattr(sw, "write_status", lambda *a, **k: None)
    monkeypatch.setattr(sw, "_bridge_note_health", lambda *a, **k: None)
    monkeypatch.setattr(sw, "enforce_gspro_window_state", lambda cfg: None)
    monkeypatch.setattr(sw, "suppress_background_focus", lambda cfg: None)
    monkeypatch.setattr(sw, "alert", lambda msg: calls.append(("alert",)))
    monkeypatch.setattr(sw, "PAUSE_PATH", tmp_path / "PAUSE")
    monkeypatch.setattr(sw.time, "time", lambda: clock["t"])
    st = sw._WatchState()
    st.gate_running = True  # skip the first-run GSPro-config / video branch

    def step(cfg=None, n=1):
        for _ in range(n):
            sw._watch_step(cfg or _cfg(), st, None)
            clock["t"] += 5

    return results, calls, st, step, clock


def test_device_offline_alone_restarts_nothing(harness):
    results, calls, st, step, _ = harness
    results.update(device_ping=False, device_tcp=False)
    step(n=10)
    assert calls == [] and st.last_status == "device_offline"


def test_ping_failure_does_not_suppress_non_device_recovery(harness):
    results, calls, st, step, _ = harness
    results.update(device_ping=False, device_tcp=False, bridge_link=False)  # device off AND GSPconnect hung
    step(n=3)
    assert calls == [("ladder", 1)]  # level from the non-device check only; recovery still escalates


def test_offline_debounce_needs_three_ticks(harness):
    results, calls, st, step, _ = harness
    results.update(device_ping=False, device_tcp=False)
    step(n=2)
    assert st.last_status == "device_check" and st.offline_ticks == 2
    step()
    assert st.last_status == "device_offline"
    results.update(device_ping=True, device_tcp=True)
    step()
    assert st.offline_ticks == 0


def test_ping_fail_with_live_session_is_ignored(harness):
    results, calls, st, step, _ = harness
    results.update(device_ping=False)  # GameChanger still connected -> not offline, not a failure
    step(n=5)
    assert calls == [] and st.last_status is True


def test_device_only_backoff_schedule(harness):
    results, calls, st, step, clock = harness
    results.update(device_tcp=False)  # ping ok, GameChanger has no session
    step(n=3)
    assert calls == [("device",)] and st.device_attempts == 1
    step(n=3 * 19)  # < 5 min later: still backing off
    assert calls == [("device",)]
    clock["t"] = st.device_next_at
    step(n=3)
    assert calls == [("device",)] * 2
    assert st.device_next_at - clock["t"] == pytest.approx(900, abs=20)
    clock["t"] = st.device_next_at
    step(n=3)
    assert st.device_next_at - clock["t"] == pytest.approx(1800, abs=20)
    clock["t"] = st.device_next_at
    step(n=3)
    assert st.device_next_at - clock["t"] == pytest.approx(1800, abs=20)  # capped
    assert ("ladder", 0) not in calls  # never escalates to the GSPconnect/GSPro ladder
    results.update(device_tcp=True)
    step()
    assert st.device_attempts == 0 and st.device_next_at == 0.0


def test_device_backoff_sec_helper():
    cfg = {"device_recovery": {"backoff_sec": [300, 900, 1800]}}
    assert [sw.device_backoff_sec(cfg, n) for n in (1, 2, 3, 4, 9)] == [300, 900, 1800, 1800, 1800]
    assert sw.device_backoff_sec({}, 1) == 300
    assert sw.device_recovery_cfg({})["restart"] == ["integrator"]


def test_evaluate_checks_splits_device_and_non_device(monkeypatch):
    monkeypatch.setattr(sw, "CHECKS", {"device_ping": lambda c, cfg: (False, ""),
                                       "device_tcp": lambda c, cfg: (False, ""),
                                       "bridge_link": lambda c, cfg: (False, "")})
    res = sw.evaluate_checks(_cfg(), verbose=False)
    assert res["device_offline_raw"] and res["non_device_failing"] == ["bridge"]
    assert res["non_device_level"] == 1 and res["device_failing"] == ["ping", "tcp"]


# ------------------------------------------------------------------ learned IP

def test_learned_ip_used_for_ping(monkeypatch):
    sess = Conn(42, "ESTABLISHED", Addr("169.254.1.2", 50000), Addr("169.254.99.7", 9970))
    monkeypatch.setattr(sw, "find_procs", lambda name: [type("P", (), {"pid": 42})()])
    monkeypatch.setattr(sw, "_find_device_tcp_session", lambda pids, ip, ports: sess)
    monkeypatch.setattr(sw, "link_kind", lambda ip: "wired")
    cfg = {"apps_by_key": {"integrator": {"key": "integrator", "process": "GameChanger.exe"}},
           "device": {"ip": "169.254.6.44", "ports": [9970]}}
    chk = {"name": "ping", "type": "device_ping", "ip": "169.254.6.44"}
    assert sw.device_ping_target(chk, cfg) == "169.254.6.44"  # fallback before any session is seen
    ok, _ = sw.check_device_tcp({"app": "integrator"}, cfg)
    assert ok and sw._DEVICE_RUNTIME["learned_ip"] == "169.254.99.7"
    seen = {}

    def fake_run(argv, **kw):
        seen["argv"] = argv
        return type("R", (), {"returncode": 0, "stdout": "Reply from x: TTL=64"})()

    monkeypatch.setattr(sw.subprocess, "run", fake_run)
    ok, msg = sw.check_device_ping(chk, cfg)
    assert ok and seen["argv"] == ["ping", "-n", "2", "-w", "1000", "169.254.99.7"]


# ------------------------------------------------------------------ PAUSE expiry

def test_pause_fresh_is_active(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "PAUSE_PATH", tmp_path / "PAUSE")
    sw.write_pause("testing")
    assert "paused_at:" in (tmp_path / "PAUSE").read_text()
    assert sw.pause_active({"pause_max_hours": 4}) is True


def test_pause_stale_timestamp_is_ignored_and_removed(tmp_path):
    p = tmp_path / "PAUSE"
    old = (datetime.now().astimezone() - timedelta(hours=5)).isoformat(timespec="seconds")
    p.write_text(f"paused_at: {old}\n", encoding="utf-8")
    assert sw.pause_active({"pause_max_hours": 4}, path=p) is False
    assert not p.exists()


def test_pause_without_timestamp_uses_mtime(tmp_path):
    p = tmp_path / "PAUSE"
    p.write_text("", encoding="utf-8")
    assert sw.pause_active({}, path=p) is True  # default 4 h, brand new file
    t = time.time() - 5 * 3600
    os.utime(p, (t, t))
    assert sw.pause_active({}, path=p) is False and not p.exists()


def test_pause_absent():
    assert sw.pause_active({}, path=sw.Path("/nonexistent/dir/PAUSE")) is False


# ------------------------------------------------------------------ club category / wait_port / sockets

@pytest.mark.parametrize("club", ["PT", "pt", "Putter", " PUTTER "])
def test_putter_is_not_iron(club):
    assert sw.club_category(club) == "Putter"


def test_wait_port_uses_listen_socket_not_connect(monkeypatch):
    def no_connect(*a, **k):
        raise AssertionError("wait_port must not connect to the port")

    monkeypatch.setattr(sw.socket, "create_connection", no_connect)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    monkeypatch.setattr(sw.psutil, "net_connections", lambda kind: [
        Conn(1, sw.psutil.CONN_ESTABLISHED, Addr("127.0.0.1", 9050), Addr("127.0.0.1", 6000)),
    ])
    assert sw.wait_port(9050, 0.05) is False  # ESTABLISHED alone isn't LISTEN
    monkeypatch.setattr(sw.psutil, "net_connections", lambda kind: [
        Conn(1, sw.psutil.CONN_LISTEN, Addr("0.0.0.0", 9050), ()),
    ])
    assert sw.wait_port(9050, 5) is True


def test_wait_device_sockets_clear(monkeypatch):
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    lingering = [Conn(0, sw.psutil.CONN_TIME_WAIT, Addr("169.254.1.2", 50000), Addr("169.254.6.44", 9970))]
    seq = [lingering, lingering, []]
    monkeypatch.setattr(sw.psutil, "net_connections", lambda kind: seq.pop(0) if seq else [])
    assert sw.wait_device_sockets_clear({"device": {"ports": [9970]}}, timeout=10) is True
    monkeypatch.setattr(sw.psutil, "net_connections", lambda kind: lingering)
    assert sw.wait_device_sockets_clear({"device": {"ports": [9970]}}, timeout=0) is False


def test_recovery_never_clicks_fsx(monkeypatch):
    killed = []
    apps = {k: {"key": k, "process": k} for k in ("integrator", "fs_connector")}
    cfg = {"apps_by_key": apps, "device_recovery": {"restart": ["integrator"]}, "settle_sec": 0, "device": {}}
    monkeypatch.setattr(sw, "fsx_disconnect", lambda *a, **k: (_ for _ in ()).throw(AssertionError("clicked")))
    monkeypatch.setattr(sw, "fsx_session", lambda cfg: object())  # FSX Pro holds the device
    monkeypatch.setattr(sw, "kill_app", lambda app, timeout=8: killed.append(app["key"]))
    monkeypatch.setattr(sw, "launch_app", lambda cfg, app, t: None)
    monkeypatch.setattr(sw, "wait_device_sockets_clear", lambda cfg, timeout=10: True)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    sw.recover_device(cfg)
    assert killed == []  # FSX Pro holds the device: leave it alone and don't bounce GameChanger either


def test_fsx_holding_device_is_not_treated_as_failure(harness, monkeypatch):
    results, calls, st, step, _ = harness
    monkeypatch.setattr(sw, "fsx_holds_device", lambda cfg: True)
    results.update(device_tcp=False)  # Launch Pro pings, GameChanger has no session (FSX Pro has it)
    step(n=10)
    assert calls == [] and st.last_status == "fsx_holds_device"
    monkeypatch.setattr(sw, "fsx_holds_device", lambda cfg: False)  # user ran release-device / closed FSX
    step(n=3)
    assert ("device",) in calls


def test_ladder_step_keeps_other_apps_when_fsx_holds_device(monkeypatch):
    killed, launched = [], []
    apps = {k: {"key": k, "process": k} for k in ("integrator", "connector", "fs_connector")}
    cfg = {"apps_by_key": apps, "settle_sec": 0, "device": {}}
    monkeypatch.setattr(sw, "fsx_session", lambda cfg: object())
    monkeypatch.setattr(sw, "kill_app", lambda app, timeout=8: killed.append(app["key"]))
    monkeypatch.setattr(sw, "launch_app", lambda cfg, app, t: launched.append(app["key"]))
    monkeypatch.setattr(sw, "wait_device_sockets_clear", lambda cfg, timeout=10: True)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    sw._run_recovery_step(cfg, {"name": "x", "restart": ["integrator", "connector"]}, "ladder")
    assert killed == ["connector"] and launched == ["connector"]


def test_device_checks_inherit_device_ip_from_config():
    import json, pathlib
    import simwatch
    cfg = json.loads((pathlib.Path(simwatch.__file__).parent / "config.json").read_text())
    dev_checks = [c for c in cfg["checks"] if c.get("type") in ("device_ping", "device_tcp")]
    assert dev_checks and all("ip" not in c for c in dev_checks)
    errs = [m for lvl, m in simwatch.validate_config(cfg, check_paths=False) if lvl == "error"]
    assert not any("missing 'ip'" in m for m in errs), errs
    # Target falls back to device.ip, so a config.local.json override of device.ip reaches the checks.
    cfg["device"]["ip"] = "169.254.9.9"
    ping = next(c for c in dev_checks if c["type"] == "device_ping")
    simwatch._DEVICE_RUNTIME.pop("learned_ip", None)
    assert simwatch.device_ping_target(ping, cfg) == "169.254.9.9"


def test_stop_other_instances_skips_own_venv_launcher_parent(monkeypatch):
    """Windows venv launcher: parent process has the same simwatch cmdline and must not be killed."""
    import simwatch

    killed = []

    class FakeProc:
        def __init__(self, pid, cmdline):
            self.pid = pid
            self.info = {"pid": pid, "name": "python.exe", "cmdline": cmdline}

        def terminate(self):
            killed.append(self.pid)

        def kill(self):
            killed.append(self.pid)

    me, launcher, stale = 200, 100, 300
    cmd = ["python.exe", "simwatch.py", "startup"]
    procs = [FakeProc(launcher, cmd), FakeProc(me, cmd), FakeProc(stale, cmd)]

    class FakeSelf:
        def parents(self):
            return [FakeProc(launcher, cmd)]

    monkeypatch.setattr(simwatch.os, "getpid", lambda: me)
    monkeypatch.setattr(simwatch.psutil, "process_iter", lambda attrs=None: iter(procs))
    monkeypatch.setattr(simwatch.psutil, "Process", lambda *a, **k: FakeSelf())
    monkeypatch.setattr(simwatch.psutil, "wait_procs", lambda ps, timeout=None: (ps, []))
    assert simwatch.stop_other_simwatch_instances() == 1
    assert killed == [stale]


def test_stop_other_instances_spares_direct_parent_when_psutil_walk_fails(monkeypatch):
    """If psutil.Process().parents() raises, the launcher parent (os.getppid) must still be spared."""
    import simwatch

    killed = []

    class FakeProc:
        def __init__(self, pid, cmdline):
            self.pid = pid
            self.info = {"pid": pid, "name": "python.exe", "cmdline": cmdline}

        def terminate(self):
            killed.append(self.pid)

        def kill(self):
            killed.append(self.pid)

    me, launcher, stale = 200, 100, 300
    cmd = ["python.exe", "simwatch.py", "startup"]
    procs = [FakeProc(launcher, cmd), FakeProc(me, cmd), FakeProc(stale, cmd)]

    def broken_process(*a, **k):
        raise simwatch.psutil.AccessDenied(launcher)

    monkeypatch.setattr(simwatch.os, "getpid", lambda: me)
    monkeypatch.setattr(simwatch.os, "getppid", lambda: launcher)
    monkeypatch.setattr(simwatch.psutil, "process_iter", lambda attrs=None: iter(procs))
    monkeypatch.setattr(simwatch.psutil, "Process", broken_process)
    monkeypatch.setattr(simwatch.psutil, "wait_procs", lambda ps, timeout=None: (ps, []))
    assert simwatch.stop_other_simwatch_instances() == 1
    assert killed == [stale]


# ------------------------------------------------------------------ review fixes (2026-11-19)

def test_post_recover_grace_holds_off_next_level(harness):
    """After a ladder recovery, apps still starting must not trigger the next (heavier) level immediately."""
    results, calls, st, step, clock = harness
    results.update(bridge_link=False)
    cfg = _cfg(post_recover_grace_sec=60,
               checks=[{"name": "bridge", "type": "bridge_link", "recovery_level": 0}])
    step(cfg, n=3)
    assert calls == [("ladder", 0)]
    step(cfg, n=6)  # 30 s, inside the 60 s grace
    assert calls == [("ladder", 0)] and st.last_status == "post_recover_grace"
    step(cfg, n=10)  # grace expired, still failing -> escalate
    assert calls[-1] == ("ladder", 1)


def test_bad_pause_max_hours_does_not_crash(tmp_path):
    p = tmp_path / "PAUSE"
    p.write_text("x")
    assert sw.pause_active({"pause_max_hours": "four"}, p) is True


def test_bad_backoff_sec_falls_back():
    assert sw.device_backoff_sec({"device_recovery": {"backoff_sec": ["soon"]}}, 1) == 300.0


def test_validate_config_warns_on_bad_device_numbers():
    msgs = [m for sev, m in sw.validate_config({"pause_max_hours": "x", "device": {"offline_ticks": "y"},
                                                "device_recovery": {"backoff_sec": "z"}}, check_paths=False)
            if sev == "warning"]
    assert any("pause_max_hours" in m for m in msgs)
    assert any("offline_ticks" in m for m in msgs)
    assert any("backoff_sec" in m for m in msgs)
