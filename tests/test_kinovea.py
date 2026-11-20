"""Kinovea 2025 / legacy integration - pure logic (no Windows, no Kinovea).

Expected element names/orders are copied from the Kinovea 2025.2 source
(Kinovea.Services/Window/WindowDescriptor.cs, ScreenDescriptorCapture.cs, ScreenDescriptorPlayback.cs,
Types/UserCommand.cs, Types/CaptureFolder.cs, Types/CaptureAutomationConfiguration.cs).
"""
import json
import socket
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import pytest

import simwatch as sw

# ScreenDescriptorCapture.WriteXml order (UserCommand only when it has instructions).
CAPTURE_ELEMENTS = ["Id", "CameraName", "Autostream", "Delay", "DelayedDisplay", "MaxDuration",
                    "CaptureFolder", "FileName", "EnableCommand", "UserCommand", "CapturedFilesPanelForceCollapsed"]
# ScreenDescriptorPlayback.WriteXml order.
PLAYBACK_ELEMENTS = ["FullPath", "Autoplay", "SpeedPercentage", "Stretch", "IsReplayWatcher",
                     "SidePanelSplitterRatio", "SidePanelVisible", "KeyframePanelForceCollapsed"]


def _cfg(tmp_path, lines=False):
    return {
        "video": {"swings_dir": str(tmp_path / "Swings"), "pre_trigger_sec": 3.0, "post_trigger_sec": 1.5,
                  "capture_root": str(tmp_path / "Cap"), "swing_lines": {"enabled": lines},
                  "dtl_camera": "DTL", "fo_camera": "FO"},
        "bridge": {"sessions_dir": str(tmp_path / "Swings" / "Sessions")},
    }


# ----------------------------------------------------------------------------- version -> backend

@pytest.mark.parametrize("ver,setting,hint,expected", [
    ((2025, 2, 0, 0), "auto", None, "2025"),
    ((2025, 1, 1, 0), "auto", None, "2025"),
    ((2024, 1, 0, 0), "auto", None, "legacy"),
    ((2023, 1, 2, 0), "auto", None, "legacy"),
    ((2024, 1, 0, 0), "2025", None, "2025"),
    ((2025, 2, 0, 0), "legacy", None, "legacy"),
    (None, "auto", "legacy", "legacy"),
    (None, "auto", None, "2025"),
    (None, None, None, "2025"),
])
def test_backend_selection(ver, setting, hint, expected):
    assert sw.kinovea_backend_for_version(ver, setting, hint) == expected


def test_launch_args():
    exe = Path("C:/K/Kinovea.exe")
    assert sw.kinovea_launch_args(exe, "Capture", None) == [str(exe), "-name", "Capture"]
    legacy = sw.kinovea_launch_args(exe, "Capture", Path("ws.xml"))
    assert legacy[1:5] == ["-name", "Capture", "-workspace", "ws.xml"]


# ----------------------------------------------------------------------------- window descriptors

def _capture_window(tmp_path):
    cfg = _cfg(tmp_path)
    layout = sw.ensure_swings_layout(cfg)
    folders = sw.kinovea_capture_folders(cfg, layout)
    screens = [sw.kinovea_capture_screen(cfg, a, a, folders[a]["id"]) for a in ("DTL", "FO")]
    return sw.build_kinovea_window_xml("Capture", screens), folders


def test_capture_window_xml_matches_2025_format(tmp_path):
    xml, folders = _capture_window(tmp_path)
    root = ET.fromstring(xml)
    assert root.tag == "KinoveaWindow"
    assert root.findtext("Id") == sw.kinovea_guid("window/Capture")
    assert root.findtext("Name") == "Capture"
    assert root.findtext("StartupMode") == "ScreenList"
    assert root.findtext("ExplorerVisible") == "false"
    caps = root.findall("ScreenList/ScreenDescriptorCapture")
    assert len(caps) == 2
    for cap, angle in zip(caps, ("DTL", "FO")):
        assert [c.tag for c in cap] == CAPTURE_ELEMENTS
        assert cap.findtext("CameraName") == angle
        assert float(cap.findtext("Delay")) == 3.0
        assert float(cap.findtext("MaxDuration")) == 4.5
        assert cap.findtext("CaptureFolder") == folders[angle]["id"]
        assert "%camalias%" in cap.findtext("FileName") and "%date%" in cap.findtext("FileName")
        assert cap.findtext("EnableCommand") == "true"
        assert [c.tag for c in cap.find("UserCommand")] == ["Id", "Instructions"]
        (instr,) = cap.findall("UserCommand/Instructions/Instruction")
        assert "clip-ready" in instr.text and '"%filepath%"' in instr.text and instr.text.endswith(f' {angle}"')


