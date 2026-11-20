"""Practice-video handoff / no-kill singleton, opt-in phone (LAN) bridge access, narrowed firewall scopes."""
import http.client
import os
import time
from pathlib import Path

import pytest

import simwatch as sw

ROOT = Path(__file__).resolve().parent.parent


# ================================================================== 1. daemon handoff

@pytest.fixture()
def coord(tmp_path, monkeypatch):
    """Daemon coordination files in a temp dir; singleton state reset; killing forbidden."""
    monkeypatch.setattr(sw, "DAEMON_INFO_PATH", tmp_path / "simwatch_daemon.json")
    monkeypatch.setattr(sw, "VIDEO_REQUEST_PATH", tmp_path / "VIDEO_ON")
    monkeypatch.setattr(sw, "STOP_REQUEST_PATH", tmp_path / "STOP_REQUEST")
    monkeypatch.setattr(sw, "STATUS_PATH", tmp_path / "status.json")
    monkeypatch.setattr(sw, "_SINGLETON_MUTEX", None)
    monkeypatch.setattr(sw, "_DAEMON_STARTED", 0.0)
    monkeypatch.setattr(sw.atexit, "register", lambda *a, **k: None)

    def no_kill():
        raise AssertionError("must not kill the running SimWatch")

    monkeypatch.setattr(sw, "stop_other_simwatch_instances", no_kill)
    return tmp_path


def test_lock_held_returns_false_without_killing(coord, monkeypatch):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    assert sw.acquire_singleton_lock("watch") is False
    assert not sw.DAEMON_INFO_PATH.exists()


def test_lock_acquired_writes_info_and_clears_stale_requests(coord, monkeypatch):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "acquired")
    sw.VIDEO_REQUEST_PATH.write_text("old", encoding="utf-8")
    sw.STOP_REQUEST_PATH.write_text("old", encoding="utf-8")
    assert sw.acquire_singleton_lock("startup") is True
    info = __import__("json").loads(sw.DAEMON_INFO_PATH.read_text(encoding="utf-8"))
    assert info["pid"] == os.getpid() and info["command"] == "startup"
    assert not sw.VIDEO_REQUEST_PATH.exists() and not sw.STOP_REQUEST_PATH.exists()
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    assert sw.acquire_singleton_lock("watch") is True  # startup -> watch re-entry in the same process


def test_unavailable_mutex_falls_back_to_process_scan(coord, monkeypatch):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "unavailable")
    monkeypatch.setattr(sw, "find_simwatch_daemons", lambda: [object()])
    assert sw.acquire_singleton_lock("watch") is False


def test_second_watch_exits_with_message(coord, monkeypatch, capsys):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    monkeypatch.setattr(sw, "running_daemon", lambda: {"pid": 4242, "command": "startup"})
    monkeypatch.setattr(sw, "start_bridge", lambda *a, **k: pytest.fail("must not start a second bridge"))
    sw.watch({"video": {"enabled": False}, "apps_by_key": {}})
    out = capsys.readouterr().out
    assert "already running" in out and "4242" in out and "simwatch.py stop" in out


def test_second_startup_exits_with_message(coord, monkeypatch, capsys):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    monkeypatch.setattr(sw, "running_daemon", lambda: None)
    sw.startup({"startup": {"order": ["x"]}})
    assert "already running" in capsys.readouterr().out


def test_video_hands_off_to_running_daemon(coord, monkeypatch, capsys):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    monkeypatch.setattr(sw, "running_daemon", lambda: {"pid": 77, "command": "startup"})
    monkeypatch.setattr(sw, "SwingSessionManager", lambda cfg: pytest.fail("standalone rig must not start"))
    assert sw.cmd_video({}) == 0
    assert sw.VIDEO_REQUEST_PATH.exists()
    out = capsys.readouterr().out
    assert "asked it to start the video rig" in out and "video off" in out


def test_video_unknown_holder_still_requests(coord, monkeypatch):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    monkeypatch.setattr(sw, "running_daemon", lambda: None)  # elevated daemon, cmdline unreadable, no info file
    assert sw.cmd_video({}) == 0 and sw.VIDEO_REQUEST_PATH.exists()


def test_video_when_standalone_video_already_runs(coord, monkeypatch, capsys):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "held")
    monkeypatch.setattr(sw, "running_daemon", lambda: {"pid": 5, "command": "video"})
    assert sw.cmd_video({}) == 0
    assert not sw.VIDEO_REQUEST_PATH.exists()
    assert "already running" in capsys.readouterr().out


