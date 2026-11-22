"""Testing without hitting balls: POST /api/simulate-shot, `simulate-shot` / `selftest`, and a Mac-side end-to-end
run of the real shot pipeline.

The pipeline test wires the REAL pieces together - OpenConnectMonitor -> SwingSessionManager -> ShotHub/ShotStore
(tmp_path) -> a real UDP socket standing in for Kinovea's trigger listener -> clip_ready() (what Kinovea's
post-recording command runs) -> _consume_clip_events -> ReplayScheduler show/hide -> GSPro focus restore. Only the
Win32 window calls (FakeOps) and the OBS PiP are faked.
"""
import http.client
import json
import socket
import threading
import time
from types import SimpleNamespace

import pytest

import simwatch as sw

JSON = {"Content-Type": "application/json"}


def _disp(w, h):
    return {"device": "\\\\.\\DISPLAY1", "left": 0, "top": 0, "width": w, "height": h, "primary": True,
            "id": "", "name": ""}


class FakeOps:
    """Win32 window ops stand-in (as in test_adaptive_replay) that also logs into the shared event list."""

    def __init__(self, events):
        self.events = events
        self.hwnds = {"Capture": 1, "LiveReplay": 2, "Compare": 3}
        self.focus = 0
        self._replay_up = False

    def displays(self):
        return [_disp(1366, 768)]

    def gspro_index(self, displays):
        return 0

    def find(self, name, wait_sec=0.0):
        return self.hwnds.get(name)

    def alive(self, hwnd):
        return hwnd in self.hwnds.values()

    def show(self, hwnd, rect, topmost=True):
        if hwnd == self.hwnds["LiveReplay"] and not self._replay_up:
            self._replay_up = True
            self.events.append("replay_show")

    def park(self, hwnd, method, layout):
        if hwnd == self.hwnds["LiveReplay"] and self._replay_up:  # (the first-clip retile parks it too: not a hide)
            self._replay_up = False
            self.events.append("replay_park")

    def restore_gspro_focus(self):
        self.focus += 1
        self.events.append("focus_gspro")
        return True

    def last_input_time(self):
        return None


class FakePip:
    def show_for_shot(self):
        pass

    def tick(self):
        pass


def _rig_cfg(tmp_path, udp_port, show_sec=10):
    swings = tmp_path / "Swings"
    return {
        "video": {"swings_dir": str(swings), "kinovea_backend": "2025", "udp_trigger_port": udp_port,
                  "capture_root": str(tmp_path / "Cap"), "swing_lines": {"enabled": False},
                  "dtl_camera": "DTL", "fo_camera": "FO", "replay": {"show_sec": show_sec, "clip_wait_sec": 4}},
        "bridge": {"sessions_dir": str(swings / "Sessions")},
    }


@pytest.fixture()
def udp_listener():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.bind(("127.0.0.1", 0))
    s.settimeout(5)
    yield s
    s.close()


def _build_rig(tmp_path, monkeypatch, udp_port, show_sec=10):
    """A real SwingSessionManager + ShotHub + BridgeServer, rig 'started' without launching Kinovea/OBS."""
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    events: list[str] = []
    cfg = _rig_cfg(tmp_path, udp_port, show_sec)
    m = sw.SwingSessionManager(cfg)
    m._ref_swap_sync = True                     # a club change applies inline (no debounce thread)
    m.pip = FakePip()
    m.ops = FakeOps(events)
    m.layout_ctl = sw.VideoLayoutController(cfg, m.ops)
    m.layout_ctl.refresh(0.0, force=True)
    hub = sw.ShotHub(sw.ShotStore(sw.bridge_sessions_dir(cfg)))
    m.hub = hub
    hub.sniffer, hub.video_mgr = m.oc_monitor, m  # what SwingSessionManager.start() wires
    m._started = True

    orig_broadcast = hub.broadcast

    def broadcast(event, data):
        if event in ("shot", "clip"):
            events.append(f"sse_{event}")
        orig_broadcast(event, data)

    hub.broadcast = broadcast
    orig_send = sw.send_udp_trigger

    def send(port=sw.KINOVEA_DEFAULT_UDP_PORT, host="127.0.0.1", payload=b"simwatch"):
        events.append("udp_trigger")
        return orig_send(port, host, payload)

    monkeypatch.setattr(sw, "send_udp_trigger", send)
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    return cfg, m, hub, srv, events


