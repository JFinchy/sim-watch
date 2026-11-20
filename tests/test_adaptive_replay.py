"""Adaptive video layout, post-shot replay timing, compare cycling and the shortcut map - pure logic.

Windows calls are stubbed: VideoLayoutController talks to a fake window-ops object, hotkey registration gets a
fake register/probe function.
"""
import http.client
import json
import threading
from pathlib import Path


import simwatch as sw

ROOT = Path(__file__).resolve().parent.parent


def _disp(w, h, left=0, top=0, primary=True, dev="\\\\.\\DISPLAY1"):
    return {"device": dev, "left": left, "top": top, "width": w, "height": h, "primary": primary, "id": "", "name": ""}


# ---------------------------------------------------------------- layout selection

def test_rig_1366x768_is_single_small_with_big_top_replay():
    L = sw.select_video_layout([_disp(1366, 768)])
    assert L["profile"] == "single_small"
    assert L["replay_rect"] == (0, 0, 1366, 614)        # 2 panes ~683 px wide, GSPro's bottom bar stays visible
    assert L["capture_hide"] == "behind" and L["topmost"] and not L["always_on"] and L["strip_rect"] is None
    assert "1366 px wide < 1600" in L["reason"]
    assert L["park_rect"] == (0, 0, 1366, 768) and L["offscreen_rect"][0] >= 1366 + 64


def test_large_single_display_and_optional_strip():
    L = sw.select_video_layout([_disp(1920, 1080)])
    assert L["profile"] == "single_large"
    x, y, w, h = L["replay_rect"]
    assert (w, h, y) == (1440, 702, 0) and x == (1920 - 1440) // 2
    L = sw.select_video_layout([_disp(1920, 1080)], {"profiles": {"single_large": {"strip": True}}})
    sx, sy, sw_, sh = L["strip_rect"]
    assert sx + sw_ == 1920 - 12 and sy + sh == 1080 - 12   # bottom-right corner


def test_dual_uses_the_free_display_as_replay_screen():
    tv = _disp(1920, 1080, left=-1920, primary=False, dev="\\\\.\\DISPLAY2")
    laptop = _disp(1366, 768)
    L = sw.select_video_layout([laptop, tv], gspro_index=1)   # GSPro on the projector/TV
    assert L["profile"] == "dual" and L["replay_display"] == 0 and L["gspro_display"] == 1
    assert L["replay_rect"] == (0, 0, 1366, 768)
    assert L["always_on"] and not L["topmost"]
    assert L["park_rect"] == (-1920, 0, 1920, 1080)          # Capture waits behind GSPro on the TV


def test_forced_profiles_and_bad_values_fall_back():
    L = sw.select_video_layout([_disp(1366, 768)], {"profile": "single_large"})
    assert L["profile"] == "single_large" and "forced" in L["reason"]
    L = sw.select_video_layout([_disp(1366, 768)], {"profile": "dual"})
    assert L["profile"] == "single_small" and "only one display" in L["reason"]
    L = sw.select_video_layout([_disp(1366, 768)], {"profile": "huge", "capture_hide": "under-the-rug"})
    assert L["profile"] == "single_small" and L["capture_hide"] == "behind" and "unknown" in L["reason"]
    L = sw.select_video_layout([_disp(1366, 768)], {"capture_hide": "minimized", "replay_hide": "offscreen"})
    assert (L["capture_hide"], L["replay_hide"]) == ("minimized", "offscreen")
    assert sw.select_video_layout([_disp(1366, 768)], {"profile": "grid"})["profile"] == "grid"
    assert sw.select_video_layout([], None)["profile"] == "single_large"   # no displays: 1920x1080 fallback
    assert sw.select_video_layout([_disp(1366, 768)], {"large_min_width": 1200})["profile"] == "single_large"


def test_layout_summary_handles_stored_copy():
    L = sw.select_video_layout([_disp(1366, 768)])
    text = sw.layout_summary(L)
    assert text.startswith("single_small") and "replay 1366x614" in text and "Capture hidden: behind" in text
    trimmed = {k: L[k] for k in ("profile", "reason", "replay_rect", "capture_hide")}
    assert sw.layout_summary(json.loads(json.dumps(trimmed))).startswith("single_small")
    assert sw.layout_summary(None) == "unknown"


def test_windows_to_launch_skips_reference_unless_grid():
    assert sw.kinovea_windows_to_launch({}) == ("Capture", "LiveReplay")
    assert sw.kinovea_windows_to_launch({"video": {"layout": {"profile": "grid"}}}) == sw.KINOVEA_WINDOW_NAMES


