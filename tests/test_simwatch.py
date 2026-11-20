"""Platform-independent tests for simwatch.py (run on macOS/Linux; no Windows APIs are touched)."""
import json
import logging
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

import simwatch as sw

ROOT = Path(__file__).resolve().parent.parent


def errors(issues):
    return [m for sev, m in issues if sev == "error"]


def warnings(issues):
    return [m for sev, m in issues if sev == "warning"]


# ------------------------------------------------------------------ importability / config

def test_import_is_platform_safe():
    assert hasattr(sw, "IS_WINDOWS")
    sw.alert  # winsound stub must exist so alert() cannot NameError


def test_real_config_validates_with_zero_errors(real_cfg):
    issues = sw.validate_config(real_cfg, check_paths=False)
    assert errors(issues) == []
    assert warnings(issues) == []  # shipped config should be warning-clean too


def test_real_config_via_load_config():
    cfg = sw.load_config(ROOT / "config.json", command="watch")
    assert "gspro" in cfg["apps_by_key"]
    assert cfg["interval_sec"] == 5


def test_recovery_ladder_has_no_redundant_levels(real_cfg):
    lists = [tuple(step["restart"]) for step in real_cfg["recovery"]]
    assert len(lists) == len(set(lists))


def test_missing_top_level_keys(real_cfg):
    del real_cfg["apps"]
    del real_cfg["checks"]
    errs = errors(sw.validate_config(real_cfg, check_paths=False))
    assert any("'apps'" in e for e in errs) and any("'checks'" in e for e in errs)


