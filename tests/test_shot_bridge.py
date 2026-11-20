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
        "feel_id": None, "block_id": None, "session_id": None, "phase": None, "cluster": None, "note": None,
        "derived": {"smash": 1.38, "face_to_path": 2.7, "start_offline_yd": 4.32},
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
    assert st["ok"] is True and st["version"] == 2 and st["sniffer_ok"] is False and st["active_drill"] is None

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


# ---------------------------------------------------------------- v2: context, derived, stats

JSON = {"Content-Type": "application/json"}


def _shot(ts_n, club="7Iron", carry=150.0, hla=0.0, **kw):
    """A synthetic v2-ish shot dict for session_stats."""
    s = {"ts": f"2026-11-17T10:{ts_n:02d}:00.000-08:00", "shot_num": ts_n, "club": club,
         "ball": {"speed": 110.0, "carry": carry, "hla": hla},
         "club_data": {"speed": 80.0, "path": -1.0, "face": 1.0, "aoa": -4.0}}
    s.update(kw)
    return s


@pytest.mark.parametrize("doc,ok", [
    ({"drill_id": "d1"}, True),
    ({"feel_id": "f_1", "block_id": "b-2", "session_id": "s3", "phase": "cold", "cluster": 0, "note": "x"}, True),
    ({"phase": None, "cluster": 999, "note": None, "feel_id": None}, True),
    ({}, False), ([], False), (None, False),
    ({"bogus": 1}, False),
    ({"feel_id": "../x"}, False), ({"block_id": ""}, False), ({"session_id": "x" * 81}, False), ({"feel_id": 5}, False),
    ({"phase": "range"}, False), ({"phase": 3}, False),
    ({"cluster": -1}, False), ({"cluster": 1000}, False), ({"cluster": 1.5}, False), ({"cluster": True}, False),
    ({"cluster": "3"}, False),
    ({"note": "x" * 201}, False), ({"note": 7}, False),
])
def test_validate_context(doc, ok):
    if ok:
        assert sw.validate_context(doc) == doc or doc.get("note") == ""
    else:
        with pytest.raises(ValueError):
            sw.validate_context(doc)


def test_note_200_chars_ok_and_empty_note_is_null():
    assert sw.validate_context({"note": "x" * 200})["note"] == "x" * 200
    assert sw.validate_context({"note": ""})["note"] is None