def test_video_off_clears_request(coord, monkeypatch, capsys):
    monkeypatch.setattr(sw, "running_daemon", lambda: {"pid": 1, "command": "watch"})
    sw.write_video_request()
    assert sw.cmd_video({}, "off") == 0
    assert not sw.VIDEO_REQUEST_PATH.exists()
    assert "cleared" in capsys.readouterr().out
    assert sw.cmd_video({}, "bogus") == 2


def test_video_standalone_when_no_daemon(coord, monkeypatch):
    monkeypatch.setattr(sw, "_create_singleton_mutex", lambda: "acquired")
    calls = []

    class FakeMgr:
        hub = None

        def __init__(self, cfg):
            pass

        def start(self, launch_rig=True):
            calls.append("start")

        def tick(self, allow_new_work=True):
            calls.append("tick")
            sw.STOP_REQUEST_PATH.write_text("stop", encoding="utf-8")

        def stop(self):
            calls.append("stop")

    monkeypatch.setattr(sw, "SwingSessionManager", FakeMgr)
    monkeypatch.setattr(sw, "start_bridge", lambda cfg: (None, None))
    monkeypatch.setattr(sw, "print_hotkey_cheatsheet", lambda cfg: None)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    assert sw.cmd_video({}) == 0
    assert calls == ["start", "tick", "stop"]  # ran standalone, then honoured STOP_REQUEST


class FakeVideo:
    def __init__(self):
        self._started = False
        self.calls = []

    def start(self, launch_rig=True):
        self._started = True
        self.calls.append("start")

    def stop(self):
        self._started = False
        self.calls.append("stop")

    def tick(self, allow_new_work=True):
        self.calls.append(("tick", allow_new_work))


def _gate_down(monkeypatch):
    monkeypatch.setattr(sw, "find_procs", lambda name: [])
    monkeypatch.setattr(sw, "pause_active", lambda cfg=None: False)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)


def test_watch_step_request_starts_rig_without_gspro(coord, monkeypatch):
    _gate_down(monkeypatch)
    cfg = {"interval_sec": 0, "only_when_running": "GSPro.exe", "apps_by_key": {}}
    st, vm = sw._WatchState(), FakeVideo()
    sw.write_video_request()
    sw._watch_step(cfg, st, vm)
    assert vm._started and "stop" not in vm.calls
    assert '"video_request": true' in sw.STATUS_PATH.read_text(encoding="utf-8")
    sw.clear_video_request()
    sw._watch_step(cfg, st, vm)
    assert not vm._started and vm.calls[-1] == "stop"  # request gone + GSPro down -> rig follows the gate


def test_watch_step_request_failure_keeps_backoff(coord, monkeypatch):
    _gate_down(monkeypatch)
    cfg = {"interval_sec": 0, "only_when_running": "GSPro.exe", "apps_by_key": {}}
    st, vm = sw._WatchState(), FakeVideo()
    vm.start = lambda launch_rig=True: (_ for _ in ()).throw(RuntimeError("no kinovea"))
    sw.write_video_request()
    sw._watch_step(cfg, st, vm)
    sw._watch_step(cfg, st, vm)
    assert st.video_failures == 1 and st.video_next_at > time.time()  # not reset by the gate-down branch


def test_forced_only_rig_stops_when_request_cleared_with_gspro_up(coord, monkeypatch):
    monkeypatch.setattr(sw, "find_procs", lambda name: [1])
    monkeypatch.setattr(sw, "pause_active", lambda cfg=None: False)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    monkeypatch.setattr(sw, "evaluate_checks", lambda cfg, verbose=False: {
        "all_ok": True, "any_unknown": False, "failing": [], "skipped": [], "level": 0})
    monkeypatch.setattr(sw, "enforce_gspro_window_state", lambda cfg: None)
    monkeypatch.setattr(sw, "suppress_background_focus", lambda cfg: None)
    cfg = {"interval_sec": 0, "only_when_running": "GSPro.exe", "apps_by_key": {}}
    vm = FakeVideo()
    vm.forced_only = True  # built only for a request (video.enabled false)
    vm._started = True
    sw._watch_step(cfg, sw._WatchState(), vm)
    assert vm.calls[0] == "stop" and "start" not in vm.calls