def test_playback_window_and_roundtrip_signature(tmp_path):
    xml = sw.build_kinovea_window_xml("LiveReplay", [
        {"type": "playback", "full_path": sw.kinovea_guid("x"), "speed": 50, "is_watcher": True}])
    root = ET.fromstring(xml)
    (pb,) = root.findall("ScreenList/ScreenDescriptorPlayback")
    assert [c.tag for c in pb] == PLAYBACK_ELEMENTS
    assert pb.findtext("IsReplayWatcher") == "true" and pb.findtext("SpeedPercentage") == "50"
    # Kinovea re-saves on close: new LastSave + WindowState/Rectangle + different formatting -> same signature.
    root.find("LastSave").text = "2026-11-19T10:00:00.1234567Z"
    ET.SubElement(root, "WindowState").text = "Normal"
    ET.SubElement(root, "WindowRectangle").text = "0;0;800;600"
    resaved = ET.tostring(root, encoding="utf-8")
    assert sw.kinovea_window_signature(resaved) == sw.kinovea_window_signature(xml)
    pb.find("SpeedPercentage").text = "100"
    assert sw.kinovea_window_signature(ET.tostring(root)) != sw.kinovea_window_signature(xml)


def test_clip_ready_instruction_survives_cmd_quote_stripping():
    line = sw.kinovea_clip_ready_instruction("FO", python_exe=r"C:\Py 3\python.exe", script=r"C:\a b\simwatch.py")
    # cmd.exe /C with >2 quotes strips the first and the last quote character.
    first, last = line.index('"'), line.rindex('"')
    executed = line[:first] + line[first + 1:last] + line[last + 1:]
    assert executed == r'"C:\Py 3\python.exe" "C:\a b\simwatch.py" clip-ready "%filepath%" FO'


# ----------------------------------------------------------------------------- preferences

PREFS_2025 = """<?xml version="1.0" encoding="utf-8"?>
<KinoveaPreferences>
  <FormatVersion>3.0</FormatVersion>
  <General><Culture>en</Culture><EnableDebugLog>false</EnableDebugLog></General>
  <Player><InfoFading><Enabled>true</Enabled><AlwaysVisible>false</AlwaysVisible></InfoFading><AspectRatio>Auto</AspectRatio></Player>
  <Capture>
    <CapturePathConfiguration>
      <CaptureFolders>
        <CaptureFolder><Id>11111111-2222-3333-4444-555555555555</Id><ShortName>Mine</ShortName><Path>D:\\Vids</Path></CaptureFolder>
      </CaptureFolders>
      <DefaultFileName>%dateb%-%time%</DefaultFileName>
      <VideoFormat>MP4</VideoFormat>
    </CapturePathConfiguration>
    <CaptureRecordingMode>Camera</CaptureRecordingMode>
    <MemoryBuffer>4096</MemoryBuffer>
    <Cameras><Camera><Identifier>abc</Identifier><Alias>DTL</Alias></Camera></Cameras>
    <CaptureAutomationConfiguration>
      <EnableAudioTrigger>true</EnableAudioTrigger>
      <AudioInputDevice>dev-1</AudioInputDevice>
      <AudioTriggerThreshold>0.900</AudioTriggerThreshold>
      <EnableUDPTrigger>false</EnableUDPTrigger>
      <UDPPort>8875</UDPPort>
      <AudioQuietPeriod>0.000</AudioQuietPeriod>
      <TriggerAction>SaveSnapshot</TriggerAction>
      <EnableAutoNumbering>true</EnableAutoNumbering>
    </CaptureAutomationConfiguration>
  </Capture>
  <Keyboard><Hotkeys /></Keyboard>
</KinoveaPreferences>
"""


