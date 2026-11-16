"""
SimWatch - keeps a Bushnell Launch Pro -> GameChanger -> GSPconnect -> GSPro chain alive,
and orchestrates Kinovea (2x2 TV grid) + OBS Studio (Projector PiP) + Swing Library & Hotkeys.

Commands:
  python simwatch.py discover              list golf-related processes, their ports, and open windows
  python simwatch.py dump "<title regex>"  print a window's controls (find button names for auto-clicking)
  python simwatch.py calibrate             hover over a status light, press Enter -> config snippet
  python simwatch.py check                 run every health check once and print results
  python simwatch.py recover [level]       run one recovery level now (default 0)
  python simwatch.py watch                 run forever: check, escalate recovery, and drive video rig
  python simwatch.py startup               after a reboot: launch everything in order, then watch
  python simwatch.py stop                  stop any running background SimWatch daemon instances
  python simwatch.py displays              show detected displays and what GSPro would be told to use
  python simwatch.py reconnect             manual/diagnostic: connect FSX Pro's own view to the Launch Pro
  python simwatch.py release-device        disconnect FSX Pro from the Launch Pro so GameChanger can reconnect
  python simwatch.py video                 launch/tile 2x2 Kinovea TV grid + OBS PiP + hotkeys (no GSPro needed)
  python simwatch.py bookmark [club]       save latest DTL & FO swing clips to Swings/My-Go-To/
  python simwatch.py reference [name]      switch bottom Kinovea reference (My-Go-To or Pro name)
  python simwatch.py obs-setup             create Swings/ layout, Kinovea workspaces & OBS scene collection JSON
  python simwatch.py hotkeys               print hotkey cheat sheet and pop up the on-screen HUD
  python simwatch.py lines [on|off|apply]  apply or toggle Kinovea DTL/FO swing plane lines (.kva)
  python simwatch.py save-lines [club]     save manually dragged Kinovea lines as your default template
  python simwatch.py drills                open the local Golf Drills, Routines & Daily Delivery Hub

Run from an ADMIN terminal if any sim app runs as admin (Windows blocks clicks & raw sockets otherwise).
"""
import argparse
import ctypes
import ctypes.wintypes
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
import queue
import re
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import uuid
import winsound
import xml.etree.ElementTree as ET
from pathlib import Path

import psutil

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # real pixel coords on scaled displays
except Exception:
    pass

HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("simwatch")
GSPRO_PORT = 921
VIDEO_EXTS = (".mp4", ".mkv", ".avi", ".mov")
_SINGLETON_MUTEX = None


# --------------------------------------------------------------------------- config & singleton

def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    cfg["apps_by_key"] = {a["key"]: a for a in cfg["apps"]}
    return cfg


def stop_other_simwatch_instances() -> int:
    """Terminate any other background `simwatch.py` daemon (`watch`/`startup`/`video`) processes."""
    my_pid = os.getpid()
    daemon_cmds = {"watch", "startup", "video"}
    victims = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if p.info["pid"] == my_pid:
                continue
            name = (p.info["name"] or "").lower()
            if not name.startswith("python"):
                continue
            cmd = [str(a).lower() for a in (p.info["cmdline"] or [])]
            if any("simwatch.py" in a for a in cmd) and any(a in daemon_cmds for a in cmd):
                victims.append(p)
        except psutil.Error:
            pass
    if not victims:
        return 0
    for p in victims:
        try:
            LOG.info("  stopping prior SimWatch process (pid %d)", p.pid)
            p.terminate()
        except psutil.Error:
            pass
    _, alive = psutil.wait_procs(victims, timeout=5)
    for p in alive:
        try:
            p.kill()
        except psutil.Error:
            pass
    return len(victims)


def acquire_singleton_lock() -> bool:
    """Ensure only one SimWatch watch/startup/video daemon runs at a time."""
    global _SINGLETON_MUTEX
    if _SINGLETON_MUTEX is not None:
        return True
    stopped = stop_other_simwatch_instances()
    if stopped:
        time.sleep(0.5)
    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.wintypes.BOOL, ctypes.wintypes.LPCWSTR]
        kernel32.CreateMutexW.restype = ctypes.wintypes.HANDLE
        kernel32.CloseHandle.argtypes = [ctypes.wintypes.HANDLE]
        kernel32.CloseHandle.restype = ctypes.wintypes.BOOL
        mutex = kernel32.CreateMutexW(None, False, "Local\\SimWatchSingleton")
        err = ctypes.get_last_error()
        if not mutex:
            return err != 183
        if err == 183:  # ERROR_ALREADY_EXISTS
            kernel32.CloseHandle(mutex)
            return False
        _SINGLETON_MUTEX = mutex
    except Exception:
        pass
    return True


# --------------------------------------------------------------------------- processes

def find_procs(process_name: str):
    target = process_name.lower()
    out = []
    for p in psutil.process_iter(["name", "exe"]):
        try:
            if (p.info["name"] or "").lower() == target:
                out.append(p)
        except psutil.Error:
            pass
    return out


def kill_app(app: dict, timeout: float = 8) -> None:
    procs = find_procs(app["process"])
    if not procs:
        return
    LOG.info("  stopping %s", app["key"])
    for p in procs:
        try:
            p.terminate()
        except psutil.Error:
            pass
    _, alive = psutil.wait_procs(procs, timeout=timeout)
    for p in alive:
        try:
            p.kill()
        except psutil.Error:
            pass


def start_app(app: dict) -> bool:
    exe = Path(app["exe"])
    if not exe.exists():
        LOG.error("  %s: exe not found at %s", app["key"], exe)
        return False
    LOG.info("  starting %s", app["key"])
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    startupinfo = None
    if app.get("start_no_activate") or app.get("key") in ("integrator", "gspro_connect", "fs_connector"):
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 4  # SW_SHOWNOACTIVATE
    try:
        subprocess.Popen([str(exe), *app.get("args", [])], cwd=str(exe.parent), creationflags=flags, startupinfo=startupinfo)
        return True
    except OSError as e:
        LOG.error("  %s: failed to start: %s", app["key"], e)
        return False


# --------------------------------------------------------------------------- windows / UI

class WindowSpec:
    """Finds a visible top-level window by title regex using plain Win32 calls.

    Not pywinauto's Desktop lookup, because (1) a UIA desktop scan hangs forever while a Unity app
    (FSX Pro) is running, and (2) its win32 backend reads WinForms titles (GSPconnect) as ''.
    """

    def __init__(self, title_re: str):
        self.rx = re.compile(title_re)

    def _find(self):
        import win32gui
        found = []

        def cb(h, _):
            try:
                if win32gui.IsWindowVisible(h):
                    t = win32gui.GetWindowText(h)
                    if t and self.rx.match(t):
                        found.append(h)
            except Exception:
                pass
            try:
                ctypes.windll.kernel32.SetLastError(0)
            except Exception:
                pass
            return True

        try:
            ctypes.windll.kernel32.SetLastError(0)
            win32gui.EnumWindows(cb, None)
        except Exception:
            pass
        return found[0] if found else None

    def exists(self, timeout: float = 0) -> bool:
        end = time.time() + timeout
        while True:
            if self._find():
                return True
            if time.time() >= end:
                return False
            time.sleep(0.25)

    def wrapper_object(self):
        from pywinauto.controls.hwndwrapper import HwndWrapper
        hwnd = self._find()
        if not hwnd:
            raise RuntimeError(f"window /{self.rx.pattern}/ not found")
        return HwndWrapper(hwnd)


def window_spec(title_re: str):
    return WindowSpec(title_re)


def uia_window(spec):
    """UIA view of one window, attached by handle (never scans the desktop)."""
    from pywinauto import Desktop
    return Desktop(backend="uia").window(handle=spec.wrapper_object().handle)


def wait_window(title_re: str, timeout: float):
    spec = window_spec(title_re)
    return spec if spec.exists(timeout=timeout) else None


def click_button(title_re_win: str, button_re: str) -> bool:
    try:
        spec = wait_window(title_re_win, 10)
        if not spec:
            LOG.warning("  window /%s/ not found for button click", title_re_win)
            return False
        btn = uia_window(spec).child_window(title_re=button_re, control_type="Button", found_index=0)
        if not btn.exists(timeout=5):
            LOG.warning("  button /%s/ not found", button_re)
            return False
        try:
            btn.invoke()
        except Exception:
            btn.click_input()
        LOG.info("  clicked /%s/", button_re)
        return True
    except Exception as e:
        LOG.warning("  click_button(/%s/, /%s/) failed: %s", title_re_win, button_re, e)
        return False


def click_at(title_re_win: str, dx: int, dy: int) -> bool:
    import pywinauto.mouse as mouse
    try:
        spec = wait_window(title_re_win, 10)
        if not spec:
            return False
        w = spec.wrapper_object()
        if w.is_minimized():
            w.restore()
        w.set_focus()
        r = w.rectangle()
        mouse.click(coords=(r.left + dx, r.top + dy))
        LOG.info("  clicked at (%d,%d) in /%s/", dx, dy, title_re_win)
        return True
    except Exception as e:
        LOG.warning("  click_at(%d,%d in /%s/) failed: %s", dx, dy, title_re_win, e)
        return False


def capture_window(hwnd):
    """Grab a window's pixels even if another window (e.g. full-screen GSPro) covers it."""
    import win32gui
    import win32ui
    from PIL import Image

    l, t, r, b = win32gui.GetWindowRect(hwnd)
    w, h = max(1, r - l), max(1, b - t)
    hdc = win32gui.GetWindowDC(hwnd)
    mfc = None
    mem = None
    bmp = None
    old_bmp = None
    try:
        mfc = win32ui.CreateDCFromHandle(hdc)
        mem = mfc.CreateCompatibleDC()
        bmp = win32ui.CreateBitmap()
        bmp.CreateCompatibleBitmap(mfc, w, h)
        old_bmp = mem.SelectObject(bmp)
        ctypes.windll.user32.PrintWindow(hwnd, mem.GetSafeHdc(), 2)  # PW_RENDERFULLCONTENT
        info = bmp.GetInfo()
        return Image.frombuffer(
            "RGB", (info["bmWidth"], info["bmHeight"]),
            bmp.GetBitmapBits(True), "raw", "BGRX", 0, 1,
        )
    finally:
        if mem is not None and old_bmp is not None:
            try:
                mem.SelectObject(old_bmp)
            except Exception:
                pass
        if mem is not None:
            try:
                mem.DeleteDC()
            except Exception:
                pass
        if bmp is not None:
            try:
                win32gui.DeleteObject(bmp.GetHandle())
            except Exception:
                pass
        win32gui.ReleaseDC(hwnd, hdc)


def avg_color(img, x, y, radius=3):
    px = [
        img.getpixel((i, j))
        for i in range(max(0, x - radius), min(img.width, x + radius + 1))
        for j in range(max(0, y - radius), min(img.height, y + radius + 1))
    ]
    n = max(1, len(px))
    return tuple(sum(c[k] for c in px) // n for k in range(3))


def looks_green(rgb) -> bool:
    r, g, b = rgb
    return g > 110 and g > r * 1.35 and g > b * 1.2


# --------------------------------------------------------------------------- displays / GSPro launch dialog

def list_displays():
    """Active displays: primary first, then by \\\\.\\DISPLAYn. Matches Unity's 'Display 1, 2, ...' order."""
    import win32api
    out = []
    for hmon, _hdc, _rect in win32api.EnumDisplayMonitors():
        info = win32api.GetMonitorInfo(hmon)
        l, t, r, b = info["Monitor"]
        try:
            mon = win32api.EnumDisplayDevices(info["Device"], 0)
            mon_id, mon_name = mon.DeviceID, mon.DeviceString
        except Exception:
            mon_id = mon_name = ""
        out.append({
            "device": info["Device"], "left": l, "top": t, "width": r - l, "height": b - t,
            "primary": bool(info["Flags"] & 1), "id": mon_id, "name": mon_name,
        })
    out.sort(key=lambda d: (not d["primary"], d["device"]))
    return out


def choose_display(cfg):
    """Projector detection. Returns (unity_display_index, display, projector_on).

    Windows only reports a display while the projector is connected and awake, so "an extra display
    exists" means "projector is on". If config.json sets projector.match_regex it must match the
    monitor's PnP id / name (e.g. "BNQ|EPS|OPT") - use that if a second real monitor is ever attached.
    """
    pj = cfg.get("projector", {})
    displays = list_displays()
    if not displays:
        fallback = {"device": "DISPLAY1", "left": 0, "top": 0, "width": 1920, "height": 1080,
                    "primary": True, "id": "", "name": ""}
        return 0, fallback, False
    rx = pj.get("match_regex")
    if rx:
        cand = [d for d in displays if re.search(rx, f"{d['id']} {d['name']}", re.I)]
        if not cand:
            return 0, displays[0], False
    elif len(displays) > 1:
        non_primary = [d for d in displays if not d["primary"]]
        if len(non_primary) == 1:
            pick = non_primary[0]
            return displays.index(pick), pick, True
        cand = non_primary or displays
    else:
        return 0, displays[0], False

    if pj.get("side", "left") == "right":
        pick = max(cand, key=lambda d: (d["left"], not d["primary"]))
    else:
        pick = min(cand, key=lambda d: (d["left"], d["primary"]))
    return displays.index(pick), pick, True


def gspro_configure(cfg, app) -> bool:
    """Drive Unity's 'GSPro Configuration' launch dialog: monitor, resolution, windowed, then Play!"""
    import win32con
    import win32gui
    from pywinauto.controls.win32_controls import ComboBoxWrapper

    try:
        spec = wait_window(r"^GSPro Configuration$", app.get("start_timeout_sec", 60))
        if not spec:
            LOG.warning("  GSPro Configuration dialog not found (already past it?)")
            return False
        dlg = spec.wrapper_object().handle
        idx, disp, projector_on = choose_display(cfg)
        gdisp = cfg.get("gspro_display", {})
        windowed = bool(gdisp.get("windowed", False))
        if not projector_on and cfg.get("video", {}).get("enabled", False) and gdisp.get("windowed_when_projector_off", True):
            windowed = True

        cls = win32gui.GetClassName
        txt = win32gui.GetWindowText
        kids = []
        combos = []
        labels = {}
        monitors = None
        names = []
        deadline = time.time() + 15.0
        while time.time() < deadline:
            if not win32gui.IsWindow(dlg):
                return False
            kids = []
            win32gui.EnumChildWindows(dlg, lambda c, _: (kids.append(c), True)[1], None)
            combos = [c for c in kids if cls(c) == "ComboBox" and win32gui.IsWindowVisible(c)]
            labels = {txt(c): c for c in kids if cls(c) == "Static" and txt(c)}
            if combos and "Select monitor" in labels and "Screen resolution" in labels:
                ly = win32gui.GetWindowRect(labels["Select monitor"])[1]
                monitors = ComboBoxWrapper(min(combos, key=lambda c: abs(win32gui.GetWindowRect(c)[1] - ly)))
                names = monitors.item_texts()
                if names:
                    break
            time.sleep(0.4)

        if not combos or "Select monitor" not in labels or "Screen resolution" not in labels:
            LOG.warning("  GSPro Configuration controls not ready")
            return False
        if not names or monitors is None:
            LOG.warning("  GSPro Configuration monitor list empty")
            return False

        def combo_for(label):  # the combo box sitting on the same row as its label
            ly = win32gui.GetWindowRect(labels[label])[1]
            return ComboBoxWrapper(min(combos, key=lambda c: abs(win32gui.GetWindowRect(c)[1] - ly)))

        if idx >= len(names):
            LOG.warning("  GSPro lists only %d monitor(s) %s; falling back to Display 1", len(names), names)
            idx = 0
        monitors.select(idx)

        res = combo_for("Screen resolution")
        sizes = {}
        for i, t in enumerate(res.item_texts()):
            m = re.match(r"\s*(\d+)\s*x\s*(\d+)", t)
            if m:
                sizes[i] = (int(m.group(1)), int(m.group(2)))
        fit = [i for i, (w, h) in sizes.items() if w <= disp["width"] and h <= disp["height"]]
        if fit:
            res.select(max(fit, key=lambda i: sizes[i][0] * sizes[i][1]))   # largest that fits the display

        win_btn = next((c for c in kids if cls(c) == "Button" and txt(c) == "Windowed"), None)
        if win_btn is not None:
            is_windowed = win32gui.SendMessage(win_btn, win32con.BM_GETCHECK, 0, 0) == win32con.BST_CHECKED
            if is_windowed != windowed:
                win32gui.SendMessage(win_btn, win32con.BM_CLICK, 0, 0)

        LOG.info(
            "  GSPro display: projector %s -> %s (%dx%d at %d,%d) %s",
            "ON" if projector_on else "off", names[idx],
            disp["width"], disp["height"], disp["left"], disp["top"],
            "windowed" if windowed else "full screen",
        )
        play = next((c for c in kids if cls(c) == "Button" and txt(c) == "Play!"), None)
        if play is None:
            LOG.error("  Play! button not found in GSPro Configuration")
            return False
        win32gui.SendMessage(play, win32con.BM_CLICK, 0, 0)
        return True
    except Exception as e:
        LOG.warning("  gspro_configure failed: %s", e)
        return False


def _find_gspro_main_hwnd(cfg) -> int | None:
    gspro_app = cfg.get("apps_by_key", {}).get("gspro")
    if not gspro_app:
        return None
    for p in find_procs(gspro_app["process"]):
        hwnd = find_window_for_pid(p.pid, title_re=r"^(?!GSPro Configuration$).+", include_minimized=True)
        if hwnd:
            return hwnd
    return None


def enforce_gspro_window_state(cfg) -> None:
    """Apply borderless_when_pip and ensure GSPro stays on the projector display when ON."""
    import win32con
    import win32gui

    try:
        gdisp = cfg.get("gspro_display", {})
        hwnd = _find_gspro_main_hwnd(cfg)
        if not hwnd or win32gui.IsIconic(hwnd):
            return
        _, disp, projector_on = choose_display(cfg)
        pip_enabled = bool(cfg.get("video", {}).get("projector_pip", {}).get("enabled", False))
        if gdisp.get("borderless_when_pip", False) and (pip_enabled or projector_on):
            style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
            new_style = style & ~(win32con.WS_CAPTION | win32con.WS_THICKFRAME)
            if new_style != style:
                win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, new_style)
                win32gui.SetWindowPos(
                    hwnd, 0, 0, 0, 0, 0,
                    win32con.SWP_NOMOVE | win32con.SWP_NOSIZE | win32con.SWP_NOZORDER
                    | win32con.SWP_NOACTIVATE | win32con.SWP_FRAMECHANGED,
                )
        if projector_on:
            l, t, r, b = win32gui.GetWindowRect(hwnd)
            cx, cy = (l + r) // 2, (t + b) // 2
            in_proj = (disp["left"] <= cx < disp["left"] + disp["width"]) and (disp["top"] <= cy < disp["top"] + disp["height"])
            if not in_proj:
                win32gui.SetWindowPos(
                    hwnd, win32con.HWND_NOTOPMOST,
                    disp["left"], disp["top"], disp["width"], disp["height"],
                    win32con.SWP_NOACTIVATE | win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED,
                )
    except Exception as e:
        LOG.debug("enforce_gspro_window_state: %s", e)


