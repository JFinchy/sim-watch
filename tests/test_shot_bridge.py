"""Tests for the local shot-data bridge (OpenConnect -> shot record -> shots.jsonl -> HTTP/SSE)."""
import http.client
import json
import socket
import threading
import time
from pathlib import Path

import pytest

import simwatch as sw

OC_FULL = {
    "DeviceID": "GameChanger", "Units": "Yards", "ShotNumber": 7, "APIversion": "1",
    "Player": {"Handed": "RH", "Club": "7Iron"},
    "BallData": {"Speed": 118.4, "SpinAxis": -3.2, "TotalSpin": 6400, "HLA": 1.5, "VLA": 17.8,
                 "CarryDistance": 165.2},
    "ClubData": {"Speed": 86.1, "AngleOfAttack": -4.1, "FaceToTarget": 0.8, "Path": -1.9, "Loft": 22},
    "ShotDataOptions": {"ContainsBallData": True, "ContainsClubData": True},
}


# ---------------------------------------------------------------- mapping

def test_mapping_with_club_data():
    shot = sw.openconnect_to_shot(OC_FULL, club="7Iron", ts="2026-11-17T10:00:00.000-08:00")
    assert shot == {
        "ts": "2026-11-17T10:00:00.000-08:00",
        "shot_num": 7,
        "club": "7Iron",
        "ball": {"speed": 118.4, "carry": 165.2, "total": None, "hla": 1.5, "vla": 17.8,
                 "spin": 6400.0, "spin_axis": -3.2},
        "club_data": {"speed": 86.1, "path": -1.9, "face": 0.8, "aoa": -4.1},
        "clip": None,
        "drill_id": None,
    }


def test_mapping_without_club_data_and_back_side_spin():
    obj = {"ShotNumber": "3", "BallData": {"Speed": 150, "BackSpin": 2500, "SideSpin": -300, "VLA": 12},
           "ShotDataOptions": {"ContainsBallData": True, "ContainsClubData": False},
           "ClubData": {"Speed": 0}}
    shot = sw.openconnect_to_shot(obj)
    assert shot["club_data"] is None  # ContainsClubData=false wins
    assert shot["shot_num"] == 3
    assert shot["club"] is None
    assert shot["ball"]["carry"] is None and shot["ball"]["hla"] is None
    assert shot["ball"]["spin"] == pytest.approx(2517.94, abs=0.01)
    assert shot["ball"]["spin_axis"] == pytest.approx(-6.84, abs=0.01)
    assert shot["ts"][10] == "T" and ("+" in shot["ts"][19:] or "-" in shot["ts"][19:])


def test_monitor_passes_full_shot_and_keeps_legacy_keys():
    got = []
    mon = sw.OpenConnectMonitor(got.append, lambda club: None)
    mon._feed_text(json.dumps(OC_FULL))
    mon._feed_text(json.dumps(OC_FULL))  # duplicate within 2s -> deduped
    assert len(got) == 1
    info = got[0]
    assert info["ball_speed"] == 118.4 and info["carry"] == 165.2 and info["club"] == "7Iron"
    assert info["shot"]["club_data"]["face"] == 0.8
    assert info["shot"]["club"] == "7Iron"


# ---------------------------------------------------------------- store