def test_prefs_patch_preserves_unrelated_nodes(tmp_path):
    cfg = _cfg(tmp_path)
    folders = list(sw.kinovea_capture_folders(cfg, sw.ensure_swings_layout(cfg)).values())
    out = sw.patch_kinovea_prefs_2025(PREFS_2025, folders, udp_port=9001, quiet_period=3.0, memory_buffer_mb=2048)
    root = ET.fromstring(out)
    assert root.findtext("General/Culture") == "en"
    assert root.find("Keyboard/Hotkeys") is not None
    assert root.findtext("Capture/Cameras/Camera/Alias") == "DTL"
    assert root.findtext("Capture/CapturePathConfiguration/DefaultFileName") == "%dateb%-%time%"
    assert root.findtext("Capture/MemoryBuffer") == "4096"  # never lowered
    ids = [cf.findtext("Id") for cf in root.findall("Capture/CapturePathConfiguration/CaptureFolders/CaptureFolder")]
    assert ids[0] == "11111111-2222-3333-4444-555555555555" and len(ids) == 5
    assert set(f["id"] for f in folders) <= set(ids)
    auto = root.find("Capture/CaptureAutomationConfiguration")
    assert auto.findtext("EnableAudioTrigger") == "false"
    assert auto.findtext("AudioInputDevice") == "dev-1"
    assert auto.findtext("EnableUDPTrigger") == "true"
    assert auto.findtext("UDPPort") == "9001"
    assert auto.findtext("AudioQuietPeriod") == "3.000"
    assert auto.findtext("TriggerAction") == "RecordVideo"
    assert auto.findtext("DefaultTriggerArmed") == "true"
    assert root.findtext("Capture/CaptureRecordingMode") == "Delay"
    assert root.findtext("Player/InfoFading/AlwaysVisible") == "true"
    assert root.findtext("Player/AspectRatio") == "Auto"
    # Idempotent: patching again changes nothing.
    assert sw.patch_kinovea_prefs_2025(out, folders, udp_port=9001, quiet_period=3.0, memory_buffer_mb=2048) == out


def test_prefs_patch_from_scratch_and_rejects_foreign_xml(tmp_path):
    out = sw.patch_kinovea_prefs_2025(None, [{"id": sw.kinovea_guid("f"), "short": "S", "path": "C:\\x"}],
                                      memory_buffer_mb=1024)
    root = ET.fromstring(out)
    assert root.tag == "KinoveaPreferences" and root.findtext("FormatVersion") == "3.0"
    assert root.findtext("Capture/MemoryBuffer") == "1024"
    with pytest.raises(ValueError):
        sw.patch_kinovea_prefs_2025("<Other/>", [])


def test_legacy_instances_own_preferences():
    src = "<KinoveaPreferences><General><Culture>fr</Culture><InstancesOwnPreferences>false</InstancesOwnPreferences>" \
          "</General><Capture><X>1</X></Capture></KinoveaPreferences>"
    root = ET.fromstring(sw.patch_kinovea_prefs_legacy_general(src))
    assert root.findtext("General/InstancesOwnPreferences") == "true"
    assert root.findtext("General/AllowMultipleInstances") == "true"
    assert root.findtext("General/Culture") == "fr" and root.findtext("Capture/X") == "1"


# ----------------------------------------------------------------------------- trigger

def test_udp_trigger_sends_datagram():
    rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    rx.bind(("127.0.0.1", 0))
    rx.settimeout(2.0)
    try:
        assert sw.send_udp_trigger(rx.getsockname()[1])
        data, _ = rx.recvfrom(64)
        assert data
    finally:
        rx.close()


@pytest.mark.parametrize("club,speed,vla,expected", [
    ("PT", 6.0, 1.0, True), ("Putter", None, None, True), (None, 8.0, 1.5, True), ("", 12.0, None, True),
    (None, 120.0, 14.0, False), ("7I", 8.0, 1.0, False), ("DR", 150.0, 11.0, False), (None, None, None, False),
])
def test_is_putt(club, speed, vla, expected):
    assert sw.is_putt(club, speed, vla) is expected