# ---------------------------------------------------------------- replay timing

def test_delay_per_club_category():
    rc = sw.replay_cfg({})
    assert sw.replay_delay_for_club(rc, "DR") == 9
    assert sw.replay_delay_for_club(rc, "7I") == 8
    assert sw.replay_delay_for_club(rc, "PW") == 6
    assert sw.replay_delay_for_club(rc, "PT") is None
    assert sw.replay_delay_for_club(rc, None) == 8
    rc = sw.replay_cfg({"video": {"replay": {"delay_sec": 5, "delay_by_club": {"Driver": 11}}}})
    assert sw.replay_delay_for_club(rc, "DR") == 11 and sw.replay_delay_for_club(rc, "7I") == 5
    assert sw.replay_delay_for_club(rc, "PT") == 5   # an explicit table replaces the defaults


def test_shot_wait_show_hide():
    s = sw.ReplayScheduler({"show_sec": 10})
    assert s.on_shot(100.0, "7I") is None and s.state == s.WAITING
    assert s.tick(107.9) is None                       # still on GSPro: ball in the air / result panel
    s.on_clip_ready(104.0)
    assert s.tick(108.0) == "show" and s.state == s.SHOWING
    assert s.tick(117.9) is None
    assert s.tick(118.0) == "hide" and s.state == s.IDLE


def test_show_waits_for_clip_up_to_clip_wait():
    s = sw.ReplayScheduler({"clip_wait_sec": 4})
    s.on_shot(0.0, "DR")
    assert s.tick(9.0) is None and s.tick(12.9) is None   # no clip yet
    assert s.tick(13.0) == "show"                          # gave up waiting
    s = sw.ReplayScheduler({"clip_wait_sec": 4})
    s.on_shot(0.0, "DR")
    s.on_clip_ready(10.0)
    assert s.tick(10.0) == "show"


def test_new_shot_hides_and_reschedules():
    s = sw.ReplayScheduler()
    s.on_shot(0.0, "PW")
    s.on_clip_ready(3.0)
    assert s.tick(6.0) == "show"
    assert s.on_shot(8.0, "PW") == "hide" and s.state == s.WAITING
    assert s.show_at == 14.0
    assert s.on_shot(9.0, "PT") is None and s.state == s.IDLE   # putt: no replay at all


def test_input_dismisses_after_grace_but_hotkeys_do_not():
    s = sw.ReplayScheduler({"input_grace_sec": 1.5, "dismiss_on_input": True})
    assert s.show_now(10.0) == "show"
    assert s.tick(10.5, last_input=10.2) is None        # the key press that opened it
    assert s.tick(12.0, last_input=11.0) is None        # within grace
    s.note_hotkey(12.0)
    assert s.tick(12.5, last_input=12.4) is None        # a SimWatch hotkey, not "addressing the ball"
    assert s.tick(14.0, last_input=13.8) == "hide"      # real input -> back to GSPro
    s = sw.ReplayScheduler({"dismiss_on_input": False})
    s.show_now(0.0)
    assert s.tick(5.0, last_input=4.0) is None


def test_pin_hold_release_dismiss():
    s = sw.ReplayScheduler({"show_sec": 10})
    assert s.toggle_pin(0.0) == "show" and s.pinned
    assert s.tick(100.0, last_input=99.0) is None        # pinned: no timeout, no input dismiss
    assert s.toggle_pin(100.0) == "hide" and s.state == s.IDLE and not s.pinned
    s.show_now(0.0)
    assert s.toggle_pin(1.0) is None and s.pinned       # pin an open replay
    assert s.dismiss(2.0) == "hide"
    assert s.hold(5.0) == "show" and s.pinned           # compare mode holds it open
    s.release(6.0)
    assert not s.pinned and s.hide_at == 16.0
    s.on_shot(20.0, "7I")
    assert s.dismiss(21.0) is None and s.state == s.IDLE   # cancels a pending replay


def test_auto_off_still_allows_manual_show():
    s = sw.ReplayScheduler({"mode": "off"})
    assert s.on_shot(0.0, "7I") is None and s.state == s.IDLE
    assert s.show_now(1.0) == "show"
    s = sw.ReplayScheduler()
    s.on_shot(0.0, "7I")
    assert s.toggle_mode(1.0) == "off" and s.state == s.IDLE
    assert s.toggle_mode(2.0) == "auto"
    assert "auto (on)" in s.status_text(3.0)


