"""ShotLab companion supervisor: launch/adopt/crash/hang/user-close state machine (pure logic, no Electron)."""
import json

import simwatch as sw


class FakeProc:
    def __init__(self, pid=4242):
        self.pid = pid
        self.rc = None
        self.killed = False

    def poll(self):
        return self.rc

    def kill(self):
        self.killed = True
        self.rc = 1

    def wait(self, timeout=None):
        return self.rc


class Rig:
    """Injectable collaborators + a controllable clock."""

    def __init__(self, **shotlab_cfg):
        self.now = 1000.0
        self.health = None
        self.port_owner = None
        self.installed = True
        self.launches = []
        cfg = {"shotlab": {"enabled": True, "startup_grace_sec": 30, "health_fail_ticks": 3,
                           "restart_backoff_sec": [10, 60], "healthy_reset_sec": 100, **shotlab_cfg}}
        self.sup = sw.ShotLabSupervisor(
            cfg,
            launcher=self._launch,
            probe=lambda: self.health,
            port_owner=lambda: self.port_owner,
            clock=lambda: self.now,
            installed=lambda: self.installed,
        )

    def _launch(self, activate=False):
        self.activations = getattr(self, "activations", []) + [activate]
        p = FakeProc(pid=4242 + len(self.launches))
        self.launches.append(p)
        return p

    def tick(self, gate_up=True, dt=5.0):
        self.now += dt
        self.sup.tick(gate_up)
        return self.sup.state


HEALTHY = {"app": "shotlab", "pid": 4242, "bridgeConnected": True, "obsClients": 2}


def test_disabled_never_launches():
    r = Rig(enabled=False)
    assert r.tick() == "disabled" and not r.launches


def test_waits_for_gate_then_launches_and_runs():
    r = Rig()
    assert r.tick(gate_up=False) == "idle" and not r.launches
    assert r.tick() == "starting" and len(r.launches) == 1
    assert r.tick() == "starting"  # within grace, no health yet
    r.health = HEALTHY
    assert r.tick() == "running"
    st = r.sup.status()
    assert st["pid"] == 4242 and st["bridge_connected"] is True and st["obs_clients"] == 2


def test_user_close_stays_closed_until_next_gspro_session():
    r = Rig()
    r.tick()
    r.health = HEALTHY
    r.tick()
    r.launches[0].rc = 0
    r.health = None
    assert r.tick() == "user_closed"
    assert r.tick() == "user_closed" and len(r.launches) == 1
    r.tick(gate_up=False)  # GSPro closed
    assert r.tick() == "starting" and len(r.launches) == 2  # GSPro back -> ShotLab back


def test_crash_relaunches_with_backoff_and_backoff_resets_after_stable_run():
    r = Rig()
    r.tick()
    r.launches[0].rc = 3
    assert r.tick() == "restart_pending"
    assert r.tick() == "restart_pending" and len(r.launches) == 1  # 5s < 10s backoff
    assert r.tick(dt=6) == "starting" and len(r.launches) == 2
    r.launches[1].rc = 3
    r.tick()
    assert r.sup.attempts == 2 and r.sup._backoff() == 60
    r.tick(dt=61)
    assert len(r.launches) == 3
    r.health = HEALTHY
    r.tick()
    r.tick(dt=101)
    assert r.sup.state == "running" and r.sup.attempts == 0


def test_hung_process_that_owns_its_port_is_killed_and_relaunched():
    r = Rig()
    r.tick()
    r.port_owner = 4242
    r.tick(dt=31)  # past grace: fail 1
    r.tick()
    assert r.sup.state == "unresponsive"
    r.tick()  # fail 3 -> kill
    assert r.launches[0].killed and r.sup.state == "restart_pending"


def test_port_conflict_is_reported_not_restart_looped():
    r = Rig()
    r.tick()
    r.port_owner = 999  # something else holds :8766
    for _ in range(6):
        r.tick(dt=31)
    assert r.sup.state == "port_conflict" and not r.launches[0].killed and len(r.launches) == 1
    assert "999" in r.sup.status()["detail"]