def _bare_manager(cfg):
    m = object.__new__(sw.SwingSessionManager)
    m.cfg, m.vcfg, m.hub, m.current_club, m.last_shot_info = cfg, cfg["video"], None, None, None
    m._lock = threading.RLock()
    m._stop_capture_at = 0.0
    calls = []
    m.trigger_capture = lambda: calls.append("trigger")

    class _Pip:
        def show_for_shot(self):
            calls.append("pip")
    m.pip = _Pip()
    return m, calls


def test_putt_shot_skips_capture(tmp_path):
    m, calls = _bare_manager(_cfg(tmp_path))
    m._on_openconnect_shot({"club": "PT", "ball_speed": 7.0, "carry": 0, "timestamp": time.time()})
    assert calls == []
    m._on_openconnect_shot({"club": "7I", "ball_speed": 118.0, "carry": 168, "timestamp": time.time()})
    assert calls == ["trigger", "pip"]


def test_2025_trigger_uses_udp_not_toggle(tmp_path, monkeypatch):
    cfg = _cfg(tmp_path)
    cfg["video"]["kinovea_backend"] = "2025"
    m, _ = _bare_manager(cfg)
    del m.trigger_capture  # use the real method
    sent, toggles = [], []
    monkeypatch.setattr(sw, "send_udp_trigger", lambda port: sent.append(port) or True)
    monkeypatch.setattr(sw, "kinovea_send_command", lambda *a: toggles.append(a) or True)
    sw._KINOVEA_BACKEND_CACHE.clear()
    m.trigger_capture()
    m.trigger_capture()  # debounced
    assert sent == [8875] and toggles == [] and m._stop_capture_at == 0.0


def test_legacy_trigger_toggles_once_until_auto_stop(tmp_path, monkeypatch):
    cfg = _cfg(tmp_path)
    cfg["video"]["kinovea_backend"] = "legacy"
    m, _ = _bare_manager(cfg)
    del m.trigger_capture
    toggles = []
    monkeypatch.setattr(sw, "kinovea_send_command", lambda *a: toggles.append(a) or True)
    sw._KINOVEA_BACKEND_CACHE.clear()
    m.trigger_capture()
    m.trigger_capture()  # still recording (RecordingSeconds) -> ignored, never a stop toggle
    assert len(toggles) == 1 and m._stop_capture_at > time.time() + 4.0


# ----------------------------------------------------------------------------- clip-ready

def _iso(t):
    return datetime.fromtimestamp(t).astimezone().isoformat(timespec="seconds")


def _seed(tmp_path, now):
    cfg = _cfg(tmp_path)
    store = sw.ShotStore(Path(cfg["bridge"]["sessions_dir"]))
    old = store.append({"ts": _iso(now - 120), "club": "DR", "ball": {"speed": 150, "carry": 240}, "clip": None})
    new = store.append({"ts": _iso(now - 5), "club": "7I", "ball": {"speed": 118.4, "carry": 168.2},
                        "clip": None, "drill_id": "gate1"})
    src_dir = tmp_path / "Cap" / "raw"
    src_dir.mkdir(parents=True)
    return cfg, store, old, new, src_dir


