"""
SimWatch - keeps a Bushnell Launch Pro -> FS connector -> integrator -> GSPro chain alive.

Commands:
  python simwatch.py discover              list golf-related processes, their ports, and open windows
  python simwatch.py dump "<title regex>"  print a window's controls (find button names for auto-clicking)
  python simwatch.py calibrate             hover over a status light, press Enter -> config snippet
  python simwatch.py check                 run every health check once and print results
  python simwatch.py recover [level]       run one recovery level now (default 0)
  python simwatch.py watch                 run forever: check, and escalate recovery on failure
  python simwatch.py startup               after a reboot: launch everything in order, then watch
  python simwatch.py displays              show detected displays and what GSPro would be told to use
  python simwatch.py reconnect             manual/diagnostic: connect FSX Pro's own view to the Launch Pro (wired first, then Wi-Fi)
  python simwatch.py release-device        disconnect FSX Pro from the Launch Pro so GameChanger can reconnect (run after 'reconnect')

Run from an ADMIN terminal if any sim app runs as admin (Windows blocks clicks otherwise).
"""
import argparse
import ctypes
import json
import logging
import re
import socket
import subprocess
import sys
import time
import winsound
from pathlib import Path

import psutil

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # real pixel coords on scaled displays
except Exception:
    pass

HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("simwatch")
GSPRO_PORT = 921


# --------------------------------------------------------------------------- config

def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    cfg["apps_by_key"] = {a["key"]: a for a in cfg["apps"]}
    return cfg


# --------------------------------------------------------------------------- processes

def find_procs(process_name: str):
    target = process_name.lower()
    return [p for p in psutil.process_iter(["name", "exe"]) if (p.info["name"] or "").lower() == target]


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
    subprocess.Popen([str(exe), *app.get("args", [])], cwd=str(exe.parent), creationflags=flags)
    return True


# --------------------------------------------------------------------------- windows / UI

class WindowSpec:
    """Finds a top-level window by title regex using plain Win32 calls.

    Not pywinauto's Desktop lookup, because (1) a UIA desktop scan hangs forever while a Unity app
    (FSX Pro) is running, and (2) its win32 backend reads WinForms titles (GSPconnect) as ''.
    """

    def __init__(self, title_re: str):
        self.rx = re.compile(title_re)

    def _find(self):
        import win32gui
        found = []

        def cb(h, _):
            t = win32gui.GetWindowText(h)
            if t and self.rx.match(t):
                found.append(h)
        win32gui.EnumWindows(cb, None)
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


def click_at(title_re_win: str, dx: int, dy: int) -> bool:
    import pywinauto.mouse as mouse
    spec = wait_window(title_re_win, 10)
    if not spec:
        return False
    w = spec.wrapper_object()
    w.restore() if w.is_minimized() else None
    w.set_focus()
    r = w.rectangle()
    mouse.click(coords=(r.left + dx, r.top + dy))
    LOG.info("  clicked at (%d,%d) in /%s/", dx, dy, title_re_win)
    return True


def capture_window(hwnd):
    """Grab a window's pixels even if another window (e.g. full-screen GSPro) covers it."""
    import win32gui
    import win32ui
    from PIL import Image

    l, t, r, b = win32gui.GetWindowRect(hwnd)
    w, h = r - l, b - t
    hdc = win32gui.GetWindowDC(hwnd)
    mfc = win32ui.CreateDCFromHandle(hdc)
    mem = mfc.CreateCompatibleDC()
    bmp = win32ui.CreateBitmap()
    bmp.CreateCompatibleBitmap(mfc, w, h)
    mem.SelectObject(bmp)
    ctypes.windll.user32.PrintWindow(hwnd, mem.GetSafeHdc(), 2)  # PW_RENDERFULLCONTENT
    info = bmp.GetInfo()
    img = Image.frombuffer("RGB", (info["bmWidth"], info["bmHeight"]),
                           bmp.GetBitmapBits(True), "raw", "BGRX", 0, 1)
    win32gui.DeleteObject(bmp.GetHandle())
    mem.DeleteDC()
    mfc.DeleteDC()
    win32gui.ReleaseDC(hwnd, hdc)
    return img


def avg_color(img, x, y, radius=3):
    px = [img.getpixel((i, j))
          for i in range(max(0, x - radius), min(img.width, x + radius + 1))
          for j in range(max(0, y - radius), min(img.height, y + radius + 1))]
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
        out.append({"device": info["Device"], "left": l, "top": t, "width": r - l, "height": b - t,
                    "primary": bool(info["Flags"] & 1), "id": mon_id, "name": mon_name})
    out.sort(key=lambda d: (not d["primary"], d["device"]))
    return out


