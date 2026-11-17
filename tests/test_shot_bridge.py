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
    assert resp.status == 200 and resp.getheader("Access-Control-Allow-Origin") == "*"
    st = json.loads(data)
    assert st["ok"] is True and st["version"] == 1 and st["sniffer_ok"] is False and st["active_drill"] is None

    resp, data = _req(srv, "POST", "/api/drill", json.dumps({"drill_id": "towel-drill"}),
                      {"Content-Type": "application/json"})
    assert resp.status == 200 and json.loads(data) == {"active_drill": "towel-drill"}
    for bad in ({"drill_id": "../x"}, {"drill_id": "x" * 81}, {"nope": 1}, [1]):
        resp, _ = _req(srv, "POST", "/api/drill", json.dumps(bad))
        assert resp.status == 400
    resp, _ = _req(srv, "POST", "/api/drill", "not json")
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
    assert b"text/event-stream" in buf and b"Access-Control-Allow-Origin: *" in buf
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