def _req(srv, method, path, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=10)
    conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers or {})
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp.status, (json.loads(data) if data else None)


def _fake_kinovea_saves_clips(cfg, tmp_path, when):
    """What Kinovea does after the trigger: write DTL + FO recordings, run `clip-ready <file> DTL|FO`."""
    raw = tmp_path / "Cap" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    out = {}
    for angle in ("DTL", "FO"):
        f = raw / f"{angle}_capture.mp4"
        f.write_bytes(b"\x00" * 4096)
        out[angle] = sw.clip_ready(cfg, f, angle, now=when, wait=False)
    return out


# --------------------------------------------------------------------------- end-to-end pipeline

def test_simulated_shot_runs_the_real_pipeline_end_to_end(tmp_path, monkeypatch, udp_listener):
    port = udp_listener.getsockname()[1]
    cfg, m, hub, srv, events = _build_rig(tmp_path, monkeypatch, port)
    try:
        code, res = _req(srv, "POST", "/api/simulate-shot", {"club": "7i", "replay_delay": 0}, JSON)
        assert code == 200, res
        assert res["ok"] and res["path"] == "video_rig" and res["rig_running"] and res["club"] == "7I"
        assert res["skipped"] == [] and res["replay"]["enabled"] and res["replay"]["delay_sec"] == 0

        # Kinovea's UDP trigger listener got the datagram on the configured port
        data, _ = udp_listener.recvfrom(64)
        assert data == b"simwatch"

        shot = res["shot"]
        assert shot["simulated"] is True and shot["source"] == "demo" and shot["club"] == "7I"
        assert shot["device_shot_num"] >= 900_000_000          # never collides with a launch monitor's ShotNumber

        # Kinovea records and files the clips (separate process on the rig; in-process here)
        clips = _fake_kinovea_saves_clips(cfg, tmp_path, time.time() + 2)
        assert all(r["status"] == "ok" and r["linked"] and r["ts"] == shot["ts"] for r in clips.values())

        # Daemon tick: consume .clip-events (SSE clip events, replay may show), then show -> hide on the timer
        m._consume_clip_events()
        assert m.replay.clip_ready and m.last_saved_dtl.name == clips["DTL"]["clip"]
        m._tick_replay(time.time() + 0.1)
        assert m.replay_visible and m.replay.state == m.replay.SHOWING
        m._tick_replay(time.time() + 60)
        assert not m.replay_visible and m.replay.state == m.replay.IDLE

        # The day's shots.jsonl: one simulated line with both clips linked
        lines = [json.loads(x) for x in sw.ShotStore(sw.bridge_sessions_dir(cfg)).path_for(shot["ts"][:10])
                 .read_text(encoding="utf-8").splitlines()]
        assert len(lines) == 1
        rec = lines[0]
        assert rec["simulated"] and rec["source"] == "demo" and rec["sim_id"] == res["sim_id"]
        assert rec["clips"] == {"DTL": clips["DTL"]["clip"], "FO": clips["FO"]["clip"]}
        assert rec["clip"] == clips["DTL"]["clip"]

        # Event order: trigger before the record, clips before the replay, GSPro focus after show and after hide
        assert events == ["udp_trigger", "sse_shot", "sse_clip", "sse_clip",
                          "replay_show", "focus_gspro", "replay_park", "focus_gspro"]

        # /api/status exposes what selftest checks
        code, st = _req(srv, "GET", "/api/status")
        pl = st["pipeline"]
        assert pl["rig_running"] and pl["sniffer"] == "video_rig" and pl["udp_triggers"] == 1
        assert pl["last_trigger_kind"] == "udp" and pl["udp_port"] == port
        assert pl["replay_hidden_at"] >= pl["replay_shown_at"] >= pl["last_shot_at"]
        assert pl["focus_after"] == "hide" and pl["focus_restored"] is True and pl["last_shot_simulated"]
        assert pl["clip_events"] == 1 and pl["replay_shows"] == 1 and pl["replay_hides"] == 1

        # Simulated shots never count as golf
        assert sw.session_stats(lines)["shot_count"] == 0
    finally:
        srv.stop()