def choose_display(cfg):
    """Projector detection. Returns (unity_display_index, display, projector_on).

    Windows only reports a display while the projector is connected and awake, so "an extra display
    exists" means "projector is on". If config.json sets projector.match_regex it must match the
    monitor's PnP id / name (e.g. "BNQ|EPS|OPT") - use that if a second real monitor is ever attached.
    With the projector on, GSPro goes full screen on the leftmost matching display; otherwise Display 1.
    """
    pj = cfg.get("projector", {})
    displays = list_displays()
    rx = pj.get("match_regex")
    cand = [d for d in displays if re.search(rx, f"{d['id']} {d['name']}", re.I)] if rx else (displays if len(displays) > 1 else [])
    if not cand:
        return 0, displays[0], False
    pick = (max if pj.get("side", "left") == "right" else min)(cand, key=lambda d: d["left"])
    return displays.index(pick), pick, True


def gspro_configure(cfg, app) -> bool:
    """Drive Unity's 'GSPro Configuration' launch dialog: monitor, resolution, windowed, then Play!"""
    import win32con
    import win32gui
    from pywinauto.controls.win32_controls import ComboBoxWrapper

    spec = wait_window(r"^GSPro Configuration$", app.get("start_timeout_sec", 60))
    if not spec:
        LOG.warning("  GSPro Configuration dialog not found (already past it?)")
        return False
    dlg = spec.wrapper_object().handle
    idx, disp, projector_on = choose_display(cfg)
    windowed = bool(cfg.get("gspro_display", {}).get("windowed", False))

    kids = []
    win32gui.EnumChildWindows(dlg, lambda c, _: kids.append(c), None)
    cls = win32gui.GetClassName
    txt = win32gui.GetWindowText
    combos = [c for c in kids if cls(c) == "ComboBox" and win32gui.IsWindowVisible(c)]
    labels = {txt(c): c for c in kids if cls(c) == "Static" and txt(c)}

    def combo_for(label):  # the combo box sitting on the same row as its label
        ly = win32gui.GetWindowRect(labels[label])[1]
        return ComboBoxWrapper(min(combos, key=lambda c: abs(win32gui.GetWindowRect(c)[1] - ly)))

    monitors = combo_for("Select monitor")
    names = monitors.item_texts()
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

    LOG.info("  GSPro display: projector %s -> %s (%dx%d at %d,%d) %s", "ON" if projector_on else "off",
             names[idx], disp["width"], disp["height"], disp["left"], disp["top"],
             "windowed" if windowed else "full screen")
    play = next((c for c in kids if cls(c) == "Button" and txt(c) == "Play!"), None)
    if play is None:
        LOG.error("  Play! button not found in GSPro Configuration")
        return False
    win32gui.SendMessage(play, win32con.BM_CLICK, 0, 0)
    return True


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
# FSX Pro is a Unity app: no controls to query, so we click fixed spots (in a 1366x768 reference frame,
# scaled to the real window) and read pixels. Path: device icon (top-left) -> Settings > Devices -> Search
# -> pick a result tile. Search and Disconnect are the SAME button spot, so never click it blind.

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
    return min(_fsx_rgb(img, (200, 335))) > 235          # "Devices" menu entry drawn selected (white)


def _fsx_button_is_disconnect(img) -> bool:
    r, g, b = _fsx_rgb(img, (760, 640), 2)                # button body (not the white icon/text); dark red = connected
    return r > g * 1.6 and r > b * 1.6 and r < 200


def fsx_tiles(img):
    """[(slot, 'wired'|'wifi')] for each device tile in the search popup."""
    from PIL import ImageChops, ImageStat
    refs = {}
    for kind in ("wired", "wifi"):
        p = ASSETS / f"fsx_icon_{kind}.png"
        if p.exists():
            from PIL import Image
            refs[kind] = Image.open(p).convert("L")
    tiles = []
    for i in range(4):
        dx = FSX_TILE_PITCH * i
        photo = img.crop((443 + dx, 260, 468 + dx, 302)).convert("L")
        if sum(1 for p in photo.tobytes() if p < 90) < 100:      # no launch-monitor photo -> no tile here
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


def fsx_session(cfg):
    """FSX Pro's established TCP session to the launch monitor, if any."""
    port = cfg.get("device", {}).get("port", 9970)
    app = cfg["apps_by_key"]["fs_connector"]
    pids = {p.pid for p in find_procs(app["process"])}
    for c in psutil.net_connections(kind="tcp"):
        if c.pid in pids and c.status == psutil.CONN_ESTABLISHED and c.raddr and c.raddr.port == port:
            return c
    return None