def test_manually_started_instance_is_adopted_never_launched_over():
    r = Rig()
    r.health = HEALTHY
    assert r.tick() == "adopted" and not r.launches
    r.health = None
    assert r.tick() == "user_closed" and not r.launches


def test_not_installed_reports_and_does_not_launch():
    r = Rig()
    r.installed = False
    assert r.tick() == "not_installed" and not r.launches


def test_status_extras_merge_into_status_file(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "STATUS_PATH", tmp_path / "simwatch_status.json")
    monkeypatch.setitem(sw.STATUS_EXTRAS, "shotlab", {"state": "running", "port": 8766})
    sw.write_status("healthy", failing=[])
    doc = json.loads((tmp_path / "simwatch_status.json").read_text())
    assert doc["state"] == "healthy" and doc["shotlab"]["state"] == "running"


def test_health_changes_broadcast_to_bridge_clients(tmp_path, monkeypatch):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    monkeypatch.setattr(sw, "BRIDGE_HUB", hub)
    q = hub.subscribe()
    try:
        sw._bridge_note_health("healthy", {"all_ok": True, "failing": []})
        sw._bridge_note_health("healthy", {"all_ok": True, "failing": []})  # unchanged -> no event
        sw._bridge_note_health("recovering", {"all_ok": False, "failing": ["GSPconnect to GSPro"]})
        events = []
        while not q.empty():
            events.append(q.get_nowait())
        health = [json.loads(d) for ev, d in events if ev == "health"]
        assert [h["state"] for h in health] == ["healthy", "recovering"]
        assert health[1]["failing"] == ["GSPconnect to GSPro"]
    finally:
        hub.unsubscribe(q)


def test_shotlab_config_defaults_and_doctor_rows_when_disabled():
    assert sw.shotlab_config({})["enabled"] is False
    assert sw.shotlab_config({"shotlab": {"enabled": True, "_note": "x"}})["obs_port"] == 8766
    rows = sw.doctor_shotlab_rows({})
    assert rows[0][0] == sw.INFO and "disabled" in rows[0][2]


def test_launch_now_reopens_after_user_close_and_is_then_supervised():
    r = Rig()
    r.tick()
    r.health = HEALTHY
    r.tick()
    r.launches[0].rc = 0
    r.health = None
    r.tick()
    assert r.sup.state == "user_closed"
    assert r.sup.launch_now() is True
    assert len(r.launches) == 2 and r.activations[-1] is True and r.sup.state == "starting"
    assert r.sup.launch_now() is True and len(r.launches) == 2  # already running -> no second copy
    r.launches[1].rc = 5  # crash after a hotkey launch still gets relaunched
    assert r.tick() == "restart_pending"


# --------------------------------------------------------------------------- hotkeys

def test_effective_hotkeys_defaults_overrides_and_disable():
    hk = sw.effective_hotkeys({"toggle_pip": "F9", "open_drills": ""})
    assert hk["cheatsheet"] == "Alt+H" and hk["toggle_shotlab"] == "Alt+S"
    assert hk["toggle_pip"] == "F9" and "open_drills" not in hk
    assert all(sw.parse_hotkey(spec) for spec in sw.effective_hotkeys({}).values())


def test_default_hotkeys_are_unique():
    specs = [d.upper() for _, d, _ in sw.HOTKEY_ACTIONS]
    assert len(specs) == len(set(specs))


def test_cheatsheet_flags_unregistered_keys():
    rows = sw.hotkey_rows({}, {"toggle_shotlab": "failed", "toggle_pip": "ctrl_alt_only", "cheatsheet": "ok"})
    text = sw.format_hotkey_cheatsheet(rows)
    assert "Alt+S" in text and "NOT REGISTERED" in text
    assert "use Ctrl+Alt+P" in text
    assert text.count("NOT REGISTERED") == 1