def test_quick_replay_delay_overrides_the_club_delay(tmp_path, monkeypatch, udp_listener):
    cfg, m, hub, srv, events = _build_rig(tmp_path, monkeypatch, udp_listener.getsockname()[1])
    try:
        t0 = time.time()
        res = sw.simulate_shot(hub, "DR", replay_delay=1)
        assert res["replay"]["delay_sec"] == 1
        assert m.replay.state == m.replay.WAITING and m.replay.show_at - t0 < 2.5   # not the 9 s Driver delay
        res = sw.simulate_shot(hub, "DR")
        assert res["replay"]["delay_sec"] == 9
    finally:
        srv.stop()


# --------------------------------------------------------------------------- endpoint protections

def test_simulate_shot_endpoint_is_local_only(tmp_path, monkeypatch):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    try:
        for origin in ("null", f"http://127.0.0.1:{srv.port}", f"http://localhost:{srv.port}", "https://evil.example"):
            code, doc = _req(srv, "POST", "/api/simulate-shot", {"club": "7I"}, {**JSON, "Origin": origin})
            assert code == 403, origin
            assert "Access-Control-Allow-Origin" not in str(doc)
            code, _ = _req(srv, "OPTIONS", "/api/simulate-shot", headers={"Origin": origin})
            assert code == 403, origin
        code, _ = _req(srv, "POST", "/api/simulate-shot", "x", {"Content-Type": "text/plain"})
        assert code == 415
        for bad in ({"count": 0}, {"count": 21}, {"count": True}, {"club": "7-I"}, {"club": 7},
                    {"ball_speed": 999}, {"replay_delay": -1}, {"interval": "fast"}, [1]):
            code, _ = _req(srv, "POST", "/api/simulate-shot", bad, JSON)
            assert code == 400, bad
        assert hub.store.read(time.strftime("%Y-%m-%d")) == []      # nothing refused got recorded
    finally:
        srv.stop()

    # A LAN client is refused even with a valid pairing token (same rule as /api/gspro/club)
    token = "t0ken"
    srv = sw.BridgeServer(hub, port=0, host="127.0.0.1", static_dir=tmp_path, lan_token=token)
    assert srv.start()
    monkeypatch.setattr(sw.BridgeRequestHandler, "_client_is_loopback", lambda self: False)
    try:
        lan = {**JSON, "Host": f"192.168.1.50:{srv.port}"}
        code, _ = _req(srv, "GET", f"/api/status?token={token}", headers={"Host": lan["Host"]})
        assert code == 200                                           # the token itself is good...
        code, doc = _req(srv, "POST", f"/api/simulate-shot?token={token}", {"club": "7I"}, lan)
        assert code == 403 and "only allowed from this PC" in doc["error"]   # ...but never for this endpoint
        assert hub.store.read(time.strftime("%Y-%m-%d")) == []
    finally:
        srv.stop()