def test_store_append_read_and_clip(tmp_path):
    store = sw.ShotStore(tmp_path)
    a = store.append(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:00:00.000-08:00"))
    b = store.append(sw.openconnect_to_shot({"BallData": {"Speed": 100}}, ts="2026-11-17T10:01:00.000-08:00"))
    assert b["shot_num"] == 2  # missing ShotNumber -> next in today's file
    path = tmp_path / "2026-11-17" / "shots.jsonl"
    assert len(path.read_text(encoding="utf-8").splitlines()) == 2
    assert store.set_clip(a["ts"], "001_7Iron_165y_118mph_DTL.mp4") is True
    assert store.set_clip("2026-11-17T23:59:59.000-08:00", "x.mp4") is False
    recs = store.read("2026-11-17")
    assert [r["clip"] for r in recs] == ["001_7Iron_165y_118mph_DTL.mp4", None]
    assert store.read("2026-11-18") == []


def test_store_skips_torn_line(tmp_path):
    store = sw.ShotStore(tmp_path)
    store.append(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:00:00.000-08:00"))
    with (tmp_path / "2026-11-17" / "shots.jsonl").open("a", encoding="utf-8") as fh:
        fh.write('{"ts": "2026-11-17T1')
    assert len(store.read("2026-11-17")) == 1


def test_hub_tags_active_drill(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    hub.set_drill("gate-drill_1")
    rec = hub.record_shot(sw.openconnect_to_shot(OC_FULL))
    assert rec["drill_id"] == "gate-drill_1"
    assert hub.status()["last_shot_ts"] == rec["ts"]


# ---------------------------------------------------------------- validation

@pytest.mark.parametrize("val,ok", [
    (None, True), ("abc", True), ("A_b-9", True), ("x" * 80, True),
    ("", False), ("x" * 81, False), ("../etc", False), ("a b", False), ("é", False), (5, False), (["a"], False),
])
def test_drill_id_validation(val, ok):
    assert sw.valid_drill_id(val) is ok


def test_drill_filename_tag():
    assert sw.drill_filename_tag(None) == ""
    assert sw.drill_filename_tag("gate-drill_1") == "_D-gatedrill1"
    assert sw.drill_filename_tag("fo") == ""  # would look like an angle token


def test_bridge_config_defaults(real_cfg):
    assert sw.bridge_config({}) == sw.BRIDGE_DEFAULTS
    assert sw.bridge_config(real_cfg)["port"] == 8765
    cfg = {"interval_sec": 5}
    sw.apply_config_defaults(cfg)
    assert cfg["bridge"] == sw.BRIDGE_DEFAULTS


# ---------------------------------------------------------------- live server

@pytest.fixture()
def bridge(tmp_path):
    static = tmp_path / "drills"
    static.mkdir()
    (static / "index.html").write_text("<h1>hub</h1>", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("nope", encoding="utf-8")
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    hub.heartbeat_sec = 0.3
    srv = sw.BridgeServer(hub, port=0, static_dir=static)
    assert srv.start()
    yield hub, srv
    srv.stop()


def _req(srv, method, path, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=5)
    conn.request(method, path, body=body, headers=headers or {})
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    return resp, data


def test_server_status_shots_drill(bridge):
    hub, srv = bridge
    resp, data = _req(srv, "GET", "/api/status")
    assert resp.status == 200 and resp.getheader("Access-Control-Allow-Origin") is None  # no Origin -> no ACAO
    st = json.loads(data)
    assert st["ok"] is True and st["version"] == 1 and st["sniffer_ok"] is False and st["active_drill"] is None

    resp, data = _req(srv, "POST", "/api/drill", json.dumps({"drill_id": "towel-drill"}),
                      {"Content-Type": "application/json"})
    assert resp.status == 200 and json.loads(data) == {"active_drill": "towel-drill"}
    for bad in ({"drill_id": "../x"}, {"drill_id": "x" * 81}, {"nope": 1}, [1]):
        resp, _ = _req(srv, "POST", "/api/drill", json.dumps(bad), {"Content-Type": "application/json"})
        assert resp.status == 400
    resp, _ = _req(srv, "POST", "/api/drill", "not json", {"Content-Type": "application/json"})
    assert resp.status == 400

    rec = hub.record_shot(sw.openconnect_to_shot(OC_FULL))
    resp, data = _req(srv, "GET", f"/api/shots?date={rec['ts'][:10]}")
    shots = json.loads(data)["shots"]
    assert resp.status == 200 and len(shots) == 1 and shots[0]["drill_id"] == "towel-drill"
    resp, data = _req(srv, "GET", "/api/shots")  # default = today
    assert resp.status == 200 and "shots" in json.loads(data)
    resp, _ = _req(srv, "GET", "/api/shots?date=2026-13-45")
    assert resp.status == 400

    resp, _ = _req(srv, "OPTIONS", "/api/drill")
    assert resp.status == 204 and "POST" in resp.getheader("Access-Control-Allow-Methods")


def test_server_static_and_traversal(bridge):
    _, srv = bridge
    resp, data = _req(srv, "GET", "/")
    assert resp.status == 200 and b"hub" in data
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/drills/../../secret.txt"):
        # http.client won't normalise the path, so these reach the server verbatim
        resp, data = _req(srv, "GET", path)
        assert resp.status == 404, path
        assert b"nope" not in data


def test_translate_path_rejects_escape(tmp_path):
    static = tmp_path / "drills"
    static.mkdir()
    (tmp_path / "outside.txt").write_text("x", encoding="utf-8")
    (static / "link.txt").symlink_to(tmp_path / "outside.txt")
    h = sw.BridgeRequestHandler.__new__(sw.BridgeRequestHandler)
    h.directory = str(static)
    assert "__forbidden__" in h.translate_path("/link.txt")
    assert h.translate_path("/../outside.txt").startswith(str(static))


def test_sse_status_shot_and_heartbeat(bridge):
    hub, srv = bridge
    sock = socket.create_connection(("127.0.0.1", srv.port), timeout=5)
    sock.sendall(b"GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n")
    buf = b""

    def read_until(marker: bytes, deadline: float = 5.0):
        nonlocal buf
        end = time.time() + deadline
        while marker not in buf and time.time() < end:
            buf += sock.recv(4096)
        assert marker in buf, buf

    read_until(b"event: status\n")
    assert b"text/event-stream" in buf and b"Access-Control-Allow-Origin" not in buf
    # Fire a shot only after the client is subscribed.
    threading.Timer(0.1, lambda: hub.record_shot(sw.openconnect_to_shot(OC_FULL))).start()
    read_until(b"event: shot\n")
    read_until(b"\n\n", 0)  # shot frame complete
    frame = buf.split(b"event: shot\n", 1)[1]
    read_until(b": heartbeat", 3.0)
    data_line = frame.split(b"\n", 1)[0]
    assert data_line.startswith(b"data: ")
    shot = json.loads(data_line[len(b"data: "):])
    assert shot["ball"]["speed"] == 118.4
    sock.close()
    # disconnect is noticed and the subscriber removed
    end = time.time() + 3
    while hub._subs and time.time() < end:
        time.sleep(0.1)
    assert not hub._subs


def test_busy_port_does_not_raise(bridge):
    hub, srv = bridge
    other = sw.BridgeServer(hub, port=srv.port)
    assert other.start() is False


# ---------------------------------------------------------------- hardening: origin / host / CSRF

def test_allowed_origins_are_reflected_never_star(bridge):
    _, srv = bridge
    for origin in (f"http://127.0.0.1:{srv.port}", f"http://localhost:{srv.port}", "null"):
        resp, _ = _req(srv, "GET", "/api/status", headers={"Origin": origin})
        assert resp.status == 200, origin
        assert resp.getheader("Access-Control-Allow-Origin") == origin
        assert resp.getheader("Access-Control-Allow-Private-Network") == "true"
        assert "Origin" in resp.getheader("Vary")


@pytest.mark.parametrize("origin", ["https://evil.example", "http://127.0.0.1:1", "http://localhost",
                                    "http://127.0.0.1.evil.example:8765"])
def test_foreign_origin_rejected(bridge, origin):
    hub, srv = bridge
    for method, path, body, hdrs in (("GET", "/api/status", None, {}), ("GET", "/api/shots", None, {}),
                                     ("OPTIONS", "/api/drill", None, {}),
                                     ("POST", "/api/drill", '{"drill_id":"x"}', {"Content-Type": "application/json"})):
        resp, _ = _req(srv, method, path, body, {"Origin": origin, **hdrs})
        assert resp.status == 403, (method, path)
        assert resp.getheader("Access-Control-Allow-Origin") is None
        assert resp.getheader("Access-Control-Allow-Private-Network") is None
    assert hub.active_drill is None


def test_preflight_for_null_origin(bridge):
    _, srv = bridge
    resp, _ = _req(srv, "OPTIONS", "/api/drill", headers={"Origin": "null",
                                                          "Access-Control-Request-Method": "POST",
                                                          "Access-Control-Request-Headers": "content-type"})
    assert resp.status == 204 and resp.getheader("Access-Control-Allow-Origin") == "null"


def test_cross_site_text_plain_post_rejected(bridge):
    hub, srv = bridge
    for origin in ("null", "https://evil.example", None):
        hdrs = {"Content-Type": "text/plain"}
        if origin:
            hdrs["Origin"] = origin
        resp, _ = _req(srv, "POST", "/api/drill", '{"drill_id":"pwned"}', hdrs)
        assert resp.status in (403, 415), origin
    resp, _ = _req(srv, "POST", "/api/drill", '{"drill_id":"pwned"}')  # no Content-Type at all
    assert resp.status == 415
    assert hub.active_drill is None
    # The file:// page's real request (null origin + JSON, after preflight) still works.
    resp, data = _req(srv, "POST", "/api/drill", '{"drill_id":"ok-drill"}',
                      {"Origin": "null", "Content-Type": "application/json; charset=utf-8"})
    assert resp.status == 200 and resp.getheader("Access-Control-Allow-Origin") == "null"
    assert hub.active_drill == "ok-drill"


@pytest.mark.parametrize("host,ok", [("127.0.0.1", True), ("localhost", True), ("LOCALHOST", True),
                                     ("evil.example", False), ("evil.example:{port}", False),
                                     ("127.0.0.1:1", False), ("127.0.0.1:{port}", True),
                                     ("localhost:{port}", True), ("[::1]:{port}", False)])
def test_host_header_check(bridge, host, ok):
    _, srv = bridge
    host = host.format(port=srv.port)
    conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=5)
    conn.putrequest("GET", "/api/status", skip_host=True)
    conn.putheader("Host", host)
    conn.endheaders()
    resp = conn.getresponse()
    resp.read()
    conn.close()
    assert (resp.status == 200) is ok, host
    if not ok:
        assert resp.status == 421


# ---------------------------------------------------------------- hardening: SSE cap / drill expiry / clip

def _open_sse(srv):
    sock = socket.create_connection(("127.0.0.1", srv.port), timeout=5)
    sock.sendall(b"GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
    buf = b""
    end = time.time() + 5
    while b"\n\n" not in buf.split(b"\r\n\r\n", 1)[-1] and time.time() < end:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buf += chunk
    return sock, buf


def test_sse_subscriber_cap(bridge):
    hub, srv = bridge
    hub.max_subscribers = 3
    socks = []
    try:
        for _ in range(3):
            sock, buf = _open_sse(srv)
            assert b"event: status" in buf
            socks.append(sock)
        resp, data = _req(srv, "GET", "/api/events")
        assert resp.status == 503 and b"too many" in data
        socks.pop().close()
        end = time.time() + 3
        while len(hub._subs) > 2 and time.time() < end:
            time.sleep(0.05)
        sock, buf = _open_sse(srv)  # a slot freed up
        assert b"event: status" in buf
        socks.append(sock)
    finally:
        for s in socks:
            s.close()


def test_active_drill_expires_without_subscribers(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    hub.drill_idle_timeout = 60
    hub.set_drill("towel")
    t0 = time.monotonic()
    assert hub.expire_drill_if_idle(t0 + 30) is False and hub.active_drill == "towel"
    q = hub.subscribe()  # page connected: never expires, however long
    assert hub.expire_drill_if_idle(t0 + 1000) is False
    hub.unsubscribe(q)  # page closed: clock starts now
    assert hub.expire_drill_if_idle(time.monotonic() + 59) is False
    assert hub.expire_drill_if_idle(time.monotonic() + 61) is True
    assert hub.active_drill is None


def test_active_drill_reaper_on_live_server(bridge):
    hub, srv = bridge
    hub.drill_idle_timeout = 0.3
    hub.reaper_interval = 0.05
    hub.set_drill("gate")
    end = time.time() + 3
    while hub.active_drill and time.time() < end:
        time.sleep(0.05)
    assert hub.active_drill is None
    rec = hub.record_shot(sw.openconnect_to_shot(OC_FULL))
    assert rec["drill_id"] is None


def test_clip_event_and_queued_payload_is_a_snapshot(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    q = hub.subscribe()
    rec = hub.record_shot(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:00:00.000-08:00"))
    rec["clip"] = "mutated-after-broadcast.mp4"  # what the video manager does to its copy
    assert hub.set_clip(rec["ts"], "001_7Iron_DTL.mp4") is True
    assert hub.set_clip("2026-11-17T23:00:00.000-08:00", "nope.mp4") is False
    ev, payload = q.get_nowait()
    assert ev == "shot" and json.loads(payload)["clip"] is None
    ev, payload = q.get_nowait()
    assert ev == "clip" and json.loads(payload) == {"ts": rec["ts"], "clip": "001_7Iron_DTL.mp4"}
    assert q.empty()
    assert hub.store.read("2026-11-17")[0]["clip"] == "001_7Iron_DTL.mp4"


# ---------------------------------------------------------------- hardening: second process / sniffer

def test_bind_failure_means_no_recording_store(bridge, tmp_path, monkeypatch):
    _, srv = bridge
    monkeypatch.setattr(sw, "BRIDGE_HUB", None)
    cfg = {"bridge": {"enabled": True, "port": srv.port, "sessions_dir": str(tmp_path / "Other")}}
    hub, server = sw.start_bridge(cfg)
    assert hub is None and server is None
    assert sw.BRIDGE_HUB is None
    assert not (tmp_path / "Other").exists()


def test_start_bridge_ok_uses_temp_sessions_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "BRIDGE_HUB", None)
    cfg = {"bridge": {"enabled": True, "port": 0, "sessions_dir": str(tmp_path / "S")}}
    hub, server = sw.start_bridge(cfg)
    try:
        assert hub is not None and server.httpd is not None and sw.BRIDGE_HUB is hub
        assert hub.store.sessions_dir == tmp_path / "S"
    finally:
        server.stop()


def test_bridge_sniffer_records_and_syncs(tmp_path, monkeypatch):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    sniffer = sw.make_bridge_sniffer(hub)
    assert hub.sniffer is sniffer
    sniffer._feed_text(json.dumps(OC_FULL))
    assert hub.last_shot_ts is not None
    calls = []
    monkeypatch.setattr(sniffer, "start", lambda: calls.append("start"))
    monkeypatch.setattr(sniffer, "stop", lambda: calls.append("stop"))
    sw.sync_bridge_sniffer(sniffer, True)
    sw.sync_bridge_sniffer(sniffer, False)  # not running -> nothing to stop
    sw.sync_bridge_sniffer(None, True)
    assert calls == ["start"]