def test_always_on_replay_screen():
    s = sw.ReplayScheduler(always_on=True)
    assert s.show_now(0.0) == "show" and s.hide_at == 0.0
    assert s.on_shot(5.0, "DR") is None and s.state == s.SHOWING   # never hides on the dedicated screen
    assert s.tick(1000.0, last_input=999.0) is None
    assert s.dismiss(1000.0) == "hide"
    s.on_shot(1001.0, "DR")
    s.on_clip_ready(1004.0)
    assert s.tick(1004.0) == "show"                                 # comes back with the next swing


def test_club_change_cancel_is_opt_in():
    s = sw.ReplayScheduler()
    s.on_shot(0.0, "DR")
    assert s.on_club_change(3.0) is None and s.state == s.WAITING   # GSPro auto-selects the next club
    s = sw.ReplayScheduler({"cancel_on_club_change": True})
    s.on_shot(0.0, "DR")
    s.on_club_change(3.0)
    assert s.state == s.IDLE
    s.show_now(10.0)
    assert s.on_club_change(11.0) == "hide"


# ---------------------------------------------------------------- compare

def test_compare_cycle_order():
    states = ["off"]
    for _ in range(4):
        states.append(sw.next_compare_state(states[-1]))
    assert states == ["off", "DTL", "FO", "off", "DTL"]
    assert sw.next_compare_state("bogus") == "DTL"


def _swings(tmp_path):
    cfg = {"video": {"swings_dir": str(tmp_path / "Swings"), "pros": ["Rory_McIlroy"]}}
    layout = sw.ensure_swings_layout(cfg)
    return cfg, layout


def _clip(p: Path, mtime=None):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(b"\x00" * 16)
    if mtime:
        import os
        os.utime(p, (mtime, mtime))
    return p


def test_pick_compare_clips_goto_pro_and_last_swing(tmp_path):
    cfg, layout = _swings(tmp_path)
    s1 = _clip(layout["today"] / "001_7I_160y_DTL.mp4", 1000)
    s2 = _clip(layout["today"] / "002_7I_165y_DTL.mp4", 2000)
    _clip(layout["today_dtl"] / "DTL_raw.mp4", 3000)                 # replay-folder copy: not a library clip
    assert sw.library_swing_clips(layout["today"], "DTL") == [s2, s1]

    you, ref, why = sw.pick_compare_clips(cfg, "DTL", "My-Go-To", "7I")
    assert you == s2 and ref is None and "My-Go-To" in why and "Iron" in why   # never you-vs-you fallback
    goto = _clip(layout["goto"] / "Iron" / "GoTo_7I_DTL.mp4")
    you, ref, why = sw.pick_compare_clips(cfg, "DTL", "My-Go-To", "7I")
    assert (you, ref, why) == (s2, goto, "")

    pro = _clip(layout["pros"] / "Rory_McIlroy" / "Driver_FO.mp4")
    _clip(layout["today"] / "002_DR_280y_FO.mp4")
    you, ref, _ = sw.pick_compare_clips(cfg, "FO", "Rory_McIlroy", "DR")
    assert ref == pro and you.name == "002_DR_280y_FO.mp4"

    you, ref, why = sw.pick_compare_clips(cfg, "DTL", "Last-Swing", "7I", you_clip=s2)
    assert (you, ref) == (s2, s1)                                     # your previous swing

    cfg2, layout2 = _swings(tmp_path / "empty")
    assert sw.pick_compare_clips(cfg2, "DTL", "My-Go-To", "7I")[2].startswith("no DTL swing")


def test_compare_screens_and_2025_window(tmp_path, monkeypatch):
    you, ref = tmp_path / "you_DTL.mp4", tmp_path / "ref_DTL.mp4"
    screens = sw.build_compare_screens(you, ref, 50)
    assert [s["full_path"] for s in screens] == [str(you), str(ref)] and not any(s["is_watcher"] for s in screens)

    cfg, _ = _swings(tmp_path)
    kdir = tmp_path / "Kinovea"
    launched, closed = [], []
    monkeypatch.setattr(sw, "resolve_kinovea_backend", lambda cfg: "2025")
    monkeypatch.setattr(sw, "kinovea_settings_dir", lambda create=False: kdir)
    monkeypatch.setattr(sw, "find_kinovea_instance_pid", lambda name: 4242 if launched else None)
    monkeypatch.setattr(sw, "_close_kinovea_instance", lambda name: closed.append(name))
    monkeypatch.setattr(sw, "launch_kinovea_instance", lambda cfg, name, ws: launched.append((name, ws)) or 4242)
    assert sw.launch_compare_window(cfg, screens) == 4242
    xml = (kdir / "Windows" / f"{sw.kinovea_guid('window/Compare')}.xml").read_bytes()
    import xml.etree.ElementTree as ET
    root = ET.fromstring(xml)
    assert root.findtext("Name") == "Compare"
    assert [e.findtext("FullPath") for e in root.iter("ScreenDescriptorPlayback")] == [str(you), str(ref)]
    assert launched == [("Compare", None)]
    assert sw.launch_compare_window(cfg, screens) == 4242 and len(launched) == 1 and not closed  # same pair
    sw.launch_compare_window(cfg, sw.build_compare_screens(you, tmp_path / "other_DTL.mp4", 50))
    assert closed == ["Compare"] and len(launched) == 2                                     # new pair: relaunch