def test_without_video_rig_the_shot_is_still_recorded(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    hub.current_club = "PW"
    res = sw.simulate_shot(hub)                                       # no monitor at all
    assert res["ok"] and res["path"] == "hub_only" and res["club"] == "PW" and not res["rig_running"]
    assert any(s.startswith("udp_trigger") for s in res["skipped"]) and res["replay"] is None
    sniffer = sw.make_bridge_sniffer(hub)                             # bridge-only sniffer (video disabled)
    res = sw.simulate_shot(hub, "dr", ball_speed=150)
    assert res["ok"] and res["path"] == "bridge_sniffer" and res["club"] == "DR"
    assert res["shot"]["ball"]["speed"] == 150 and hub.current_club == "DR"
    recs = hub.store.read(time.strftime("%Y-%m-%d"))
    assert [r["simulated"] for r in recs] == [True, True] and all(r["source"] == "demo" for r in recs)
    assert sniffer._last_club == "DR"


def test_dedup_never_swallows_simulated_shots(tmp_path, monkeypatch):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    sw.make_bridge_sniffer(hub)
    fixed = sw.demo_openconnect_message(1, club="7I")                 # identical ball data every time
    monkeypatch.setattr(sw, "demo_openconnect_message",
                        lambda n, club=None: {**json.loads(json.dumps(fixed)), "ShotNumber": n})
    for _ in range(3):
        assert sw.simulate_shot(hub, "7I")["ok"]
    recs = hub.store.read(time.strftime("%Y-%m-%d"))
    assert len(recs) == 3 and len({r["device_shot_num"] for r in recs}) == 3
    # ...while a real repeated OpenConnect message is still deduplicated
    real = {**json.loads(json.dumps(fixed)), "ShotNumber": 5}
    hub.sniffer._handle_json(real)
    hub.sniffer._handle_json(json.loads(json.dumps(real)))
    recs = hub.store.read(time.strftime("%Y-%m-%d"))
    assert len(recs) == 4 and "simulated" not in recs[-1] and "source" not in recs[-1]


def test_endpoint_count_queues_more_shots(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    try:
        code, res = _req(srv, "POST", "/api/simulate-shot", {"club": "PW", "count": 3, "interval": 0.5}, JSON)
        assert code == 200 and res["queued"] == 2 and res["path"] == "hub_only"
        deadline = time.time() + 5
        while len(hub.store.read(time.strftime("%Y-%m-%d"))) < 3 and time.time() < deadline:
            time.sleep(0.1)
        assert [r["club"] for r in hub.store.read(time.strftime("%Y-%m-%d"))] == ["PW", "PW", "PW"]
    finally:
        srv.stop()


def test_demo_message_follows_the_club():
    for club, lo, hi in (("DR", 135, 160), ("7I", 105, 130), ("PW", 85, 110), ("PT", 1, 20)):
        msg = sw.demo_openconnect_message(1, club=club)
        assert msg["Player"]["Club"] == club and lo <= msg["BallData"]["Speed"] <= hi
    assert sw.normalize_sim_club(" 7i ") == "7I" and sw.normalize_sim_club("") is None
    with pytest.raises(ValueError):
        sw.normalize_sim_club("7 iron")


# --------------------------------------------------------------------------- CLI

def test_simulate_shot_cli_bridge_down_and_up(tmp_path, monkeypatch, capsys):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    free = s.getsockname()[1]
    s.close()
    monkeypatch.setattr(sw, "running_daemon", lambda: None)
    assert sw.cmd_simulate_shot({"bridge": {"port": free}}, "7i") == 1
    out = capsys.readouterr().out
    assert "not reachable" in out and "SimWatch is not running" in out

    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    try:
        assert sw.cmd_simulate_shot({"bridge": {"port": srv.port}}, "7i", count=2, interval=0.5, quick=True) == 0
        out = capsys.readouterr().out
        assert "Shot 1/2: club 7I" in out and "Shot 2/2" in out and "skipped: udp_trigger" in out
        assert len(hub.store.read(time.strftime("%Y-%m-%d"))) == 2
    finally:
        srv.stop()


def test_selftest_full_rig_passes(tmp_path, monkeypatch, udp_listener, capsys):
    """selftest against an in-process rig whose fake Kinovea answers the UDP trigger with DTL/FO clips."""
    port = udp_listener.getsockname()[1]
    cfg, m, hub, srv, events = _build_rig(tmp_path, monkeypatch, port, show_sec=1)
    stop = threading.Event()

    def fake_kinovea():
        while not stop.is_set():
            try:
                udp_listener.recvfrom(64)
            except socket.timeout:
                continue
            except OSError:
                return
            time.sleep(0.2)
            _fake_kinovea_saves_clips(cfg, tmp_path, time.time())

    def daemon_ticks():
        while not stop.is_set():
            m.tick()
            time.sleep(0.1)

    threads = [threading.Thread(target=fake_kinovea, daemon=True), threading.Thread(target=daemon_ticks, daemon=True)]
    for t in threads:
        t.start()
    monkeypatch.setattr(sw, "read_daemon_info", lambda: {"pid": 4321, "command": "watch"})
    monkeypatch.setattr(sw, "find_procs", lambda name: [SimpleNamespace(pid=77)] if "kinovea" in name.lower() else [])
    monkeypatch.setattr(sw, "foreground_process_name", lambda: "GSPro.exe")
    monkeypatch.setattr(sw, "probe_shotlab_health", lambda port, timeout=1.5: None)
    try:
        rc = sw.cmd_selftest({**cfg, "bridge": {**cfg["bridge"], "port": srv.port}}, "7i", quick=True,
                             clip_timeout=10, report_dir=tmp_path / "logs")
    finally:
        stop.set()
        srv.stop()
        for t in threads:
            t.join(3)
    out = capsys.readouterr().out
    assert rc == 0, out
    report = json.loads(next((tmp_path / "logs").glob("selftest-*.json")).read_text())
    status = {r["stage"]: r["status"] for r in report["stages"]}
    assert report["overall"] == "PASS"
    for stage in ("bridge reachable", "daemon running", "Kinovea running (before)", "simulated shot injected",
                  "shot recorded", "Kinovea trigger sent", "DTL clip saved and linked", "FO clip saved and linked",
                  "replay shown", "replay hidden", "GSPro in front after the replay", "Kinovea running (after)"):
        assert status[stage] == "PASS", (stage, out)
    assert status["ShotLab received the shot"] == "SKIP"


def test_selftest_without_rig_skips_video_stages(tmp_path, monkeypatch, capsys):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    monkeypatch.setattr(sw, "read_daemon_info", lambda: None)
    monkeypatch.setattr(sw, "probe_shotlab_health", lambda port, timeout=1.5: None)
    monkeypatch.setattr(sw, "find_procs", lambda name: [])
    try:
        rc = sw.cmd_selftest({"bridge": {"port": srv.port}}, None, report_dir=tmp_path)
    finally:
        srv.stop()
    out = capsys.readouterr().out
    report = json.loads(next(tmp_path.glob("selftest-*.json")).read_text())
    status = {r["stage"]: r["status"] for r in report["stages"]}
    assert rc == 1 and status["daemon running"] == "FAIL" and report["overall"] == "FAIL"
    assert status["shot recorded"] == "PASS" and status["Kinovea trigger sent"] == "SKIP"
    assert status["replay shown"] == "SKIP" and status["ShotLab received the shot"] == "SKIP"
    assert "Selftest FAIL" in out


def test_selftest_bridge_down(tmp_path, monkeypatch, capsys):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    free = s.getsockname()[1]
    s.close()
    monkeypatch.setattr(sw, "read_daemon_info", lambda: None)
    monkeypatch.setattr(sw, "running_daemon", lambda: None)
    assert sw.cmd_selftest({"bridge": {"port": free}}, "7i", report_dir=tmp_path) == 1
    assert "FAIL  bridge reachable" in capsys.readouterr().out