def test_recovery_key_not_in_apps(real_cfg):
    real_cfg["recovery"][0]["restart"].append("nope")
    assert any("nope" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_startup_order_key_not_in_apps(real_cfg):
    real_cfg["startup"]["order"].append("ghost")
    assert any("ghost" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_check_app_not_in_apps(real_cfg):
    real_cfg["checks"][0]["app"] = "missing_app"
    assert any("missing_app" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_unknown_check_type(real_cfg):
    real_cfg["checks"][0]["type"] = "telepathy"
    assert any("telepathy" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_check_missing_required_field(real_cfg):
    real_cfg["checks"] = [{"name": "ping", "type": "device_ping"}]
    assert any("'ip'" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_duplicate_app_key_and_missing_exe(real_cfg):
    real_cfg["apps"].append(dict(real_cfg["apps"][0]))
    del real_cfg["apps"][1]["exe"]
    errs = errors(sw.validate_config(real_cfg, check_paths=False))
    assert any("duplicate" in e for e in errs)


def test_warning_identical_recovery_levels(real_cfg):
    real_cfg["recovery"].append(dict(real_cfg["recovery"][-1], name="dup"))
    assert any("identical" in w for w in warnings(sw.validate_config(real_cfg, check_paths=False)))


def test_warning_unreferenced_app(real_cfg):
    real_cfg["apps"].append({"key": "extra", "process": "x.exe", "exe": "C:\\x.exe"})
    assert any("'extra'" in w for w in warnings(sw.validate_config(real_cfg, check_paths=False)))


def test_warning_nonexistent_exe_when_checking_paths(real_cfg):
    issues = sw.validate_config(real_cfg, check_paths=True)
    assert errors(issues) == []
    if not sw.IS_WINDOWS:  # the Windows paths cannot exist here
        assert any("exe not found" in w for w in warnings(issues))


def test_bad_interval(real_cfg):
    real_cfg["interval_sec"] = 0
    assert any("interval_sec" in e for e in errors(sw.validate_config(real_cfg, check_paths=False)))


def test_load_config_rejects_broken_daemon_config(tmp_path, real_cfg):
    real_cfg["checks"][0]["type"] = "bogus"
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(real_cfg), encoding="utf-8")
    with pytest.raises(SystemExit) as ei:
        sw.load_config(p, command="watch")
    assert "bogus" in str(ei.value)
    # other commands only log
    assert sw.load_config(p, command="check")["checks"]


def test_load_config_invalid_json(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{nope", encoding="utf-8")
    with pytest.raises(SystemExit):
        sw.load_config(p)


# ------------------------------------------------------------------ pure helpers

def test_parse_hotkey():
    assert sw.parse_hotkey("Alt+H") == (0x4000 | 0x0001, ord("H"))
    assert sw.parse_hotkey("Ctrl+Shift+P") == (0x4000 | 0x0002 | 0x0004, ord("P"))
    assert sw.parse_hotkey("F8") == (0x4000, 0x77)
    assert sw.parse_hotkey("alt+space") == (0x4000 | 0x0001, 0x20)
    assert sw.parse_hotkey("") is None
    assert sw.parse_hotkey("Alt+!") is None
    assert sw.parse_hotkey("F99") is None


@pytest.mark.parametrize("club,cat", [
    ("PW", "Wedge"), ("56", "Wedge"), ("Driver", "Driver"), ("3W", "Driver"), ("7I", "Iron"),
    ("", "Iron"), (None, "Iron"), (" sw ", "Wedge"),
])
def test_club_category(club, cat):
    assert sw.club_category(club) == cat


@pytest.mark.parametrize("text,expected", [
    ("1;2", (1.0, 2.0)), ("1,5;2,5", (1.5, 2.5)), (None, None), ("", None), ("abc;def", None), ("5", None),
])
def test_parse_kva_pair(text, expected):
    assert sw._parse_kva_pair(text) == expected


def test_unique_path(tmp_path):
    a = tmp_path / "001_Iron_DTL.mp4"
    assert sw.unique_path(a) == a
    a.write_bytes(b"x")
    b = sw.unique_path(a)
    assert b.name == "001_Iron_DTL_2.mp4"
    b.write_bytes(b"y")
    assert sw.unique_path(a).name == "001_Iron_DTL_3.mp4"
    assert a.read_bytes() == b"x"


def test_write_text_if_changed(tmp_path):
    f = tmp_path / "prefs.xml"
    assert sw.write_text_if_changed(f, "one") is True           # new file, no backup
    assert not (tmp_path / "prefs.xml.bak").exists()
    assert sw.write_text_if_changed(f, "one") is False          # identical -> skipped
    assert sw.write_text_if_changed(f, "two") is True           # changed -> .bak of old
    assert (tmp_path / "prefs.xml.bak").read_text() == "one"
    assert sw.write_text_if_changed(f, "three") is True         # rolling: only ONE bak
    assert (tmp_path / "prefs.xml.bak").read_text() == "two"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["prefs.xml", "prefs.xml.bak"]


def test_ping_ok_return_code_decides():
    assert sw._ping_ok(0, "Reply from 1.2.3.4: bytes=32 time<1ms TTL=64") is True
    assert sw._ping_ok(1, "Reply from 1.2.3.4: TTL=64") is False
    # non-English reply with no recognisable words: exit code alone is trusted
    assert sw._ping_ok(0, "Antwort von 1.2.3.4: Bytes=32 Zeit<1ms") is True
    # gateway 'unreachable' reply exits 0 on Windows but has no TTL
    assert sw._ping_ok(0, "Reply from 10.0.0.1: Destination host unreachable.") is False


def test_log_throttled(caplog):
    sw._THROTTLE.clear()
    with caplog.at_level(logging.WARNING, logger="simwatch"):
        assert sw.log_throttled("k", "first", every_sec=60) is True
        assert sw.log_throttled("k", "second", every_sec=60) is False
        assert sw.log_throttled("other", "third", every_sec=60) is True
    assert [r.getMessage() for r in caplog.records] == ["first", "third"]


def test_write_status_atomic(tmp_path, monkeypatch):
    target = tmp_path / "simwatch_status.json"
    monkeypatch.setattr(sw, "STATUS_PATH", target)
    sw.write_status("healthy", failing=[], level=0)
    doc = json.loads(target.read_text())
    assert doc["state"] == "healthy" and "timestamp" in doc and doc["level"] == 0
    sw.write_status("degraded", failing=["x"])
    assert json.loads(target.read_text())["failing"] == ["x"]
    assert [p.name for p in tmp_path.iterdir()] == ["simwatch_status.json"]  # no stray tmp


# ------------------------------------------------------------------ OpenConnect parsing

SHOT = ('{"DeviceID":"LP","ShotNumber":7,"Player":{"Club":"7I"},'
        '"BallData":{"Speed":112.4,"CarryDistance":151.2},"ShotDataOptions":{"ContainsBallData":true}}')


def make_monitor():
    shots, clubs = [], []
    return sw.OpenConnectMonitor(shots.append, clubs.append), shots, clubs


def test_feed_text_whole_message():
    m, shots, clubs = make_monitor()
    m._feed_text(SHOT)
    assert clubs == ["7I"]
    assert len(shots) == 1 and shots[0]["shot_num"] == 7 and shots[0]["carry"] == 151.2


def test_feed_text_fragmented():
    m, shots, clubs = make_monitor()
    for i in range(0, len(SHOT), 7):
        m._feed_text(SHOT[i:i + 7])
    assert len(shots) == 1 and clubs == ["7I"]


def test_feed_text_noise_and_truncated_prefix():
    m, shots, clubs = make_monitor()
    m._feed_text('garbage {"half": ' + SHOT + "\r\n\x00junk")
    assert len(shots) == 1


def test_feed_text_two_messages_and_dedupe():
    m, shots, _ = make_monitor()
    m._feed_text(SHOT + SHOT)          # same shot echoed within 2s -> one trigger
    assert len(shots) == 1
    other = SHOT.replace('"ShotNumber":7', '"ShotNumber":8').replace("112.4", "99.0")
    m._feed_text(other)
    assert len(shots) == 2


def test_handle_json_ignores_non_ball_and_non_dict():
    m, shots, clubs = make_monitor()
    m._handle_json([1, 2])
    m._handle_json({"BallData": {"Speed": 0}})
    m._handle_json({"Player": {"Club": "DR"}})
    assert shots == [] and clubs == ["DR"]


def test_openconnect_start_stop_race_is_safe():
    m, _, _ = make_monitor()
    m._run = lambda: m._stop.wait(5)   # stand-in worker; raw sockets are Windows-only
    m.start()
    t1 = m._thread
    assert t1.is_alive()
    m.start()                           # already running: no second thread
    assert m._thread is t1
    m.stop()                            # joins
    assert not t1.is_alive()
    m.start()                           # clean restart after stop
    t2 = m._thread
    assert t2 is not t1 and t2.is_alive()
    m.stop()
    assert not t2.is_alive()


# ------------------------------------------------------------------ displays

DISP_PRIMARY = {"device": "\\\\.\\DISPLAY1", "left": 0, "top": 0, "width": 1920, "height": 1080,
                "primary": True, "id": "MON1", "name": "Dell"}
DISP_LEFT = {"device": "\\\\.\\DISPLAY2", "left": -1920, "top": 0, "width": 1280, "height": 720,
             "primary": False, "id": "BNQ123", "name": "BenQ"}
DISP_RIGHT = {"device": "\\\\.\\DISPLAY3", "left": 1920, "top": 0, "width": 1280, "height": 720,
              "primary": False, "id": "EPS9", "name": "Epson"}


def test_choose_display_no_displays(monkeypatch):
    monkeypatch.setattr(sw, "list_displays", lambda: [])
    idx, disp, on = sw.choose_display({})
    assert (idx, on) == (0, False) and disp["width"] == 1920


def test_choose_display_single_is_projector_off(monkeypatch):
    monkeypatch.setattr(sw, "list_displays", lambda: [DISP_PRIMARY])
    assert sw.choose_display({})[2] is False


def test_choose_display_second_display_is_projector(monkeypatch):
    monkeypatch.setattr(sw, "list_displays", lambda: [DISP_PRIMARY, DISP_LEFT])
    idx, disp, on = sw.choose_display({"projector": {"side": "left"}})
    assert (idx, on, disp["id"]) == (1, True, "BNQ123")


def test_choose_display_side_and_regex(monkeypatch):
    monkeypatch.setattr(sw, "list_displays", lambda: [DISP_PRIMARY, DISP_LEFT, DISP_RIGHT])
    _, d, on = sw.choose_display({"projector": {"side": "left"}})
    assert on and d["id"] == "BNQ123"
    _, d, on = sw.choose_display({"projector": {"side": "right"}})
    assert on and d["id"] == "EPS9"
    _, d, on = sw.choose_display({"projector": {"match_regex": "EPS"}})
    assert on and d["id"] == "EPS9"
    _, d, on = sw.choose_display({"projector": {"match_regex": "NOPE"}})
    assert not on and d["id"] == "MON1"


# ------------------------------------------------------------------ evaluate_checks

def _cfg(checks):
    return {"checks": checks, "apps_by_key": {}}


def test_evaluate_checks_levels_and_device_flags(monkeypatch):
    monkeypatch.setattr(sw, "CHECKS", {
        "good": lambda c, cfg: (True, "fine"),
        "bad": lambda c, cfg: (False, "broken"),
        "boom": lambda c, cfg: 1 / 0,
        "unk": lambda c, cfg: (None, "?"),
    })
    res = sw.evaluate_checks(_cfg([
        {"name": "a", "type": "good"},
        {"name": "b", "type": "bad", "recovery_level": 1},
        {"name": "c", "type": "bad", "device": True, "recovery_level": 0},
    ]), verbose=False)
    assert res["all_ok"] is False and res["level"] == 1
    assert res["failing"] == ["b", "c"] and res["only_device_failed"] is False

    res = sw.evaluate_checks(_cfg([{"name": "d", "type": "bad", "device": True}]), verbose=False)
    assert res["only_device_failed"] is True

    res = sw.evaluate_checks(_cfg([{"name": "e", "type": "boom"}, {"name": "f", "type": "unk"}]), verbose=False)
    assert res["all_ok"] is True and res["any_unknown"] is True  # errors don't trigger recovery


def test_evaluate_checks_unknown_type_is_visible_not_fatal(monkeypatch, caplog):
    monkeypatch.setattr(sw, "CHECKS", {"good": lambda c, cfg: (True, "fine")})
    sw._THROTTLE.clear()
    with caplog.at_level(logging.ERROR, logger="simwatch"):
        res = sw.evaluate_checks(_cfg([{"name": "x", "type": "nope"}, {"name": "y", "type": "good"}]),
                                 verbose=False)
        sw.evaluate_checks(_cfg([{"name": "x", "type": "nope"}]), verbose=False)  # throttled: no 2nd log
    assert res["all_ok"] is True and res["skipped"] == ["x"]
    errs = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errs) == 1 and "unknown type" in errs[0].getMessage()


# ------------------------------------------------------------------ swing lines round-trip

def test_kva_round_trip(tmp_path):
    cfg = {"video": {"swings_dir": str(tmp_path / "Swings"),
                     "swing_lines": {"enabled": True, "auto_detect_ball": False, "auto_trace_path": False}}}
    layout = sw.ensure_swings_layout(cfg)
    xml_text = sw.build_swing_kva_xml("DTL", "7I", cfg, video_path=None)
    ET.fromstring(xml_text.split("\n", 1)[1])  # well-formed
    (layout["today_dtl"] / "001_7I_DTL.kva").write_text(xml_text, encoding="utf-8")
    fo_xml = sw.build_swing_kva_xml("FO", "7I", cfg, video_path=None)
    (layout["today_fo"] / "001_7I_FO.kva").write_text(fo_xml, encoding="utf-8")

    res = sw.save_lines_template_from_kva(cfg, club_override="7I")
    assert "Shaft Plane (Iron)" in res["updated_items"]
    assert {"Tush Line", "Spine & Head", "Lead Hip Wall", "Head Box", "Ball Line"} <= set(res["updated_items"])
    tpl = sw.load_swing_lines_template(cfg)
    ball = tpl["dtl"]["dtl_by_club"]["Iron"]["shaft_plane"]["start"]
    default_ball = sw.default_swing_lines_template()["dtl"]["ball"]
    assert ball == pytest.approx(default_ball, abs=0.01)
    assert tpl["dtl"]["handedness"] == "right"
    assert tpl["dtl"]["angles_deg"]["Iron"] == pytest.approx(60.0, abs=1.0)


# ------------------------------------------------------------------ watch loop survives exceptions

def test_watch_survives_forced_exception(monkeypatch, tmp_path):
    monkeypatch.setattr(sw, "STATUS_PATH", tmp_path / "status.json")
    monkeypatch.setattr(sw, "acquire_singleton_lock", lambda *a: True)
    calls = {"n": 0}

    class Stop(BaseException):
        pass

    def fake_step(cfg, st, video_mgr):
        calls["n"] += 1
        if calls["n"] == 1:
            raise KeyError("forced")
        if calls["n"] >= 3:
            raise Stop()

    monkeypatch.setattr(sw, "_watch_step", fake_step)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    with pytest.raises(Stop):
        sw.watch({"interval_sec": 0.01, "video": {"enabled": False}, "apps_by_key": {}})
    assert calls["n"] == 3  # iteration 1 raised KeyError, loop kept going


def test_recover_ignores_unknown_keys_and_levels(monkeypatch, caplog):
    cfg = {"recovery": [{"name": "r", "restart": ["ghost"]}], "apps_by_key": {}, "settle_sec": 0}
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    sw.recover(cfg, 5)      # out-of-range level: logged, no exception
    sw.recover(cfg, 0)      # unknown key: logged, no KeyError


# ------------------------------------------------------------------ doctor / CLI

def test_doctor_report_degrades_off_windows(monkeypatch):
    rows = sw.doctor_report(ROOT / "config.json")
    assert rows and all(len(r) == 3 for r in rows)
    if not sw.IS_WINDOWS:
        assert not [r for r in rows if r[0] == sw.FAIL]


def test_doctor_fails_on_bad_config(tmp_path, real_cfg, capsys):
    real_cfg["checks"][0]["type"] = "bogus"
    p = tmp_path / "c.json"
    p.write_text(json.dumps(real_cfg), encoding="utf-8")
    assert sw.run_doctor(p) == 1
    out = capsys.readouterr().out
    assert "FAIL" in out and "bogus" in out


def test_doctor_cli_subprocess():
    r = subprocess.run([sys.executable, str(ROOT / "simwatch.py"), "doctor"], capture_output=True, text=True,
                       cwd=str(ROOT))
    assert "STATUS" in r.stdout
    assert r.returncode in (0, 1)
    if not sw.IS_WINDOWS:
        assert r.returncode == 0, r.stdout