def test_watch_builds_rig_for_request_and_stops_cleanly(coord, monkeypatch):
    monkeypatch.setattr(sw, "acquire_singleton_lock", lambda *a: True)
    monkeypatch.setattr(sw, "start_bridge", lambda cfg: (None, None))
    built, seen = [], []

    class FakeMgr(FakeVideo):
        def __init__(self, cfg):
            super().__init__()
            built.append(self)

    def fake_step(cfg, st, video_mgr):
        seen.append(video_mgr)
        if len(seen) == 2:
            sw.STOP_REQUEST_PATH.write_text("stop", encoding="utf-8")

    monkeypatch.setattr(sw, "SwingSessionManager", FakeMgr)
    monkeypatch.setattr(sw, "_watch_step", fake_step)
    sw.write_video_request()
    sw.watch({"interval_sec": 0, "video": {"enabled": False}, "apps_by_key": {}})  # returns: clean stop
    assert len(built) == 1 and seen == [built[0], built[0]] and built[0].forced_only is True
    assert '"state": "stopped"' in sw.STATUS_PATH.read_text(encoding="utf-8")


def test_stop_requested_ignores_requests_older_than_daemon(coord, monkeypatch):
    sw.STOP_REQUEST_PATH.write_text("x", encoding="utf-8")
    old = time.time() - 600
    os.utime(sw.STOP_REQUEST_PATH, (old, old))
    monkeypatch.setattr(sw, "_DAEMON_STARTED", time.time())
    assert sw.stop_requested() is False
    os.utime(sw.STOP_REQUEST_PATH, None)
    assert sw.stop_requested() is True


class _P:
    def __init__(self, pid):
        self.pid = pid
        self.info = {"pid": pid, "cmdline": ["python.exe", "simwatch.py", "startup"]}


def test_request_stop_clean_exit(coord, monkeypatch):
    alive = {10}
    monkeypatch.setattr(sw, "find_simwatch_daemons", lambda: [_P(10)])

    def fake_sleep(s):
        assert sw.STOP_REQUEST_PATH.exists()  # the daemon is asked first
        alive.clear()

    monkeypatch.setattr(sw.time, "sleep", fake_sleep)
    monkeypatch.setattr(sw.psutil, "pid_exists", lambda pid: pid in alive)
    assert sw.request_stop(timeout=5) == 1
    assert not sw.STOP_REQUEST_PATH.exists()  # clean exit: nothing left for the launcher


def test_request_stop_force_fallback_leaves_marker_for_launcher(coord, monkeypatch):
    killed = []
    monkeypatch.setattr(sw, "find_simwatch_daemons", lambda: [_P(10)])
    monkeypatch.setattr(sw, "stop_other_simwatch_instances", lambda: killed.append(1) or 1)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    monkeypatch.setattr(sw.psutil, "pid_exists", lambda pid: not killed)
    assert sw.request_stop(timeout=0.01) == 1
    assert killed and sw.STOP_REQUEST_PATH.exists()


def test_request_stop_nothing_running(coord, monkeypatch):
    monkeypatch.setattr(sw, "find_simwatch_daemons", lambda: [])
    assert sw.request_stop() == 0 and not sw.STOP_REQUEST_PATH.exists()


def test_launcher_treats_stop_request_as_clean_exit():
    raw = (ROOT / "run_simwatch.bat").read_bytes()
    assert b"\r\n" in raw and raw.count(b"\n") == raw.count(b"\r\n")  # CRLF only
    text = raw.decode()
    i = text.index('if exist "%~dp0STOP_REQUEST"')
    assert text.index("exited with code %RC%") < i < text.index('if not "%RC%"=="0"')
    assert 'del /q "%~dp0STOP_REQUEST"' in text[i:] and "exit /b 0" in text[i:]


def test_gitignore_covers_runtime_files():
    gi = (ROOT / ".gitignore").read_text(encoding="utf-8").split()
    for name in ("bridge_token.txt", "VIDEO_ON", "STOP_REQUEST", "simwatch_daemon.json"):
        assert name in gi


# ================================================================== 2. phone (LAN) access

TOKEN = "tok_ABC-123"


@pytest.fixture()
def lan_bridge(tmp_path):
    static = tmp_path / "drills"
    static.mkdir()
    (static / "index.html").write_text("<h1>hub</h1>", encoding="utf-8")
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    hub.heartbeat_sec = 0.3
    srv = sw.BridgeServer(hub, port=0, host="127.0.0.1", static_dir=static, lan_token=TOKEN)
    assert srv.start()
    yield srv
    srv.stop()