class _FsxWindow:
    def __init__(self, hwnd):
        self.hwnd = hwnd

    def shot(self):
        img = capture_window(self.hwnd)
        return img if img.size == FSX_REF else img.resize(FSX_REF)

    def click(self, pt):
        import win32gui
        import pywinauto.mouse as mouse
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
        if len(img.resize((64, 36)).getcolors(64 * 36) or []) > 50:     # blank/loading frame is one flat color
            return True
        time.sleep(2)
    return False


def fsx_connect_once(cfg) -> str | None:
    """One attempt. Returns 'wired' / 'wifi' when FSX Pro holds a session to the launch monitor, else None."""
    import win32gui
    dev = cfg.get("device", {})
    spec = wait_window(cfg["apps_by_key"]["fs_connector"]["window_title_re"], 30)
    if not spec:
        LOG.warning("  FSX Pro window not found")
        return None
    win = _FsxWindow(spec.wrapper_object().handle)
    prev = win32gui.GetForegroundWindow()
    try:
        s = fsx_session(cfg)
        if s:
            return link_kind(s.laddr.ip)
        if not _fsx_wait_rendered(win):
            LOG.warning("  FSX Pro never finished drawing its first screen")
            return None
        # get onto Settings > Devices (icon sits in a different spot once Settings is open)
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
        # A "Disconnect" button means a device is attached - or was a moment ago and the screen hasn't caught up.
        # Wait for it to settle: either a live session shows up, or the button flips back to "Search".
        for _ in range(8):
            if not _fsx_button_is_disconnect(img):
                break
            s = fsx_session(cfg)
            if s:
                return link_kind(s.laddr.ip)
            time.sleep(2)
            img = win.shot()
        else:
            # FSX Pro's own UI still thinks it's connected (stale internal state after the monitor dropped
            # off and didn't come back, e.g. a long idle/sleep) - clicking Search won't help, it needs a
            # real Disconnect first so FSX Pro tears the old session down and is willing to search again.
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
            time.sleep(3)                          # let the second route (wired + wifi) show up
            tiles = fsx_tiles(win.shot())
        LOG.info("  search found: %s", [k for _, k in tiles] or "nothing")
        order = ["wired"] + (["wifi"] if dev.get("allow_wifi", True) else [])
        for want in order:
            for slot, kind in tiles:
                if kind != want:
                    continue
                LOG.info("  connecting to Launch Pro over %s", want)
                win.click((FSX_TILE0[0] + FSX_TILE_PITCH * slot, FSX_TILE0[1]))
                for _ in range(15):
                    time.sleep(2)
                    s = fsx_session(cfg)
                    if s:
                        if dev.get("close_settings", False):     # FSX Pro greys out "back" once a device is attached
                            win.click(FSX_BACK)
                        return link_kind(s.laddr.ip)
        if not tiles:
            win.click(FSX_SEARCH_CLOSE)
        return None
    finally:
        try:
            if prev and prev != win.hwnd:
                win32gui.SetForegroundWindow(prev)   # hand focus back to GSPro
        except Exception:
            pass


def fsx_connect(cfg) -> bool:
    """Manual diagnostic path (`python simwatch.py reconnect`): wired first, Wi-Fi if that's all there
    is; retry every retry_sec; give up after max_attempts. Not used by automatic recovery - GameChanger
    holds the real device connection during play (see fsx_disconnect), FSX Pro is for setup/testing."""
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
    alert(f"Launch Pro unavailable after {attempts} attempts. Run 'python simwatch.py reconnect' "
          "again once it's back online.")
    return False


def fsx_disconnect(cfg) -> None:
    """Safety net before GameChanger (re)connects: make sure FSX Pro isn't holding the device.

    FSX Pro's own 'Auto connect with solo device' should be turned OFF in its Settings (one-time, by
    hand) so this is normally a no-op. This only catches it being re-enabled, or someone having opened
    FSX Pro's Devices page and connected it manually (e.g. to test/calibrate) and left it that way.
    Best effort: FSX Pro isn't on the critical path, so any failure here is just logged, never raised.
    """
    try:
        app = cfg["apps_by_key"]["fs_connector"]
        if not find_procs(app["process"]):
            return
        spec = wait_window(app["window_title_re"], 3)
        if not spec:
            return
        win = _FsxWindow(spec.wrapper_object().handle)
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