def suppress_background_focus(cfg) -> None:
    """Keep GameChanger / GSPconnect behind GSPro & Kinovea without minimizing them."""
    import win32con
    import win32gui

    if not cfg.get("gspro_display", {}).get("suppress_focus_when_green", True):
        return
    apps = cfg.get("apps_by_key", {})
    for key in ("integrator", "gspro_connect", "fs_connector"):
        app = apps.get(key)
        if not app:
            continue
        try:
            hwnd = WindowSpec(app["window_title_re"])._find() if app.get("window_title_re") else None
            if not hwnd:
                for p in find_procs(app["process"]):
                    hwnd = find_window_for_pid(p.pid)
                    if hwnd:
                        break
            if hwnd and not win32gui.IsIconic(hwnd):
                win32gui.SetWindowPos(
                    hwnd, win32con.HWND_BOTTOM, 0, 0, 0, 0,
                    win32con.SWP_NOACTIVATE | win32con.SWP_NOMOVE | win32con.SWP_NOSIZE,
                )
        except Exception:
            pass


def wait_port(port: int, timeout: float) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                LOG.info("  :%d accepting connections", port)
                return True
        except OSError:
            time.sleep(2)
    LOG.warning("  :%d never opened within %ds", port, timeout)
    return False


# --------------------------------------------------------------------------- FSX Pro launch-monitor connection

FSX_REF = (1366, 768)
FSX_ICON_MAIN = (40, 31)         # device icon on the main / login screen
FSX_ICON_SETTINGS = (283, 26)    # same icon once the Settings page is open
FSX_BACK = (1331, 26)            # "<" back arrow on the Settings page
FSX_SEARCH_BTN = (827, 639)      # "Search" (disconnected) / "Disconnect" (connected)
FSX_SEARCH_CLOSE = (940, 162)    # X on the search-results popup
FSX_TILE0, FSX_TILE_PITCH = (518, 281), 161
ASSETS = HERE / "assets"


def _fsx_rgb(img, pt, r=4):
    return avg_color(img, pt[0], pt[1], r)


def _fsx_on_devices_page(img) -> bool:
    return min(_fsx_rgb(img, (200, 335))) > 235


def _fsx_button_is_disconnect(img) -> bool:
    r, g, b = _fsx_rgb(img, (760, 640), 2)
    return r > g * 1.6 and r > b * 1.6 and r < 200


def fsx_tiles(img):
    """[(slot, 'wired'|'wifi')] for each device tile in the search popup."""
    from PIL import Image, ImageChops, ImageStat
    refs = {}
    for kind in ("wired", "wifi"):
        p = ASSETS / f"fsx_icon_{kind}.png"
        if p.exists():
            refs[kind] = Image.open(p).convert("L")
    tiles = []
    for i in range(4):
        dx = FSX_TILE_PITCH * i
        photo = img.crop((443 + dx, 260, 468 + dx, 302)).convert("L")
        if sum(1 for p in photo.tobytes() if p < 90) < 100:
            continue
        icon = img.crop((556 + dx, 255, 592 + dx, 281)).convert("L")
        if refs:
            kind = min(refs, key=lambda k: ImageStat.Stat(ImageChops.difference(icon, refs[k])).mean[0])
        else:
            kind = "wired" if i == 0 else "wifi"
        tiles.append((i, kind))
    return tiles


def link_kind(local_ip: str) -> str:
    for nic, addrs in psutil.net_if_addrs().items():
        if any(a.address == local_ip for a in addrs):
            return "wifi" if re.search(r"wi-?fi|wireless|wlan|bluetooth|local area connection\*", nic, re.I) else "wired"
    return "unknown"


def _device_ports(d: dict) -> set[int]:
    """Collect configured Launch Pro ports, automatically pairing 9970 and 9971."""
    ports: set[int] = set()
    if not d:
        return ports
    if d.get("port") is not None:
        ports.add(int(d["port"]))
    for p in d.get("ports") or ():
        ports.add(int(p))
    if 9970 in ports:
        ports.add(9971)
    return ports


def _find_device_tcp_session(pids: set[int], ip: str | None, ports: set[int]):
    """Return an established TCP connection from `pids` matching the launch monitor IP or ports."""
    if not pids or (not ip and not ports):
        return None
    for c in psutil.net_connections(kind="tcp"):
        if c.pid in pids and c.status == psutil.CONN_ESTABLISHED and c.raddr:
            if (ip and c.raddr.ip == ip) or (ports and c.raddr.port in ports):
                return c
    return None


def fsx_session(cfg):
    """FSX Pro's established TCP session to the launch monitor, if any."""
    app = cfg["apps_by_key"].get("fs_connector")
    if not app:
        return None
    dev = cfg.get("device", {})
    pids = {p.pid for p in find_procs(app["process"])}
    return _find_device_tcp_session(pids, dev.get("ip"), _device_ports(dev) or {9970, 9971})


class _FsxWindow:
    def __init__(self, hwnd):
        self.hwnd = hwnd

    def shot(self):
        img = capture_window(self.hwnd)
        return img if img.size == FSX_REF else img.resize(FSX_REF)

    def click(self, pt):
        import pywinauto.mouse as mouse
        import win32gui
        from pywinauto.controls.hwndwrapper import HwndWrapper
        w = HwndWrapper(self.hwnd)
        if w.is_minimized():
            w.restore()
        w.set_focus()
        l, t, r, b = win32gui.GetWindowRect(self.hwnd)
        mouse.click(coords=(int(l + pt[0] * (r - l) / FSX_REF[0]), int(t + pt[1] * (b - t) / FSX_REF[1])))


def _fsx_wait_rendered(win: _FsxWindow, timeout=90) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        img = win.shot()
        if len(img.resize((64, 36)).getcolors(64 * 36) or []) > 50:
            return True
        time.sleep(2)
    return False


def fsx_connect_once(cfg) -> str | None:
    """One attempt. Returns 'wired' / 'wifi' when FSX Pro holds a session to the launch monitor, else None."""
    import win32gui
    from pywinauto.controls.hwndwrapper import HwndWrapper

    dev = cfg.get("device", {})
    spec = wait_window(cfg["apps_by_key"]["fs_connector"]["window_title_re"], 30)
    if not spec:
        LOG.warning("  FSX Pro window not found")
        return None
    w = spec.wrapper_object()
    win = _FsxWindow(w.handle)
    prev = win32gui.GetForegroundWindow()
    try:
        s = fsx_session(cfg)
        if s:
            return link_kind(s.laddr.ip)
        if w.is_minimized():
            w.restore()
            time.sleep(0.5)
        if not _fsx_wait_rendered(win):
            LOG.warning("  FSX Pro never finished drawing its first screen")
            return None
        img = win.shot()
        for icon in (FSX_ICON_MAIN, FSX_ICON_SETTINGS):
            if _fsx_on_devices_page(img):
                break
            win.click(icon)
            time.sleep(3)
            img = win.shot()
        if not _fsx_on_devices_page(img):
            LOG.warning("  couldn't reach Settings > Devices")
            return None
        for _ in range(8):
            if not _fsx_button_is_disconnect(img):
                break
            s = fsx_session(cfg)
            if s:
                return link_kind(s.laddr.ip)
            time.sleep(2)
            img = win.shot()
        else:
            LOG.warning("  Devices page stuck on 'Disconnect' with no session - forcing a disconnect")
            win.click(FSX_SEARCH_BTN)
            for _ in range(8):
                time.sleep(2)
                if not _fsx_button_is_disconnect(win.shot()):
                    break
            else:
                LOG.warning("  Disconnect click had no effect")
                return None
        win.click(FSX_SEARCH_BTN)
        tiles, end = [], time.time() + 20
        while time.time() < end and not tiles:
            time.sleep(2)
            tiles = fsx_tiles(win.shot())
        if tiles:
            time.sleep(3)
            tiles = fsx_tiles(win.shot())
        LOG.info("  search found: %s", [k for _, k in tiles] or "nothing")
        order = ["wired"] + (["wifi"] if dev.get("allow_wifi", True) else [])
        tried = 0
        for want in order:
            for slot, kind in tiles:
                if kind != want:
                    continue
                if tried > 0 and not fsx_tiles(win.shot()):
                    win.click(FSX_SEARCH_BTN)
                    time.sleep(4)
                    refreshed = fsx_tiles(win.shot())
                    match = next((sl for sl, kd in refreshed if kd == want), None)
                    if match is None:
                        continue
                    slot = match
                tried += 1
                LOG.info("  connecting to Launch Pro over %s", want)
                win.click((FSX_TILE0[0] + FSX_TILE_PITCH * slot, FSX_TILE0[1]))
                for _ in range(15):
                    time.sleep(2)
                    s = fsx_session(cfg)
                    if s:
                        if dev.get("close_settings", False):
                            win.click(FSX_BACK)
                        return link_kind(s.laddr.ip)
        if not tiles or fsx_tiles(win.shot()) or not _fsx_on_devices_page(win.shot()):
            win.click(FSX_SEARCH_CLOSE)
        return None
    finally:
        try:
            if prev and prev != win.hwnd:
                win32gui.SetForegroundWindow(prev)
        except Exception:
            pass


def fsx_connect(cfg) -> bool:
    """Manual diagnostic path (`python simwatch.py reconnect`): wired first, Wi-Fi fallback."""
    dev = cfg.get("device", {})
    attempts, wait = dev.get("max_attempts", 5), dev.get("retry_sec", 60)
    for n in range(1, attempts + 1):
        kind = fsx_connect_once(cfg)
        if kind:
            LOG.info("  FSX Pro connected to Launch Pro (%s)", kind)
            return True
        if n < attempts:
            LOG.warning("  Launch Pro not connectable (attempt %d/%d), retrying in %ds", n, attempts, wait)
            time.sleep(wait)
    alert(
        f"Launch Pro unavailable after {attempts} attempts. Run 'python simwatch.py reconnect' "
        "again once it's back online."
    )
    return False


def fsx_disconnect(cfg, force_ui: bool = False) -> None:
    """Safety net before GameChanger (re)connects: make sure FSX Pro isn't holding the device."""
    import win32gui
    prev = None
    hwnd = None
    try:
        app = cfg["apps_by_key"].get("fs_connector")
        if not app or not find_procs(app["process"]):
            return
        if not force_ui and fsx_session(cfg) is None:
            return
        spec = wait_window(app["window_title_re"], 3)
        if not spec:
            return
        w = spec.wrapper_object()
        hwnd = w.handle
        prev = win32gui.GetForegroundWindow()
        if w.is_minimized():
            w.restore()
            time.sleep(0.5)
        win = _FsxWindow(hwnd)
        img = win.shot()
        for icon in (FSX_ICON_MAIN, FSX_ICON_SETTINGS):
            if _fsx_on_devices_page(img):
                break
            win.click(icon)
            time.sleep(2)
            img = win.shot()
        if _fsx_on_devices_page(img) and _fsx_button_is_disconnect(img):
            LOG.info("  FSX Pro is holding the Launch Pro - disconnecting it so GameChanger can connect")
            win.click(FSX_SEARCH_BTN)
            time.sleep(3)
    except Exception as e:
        LOG.warning("  fsx_disconnect: %s", e)
    finally:
        try:
            if prev and hwnd and prev != hwnd:
                win32gui.SetForegroundWindow(prev)
        except Exception:
            pass


# --------------------------------------------------------------------------- checks

def check_process(chk, cfg):
    app = cfg["apps_by_key"][chk["app"]]
    ok = bool(find_procs(app["process"]))
    return ok, "running" if ok else "not running"


def check_gspro_link(chk, cfg):
    port = chk.get("port", GSPRO_PORT)
    apps = cfg.get("apps_by_key", {})
    integ_app = apps.get("integrator")
    gspc_app = apps.get("gspro_connect")
    integ_pids = {p.pid for p in find_procs(integ_app["process"])} if integ_app else set()
    gspc_pids = {p.pid for p in find_procs(gspc_app["process"])} if gspc_app else set()
    if integ_app and not integ_pids:
        return False, f"no established connection on :{port} (integrator not running)"
    pids = integ_pids if (integ_app and integ_pids != gspc_pids) else (integ_pids | gspc_pids)
    target_apps = [a for a in (integ_app, gspc_app) if a]
    if target_apps and not pids:
        return False, f"no established connection on :{port} (bridge apps not running)"
    for c in psutil.net_connections(kind="tcp"):
        if c.status == psutil.CONN_ESTABLISHED and (not target_apps or c.pid in pids) and (
            (c.laddr and c.laddr.port == port) or (c.raddr and c.raddr.port == port)
        ):
            return True, f"OpenConnect socket :{port} established"
    return False, f"no established connection on :{port}"