def test_clip_ready_links_correct_shot_and_is_idempotent(tmp_path):
    now = time.time()
    cfg, store, old, new, src_dir = _seed(tmp_path, now)
    dtl = src_dir / "DTL_2026-11-19_101500.mp4"
    dtl.write_bytes(b"\x00" * 2048)
    res = sw.clip_ready(cfg, dtl, "DTL", now=now, wait=False)
    assert res["status"] == "ok" and res["linked"] and res["ts"] == new["ts"]
    assert res["clip"] == "002_7I_168y_118mph_D-gate1_DTL.mp4"
    date = res["ts"][:10]
    lib = Path(cfg["bridge"]["sessions_dir"]) / date
    assert (lib / res["clip"]).exists() and Path(res["replay"]).exists()
    assert Path(res["replay"]).parent.name == "DTL"
    shots = store.read(date)
    assert [s["clip"] for s in shots] == [None, res["clip"]]
    assert len(list((lib / sw.CLIP_EVENTS_DIR).glob("*.json"))) == 1

    again = sw.clip_ready(cfg, dtl, "DTL", now=now, wait=False)
    assert again["status"] == "duplicate" and again["clip"] == res["clip"]
    assert len(list(lib.glob("*_DTL.mp4"))) == 1
    assert len(list((lib / sw.CLIP_EVENTS_DIR).glob("*.json"))) == 1

    # The FO clip of the same swing pairs with the same shot but does not steal the DTL link.
    fo = src_dir / "FO_2026-11-19_101500.mp4"
    fo.write_bytes(b"\x00" * 2048)
    res_fo = sw.clip_ready(cfg, fo, "%camalias%", now=now + 0.3, wait=False)
    assert res_fo["clip"] == "002_7I_168y_118mph_D-gate1_FO.mp4" and res_fo["linked"] is False
    assert store.read(date)[1]["clip"] == res["clip"]


def test_clip_ready_without_matching_shot_and_cli_never_fails(tmp_path):
    now = time.time()
    cfg, store, old, new, src_dir = _seed(tmp_path, now)
    clip = src_dir / "DTL_late.mp4"
    clip.write_bytes(b"\x00" * 100)
    res = sw.clip_ready(cfg, clip, "DTL", now=now + 600, wait=False)  # no shot in the window
    assert res["status"] == "ok" and res["ts"] is None and res["clip"].endswith("_Swing_DTL.mp4")
    assert sw.cmd_clip_ready(tmp_path / "missing.json", str(tmp_path / "nope.mp4"), "DTL") == 0
    assert sw.cmd_clip_ready(tmp_path / "missing.json", None, None) == 0


def test_angle_from_camalias():
    assert sw.angle_from_camalias("FO") == "FO"
    assert sw.angle_from_camalias("dtl") == "DTL"
    assert sw.angle_from_camalias("%camalias%", Path("x/FO_2026.mp4")) == "FO"
    assert sw.angle_from_camalias("Cam2", None, {"video": {"fo_camera": "Cam2"}}) == "FO"


def test_file_ready_requires_stable_size(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x" * 10)
    assert not sw.file_ready_for_copy(f, 0.5)
    assert sw.file_ready_for_copy(f, 2.0)
    (tmp_path / "e.mp4").write_bytes(b"")
    assert not sw.file_ready_for_copy(tmp_path / "e.mp4", 5.0)


def test_putter_round_trip_still_swaps_reference(tmp_path, monkeypatch):
    """Driver -> PT -> 7I: the putter keeps the Driver reference, but 7I must then swap it to Iron."""
    m, _ = _bare_manager(_cfg(tmp_path))
    reloads = []
    monkeypatch.setattr(sw, "setup_video_rig", lambda cfg, club=None, **k: reloads.append(club))
    monkeypatch.setattr(sw, "tile_video_windows", lambda *a, **k: None)
    m.active_reference = "My-Go-To"
    m._on_club_change("DR")
    m._on_club_change("PT")
    assert reloads == ["DR"]
    m._on_club_change("7I")
    assert reloads == ["DR", "7I"]
    m._on_club_change("PT")
    m._on_club_change("8I")  # same category as before the putt: no reload
    assert reloads == ["DR", "7I"]


def test_clip_ready_lock_outlasts_slow_first_run(tmp_path, monkeypatch):
    """The FO run waits for the DTL run (copies + OpenCV) far longer than 10 s and never steals a live lock."""
    seen = {}

    class FakeLock:
        def __init__(self, path, timeout=10.0, stale_sec=30.0):
            seen.update(timeout=timeout, stale=stale_sec)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(sw, "_FileLock", FakeLock)
    now = time.time()
    cfg, store, old, new, src_dir = _seed(tmp_path, now)
    clip = src_dir / "DTL_x.mp4"
    clip.write_bytes(b"\x00" * 100)
    sw.clip_ready(cfg, clip, "DTL", now=now, wait=False)
    assert seen["timeout"] >= 60 and seen["stale"] > seen["timeout"]