@pytest.fixture()
def as_lan_client(monkeypatch):
    """Make the (loopback) test client look like a phone on the LAN."""
    monkeypatch.setattr(sw.BridgeRequestHandler, "_client_is_loopback", lambda self: False)


def _get(srv, path, host=None, headers=None, method="GET", body=None):
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=5)
    h = {"Host": host or f"192.168.1.50:{srv.port}"}
    h.update(headers or {})
    conn.request(method, path, body=body, headers=h)
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp, data


def test_lan_client_needs_token(lan_bridge, as_lan_client):
    for path in ("/", "/index.html", "/api/status", "/api/shots", "/?token=wrong"):
        resp, _ = _get(lan_bridge, path)
        assert resp.status == 401, path
    resp, _ = _get(lan_bridge, "/api/status", headers={"Cookie": f"{sw.BRIDGE_TOKEN_COOKIE}=nope"})
    assert resp.status == 401


def test_lan_token_query_sets_strict_httponly_cookie(lan_bridge, as_lan_client):
    resp, data = _get(lan_bridge, f"/?token={TOKEN}")
    assert resp.status == 200 and b"hub" in data
    cookie = resp.getheader("Set-Cookie")
    assert cookie.startswith(f"{sw.BRIDGE_TOKEN_COOKIE}={TOKEN};")
    assert "HttpOnly" in cookie and "SameSite=Strict" in cookie and "Path=/" in cookie
    # then the cookie alone authenticates fetch / SSE / POST
    ck = {"Cookie": f"{sw.BRIDGE_TOKEN_COOKIE}={TOKEN}"}
    resp, _ = _get(lan_bridge, "/api/status", headers=ck)
    assert resp.status == 200 and resp.getheader("Set-Cookie") is None
    origin = f"http://192.168.1.50:{lan_bridge.port}"
    resp, _ = _get(lan_bridge, "/api/drill", method="POST", body=b'{"drill_id": "d1"}',
                   headers=dict(ck, **{"Content-Type": "application/json", "Origin": origin}))
    assert resp.status == 200 and resp.getheader("Access-Control-Allow-Origin") == origin
    conn = http.client.HTTPConnection("127.0.0.1", lan_bridge.port, timeout=5)
    conn.request("GET", "/api/events", headers=dict(ck, Host=f"192.168.1.50:{lan_bridge.port}"))
    r = conn.getresponse()
    assert r.status == 200 and r.getheader("Content-Type").startswith("text/event-stream")
    conn.close()


def test_lan_foreign_origin_rejected_even_with_token(lan_bridge, as_lan_client):
    ck = {"Cookie": f"{sw.BRIDGE_TOKEN_COOKIE}={TOKEN}", "Origin": "http://evil.example"}
    resp, _ = _get(lan_bridge, "/api/status", headers=ck)
    assert resp.status == 403


@pytest.mark.parametrize("host_fmt,ok", [
    ("192.168.1.50:{port}", True),
    ("10.0.0.7:{port}", True),
    ("{me}:{port}", True),
    ("{me}.lan:{port}", True),
    ("evil.example:{port}", False),       # DNS rebinding name
    ("192.168.1.50:1", False),            # wrong port
    ("localhost.evil.example:{port}", False),
])
def test_lan_host_check_when_authenticated(lan_bridge, as_lan_client, host_fmt, ok):
    me = sw.socket.gethostname().lower()
    host = host_fmt.format(port=lan_bridge.port, me=me)
    resp, _ = _get(lan_bridge, "/api/status", host=host, headers={"Cookie": f"{sw.BRIDGE_TOKEN_COOKIE}={TOKEN}"})
    assert (resp.status == 200) is ok, host


def test_lan_host_not_checked_before_token(lan_bridge, as_lan_client):
    resp, _ = _get(lan_bridge, "/api/status", host="evil.example")
    assert resp.status == 401  # unauthenticated clients learn nothing either way