# ---------------------------------------------------------------- layout controller (fake window ops)

class FakeOps:
    def __init__(self, displays, gidx=0, windows=("Capture", "LiveReplay", "Compare")):
        self._displays, self._gidx = displays, gidx
        self.hwnds = {n: i + 1 for i, n in enumerate(windows)}
        self.calls = []
        self.focus = 0

    def displays(self):
        return list(self._displays)

    def gspro_index(self, displays):
        return self._gidx

    def find(self, name, wait_sec=0.0):
        return self.hwnds.get(name)

    def alive(self, hwnd):
        return hwnd in self.hwnds.values()

    def name(self, hwnd):
        return {v: k for k, v in self.hwnds.items()}[hwnd]

    def show(self, hwnd, rect, topmost=True):
        self.calls.append(("show", self.name(hwnd), tuple(rect), topmost))

    def park(self, hwnd, method, layout):
        self.calls.append(("park", self.name(hwnd), method))

    def restore_gspro_focus(self):
        self.focus += 1
        return True

    def last_input_time(self):
        return None


def test_controller_positions_windows(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    ops = FakeOps([_disp(1366, 768)])
    ctl = sw.VideoLayoutController({}, ops)
    assert ctl.refresh(0.0) and ctl.layout["profile"] == "single_small"
    assert not ctl.refresh(1.0) and not ctl.refresh(10.0)      # unchanged displays
    ctl.apply(replay_visible=False)
    assert ops.calls == [("park", "Capture", "behind"), ("park", "Compare", "minimized"),
                         ("park", "LiveReplay", "behind")]
    ops.calls.clear()
    ctl.apply(replay_visible=True)
    assert ops.calls[-1] == ("show", "LiveReplay", (0, 0, 1366, 614), True)
    ops.calls.clear()
    ctl.apply(replay_visible=True, compare_visible=True)
    assert ("show", "Compare", (0, 0, 1366, 614), True) in ops.calls and ("park", "LiveReplay", "behind") in ops.calls
    state = json.loads((tmp_path / "video_state.json").read_text())
    assert state["layout"]["profile"] == "single_small"

    ops._displays = [_disp(1366, 768), _disp(1920, 1080, left=1366, primary=False)]  # projector switched on
    ops._gidx = 1
    assert ctl.refresh(20.0) and ctl.layout["profile"] == "dual"
    ops.calls.clear()
    ctl.apply(replay_visible=True)
    assert ops.calls[-1] == ("show", "LiveReplay", (0, 0, 1366, 768), False)


def test_controller_grid_uses_old_tiling(tmp_path, monkeypatch):
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    tiled = []
    monkeypatch.setattr(sw, "tile_video_windows", lambda cfg, wait_sec=0.0: tiled.append(wait_sec))
    ops = FakeOps([_disp(1366, 768)])
    ctl = sw.VideoLayoutController({"video": {"layout": {"profile": "grid"}}}, ops)
    ctl.apply(True, wait_sec=2.0)
    assert tiled == [2.0] and ops.calls == [] and ctl.is_grid()


def _replay_manager(tmp_path, monkeypatch, displays=None):
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    cfg = {"video": {"swings_dir": str(tmp_path / "Swings")}}
    m = object.__new__(sw.SwingSessionManager)
    m.cfg, m.vcfg, m.hub, m.current_club, m.active_reference = cfg, cfg["video"], None, None, "My-Go-To"
    m.last_saved_dtl = m.last_saved_fo = None
    m._lock, m._state_lock, m._win_lock = threading.RLock(), threading.Lock(), threading.RLock()
    m._compare_lock = threading.Lock()
    m.ops = FakeOps(displays or [_disp(1366, 768)])
    m.layout_ctl = sw.VideoLayoutController(cfg, m.ops)
    m.layout_ctl.refresh(0.0, force=True)
    m.replay = sw.ReplayScheduler(sw.replay_cfg(cfg))
    m.replay_visible, m.compare_state = False, "off"
    return m


def test_manager_shot_to_replay_and_back_to_gspro(tmp_path, monkeypatch):
    m = _replay_manager(tmp_path, monkeypatch)
    t = [1000.0]
    monkeypatch.setattr(sw.time, "time", lambda: t[0])
    m._schedule_replay("7I")
    assert m.replay.state == m.replay.WAITING and not m.replay_visible
    m._note_clip_ready()
    t[0] = 1008.0
    m._tick_replay()
    assert m.replay_visible and m.ops.calls[-1][:2] == ("show", "LiveReplay")
    t[0] = 1018.0
    m._tick_replay()
    assert not m.replay_visible and m.ops.calls[-1] == ("park", "LiveReplay", "behind")
    assert m.ops.focus >= 2                                    # GSPro focus restored after show and hide
    state = json.loads((tmp_path / "video_state.json").read_text())
    assert state["replay"]["state"] == "idle"


def test_manager_compare_cycle(tmp_path, monkeypatch):
    m = _replay_manager(tmp_path, monkeypatch)
    layout = sw.ensure_swings_layout(m.cfg)
    _clip(layout["today"] / "001_7I_DTL.mp4")
    _clip(layout["today"] / "001_7I_FO.mp4")
    _clip(layout["goto"] / "Iron" / "GoTo_7I_DTL.mp4")
    _clip(layout["goto"] / "Iron" / "GoTo_7I_FO.mp4")
    m.current_club = "7I"
    loaded = []
    monkeypatch.setattr(sw, "launch_compare_window", lambda cfg, screens: loaded.append(
        [Path(s["full_path"]).name for s in screens]) or 99)
    assert m._start_compare("DTL") and m.compare_state == "DTL" and m.replay.pinned
    assert loaded[-1] == ["001_7I_DTL.mp4", "GoTo_7I_DTL.mp4"]
    assert m.ops.calls[-1][:2] == ("show", "Compare") or ("show", "Compare", (0, 0, 1366, 614), True) in m.ops.calls
    assert m._start_compare("FO") and loaded[-1] == ["001_7I_FO.mp4", "GoTo_7I_FO.mp4"]
    m._exit_compare()
    assert m.compare_state == "off" and not m.replay.pinned and m.replay_visible
    assert m.ops.calls[-1] == ("show", "LiveReplay", (0, 0, 1366, 614), True)
    m.active_reference = "Rory_McIlroy"                       # no pro clips: stays in normal replay
    assert not m._start_compare("DTL") and m.compare_state == "off"


# ---------------------------------------------------------------- shortcut map

def test_effective_hotkeys_defaults_overrides_aliases():
    hk = sw.effective_hotkeys({})
    assert hk["replay_now"] == ["Alt+V"] and hk["cheatsheet"] == ["Alt+H"] and set(hk) == set(sw.HOTKEY_ACTION_NAMES)
    cfg = {"video": {"hotkeys": {"cheatsheet": ["Alt+H", "Alt+/"], "open_drills": "", "bookmark_goto": "Alt+B"}}}
    hk = sw.effective_hotkeys(sw.hotkeys_cfg_of(cfg))
    assert hk["cheatsheet"] == ["Alt+H", "Alt+/"] and hk["open_drills"] == [] and hk["bookmark_goto"] == ["Alt+B"]
    assert sw.effective_hotkeys(hk) == hk                                  # idempotent (HotkeyOverlayManager)
    rows = sw.hotkey_rows(sw.hotkeys_cfg_of(cfg))
    assert {"action": "cheatsheet", "keys": "Alt+H / Alt+/", "label": sw._HOTKEY_LABEL_OF["cheatsheet"],
            "state": "unknown"} in rows and all(r["action"] != "open_drills" for r in rows)
    groups = sw.hotkey_groups({"video": {"hotkeys": {"open_drills": None}}})
    assert [g["group"] for g in groups] == list(sw.HOTKEY_GROUPS)
    assert all(r["action"] != "open_drills" for g in groups for r in g["keys"])


def test_every_hotkey_action_has_a_callback(tmp_path, monkeypatch):
    names = {d[0] for d in sw.HOTKEY_ACTIONS}
    assert len(names) == len(sw.HOTKEY_ACTIONS) and {d[2] for d in sw.HOTKEY_ACTIONS} == set(sw.HOTKEY_GROUPS)
    src = (ROOT / "simwatch.py").read_text(encoding="utf-8")
    block = src[src.index("self.hotkeys = HotkeyOverlayManager("):src.index("self.get_hud_status,")]
    for action in names:
        assert f'"{action}":' in block, action


def test_parse_hotkey_oem_and_invalid():
    assert sw.parse_hotkey("Alt+/") == (0x4001, 0xBF)
    assert sw.parse_hotkey("Ctrl+Alt+F8") == (0x4003, 0x77)
    assert sw.parse_hotkey("Hyper+K") is None and sw.parse_hotkey("") is None and sw.parse_hotkey(None) is None


def test_hotkey_conflicts():
    assert sw.hotkey_conflicts({}) == []
    assert sw.hotkey_conflicts(json.loads((ROOT / "config.json").read_text())) == []
    msgs = [m for _s, m in sw.hotkey_conflicts({"video": {"hotkeys": {
        "replay_now": "Alt+H", "replay_pin": "K", "replay_dismiss": "Alt+Enter", "replay_auto": "Ctrl+M",
        "compare_cycle": "Alt+Banana", "nonsense": "Alt+Q", "_note": "ignored"}}})]
    joined = "\n".join(msgs)
    assert "assigned to both" in joined and "no modifier" in joined and "fullscreen toggle" in joined
    assert "Ctrl/Shift without Alt" in joined and "not a valid key" in joined and "unknown action" in joined
    assert "_note" not in joined


def test_register_hotkeys_reports_failures_with_fallback_and_suggestion():
    taken = {(0x4001, ord("G")), (0x4001, ord("B"))}            # another app owns Alt+G and Alt+B

    def register(hk_id, mods, vk):
        return (mods, vk) not in taken

    def probe(spec):
        return sw.parse_hotkey(spec) not in taken

    hk = sw.effective_hotkeys({})
    registered, reg = sw.register_hotkeys(hk, sw.HOTKEY_ACTION_NAMES, register, probe)
    (f,) = reg["failed"]
    assert f["action"] == "bookmark_goto" and f["spec"] == "Alt+G"
    assert f["fallback"] == "Ctrl+Alt+G" and f["suggest"] == "Alt+J"   # Alt+B is taken too
    assert ("bookmark_goto", "Ctrl+Alt+G") in [(a, s) for _i, a, s in registered]
    assert len({i for i, _a, _s in registered}) == len(registered)    # unique ids
    msg = sw.hotkey_failure_message(f)
    assert msg.startswith("Could not register hotkey Alt+G (bookmark_goto)") and "Ctrl+Alt+G" in msg and "Alt+J" in msg
    assert sw.suggest_free_hotkey(hk) == "Alt+B"                      # first free pool key without probing
    states = sw.hotkey_states(reg, hk)
    assert states["bookmark_goto"] == "ctrl_alt_only" and states["cheatsheet"] == "ok"
    row = next(r for r in sw.hotkey_rows(hk, reg) if r["action"] == "bookmark_goto")
    assert row["state"] == "ctrl_alt_only"                            # same report drives the ShotLab Keys pill


def test_hotkey_states_from_failed_reports():
    hk = sw.effective_hotkeys({})
    reg = {"ok": [], "failed": [{"action": "toggle_pip", "spec": "Alt+P", "fallback": None},
                                {"spec": "Alt+G"},                          # older report: action from the spec
                                {"action": "open_drills", "spec": "Alt+?", "error": "invalid key"}]}
    assert sw.hotkey_states(reg, hk) == {"toggle_pip": "failed", "bookmark_goto": "failed", "open_drills": "invalid"}
    assert sw.hotkey_states({"cheatsheet": "ok"}) == {"cheatsheet": "ok"}   # flat states pass through


def test_render_text_markdown_and_api_doc(real_cfg):
    text = sw.render_hotkeys_text(real_cfg, {"failed": [{"spec": "Alt+G"}]})
    for g in sw.HOTKEY_GROUPS:
        assert f"\n{g}\n" in text
    assert "Alt+V" in text and "NOT REGISTERED: Alt+G" in text
    md = sw.render_hotkeys_markdown(real_cfg)
    assert "## Compare" in md and "\\|" in md and "`Alt+<key>`" in md
    doc = sw.hotkeys_doc(real_cfg, {"ok": [], "failed": []})
    assert json.loads(json.dumps(doc))["groups"][0]["group"] == "Replay" and "registration" in doc


def test_docs_shortcuts_md_is_up_to_date(real_cfg):
    """docs/SHORTCUTS.md is generated: regenerate with `python simwatch.py keys md` after changing a hotkey."""
    assert (ROOT / "docs" / "SHORTCUTS.md").read_text(encoding="utf-8") == sw.render_hotkeys_markdown(real_cfg)


def test_cmd_keys(tmp_path, capsys, monkeypatch, real_cfg):
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    monkeypatch.setattr(sw, "STATUS_PATH", tmp_path / "simwatch_status.json")
    assert sw.cmd_keys(real_cfg) == 0
    out = capsys.readouterr().out
    assert "Compare" in out and "Alt+M" in out and "ShotLab" in out and "isn't running" in out
    out = tmp_path / "docs" / "SHORTCUTS.md"
    assert sw.cmd_keys(real_cfg, "md", doc_path=out) == 0 and out.read_text().startswith("# SimWatch shortcuts")
    assert sw.cmd_keys(real_cfg, "bogus") == 2


def test_bridge_serves_shortcuts(tmp_path):
    hub = sw.ShotHub(sw.ShotStore(tmp_path / "Sessions"))
    hub.cfg = {"video": {"hotkeys": {"replay_now": "Alt+J"}}}
    hub.hotkey_registration = {"ok": [], "failed": [{"action": "bookmark_goto", "spec": "Alt+G"}]}
    srv = sw.BridgeServer(hub, port=0, static_dir=tmp_path)
    assert srv.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", srv.port, timeout=5)
        conn.request("GET", "/api/shortcuts")
        resp = conn.getresponse()
        doc = json.loads(resp.read())
        conn.close()
    finally:
        srv.stop()
    assert resp.status == 200
    replay = doc["groups"][0]
    assert replay["group"] == "Replay" and replay["keys"][0]["keys"] == ["Alt+J"]
    assert doc["registration"]["failed"][0]["spec"] == "Alt+G"


# ---------------------------------------------------------------- doctor / status

def test_replay_vs_gspro_window_mode():
    base = {"video": {"enabled": True}, "gspro_display": {"windowed": True}}
    assert sw.evaluate_replay_gspro_mode(base, True)[0] == sw.PASS
    fs = {"video": {"enabled": True}, "gspro_display": {"windowed": False, "windowed_when_projector_off": True}}
    st, _item, detail = sw.evaluate_replay_gspro_mode(fs, False)
    assert st == sw.WARN and "projector off" in detail
    assert sw.evaluate_replay_gspro_mode(fs, True)[0] == sw.WARN
    off = dict(fs, video={"enabled": True, "replay": {"mode": "off"}})
    assert sw.evaluate_replay_gspro_mode(off, True)[0] == sw.INFO
    grid = dict(fs, video={"enabled": True, "layout": {"profile": "grid"}})
    assert sw.evaluate_replay_gspro_mode(grid, True)[0] == sw.INFO
    assert sw.gspro_effective_windowed(fs, False) and not sw.gspro_effective_windowed(fs, True)


def test_doctor_video_rows_off_windows(monkeypatch, tmp_path, real_cfg):
    monkeypatch.setattr(sw, "VIDEO_STATE_PATH", tmp_path / "video_state.json")
    monkeypatch.setattr(sw, "IS_WINDOWS", False)
    rows = sw.doctor_video_rows(real_cfg)
    items = {r[1]: r for r in rows}
    assert {"video layout", "replay", "replay vs GSPro window mode", "hotkeys (config)",
            "hotkey registration"} <= set(items)
    assert not [r for r in rows if r[0] == sw.FAIL]
    # a running rig's registration results are reported (with the suggested free key)
    sw.write_video_state(hotkeys={"ok": [{"action": "cheatsheet", "spec": "Alt+H"}], "failed": [
        {"action": "bookmark_goto", "spec": "Alt+G", "fallback": "Ctrl+Alt+G", "suggest": "Alt+B"}]},
        layout={"profile": "single_small", "reason": "1 display(s) (1366x768)", "replay_rect": [0, 0, 1366, 614],
                "capture_hide": "behind"})
    rows = sw.doctor_video_rows(real_cfg)
    reg = [r for r in rows if r[1] == "hotkey registration"]
    assert reg[0][0] == sw.WARN and "Alt+B" in reg[0][2]
    assert [r for r in rows if r[1] == "video layout"][0][2].startswith("single_small")


def test_video_state_merges_and_resets_on_new_pid(tmp_path):
    p = tmp_path / "vs.json"
    sw.write_video_state(p, layout={"profile": "dual"})
    sw.write_video_state(p, replay={"mode": "auto"})
    st = sw.read_video_state(p)
    assert st["layout"]["profile"] == "dual" and st["replay"]["mode"] == "auto" and sw.video_state_live(st)
    p.write_text(json.dumps({"pid": 999999999, "layout": {"profile": "x"}}))
    assert not sw.video_state_live(sw.read_video_state(p))
    sw.write_video_state(p, replay={"mode": "off"})
    assert "layout" not in sw.read_video_state(p)


def test_validate_config_flags_bad_layout_and_replay(real_cfg):
    assert not [m for _s, m in sw.validate_config(real_cfg, check_paths=False) if "video." in m]
    real_cfg["video"]["layout"]["profile"] = "triple"
    real_cfg["video"]["layout"]["capture_hide"] = "closet"
    real_cfg["video"]["replay"]["mode"] = "sometimes"
    real_cfg["video"]["replay"]["delay_sec"] = "soon"
    real_cfg["video"]["replay"]["delay_by_club"] = {"Driver": "late"}
    msgs = "\n".join(m for _s, m in sw.validate_config(real_cfg, check_paths=False))
    for frag in ("video.layout.profile", "video.layout.capture_hide", "video.replay.mode",
                 "video.replay.delay_sec", "delay_by_club"):
        assert frag in msgs


def test_input_does_not_dismiss_by_default():
    s = sw.ReplayScheduler({"input_grace_sec": 1.5})  # default: a bumped mouse must not close the replay
    assert s.show_now(10.0) == "show"
    assert s.tick(13.0, last_input=12.5) is None


# ---------------------------------------------------------------- club-change reference reloads

def _swap_manager(tmp_path, monkeypatch, profile, debounce=0.0):
    from test_kinovea import _bare_manager, _cfg
    cfg = _cfg(tmp_path)
    cfg["video"]["layout"] = {"profile": profile}
    m, _ = _bare_manager(cfg)
    m._ref_swap_sync = False
    m._ref_swap_debounce = debounce
    m._ref_swap_stop = threading.Event()
    m._stopped = False
    m.active_reference = "My-Go-To"
    reloads = []
    monkeypatch.setattr(sw, "setup_video_rig", lambda cfg, club=None, **k: reloads.append(club))
    monkeypatch.setattr(sw, "tile_video_windows", lambda *a, **k: None)
    return m, reloads


def _join_worker(m):
    t = m._ref_swap_thread
    if t is not None:
        t.join(5)
    assert m._ref_swap_thread is None


def test_club_reload_is_debounced_to_the_club_you_land_on(tmp_path, monkeypatch):
    m, reloads = _swap_manager(tmp_path, monkeypatch, "grid", debounce=0.3)
    for club in ("PW", "56", "3W", "DR"):          # scrolling through GSPro's clubs with I/K
        m._on_club_change(club)
    _join_worker(m)
    assert reloads == ["DR"] and m._swing_cat == "Driver"


def test_club_reload_never_runs_after_stop(tmp_path, monkeypatch):
    m, reloads = _swap_manager(tmp_path, monkeypatch, "grid", debounce=5.0)
    m._started = True
    m.oc_monitor = type("OC", (), {"stop": lambda self: None})()
    m.hotkeys = type("HK", (), {"stop": lambda self: None})()
    monkeypatch.setattr(sw, "write_video_state", lambda **k: None)
    m._on_club_change("DR")                        # worker is waiting out the debounce...
    m.stop()                                       # ...stop() wakes it and drops the pending reload
    _join_worker(m)
    assert reloads == []
    m._pending_ref_club = "7I"                     # a late club event after stop() is ignored too
    assert m._apply_pending_ref_swap() is False and reloads == []


def test_adaptive_layout_never_reloads_a_reference_window(tmp_path, monkeypatch):
    """Only the grid profile launches a Kinovea Reference window, so only it reloads one on a club change;
    the adaptive layouts just remember the category (Compare resolves the clips when asked)."""
    m, reloads = _swap_manager(tmp_path, monkeypatch, "single_small")
    m._on_club_change("DR")
    _join_worker(m)
    assert reloads == [] and m._swing_cat == "Driver" and m._ref_club() == "DR"
    m._on_club_change("PT")
    assert m._ref_club() == "Driver"               # putter still resolves the last full-swing category