def test_bridge_status_includes_hotkeys(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    assert hub.status()["hotkeys"] == []
    hub.hotkeys_fn = lambda: sw.hotkey_rows({}, {"cheatsheet": "ok"})
    doc = hub.status()
    assert doc["hotkeys"][0] == {"action": "cheatsheet", "keys": "Alt+H",
                                 "label": "Show / hide this key cheat sheet", "state": "ok"}


def test_running_watchdog_status_requires_a_live_simwatch_process(tmp_path, monkeypatch):
    path = tmp_path / "simwatch_status.json"
    monkeypatch.setattr(sw, "STATUS_PATH", path)
    assert sw.running_watchdog_status() is None

    class FakeProcess:
        procs = {}

        def __init__(self, pid):
            if pid not in self.procs:
                raise sw.psutil.NoSuchProcess(pid)
            self._name, self._cmd = self.procs[pid]

        def name(self):
            return self._name

        def cmdline(self):
            return self._cmd

    FakeProcess.procs = {111: ("python.exe", ["python", "simwatch.py", "startup"]),
                         222: ("chrome.exe", ["chrome.exe"])}  # PID reused by something else
    monkeypatch.setattr(sw.psutil, "Process", FakeProcess)
    path.write_text(json.dumps({"state": "healthy", "pid": 333}))
    assert sw.running_watchdog_status() is None  # dead
    path.write_text(json.dumps({"state": "healthy", "pid": 222}))
    assert sw.running_watchdog_status() is None  # reused PID
    path.write_text(json.dumps({"state": "stopped", "pid": 111}))
    assert sw.running_watchdog_status() is None
    path.write_text(json.dumps({"state": "healthy", "pid": 111, "hotkeys": []}))
    assert sw.running_watchdog_status()["state"] == "healthy"


# --------------------------------------------------------------------------- review regressions

def test_pause_toggle_does_not_reopen_a_user_closed_shotlab():
    r = Rig()
    r.tick()
    r.health = HEALTHY
    r.tick()
    r.launches[0].rc = 0
    r.health = None
    assert r.tick() == "user_closed"
    r.now += 5
    r.sup.tick(True, paused=True)   # reconnect writes PAUSE
    r.now += 5
    r.sup.tick(True, paused=False)  # release-device removes it; GSPro never stopped
    assert r.sup.state == "user_closed" and len(r.launches) == 1


def test_pause_blocks_launching():
    r = Rig()
    r.now += 5
    r.sup.tick(True, paused=True)
    assert not r.launches
    r.now += 5
    r.sup.tick(True, paused=False)
    assert len(r.launches) == 1


def test_quick_exit_zero_before_healthy_means_another_instance_not_user_close():
    r = Rig()
    r.tick()                      # launch
    r.launches[0].rc = 0          # single-instance lock held elsewhere -> quits immediately
    assert r.tick() == "other_instance"
    assert "Task Manager" in r.sup.status()["detail"]
    assert r.tick() == "other_instance" and len(r.launches) == 1   # backoff, no tight loop
    r.tick(dt=11)
    assert len(r.launches) == 2   # retries after backoff


def test_bad_shotlab_config_values_fall_back_to_defaults():
    cfg = sw.shotlab_config({"shotlab": {"enabled": True, "obs_port": None, "restart_backoff_sec": 30,
                                         "health_fail_ticks": "x", "startup_grace_sec": -1, "dir": ""}})
    assert cfg["enabled"] is True
    assert cfg["obs_port"] == 8766 and cfg["restart_backoff_sec"] == [10, 30, 120, 300]
    assert cfg["health_fail_ticks"] == 6 and cfg["startup_grace_sec"] == 45 and cfg["dir"] == "shotlab"
    sup = sw.ShotLabSupervisor({"shotlab": {"enabled": True, "obs_port": "nope"}},
                               launcher=lambda activate=False: None, probe=lambda: None,
                               port_owner=lambda: None, installed=lambda: True)
    assert sup.port == 8766


def test_supervisor_errors_never_escape_tick():
    r = Rig()
    r.sup._probe = lambda: (_ for _ in ()).throw(RuntimeError("boom"))
    r.tick()  # must not raise
    assert r.sup.state == "error" and "boom" in r.sup.status()["detail"]