def test_loopback_unchanged_when_lan_on(lan_bridge):
    resp, _ = _get(lan_bridge, "/api/status", host=f"127.0.0.1:{lan_bridge.port}")
    assert resp.status == 200 and resp.getheader("Set-Cookie") is None
    # a LAN Host from a loopback client is still refused, token or not (today's DNS-rebinding guard)
    resp, _ = _get(lan_bridge, f"/api/status?token={TOKEN}", host=f"192.168.1.50:{lan_bridge.port}")
    assert resp.status == 421
    resp, _ = _get(lan_bridge, "/api/status", host=f"127.0.0.1:{lan_bridge.port}",
                   headers={"Origin": "http://evil.example"})
    assert resp.status == 403


def test_non_loopback_refused_when_lan_off(tmp_path, monkeypatch):
    monkeypatch.setattr(sw.BridgeRequestHandler, "_client_is_loopback", lambda self: False)
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "S"))
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.host == "127.0.0.1" and srv.start()
    try:
        resp, _ = _get(srv, f"/api/status?token={TOKEN}")
        assert resp.status == 403
    finally:
        srv.stop()


def test_bind_address_follows_lan():
    hub = sw.ShotHub(sw.ShotStore(Path("/nonexistent")))
    assert sw.BridgeServer(hub).host == "127.0.0.1"
    assert sw.BridgeServer(hub, lan_token="t").host == "0.0.0.0"


def test_client_is_loopback():
    h = sw.BridgeRequestHandler.__new__(sw.BridgeRequestHandler)
    for addr, want in (("127.0.0.1", True), ("127.5.5.5", True), ("::1", True), ("192.168.1.9", False),
                       ("garbage", False)):
        h.client_address = (addr, 1)
        assert h._client_is_loopback() is want


def test_bridge_token_created_once(tmp_path):
    p = tmp_path / "bridge_token.txt"
    assert sw.bridge_token(create=False, path=p) is None
    t1 = sw.bridge_token(path=p)
    assert t1 and len(t1) >= 24 and sw.bridge_token(path=p) == t1


def test_start_bridge_passes_token_only_when_lan(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "HERE", tmp_path)
    monkeypatch.setattr(sw, "BRIDGE_TOKEN_PATH", tmp_path / "bridge_token.txt")
    monkeypatch.setattr(sw.BridgeServer, "start", lambda self: True)
    _, srv = sw.start_bridge({"bridge": {"port": 0}})
    assert srv.lan_token is None and srv.host == "127.0.0.1"
    assert not (tmp_path / "bridge_token.txt").exists()
    _, srv = sw.start_bridge({"bridge": {"port": 0, "lan": True}})
    assert srv.lan_token == (tmp_path / "bridge_token.txt").read_text().strip() and srv.host == "0.0.0.0"
    _, srv = sw.start_bridge({"bridge": {"port": 0, "lan": "yes"}})  # only a real true turns it on
    assert srv.lan_token is None