def test_context_stamps_shots_and_note_is_one_shot(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    hub.set_context({"drill_id": "gate", "feel_id": "f1", "block_id": "b1", "session_id": "s1",
                     "phase": "block", "cluster": 4, "note": "felt flat"})
    r1 = hub.record_shot(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:00:00.000-08:00"))
    r2 = hub.record_shot(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T10:01:00.000-08:00"))
    for r in (r1, r2):
        assert (r["drill_id"], r["feel_id"], r["block_id"], r["session_id"], r["phase"], r["cluster"]) == \
            ("gate", "f1", "b1", "s1", "block", 4)
    assert r1["note"] == "felt flat" and r2["note"] is None
    # partial update merges; null clears
    hub.set_context({"cluster": None, "phase": "cold"})
    assert hub.context["feel_id"] == "f1" and hub.context["cluster"] is None and hub.context["phase"] == "cold"
    assert hub.status()["context"]["phase"] == "cold"
    on_disk = hub.store.read("2026-11-17")
    assert on_disk[0]["feel_id"] == "f1" and on_disk[0]["derived"]["smash"] == 1.38


def test_context_expires_with_drill_rule(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    hub.drill_idle_timeout = 60
    hub.set_context({"feel_id": "f1", "phase": "warmup", "note": "n"})  # no drill, context still counts
    t0 = time.monotonic()
    assert hub.expire_drill_if_idle(t0 + 30) is False
    q = hub.subscribe()
    assert hub.expire_drill_if_idle(t0 + 1000) is False
    hub.unsubscribe(q)
    assert hub.expire_drill_if_idle(time.monotonic() + 61) is True
    assert all(v is None for v in hub.context.values())


def test_derived_values():
    d = sw.derive_shot_metrics({"speed": 150.0, "carry": 200.0, "hla": 3.0}, {"speed": 100.0, "path": 2.0, "face": -1.5})
    assert d == {"smash": 1.5, "face_to_path": -3.5, "start_offline_yd": round(200 * 0.052336, 2)}
    left = sw.derive_shot_metrics({"carry": 100.0, "hla": -2.0}, None)
    assert left["start_offline_yd"] < 0 and left["smash"] is None and left["face_to_path"] is None
    assert sw.derive_shot_metrics({"speed": 100.0}, {"speed": 0.0})["smash"] is None  # no divide by zero
    assert sw.derive_shot_metrics(None, None) == {"smash": None, "face_to_path": None, "start_offline_yd": None}


def test_v1_line_normalized_to_v2(tmp_path):
    day = tmp_path / "2026-11-10"
    day.mkdir()
    v1 = {"ts": "2026-11-10T09:00:00.000-08:00", "shot_num": 1, "club": "PW",
          "ball": {"speed": 100.0, "carry": 120.0, "hla": 1.0}, "club_data": {"speed": 80.0, "path": 1.0, "face": 2.0},
          "clip": None, "drill_id": "old"}
    (day / "shots.jsonl").write_text(json.dumps(v1) + "\n" + json.dumps({"ts": "2026-11-10T09:01:00.000-08:00"}) + "\n",
                                     encoding="utf-8")
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    a, b = hub.read_shots("2026-11-10")
    assert a["feel_id"] is None and a["phase"] is None and a["cluster"] is None and a["note"] is None
    assert a["drill_id"] == "old" and a["ball"]["spin"] is None and a["club_data"]["aoa"] is None
    assert a["derived"] == {"smash": 1.25, "face_to_path": 1.0, "start_offline_yd": 2.09}
    assert b["ball"]["speed"] is None and b["club_data"] is None
    assert b["derived"] == {"smash": None, "face_to_path": None, "start_offline_yd": None}
    # the raw file is untouched by reading
    assert "feel_id" not in hub.store.read("2026-11-10")[0]


def test_session_stats_empty_and_missing_club_data():
    st = sw.session_stats([], "2026-11-17", None)
    assert st["shot_count"] == 0 and st["cold_start"]["basis"] == "none" and st["cold_start"]["avg"] is None
    assert st["by_feel"] == [] and st["by_cluster"] == [] and st["strike_consistency"]["carry_std"] is None
    shots = [_shot(1, club_data=None, carry=100.0), _shot(2, club_data=None, carry=110.0)]
    st = sw.session_stats(shots)
    assert st["shot_count"] == 2 and st["cold_start"]["basis"] == "first3" and st["cold_start"]["count"] == 2
    assert st["cold_start"]["avg"]["smash"] is None and st["cold_start"]["avg"]["carry"] == 105.0
    assert st["strike_consistency"]["carry_std"] == 7.07
    assert st["dispersion"]["basis"] == "all_shots"
    assert st["dispersion"]["by_club"] == [{"club": "all", "n": 2, "first3": None, "last3": None}]


def test_session_stats_cold_tagged_vs_fallback():
    shots = [_shot(i, carry=140.0 + i) for i in range(1, 8)]
    assert sw.session_stats(shots)["cold_start"] == {**sw.session_stats(shots)["cold_start"],
                                                    "basis": "first3", "count": 3}
    shots[4]["phase"] = "cold"
    shots[5]["phase"] = "cold"
    cs = sw.session_stats(shots)["cold_start"]
    assert cs["basis"] == "tagged" and cs["count"] == 2 and cs["avg"]["carry"] == 145.5


def test_session_stats_first3_last3_per_club():
    # 7Iron: 8 shots, tight start then wide; PW: 3 shots (excluded: < 6)
    carries = [150, 150, 150, 140, 160, 120, 180, 200]
    shots = [_shot(i + 1, carry=c, hla=0.0 if i < 3 else 5.0 if i % 2 else -5.0) for i, c in enumerate(carries)]
    shots += [_shot(20 + i, club="PW", carry=100.0) for i in range(3)]
    st = sw.session_stats(shots)
    assert st["dispersion"]["basis"] == "clubs_with_6_plus"
    (row,) = st["dispersion"]["by_club"]
    assert row["club"] == "7Iron" and row["n"] == 8
    assert row["first3"] == {"n": 3, "offline_std": 0.0, "carry_std": 0.0}
    assert row["last3"]["n"] == 3 and row["last3"]["carry_std"] == 41.63 and row["last3"]["offline_std"] > 0
    assert st["strike_consistency"]["by_club"]["PW"] == 0.0


def test_session_stats_groups_and_session_filter():
    shots = [
        _shot(1, feel_id="f1", cluster=1, session_id="s1", ball={"speed": 100.0, "carry": 100.0, "hla": 0.0}),
        _shot(2, feel_id="f1", cluster=1, session_id="s1", ball={"speed": 120.0, "carry": 120.0, "hla": 0.0}),
        _shot(3, feel_id="f2", cluster=2, session_id="s1", club_data=None),
        _shot(4, feel_id="f2", session_id="s2"),
        _shot(5),
    ]
    st = sw.session_stats(shots, "2026-11-17", "s1")
    assert st["shot_count"] == 3 and st["session_id"] == "s1"
    f1 = next(g for g in st["by_feel"] if g["feel_id"] == "f1")
    assert f1["n"] == 2 and f1["smash"] == 1.38 and f1["carry"] == 110.0 and f1["ball_speed"] == 110.0
    assert f1["face_to_path"] == 2.0 and f1["aoa"] == -4.0 and f1["path"] == -1.0 and f1["face"] == 1.0
    f2 = next(g for g in st["by_feel"] if g["feel_id"] == "f2")
    assert f2["n"] == 1 and f2["smash"] is None and f2["aoa"] is None  # missing club data -> null
    assert [g["cluster"] for g in st["by_cluster"]] == [1, 2]
    assert sw.session_stats(shots)["shot_count"] == 5  # no filter -> all


def test_server_context_end_to_end(bridge):
    hub, srv = bridge
    resp, data = _req(srv, "POST", "/api/context", json.dumps(
        {"drill_id": "d1", "feel_id": "f1", "block_id": "b1", "session_id": "s1", "phase": "cold",
         "cluster": 2, "note": "hi"}), JSON)
    assert resp.status == 200
    assert json.loads(data) == {"context": {"drill_id": "d1", "feel_id": "f1", "block_id": "b1",
                                            "session_id": "s1", "phase": "cold", "cluster": 2, "note": "hi"}}
    st = json.loads(_req(srv, "GET", "/api/status")[1])
    assert st["context"]["feel_id"] == "f1" and st["active_drill"] == "d1"
    # /api/drill is back-compat and shares state
    resp, data = _req(srv, "POST", "/api/drill", json.dumps({"drill_id": "d2"}), JSON)
    assert resp.status == 200 and json.loads(data) == {"active_drill": "d2"}
    assert hub.context["drill_id"] == "d2" and hub.context["feel_id"] == "f1"
    for bad in ({}, {"phase": "x"}, {"cluster": 1000}, {"feel_id": "a b"}, {"nope": 1}, [1]):
        resp, _ = _req(srv, "POST", "/api/context", json.dumps(bad), JSON)
        assert resp.status == 400, bad
    assert hub.context["phase"] == "cold"  # rejected bodies changed nothing
    # same policy: CORS / Content-Type / Origin / Host
    resp, _ = _req(srv, "POST", "/api/context", '{"phase":"block"}', {"Content-Type": "text/plain"})
    assert resp.status == 415
    resp, _ = _req(srv, "POST", "/api/context", '{"phase":"block"}', {**JSON, "Origin": "https://evil.example"})
    assert resp.status == 403
    resp, _ = _req(srv, "POST", "/api/context", '{"phase":"block"}', {**JSON, "Origin": "null"})
    assert resp.status == 200 and resp.getheader("Access-Control-Allow-Origin") == "null"
    resp, _ = _req(srv, "POST", "/api/context", "not json", JSON)
    assert resp.status == 400
    resp, _ = _req(srv, "OPTIONS", "/api/context", headers={"Origin": "null"})
    assert resp.status == 204


def test_server_shots_v2_and_session_stats(bridge):
    hub, srv = bridge
    hub.set_context({"feel_id": "f1", "session_id": "s1", "phase": "cold", "cluster": 1})
    for i in range(4):
        hub.record_shot(sw.openconnect_to_shot(OC_FULL, ts=f"2026-11-17T10:0{i}:00.000-08:00"))
    hub.set_context({"session_id": "s2", "feel_id": None})
    hub.record_shot(sw.openconnect_to_shot(OC_FULL, ts="2026-11-17T11:00:00.000-08:00"))
    shots = json.loads(_req(srv, "GET", "/api/shots?date=2026-11-17")[1])["shots"]
    assert len(shots) == 5 and shots[0]["derived"]["smash"] == 1.38 and shots[0]["phase"] == "cold"
    st = json.loads(_req(srv, "GET", "/api/session-stats?date=2026-11-17&session_id=s1")[1])
    assert st["shot_count"] == 4 and st["cold_start"]["basis"] == "tagged" and st["by_feel"][0]["n"] == 4
    st = json.loads(_req(srv, "GET", "/api/session-stats?date=2026-11-17")[1])
    assert st["shot_count"] == 5 and st["session_id"] is None
    assert json.loads(_req(srv, "GET", "/api/session-stats?date=2026-01-01")[1])["shot_count"] == 0
    for q in ("date=nope", "date=2026-11-17&session_id=../x"):
        assert _req(srv, "GET", "/api/session-stats?" + q)[0].status == 400
    resp, _ = _req(srv, "GET", "/api/session-stats", headers={"Origin": "https://evil.example"})
    assert resp.status == 403


def test_demo_message_has_coherent_club_data():
    for n in range(50):
        shot = sw.openconnect_to_shot(sw.demo_openconnect_message(n), club="x")
        cd = shot["club_data"]
        assert all(cd[k] is not None for k in ("speed", "path", "face", "aoa"))
        assert 1.0 < shot["derived"]["smash"] < 1.6


def test_hub_club_tracking_and_gspro_club_endpoint(bridge, monkeypatch):
    hub, srv = bridge
    q = hub.subscribe()
    try:
        assert hub.set_club("7Iron") == "7Iron"
        st = json.loads(_req(srv, "GET", "/api/status")[1])
        assert st["current_club"] == "7Iron"
        events = []
        while not q.empty():
            events.append(q.get_nowait())
        assert any(ev == "club" and json.loads(data)["club"] == "7Iron" for ev, data in events)
    finally:
        hub.unsubscribe(q)

    # Validation checks on POST /api/gspro/club
    for bad in ({}, {"key": "x", "steps": 1}, {"key": "i", "steps": 0}, {"key": "k", "steps": 17}, {"key": "i", "steps": True}):
        resp, _ = _req(srv, "POST", "/api/gspro/club", json.dumps(bad), JSON)
        assert resp.status == 400, bad

    # Stubbed Windows keystroke dispatch -> 200
    calls = []
    monkeypatch.setattr(sw, "send_gspro_club_keys", lambda k, s, cfg=None: (calls.append((k, s)) or True, f"sent {s}x {k.upper()}"))
    resp, data = _req(srv, "POST", "/api/gspro/club", json.dumps({"key": "k", "steps": 4, "club": "7I"}), JSON)
    assert resp.status == 200
    assert json.loads(data)["ok"] is True and calls == [("k", 4)]

    # Unavailable GSPro / non-Windows -> 503
    monkeypatch.setattr(sw, "send_gspro_club_keys", lambda k, s, cfg=None: (False, "GSPro main window not found"))
    resp, data = _req(srv, "POST", "/api/gspro/club", json.dumps({"key": "i", "steps": 2}), JSON)
    assert resp.status == 503 and json.loads(data)["ok"] is False

    # Browser origins (including file:// Origin: null) must be blocked on /api/gspro/club
    for bad_origin in ("null", f"http://127.0.0.1:{srv.port}", "https://evil.example"):
        resp, _ = _req(srv, "POST", "/api/gspro/club", json.dumps({"key": "i", "steps": 1}),
                       {**JSON, "Origin": bad_origin})
        assert resp.status == 403, bad_origin
        resp, _ = _req(srv, "OPTIONS", "/api/gspro/club", headers={"Origin": bad_origin})
        assert resp.status == 403, bad_origin

    # Non-JSON Content-Type -> 415; malformed JSON -> 400
    resp, _ = _req(srv, "POST", "/api/gspro/club", '{"key":"i","steps":1}', {"Content-Type": "text/plain"})
    assert resp.status == 415
    resp, _ = _req(srv, "POST", "/api/gspro/club", "{bad json", JSON)
    assert resp.status == 400


def test_hub_set_club_deduplicates_and_sniffer_handles_code_201(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path))
    q = hub.subscribe()
    try:
        assert hub.set_club("7Iron") == "7Iron"
        assert hub.set_club("7Iron") == "7Iron"  # duplicate -> should not broadcast again
        assert hub.set_club(None) is None
        events = []
        while not q.empty():
            events.append(q.get_nowait())
        assert len(events) == 2
        assert json.loads(events[0][1]) == {"club": "7Iron"}
        assert json.loads(events[1][1]) == {"club": None}
    finally:
        hub.unsubscribe(q)

    sniffer = sw.make_bridge_sniffer(hub)
    sniffer._feed_text(json.dumps({"Code": 201, "Message": "GSPro Player Information", "Player": {"Club": "DR"}}))
    assert hub.current_club == "DR"