def check_device_ping(chk, cfg):
    r = subprocess.run(
        ["ping", "-n", "1", "-w", "1000", chk["ip"]],
        capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    ok = r.returncode == 0 and "TTL=" in r.stdout.upper()
    return ok, f"ping {chk['ip']} {'ok' if ok else 'failed'}"


def check_device_tcp(chk, cfg):
    """FS software has a live TCP session to the launch monitor (match by ip or configured ports)."""
    app = cfg["apps_by_key"][chk["app"]]
    pids = {p.pid for p in find_procs(app["process"])}
    dev = cfg.get("device", {})
    ip = chk.get("ip") or dev.get("ip")
    ports = _device_ports(chk) or _device_ports(dev)
    c = _find_device_tcp_session(pids, ip, ports)
    if c:
        return True, f"{app['key']} connected to {c.raddr.ip}:{c.raddr.port} ({link_kind(c.laddr.ip)})"
    return False, f"{app['key']} has no session to the launch monitor"


def check_bridge_link(chk, cfg):
    """GSPconnect <-> GSPro link. This is the hop that can break while :921 still looks fine."""
    port = chk.get("port", 9050)
    pids = {p.pid for p in find_procs(chk.get("process", "GSPconnect.exe"))}
    for c in psutil.net_connections(kind="tcp"):
        if c.pid in pids and c.status == psutil.CONN_ESTABLISHED and c.raddr and c.raddr.port == port:
            return True, f"GSPconnect connected to GSPro :{port}"
    return False, f"GSPconnect has no session to GSPro :{port}"


def check_responsive(chk, cfg):
    """Is the app's window actually pumping messages, not just open."""
    spec = window_spec(chk["window_title_re"])
    if spec.exists(timeout=1):
        hwnd = spec.wrapper_object().handle
        if ctypes.windll.user32.IsHungAppWindow(hwnd):
            return False, "window is not responding (hung)"
        return True, "responding"

    # Fallback when minimized to tray or checked from a non-interactive desktop session
    app_key = chk.get("app")
    apps = cfg.get("apps_by_key", {})
    proc_name = chk.get("process") or (apps[app_key]["process"] if app_key in apps else None)
    if not proc_name:
        return False, "window not found"
    procs = find_procs(proc_name)
    if not procs:
        return False, "process not running"
    for p in procs:
        hwnd = find_window_for_pid(p.pid, include_minimized=True)
        if hwnd:
            if ctypes.windll.user32.IsHungAppWindow(hwnd):
                return False, "window is not responding (hung)"
            return True, "responding"
    for p in procs:
        if not hasattr(p, "create_time"):
            try:
                if p.is_running() and p.status() != psutil.STATUS_STOPPED:
                    return True, "responding"
            except psutil.Error:
                pass
    return False, "process not responding"


def check_usb(chk, cfg):
    safe_name = chk["name_like"].replace("'", "''")
    ps = (
        f"Get-PnpDevice -PresentOnly -FriendlyName '*{safe_name}*' "
        "| Where-Object Status -eq 'OK' | Measure-Object | % Count"
    )
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    ok = False
    if r.returncode == 0:
        try:
            ok = int(r.stdout.strip() or "0") > 0
        except ValueError:
            ok = False
    return ok, f"USB '*{chk['name_like']}*' {'present' if ok else 'missing'}"


def check_indicator(chk, cfg):
    import win32gui
    spec = window_spec(chk["window_title_re"])
    if not spec.exists(timeout=1):
        return False, "window not found"
    w = spec.wrapper_object()
    if win32gui.IsIconic(w.handle):
        return None, "window minimized - can't read light (keep it restored, it can sit behind GSPro)"
    rgb = avg_color(capture_window(w.handle), chk["dx"], chk["dy"], chk.get("radius", 3))
    ok = looks_green(rgb)
    return ok, f"light rgb{rgb} {'GREEN' if ok else 'NOT green'}"


def check_text(chk, cfg):
    spec = window_spec(chk["window_title_re"])
    if not spec.exists(timeout=1):
        return False, "window not found"
    texts = " | ".join(t for t in (d.window_text() for d in uia_window(spec).wrapper_object().descendants()) if t)
    ok = re.search(chk["healthy_text_re"], texts, re.I) is not None
    return ok, f"text /{chk['healthy_text_re']}/ {'found' if ok else 'missing'}"


CHECKS = {
    "process": check_process,
    "gspro_link": check_gspro_link,
    "device_ping": check_device_ping,
    "device_tcp": check_device_tcp,
    "bridge_link": check_bridge_link,
    "responsive": check_responsive,
    "usb": check_usb,
    "indicator": check_indicator,
    "text": check_text,
}


def evaluate_checks(cfg, verbose=True) -> dict:
    """Run all configured checks and return breakdown dict."""
    all_ok = True
    any_unknown = False
    device_ping_failed = False
    saw_non_device_fail = False
    level = None

    for chk in cfg["checks"]:
        try:
            ok, msg = CHECKS[chk["type"]](chk, cfg)
        except Exception as e:  # a broken check shouldn't kill the watchdog
            ok, msg = None, f"check error: {e}"
        mark = {True: "OK ", False: "BAD", None: "?? "}[ok]
        if verbose or ok is not True:
            LOG.info("[%s] %-22s %s", mark, chk["name"], msg)
        if ok is None:
            any_unknown = True
        elif ok is False:
            all_ok = False
            if chk.get("type") == "device_ping":
                device_ping_failed = True
            if not chk.get("device"):
                saw_non_device_fail = True
            lvl = chk.get("recovery_level", 0)
            level = lvl if level is None else max(level, lvl)

    return {
        "all_ok": all_ok,
        "any_unknown": any_unknown,
        "device_ping_failed": device_ping_failed,
        "only_device_failed": (not all_ok) and (not saw_non_device_fail),
        "level": level,
    }


def run_checks(cfg, verbose=True):
    """Returns (all_ok, highest recovery level suggested by the failures)."""
    res = evaluate_checks(cfg, verbose=verbose)
    return res["all_ok"], res["level"]


# --------------------------------------------------------------------------- recovery

def run_actions(app: dict, cfg: dict, actions=None) -> None:
    for act in (app.get("post_start", []) if actions is None else actions):
        if "wait" in act:
            time.sleep(act["wait"])
        elif "click_button_re" in act:
            click_button(act.get("window_title_re", app["window_title_re"]), act["click_button_re"])
        elif "click_at" in act:
            dx, dy = act["click_at"]
            click_at(act.get("window_title_re", app["window_title_re"]), dx, dy)
        elif act.get("gspro_configure"):
            if not gspro_configure(cfg, app) and WindowSpec(r"^GSPro Configuration$").exists(timeout=0):
                LOG.warning("  GSPro Configuration still open; aborting remaining post_start actions")
                return
        elif "wait_port" in act:
            wait_port(act["wait_port"], act.get("timeout", 120))
        elif act.get("fsx_connect"):
            fsx_connect(cfg)


def launch_app(cfg, app: dict, default_timeout: float) -> None:
    """Start an app (unless already up) and run its post-start steps."""
    if find_procs(app["process"]):
        if app["key"] == "gspro" and WindowSpec(r"^GSPro Configuration$").exists(timeout=1):
            LOG.info("  gspro already running on Configuration dialog - completing post_start")
            run_actions(app, cfg)
            return
        LOG.info("  %s already running", app["key"])
        if app.get("ensure_actions"):
            run_actions(app, cfg, app["ensure_actions"])
        return
    if not start_app(app):
        return
    if app.get("window_title_re"):
        wait_window(app["window_title_re"], app.get("start_timeout_sec", default_timeout))
    time.sleep(app.get("start_wait_sec", 5))
    run_actions(app, cfg)


def _is_gspro_healthy(cfg) -> bool:
    """Return True if GSPro.exe has a non-hung window and is listening/connected on :9050."""
    gspro_app = cfg.get("apps_by_key", {}).get("gspro")
    if not gspro_app:
        return False
    procs = find_procs(gspro_app["process"])
    if not procs:
        return False
    if WindowSpec(r"^GSPro Configuration$").exists(timeout=0):
        return False
    pids = {p.pid for p in procs}
    hwnd_ok = False
    for pid in pids:
        hwnd = find_window_for_pid(pid, include_minimized=True)
        if hwnd and not ctypes.windll.user32.IsHungAppWindow(hwnd):
            hwnd_ok = True
            break
    if not hwnd_ok:
        return False
    for c in psutil.net_connections(kind="tcp"):
        if c.pid in pids and c.laddr and c.laddr.port == 9050 and c.status in (psutil.CONN_LISTEN, psutil.CONN_ESTABLISHED):
            return True
    bridge_ok, _ = check_bridge_link({"port": 9050}, cfg)
    return bridge_ok


def recover(cfg, level: int) -> None:
    step = cfg["recovery"][level]
    keys = list(step.get("restart", []))
    if "gspro" in keys and _is_gspro_healthy(cfg):
        LOG.info("  gspro already healthy and listening on :9050 - skipping GSPro restart")
        keys = [k for k in keys if k != "gspro"]
    LOG.warning(">>> recovery level %d: %s", level, step["name"])
    for key in reversed(keys):          # stop downstream first
        kill_app(cfg["apps_by_key"][key])
    if keys:
        time.sleep(2)
    for key in keys:
        if key == "integrator":
            fsx_disconnect(cfg)         # safety net right before GameChanger starts
        launch_app(cfg, cfg["apps_by_key"][key], 45)
    time.sleep(cfg.get("settle_sec", 15))


def alert(msg: str) -> None:
    LOG.error("!!! %s", msg)
    for _ in range(3):
        winsound.MessageBeep(winsound.MB_ICONHAND)
        time.sleep(0.4)


# --------------------------------------------------------------------------- video rig: Kinovea + OBS + Swing Library

def club_category(club: str | None) -> str:
    c = (club or "").strip().upper()
    if c in ("PW", "GW", "AW", "SW", "LW", "WEDGE", "48", "50", "52", "54", "56", "58", "60"):
        return "Wedge"
    if c in ("DR", "DRIVER", "1W", "W1", "3W", "5W", "WOOD") or c.endswith("W"):
        return "Driver"
    return "Iron"


def ensure_swings_layout(cfg) -> dict:
    """Create and return paths for Swings/Sessions, My-Go-To, Pros, and Workspaces."""
    vcfg = cfg.get("video", {})
    raw_dir = Path(vcfg.get("swings_dir", "Swings"))
    root = raw_dir if raw_dir.is_absolute() else (HERE / raw_dir)
    sessions = root / "Sessions"
    today = sessions / time.strftime("%Y-%m-%d")
    today_dtl = today / "DTL"
    today_fo = today / "FO"
    goto = root / "My-Go-To"
    pros = root / "Pros"
    workspaces = root / "Workspaces"

    for p in (root, sessions, today, today_dtl, today_fo, goto, pros, workspaces):
        p.mkdir(parents=True, exist_ok=True)
    for cat in ("Driver", "Iron", "Wedge"):
        (goto / cat).mkdir(parents=True, exist_ok=True)
    for pro in vcfg.get("pros", ["Rory_McIlroy", "Tiger_Woods", "Tommy_Fleetwood"]):
        (pros / pro).mkdir(parents=True, exist_ok=True)

    pros_readme = pros / "README.txt"
    if not pros_readme.exists():
        pros_readme.write_text(
            "Drop tour pro comparison videos into each pro's folder using names like:\n"
            "  Driver_DTL.mp4, Driver_FO.mp4\n"
            "  Iron_DTL.mp4,   Iron_FO.mp4\n"
            "  Wedge_DTL.mp4,  Wedge_FO.mp4\n\n"
            "SimWatch automatically matches your active GSPro club (Driver / Iron / Wedge)\n"
            "and loads the corresponding DTL + FO clips into the bottom Kinovea grid.\n",
            encoding="utf-8",
        )
    goto_readme = goto / "README.txt"
    if not goto_readme.exists():
        goto_readme.write_text(
            "Press Alt+G (or run `python simwatch.py bookmark`) after a pure swing to copy\n"
            "your latest DTL + FO clips here as GoTo_<Club>_DTL.mp4 and GoTo_<Club>_FO.mp4.\n",
            encoding="utf-8",
        )

    return {
        "root": root,
        "sessions": sessions,
        "today": today,
        "today_dtl": today_dtl,
        "today_fo": today_fo,
        "goto": goto,
        "pros": pros,
        "workspaces": workspaces,
    }


def write_kinovea_workspace(xml_path: Path, screens: list[dict]) -> None:
    """Write a Kinovea 2023.1.2 compatible .xml workspace file."""
    root = ET.Element("KinoveaWorkspace")
    ET.SubElement(root, "FormatVersion").text = "1.0"
    for scr in screens:
        if scr["type"] == "capture":
            el = ET.SubElement(root, "ScreenDescriptionCapture")
            ET.SubElement(el, "CameraName").text = str(scr["camera_name"])
            ET.SubElement(el, "Autostream").text = "true" if scr.get("autostream", True) else "false"
            ET.SubElement(el, "Delay").text = str(scr.get("delay", 0))
            ET.SubElement(el, "DelayedDisplay").text = "true" if scr.get("delayed_display", True) else "false"
        elif scr["type"] == "playback":
            el = ET.SubElement(root, "ScreenDescriptionPlayback")
            ET.SubElement(el, "FullPath").text = str(scr["full_path"])
            ET.SubElement(el, "Autoplay").text = "true" if scr.get("autoplay", True) else "false"
            ET.SubElement(el, "SpeedPercentage").text = str(scr.get("speed", 50))
            ET.SubElement(el, "Stretch").text = "true" if scr.get("stretch", True) else "false"
            ET.SubElement(el, "IsReplayWatcher").text = "true" if scr.get("is_watcher", False) else "false"
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(xml_path, encoding="utf-8", xml_declaration=True)


def _kinovea_appdata_dir() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    p = Path(appdata) / "Kinovea"
    return p if p.exists() else None


def _set_xml_text(parent: ET.Element, tag: str, text: str) -> ET.Element:
    node = parent.find(tag)
    if node is None:
        node = ET.SubElement(parent, tag)
    node.text = text
    return node


def sync_kinovea_instance_prefs(cfg, layout: dict) -> None:
    """Keep user's camera settings while pointing Capture into today's session & keeping lines visible."""
    kdir = _kinovea_appdata_dir()
    if not kdir:
        return
    base_prefs = kdir / "Preferences.xml"
    if not base_prefs.exists():
        return
    for inst in ("LiveReplay", "Reference"):
        dst = kdir / f"Preferences.{inst}.xml"
        if not dst.exists():
            try:
                shutil.copy2(base_prefs, dst)
            except OSError:
                pass
        if dst.exists():
            try:
                itree = ET.parse(dst)
                iroot = itree.getroot()
                player = iroot.find("Player")
                if player is not None:
                    fading = player.find("InfoFading")
                    if fading is None:
                        fading = ET.SubElement(player, "InfoFading")
                    _set_xml_text(fading, "AlwaysVisible", "true")
                    _set_xml_text(fading, "Enabled", "true")
                itree.write(dst, encoding="utf-8", xml_declaration=True)
            except Exception as e:
                LOG.debug("sync_kinovea_instance_prefs (%s): %s", inst, e)
    cap_prefs = kdir / "Preferences.Capture.xml"
    try:
        tree = ET.parse(base_prefs)
        root = tree.getroot()
        cap_node = root.find("./Capture")
        if cap_node is None:
            cap_node = ET.SubElement(root, "Capture")
        _set_xml_text(cap_node, "CaptureRecordingMode", "Delay")
        cap_path = cap_node.find("CapturePathConfiguration")
        if cap_path is None:
            cap_path = ET.SubElement(cap_node, "CapturePathConfiguration")
        for tag, val in {
            "LeftVideoRoot": str(layout["today"]),
            "LeftVideoSubdir": "DTL",
            "RightVideoRoot": str(layout["today"]),
            "RightVideoSubdir": "FO",
        }.items():
            _set_xml_text(cap_path, tag, val)
        auto_cfg = cap_node.find("CaptureAutomationConfiguration")
        if auto_cfg is None:
            auto_cfg = ET.SubElement(cap_node, "CaptureAutomationConfiguration")
        vcfg = cfg.get("video", {})
        rec_sec = max(1.0, float(vcfg.get("pre_trigger_sec", 1.5)) + float(vcfg.get("post_trigger_sec", 1.5)))
        _set_xml_text(auto_cfg, "EnableAudioTrigger", "true")
        _set_xml_text(auto_cfg, "AudioTriggerThreshold", "0.15")
        _set_xml_text(auto_cfg, "RecordingSeconds", f"{rec_sec:.1f}")
        _set_xml_text(auto_cfg, "AudioQuietPeriod", "2.0")
        tree.write(cap_prefs, encoding="utf-8", xml_declaration=True)
    except Exception as e:
        LOG.debug("sync_kinovea_instance_prefs: %s", e)


def _read_kinovea_capture_dirs() -> list[Path]:
    """Read Kinovea's configured Left/Right video folders as extra watch locations."""
    kdir = _kinovea_appdata_dir()
    if not kdir:
        return []
    dirs = []
    for fname in ("Preferences.Capture.xml", "Preferences.xml"):
        p = kdir / fname
        if not p.exists():
            continue
        try:
            root = ET.parse(p).getroot()
            for side in ("Left", "Right"):
                r_node = root.find(f"./Capture/CapturePathConfiguration/{side}VideoRoot")
                s_node = root.find(f"./Capture/CapturePathConfiguration/{side}VideoSubdir")
                if r_node is not None and r_node.text:
                    sub = (s_node.text or "") if s_node is not None else ""
                    sub = (
                        sub.replace("%year", time.strftime("%Y"))
                        .replace("%month", time.strftime("%m"))
                        .replace("%day", time.strftime("%d"))
                    )
                    candidate = Path(r_node.text) / sub if sub else Path(r_node.text)
                    if candidate.exists() and candidate not in dirs:
                        dirs.append(candidate)
        except Exception:
            pass
    return dirs


def _latest_clips_in(folder: Path, angle: str | None = None) -> list[Path]:
    if not folder.exists():
        return []
    files = [
        p for p in folder.rglob("*")
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS
    ]
    if angle:
        rx = re.compile(rf"(?:^|[_\-\s/\\]){re.escape(angle)}(?:$|[_\-\s.])", re.I)
        matched = [p for p in files if rx.search(p.stem) or rx.search(str(p.parent.name))]
        files = matched
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files


def resolve_reference_clips(cfg, ref_name: str, club: str | None = None) -> tuple[Path | None, Path | None]:
    """Resolve (DTL, FO) reference videos for My-Go-To, a Pro folder, or Last-Swing."""
    layout = ensure_swings_layout(cfg)
    cat = club_category(club)

    def pick_pair(folder: Path) -> tuple[Path | None, Path | None]:
        dtl = _latest_clips_in(folder, "DTL")
        fo = _latest_clips_in(folder, "FO")
        return (dtl[0] if dtl else None, fo[0] if fo else None)

    if ref_name == "My-Go-To":
        dtl, fo = pick_pair(layout["goto"] / cat)
        if not dtl and not fo:
            for alt in ("Iron", "Driver", "Wedge"):
                dtl, fo = pick_pair(layout["goto"] / alt)
                if dtl or fo:
                    break
    elif ref_name != "Last-Swing":
        pro_dir = layout["pros"] / ref_name
        dtl = fo = None
        for ext in VIDEO_EXTS:
            c_dtl = pro_dir / f"{cat}_DTL{ext}"
            c_fo = pro_dir / f"{cat}_FO{ext}"
            if c_dtl.exists() and not dtl:
                dtl = c_dtl
            if c_fo.exists() and not fo:
                fo = c_fo
        if not dtl or not fo:
            f_dtl, f_fo = pick_pair(pro_dir)
            dtl = dtl or f_dtl
            fo = fo or f_fo
    else:
        dtl = fo = None

    if not dtl or not fo:
        s_dtl, s_fo = pick_pair(layout["today"])
        if not s_dtl and not s_fo:
            s_dtl, s_fo = pick_pair(layout["sessions"])
        dtl = dtl or s_dtl
        fo = fo or s_fo
    return dtl, fo


def find_kinovea_instance_pid(instance_name: str) -> int | None:
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if (p.info["name"] or "").lower() != "kinovea.exe":
                continue
            cmd = p.info["cmdline"] or []
            for i, arg in enumerate(cmd):
                if arg.lower() == "-name" and i + 1 < len(cmd) and cmd[i + 1].lower() == instance_name.lower():
                    return p.info["pid"]
        except psutil.Error:
            pass
    return None


def find_window_for_pid(pid: int, title_re: str | None = None, include_minimized: bool = False) -> int | None:
    import win32gui
    import win32process
    rx = re.compile(title_re, re.I) if title_re else None
    candidates = []

    def cb(h, _):
        try:
            vis = win32gui.IsWindowVisible(h)
            iconic = win32gui.IsIconic(h)
            if not vis and not (include_minimized and iconic):
                return True
            t = win32gui.GetWindowText(h) or ""
            if not t:
                return True
            if rx and not rx.search(t):
                return True
            _, wpid = win32process.GetWindowThreadProcessId(h)
            if wpid == pid:
                l, tp, r, b = win32gui.GetWindowRect(h)
                area = max(0, r - l) * max(0, b - tp)
                is_kinovea_main = 1 if t.lower().startswith("kinovea") else 0
                candidates.append((is_kinovea_main, 1 if vis else 0, area, h))
        except Exception:
            pass
        try:
            ctypes.windll.kernel32.SetLastError(0)
        except Exception:
            pass
        return True

    try:
        ctypes.windll.kernel32.SetLastError(0)
        win32gui.EnumWindows(cb, None)
    except Exception:
        pass
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    return candidates[0][3]


class _COPYDATASTRUCT(ctypes.Structure):
    _fields_ = [
        ("dwData", ctypes.c_size_t),
        ("cbData", ctypes.c_uint32),
        ("lpData", ctypes.c_void_p),
    ]


_USER32_SMT = None


def _get_send_message_timeout():
    global _USER32_SMT
    if _USER32_SMT is None:
        u32 = ctypes.WinDLL("user32", use_last_error=True)
        u32.SendMessageTimeoutW.argtypes = [
            ctypes.wintypes.HWND,
            ctypes.wintypes.UINT,
            ctypes.wintypes.WPARAM,
            ctypes.c_void_p,
            ctypes.wintypes.UINT,
            ctypes.wintypes.UINT,
            ctypes.POINTER(ctypes.c_size_t),
        ]
        u32.SendMessageTimeoutW.restype = ctypes.c_size_t
        _USER32_SMT = u32.SendMessageTimeoutW
    return _USER32_SMT


def _resolve_kinovea_hwnd(target) -> int | None:
    if isinstance(target, int):
        return target
    if isinstance(target, str):
        pid = find_kinovea_instance_pid(target)
        if pid:
            hwnd = find_window_for_pid(pid, title_re=r"^Kinovea", include_minimized=True)
            if hwnd:
                return hwnd
        return WindowSpec(target)._find()
    return None


def kinovea_send_command(target, command: str) -> bool:
    """Send WM_COPYDATA external command ('Kinovea:<Handler>.<Command>') without stealing focus."""
    hwnd = _resolve_kinovea_hwnd(target)
    if not hwnd:
        return False
    payload = f"Kinovea:{command}\0".encode("utf-16-le")
    buf = ctypes.create_string_buffer(payload)
    cds = _COPYDATASTRUCT(0, len(payload), ctypes.cast(buf, ctypes.c_void_p))
    res = ctypes.c_size_t()
    ok = _get_send_message_timeout()(
        hwnd, 0x004A, 0, ctypes.byref(cds), 0x0002, 2000, ctypes.byref(res)
    )
    return bool(ok)


def _close_kinovea_pid(pid: int) -> None:
    """Close a Kinovea instance gracefully via WM_CLOSE before falling back to terminate/kill."""
    p = None
    try:
        p = psutil.Process(pid)
    except psutil.Error:
        return
    hwnd = find_window_for_pid(pid, title_re=r"^Kinovea", include_minimized=True)
    if hwnd:
        try:
            res = ctypes.c_size_t()
            _get_send_message_timeout()(hwnd, 0x0010, 0, None, 0x0002, 1500, ctypes.byref(res))  # WM_CLOSE
            p.wait(timeout=3.0)
            return
        except Exception:
            pass
    forced = False
    try:
        p.terminate()
        p.wait(timeout=3.0)
        forced = True
    except Exception:
        forced = True
        try:
            p.kill()
        except Exception:
            pass
    if forced:
        kdir = _kinovea_appdata_dir()
        if kdir:
            temp_dir = kdir / "Temp"
            if temp_dir.exists():
                for item in list(temp_dir.iterdir()):
                    try:
                        if item.is_dir():
                            shutil.rmtree(item, ignore_errors=False)
                        else:
                            item.unlink()
                    except OSError:
                        pass


def launch_kinovea_instance(cfg, name: str, workspace_xml: Path, force_reload: bool = False) -> int | None:
    """Ensure a named Kinovea instance is running with the specified workspace XML."""
    vcfg = cfg.get("video", {})
    exe = Path(vcfg.get("kinovea_exe", r"C:\Program Files\Kinovea\Kinovea.exe"))
    if not exe.exists():
        LOG.error("Kinovea.exe not found at %s", exe)
        return None
    existing_pid = find_kinovea_instance_pid(name)
    if existing_pid and not force_reload:
        return existing_pid
    if existing_pid and force_reload:
        _close_kinovea_pid(existing_pid)
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    args = [str(exe), "-name", name, "-workspace", str(workspace_xml), "-hideExplorer", "-stretch"]
    try:
        proc = subprocess.Popen(args, cwd=str(exe.parent), creationflags=flags)
        return proc.pid
    except OSError as e:
        LOG.error("Failed to start Kinovea (%s): %s", name, e)
        return None


def get_primary_work_area() -> tuple[int, int, int, int]:
    import win32api
    hmon = win32api.MonitorFromPoint((0, 0), 1)  # MONITOR_DEFAULTTOPRIMARY
    return win32api.GetMonitorInfo(hmon)["Work"]


def _iter_mp4_atoms(buf: bytes, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        size = struct.unpack(">I", buf[pos:pos + 4])[0]
        atom_type = buf[pos + 4:pos + 8]
        header = 8
        if size == 1:
            if pos + 16 > end:
                break
            size = struct.unpack(">Q", buf[pos + 8:pos + 16])[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end:
            break
        yield atom_type, pos + header, pos + size
        pos += size


def read_mp4_dimensions(path: Path | None) -> tuple[int, int]:
    """Read (width, height) pixels from an MP4 file's `moov/trak/tkhd` atom; fallback to (540, 960)."""
    fallback = (540, 960)
    if not path or not path.exists():
        return fallback
    try:
        file_size = path.stat().st_size
        with path.open("rb") as fh:
            pos = 0
            while pos + 8 <= file_size:
                fh.seek(pos)
                hdr = fh.read(16)
                if len(hdr) < 8:
                    break
                size = struct.unpack(">I", hdr[0:4])[0]
                atom_type = hdr[4:8]
                header_len = 8
                if size == 1 and len(hdr) == 16:
                    size = struct.unpack(">Q", hdr[8:16])[0]
                    header_len = 16
                elif size == 0:
                    size = file_size - pos
                if size < header_len:
                    break
                if atom_type == b"moov" and size <= 16 * 1024 * 1024:
                    fh.seek(pos + header_len)
                    moov_data = fh.read(size - header_len)
                    for t_type, t_s, t_e in _iter_mp4_atoms(moov_data, 0, len(moov_data)):
                        if t_type != b"trak":
                            continue
                        for c_type, c_s, c_e in _iter_mp4_atoms(moov_data, t_s, t_e):
                            if c_type != b"tkhd" or c_e - c_s < 84:
                                continue
                            ver = moov_data[c_s]
                            off = c_s + (52 if ver == 1 else 40)
                            if off + 44 > c_e:
                                continue
                            a, b, _, c, d = struct.unpack(">5i", moov_data[off:off + 20])
                            w_raw, h_raw = struct.unpack(">II", moov_data[off + 36:off + 44])
                            w, h = int(round(w_raw / 65536.0)), int(round(h_raw / 65536.0))
                            if w > 0 and h > 0:
                                if a == 0 and d == 0 and b != 0 and c != 0:
                                    return h, w
                                return w, h
                    break
                pos += size
    except Exception:
        pass
    return fallback


def default_swing_lines_template() -> dict:
    """Default normalized (0..1) golf coaching lines for DTL and FO cameras."""
    return {
        "dtl": {
            "ball": [0.68, 0.78],
            "length_norm": 0.42,
            "handedness": "right",
            "angles_deg": {"Driver": 48.0, "Iron": 60.0, "Wedge": 64.0},
            "shoulder_offset_deg": 8.0,
            "tush_line": {"start": [0.24, 0.34], "end": [0.24, 0.80]},
            "spine_head": {"start": [0.26, 0.44], "end": [0.42, 0.23]},
            "dtl_by_club": {},
        },
        "fo": {
            "ball": [0.50, 0.80],
            "head_circle": {"center": [0.48, 0.25], "radius_norm": 0.055},
            "lead_hip_wall": {"start": [0.38, 0.40], "end": [0.38, 0.84]},
            "trail_hip_wall": {"start": [0.60, 0.40], "end": [0.60, 0.84]},
            "ball_line": {"start": [0.50, 0.80], "end": [0.50, 0.32]},
        },
    }


def _swing_lines_template_path(cfg: dict) -> Path:
    layout = ensure_swings_layout(cfg)
    return layout["workspaces"] / "swing_lines_template.json"


def load_swing_lines_template(cfg: dict) -> dict:
    tpl = default_swing_lines_template()
    p = _swing_lines_template_path(cfg)
    if p.exists():
        try:
            saved = json.loads(p.read_text(encoding="utf-8"))
            for side in ("dtl", "fo"):
                if isinstance(saved.get(side), dict):
                    tpl[side].update(saved[side])
        except Exception as e:
            LOG.debug("load_swing_lines_template: %s", e)
    sl_cfg = cfg.get("video", {}).get("swing_lines", {})
    if isinstance(sl_cfg.get("dtl_plane_angles_deg"), dict):
        for k, v in sl_cfg["dtl_plane_angles_deg"].items():
            tpl["dtl"]["angles_deg"][k] = float(v)
    if sl_cfg.get("shoulder_plane_offset_deg") is not None:
        tpl["dtl"]["shoulder_offset_deg"] = float(sl_cfg["shoulder_plane_offset_deg"])
    if sl_cfg.get("handedness"):
        tpl["dtl"]["handedness"] = str(sl_cfg["handedness"]).lower()
    return tpl


def save_swing_lines_template(cfg: dict, data: dict) -> Path:
    p = _swing_lines_template_path(cfg)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return p


def detect_ball_in_mp4(video_path: Path | None, roi_norm: tuple[float, float, float, float]) -> tuple[float, float] | None:
    """Best-effort Frame-0 golf ball detector using OpenCV if installed; returns normalized (x, y) or None."""
    if not video_path or not video_path.exists():
        return None
    try:
        import cv2
    except ImportError:
        return None
    cap = None
    try:
        cap = cv2.VideoCapture(str(video_path))
        ok, frame = cap.read()
        if not ok or frame is None:
            return None
        h, w = frame.shape[:2]
        x0 = max(0, min(w - 1, int(roi_norm[0] * w)))
        y0 = max(0, min(h - 1, int(roi_norm[1] * h)))
        x1 = max(x0 + 1, min(w, int(roi_norm[2] * w)))
        y1 = max(y0 + 1, min(h, int(roi_norm[3] * h)))
        crop = frame[y0:y1, x0:x1]
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, (0, 0, 200), (180, 65, 255))
        num_labels, _, stats, centroids = cv2.connectedComponentsWithStats(mask)
        min_area = max(6, int((w * h) * 0.000015))
        max_area = max(300, int((w * h) * 0.004))
        best = None
        best_score = -1.0
        for idx in range(1, num_labels):
            area = int(stats[idx, cv2.CC_STAT_AREA])
            bw = int(stats[idx, cv2.CC_STAT_WIDTH])
            bh = int(stats[idx, cv2.CC_STAT_HEIGHT])
            if not (min_area <= area <= max_area) or bw == 0 or bh == 0:
                continue
            aspect = min(bw, bh) / max(bw, bh)
            fill = area / float(bw * bh)
            score = aspect * fill * (1.0 - abs(area - 45) / float(max_area))
            if aspect >= 0.55 and fill >= 0.45 and score > best_score:
                best_score = score
                cx, cy = centroids[idx]
                best = ((x0 + float(cx)) / w, (y0 + float(cy)) / h)
        return best
    except Exception:
        return None
    finally:
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass


def _add_kva_infos_fading(parent: ET.Element) -> None:
    fading = ET.SubElement(parent, "InfosFading")
    for tag, text in (
        ("Enabled", "true"),
        ("UseDefault", "false"),
        ("AlwaysVisible", "true"),
        ("MasterFactor", "1"),
        ("OpaqueFrames", "1"),
        ("Frames", "20"),
    ):
        ET.SubElement(fading, tag).text = text


def trace_swing_path_in_mp4(video_path: Path | None) -> list[tuple[int, int, int]]:
    """Best-effort motion centroid tracer using OpenCV; returns [(x_px, y_px, ts_ms), ...]."""
    if not video_path or not video_path.exists():
        return []
    try:
        import cv2
        import numpy as np
    except ImportError:
        return []
    cap = None
    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 60.0)
        if fps <= 1.0:
            fps = 60.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        step = max(1, total // 24) if total > 24 else 1
        sampled: list[tuple[int, "np.ndarray"]] = []
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if idx % step == 0:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                gray = cv2.GaussianBlur(gray, (5, 5), 0)
                sampled.append((idx, gray))
                if len(sampled) >= 24 and total <= 0:
                    break
            idx += 1
        if len(sampled) < 4:
            return []
        total_px = float(sampled[0][1].shape[0] * sampled[0][1].shape[1])
        pts: list[tuple[int, int, int]] = []
        for i in range(1, len(sampled)):
            f_idx, cur = sampled[i]
            _, prev = sampled[i - 1]
            diff = cv2.absdiff(cur, prev)
            active = diff >= 18
            count = int(np.count_nonzero(active))
            if count < 12 or count > int(total_px * 0.35):
                continue
            weights = np.where(active, diff.astype(np.float32) * (0.4 + 0.6 * (cur.astype(np.float32) / 255.0)), 0.0)
            wsum = float(weights.sum())
            if wsum <= 0.0:
                continue
            ys, xs = np.nonzero(active)
            w_act = weights[ys, xs]
            cx = int(round(float((xs * w_act).sum() / wsum)))
            cy = int(round(float((ys * w_act).sum() / wsum)))
            ts_ms = int(round((f_idx * 1000.0) / fps))
            pts.append((cx, cy, ts_ms))
        return pts if len(pts) >= 3 else []
    except Exception:
        return []
    finally:
        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass


def _add_kva_track(
    kva: ET.Element,
    name: str,
    points: list[tuple[int, int, int]],
    color: str = "255;168;85;247",
) -> None:
    if len(points) < 3:
        return
    tracks = kva.find("Tracks")
    if tracks is None:
        tracks = ET.SubElement(kva, "Tracks")
    track = ET.SubElement(tracks, "Track", {"id": str(uuid.uuid4()), "name": name})
    ET.SubElement(track, "TimePosition").text = str(int(points[0][2]))
    ET.SubElement(track, "Visible").text = "-1"
    ET.SubElement(track, "Invisible").text = "-1"
    ET.SubElement(track, "ExtraData").text = "None"
    ET.SubElement(track, "Marker").text = "Circle"
    tpl = ET.SubElement(track, "TrackPointList", {"Count": str(len(points))})
    for px, py, ts_ms in points:
        ET.SubElement(tpl, "TrackPoint").text = f"{int(px)};{int(py)};{int(ts_ms)}"
    ml = ET.SubElement(track, "MainLabel", {"Text": name})
    ET.SubElement(ml, "SpacePosition").text = f"{int(points[0][0])};{int(points[0][1])}"
    ET.SubElement(ml, "TimePosition").text = str(int(points[0][2]))
    ET.SubElement(track, "KeyframeLabelList", {"Count": "0"})
    for tag, val in (
        ("SeeFuture", "true"),
        ("ShowTrackLabel", "false"),
        ("ShowKeyframeLabels", "false"),
        ("UseKeyframeColors", "false"),
        ("IsInteractiveTrack", "false"),
        ("ShowRotationCircle", "false"),
    ):
        ET.SubElement(track, tag).text = val
    ds = ET.SubElement(track, "DrawingStyle")
    ET.SubElement(ET.SubElement(ds, "Color", {"Key": "color"}), "Value").text = color
    ET.SubElement(ET.SubElement(ds, "LineSize", {"Key": "line size"}), "Value").text = "3"
    ET.SubElement(ET.SubElement(ds, "LineShape", {"Key": "line shape"}), "Value").text = "Solid"


def _add_kva_line(
    drawings: ET.Element,
    name: str,
    start: tuple[int, int],
    end: tuple[int, int],
    color: str,
    size: int = 3,
    shape: str = "Solid",
) -> None:
    line = ET.SubElement(drawings, "Line", {"id": str(uuid.uuid4()), "name": name})
    ET.SubElement(line, "Start").text = f"{int(round(start[0]))};{int(round(start[1]))}"
    ET.SubElement(line, "End").text = f"{int(round(end[0]))};{int(round(end[1]))}"
    ET.SubElement(line, "ExtraData").text = "None"
    ml = ET.SubElement(line, "MeasureLabel")
    ET.SubElement(ml, "SpacePosition").text = f"{int(round(start[0]))};{int(round(start[1]))}"
    ET.SubElement(ml, "TimePosition").text = "0"
    ds = ET.SubElement(line, "DrawingStyle")
    ET.SubElement(ET.SubElement(ds, "Color", {"Key": "color"}), "Value").text = color
    ET.SubElement(ET.SubElement(ds, "LineSize", {"Key": "line size"}), "Value").text = str(size)
    ET.SubElement(ET.SubElement(ds, "LineShape", {"Key": "line shape"}), "Value").text = shape
    ET.SubElement(ET.SubElement(ds, "Arrows", {"Key": "arrows"}), "Value").text = "None"
    _add_kva_infos_fading(line)


def _add_kva_circle(
    drawings: ET.Element,
    name: str,
    center: tuple[int, int],
    radius: int,
    color: str,
    size: int = 3,
    shape: str = "Solid",
) -> None:
    circ = ET.SubElement(drawings, "Circle", {"id": str(uuid.uuid4()), "name": name})
    ET.SubElement(circ, "Origin").text = f"{int(round(center[0]))};{int(round(center[1]))}"
    ET.SubElement(circ, "Radius").text = str(max(8, int(round(radius))))
    ET.SubElement(circ, "ExtraData").text = "None"
    ml = ET.SubElement(circ, "MeasureLabel")
    ET.SubElement(ml, "SpacePosition").text = f"{int(round(center[0]))};{int(round(center[1]))}"
    ET.SubElement(ml, "TimePosition").text = "0"
    ds = ET.SubElement(circ, "DrawingStyle")
    ET.SubElement(ET.SubElement(ds, "Color", {"Key": "color"}), "Value").text = color
    ET.SubElement(ET.SubElement(ds, "PenSize", {"Key": "pen size"}), "Value").text = str(size)
    ET.SubElement(ET.SubElement(ds, "PenShape", {"Key": "pen shape"}), "Value").text = shape
    _add_kva_infos_fading(circ)


def _norm_pt_to_px(pt: list[float] | tuple[float, float], w: int, h: int) -> tuple[int, int]:
    return (int(round(float(pt[0]) * w)), int(round(float(pt[1]) * h)))


def _compute_plane_endpoint(
    ball_px: tuple[float, float],
    angle_deg: float,
    length_px: float,
    w: int,
    h: int,
    handedness: str = "right",
) -> tuple[int, int]:
    rad = math.radians(max(15.0, min(85.0, angle_deg)))
    sign = 1.0 if handedness == "left" else -1.0
    dx = sign * length_px * math.cos(rad)
    dy = -length_px * math.sin(rad)
    ex = max(16.0, min(float(w - 16), ball_px[0] + dx))
    ey = max(16.0, min(float(h - 16), ball_px[1] + dy))
    return (int(round(ex)), int(round(ey)))


def build_swing_kva_xml(angle: str, club: str | None, cfg: dict, video_path: Path | None = None) -> str:
    """Build KVA 2.0 XML containing always-visible, draggable DTL or FO golf swing lines."""
    angle_u = angle.upper()
    cat = club_category(club)
    w, h = read_mp4_dimensions(video_path)
    tpl = load_swing_lines_template(cfg)
    sl_cfg = cfg.get("video", {}).get("swing_lines", {})
    auto_ball = bool(sl_cfg.get("auto_detect_ball", True))

    kva = ET.Element("KinoveaVideoAnalysis")
    ET.SubElement(kva, "FormatVersion").text = "2.0"
    ET.SubElement(kva, "Producer").text = "SimWatch"
    if video_path:
        ET.SubElement(kva, "OriginalFilename").text = video_path.name
    ET.SubElement(kva, "ImageSize").text = f"{w};{h}"
    kfs = ET.SubElement(kva, "Keyframes")
    kf = ET.SubElement(kfs, "Keyframe")
    ET.SubElement(kf, "Position").text = "0"
    ET.SubElement(kf, "Title").text = f"Address ({cat})"
    drawings = ET.SubElement(kf, "Drawings")

    if angle_u == "FO":
        fo = tpl["fo"]
        det = detect_ball_in_mp4(video_path, (0.35, 0.70, 0.68, 0.95)) if auto_ball else None
        bx, by = det if det else tuple(fo["ball"])
        if det:
            ball_start = _norm_pt_to_px([bx, by], w, h)
            orig_top = _norm_pt_to_px(fo["ball_line"]["end"], w, h)
            ball_end = (ball_start[0], orig_top[1])
        else:
            ball_start = _norm_pt_to_px(fo["ball_line"]["start"], w, h)
            ball_end = _norm_pt_to_px(fo["ball_line"]["end"], w, h)

        hc = fo["head_circle"]
        _add_kva_circle(
            drawings, "Head Box", _norm_pt_to_px(hc["center"], w, h),
            int(round(float(hc["radius_norm"]) * h)), "255;250;204;21", size=3, shape="Solid",
        )
        _add_kva_line(
            drawings, "Lead Hip Wall",
            _norm_pt_to_px(fo["lead_hip_wall"]["start"], w, h),
            _norm_pt_to_px(fo["lead_hip_wall"]["end"], w, h),
            "255;16;185;129", size=3, shape="Solid",
        )
        _add_kva_line(
            drawings, "Trail Hip Wall",
            _norm_pt_to_px(fo["trail_hip_wall"]["start"], w, h),
            _norm_pt_to_px(fo["trail_hip_wall"]["end"], w, h),
            "255;239;68;68", size=3, shape="Dash",
        )
        _add_kva_line(drawings, "Ball Line", ball_start, ball_end, "255;56;189;248", size=2, shape="Dash")
    else:
        dtl = tpl["dtl"]
        det = detect_ball_in_mp4(video_path, (0.45, 0.62, 0.88, 0.94)) if auto_ball else None
        club_ov = (dtl.get("dtl_by_club") or {}).get(cat) or {}
        if club_ov.get("shaft_plane") and club_ov.get("shoulder_plane"):
            sh_s = _norm_pt_to_px(club_ov["shaft_plane"]["start"], w, h)
            sh_e = _norm_pt_to_px(club_ov["shaft_plane"]["end"], w, h)
            so_s = _norm_pt_to_px(club_ov["shoulder_plane"]["start"], w, h)
            so_e = _norm_pt_to_px(club_ov["shoulder_plane"]["end"], w, h)
            if det:
                dbx, dby = _norm_pt_to_px(det, w, h)
                sh_e = (sh_e[0] + (dbx - sh_s[0]), sh_e[1] + (dby - sh_s[1]))
                sh_s = (dbx, dby)
                so_e = (so_e[0] + (dbx - so_s[0]), so_e[1] + (dby - so_s[1]))
                so_s = (dbx, dby)
        else:
            ball_norm = det if det else tuple(dtl["ball"])
            ball_px = _norm_pt_to_px(ball_norm, w, h)
            length_px = float(dtl.get("length_norm", 0.42)) * h
            shaft_deg = float(dtl.get("angles_deg", {}).get(cat, 60.0))
            shoulder_deg = shaft_deg + float(dtl.get("shoulder_offset_deg", 8.0))
            hand = dtl.get("handedness", "right")
            sh_s, sh_e = ball_px, _compute_plane_endpoint(ball_px, shaft_deg, length_px, w, h, hand)
            so_s, so_e = ball_px, _compute_plane_endpoint(ball_px, shoulder_deg, length_px, w, h, hand)

        _add_kva_line(drawings, "Shaft Plane", sh_s, sh_e, "255;56;189;248", size=3, shape="Solid")
        _add_kva_line(drawings, "Shoulder Plane", so_s, so_e, "255;249;115;22", size=2, shape="Dash")
        _add_kva_line(
            drawings, "Tush Line",
            _norm_pt_to_px(dtl["tush_line"]["start"], w, h),
            _norm_pt_to_px(dtl["tush_line"]["end"], w, h),
            "255;239;68;68", size=3, shape="Dash",
        )
        _add_kva_line(
            drawings, "Spine & Head",
            _norm_pt_to_px(dtl["spine_head"]["start"], w, h),
            _norm_pt_to_px(dtl["spine_head"]["end"], w, h),
            "255;250;204;21", size=2, shape="Solid",
        )

    if video_path and sl_cfg.get("auto_trace_path", True):
        trace_pts = trace_swing_path_in_mp4(video_path)
        if len(trace_pts) >= 3:
            _add_kva_track(kva, "Swing Path Trace", trace_pts, color="255;168;85;247")

    ET.indent(kva, space="  ")
    return '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(kva, encoding="unicode") + "\n"


def write_swing_kva(video_path: Path, angle: str, club: str | None, cfg: dict, overwrite: bool = False) -> Path | None:
    """Write a Kinovea `.kva` sidecar next to `video_path` when swing_lines are enabled."""
    if not cfg.get("video", {}).get("swing_lines", {}).get("enabled", True):
        return None
    if not video_path or not video_path.exists():
        return None
    kva_path = video_path.with_suffix(".kva")
    if kva_path.exists() and not overwrite:
        return kva_path
    xml_text = build_swing_kva_xml(angle, club, cfg, video_path=video_path)
    kva_path.write_text(xml_text, encoding="utf-8")
    return kva_path


def _parse_kva_pair(text: str | None) -> tuple[float, float] | None:
    if not text or ";" not in text:
        return None
    parts = text.strip().split(";")
    try:
        return float(parts[0].replace(",", ".")), float(parts[1].replace(",", "."))
    except (ValueError, IndexError):
        return None


def _latest_kva_for_angle(dirs: list[Path], angle: str) -> Path | None:
    candidates = []
    rx = re.compile(rf"(?:^|[_\-\s/\\]){re.escape(angle)}(?:$|[_\-\s.])", re.I)
    for d in dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.kva"):
            if p.is_file() and (rx.search(p.stem) or p.parent.name.upper() == angle.upper()):
                candidates.append(p)
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def save_lines_template_from_kva(cfg: dict, club_override: str | None = None) -> dict:
    """Extract manually dragged line/circle positions from recent `.kva` files and save as defaults."""
    layout = ensure_swings_layout(cfg)
    tpl = load_swing_lines_template(cfg)
    cat = club_category(club_override)
    search_dirs = [layout["today_dtl"], layout["today_fo"], layout["today"], layout["goto"]]
    updated = {"club_category": cat, "dtl_kva": None, "fo_kva": None, "updated_items": []}

    dtl_kva = _latest_kva_for_angle(search_dirs, "DTL")
    if dtl_kva:
        try:
            root = ET.parse(dtl_kva).getroot()
            img_sz = _parse_kva_pair(root.findtext("ImageSize")) or read_mp4_dimensions(dtl_kva.with_suffix(".mp4"))
            w, h = max(1.0, img_sz[0]), max(1.0, img_sz[1])
            by_name = {}
            for ln in root.findall(".//Drawings/Line"):
                nm = (ln.get("name") or "").strip().lower()
                sp = _parse_kva_pair(ln.findtext("Start"))
                ep = _parse_kva_pair(ln.findtext("End"))
                if sp and ep:
                    by_name[nm] = (sp, ep)
            dtl_tpl = tpl["dtl"]
            club_entry = dtl_tpl.setdefault("dtl_by_club", {}).setdefault(cat, {})
            if "shaft plane" in by_name:
                sp, ep = by_name["shaft plane"]
                dtl_tpl["ball"] = [round(sp[0] / w, 4), round(sp[1] / h, 4)]
                club_entry["shaft_plane"] = {
                    "start": [round(sp[0] / w, 4), round(sp[1] / h, 4)],
                    "end": [round(ep[0] / w, 4), round(ep[1] / h, 4)],
                }
                ang = math.degrees(math.atan2(sp[1] - ep[1], abs(sp[0] - ep[0])))
                if 10.0 <= ang <= 85.0:
                    dtl_tpl["angles_deg"][cat] = round(ang, 1)
                dtl_tpl["handedness"] = "left" if ep[0] > sp[0] else "right"
                updated["updated_items"].append(f"Shaft Plane ({cat})")
            if "shoulder plane" in by_name:
                sp, ep = by_name["shoulder plane"]
                club_entry["shoulder_plane"] = {
                    "start": [round(sp[0] / w, 4), round(sp[1] / h, 4)],
                    "end": [round(ep[0] / w, 4), round(ep[1] / h, 4)],
                }
                if "shaft plane" in by_name:
                    s_ang = math.degrees(math.atan2(sp[1] - ep[1], abs(sp[0] - ep[0])))
                    diff = s_ang - float(dtl_tpl["angles_deg"].get(cat, 60.0))
                    if 1.0 <= diff <= 25.0:
                        dtl_tpl["shoulder_offset_deg"] = round(diff, 1)
                updated["updated_items"].append(f"Shoulder Plane ({cat})")
            if "tush line" in by_name:
                sp, ep = by_name["tush line"]
                dtl_tpl["tush_line"] = {
                    "start": [round(sp[0] / w, 4), round(sp[1] / h, 4)],
                    "end": [round(ep[0] / w, 4), round(ep[1] / h, 4)],
                }
                updated["updated_items"].append("Tush Line")
            if "spine & head" in by_name:
                sp, ep = by_name["spine & head"]
                dtl_tpl["spine_head"] = {
                    "start": [round(sp[0] / w, 4), round(sp[1] / h, 4)],
                    "end": [round(ep[0] / w, 4), round(ep[1] / h, 4)],
                }
                updated["updated_items"].append("Spine & Head")
            updated["dtl_kva"] = str(dtl_kva)
        except Exception as e:
            LOG.warning("Failed reading DTL KVA %s: %s", dtl_kva, e)

    fo_kva = _latest_kva_for_angle(search_dirs, "FO")
    if fo_kva:
        try:
            root = ET.parse(fo_kva).getroot()
            img_sz = _parse_kva_pair(root.findtext("ImageSize")) or read_mp4_dimensions(fo_kva.with_suffix(".mp4"))
            w, h = max(1.0, img_sz[0]), max(1.0, img_sz[1])
            fo_tpl = tpl["fo"]
            for ln in root.findall(".//Drawings/Line"):
                nm = (ln.get("name") or "").strip().lower()
                sp = _parse_kva_pair(ln.findtext("Start"))
                ep = _parse_kva_pair(ln.findtext("End"))
                if not (sp and ep):
                    continue
                norm_seg = {"start": [round(sp[0] / w, 4), round(sp[1] / h, 4)], "end": [round(ep[0] / w, 4), round(ep[1] / h, 4)]}
                if nm == "lead hip wall":
                    fo_tpl["lead_hip_wall"] = norm_seg
                    updated["updated_items"].append("Lead Hip Wall")
                elif nm == "trail hip wall":
                    fo_tpl["trail_hip_wall"] = norm_seg
                    updated["updated_items"].append("Trail Hip Wall")
                elif nm == "ball line":
                    fo_tpl["ball_line"] = norm_seg
                    fo_tpl["ball"] = norm_seg["start"]
                    updated["updated_items"].append("Ball Line")
            for circ in root.findall(".//Drawings/Circle"):
                nm = (circ.get("name") or "").strip().lower()
                ctr = _parse_kva_pair(circ.findtext("Origin"))
                rad_txt = circ.findtext("Radius")
                if nm == "head box" and ctr and rad_txt:
                    fo_tpl["head_circle"] = {
                        "center": [round(ctr[0] / w, 4), round(ctr[1] / h, 4)],
                        "radius_norm": round(float(rad_txt) / h, 4),
                    }
                    updated["updated_items"].append("Head Box")
            updated["fo_kva"] = str(fo_kva)
        except Exception as e:
            LOG.warning("Failed reading FO KVA %s: %s", fo_kva, e)

    if updated["updated_items"]:
        tpl_path = save_swing_lines_template(cfg, tpl)
        updated["template_path"] = str(tpl_path)
        LOG.info("Saved swing line template (%s): %s", ", ".join(updated["updated_items"]), tpl_path)
    return updated


def install_kinovea_custom_golf_tools(cfg: dict) -> list[Path]:
    """Write linked Custom Kinovea Posture tools (Golf_DTL_VPlane.xml & Golf_FO_Box.xml)."""
    layout = ensure_swings_layout(cfg)
    targets = [layout["workspaces"] / "CustomTools"]
    kdir = _kinovea_appdata_dir()
    if kdir:
        targets.append(kdir / "DrawingTools" / "Custom")

    dtl_tool_xml = """<?xml version="1.0" encoding="utf-8"?>
<KinoveaPostureTool>
  <FormatVersion>1.1</FormatVersion>
  <Id>8b4a6f20-4c91-4d7c-9e2a-110203040501</Id>
  <Name>Golf DTL V-Plane</Name>
  <DisplayName>Golf DTL V-Plane (Ball-Anchored)</DisplayName>
  <Points>
    <Point name="Ball Anchor" value="350;460" color="#38bdf8" />
    <Point name="Shaft Plane Top" value="170;150" color="#38bdf8" />
    <Point name="Shoulder Plane Top" value="230;120" color="#f97316" />
  </Points>
  <Segments>
    <Segment name="Shaft Plane" point1="0" point2="1" style="Solid" width="3" color="#38bdf8" />
    <Segment name="Shoulder Plane" point1="0" point2="2" style="Dash" width="2" color="#f97316" />
  </Segments>
  <Handles>
    <Handle type="Point" reference="0" trackable="true" />
    <Handle type="Point" reference="1" trackable="true" />
    <Handle type="Point" reference="2" trackable="true" />
  </Handles>
  <HitZone>
    <Polygon points="0;1;2" />
  </HitZone>
  <Capabilities flipHorizontal="true" />
</KinoveaPostureTool>
"""
    fo_tool_xml = """<?xml version="1.0" encoding="utf-8"?>
<KinoveaPostureTool>
  <FormatVersion>1.1</FormatVersion>
  <Id>8b4a6f20-4c91-4d7c-9e2a-110203040502</Id>
  <Name>Golf FO Sway Walls</Name>
  <DisplayName>Golf FO Head &amp; Hip Walls</DisplayName>
  <Points>
    <Point name="Head Center" value="260;180" color="#facc15" />
    <Point name="Lead Hip Top" value="200;260" color="#10b981" />
    <Point name="Lead Hip Bottom" value="200;470" color="#10b981" />
    <Point name="Trail Hip Top" value="320;260" color="#ef4444" />
    <Point name="Trail Hip Bottom" value="320;470" color="#ef4444" />
  </Points>
  <Segments>
    <Segment name="Lead Hip Wall" point1="1" point2="2" style="Solid" width="3" color="#10b981" />
    <Segment name="Trail Hip Wall" point1="3" point2="4" style="Dash" width="3" color="#ef4444" />
  </Segments>
  <Circles>
    <Circle center="0" radius="28" style="Solid" width="3" color="#facc15" />
  </Circles>
  <Handles>
    <Handle type="Point" reference="0" trackable="true" />
    <Handle type="Point" reference="1"><Constraint type="VerticalSlide" /></Handle>
    <Handle type="Point" reference="2"><Constraint type="VerticalSlide" /></Handle>
    <Handle type="Point" reference="3"><Constraint type="VerticalSlide" /></Handle>
    <Handle type="Point" reference="4"><Constraint type="VerticalSlide" /></Handle>
    <Handle type="Segment" reference="0"><Constraint type="HorizontalSlide" /></Handle>
    <Handle type="Segment" reference="1"><Constraint type="HorizontalSlide" /></Handle>
    <Handle type="Ellipse" reference="0" />
  </Handles>
  <HitZone>
    <Polygon points="1;3;4;2" />
  </HitZone>
</KinoveaPostureTool>
"""
    written = []
    for folder in targets:
        try:
            folder.mkdir(parents=True, exist_ok=True)
            for fname, xml_src in (("Golf_DTL_VPlane.xml", dtl_tool_xml), ("Golf_FO_Box.xml", fo_tool_xml)):
                out = folder / fname
                out.write_text(xml_src, encoding="utf-8")
                written.append(out)
        except OSError as e:
            LOG.debug("install_kinovea_custom_golf_tools (%s): %s", folder, e)
    k_exe = Path(cfg.get("video", {}).get("kinovea_exe", r"C:\Program Files\Kinovea\Kinovea.exe"))
    install_custom = k_exe.parent / "DrawingTools" / "Custom"
    if install_custom.parent.exists():
        try:
            install_custom.mkdir(parents=True, exist_ok=True)
            for fname, xml_src in (("Golf_DTL_VPlane.xml", dtl_tool_xml), ("Golf_FO_Box.xml", fo_tool_xml)):
                (install_custom / fname).write_text(xml_src, encoding="utf-8")
        except OSError as e:
            LOG.debug("install_kinovea_custom_golf_tools (install_dir): %s", e)
    return written


def apply_swing_lines_to_active_clips(cfg: dict, club: str | None = None, overwrite: bool = False) -> list[Path]:
    """Ensure DTL & FO `.kva` swing-plane sidecars exist on latest session and Go-To clips."""
    layout = ensure_swings_layout(cfg)
    cat = club_category(club)
    written = []
    for angle, folder in (("DTL", layout["today_dtl"]), ("FO", layout["today_fo"])):
        clips = _latest_clips_in(folder, None)
        if clips:
            res = write_swing_kva(clips[0], angle, club, cfg, overwrite=overwrite)
            if res:
                written.append(res)
    for angle in ("DTL", "FO"):
        for clip in _latest_clips_in(layout["goto"] / cat, angle)[:1]:
            res = write_swing_kva(clip, angle, club, cfg, overwrite=overwrite)
            if res:
                written.append(res)
    return written


def setup_video_rig(cfg, ref_name: str | None = None, club: str | None = None,
                    launch: bool = True, reload_ref: bool = False) -> dict:
    """Generate Swing folders, Kinovea workspaces, custom golf tools & optionally launch the 2x2 Kinovea instances."""
    vcfg = cfg.get("video", {})
    layout = ensure_swings_layout(cfg)
    sync_kinovea_instance_prefs(cfg, layout)
    install_kinovea_custom_golf_tools(cfg)
    apply_swing_lines_to_active_clips(cfg, club=club, overwrite=False)

    cap_xml = layout["workspaces"] / "Capture.xml"
    live_xml = layout["workspaces"] / "LiveReplay.xml"
    ref_xml = layout["workspaces"] / "Reference.xml"

    write_kinovea_workspace(cap_xml, [
        {
            "type": "capture",
            "camera_name": vcfg.get("dtl_camera", "DTL"),
            "autostream": True,
            "delay": vcfg.get("pre_trigger_sec", 1.5),
            "delayed_display": True,
        },
        {
            "type": "capture",
            "camera_name": vcfg.get("fo_camera", "FO"),
            "autostream": True,
            "delay": vcfg.get("pre_trigger_sec", 1.5),
            "delayed_display": True,
        },
    ])

    speed = vcfg.get("replay_speed_pct", 50)
    write_kinovea_workspace(live_xml, [
        {
            "type": "playback",
            "full_path": str(layout["today_dtl"] / "*"),
            "autoplay": True,
            "speed": speed,
            "stretch": True,
            "is_watcher": True,
        },
        {
            "type": "playback",
            "full_path": str(layout["today_fo"] / "*"),
            "autoplay": True,
            "speed": speed,
            "stretch": True,
            "is_watcher": True,
        },
    ])

    active_ref = ref_name or vcfg.get("default_reference", "My-Go-To")
    ref_dtl, ref_fo = resolve_reference_clips(cfg, active_ref, club)
    ref_screens = []
    if ref_dtl:
        ref_screens.append({
            "type": "playback", "full_path": str(ref_dtl),
            "autoplay": True, "speed": speed, "stretch": True, "is_watcher": False,
        })
    if ref_fo:
        ref_screens.append({
            "type": "playback", "full_path": str(ref_fo),
            "autoplay": True, "speed": speed, "stretch": True, "is_watcher": False,
        })
    if not ref_screens:
        ref_screens = [
            {"type": "playback", "full_path": str(layout["today_dtl"] / "*"),
             "autoplay": True, "speed": speed, "stretch": True, "is_watcher": True},
            {"type": "playback", "full_path": str(layout["today_fo"] / "*"),
             "autoplay": True, "speed": speed, "stretch": True, "is_watcher": True},
        ]
    write_kinovea_workspace(ref_xml, ref_screens)

    pids = {}
    if launch:
        pids["Capture"] = launch_kinovea_instance(cfg, "Capture", cap_xml)
        pids["LiveReplay"] = launch_kinovea_instance(cfg, "LiveReplay", live_xml)
        pids["Reference"] = launch_kinovea_instance(cfg, "Reference", ref_xml, force_reload=reload_ref)
    return {
        "layout": layout,
        "workspaces": {"Capture": cap_xml, "LiveReplay": live_xml, "Reference": ref_xml},
        "pids": pids,
        "reference": active_ref,
        "ref_clips": (ref_dtl, ref_fo),
    }


def tile_video_windows(cfg, wait_sec: float = 0.0) -> None:
    """Position LiveReplay (top 50%) and Reference (bottom 50%) as a 2x2 grid on the TV."""
    import win32con
    import win32gui
    wl, wt, wr, wb = get_primary_work_area()
    w = wr - wl
    h = wb - wt
    top_h = h // 2
    bot_h = h - top_h

    def _find_inst_hwnd(name: str, deadline: float) -> int | None:
        while True:
            pid = find_kinovea_instance_pid(name)
            if pid:
                hwnd = find_window_for_pid(pid, title_re=r"^Kinovea", include_minimized=True)
                if hwnd:
                    return hwnd
            if time.time() >= deadline:
                return None
            time.sleep(0.3)

    deadline = time.time() + max(0.0, float(wait_sec))

    def move_inst(name: str, x: int, y: int, width: int, height: int, minimize: bool = False):
        hwnd = _find_inst_hwnd(name, deadline)
        if not hwnd:
            return
        if minimize:
            win32gui.ShowWindow(hwnd, win32con.SW_SHOWMINNOACTIVE)
            return
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        win32gui.SetWindowPos(
            hwnd, win32con.HWND_NOTOPMOST, x, y, width, height,
            win32con.SWP_NOACTIVATE | win32con.SWP_SHOWWINDOW,
        )

    has_live_clips = bool(_latest_clips_in(ensure_swings_layout(cfg)["today"]))
    if has_live_clips:
        move_inst("Capture", wl, wt, w, top_h, minimize=True)
        move_inst("LiveReplay", wl, wt, w, top_h)
    else:
        move_inst("LiveReplay", wl, wt, w, top_h)
        move_inst("Capture", wl, wt, w, top_h)
    move_inst("Reference", wl, wt + top_h, w, bot_h)


def _obs_scenes_target_path() -> Path | None:
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    obs_dir = Path(appdata) / "obs-studio"
    if not obs_dir.exists():
        return None
    return obs_dir / "basic" / "scenes" / "SimWatch_PiP.json"


def generate_obs_scene_collection(cfg) -> Path:
    """Write Swings/OBS_SimWatch_SceneCollection.json ready for OBS Scene Collection -> Import."""
    layout = ensure_swings_layout(cfg)
    out = layout["root"] / "OBS_SimWatch_SceneCollection.json"
    src_uuid = str(uuid.uuid4())
    scene_uuid = str(uuid.uuid4())

    doc = {
        "current_scene": "SimWatch DTL + FO PiP",
        "current_program_scene": "SimWatch DTL + FO PiP",
        "scene_order": [{"name": "SimWatch DTL + FO PiP"}],
        "name": "SimWatch PiP",
        "sources": [
            {
                "prev_ver": 536936450,
                "name": "Kinovea LiveReplay Capture",
                "uuid": src_uuid,
                "id": "window_capture",
                "versioned_id": "window_capture",
                "settings": {
                    "window": "Kinovea [LiveReplay]:WindowsForms10.Window.8.app.0:Kinovea.exe",
                    "method": 2,
                    "priority": 0,
                },
                "mixers": 255,
                "sync": 0,
                "flags": 0,
                "volume": 1.0,
                "balance": 0.5,
                "enabled": True,
                "muted": True,
                "push-to-mute": False,
                "push-to-mute-delay": 0,
                "push-to-talk": False,
                "push-to-talk-delay": 0,
                "hotkeys": {},
                "deinterlace_mode": 0,
                "deinterlace_field_order": 0,
                "monitoring_type": 0,
                "private_settings": {},
            },
            {
                "prev_ver": 536936450,
                "name": "SimWatch DTL + FO PiP",
                "uuid": scene_uuid,
                "id": "scene",
                "versioned_id": "scene",
                "settings": {
                    "id_counter": 1,
                    "custom_size": False,
                    "items": [
                        {
                            "name": "Kinovea LiveReplay Capture",
                            "source_uuid": src_uuid,
                            "visible": True,
                            "locked": False,
                            "rot": 0.0,
                            "scale_ref": {"x": 1920.0, "y": 1080.0},
                            "align": 5,
                            "bounds_type": 2,
                            "bounds_align": 0,
                            "bounds_crop": False,
                            "crop_left": 0,
                            "crop_top": 70,
                            "crop_right": 0,
                            "crop_bottom": 55,
                            "id": 1,
                            "group_item_backup": False,
                            "pos": {"x": 0.0, "y": 0.0},
                            "scale": {"x": 1.0, "y": 1.0},
                            "bounds": {"x": 1920.0, "y": 1080.0},
                            "scale_filter": "disable",
                            "blend_method": "default",
                            "blend_type": "normal",
                            "show_transition": {"duration": 0},
                            "hide_transition": {"duration": 0},
                            "private_settings": {},
                        }
                    ],
                },
                "mixers": 0,
                "sync": 0,
                "flags": 0,
                "volume": 1.0,
                "balance": 0.5,
                "enabled": True,
                "muted": False,
                "hotkeys": {},
                "private_settings": {},
            },
        ],
        "transitions": [],
        "saved_projectors": [
            {
                "monitor": -1,
                "name": "SimWatch DTL + FO PiP",
                "type": 2,
            }
        ],
        "preview_locked": False,
        "scaling_enabled": False,
        "resolution": {"x": 1920, "y": 1080},
        "version": 2,
    }
    raw_json = json.dumps(doc, indent=2)
    out.write_text(raw_json, encoding="utf-8")
    obs_dst = _obs_scenes_target_path()
    if obs_dst:
        try:
            obs_dst.parent.mkdir(parents=True, exist_ok=True)
            obs_dst.write_text(raw_json, encoding="utf-8")
        except OSError as e:
            LOG.debug("OBS scenes copy skipped: %s", e)
    return out


def ensure_obs_running(cfg) -> bool:
    """Launch OBS Studio unobtrusively when Projector PiP is enabled and the projector is active."""
    vcfg = cfg.get("video", {})
    if not vcfg.get("projector_pip", {}).get("enabled", True):
        return False
    _, _, projector_on = choose_display(cfg)
    if not projector_on:
        return False
    obs_raw = vcfg.get("obs_exe")
    if not obs_raw:
        return False
    obs_exe = Path(obs_raw)
    if not obs_exe.exists() or find_procs(obs_exe.name):
        return bool(find_procs(obs_exe.name))
    args = [str(obs_exe)]
    obs_dst = _obs_scenes_target_path()
    if obs_dst and obs_dst.exists():
        args.extend(["--collection", "SimWatch PiP", "--scene", "SimWatch DTL + FO PiP"])
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 4  # SW_SHOWNOACTIVATE
    flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    try:
        subprocess.Popen(args, cwd=str(obs_exe.parent), creationflags=flags, startupinfo=si)
        LOG.info("Launched OBS Studio for Projector PiP (%s)", obs_exe.name)
        return True
    except OSError as e:
        LOG.debug("ensure_obs_running: %s", e)
        return False


class ProjectorPiPController:
    """Manages OBS Windowed Projector as an auto-hiding borderless PiP overlay on the projector."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.pinned = False
        self.visible = False
        self.hide_at = 0.0
        self._styled_hwnd = None

    def _pip_cfg(self) -> dict:
        return self.cfg.get("video", {}).get("projector_pip", {})

    def _find_window(self) -> int | None:
        rx = self._pip_cfg().get("window_title_re", r"^Windowed Projector")
        return WindowSpec(rx)._find()

    def _target_rect(self) -> tuple[int, int, int, int] | None:
        _, disp, projector_on = choose_display(self.cfg)
        if not projector_on:
            return None
        pc = self._pip_cfg()
        pw = max(320, int(disp["width"] * pc.get("width_pct", 38) / 100))
        ph = max(180, int(disp["height"] * pc.get("height_pct", 32) / 100))
        m = int(pc.get("margin_px", 24))
        corner = pc.get("corner", "top-right").lower()
        x = disp["left"] + m if "left" in corner else disp["left"] + disp["width"] - pw - m
        y = disp["top"] + m if "top" in corner else disp["top"] + disp["height"] - ph - m
        return x, y, pw, ph

    def _apply_overlay(self, show: bool) -> bool:
        import win32con
        import win32gui

        try:
            hwnd = self._find_window()
            if not hwnd:
                return False
            if not show:
                win32gui.ShowWindow(hwnd, win32con.SW_HIDE)
                self.visible = False
                return True
            rect = self._target_rect()
            if not rect:
                return False
            x, y, w, h = rect
            if self._styled_hwnd != hwnd:
                style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
                new_style = style & ~(win32con.WS_CAPTION | win32con.WS_THICKFRAME | win32con.WS_MINIMIZEBOX | win32con.WS_MAXIMIZEBOX)
                if new_style != style:
                    win32gui.SetWindowLong(hwnd, win32con.GWL_STYLE, new_style)
                self._styled_hwnd = hwnd
            win32gui.SetWindowPos(
                hwnd, win32con.HWND_TOPMOST, x, y, w, h,
                win32con.SWP_NOACTIVATE | win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED,
            )
            self.visible = True
            return True
        except Exception as e:
            LOG.debug("ProjectorPiPController._apply_overlay(%s): %s", show, e)
            return False

    def show_for_shot(self) -> None:
        pc = self._pip_cfg()
        if not pc.get("enabled", True):
            return
        if self._apply_overlay(True):
            if not self.pinned:
                self.hide_at = time.time() + float(pc.get("popup_seconds", 12))
            LOG.info("Projector PiP shown (%s)", "pinned" if self.pinned else f"{pc.get('popup_seconds', 12)}s")

    def toggle_pin(self) -> None:
        if self.visible and self.pinned:
            self.pinned = False
            self._apply_overlay(False)
            LOG.info("Projector PiP unpinned & hidden")
        elif self.visible and not self.pinned:
            self.pinned = True
            self._apply_overlay(True)
            LOG.info("Projector PiP pinned on screen")
        else:
            self.pinned = True
            if self._apply_overlay(True):
                LOG.info("Projector PiP shown & pinned")
            else:
                self.pinned = False
                LOG.warning("Projector PiP window not found or projector is off")

    def tick(self) -> None:
        if self.visible and not self.pinned and self.hide_at and time.time() >= self.hide_at:
            self._apply_overlay(False)
            LOG.info("Projector PiP auto-hidden")

    def status_text(self) -> str:
        if self.visible and self.pinned:
            return "Pinned ON"
        if self.visible:
            rem = max(0, int(self.hide_at - time.time()))
            return f"Auto-Pop ({rem}s)"
        return "Hidden"


_OC_TOP_KEYS = ("ShotNumber", "BallData", "Player", "ShotDataOptions", "DeviceID")


class OpenConnectMonitor:
    """Passively monitors OpenConnect (:921) loopback TCP traffic for shots & club changes."""

    def __init__(self, on_shot, on_club_change):
        self.on_shot = on_shot
        self.on_club_change = on_club_change
        self._stop = threading.Event()
        self._thread = None
        self._last_shot_key = None
        self._last_shot_ts = 0.0
        self._last_club = None
        self._buf = ""
        self._last_seg_key = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="OpenConnectMonitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _handle_json(self, obj: dict) -> None:
        if not isinstance(obj, dict):
            return
        player = obj.get("Player")
        if isinstance(player, dict) and player.get("Club"):
            club = str(player["Club"]).strip()
            if club and club != self._last_club:
                self._last_club = club
                self.on_club_change(club)

        ball = obj.get("BallData")
        opts = obj.get("ShotDataOptions") or {}
        if isinstance(ball, dict):
            speed = float(ball.get("Speed") or 0)
            has_ball = opts.get("ContainsBallData", speed > 0)
            if has_ball and speed > 0:
                shot_num = obj.get("ShotNumber")
                key = (shot_num, round(speed, 1))
                now = time.time()
                if key != self._last_shot_key or (now - self._last_shot_ts) > 2.0:
                    self._last_shot_key = key
                    self._last_shot_ts = now
                    carry = ball.get("CarryDistance") or ball.get("TotalDistance")
                    self.on_shot({
                        "shot_num": shot_num,
                        "club": self._last_club,
                        "ball_speed": speed,
                        "carry": float(carry) if carry is not None else None,
                        "timestamp": now,
                    })

    def _feed_text(self, text: str) -> None:
        self._buf = (self._buf + text)[-32768:]
        dec = json.JSONDecoder()
        while True:
            idx = self._buf.find("{")
            if idx < 0:
                self._buf = ""
                return
            if idx > 0:
                self._buf = self._buf[idx:]
            try:
                obj, end = dec.raw_decode(self._buf)
                self._buf = self._buf[end:]
                self._handle_json(obj)
            except json.JSONDecodeError:
                recovered = False
                search_pos = 1
                while True:
                    pos = self._buf.find("{", search_pos)
                    if pos < 0:
                        break
                    try:
                        obj, end = dec.raw_decode(self._buf[pos:])
                        if isinstance(obj, dict) and any(k in obj for k in _OC_TOP_KEYS):
                            self._buf = self._buf[pos + end:]
                            self._handle_json(obj)
                            recovered = True
                            break
                    except json.JSONDecodeError:
                        pass
                    search_pos = pos + 1
                if recovered:
                    continue
                if len(self._buf) > 4096:
                    next_brace = self._buf.find("{", 1)
                    self._buf = self._buf[next_brace:] if next_brace > 0 else ""
                    continue
                return

    def _run(self) -> None:
        sock = None
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
            sock.bind(("127.0.0.1", 0))
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_HDRINCL, 1)
            sock.ioctl(socket.SIO_RCVALL, socket.RCVALL_ON)
            sock.settimeout(0.5)
            LOG.info("OpenConnect (:921) passive shot monitor active")
        except Exception as e:
            LOG.info("OpenConnect raw monitor unavailable (%s); using Kinovea folder/audio fallback", e)
            if sock:
                try:
                    sock.close()
                except Exception:
                    pass
            return

        try:
            while not self._stop.is_set():
                try:
                    pkt, _ = sock.recvfrom(65535)
                except socket.timeout:
                    continue
                except OSError:
                    break
                if len(pkt) < 20:
                    continue
                ip_hl = (pkt[0] & 0x0F) * 4
                proto = pkt[9]
                if proto != 6 or len(pkt) < ip_hl + 20:
                    continue
                src_port, dst_port, seq = struct.unpack("!HHI", pkt[ip_hl:ip_hl + 8])
                if src_port != GSPRO_PORT and dst_port != GSPRO_PORT:
                    continue
                flags = pkt[ip_hl + 13]
                if (flags & 0x04) or ((flags & 0x02) and not (flags & 0x18)):
                    continue
                tcp_hl = ((pkt[ip_hl + 12] >> 4) & 0x0F) * 4
                if tcp_hl < 20 or ip_hl + tcp_hl > len(pkt):
                    continue
                payload = pkt[ip_hl + tcp_hl:]
                if payload:
                    seg_key = (src_port, dst_port, seq, len(payload))
                    if seg_key == self._last_seg_key:
                        continue
                    self._last_seg_key = seg_key
                    self._feed_text(payload.decode("utf-8", errors="ignore"))
        finally:
            try:
                sock.ioctl(socket.SIO_RCVALL, socket.RCVALL_OFF)
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass


def parse_hotkey(spec: str) -> tuple[int, int] | None:
    """Parse 'Alt+H' / 'Ctrl+Shift+P' / 'F8' into (win32_mods, vk_code)."""
    MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 0x0001, 0x0002, 0x0004, 0x0008, 0x4000
    mods = MOD_NOREPEAT
    parts = [p.strip().upper() for p in spec.split("+") if p.strip()]
    if not parts:
        return None
    key = parts[-1]
    for m in parts[:-1]:
        if m == "ALT":
            mods |= MOD_ALT
        elif m in ("CTRL", "CONTROL"):
            mods |= MOD_CONTROL
        elif m == "SHIFT":
            mods |= MOD_SHIFT
        elif m in ("WIN", "SUPER"):
            mods |= MOD_WIN
    if len(key) == 1 and ("A" <= key <= "Z" or "0" <= key <= "9"):
        return mods, ord(key)
    if key.startswith("F") and key[1:].isdigit():
        num = int(key[1:])
        if 1 <= num <= 24:
            return mods, 0x70 + (num - 1)
    special = {"SPACE": 0x20, "ENTER": 0x0D, "RETURN": 0x0D, "TAB": 0x09, "ESC": 0x1B, "ESCAPE": 0x1B}
    if key in special:
        return mods, special[key]
    return None


class HotkeyOverlayManager:
    """Global Win32 hotkeys + Always-on-Top tkinter Key Mapping & Status HUD."""

    def __init__(self, hotkeys_cfg: dict, callbacks: dict, status_fn):
        self.hotkeys_cfg = hotkeys_cfg
        self.callbacks = callbacks
        self.status_fn = status_fn
        self._stop = threading.Event()
        self._hk_thread = None
        self._hud_thread = None
        self._hud_queue: queue.Queue = queue.Queue()
        self._hk_thread_id = None

    def start(self) -> None:
        self._stop.clear()
        if not self._hk_thread or not self._hk_thread.is_alive():
            self._hk_thread = threading.Thread(target=self._run_hotkeys, name="SimWatchHotkeys", daemon=True)
            self._hk_thread.start()
        if not self._hud_thread or not self._hud_thread.is_alive():
            self._hud_thread = threading.Thread(target=self._run_hud, name="SimWatchHUD", daemon=True)
            self._hud_thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._hk_thread_id:
            try:
                ctypes.windll.user32.PostThreadMessageW(self._hk_thread_id, 0x0012, 0, 0)  # WM_QUIT
            except Exception:
                pass
        self._hud_queue.put("QUIT")

    def toggle_hud(self) -> None:
        self._hud_queue.put("TOGGLE")

    def show_hud(self) -> None:
        self._hud_queue.put("SHOW")

    def _run_hotkeys(self) -> None:
        user32 = ctypes.windll.user32
        self._hk_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        actions = list(self.callbacks.keys())
        registered = []
        hk_id = 1
        for action in actions:
            spec = self.hotkeys_cfg.get(action)
            if not spec:
                continue
            parsed = parse_hotkey(spec)
            if not parsed:
                LOG.warning("Invalid hotkey %s=%r", action, spec)
                continue
            mods, vk = parsed
            if user32.RegisterHotKey(None, hk_id, mods, vk):
                registered.append((hk_id, action))
                hk_id += 1
            else:
                LOG.warning("Could not register hotkey %s (%s)", spec, action)
            # Also bind Ctrl+Alt+<Key> as a non-conflicting fallback for bare Alt+<Key> shortcuts
            if (mods & 0x0001) and not (mods & (0x0002 | 0x0004 | 0x0008)):
                if user32.RegisterHotKey(None, hk_id, mods | 0x0002, vk):
                    registered.append((hk_id, action))
                    hk_id += 1

        msg = ctypes.wintypes.MSG()
        while not self._stop.is_set():
            ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret <= 0:
                break
            if msg.message == 0x0312:  # WM_HOTKEY
                for idx, action in registered:
                    if msg.wParam == idx:
                        try:
                            self.callbacks[action]()
                        except Exception as e:
                            LOG.warning("Hotkey %s error: %s", action, e)
                        break

        for idx, _ in registered:
            try:
                user32.UnregisterHotKey(None, idx)
            except Exception:
                pass

    def _run_hud(self) -> None:
        try:
            import tkinter as tk
        except Exception:
            return
        try:
            root = tk.Tk()
        except Exception:
            return
        root.title("SimWatch Hotkeys")
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", 0.93)
        root.configure(bg="#111827")
        root.withdraw()
        visible = [False]

        frame = tk.Frame(root, bg="#111827", highlightbackground="#38bdf8", highlightthickness=2, padx=16, pady=12)
        frame.pack(fill="both", expand=True)
        tk.Label(
            frame, text="SimWatch Swing & Video Controls",
            fg="#38bdf8", bg="#111827", font=("Segoe UI", 12, "bold"),
        ).pack(anchor="w", pady=(0, 6))

        rows = [
            ("cheatsheet", "Show / Hide this Key Cheat Sheet"),
            ("toggle_pip", "Pin / Unpin OBS Projector PiP Overlay"),
            ("bookmark_goto", "Bookmark Last Swing -> My-Go-To"),
            ("cycle_reference", "Cycle Bottom Reference (Go-To / Pros)"),
            ("trigger_shot", "Manual Trigger Swing Capture + PiP"),
            ("open_folder", "Open Today's Swings Folder"),
            ("open_drills", "Open Golf Drills & Delivery Tracker"),
            ("toggle_lines", "Toggle Kinovea Swing Plane Lines"),
            ("save_lines", "Save Dragged Swing Lines as Default"),
        ]
        for key, desc in rows:
            hk = self.hotkeys_cfg.get(key, "-")
            row = tk.Frame(frame, bg="#111827")
            row.pack(fill="x", pady=2)
            tk.Label(row, text=f"{hk:<10}", fg="#facc15", bg="#1f2937",
                     font=("Consolas", 10, "bold"), padx=6, pady=2).pack(side="left")
            tk.Label(row, text=f"  {desc}", fg="#e5e7eb", bg="#111827",
                     font=("Segoe UI", 10)).pack(side="left")

        status_var = tk.StringVar(value="")
        tk.Label(
            frame, textvariable=status_var, fg="#9ca3af", bg="#111827",
            font=("Segoe UI", 9), justify="left", pady=6,
        ).pack(anchor="w")

        def refresh_status():
            try:
                st = self.status_fn()
                status_var.set(
                    f"Club: {st['club'] or '-'}   |   Reference: {st['reference']}   |   PiP: {st['pip']}\n"
                    f"Last Swing: {st['last_swing'] or 'None yet'}"
                )
            except Exception:
                pass

        def place_top_center():
            root.update_idletasks()
            wl, wt, wr, wb = get_primary_work_area()
            rw, rh = root.winfo_width(), root.winfo_height()
            x = wl + ((wr - wl) - rw) // 2
            y = wt + 36
            root.geometry(f"+{x}+{y}")

        def poll():
            if self._stop.is_set():
                root.destroy()
                return
            try:
                while True:
                    cmd = self._hud_queue.get_nowait()
                    if cmd == "QUIT":
                        root.destroy()
                        return
                    if cmd == "TOGGLE":
                        visible[0] = not visible[0]
                    elif cmd == "SHOW":
                        visible[0] = True
                    if visible[0]:
                        refresh_status()
                        place_top_center()
                        root.deiconify()
                    else:
                        root.withdraw()
            except queue.Empty:
                pass
            if visible[0]:
                refresh_status()
            root.after(150, poll)

        root.after(150, poll)
        root.mainloop()


class SwingSessionManager:
    """Coordinates Kinovea 2x2 grid, OBS Projector PiP, OpenConnect shot triggers, and Swings/ library."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.vcfg = cfg.get("video", {})
        self.current_club: str | None = None
        self.active_reference: str = self.vcfg.get("default_reference", "My-Go-To")
        self.shot_counter = self._init_shot_counter()
        self.last_shot_info: dict | None = None
        self.last_saved_dtl: Path | None = None
        self.last_saved_fo: Path | None = None
        self._stop_capture_at: float = 0.0
        self._known_files: dict[Path, tuple[int, float]] = {}
        self._processed_files: set[Path] = set()
        self._last_batch_ts: float = 0.0
        self._last_batch_angles: set[str] = set()
        self._retiled_on_first_clip = False
        self._lock = threading.RLock()

        self.pip = ProjectorPiPController(cfg)
        self.oc_monitor = OpenConnectMonitor(self._on_openconnect_shot, self._on_club_change)
        self.hotkeys = HotkeyOverlayManager(
            self.vcfg.get("hotkeys", {}),
            {
                "cheatsheet": self._toggle_cheatsheet,
                "toggle_pip": self.pip.toggle_pin,
                "bookmark_goto": self.bookmark_last_swing,
                "cycle_reference": self.cycle_reference,
                "trigger_shot": self.trigger_manual_shot,
                "open_folder": self.open_today_folder,
                "open_drills": self.open_drills_page,
                "toggle_lines": self.toggle_swing_lines,
                "save_lines": self.save_dragged_lines,
            },
            self.get_hud_status,
        )
        self._started = False

    def _init_shot_counter(self) -> int:
        layout = ensure_swings_layout(self.cfg)
        max_n = 0
        for p in layout["today"].glob("*"):
            m = re.match(r"^(\d+)_", p.name)
            if m:
                max_n = max(max_n, int(m.group(1)))
        return max_n

    def start(self, launch_rig: bool = True) -> None:
        if self._started:
            return
        ensure_swings_layout(self.cfg)
        generate_obs_scene_collection(self.cfg)
        if launch_rig:
            setup_video_rig(self.cfg, ref_name=self.active_reference, club=self.current_club, launch=True)
            ensure_obs_running(self.cfg)
            tile_video_windows(self.cfg, wait_sec=6.0)
        else:
            install_kinovea_custom_golf_tools(self.cfg)
            apply_swing_lines_to_active_clips(self.cfg, club=self.current_club, overwrite=False)
        self._snapshot_existing_files()
        self.oc_monitor.start()
        self.hotkeys.start()
        self._started = True
        LOG.info("SwingSessionManager active (ref=%s)", self.active_reference)

    def stop(self) -> None:
        if not self._started:
            return
        self.oc_monitor.stop()
        self.hotkeys.stop()
        self._started = False

    def _snapshot_existing_files(self) -> None:
        for folder in self._watch_folders():
            for p in folder.glob("*"):
                if p.is_file() and p.suffix.lower() in VIDEO_EXTS:
                    try:
                        self._known_files[p] = (p.stat().st_size, time.time())
                        self._processed_files.add(p)
                    except OSError:
                        pass

    def _watch_folders(self) -> list[Path]:
        layout = ensure_swings_layout(self.cfg)
        folders = [layout["today_dtl"], layout["today_fo"]]
        for extra in _read_kinovea_capture_dirs():
            if extra not in folders:
                folders.append(extra)
        return folders

    def _on_club_change(self, club: str) -> None:
        with self._lock:
            prev_cat = club_category(self.current_club)
            self.current_club = club
            new_cat = club_category(club)
            LOG.info("Active club changed -> %s (%s)", club, new_cat)
            if new_cat != prev_cat:
                setup_video_rig(self.cfg, ref_name=self.active_reference, club=club, launch=True, reload_ref=True)
                tile_video_windows(self.cfg, wait_sec=4.0)

    def _on_openconnect_shot(self, info: dict) -> None:
        with self._lock:
            self.last_shot_info = info
        LOG.info(
            "Shot detected on :921 (club=%s, speed=%.1f mph, carry=%s)",
            info.get("club") or "-", info.get("ball_speed") or 0.0, info.get("carry"),
        )
        self.trigger_capture()
        self.pip.show_for_shot()

    def trigger_capture(self) -> None:
        with self._lock:
            now = time.time()
            post_sec = float(self.vcfg.get("post_trigger_sec", 1.5))
            pre_sec = float(self.vcfg.get("pre_trigger_sec", 1.5))
            if self._stop_capture_at > now:
                self._stop_capture_at = now + max(0.5, post_sec)
                LOG.debug("Capture already active; extended stop timer by %.1fs", post_sec)
                return
            if kinovea_send_command("Capture", "CaptureScreen.ToggleRecording"):
                self._stop_capture_at = now + max(0.5, post_sec)
                LOG.info("Triggered Kinovea Capture recording (pre=%.1fs, post=%.1fs)", pre_sec, post_sec)

    def trigger_manual_shot(self) -> None:
        self.trigger_capture()
        self.pip.show_for_shot()

    def _toggle_cheatsheet(self) -> None:
        self.hotkeys.toggle_hud()

    def get_hud_status(self) -> dict:
        with self._lock:
            last = self.last_saved_dtl or self.last_saved_fo
            return {
                "club": self.current_club or "Iron",
                "reference": self.active_reference,
                "pip": self.pip.status_text(),
                "last_swing": last.name if last else None,
            }

    def _infer_angle(self, p: Path) -> str:
        text = f"{p.parent.name}/{p.name}"
        if re.search(r"(?:^|[_\-\s/\\])FO(?:$|[_\-\s.])", text, re.I) or re.search(r"[-_]2\.[^.]+$", p.name):
            return "FO"
        return "DTL"

    def _poll_new_recordings(self) -> None:
        with self._lock:
            now = time.time()
            layout = ensure_swings_layout(self.cfg)
            ready = []
            for folder in self._watch_folders():
                if not folder.exists():
                    continue
                for p in folder.glob("*"):
                    if not p.is_file() or p.suffix.lower() not in VIDEO_EXTS or p in self._processed_files:
                        continue
                    if p in self._known_files:
                        prev_size, first_seen = self._known_files[p]
                        try:
                            cur_size = p.stat().st_size
                        except OSError:
                            continue
                        if cur_size == prev_size and cur_size > 0 and (now - first_seen) >= 0.4:
                            if not re.match(r"^\d{3}_", p.name):
                                ready.append(p)
                        elif cur_size != prev_size:
                            self._known_files[p] = (cur_size, now)
                    else:
                        try:
                            self._known_files[p] = (p.stat().st_size, now)
                        except OSError:
                            pass

            if not ready:
                return
            batch_angles = {self._infer_angle(p) for p in ready}
            # Group DTL + FO files from the same swing under the same shot number even if flushed 1-2s apart.
            if (now - self._last_batch_ts) > 5.0 or (batch_angles & self._last_batch_angles) or self.shot_counter == 0:
                self.shot_counter += 1
                self._last_batch_angles = set(batch_angles)
            else:
                self._last_batch_angles.update(batch_angles)
            self._last_batch_ts = now

            info = self.last_shot_info if (self.last_shot_info and now - self.last_shot_info["timestamp"] < 30) else {}
            club = (info.get("club") or self.current_club or "Swing").replace(" ", "")
            carry_part = f"_{int(round(info['carry']))}y" if info.get("carry") else ""
            speed_part = f"_{int(round(info['ball_speed']))}mph" if info.get("ball_speed") else ""
            lines_on = bool(self.cfg.get("video", {}).get("swing_lines", {}).get("enabled", True))

            for src in ready:
                angle = self._infer_angle(src)
                dest_name = f"{self.shot_counter:03d}_{club}{carry_part}{speed_part}_{angle}{src.suffix.lower()}"
                session_copy = layout["today"] / dest_name
                try:
                    kva_xml = build_swing_kva_xml(angle, club, self.cfg, video_path=src) if lines_on else None
                    if kva_xml and not src.with_suffix(".kva").exists():
                        src.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                    if kva_xml and not session_copy.with_suffix(".kva").exists():
                        session_copy.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                    shutil.copy2(src, session_copy)
                    angle_dir = layout["today_dtl"] if angle == "DTL" else layout["today_fo"]
                    if src.parent.resolve() != angle_dir.resolve():
                        angle_copy = angle_dir / src.name
                        if kva_xml and not angle_copy.with_suffix(".kva").exists():
                            angle_copy.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                        shutil.copy2(src, angle_copy)
                    if angle == "DTL":
                        self.last_saved_dtl = session_copy
                    else:
                        self.last_saved_fo = session_copy
                    LOG.info("Saved swing clip: %s", session_copy)
                except OSError as e:
                    LOG.warning("Failed organizing swing clip %s: %s", src, e)
                self._processed_files.add(src)

            self.pip.show_for_shot()
            if not self._retiled_on_first_clip:
                self._retiled_on_first_clip = True
                tile_video_windows(self.cfg, wait_sec=2.0)

    def bookmark_last_swing(self, club_override: str | None = None) -> tuple[Path | None, Path | None]:
        with self._lock:
            layout = ensure_swings_layout(self.cfg)
            dtl = self.last_saved_dtl or next(iter(_latest_clips_in(layout["sessions"], "DTL")), None)
            fo = self.last_saved_fo or next(iter(_latest_clips_in(layout["sessions"], "FO")), None)
            club = club_override or self.current_club
            if not club:
                for cand in (dtl, fo):
                    if cand:
                        m = re.match(r"^\d{3}_([A-Za-z0-9]+?)_", cand.stem)
                        if m and m.group(1).lower() != "swing":
                            club = m.group(1)
                            break
            club = club or "Iron"
            cat = club_category(club)
            dest_dir = layout["goto"] / cat
            dest_dir.mkdir(parents=True, exist_ok=True)
            saved_dtl = saved_fo = None

            def _copy_bookmark(src_clip: Path, dest_clip: Path, angle: str) -> Path | None:
                for attempt in range(2):
                    try:
                        if src_clip.resolve() != dest_clip.resolve():
                            shutil.copy2(src_clip, dest_clip)
                        break
                    except PermissionError:
                        ref_pid = find_kinovea_instance_pid("Reference")
                        if attempt == 0 and ref_pid:
                            _close_kinovea_pid(ref_pid)
                            time.sleep(0.3)
                            continue
                        LOG.warning("Destination %s is locked; could not overwrite Go-To clip", dest_clip)
                        return None
                    except OSError as e:
                        LOG.warning("Failed bookmarking %s: %s", src_clip, e)
                        return None
                src_kva = src_clip.with_suffix(".kva")
                dest_kva = dest_clip.with_suffix(".kva")
                if src_kva.exists() and src_kva.resolve() != dest_kva.resolve():
                    try:
                        shutil.copy2(src_kva, dest_kva)
                    except OSError:
                        pass
                else:
                    write_swing_kva(dest_clip, angle, club, self.cfg, overwrite=False)
                return dest_clip

            if dtl and dtl.exists():
                saved_dtl = _copy_bookmark(dtl, dest_dir / f"GoTo_{club}_DTL{dtl.suffix.lower()}", "DTL")
            if fo and fo.exists():
                saved_fo = _copy_bookmark(fo, dest_dir / f"GoTo_{club}_FO{fo.suffix.lower()}", "FO")
            if saved_dtl or saved_fo:
                LOG.info("Bookmarked Go-To swing (%s): DTL=%s FO=%s", cat, saved_dtl, saved_fo)
                try:
                    winsound.Beep(880, 110)
                    winsound.Beep(1320, 160)
                except Exception:
                    pass
                if self.active_reference == "My-Go-To" and find_kinovea_instance_pid("Reference"):
                    setup_video_rig(self.cfg, ref_name=self.active_reference, club=club, launch=True, reload_ref=True)
                    tile_video_windows(self.cfg, wait_sec=3.0)
            else:
                LOG.warning("No recent swing clips found to bookmark")
            return saved_dtl, saved_fo

    def set_reference(self, ref_name: str, launch_rig: bool = True) -> None:
        with self._lock:
            self.active_reference = ref_name
            setup_video_rig(self.cfg, ref_name=ref_name, club=self.current_club, launch=launch_rig, reload_ref=launch_rig)
            if launch_rig:
                tile_video_windows(self.cfg, wait_sec=4.0)
            LOG.info("Reference switched -> %s", ref_name)

    def cycle_reference(self) -> None:
        with self._lock:
            choices = ["My-Go-To"] + list(self.vcfg.get("pros", [])) + ["Last-Swing"]
            try:
                idx = (choices.index(self.active_reference) + 1) % len(choices)
            except ValueError:
                idx = 0
            self.set_reference(choices[idx], launch_rig=True)

    def open_today_folder(self) -> None:
        layout = ensure_swings_layout(self.cfg)
        try:
            os.startfile(str(layout["today"]))
        except Exception as e:
            LOG.warning("Could not open folder %s: %s", layout["today"], e)

    def open_drills_page(self) -> None:
        drills_html = HERE / "drills" / "index.html"
        if not drills_html.exists():
            LOG.warning("Drills webpage not found at %s", drills_html)
            return
        try:
            os.startfile(str(drills_html))
        except Exception as e:
            LOG.warning("Could not open drills page %s: %s", drills_html, e)

    def toggle_swing_lines(self) -> None:
        """Ensure active clip `.kva` sidecars exist and toggle drawing visibility in Kinovea."""
        with self._lock:
            written = apply_swing_lines_to_active_clips(self.cfg, club=self.current_club, overwrite=False)
            toggled = []
            for inst in ("LiveReplay", "Reference"):
                if kinovea_send_command(inst, "PlayerScreen.ToggleDrawingsVisibility"):
                    toggled.append(inst)
            LOG.info("Toggled swing lines (new_kva=%d, windows=%s)", len(written), toggled)

    def save_dragged_lines(self) -> dict:
        """Save manually dragged Kinovea line coordinates as the new default template."""
        with self._lock:
            res = save_lines_template_from_kva(self.cfg, club_override=self.current_club)
            if res.get("updated_items"):
                apply_swing_lines_to_active_clips(self.cfg, club=self.current_club, overwrite=True)
                LOG.info(
                    "Saved dragged swing lines template (%s): %s",
                    res.get("club_category"),
                    ", ".join(res["updated_items"]),
                )
                try:
                    winsound.Beep(740, 100)
                    winsound.Beep(988, 150)
                except Exception:
                    pass
            else:
                LOG.warning("No modified .kva swing lines found in Swings folders to save")
            return res

    def tick(self) -> None:
        with self._lock:
            try:
                if self._stop_capture_at and time.time() >= self._stop_capture_at:
                    self._stop_capture_at = 0.0
                    kinovea_send_command("Capture", "CaptureScreen.ToggleRecording")
                self._poll_new_recordings()
                self.pip.tick()
            except Exception as e:
                LOG.debug("SwingSessionManager.tick error: %s", e)


# --------------------------------------------------------------------------- watch / startup

def _sleep_with_video(seconds: float, video_mgr: SwingSessionManager | None) -> None:
    if not video_mgr:
        time.sleep(seconds)
        return
    end = time.time() + seconds
    while time.time() < end:
        video_mgr.tick()
        time.sleep(min(0.5, max(0.05, end - time.time())))


def watch(cfg, initial_grace: bool = False) -> None:
    if not acquire_singleton_lock():
        LOG.warning("Another SimWatch instance is already running; exiting.")
        return

    interval = cfg.get("interval_sec", 5)
    threshold = cfg.get("fail_threshold", 3)
    grace_sec = float(cfg.get("post_recover_grace_sec", 35))
    gate = cfg.get("only_when_running")
    video_enabled = bool(cfg.get("video", {}).get("enabled", False))
    video_mgr = SwingSessionManager(cfg) if video_enabled else None

    fails, level, last_status, gate_running = 0, 0, None, False
    grace_until = (time.time() + grace_sec) if initial_grace else 0.0
    last_cfg_attempt = 0.0
    LOG.info("SimWatch running. Create a file named PAUSE next to this script to pause.")
    try:
        while True:
            paused = (HERE / "PAUSE").exists()
            gate_up = (not gate) or bool(find_procs(gate))
            if paused or not gate_up:
                if video_mgr and not gate_up:
                    video_mgr.stop()
                fails, level, last_status, gate_running = 0, 0, None, False
                time.sleep(interval)
                continue

            if not gate_running:
                gate_running = True
                if "gspro" in cfg["apps_by_key"] and WindowSpec(r"^GSPro Configuration$").exists(timeout=2):
                    LOG.info("GSPro Configuration dialog detected; configuring display and waiting for startup...")
                    last_cfg_attempt = time.time()
                    run_actions(cfg["apps_by_key"]["gspro"], cfg)
                    time.sleep(cfg.get("settle_sec", 15))
                    grace_until = time.time() + grace_sec
                if video_mgr:
                    video_mgr.start(launch_rig=True)

            if "gspro" in cfg["apps_by_key"] and (time.time() - last_cfg_attempt) >= 15.0:
                if WindowSpec(r"^GSPro Configuration$").exists(timeout=0):
                    LOG.info("GSPro Configuration dialog reappeared; configuring display...")
                    last_cfg_attempt = time.time()
                    run_actions(cfg["apps_by_key"]["gspro"], cfg)
                    grace_until = time.time() + grace_sec

            res = evaluate_checks(cfg, verbose=False)
            if res["all_ok"]:
                if not res["any_unknown"] and last_status is not True:
                    LOG.info("All green.")
                enforce_gspro_window_state(cfg)
                suppress_background_focus(cfg)
                fails, level, last_status = 0, 0, True
            elif res["device_ping_failed"]:
                if last_status != "device_offline":
                    LOG.warning("Launch Pro unreachable (off or asleep); waiting for hardware without restarting apps.")
                fails, level, last_status = 0, 0, "device_offline"
            elif res["only_device_failed"] and time.time() < grace_until:
                if last_status != "discovery_grace":
                    LOG.info("Waiting for GameChanger auto-discovery grace period (%ds remaining)...", int(max(0, grace_until - time.time())))
                last_status = "discovery_grace"
            else:
                fails += 1
                last_status = False
                if fails >= threshold:
                    max_needed_level = res["level"] or 0
                    if res["only_device_failed"]:
                        if level == 0:
                            recover(cfg, 0)
                            grace_until = time.time() + grace_sec
                            level = 1
                        else:
                            backoff = cfg.get("giveup_backoff_sec", 300)
                            LOG.warning(
                                "Bridge/GameChanger issue persists while GSPro :9050 is healthy; "
                                f"backing off {backoff}s without restarting GSPro."
                            )
                            _sleep_with_video(backoff, video_mgr)
                            level = 0
                    else:
                        level = max(level, max_needed_level)
                        if level >= len(cfg["recovery"]):
                            alert(
                                "All recovery levels failed. Check the hardware (power, USB, Wi-Fi). "
                                f"Backing off {cfg.get('giveup_backoff_sec', 300)}s."
                            )
                            _sleep_with_video(cfg.get("giveup_backoff_sec", 300), video_mgr)
                            level = 0
                        else:
                            recover(cfg, level)
                            grace_until = time.time() + grace_sec
                            level += 1
                    fails = 0
            _sleep_with_video(interval, video_mgr)
    finally:
        if video_mgr:
            video_mgr.stop()


def wait_until(cfg, check_names, timeout: float) -> bool:
    """Block until the named checks all pass (e.g. Launch Pro on Wi-Fi after boot)."""
    wanted = [c for c in cfg["checks"] if c["name"] in check_names]
    if not wanted:
        return True
    LOG.info("Waiting for: %s", ", ".join(check_names))
    end = time.time() + timeout
    while time.time() < end:
        results = []
        for chk in wanted:
            try:
                results.append(CHECKS[chk["type"]](chk, cfg)[0])
            except Exception:
                results.append(False)
        if all(results):
            LOG.info("Ready.")
            return True
        time.sleep(3)
    alert(f"Still not ready after {int(timeout)}s: {', '.join(check_names)}. Starting anyway.")
    return False


def startup(cfg) -> None:
    """Cold start after a PC reboot: bring the whole chain up in order, then watch it."""
    if not acquire_singleton_lock():
        LOG.warning("Another SimWatch instance is already running; exiting.")
        return
    st = cfg["startup"]
    time.sleep(st.get("boot_delay_sec", 20))
    wait_until(cfg, st.get("wait_for", []), st.get("wait_timeout_sec", 180))
    for key in st["order"]:
        if key == "integrator":
            fsx_disconnect(cfg)
        launch_app(cfg, cfg["apps_by_key"][key], 60)
    time.sleep(cfg.get("settle_sec", 15))
    LOG.info("Startup done:")
    run_checks(cfg)
    watch(cfg, initial_grace=True)


# --------------------------------------------------------------------------- setup helpers

KEYWORDS = ("gspro", "gsp", "foresight", "fsx", "bushnell", "launch", "gamechanger", "changer", "connect", "golf", "kinovea", "obs")


def discover() -> None:
    print("\n== Golf & Video processes ==")
    conns = psutil.net_connections(kind="tcp")
    for p in psutil.process_iter(["pid", "name", "exe"]):
        hay = f"{p.info['name']} {p.info['exe']}".lower()
        if not any(k in hay for k in KEYWORDS):
            continue
        print(f"\n{p.info['name']}  (pid {p.info['pid']})\n  exe: {p.info['exe']}")
        for c in conns:
            if c.pid == p.info["pid"]:
                ra = f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else "-"
                print(f"  tcp {c.laddr.ip}:{c.laddr.port} -> {ra}  {c.status}")
    print("\n== Visible windows ==")
    from pywinauto import Desktop
    for w in Desktop(backend="win32").windows():
        if w.window_text() and w.is_visible():
            print(f"  {w.window_text()!r}")
    print("\nCopy the exe paths, process names and window titles into config.json.")


def dump(title_re: str) -> None:
    spec = wait_window(title_re, 5)
    if not spec:
        sys.exit(f"No window matching /{title_re}/")
    hwnd = spec.wrapper_object()
    print(f"Window {hwnd.window_text()!r} class={hwnd.class_name()!r} rect={hwnd.rectangle()}")
    if hwnd.class_name() == "UnityWndClass":
        print("Unity app: it draws its own UI, so there are no buttons to list. "
              "Use click_at offsets (dx, dy from the window's top-left) in config.json instead.")
        return
    uia_window(spec).print_control_identifiers(depth=6)


def calibrate() -> None:
    import win32api
    import win32gui
    input("Hover the mouse exactly over a GREEN status light, then press Enter... ")
    x, y = win32api.GetCursorPos()
    hwnd = win32gui.GetAncestor(win32gui.WindowFromPoint((x, y)), 2)  # GA_ROOT
    l, t, _, _ = win32gui.GetWindowRect(hwnd)
    dx, dy = x - l, y - t
    rgb = avg_color(capture_window(hwnd), dx, dy)
    title = win32gui.GetWindowText(hwnd)
    print(f"\nWindow: {title!r}   offset ({dx},{dy})   color rgb{rgb}   green={looks_green(rgb)}")
    snippet = {
        "name": "light name here", "type": "indicator",
        "window_title_re": re.escape(title) or ".*", "dx": dx, "dy": dy, "recovery_level": 0,
    }
    print("\nAdd to \"checks\" in config.json:\n" + json.dumps(snippet, indent=2))


def print_hotkey_cheatsheet(cfg: dict) -> None:
    hk = cfg.get("video", {}).get("hotkeys", {})
    print("\n== SimWatch Video & Swing Hotkeys ==")
    print(f"  {hk.get('cheatsheet', 'Alt+H'):<10} -> Show / Hide On-Screen Key Mapping HUD")
    print(f"  {hk.get('toggle_pip', 'Alt+P'):<10} -> Pin / Unpin OBS Projector PiP Overlay")
    print(f"  {hk.get('bookmark_goto', 'Alt+G'):<10} -> Bookmark Last Swing -> Swings/My-Go-To/")
    print(f"  {hk.get('cycle_reference', 'Alt+R'):<10} -> Cycle Reference (My-Go-To / Pros / Last-Swing)")
    print(f"  {hk.get('trigger_shot', 'Alt+C'):<10} -> Trigger Swing Capture + Projector PiP")
    print(f"  {hk.get('open_folder', 'Alt+O'):<10} -> Open Today's Swings Folder in Explorer")
    print(f"  {hk.get('open_drills', 'Alt+D'):<10} -> Open Golf Drills & Daily Delivery Hub")
    print(f"  {hk.get('toggle_lines', 'Alt+L'):<10} -> Toggle Kinovea Swing Plane Lines")
    print(f"  {hk.get('save_lines', 'Alt+Shift+L'):<10} -> Save Dragged Swing Lines as Default")


def cmd_video(cfg: dict) -> None:
    """Standalone TV-only practice mode: Kinovea 2x2 grid + hotkeys + shot/audio watcher."""
    if not acquire_singleton_lock():
        LOG.warning("Another SimWatch instance is already running; exiting.")
        return
    mgr = SwingSessionManager(cfg)
    mgr.start(launch_rig=True)
    print_hotkey_cheatsheet(cfg)
    LOG.info("Standalone video mode running (Ctrl+C to stop).")
    try:
        while True:
            if (HERE / "PAUSE").exists():
                time.sleep(1)
                continue
            mgr.tick()
            time.sleep(0.5)
    except KeyboardInterrupt:
        LOG.info("Stopping standalone video mode.")
    finally:
        mgr.stop()


# --------------------------------------------------------------------------- main

def _configure_logging() -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    try:
        handlers.append(
            RotatingFileHandler(HERE / "simwatch.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        )
    except OSError:
        pass
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Golf sim connection watchdog & Kinovea/OBS swing controller")
    ap.add_argument(
        "command",
        choices=[
            "discover", "dump", "calibrate", "check", "recover", "watch", "startup", "stop",
            "displays", "reconnect", "release-device",
            "video", "bookmark", "reference", "obs-setup", "hotkeys", "drills", "lines", "save-lines",
        ],
    )
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--config", default=str(HERE / "config.json"))
    a = ap.parse_args()

    _configure_logging()

    if a.command == "stop":
        stopped = stop_other_simwatch_instances()
        print(f"Stopped {stopped} running SimWatch background instance(s).")
        return
    if a.command == "drills":
        drills_html = HERE / "drills" / "index.html"
        if not drills_html.exists():
            sys.exit(f"Drills page not found at {drills_html}")
        os.startfile(str(drills_html))
        return
    if a.command == "discover":
        return discover()
    if a.command == "dump":
        return dump(a.arg or ".*")
    if a.command == "calibrate":
        return calibrate()

    cfg = load_config(Path(a.config))
    if a.command == "check":
        run_checks(cfg)
    elif a.command == "recover":
        try:
            level = int(a.arg or 0)
        except ValueError:
            sys.exit(f"Invalid recovery level {a.arg!r} (valid: 0..{len(cfg['recovery']) - 1})")
        if not (0 <= level < len(cfg["recovery"])):
            sys.exit(f"Invalid recovery level {level} (valid: 0..{len(cfg['recovery']) - 1})")
        recover(cfg, level)
    elif a.command == "watch":
        watch(cfg)
    elif a.command == "startup":
        startup(cfg)
    elif a.command == "displays":
        for d in list_displays():
            print(
                f"  {d['device']}  {d['width']}x{d['height']} at ({d['left']},{d['top']})"
                f"{'  [primary]' if d['primary'] else ''}  id={d['id']!r} name={d['name']!r}"
            )
        idx, disp, on = choose_display(cfg)
        print(
            f"\nProjector {'ON' if on else 'off'} -> GSPro would use Display {idx + 1} "
            f"({disp['width']}x{disp['height']}), "
            f"{'windowed' if cfg.get('gspro_display', {}).get('windowed') else 'full screen'}"
        )
    elif a.command == "reconnect":
        (HERE / "PAUSE").write_text("Paused by simwatch reconnect while FSX Pro connects.\n", encoding="utf-8")
        LOG.info("Created PAUSE file so background watchdog lets FSX Pro hold Launch Pro.")
        app = cfg["apps_by_key"]["fs_connector"]
        if not find_procs(app["process"]):
            if not start_app(app):
                return
            wait_window(app["window_title_re"], 60)
            time.sleep(app.get("start_wait_sec", 5))
        fsx_connect(cfg)
        run_checks(cfg)
    elif a.command == "release-device":
        fsx_disconnect(cfg, force_ui=True)
        try:
            (HERE / "PAUSE").unlink(missing_ok=True)
            LOG.info("Removed PAUSE file so GameChanger / watchdog can resume.")
        except OSError:
            pass
        run_checks(cfg)
    elif a.command == "video":
        cmd_video(cfg)
    elif a.command == "bookmark":
        mgr = SwingSessionManager(cfg)
        dtl, fo = mgr.bookmark_last_swing(club_override=a.arg)
        print(f"Bookmarked -> DTL: {dtl}  |  FO: {fo}")
    elif a.command == "reference":
        mgr = SwingSessionManager(cfg)
        target = a.arg or cfg.get("video", {}).get("default_reference", "My-Go-To")
        mgr.set_reference(target, launch_rig=bool(find_kinovea_instance_pid("Reference")))
        print(f"Active reference set to: {target}")
    elif a.command == "obs-setup":
        res = setup_video_rig(cfg, launch=False)
        obs_json = generate_obs_scene_collection(cfg)
        print("\n== SimWatch Swings & OBS Setup Complete ==")
        print(f"  Swings root:       {res['layout']['root']}")
        print(f"  Today's sessions:  {res['layout']['today']}")
        print(f"  My Go-To folder:   {res['layout']['goto']}")
        print(f"  Pro library:       {res['layout']['pros']}")
        print(f"  Kinovea workspaces:{res['layout']['workspaces']}")
        print(f"  OBS scene file:    {obs_json}")
        print("\n3-Step OBS Setup (only needed when using Projector PiP):")
        print(f"  1. Open OBS -> Scene Collection -> Import -> select {obs_json.name}")
        print("  2. Right-click OBS Preview -> Windowed Projector (Preview)")
        print("  3. Run `python simwatch.py startup` (or `watch`) — SimWatch positions & auto-hides the PiP over GSPro!")
    elif a.command == "hotkeys":
        print_hotkey_cheatsheet(cfg)
        mgr = SwingSessionManager(cfg)
        mgr.hotkeys.start()
        mgr.hotkeys.show_hud()
        print("\nShowing Key Mapping HUD (press Ctrl+C to close)...")
        try:
            while True:
                time.sleep(0.5)
        except KeyboardInterrupt:
            mgr.hotkeys.stop()
    elif a.command == "lines":
        mode = (a.arg or "apply").strip().lower()
        if mode not in ("apply", "on", "off", "toggle"):
            sys.exit(f"Invalid lines mode {a.arg!r} (valid: apply, on, off, toggle)")
        layout = ensure_swings_layout(cfg)
        state_path = layout["workspaces"] / "lines_state.json"
        vis_state = True
        if state_path.exists():
            try:
                vis_state = bool(json.loads(state_path.read_text(encoding="utf-8")).get("visible", True))
            except Exception:
                vis_state = True
        if mode in ("apply", "on"):
            tools = install_kinovea_custom_golf_tools(cfg)
            sync_kinovea_instance_prefs(cfg, layout)
            written = apply_swing_lines_to_active_clips(cfg, overwrite=(mode == "apply"))
            if mode == "on" and not vis_state:
                for inst in ("LiveReplay", "Reference"):
                    kinovea_send_command(inst, "PlayerScreen.ToggleDrawingsVisibility")
            vis_state = True
            state_path.write_text(json.dumps({"visible": vis_state}, indent=2), encoding="utf-8")
            print(f"Custom Kinovea golf tools ready ({len(tools)}):")
            for t in tools:
                print(f"  - {t}")
            print(f"Applied swing-plane .kva sidecar(s) ({len(written)}):")
            for p in written:
                print(f"  - {p}")
            if not written:
                print("  (No active session or My-Go-To video clips found yet; new captures will auto-generate .kva lines.)")
        elif mode == "off":
            toggled = []
            if vis_state:
                toggled = [
                    inst for inst in ("LiveReplay", "Reference")
                    if kinovea_send_command(inst, "PlayerScreen.ToggleDrawingsVisibility")
                ]
                vis_state = False
                state_path.write_text(json.dumps({"visible": vis_state}, indent=2), encoding="utf-8")
            print(f"Hid swing lines (sent ToggleDrawingsVisibility to: {toggled or ['already hidden or none running']})")
        else:
            toggled = [
                inst for inst in ("LiveReplay", "Reference")
                if kinovea_send_command(inst, "PlayerScreen.ToggleDrawingsVisibility")
            ]
            vis_state = not vis_state
            state_path.write_text(json.dumps({"visible": vis_state}, indent=2), encoding="utf-8")
            print(f"Sent ToggleDrawingsVisibility to Kinovea window(s): {toggled or ['none running']} (visible={vis_state})")
    elif a.command == "save-lines":
        res = save_lines_template_from_kva(cfg, club_override=a.arg)
        if res.get("updated_items"):
            written = apply_swing_lines_to_active_clips(cfg, club=a.arg, overwrite=True)
            print(f"Saved dragged swing lines for {res.get('club_category')}: {', '.join(res['updated_items'])}")
            print(f"Updated {len(written)} active .kva file(s).")
        else:
            print("No modified .kva swing line files found in Today/Swings or My-Go-To to save.")
            print("Drag lines in Kinovea and save (Ctrl+S), then press Alt+Shift+L or run `python simwatch.py save-lines`.")


if __name__ == "__main__":
    main()