def test_phone_url_status_and_phone_cmd(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(sw, "HERE", tmp_path)
    monkeypatch.setattr(sw, "BRIDGE_TOKEN_PATH", tmp_path / "bridge_token.txt")
    monkeypatch.setattr(sw, "lan_ipv4_candidates", lambda: ["192.168.1.50"])
    monkeypatch.setattr(sw, "running_daemon", lambda: None)
    monkeypatch.setattr(sw, "print_ascii_qr", lambda text: False)
    off = {"bridge": {"port": 1, "sessions_dir": "S"}}
    on = {"bridge": {"port": 8765, "sessions_dir": "S", "lan": True}}
    assert sw.bridge_phone_url(off) is None
    assert sw.cmd_phone(off) == 1 and "Phone access is off" in capsys.readouterr().out
    tok = sw.bridge_token(path=tmp_path / "bridge_token.txt")
    url = f"http://192.168.1.50:8765/?token={tok}"
    assert sw.bridge_phone_url(on) == url
    assert sw.cmd_phone(on) == 0 and url in capsys.readouterr().out
    sw.cmd_status(dict(on, bridge=dict(on["bridge"], port=1)))
    out = capsys.readouterr().out
    assert "Phone URL" in out and f"?token={tok}" in out and "SimWatch daemon: not running" in out


def test_lan_ip_candidates_skip_link_local(monkeypatch):
    class A:
        def __init__(self, ip):
            self.family, self.address = sw.socket.AF_INET, ip

    monkeypatch.setattr(sw.psutil, "net_if_addrs", lambda: {
        "lp": [A("169.254.6.1")], "lo": [A("127.0.0.1")], "wifi": [A("192.168.1.50")], "pub": [A("8.8.8.8")]})

    class S:
        def __init__(self, *a):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def connect(self, addr):
            raise OSError("offline")

    monkeypatch.setattr(sw.socket, "socket", S)
    assert sw.lan_ipv4_candidates() == ["192.168.1.50"]


def test_validate_config_flags_non_bool_lan(real_cfg):
    real_cfg["bridge"]["lan"] = "yes"
    assert any("bridge.lan" in m for _, m in sw.validate_config(real_cfg, check_paths=False))
    real_cfg["bridge"]["lan"] = True
    assert not any("bridge.lan" in m for _, m in sw.validate_config(real_cfg, check_paths=False))


def test_shipped_config_lan_off(real_cfg):
    assert real_cfg["bridge"]["lan"] is False


def test_drills_page_uses_origin_when_served_by_bridge():
    html = (ROOT / "drills" / "index.html").read_text(encoding="utf-8")
    line = next(l for l in html.splitlines() if "const BRIDGE_URL" in l)
    assert "location.origin" in line and '"http://127.0.0.1:8765"' in line


# ================================================================== 3. firewall scope

def _ctx(**kw):
    ctx = {"adapter": "Ethernet 3", "device_ip": "169.254.6.44", "host_ip": None,
           "programs": {"python.exe (base)": r"C:\Py311\python.exe",
                        "GameChanger.exe": r"C:\SimTools\GameChanger\GameChanger.exe",
                        "GSPconnect.exe": r"C:\GSProV1\Core\GSPC\GSPconnect.exe",
                        "FSX Pro.exe": r"C:\FSX Pro\FSX Pro.exe"},
           "ultimate_active": False, "task_exists": True}
    ctx.update(kw)
    return ctx


def _fw_cmd(steps, label):
    return next(c for _, c, _ in steps if f"'SimWatch allow {label}'" in c)


def test_harden_firewall_rules_are_narrow_and_recreated():
    steps = sw.harden_steps(_ctx())
    for label in ("python.exe (base)", "GSPconnect.exe"):
        c = _fw_cmd(steps, label)
        assert c.endswith("-RemoteAddress '127.0.0.1'"), c
    for label in ("GameChanger.exe", "FSX Pro.exe"):
        c = _fw_cmd(steps, label)
        assert c.endswith("-RemoteAddress '169.254.0.0/16','LocalSubnet'"), c
    for label in _ctx()["programs"]:
        c = _fw_cmd(steps, label)
        assert c.index("Remove-NetFirewallRule") < c.index("New-NetFirewallRule")  # narrowed in place
        assert "-Profile Private,Domain" in c


def test_harden_lan_rule_only_when_lan_on():
    off = "\n".join(c for _, c, _ in sw.harden_steps(_ctx()))
    assert sw.BRIDGE_LAN_FIREWALL_RULE not in off and "-LocalPort" not in off
    steps = sw.harden_steps(_ctx(bridge_lan=True, bridge_port=8800))
    c = next(c for _, c, _ in steps if sw.BRIDGE_LAN_FIREWALL_RULE in c)
    assert ("-Direction Inbound -Action Allow -Protocol TCP -LocalPort 8800 -Profile Private "
            "-RemoteAddress LocalSubnet") in c
    assert "-Program" not in c and "Domain" not in c and "Public" not in c


def test_harden_context_carries_lan(real_cfg, monkeypatch):
    monkeypatch.setattr(sw, "IS_WINDOWS", False)
    real_cfg["bridge"]["lan"] = True
    ctx = sw.harden_context(real_cfg, "Ethernet 3")
    assert ctx["bridge_lan"] is True and ctx["bridge_port"] == 8765


@pytest.mark.parametrize("remote,expected,ok", [
    ("127.0.0.1", sw.FIREWALL_SCOPE_LOOPBACK, True),
    ("Any", sw.FIREWALL_SCOPE_LOOPBACK, False),
    ("LocalSubnet", sw.FIREWALL_SCOPE_LOOPBACK, False),
    ("", sw.FIREWALL_SCOPE_LOOPBACK, False),
    ("169.254.0.0/255.255.0.0,LocalSubnet", sw.FIREWALL_SCOPE_DEVICE, True),  # Windows' mask form
    (["169.254.6.44", "LocalSubnet"], sw.FIREWALL_SCOPE_DEVICE, True),
    ("169.254.6.1-169.254.6.99", sw.FIREWALL_SCOPE_DEVICE, True),
    ("LocalSubnet4", sw.FIREWALL_SCOPE_DEVICE, True),
    ("Intranet", sw.FIREWALL_SCOPE_DEVICE, False),
    ("0.0.0.0/0", sw.FIREWALL_SCOPE_DEVICE, False),
    ("192.168.1.0/24", sw.FIREWALL_SCOPE_DEVICE, False),
    ("fe80::/64", sw.FIREWALL_SCOPE_DEVICE, False),
    ("bogus/99", sw.FIREWALL_SCOPE_DEVICE, False),
])
def test_remote_scope_within(remote, expected, ok):
    assert sw.remote_scope_within(remote, expected) is ok


def test_evaluate_firewall_warns_on_broad_scope():
    progs = {"python.exe (sniffer)": [r"C:\Py\python.exe"], "GameChanger.exe": [r"C:\GC\GameChanger.exe"],
             "GSPconnect.exe": [r"C:\GSPC\GSPconnect.exe"], "FSX Pro.exe": [r"C:\FSX\FSX Pro.exe"]}

    def rule(prog, name, remote):
        return {"Program": prog, "Name": name, "Direction": "Inbound", "Action": "Allow", "Enabled": "True",
                "RemoteAddress": remote}

    rules = [rule(r"C:\Py\python.exe", "SimWatch allow python.exe (base)", "127.0.0.1"),
             rule(r"C:\GC\GameChanger.exe", "SimWatch allow GameChanger.exe", "169.254.0.0/255.255.0.0,LocalSubnet"),
             rule(r"C:\GSPC\GSPconnect.exe", "SimWatch allow GSPconnect.exe", "Any"),
             rule(r"C:\FSX\FSX Pro.exe", "SimWatch allow FSX Pro.exe", "169.254.0.0/255.255.0.0,LocalSubnet"),
             rule(r"C:\FSX\FSX Pro.exe", "FSX Pro", "Any")]  # installer-created rule
    rows = {r[1]: r for r in sw.evaluate_firewall(rules, progs)}
    assert rows["firewall: python.exe (sniffer)"][0] == sw.PASS
    assert rows["firewall: GameChanger.exe"][0] == sw.PASS
    g = rows["firewall: GSPconnect.exe"]
    assert g[0] == sw.WARN and "broader" in g[2] and "127.0.0.1" in g[2] and "harden --apply" in g[2]
    f = rows["firewall: FSX Pro.exe"]
    assert f[0] == sw.WARN and "FSX Pro (remote Any)" in f[2]


@pytest.mark.parametrize("lan_on,rules,status", [
    (True, [], sw.WARN),
    (True, [{"Enabled": "True", "Action": "Allow", "Profile": "Private", "Protocol": "TCP", "LocalPort": "8765",
             "RemoteAddress": "LocalSubnet"}], sw.PASS),
    (True, [{"Enabled": "True", "Action": "Allow", "Profile": "Private, Public", "Protocol": "TCP",
             "LocalPort": "8765", "RemoteAddress": "LocalSubnet"}], sw.WARN),
    (True, [{"Enabled": "True", "Action": "Allow", "Profile": "Private", "Protocol": "TCP", "LocalPort": "8765",
             "RemoteAddress": "Any"}], sw.WARN),
    (False, [{"Name": sw.BRIDGE_LAN_FIREWALL_RULE}], sw.INFO),
    (False, [], sw.PASS),
])
def test_evaluate_bridge_lan_rule(lan_on, rules, status):
    row = sw.evaluate_bridge_lan_rule(lan_on, rules, 8765)
    assert row[0] == status
    if status == sw.INFO:
        assert "Remove-NetFirewallRule" in row[2]


def test_lan_client_can_never_switch_gspro_club_even_with_token(lan_bridge, as_lan_client, monkeypatch):
    calls = []
    monkeypatch.setattr(sw, "send_gspro_club_keys", lambda k, s, cfg=None: (calls.append((k, s)) or True, "sent"))
    ck = {"Cookie": f"{sw.BRIDGE_TOKEN_COOKIE}={TOKEN}", "Content-Type": "application/json"}
    resp, _ = _get(lan_bridge, "/api/gspro/club", method="POST", body=b'{"key": "i", "steps": 1}', headers=ck)
    assert resp.status == 403 and calls == []