# --------------------------------------------------------------------------- checks

def check_process(chk, cfg):
    app = cfg["apps_by_key"][chk["app"]]
    ok = bool(find_procs(app["process"]))
    return ok, "running" if ok else "not running"


def check_gspro_link(chk, cfg):
    port = chk.get("port", GSPRO_PORT)
    for c in psutil.net_connections(kind="tcp"):
        if c.status == psutil.CONN_ESTABLISHED and (
            (c.laddr and c.laddr.port == port) or (c.raddr and c.raddr.port == port)
        ):
            return True, f"OpenConnect socket :{port} established"
    return False, f"no established connection on :{port}"


def check_device_ping(chk, cfg):
    r = subprocess.run(["ping", "-n", "1", "-w", "1000", chk["ip"]],
                       capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
    ok = r.returncode == 0 and "TTL=" in r.stdout.upper()
    return ok, f"ping {chk['ip']} {'ok' if ok else 'failed'}"


def check_device_tcp(chk, cfg):
    """FS software has a live TCP session to the launch monitor (match by ip and/or port)."""
    app = cfg["apps_by_key"][chk["app"]]
    pids = {p.pid for p in find_procs(app["process"])}
    ip, port = chk.get("ip"), chk.get("port")
    for c in psutil.net_connections(kind="tcp"):
        if (c.pid in pids and c.status == psutil.CONN_ESTABLISHED and c.raddr
                and (not ip or c.raddr.ip == ip) and (not port or c.raddr.port == port)):
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
    """Is the app's window actually pumping messages, not just open.

    A hung window can still hold its sockets ESTABLISHED and keep logging raw network I/O on a
    background thread, while the thread that would actually hand shots to GSPro's engine is deadlocked
    - this is what let GSPconnect sit 'connected' for days without a single shot getting through.
    """
    spec = window_spec(chk["window_title_re"])
    if not spec.exists(timeout=1):
        return False, "window not found"
    hwnd = spec.wrapper_object().handle
    if ctypes.windll.user32.IsHungAppWindow(hwnd):
        return False, "window is not responding (hung)"
    return True, "responding"


def check_usb(chk, cfg):
    ps = f"Get-PnpDevice -PresentOnly -FriendlyName '*{chk['name_like']}*' | Where-Object Status -eq 'OK' | Measure-Object | % Count"
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
    ok = r.stdout.strip() not in ("", "0")
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


def run_checks(cfg, verbose=True):
    """Returns (all_ok, lowest recovery level suggested by the failures)."""
    all_ok, level = True, None
    for chk in cfg["checks"]:
        try:
            ok, msg = CHECKS[chk["type"]](chk, cfg)
        except Exception as e:  # a broken check shouldn't kill the watchdog
            ok, msg = None, f"check error: {e}"
        mark = {True: "OK ", False: "BAD", None: "?? "}[ok]
        if verbose or ok is False:
            LOG.info("[%s] %-22s %s", mark, chk["name"], msg)
        if ok is False:
            all_ok = False
            lvl = chk.get("recovery_level", 0)
            level = lvl if level is None else min(level, lvl)
    return all_ok, level


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
            gspro_configure(cfg, app)
        elif "wait_port" in act:
            wait_port(act["wait_port"], act.get("timeout", 120))
        elif act.get("fsx_connect"):
            fsx_connect(cfg)


def launch_app(cfg, app: dict, default_timeout: float) -> None:
    """Start an app (unless it's already up, e.g. GSPro spawns GSPconnect itself) and run its post-start steps."""
    if find_procs(app["process"]):
        LOG.info("  %s already running", app["key"])
        if app.get("ensure_actions"):
            run_actions(app, cfg, app["ensure_actions"])      # e.g. FSX Pro: make sure the device is attached
        return
    if not start_app(app):
        return
    if app.get("window_title_re"):
        wait_window(app["window_title_re"], app.get("start_timeout_sec", default_timeout))
    time.sleep(app.get("start_wait_sec", 5))
    run_actions(app, cfg)


def recover(cfg, level: int) -> None:
    step = cfg["recovery"][level]
    keys = step.get("restart", [])
    LOG.warning(">>> recovery level %d: %s", level, step["name"])
    if "integrator" in keys:
        fsx_disconnect(cfg)             # safety net: don't let FSX Pro hold the port GameChanger needs
    for key in reversed(keys):          # stop downstream first
        kill_app(cfg["apps_by_key"][key])
    if keys:
        time.sleep(2)
    for key in keys:                    # start in listed order: GSPro (spawns GSPconnect on :921), then GameChanger (owns the device link)
        launch_app(cfg, cfg["apps_by_key"][key], 45)
    time.sleep(cfg.get("settle_sec", 15))


def alert(msg: str) -> None:
    LOG.error("!!! %s", msg)
    for _ in range(3):
        winsound.MessageBeep(winsound.MB_ICONHAND)
        time.sleep(0.4)


def watch(cfg) -> None:
    interval = cfg.get("interval_sec", 5)
    threshold = cfg.get("fail_threshold", 3)
    gate = cfg.get("only_when_running")
    fails, level, last_status = 0, 0, None
    LOG.info("SimWatch running. Create a file named PAUSE next to this script to pause.")
    while True:
        if (HERE / "PAUSE").exists() or (gate and not find_procs(gate)):
            time.sleep(interval)
            continue
        ok, suggested = run_checks(cfg, verbose=False)
        if ok:
            if last_status is not True:
                LOG.info("All green.")
            fails, level, last_status = 0, 0, True
        else:
            fails += 1
            last_status = False
            if fails >= threshold:
                level = max(level, suggested or 0)
                if level >= len(cfg["recovery"]):
                    alert("All recovery levels failed. Check the hardware (power, USB, Wi-Fi). "
                          f"Backing off {cfg.get('giveup_backoff_sec', 300)}s.")
                    time.sleep(cfg.get("giveup_backoff_sec", 300))
                    level = 0
                else:
                    recover(cfg, level)
                    level += 1
                fails = 0
        time.sleep(interval)


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
    st = cfg["startup"]
    time.sleep(st.get("boot_delay_sec", 20))            # let Windows/Wi-Fi/USB settle
    wait_until(cfg, st.get("wait_for", []), st.get("wait_timeout_sec", 180))
    for key in st["order"]:
        launch_app(cfg, cfg["apps_by_key"][key], 60)
    time.sleep(cfg.get("settle_sec", 15))
    LOG.info("Startup done:")
    run_checks(cfg)
    watch(cfg)


# --------------------------------------------------------------------------- setup helpers

KEYWORDS = ("gspro", "gsp", "foresight", "fsx", "bushnell", "launch", "gamechanger", "changer", "connect", "golf")


def discover() -> None:
    print("\n== Golf-related processes ==")
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
    snippet = {"name": "light name here", "type": "indicator",
               "window_title_re": re.escape(title) or ".*", "dx": dx, "dy": dy, "recovery_level": 0}
    print("\nAdd to \"checks\" in config.json:\n" + json.dumps(snippet, indent=2))


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Golf sim connection watchdog")
    ap.add_argument("command", choices=["discover", "dump", "calibrate", "check", "recover", "watch", "startup",
                                        "displays", "reconnect", "release-device"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--config", default=str(HERE / "config.json"))
    a = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S",
        handlers=[logging.StreamHandler(), logging.FileHandler(HERE / "simwatch.log", encoding="utf-8")],
    )

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
        recover(cfg, int(a.arg or 0))
    elif a.command == "watch":
        watch(cfg)
    elif a.command == "startup":
        startup(cfg)
    elif a.command == "displays":
        for d in list_displays():
            print(f"  {d['device']}  {d['width']}x{d['height']} at ({d['left']},{d['top']})"
                  f"{'  [primary]' if d['primary'] else ''}  id={d['id']!r} name={d['name']!r}")
        idx, disp, on = choose_display(cfg)
        print(f"\nProjector {'ON' if on else 'off'} -> GSPro would use Display {idx + 1} "
              f"({disp['width']}x{disp['height']}), {'windowed' if cfg.get('gspro_display', {}).get('windowed') else 'full screen'}")
    elif a.command == "reconnect":
        # Manual/diagnostic: connect FSX Pro's OWN view to the Launch Pro (e.g. to check firmware or
        # calibrate). This is not needed for play - GameChanger connects to the Launch Pro by itself.
        # Doing this WILL take the device away from GameChanger; run fsx_disconnect (or just close FSX
        # Pro) when you're done so GameChanger can reconnect.
        app = cfg["apps_by_key"]["fs_connector"]
        if not find_procs(app["process"]):
            start_app(app)
            wait_window(app["window_title_re"], 60)
            time.sleep(app.get("start_wait_sec", 5))
        fsx_connect(cfg)
        run_checks(cfg)
    elif a.command == "release-device":
        # Run this after a `reconnect` session so GameChanger gets the Launch Pro back.
        fsx_disconnect(cfg)
        run_checks(cfg)


if __name__ == "__main__":
    main()
