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
  python simwatch.py stop                  stop the background SimWatch daemon (clean exit; a second watch/
                                           startup never kills the running one, it just exits)
  python simwatch.py displays              show detected displays and what GSPro would be told to use
  python simwatch.py reconnect             manual/diagnostic: connect FSX Pro's own view to the Launch Pro
  python simwatch.py release-device        disconnect FSX Pro from the Launch Pro so GameChanger can reconnect
  python simwatch.py video [off]           2x2 Kinovea TV grid + OBS PiP + hotkeys (no GSPro needed); if the
                                           watch/startup daemon runs, asks it to start its rig (until `video off`)
  python simwatch.py bookmark [club]       save latest DTL & FO swing clips to Swings/My-Go-To/
  python simwatch.py reference [name]      switch bottom Kinovea reference (My-Go-To or Pro name)
  python simwatch.py obs-setup             create Swings/ layout, Kinovea workspaces & OBS scene collection JSON
  python simwatch.py hotkeys               print hotkey cheat sheet and pop up the on-screen HUD
  python simwatch.py lines [on|off|apply]  apply or toggle Kinovea DTL/FO swing plane lines (.kva)
  python simwatch.py save-lines [club]     save manually dragged Kinovea lines as your default template
  python simwatch.py drills                open the local Golf Drills, Routines & Daily Delivery Hub
  python simwatch.py doctor                validate config + environment; PASS/WARN/FAIL table, exit 1 on FAIL
  python simwatch.py harden [adapter] [--apply]  print (or run, elevated) Launch Pro link/firewall/power hardening
  python simwatch.py discover --write-local      detect app exe paths and write config.local.json
  python simwatch.py bridge [--demo]       run only the shot-data bridge (http://127.0.0.1:8765) + :921 sniffer
  python simwatch.py phone                 print the drills-hub URL for a phone on your Wi-Fi (needs bridge.lan)
  python simwatch.py status                bridge status, today's shots, daemon/video request, log tail
  python simwatch.py clip-ready <file> DTL Kinovea 2025 post-recording command: link + library + replay copy

Run from an ADMIN terminal if any sim app runs as admin (Windows blocks clicks & raw sockets otherwise).
"""
import argparse
import atexit
import ctypes
import functools
import hmac
import http.cookies
import http.server
import ipaddress
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
import queue
import random
import re
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

import psutil

IS_WINDOWS = sys.platform == "win32"

# Windows-only pieces are guarded so `import simwatch` works on macOS/Linux (tests, `doctor`).
try:
    import ctypes.wintypes
except (ImportError, ValueError):  # pragma: no cover - only on exotic platforms
    pass

try:
    import winsound
except ImportError:
    class winsound:  # type: ignore[no-redef]
        """No-op stand-in so alert()/beeps never crash off Windows."""
        MB_ICONHAND = 0x10

        @staticmethod
        def MessageBeep(*_a, **_k):
            return None

        @staticmethod
        def Beep(*_a, **_k):
            return None

if IS_WINDOWS:
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # real pixel coords on scaled displays
    except Exception:
        pass

HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("simwatch")
GSPRO_PORT = 921
VIDEO_EXTS = (".mp4", ".mkv", ".avi", ".mov")
STATUS_PATH = HERE / "simwatch_status.json"
VIDEO_STATE_PATH = HERE / "video_state.json"  # video rig runtime: layout profile, replay/compare state, hotkey registration
_SINGLETON_MUTEX = None
# Daemon coordination files (all gitignored, next to this script):
DAEMON_INFO_PATH = HERE / "simwatch_daemon.json"  # {pid, command, started} of the daemon holding the singleton
VIDEO_REQUEST_PATH = HERE / "VIDEO_ON"            # `video` while a daemon runs: "start the video rig, no GSPro needed"
STOP_REQUEST_PATH = HERE / "STOP_REQUEST"         # `stop`: ask the daemon to exit cleanly (also tells the launcher)
_DAEMON_STARTED = 0.0                             # time.time() when this process took the singleton

_THROTTLE: dict[str, float] = {}
_THROTTLE_LOCK = threading.Lock()


def log_throttled(key: str, msg: str, every_sec: float = 60.0, level: int = logging.WARNING,
                  exc_info: bool = False) -> bool:
    """Log `msg` at most once per `every_sec` for `key`. Returns True if it was actually emitted.

    Used where a failure used to be swallowed (or buried at DEBUG): visible at INFO, but a failure that
    repeats every watch cycle can't flood the log.
    """
    now = time.monotonic()
    with _THROTTLE_LOCK:
        last = _THROTTLE.get(key)
        if last is not None and (now - last) < every_sec:
            return False
        _THROTTLE[key] = now
    LOG.log(level, msg, exc_info=exc_info)
    return True


def cfg_number(value, default: float) -> float:
    """`value` as a non-negative finite float, else `default`. For optional numeric settings that
    validate_config only WARNS about: a bad value must fall back, not raise on every watch tick."""
    if isinstance(value, bool):
        return float(default)
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float(default)
    return v if v >= 0 and v != float("inf") else float(default)  # NaN fails v >= 0


def write_text_if_changed(path: Path, data: str | bytes, backup: bool = True) -> bool:
    """Atomically write `data` to `path`. Skip if identical; keep ONE rolling `<name>.bak` of old content.

    Returns True if the file was (re)written.
    """
    raw = data.encode("utf-8") if isinstance(data, str) else data
    try:
        if path.exists():
            old = path.read_bytes()
            if old == raw:
                return False
            if backup:
                shutil.copy2(path, path.with_name(path.name + ".bak"))
    except OSError as e:
        log_throttled(f"bak:{path}", f"could not back up {path}: {e}")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        tmp.write_bytes(raw)
        os.replace(tmp, path)
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass
    return True


def unique_path(dest: Path) -> Path:
    """Return `dest`, or `dest` with `_2`, `_3`... before the suffix if it already exists (never overwrite)."""
    if not dest.exists():
        return dest
    n = 2
    while True:
        cand = dest.with_name(f"{dest.stem}_{n}{dest.suffix}")
        if not cand.exists():
            return cand
        n += 1


STATUS_EXTRAS: dict = {}  # extra top-level sections (e.g. "shotlab") merged into every status write


def write_status(state: str, **fields) -> None:
    """Heartbeat for external monitoring: simwatch_status.json next to the script, atomic (tmp + replace)."""
    doc = {"timestamp": datetime.now().isoformat(timespec="seconds"), "pid": os.getpid(), "state": state}
    doc.update(STATUS_EXTRAS)
    doc.update(fields)
    try:
        tmp = STATUS_PATH.with_name(STATUS_PATH.name + ".tmp")
        tmp.write_text(json.dumps(doc, indent=2, default=str), encoding="utf-8")
        os.replace(tmp, STATUS_PATH)
    except OSError as e:
        log_throttled("status-write", f"could not write status file {STATUS_PATH}: {e}")


# --------------------------------------------------------------------------- config & singleton

# Required fields per check type (checked by validate_config). A tuple means "any one of".
CHECK_REQUIRED = {
    "process": ("app",),
    "gspro_link": (),
    "device_ping": ("ip",),
    "device_tcp": ("app",),
    "bridge_link": (),
    "responsive": (("window_title_re", "app"),),
    "usb": ("name_like",),
    "indicator": ("window_title_re", "dx", "dy"),
    "text": ("window_title_re", "healthy_text_re"),
}
# App keys the code itself looks up by name, so they count as "referenced" even if no config entry names them.
SPECIAL_APP_KEYS = {"fs_connector", "integrator", "gspro_connect", "gspro"}
REQUIRED_TOP_LEVEL = ("apps", "checks", "recovery")
DAEMON_COMMANDS = ("watch", "startup")


def validate_config(cfg: dict, check_paths: bool | None = None) -> list[tuple[str, str]]:
    """Static sanity checks. Returns [(severity, message)] where severity is "error" or "warning".

    check_paths: verify app exe paths exist. Default: only when running on Windows (the paths are Windows paths).
    """
    out: list[tuple[str, str]] = []

    def err(m):
        out.append(("error", m))

    def warn(m):
        out.append(("warning", m))

    if not isinstance(cfg, dict):
        return [("error", "config root must be a JSON object")]
    for k in REQUIRED_TOP_LEVEL:
        if k not in cfg:
            err(f"missing required top-level key {k!r}")
    if "startup" not in cfg:
        warn("missing 'startup' section (the `startup` command needs it)")

    apps_raw = cfg.get("apps")
    apps: dict[str, dict] = {}
    if apps_raw is not None:
        if not isinstance(apps_raw, list) or not apps_raw:
            err("'apps' must be a non-empty list")
        else:
            for i, a in enumerate(apps_raw):
                if not isinstance(a, dict) or not a.get("key"):
                    err(f"apps[{i}] has no 'key'")
                    continue
                if a["key"] in apps:
                    err(f"duplicate app key {a['key']!r}")
                apps[a["key"]] = a
                for f in ("process", "exe"):
                    if not a.get(f):
                        err(f"app {a['key']!r} is missing {f!r}")
                if check_paths is None:
                    do_paths = IS_WINDOWS
                else:
                    do_paths = check_paths
                if do_paths and a.get("exe") and not Path(a["exe"]).exists():
                    warn(f"app {a['key']!r}: exe not found at {a['exe']}")

    for num in ("interval_sec", "fail_threshold", "settle_sec", "post_recover_grace_sec", "giveup_backoff_sec"):
        if num in cfg and not (isinstance(cfg[num], (int, float)) and not isinstance(cfg[num], bool) and cfg[num] >= 0):
            err(f"{num} must be a non-negative number (got {cfg[num]!r})")
    if isinstance(cfg.get("interval_sec"), (int, float)) and cfg["interval_sec"] <= 0:
        err("interval_sec must be > 0 (0 would busy-loop)")

    def _is_num(v) -> bool:
        return isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0

    if "pause_max_hours" in cfg and not _is_num(cfg["pause_max_hours"]):
        warn(f"pause_max_hours must be a non-negative number (got {cfg['pause_max_hours']!r}); using 4")
    dev = cfg.get("device") if isinstance(cfg.get("device"), dict) else {}
    for k in ("offline_ticks", "socket_clear_sec"):
        if k in dev and not _is_num(dev[k]):
            warn(f"device.{k} must be a non-negative number (got {dev[k]!r})")
    drec = cfg.get("device_recovery") if isinstance(cfg.get("device_recovery"), dict) else {}
    bo = drec.get("backoff_sec")
    if bo is not None and not (isinstance(bo, list) and bo and all(_is_num(x) for x in bo)):
        warn(f"device_recovery.backoff_sec must be a list of non-negative numbers (got {bo!r}); using [300]")

    referenced: set[str] = set(SPECIAL_APP_KEYS)

    checks = cfg.get("checks")
    check_names: set[str] = set()
    recovery = cfg.get("recovery")
    n_levels = len(recovery) if isinstance(recovery, list) else 0
    if checks is not None:
        if not isinstance(checks, list):
            err("'checks' must be a list")
        else:
            for i, chk in enumerate(checks):
                if not isinstance(chk, dict):
                    err(f"checks[{i}] must be an object")
                    continue
                name = chk.get("name") or f"checks[{i}]"
                if not chk.get("name"):
                    err(f"checks[{i}] has no 'name'")
                check_names.add(name)
                ctype = chk.get("type")
                if ctype not in CHECKS:
                    err(f"check {name!r}: unknown type {ctype!r} (valid: {', '.join(sorted(CHECKS))})")
                else:
                    for req in CHECK_REQUIRED.get(ctype, ()):
                        opts = req if isinstance(req, tuple) else (req,)
                        if not any(o in chk for o in opts):
                            # A device check without its own ip inherits device.ip (one place to change it,
                            # e.g. from config.local.json).
                            if req == "ip" and chk.get("device") and (cfg.get("device") or {}).get("ip"):
                                continue
                            err(f"check {name!r} (type {ctype}): missing {' or '.join(map(repr, opts))}")
                if "app" in chk:
                    referenced.add(chk["app"])
                    if chk["app"] not in apps:
                        err(f"check {name!r}: app {chk['app']!r} is not defined in 'apps'")
                lvl = chk.get("recovery_level", 0)
                if not isinstance(lvl, int) or isinstance(lvl, bool) or lvl < 0:
                    err(f"check {name!r}: recovery_level must be a non-negative integer (got {lvl!r})")
                elif n_levels and lvl >= n_levels:
                    warn(f"check {name!r}: recovery_level {lvl} is beyond the recovery ladder "
                         f"(0..{n_levels - 1}); it will go straight to 'give up'")

    if recovery is not None:
        if not isinstance(recovery, list) or not recovery:
            err("'recovery' must be a non-empty list")
        else:
            seen_lists: list[tuple[int, list]] = []
            for i, step in enumerate(recovery):
                if not isinstance(step, dict) or not isinstance(step.get("restart"), list):
                    err(f"recovery[{i}] needs a 'restart' list")
                    continue
                for key in step["restart"]:
                    referenced.add(key)
                    if key not in apps:
                        err(f"recovery[{i}] ({step.get('name', '?')}): restart key {key!r} is not in 'apps'")
                for j, prev in seen_lists:
                    if prev == step["restart"]:
                        warn(f"recovery levels {j} and {i} restart the identical list {prev}; the extra level adds nothing")
                seen_lists.append((i, step["restart"]))

    startup_cfg = cfg.get("startup")
    if isinstance(startup_cfg, dict):
        for key in startup_cfg.get("order", []):
            referenced.add(key)
            if key not in apps:
                err(f"startup.order: key {key!r} is not in 'apps'")
        for nm in startup_cfg.get("wait_for", []):
            if check_names and nm not in check_names:
                warn(f"startup.wait_for: no check named {nm!r} (it will be ignored)")

    if apps:
        for key in sorted(set(apps) - referenced):
            warn(f"app {key!r} is never referenced by a check, recovery level or startup.order")

    sl = cfg.get("video", {}).get("swing_lines", {}) if isinstance(cfg.get("video"), dict) else {}
    if isinstance(sl, dict) and sl.get("handedness") and str(sl["handedness"]).lower() not in ("left", "right"):
        warn(f"video.swing_lines.handedness {sl['handedness']!r} is not 'left' or 'right' (treated as right)")
    vraw = cfg.get("video") if isinstance(cfg.get("video"), dict) else {}
    lay = vraw.get("layout")
    if lay is not None and not isinstance(lay, dict):
        warn("video.layout must be an object (using the defaults)")
    elif isinstance(lay, dict):
        prof = str(lay.get("profile", "auto")).lower()
        if prof != "auto" and prof not in VIDEO_LAYOUT_PROFILES:
            warn(f"video.layout.profile {lay.get('profile')!r} is not auto/{'/'.join(VIDEO_LAYOUT_PROFILES)} (using auto)")
        for k in ("capture_hide", "replay_hide"):
            if k in lay and str(lay[k]).lower() not in HIDE_METHODS:
                warn(f"video.layout.{k} {lay[k]!r} is not {'/'.join(HIDE_METHODS)} (using behind)")
    rep = vraw.get("replay")
    if rep is not None and not isinstance(rep, dict):
        warn("video.replay must be an object (using the defaults)")
    elif isinstance(rep, dict):
        if "mode" in rep and str(rep["mode"]).lower() not in ("auto", "off"):
            warn(f"video.replay.mode {rep['mode']!r} is not auto/off (using auto)")
        for k in ("delay_sec", "show_sec", "manual_delay_sec", "clip_wait_sec", "input_grace_sec"):
            if k in rep and not _is_num(rep[k]):
                warn(f"video.replay.{k} must be a non-negative number (got {rep[k]!r})")
        by = rep.get("delay_by_club")
        if by is not None and not (isinstance(by, dict) and all(v is None or _is_num(v) for v in by.values())):
            warn("video.replay.delay_by_club must map Driver/Iron/Wedge/Putter to seconds or null")
    bcfg = cfg.get("bridge")
    if isinstance(bcfg, dict) and "lan" in bcfg and not isinstance(bcfg["lan"], bool):
        warn(f"bridge.lan {bcfg['lan']!r} is not true/false (treated as false: phone access stays off)")
    return out


def apply_config_defaults(cfg: dict) -> None:
    """Fill sane defaults for optional top-level keys (does not touch swing_lines.handedness; see load_swing_lines_template)."""
    for k, v in (("interval_sec", 5), ("fail_threshold", 3), ("settle_sec", 15),
                 ("post_recover_grace_sec", 35), ("giveup_backoff_sec", 300)):
        cfg.setdefault(k, v)
    if isinstance(cfg.get("bridge", {}), dict):
        bridge = cfg.setdefault("bridge", {})
        for k, v in BRIDGE_DEFAULTS.items():
            bridge.setdefault(k, v)


def load_config(path: Path, command: str | None = None) -> dict:
    """Load + validate config.json (with config.local.json deep-merged over it, if present).
    For `watch`/`startup`, config errors abort with a clear message."""
    try:
        cfg, local_path = read_config_layers(Path(path))
    except FileNotFoundError:
        raise SystemExit(f"Config file not found: {path}")
    except LocalConfigError as e:
        raise SystemExit(f"Local config overlay error: {e}")
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise SystemExit(f"Config file {path} is not valid JSON: {e}")
    if local_path:
        LOG.info("config: merged local overrides from %s", local_path)
    issues = validate_config(cfg)
    for sev, msg in issues:
        (LOG.error if sev == "error" else LOG.warning)("config %s: %s", sev, msg)
    errors = [m for sev, m in issues if sev == "error"]
    if errors and command in DAEMON_COMMANDS:
        raise SystemExit(
            f"Refusing to run `{command}`: {len(errors)} config error(s) in {path}:\n  - " + "\n  - ".join(errors)
        )
    if not isinstance(cfg, dict):
        raise SystemExit(f"Config {path} must be a JSON object")
    apply_config_defaults(cfg)
    cfg["apps_by_key"] = {a["key"]: a for a in cfg.get("apps", []) if isinstance(a, dict) and "key" in a}
    cfg.setdefault("checks", [])
    cfg.setdefault("recovery", [])
    return cfg


# --------------------------------------------------------------------------- config.local.json overlay

class LocalConfigError(ValueError):
    """config.local.json exists but is unusable (bad JSON / not an object)."""


def local_config_path(path: Path) -> Path:
    """config.json -> config.local.json in the same folder (gitignored, per-machine overrides)."""
    p = Path(path)
    return p.with_name(f"{p.stem}.local{p.suffix or '.json'}")


def _jcopy(v):
    return json.loads(json.dumps(v))


def _keyed_list(v) -> bool:
    return isinstance(v, list) and all(isinstance(x, dict) and "key" in x for x in v)


def deep_merge_config(base, over):
    """Return `base` with `over` merged in (inputs are not modified). Dicts merge recursively; lists of dicts
    that all carry a "key" (like `apps`) merge item-by-item on that key, so an overlay can change just one
    app's `exe` (unknown keys are appended); anything else in `over` replaces the base value."""
    if isinstance(base, dict) and isinstance(over, dict):
        out = _jcopy(base)
        for k, v in over.items():
            out[k] = deep_merge_config(base[k], v) if k in base else _jcopy(v)
        return out
    if _keyed_list(base) and _keyed_list(over):
        out = _jcopy(base)
        idx = {x["key"]: i for i, x in enumerate(out)}
        for item in over:
            if item["key"] in idx:
                out[idx[item["key"]]] = deep_merge_config(out[idx[item["key"]]], item)
            else:
                idx[item["key"]] = len(out)
                out.append(_jcopy(item))
        return out
    return _jcopy(over)


def read_config_layers(path: Path) -> tuple:
    """(config, local_path|None): config.json parsed, with config.local.json deep-merged over it when present.
    Base-file errors propagate as FileNotFoundError / json.JSONDecodeError; overlay errors as LocalConfigError."""
    base = json.loads(Path(path).read_text(encoding="utf-8"))
    lp = local_config_path(path)
    if not lp.exists():
        return base, None
    try:
        over = json.loads(lp.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise LocalConfigError(f"{lp} is not valid JSON: {e}") from e
    if not isinstance(over, dict):
        raise LocalConfigError(f"{lp} must be a JSON object")
    if not isinstance(base, dict):
        return base, lp  # validate_config reports the broken base
    return deep_merge_config(base, over), lp


DAEMON_CMDS = ("watch", "startup", "video")


def _own_pids() -> set[int]:
    """This process and its ancestors. On Windows a venv's Scripts\\python.exe is a launcher stub that runs the
    real interpreter as a child with the *same* command line, so the parent looks exactly like a "prior" SimWatch
    (killing it exits the launcher with 15)."""
    pids = {os.getpid(), os.getppid()}  # direct parent even if the psutil walk below fails
    try:
        pids.update(a.pid for a in psutil.Process().parents())
    except psutil.Error:
        pass
    return pids


def find_simwatch_daemons() -> list:
    """Other `simwatch.py watch|startup|video` python processes (never ourselves or our ancestors).
    Each returned psutil.Process has .info["cmdline"]. An elevated daemon's cmdline may be unreadable from a
    non-elevated shell; it is then missed here (the singleton mutex + simwatch_daemon.json still see it)."""
    mine = _own_pids()
    found = []
    for p in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            if p.info["pid"] in mine:
                continue
            name = (p.info["name"] or "").lower()
            if not name.startswith("python"):
                continue
            cmd = [str(a).lower() for a in (p.info["cmdline"] or [])]
            if any("simwatch.py" in a for a in cmd) and any(a in DAEMON_CMDS for a in cmd):
                found.append(p)
        except psutil.Error:
            pass
    return found


def _daemon_command_of(proc) -> str:
    cmd = [str(a).lower() for a in ((getattr(proc, "info", None) or {}).get("cmdline") or [])]
    return next((a for a in cmd if a in DAEMON_CMDS), "unknown")


def stop_other_simwatch_instances() -> int:
    """Force-terminate any other background `simwatch.py` daemon (`watch`/`startup`/`video`) processes.
    Last resort for `simwatch.py stop` after the clean STOP_REQUEST handshake timed out (see request_stop)."""
    victims = find_simwatch_daemons()
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


def _create_singleton_mutex() -> str:
    """Create the Local\\SimWatchSingleton mutex: "acquired", "held" (another daemon owns it) or "unavailable"
    (not Windows / ctypes failure). Separate function so tests can stub it."""
    global _SINGLETON_MUTEX
    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.wintypes.BOOL, ctypes.wintypes.LPCWSTR]
        kernel32.CreateMutexW.restype = ctypes.wintypes.HANDLE
        kernel32.CloseHandle.argtypes = [ctypes.wintypes.HANDLE]
        kernel32.CloseHandle.restype = ctypes.wintypes.BOOL
        mutex = kernel32.CreateMutexW(None, False, "Local\\SimWatchSingleton")
        err = ctypes.get_last_error()
        if not mutex:
            return "held" if err in (183, 5) else "unavailable"  # 5 = ACCESS_DENIED: an elevated instance owns it
        if err == 183:  # ERROR_ALREADY_EXISTS
            kernel32.CloseHandle(mutex)
            return "held"
        _SINGLETON_MUTEX = mutex
        return "acquired"
    except Exception:
        return "unavailable"


def read_daemon_info() -> dict | None:
    """simwatch_daemon.json if the pid in it is still alive (else None: stale file from a crash)."""
    try:
        info = json.loads(DAEMON_INFO_PATH.read_text(encoding="utf-8"))
        pid = int(info.get("pid"))
    except (OSError, ValueError, TypeError, AttributeError):
        return None
    if pid == os.getpid() or not psutil.pid_exists(pid):
        return None
    # A crash (or a kill) skips the atexit cleanup, and Windows reuses pids quickly: a live pid that is not a
    # python process is someone else's (e.g. `stop` would otherwise wait 20 s on an unrelated program).
    try:
        name = (psutil.Process(pid).name() or "").lower()
        if name and not name.startswith("python"):
            return None
    except psutil.NoSuchProcess:
        return None
    except psutil.Error:
        pass  # access denied (elevated daemon): trust the file
    return info


def running_daemon() -> dict | None:
    """{pid, command} of the SimWatch daemon running in another process, or None."""
    info = read_daemon_info()
    if info:
        return {"pid": info.get("pid"), "command": str(info.get("command") or "unknown")}
    procs = find_simwatch_daemons()
    if procs:
        return {"pid": procs[0].pid, "command": _daemon_command_of(procs[0])}
    return None


def _remove_daemon_info() -> None:
    try:
        info = json.loads(DAEMON_INFO_PATH.read_text(encoding="utf-8"))
        if int(info.get("pid", -1)) == os.getpid():
            DAEMON_INFO_PATH.unlink(missing_ok=True)
    except (OSError, ValueError, TypeError, AttributeError):
        pass


def _clear_stale_requests(command: str) -> None:
    """At daemon start: drop a STOP_REQUEST aimed at an earlier process and (watch/startup) a VIDEO_ON left from
    an earlier daemon session - a request only ever targets the daemon that was running when it was made."""
    paths = [STOP_REQUEST_PATH] + ([VIDEO_REQUEST_PATH] if command in ("watch", "startup") else [])
    for path in paths:
        try:
            if path.exists():
                path.unlink()
                LOG.info("Removed stale %s from an earlier SimWatch run", path.name)
        except OSError:
            pass


def acquire_singleton_lock(command: str = "watch") -> bool:
    """Take the single-daemon slot for watch/startup/video. Never kills anything: returns False when another
    daemon already runs (callers then exit cleanly or hand off; `simwatch.py stop` is the way to stop it)."""
    global _SINGLETON_MUTEX, _DAEMON_STARTED
    if _SINGLETON_MUTEX is not None:
        return True
    state = _create_singleton_mutex()
    if state == "held":
        return False
    if state == "unavailable":
        if find_simwatch_daemons():  # no mutex (ctypes failure): fall back to a process scan
            return False
        _SINGLETON_MUTEX = "no-mutex"
    elif _SINGLETON_MUTEX is None:
        _SINGLETON_MUTEX = "acquired"  # (the real creator stores the handle; a stub may not)
    _DAEMON_STARTED = time.time()
    _clear_stale_requests(command)
    try:
        DAEMON_INFO_PATH.write_text(json.dumps({"pid": os.getpid(), "command": command,
                                                "started": datetime.now().isoformat(timespec="seconds")}),
                                    encoding="utf-8")
        atexit.register(_remove_daemon_info)
    except OSError as e:
        LOG.warning("could not write %s: %s", DAEMON_INFO_PATH.name, e)
    return True


def already_running_message(command: str) -> str:
    d = running_daemon()
    who = f" (pid {d['pid']}, `{d['command']}`)" if d and d.get("pid") else ""
    return (f"SimWatch is already running in the background{who}; not starting a second `{command}`. "
            "To restart it: python simwatch.py stop, then start it again (or: schtasks /Run /TN SimWatch).")


def stop_requested() -> bool:
    """True when `simwatch.py stop` wrote STOP_REQUEST after this daemon started."""
    try:
        return STOP_REQUEST_PATH.stat().st_mtime >= _DAEMON_STARTED - 1.0
    except OSError:
        return False


def request_stop(timeout: float = 20.0) -> int:
    """`simwatch.py stop`: ask the running daemon to exit cleanly (STOP_REQUEST; it works across elevation and
    lets the daemon close the bridge/rig), wait, then force-terminate whatever is left. STOP_REQUEST also tells
    run_simwatch.bat that the exit was a deliberate stop, so it shows no error box and ends the scheduled task
    (a later `schtasks /Run /TN SimWatch` then starts it again). Returns the number of processes found."""
    procs = find_simwatch_daemons()
    pids = {p.pid for p in procs}
    info = read_daemon_info()
    if info and info.get("pid"):
        pids.add(int(info["pid"]))
    if not pids:
        return 0
    try:
        STOP_REQUEST_PATH.write_text(f"stop requested {datetime.now().isoformat(timespec='seconds')} "
                                     f"by pid {os.getpid()}\n", encoding="utf-8")
    except OSError as e:
        LOG.warning("could not write %s (%s); force-stopping instead", STOP_REQUEST_PATH.name, e)
        return max(len(pids), stop_other_simwatch_instances())
    print(f"Asked SimWatch (pid {', '.join(str(p) for p in sorted(pids))}) to stop; waiting up to {timeout:.0f}s...")
    deadline = time.time() + timeout
    while time.time() < deadline and any(psutil.pid_exists(p) for p in pids):
        time.sleep(0.5)
    left = [p for p in pids if psutil.pid_exists(p)]
    if left:
        LOG.info("SimWatch did not exit within %.0fs (pid %s); terminating", timeout, left)
        stop_other_simwatch_instances()  # STOP_REQUEST stays: the launcher sees it and treats rc 15 as a stop
        left = [p for p in pids if psutil.pid_exists(p)]
        if left:
            print(f"Could not stop pid {left} (elevated? run this from an Administrator prompt).")
    else:
        try:
            STOP_REQUEST_PATH.unlink(missing_ok=True)  # clean exit (rc 0): nothing left for the launcher to read
        except OSError:
            pass
    return len(pids)


def scheduled_task_running(name: str = "SimWatch") -> bool | None:
    """True/False from `schtasks /Query` (CSV), None if the task can't be queried."""
    rc, out = _run_cmd(["schtasks", "/Query", "/TN", name, "/FO", "CSV", "/NH"], 15)
    if rc != 0 or not out.strip():
        return None
    return '"running"' in out.strip().splitlines()[-1].lower()


def cmd_restart(wait_task_sec: float = 15.0, wait_start_sec: float = 90.0) -> int:
    """`simwatch.py restart`: clean stop, make sure the scheduled task has really ended (its launcher window can
    linger and keep the task 'Running', so a plain `schtasks /Run` silently does nothing), start it again and wait
    until the new daemon is up. One shift-free command for the rig after `git pull`."""
    n = request_stop()
    print(f"Stopped {n} running SimWatch background instance(s).")
    deadline = time.time() + wait_task_sec
    state = scheduled_task_running()
    while state and time.time() < deadline:
        time.sleep(1)
        state = scheduled_task_running()
    if state is None:
        print("Scheduled task 'SimWatch' not found (run install_autostart.bat), or schtasks failed.")
        return 1
    if state:
        print("Scheduled task still shows Running after the stop; ending it.")
        _run_cmd(["schtasks", "/End", "/TN", "SimWatch"], 20)
        time.sleep(2)
    rc, out = _run_cmd(["schtasks", "/Run", "/TN", "SimWatch"], 20)
    if rc != 0:
        print(f"schtasks /Run failed: {out.strip()}")
        return 1
    print(f"Started the SimWatch task; waiting up to {wait_start_sec:.0f}s for it to come up...")
    deadline = time.time() + wait_start_sec
    while time.time() < deadline:
        info = read_daemon_info()
        if info and info.get("pid") and psutil.pid_exists(int(info["pid"])):
            print(f"SimWatch is running (pid {info['pid']}, `{info.get('command', '?')}`).")
            return 0
        time.sleep(1)
    print("SimWatch did not report in yet; check logs\\launcher.log and simwatch.log, or run `simwatch.py status`.")
    return 1


def video_request_active() -> bool:
    return VIDEO_REQUEST_PATH.exists()


def write_video_request(by: str = "video") -> None:
    VIDEO_REQUEST_PATH.write_text(f"requested_at: {datetime.now().isoformat(timespec='seconds')} by {by}\n"
                                  "Delete this file or run `python simwatch.py video off` to release the video rig.\n",
                                  encoding="utf-8")


def clear_video_request() -> bool:
    try:
        existed = VIDEO_REQUEST_PATH.exists()
        VIDEO_REQUEST_PATH.unlink(missing_ok=True)
        return existed
    except OSError as e:
        LOG.warning("could not remove %s: %s", VIDEO_REQUEST_PATH.name, e)
        return False


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
        windowed = gspro_effective_windowed(cfg, projector_on)

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
        log_throttled("enforce_gspro_window_state", f"enforce_gspro_window_state failed: {e}")


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
        except Exception as e:
            log_throttled(f"suppress_focus:{key}", f"suppress_background_focus({key}) failed: {e}")


def _port_listening(port: int) -> bool:
    """True if some local process has a LISTEN socket on `port`. Read-only (psutil): unlike a test
    connect(), this can never steal GSPro's single private :9050 slot from GSPconnect."""
    try:
        conns = psutil.net_connections(kind="tcp")
    except (psutil.Error, OSError) as e:
        log_throttled("port-listening", f"psutil.net_connections failed ({e}); cannot see :{port} yet")
        return False
    return any(c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == port for c in conns)


def wait_port(port: int, timeout: float) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if _port_listening(port):
            LOG.info("  :%d listening", port)
            return True
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


def _ping_ok(returncode: int, stdout: str) -> bool:
    """Locale-independent: the exit code decides. Windows `ping` also exits 0 for a gateway's
    'Destination host unreachable' reply, so English unreachable/timeout text WITHOUT a TTL field is
    used only as a negative hint (on other locales we degrade to exit-code-only rather than false-fail)."""
    if returncode != 0:
        return False
    out = stdout or ""
    has_ttl = re.search(r"TTL\s*[=:]\s*\d+", out, re.I) is not None
    if not has_ttl and re.search(r"unreachable|timed out", out, re.I):
        return False
    return True


# Runtime device facts shared between checks. learned_ip: the remote IP GameChanger was last seen
# connected to (device_tcp pass) - the Launch Pro's link-local address can change between boots, so
# pinging the configured IP alone can false-fail while the device is actually connected.
_DEVICE_RUNTIME: dict = {"learned_ip": None}


def device_ping_target(chk, cfg) -> str | None:
    return _DEVICE_RUNTIME.get("learned_ip") or chk.get("ip") or cfg.get("device", {}).get("ip")


def check_device_ping(chk, cfg):
    ip = device_ping_target(chk, cfg)
    # 2 echoes: one dropped packet on a busy link-local/Wi-Fi hop must not read as "device offline".
    r = subprocess.run(
        ["ping", "-n", "2", "-w", "1000", ip],
        capture_output=True, text=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    ok = _ping_ok(r.returncode, r.stdout)
    return ok, f"ping {ip} {'ok' if ok else 'failed'}"


def check_device_tcp(chk, cfg):
    """FS software has a live TCP session to the launch monitor (match by ip or configured ports)."""
    app = cfg["apps_by_key"][chk["app"]]
    pids = {p.pid for p in find_procs(app["process"])}
    dev = cfg.get("device", {})
    ip = chk.get("ip") or dev.get("ip")
    ports = _device_ports(chk) or _device_ports(dev)
    c = _find_device_tcp_session(pids, _DEVICE_RUNTIME.get("learned_ip") or ip, ports)
    if c is None and _DEVICE_RUNTIME.get("learned_ip") and ip != _DEVICE_RUNTIME.get("learned_ip"):
        c = _find_device_tcp_session(pids, ip, ports)
    if c:
        if c.raddr.ip and _DEVICE_RUNTIME.get("learned_ip") != c.raddr.ip:
            LOG.info("Launch Pro seen at %s (GameChanger session); pinging that address from now on", c.raddr.ip)
            _DEVICE_RUNTIME["learned_ip"] = c.raddr.ip
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
    device_tcp_seen = device_tcp_failed = False
    saw_non_device_fail = False
    level = None
    non_device_level = None
    failing: list[str] = []
    device_failing: list[str] = []
    non_device_failing: list[str] = []
    ping_failing: list[str] = []
    skipped: list[str] = []

    for chk in cfg["checks"]:
        name = chk.get("name", "?")
        fn = CHECKS.get(chk.get("type"))
        if fn is None:
            # Misconfigured check: never let it silently pass AND never let it block recovery forever.
            # Skip it from the verdict, but shout (once per minute) so it is visible.
            skipped.append(name)
            log_throttled(f"unknown-check:{name}",
                          f"check {name!r} has unknown type {chk.get('type')!r}; SKIPPED (fix config.json)",
                          every_sec=60.0, level=logging.ERROR)
            continue
        try:
            ok, msg = fn(chk, cfg)
        except Exception as e:  # a broken check shouldn't kill the watchdog
            ok, msg = None, f"check error: {e}"
            log_throttled(f"check-exc:{name}", f"check {name!r} raised {type(e).__name__}: {e}",
                          every_sec=60.0, exc_info=True)
        mark = {True: "OK ", False: "BAD", None: "?? "}[ok]
        if verbose or ok is not True:
            LOG.info("[%s] %-22s %s", mark, name, msg)
        if chk.get("type") == "device_tcp" and ok is not None:
            device_tcp_seen = True
            device_tcp_failed = device_tcp_failed or ok is False
        if ok is None:
            any_unknown = True
            failing.append(f"{name} (error)")
        elif ok is False:
            failing.append(name)
            all_ok = False
            if chk.get("type") == "device_ping":
                device_ping_failed = True
                ping_failing.append(name)
            lvl = chk.get("recovery_level", 0)
            level = lvl if level is None else max(level, lvl)
            if chk.get("device"):
                device_failing.append(name)
            else:
                saw_non_device_fail = True
                non_device_failing.append(name)
                non_device_level = lvl if non_device_level is None else max(non_device_level, lvl)

    # "Offline" needs BOTH signals: ping failing AND no live GameChanger session (or no device_tcp check).
    device_offline_raw = device_ping_failed and (device_tcp_failed or not device_tcp_seen)
    # Ping failing while GameChanger holds a live session = ICMP flake, not a device problem: drop it.
    ping_ignored = device_ping_failed and device_tcp_seen and not device_tcp_failed
    if ping_ignored:
        device_failing = [n for n in device_failing if n not in ping_failing]
        failing = [n for n in failing if n not in ping_failing]
        all_ok = not (device_failing or non_device_failing)
        if all_ok:
            level = None

    return {
        "all_ok": all_ok,
        "any_unknown": any_unknown,
        "device_ping_failed": device_ping_failed,
        "device_offline_raw": device_offline_raw,
        "ping_ignored": ping_ignored,
        "only_device_failed": (not all_ok) and (not saw_non_device_fail),
        "level": level,
        "non_device_level": non_device_level,
        "failing": failing,
        "device_failing": device_failing,
        "non_device_failing": non_device_failing,
        "skipped": skipped,
    }


def run_checks(cfg, verbose=True):
    """Returns (all_ok, highest recovery level suggested by the failures)."""
    res = evaluate_checks(cfg, verbose=verbose)
    return res["all_ok"], res["level"]


# --------------------------------------------------------------------------- recovery

def run_actions(app: dict, cfg: dict, actions=None) -> None:
    for act in (app.get("post_start", []) if actions is None else actions):
        win_re = act.get("window_title_re", app.get("window_title_re"))
        if ("click_button_re" in act or "click_at" in act) and not win_re:
            LOG.warning("  %s: action %s needs window_title_re (none configured); skipped", app.get("key"), act)
            continue
        if "wait" in act:
            time.sleep(act["wait"])
        elif "click_button_re" in act:
            click_button(win_re, act["click_button_re"])
        elif "click_at" in act:
            dx, dy = act["click_at"]
            click_at(win_re, dx, dy)
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
    if not (0 <= level < len(cfg["recovery"])):
        LOG.error("recover: no recovery level %d (have %d)", level, len(cfg["recovery"]))
        return
    _run_recovery_step(cfg, cfg["recovery"][level], f"recovery level {level}")


DEVICE_RECOVERY_DEFAULT = {"name": "restart GameChanger (device session only)", "restart": ["integrator"],
                           "backoff_sec": [300, 900, 1800]}


def device_recovery_cfg(cfg) -> dict:
    out = dict(DEVICE_RECOVERY_DEFAULT)
    if isinstance(cfg.get("device_recovery"), dict):
        out.update(cfg["device_recovery"])
    return out


def device_backoff_sec(cfg, attempts: int) -> float:
    """Wait after the `attempts`-th device-only recovery (1-based): 5 -> 15 -> 30 min, capped at the last."""
    raw = device_recovery_cfg(cfg).get("backoff_sec") or [300]
    if not isinstance(raw, (list, tuple)):
        raw = [raw]  # a bare number/string must not be iterated char by char ("300" -> 3, 0, 0)
    try:
        sched = [float(s) for s in raw if not isinstance(s, bool) and float(s) >= 0] or [300.0]
    except (TypeError, ValueError):
        log_throttled("device-backoff-cfg", "device_recovery.backoff_sec has a non-number; using [300]")
        sched = [300.0]
    return sched[min(max(attempts, 1), len(sched)) - 1]


def recover_device(cfg) -> None:
    """Device-only failure (Launch Pro reachable, GameChanger has no session): restart GameChanger only."""
    _run_recovery_step(cfg, device_recovery_cfg(cfg), "device recovery")


def fsx_holds_device(cfg) -> bool:
    """True when FSX Pro currently holds the Launch Pro session. That is the user's choice (they are using
    FSX Pro), so automated recovery leaves both FSX Pro and GameChanger alone until it lets go."""
    if not cfg.get("apps_by_key", {}).get("fs_connector"):
        return False
    try:
        return fsx_session(cfg) is not None
    except Exception as e:
        log_throttled("fsx-session", f"could not inspect FSX Pro session: {e}")
        return False


def release_fsx_for_recovery(cfg) -> bool:
    """Never closes or clicks FSX Pro any more (user decision 2026-11-19: leave FSX alone). Returns True
    when FSX Pro holds the Launch Pro so the caller can skip restarting GameChanger, which could not
    connect anyway. `release-device` / `reconnect` remain the explicit, user-run ways to hand it over."""
    held = fsx_holds_device(cfg)
    if held:
        log_throttled("fsx-holds", "FSX Pro is using the Launch Pro - leaving it alone "
                      "(run `python simwatch.py release-device` when you're done with FSX Pro)", every_sec=600.0)
    return held


def wait_device_sockets_clear(cfg, timeout: float = 10.0) -> bool:
    """After killing GameChanger, wait (bounded) until no ESTABLISHED/TIME_WAIT socket to the Launch Pro
    ports remains, so the relaunched GameChanger doesn't find the device still 'busy'."""
    ports = _device_ports(cfg.get("device", {})) or {9970, 9971}
    busy = (psutil.CONN_ESTABLISHED, getattr(psutil, "CONN_TIME_WAIT", "TIME_WAIT"))
    end = time.time() + timeout
    while True:
        try:
            lingering = [c for c in psutil.net_connections(kind="tcp")
                         if c.status in busy and c.raddr and c.raddr.port in ports]
        except (psutil.Error, OSError):
            return False
        if not lingering:
            return True
        if time.time() >= end:
            LOG.info("  %d socket(s) to the Launch Pro still open after %.0fs; relaunching anyway",
                     len(lingering), timeout)
            return False
        time.sleep(0.5)


def _run_recovery_step(cfg, step: dict, label: str) -> None:
    keys = list(step.get("restart", []))
    unknown = [k for k in keys if k not in cfg["apps_by_key"]]
    if unknown:
        LOG.error("%s references unknown app key(s) %s; skipping them", label, unknown)
        keys = [k for k in keys if k in cfg["apps_by_key"]]
    if "gspro" in keys and _is_gspro_healthy(cfg):
        LOG.info("  gspro already healthy and listening on :9050 - skipping GSPro restart")
        keys = [k for k in keys if k != "gspro"]
    if "integrator" in keys and release_fsx_for_recovery(cfg):
        keys = [k for k in keys if k != "integrator"]  # FSX Pro has the device: GameChanger couldn't connect
    if not keys:
        return
    LOG.warning(">>> %s: %s", label, step.get("name", "?"))
    for key in reversed(keys):          # stop downstream first
        kill_app(cfg["apps_by_key"][key])
    if keys:
        time.sleep(2)
    if "integrator" in keys:
        dev = cfg.get("device") if isinstance(cfg.get("device"), dict) else {}
        wait_device_sockets_clear(cfg, cfg_number(dev.get("socket_clear_sec", 10), 10))
    for key in keys:
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
    if c in ("PT", "PUTTER", "PUTT"):
        return "Putter"  # never "Iron": putts must not be treated as a full swing for video capture
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
    """Legacy (2024.1) per-instance prefs: keep user's camera settings while pointing Capture into today's
    session & keeping lines visible. (2025.x has one shared Preferences.xml - see setup_video_rig_2025.)"""
    if resolve_kinovea_backend(cfg) == "2025":
        return
    kdir = _kinovea_appdata_dir()
    if not kdir:
        return
    base_prefs = kdir / "Preferences.xml"
    if not base_prefs.exists():
        return
    running, total = kinovea_running_instances()
    if total:
        LOG.info("Kinovea is running; legacy preference files are only rewritten for stopped instances")
    else:
        # Named instances only read Preferences.<name>.xml when the BASE file says InstancesOwnPreferences.
        try:
            write_text_if_changed(base_prefs, patch_kinovea_prefs_legacy_general(base_prefs.read_bytes()))
        except (OSError, ET.ParseError) as e:
            log_throttled("kprefs:general", f"could not set InstancesOwnPreferences in {base_prefs}: {e}")
    for inst in ("LiveReplay", "Reference"):
        if inst in running:
            continue
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
                write_text_if_changed(dst, ET.tostring(iroot, encoding="utf-8", xml_declaration=True))
            except Exception as e:
                log_throttled(f"kprefs:{inst}", f"sync_kinovea_instance_prefs ({inst}) failed: {e}")
    cap_prefs = kdir / "Preferences.Capture.xml"
    if "Capture" in running:
        return
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
        rec_sec = max(1.0, float(vcfg.get("pre_trigger_sec", 3.0)) + float(vcfg.get("post_trigger_sec", 1.5)))
        # Toggle mode (default): SimWatch starts the recording and RecordingSeconds stops it, so the audio
        # trigger must be OFF or a club strike would start a second, overlapping recording.
        audio = str(vcfg.get("legacy_trigger", "toggle")).lower() == "audio"
        _set_xml_text(auto_cfg, "EnableAudioTrigger", "true" if audio else "false")
        _set_xml_text(auto_cfg, "AudioTriggerThreshold", "0.15")
        _set_xml_text(auto_cfg, "RecordingSeconds", f"{rec_sec:.1f}")
        _set_xml_text(auto_cfg, "AudioQuietPeriod", "2.0")
        write_text_if_changed(cap_prefs, ET.tostring(root, encoding="utf-8", xml_declaration=True))
    except Exception as e:
        log_throttled("kprefs:capture", f"sync_kinovea_instance_prefs (capture) failed: {e}")


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
        except Exception as e:
            log_throttled(f"kcapdirs:{fname}", f"could not read Kinovea prefs {p}: {e}")
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
    try:
        p.terminate()
        p.wait(timeout=3.0)
        LOG.info("Kinovea pid %d did not close gracefully; terminated", pid)
    except Exception:
        LOG.warning("Kinovea pid %d did not terminate; killing", pid)
        try:
            p.kill()
        except Exception as e:
            LOG.warning("Could not kill Kinovea pid %d: %s", pid, e)
    # NOTE: the shared %APPDATA%\Kinovea\Temp directory is deliberately NOT wiped here: it is shared by
    # every live Kinovea instance (Capture / LiveReplay / Reference) and wiping it can break the others.


def kinovea_launch_args(exe: Path, name: str, workspace_xml: Path | None) -> list[str]:
    """Command line for a named Kinovea instance.

    2025.x (workspace_xml=None): `-name <WindowName>` reloads the saved window descriptor
    (%APPDATA%\\Kinovea\\Windows\\<id>.xml). 2025's parser returns as soon as it sees -name, so
    -hideExplorer/-stretch would be ignored; the descriptor's ExplorerVisible/Stretch carry that instead.
    Legacy 2024.1: `-name <instance> -workspace <xml> -hideExplorer -stretch`.
    """
    if workspace_xml is None:
        return [str(exe), "-name", name]
    return [str(exe), "-name", name, "-workspace", str(workspace_xml), "-hideExplorer", "-stretch"]


def launch_kinovea_instance(cfg, name: str, workspace_xml: Path | None, force_reload: bool = False) -> int | None:
    """Ensure a named Kinovea instance is running (legacy: with workspace XML; 2025: workspace_xml=None)."""
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
    args = kinovea_launch_args(exe, name, workspace_xml)
    try:
        proc = subprocess.Popen(args, cwd=str(exe.parent), creationflags=flags)
        return proc.pid
    except OSError as e:
        LOG.error("Failed to start Kinovea (%s): %s", name, e)
        return None


# --------------------------------------------------------------------------- Kinovea 2025.x backend
# Element names / formats below are taken from the Kinovea 2025.2 source:
#   Kinovea.Services/Window/WindowDescriptor.cs, ScreenDescriptorCapture.cs, ScreenDescriptorPlayback.cs,
#   Types/UserCommand.cs, Types/CaptureFolder.cs, Types/CapturePathConfiguration.cs,
#   Types/CaptureAutomationConfiguration.cs (TriggerQuietPeriod is serialized as <AudioQuietPeriod>),
#   ScreenManager/CaptureScreen/CaptureScreen.cs (post-recording command: run as `cmd.exe /C <line>` after
#   the file is closed; its variables are only filepath, folderpath, filename.ext, filename, ext, kva +
#   date/time - NOT camalias, which only exists in the file-name context).

KINOVEA_DEFAULT_EXE = r"C:\Program Files\Kinovea\Kinovea.exe"
KINOVEA_WINDOW_NAMES = ("Capture", "LiveReplay", "Reference")
KINOVEA_DEFAULT_UDP_PORT = 8875
KINOVEA_OLD_DATE = "2000-01-01T00:00:00.0000000Z"  # LastSave: never become the "last closed window"
_KINOVEA_BACKEND_CACHE: dict[str, str] = {}


def kinovea_file_version(exe: Path) -> tuple[int, int, int, int] | None:
    """Kinovea.exe file version (e.g. (2025, 2, 0, 0)) via GetFileVersionInfo; None if unavailable."""
    if not IS_WINDOWS:
        return None
    try:
        import win32api
        info = win32api.GetFileVersionInfo(str(exe), "\\")
        ms, ls = int(info["FileVersionMS"]), int(info["FileVersionLS"])
        return (ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF)
    except Exception as e:
        log_throttled("kinovea-version", f"could not read Kinovea.exe version ({exe}): {e}", every_sec=3600)
        return None


def kinovea_backend_for_version(version, setting: str | None = "auto", hint: str | None = None) -> str:
    """'2025' or 'legacy'. Explicit setting wins; auto: major >= 2025 -> 2025; unknown -> hint or 2025."""
    s = str(setting or "auto").strip().lower()
    if s in ("2025", "legacy"):
        return s
    if version:
        return "2025" if int(version[0]) >= 2025 else "legacy"
    return hint if hint in ("2025", "legacy") else "2025"


def resolve_kinovea_backend(cfg: dict) -> str:
    """Pick the Kinovea backend from config + Kinovea.exe version (cached per exe/setting, logged once)."""
    vcfg = cfg.get("video", {}) or {}
    setting = vcfg.get("kinovea_backend", "auto")
    exe = Path(vcfg.get("kinovea_exe") or KINOVEA_DEFAULT_EXE)
    key = f"{exe}|{setting}"
    if key in _KINOVEA_BACKEND_CACHE:
        return _KINOVEA_BACKEND_CACHE[key]
    ver = kinovea_file_version(exe) if exe.exists() else None
    hint = None
    if ver is None:
        kdir = _kinovea_appdata_dir()
        if kdir and (kdir / "Windows").is_dir():
            hint = "2025"  # the Windows\ descriptor folder only exists since 2025.1
        elif kdir and (kdir / "Preferences.xml").exists():
            hint = "legacy"
    backend = kinovea_backend_for_version(ver, setting, hint)
    ver_s = ".".join(str(x) for x in ver) if ver else "unknown"
    LOG.info("Kinovea %s (%s) -> %s backend (video.kinovea_backend=%s)", ver_s, exe, backend, setting)
    if backend == "legacy":
        LOG.warning("Kinovea %s is a legacy version: using the 2024.1 fallback (toggle trigger, workspace XML). "
                    "Install Kinovea 2025.2 for the UDP trigger + clip-ready post-recording command.", ver_s)
    _KINOVEA_BACKEND_CACHE[key] = backend
    return backend


def kinovea_guid(tag: str) -> str:
    """Stable GUID for SimWatch-managed Kinovea objects (windows, screens, capture folders, commands)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"simwatch/kinovea/{tag}"))


def kinovea_settings_dir(create: bool = False) -> Path | None:
    """%APPDATA%\\Kinovea (Software.SettingsDirectory), optionally created."""
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return None
    p = Path(appdata) / "Kinovea"
    if create:
        try:
            (p / "Windows").mkdir(parents=True, exist_ok=True)
        except OSError:
            return None
    return p if p.exists() else None


def _xb(v) -> str:
    return "true" if v else "false"


def _xf(v) -> str:
    """Float the way XmlHelper.WriteFloat (InvariantCulture "{0}") writes it: 3 -> '3', 4.5 -> '4.5'."""
    return f"{float(v):g}"


def kinovea_capture_root(cfg: dict) -> Path:
    """Local (non-OneDrive) folder Kinovea records raw clips into (video.capture_root)."""
    raw = (cfg.get("video", {}) or {}).get("capture_root") or ""
    if raw:
        p = Path(os.path.expandvars(str(raw)))
        return p if p.is_absolute() else HERE / p
    base = os.environ.get("LOCALAPPDATA")
    return (Path(base) if base else Path.home() / ".simwatch") / "SimWatch" / "Captures"


def kinovea_capture_folders(cfg: dict, layout: dict) -> dict[str, dict]:
    """The 4 SimWatch capture folders (stable ids): raw DTL/FO recordings + replay DTL/FO (watched by LiveReplay).

    Paths use Kinovea's %date% variable so they roll over daily without rewriting anything.
    """
    root = kinovea_capture_root(cfg)
    sessions = layout["sessions"]
    out = {}
    for angle in ("DTL", "FO"):
        out[angle] = {"id": kinovea_guid(f"capture-folder/{angle}"), "short": f"SimWatch {angle}",
                      "path": str(root / "%date%" / angle)}
        out[f"replay_{angle}"] = {"id": kinovea_guid(f"capture-folder/replay/{angle}"),
                                  "short": f"SimWatch Replay {angle}",
                                  "path": str(sessions / "%date%" / angle)}
    return out


def windowless_python(python_exe: str | None) -> str:
    """pythonw.exe next to `python_exe` when it exists (no console window popping over fullscreen GSPro and
    stealing focus), else `python_exe` itself."""
    py = python_exe or sys.executable or "python"
    p = Path(py)
    if p.name.lower() == "python.exe":
        w = p.with_name("pythonw.exe")
        if w.exists():
            return str(w)
    return py


def kinovea_clip_ready_instruction(angle: str, python_exe: str | None = None, script: str | None = None) -> str:
    """Post-recording command line. Kinovea runs `cmd.exe /C <line>`; with >2 quotes cmd strips the first
    and last quote, so the whole line is wrapped in one extra pair. %filepath% is Kinovea's variable; the
    angle is literal because %camalias% is not available in the post-recording context. Uses pythonw.exe
    when available; clip-ready logs to logs/clip-ready.log and never needs a console."""
    py = windowless_python(python_exe)
    scr = script or str(HERE / "simwatch.py")
    return f'""{py}" "{scr}" clip-ready "%filepath%" {angle}"'


def kinovea_capture_screen(cfg: dict, angle: str, camera: str, folder_id: str) -> dict:
    vcfg = cfg.get("video", {}) or {}
    pre = float(vcfg.get("pre_trigger_sec", 3.0))
    post = float(vcfg.get("post_trigger_sec", 1.5))
    fname = "%camalias%_%date%_%time%" if camera.upper() == angle.upper() else f"{angle}_%camalias%_%date%_%time%"
    return {
        "type": "capture", "id": kinovea_guid(f"screen/capture/{angle}"), "camera_name": camera,
        "autostream": True, "delay": pre, "delayed_display": bool(vcfg.get("capture_delayed_display", False)),
        "max_duration": max(0.5, pre + post), "capture_folder": folder_id, "file_name": fname,
        "enable_command": bool(vcfg.get("clip_ready_command", True)),
        "command_id": kinovea_guid(f"command/clip-ready/{angle}"),
        "instructions": [kinovea_clip_ready_instruction(angle)],
    }


def build_kinovea_window_xml(name: str, screens: list[dict], explorer_visible: bool = False) -> bytes:
    """A 2025.x window descriptor (<KinoveaWindow>) with StartupMode=ScreenList so Kinovea never replaces
    our screens on close (WindowDescriptor.WriteXML order is kept so Kinovea's own re-save is equivalent)."""
    root = ET.Element("KinoveaWindow")
    ET.SubElement(root, "Id").text = kinovea_guid(f"window/{name}")
    ET.SubElement(root, "Name").text = name
    ET.SubElement(root, "LastSave").text = KINOVEA_OLD_DATE
    ET.SubElement(root, "StartupMode").text = "ScreenList"
    sl = ET.SubElement(root, "ScreenList")
    for scr in screens:
        if scr["type"] == "capture":
            el = ET.SubElement(sl, "ScreenDescriptorCapture")
            ET.SubElement(el, "Id").text = scr["id"]
            ET.SubElement(el, "CameraName").text = str(scr["camera_name"])
            ET.SubElement(el, "Autostream").text = _xb(scr.get("autostream", True))
            ET.SubElement(el, "Delay").text = _xf(scr.get("delay", 0))
            ET.SubElement(el, "DelayedDisplay").text = _xb(scr.get("delayed_display", False))
            ET.SubElement(el, "MaxDuration").text = _xf(scr.get("max_duration", 0))
            ET.SubElement(el, "CaptureFolder").text = scr["capture_folder"]
            ET.SubElement(el, "FileName").text = scr.get("file_name", "")
            ET.SubElement(el, "EnableCommand").text = _xb(scr.get("enable_command", False))
            if scr.get("instructions"):
                uc = ET.SubElement(el, "UserCommand")
                ET.SubElement(uc, "Id").text = scr["command_id"]
                ins = ET.SubElement(uc, "Instructions")
                for line in scr["instructions"]:
                    ET.SubElement(ins, "Instruction").text = line
            ET.SubElement(el, "CapturedFilesPanelForceCollapsed").text = "true"
        else:
            el = ET.SubElement(sl, "ScreenDescriptorPlayback")
            ET.SubElement(el, "FullPath").text = str(scr["full_path"])
            ET.SubElement(el, "Autoplay").text = _xb(scr.get("autoplay", True))
            ET.SubElement(el, "SpeedPercentage").text = _xf(scr.get("speed", 50))
            ET.SubElement(el, "Stretch").text = _xb(scr.get("stretch", True))
            ET.SubElement(el, "IsReplayWatcher").text = _xb(scr.get("is_watcher", False))
            ET.SubElement(el, "SidePanelSplitterRatio").text = "0.8"
            ET.SubElement(el, "SidePanelVisible").text = "false"
            ET.SubElement(el, "KeyframePanelForceCollapsed").text = "true"
    ET.SubElement(root, "ExplorerVisible").text = _xb(explorer_visible)
    ET.SubElement(root, "ExplorerSplitterRatio").text = "0.2"
    ET.SubElement(root, "DualScreenVerticalLayout").text = "false"
    ET.SubElement(root, "DualScreenSplitterRatio").text = "0.5"
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _xml_canon(el: ET.Element | None) -> tuple:
    if el is None:
        return ()
    return (el.tag, (el.text or "").strip(), tuple(_xml_canon(c) for c in el))


def kinovea_window_signature(xml_bytes: bytes | str | None) -> tuple:
    """What SimWatch manages in a window descriptor (Name/StartupMode/ScreenList/ExplorerVisible); ignores
    LastSave, WindowRectangle and splitter ratios that Kinovea rewrites on every close."""
    if not xml_bytes:
        return ()
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return ()
    return tuple(_xml_canon(root.find(t)) for t in ("Id", "Name", "StartupMode", "ScreenList", "ExplorerVisible"))


def _xml_child(parent: ET.Element, tag: str) -> ET.Element:
    node = parent.find(tag)
    if node is None:
        node = ET.SubElement(parent, tag)
    return node


def patch_kinovea_prefs_2025(xml_text: bytes | str | None, folders: list[dict], udp_port: int = KINOVEA_DEFAULT_UDP_PORT,
                             quiet_period: float = 3.0, memory_buffer_mb: int = 0) -> bytes:
    """Edit only SimWatch's nodes in a 2025 Preferences.xml (<KinoveaPreferences>), keeping everything else.

    Adds/updates our <CaptureFolder> entries by Id (user folders untouched), sets Delay recording mode,
    raises (never lowers) <MemoryBuffer>, and configures <CaptureAutomationConfiguration> for the UDP trigger.
    """
    root = ET.fromstring(xml_text) if xml_text else ET.Element("KinoveaPreferences")
    if root.tag != "KinoveaPreferences":
        raise ValueError(f"not a Kinovea preferences file (root <{root.tag}>)")
    if root.find("FormatVersion") is None:
        fv = ET.Element("FormatVersion")
        fv.text = "3.0"
        root.insert(0, fv)
    cap = _xml_child(root, "Capture")
    cpc = _xml_child(cap, "CapturePathConfiguration")
    cff = _xml_child(cpc, "CaptureFolders")
    by_id = {(cf.findtext("Id") or "").strip().lower(): cf for cf in cff.findall("CaptureFolder")}
    for f in folders:
        node = by_id.get(f["id"].lower())
        if node is None:
            node = ET.SubElement(cff, "CaptureFolder")
        _set_xml_text(node, "Id", f["id"])
        _set_xml_text(node, "ShortName", f["short"])
        _set_xml_text(node, "Path", f["path"])
    _set_xml_text(cap, "CaptureRecordingMode", "Delay")
    if memory_buffer_mb:
        try:
            cur = int((cap.findtext("MemoryBuffer") or "0").strip())
        except ValueError:
            cur = 0
        if cur < int(memory_buffer_mb):
            _set_xml_text(cap, "MemoryBuffer", str(int(memory_buffer_mb)))
    auto = _xml_child(cap, "CaptureAutomationConfiguration")
    _set_xml_text(auto, "EnableAudioTrigger", "false")
    _set_xml_text(auto, "EnableUDPTrigger", "true")
    _set_xml_text(auto, "UDPPort", str(int(udp_port)))
    _set_xml_text(auto, "AudioQuietPeriod", f"{float(quiet_period):.3f}")
    _set_xml_text(auto, "TriggerAction", "RecordVideo")
    _set_xml_text(auto, "DefaultTriggerArmed", "true")
    player = root.find("Player")
    if player is not None:  # keep swing lines visible on every frame (PlayerPreferences > InfoFading)
        fading = _xml_child(player, "InfoFading")
        _set_xml_text(fading, "Enabled", "true")
        _set_xml_text(fading, "AlwaysVisible", "true")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def patch_kinovea_prefs_legacy_general(xml_text: bytes | str) -> bytes:
    """2024.1: InstancesOwnPreferences (and AllowMultipleInstances) must be true in the BASE Preferences.xml,
    otherwise named instances ignore Preferences.<name>.xml (Software.PreferencesFile / Program.cs)."""
    root = ET.fromstring(xml_text)
    gen = _xml_child(root, "General")
    _set_xml_text(gen, "AllowMultipleInstances", "true")
    _set_xml_text(gen, "InstancesOwnPreferences", "true")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def kinovea_running_instances() -> tuple[set[str], int]:
    """(names of running `-name` Kinovea instances, total Kinovea.exe processes)."""
    names: set[str] = set()
    total = 0
    for p in psutil.process_iter(["name", "cmdline"]):
        try:
            if (p.info["name"] or "").lower() != "kinovea.exe":
                continue
            total += 1
            cmd = p.info["cmdline"] or []
            for i, arg in enumerate(cmd):
                if arg.lower() == "-name" and i + 1 < len(cmd):
                    names.add(cmd[i + 1])
        except psutil.Error:
            pass
    return names, total


def _trash_duplicate_kinovea_windows(windows_dir: Path, name: str, keep_id: str) -> None:
    """Move other descriptors with the same Name to Windows\\trash (Kinovea picks the first match by name)."""
    for f in windows_dir.glob("*.xml"):
        if f.stem.lower() == keep_id.lower():
            continue
        try:
            root = ET.parse(f).getroot()
        except (ET.ParseError, OSError):
            continue
        if root.tag == "KinoveaWindow" and (root.findtext("Name") or "") == name:
            trash = windows_dir / "trash"
            try:
                trash.mkdir(exist_ok=True)
                shutil.move(str(f), str(unique_path(trash / f.name)))
                LOG.info("Moved duplicate Kinovea window '%s' (%s) to %s", name, f.name, trash)
            except OSError as e:
                log_throttled(f"kwin-dup:{f}", f"could not move duplicate Kinovea window {f}: {e}")


def _close_kinovea_instance(name: str) -> None:
    pid = find_kinovea_instance_pid(name)
    if pid:
        _close_kinovea_pid(pid)  # WM_CLOSE: Kinovea saves its descriptor, then we overwrite it


def setup_video_rig_2025(cfg: dict, layout: dict, ref_name: str | None, club: str | None,
                         launch: bool, reload_ref: bool) -> dict:
    """Kinovea 2025.x: global prefs (UDP trigger + capture folders) + named window descriptors."""
    vcfg = cfg.get("video", {}) or {}
    folders = kinovea_capture_folders(cfg, layout)
    cap_root = kinovea_capture_root(cfg)
    if "onedrive" in str(cap_root).lower():
        LOG.warning("video.capture_root %s is inside OneDrive: sync locks can corrupt or delay clips", cap_root)
    for angle in ("DTL", "FO"):
        try:
            (cap_root / time.strftime("%Y-%m-%d") / angle).mkdir(parents=True, exist_ok=True)
        except OSError as e:
            log_throttled("kcap-root", f"could not create capture folder under {cap_root}: {e}")
    speed = vcfg.get("replay_speed_pct", 50)
    windows: dict[str, bytes] = {
        "Capture": build_kinovea_window_xml("Capture", [
            kinovea_capture_screen(cfg, "DTL", vcfg.get("dtl_camera", "DTL"), folders["DTL"]["id"]),
            kinovea_capture_screen(cfg, "FO", vcfg.get("fo_camera", "FO"), folders["FO"]["id"]),
        ]),
        "LiveReplay": build_kinovea_window_xml("LiveReplay", [
            {"type": "playback", "full_path": folders["replay_DTL"]["id"], "speed": speed, "is_watcher": True},
            {"type": "playback", "full_path": folders["replay_FO"]["id"], "speed": speed, "is_watcher": True},
        ]),
    }
    active_ref = ref_name or vcfg.get("default_reference", "My-Go-To")
    ref_dtl, ref_fo = resolve_reference_clips(cfg, active_ref, club)
    ref_screens = [{"type": "playback", "full_path": str(p), "speed": speed, "is_watcher": False}
                   for p in (ref_dtl, ref_fo) if p]
    if not ref_screens:
        ref_screens = [dict(s) for s in (
            {"type": "playback", "full_path": folders["replay_DTL"]["id"], "speed": speed, "is_watcher": True},
            {"type": "playback", "full_path": folders["replay_FO"]["id"], "speed": speed, "is_watcher": True})]
    windows["Reference"] = build_kinovea_window_xml("Reference", ref_screens)

    pids: dict = {}
    kdir = kinovea_settings_dir(create=True)
    if kdir is None:
        LOG.warning("Kinovea settings folder (%%APPDATA%%\\Kinovea) unavailable; cannot configure Kinovea 2025")
        return {"layout": layout, "workspaces": {}, "pids": pids, "reference": active_ref,
                "ref_clips": (ref_dtl, ref_fo), "backend": "2025"}
    running, total = kinovea_running_instances()

    # --- global preferences (shared by every 2025 instance)
    prefs_path = kdir / "Preferences.xml"
    try:
        old = prefs_path.read_bytes() if prefs_path.exists() else None
        new = patch_kinovea_prefs_2025(
            old, list(folders.values()), udp_port=int(vcfg.get("udp_trigger_port", KINOVEA_DEFAULT_UDP_PORT)),
            quiet_period=float(vcfg.get("trigger_quiet_period_sec", 3.0)),
            memory_buffer_mb=int(vcfg.get("kinovea_memory_buffer_mb", 2048)))
        if old is None or ET.tostring(ET.fromstring(old)) != ET.tostring(ET.fromstring(new)):
            if total and launch:
                for name in KINOVEA_WINDOW_NAMES:
                    if name in running:
                        _close_kinovea_instance(name)
                running, total = kinovea_running_instances()
            if total:
                LOG.warning("Kinovea is running (%d window(s) not started by SimWatch): close all Kinovea windows "
                            "and restart SimWatch video so it can enable the UDP trigger / capture folders.", total)
            else:
                write_text_if_changed(prefs_path, new)
                LOG.info("Updated Kinovea preferences (UDP trigger, capture folders) in %s", prefs_path)
    except (OSError, ET.ParseError, ValueError) as e:
        LOG.warning("Could not update Kinovea preferences %s: %s", prefs_path, e)

    # --- window descriptors
    wdir = kdir / "Windows"
    paths = {}
    for name, xml in windows.items():
        wid = kinovea_guid(f"window/{name}")
        path = wdir / f"{wid}.xml"
        paths[name] = path
        try:
            cur = path.read_bytes() if path.exists() else None
        except OSError:
            cur = None
        if kinovea_window_signature(cur) == kinovea_window_signature(xml):
            continue
        if name in running:
            if not launch or (name == "Reference" and not reload_ref and cur is not None):
                LOG.info("Kinovea window %s changed; it will apply on its next restart", name)
                continue
            _close_kinovea_instance(name)
            running.discard(name)
        try:
            _trash_duplicate_kinovea_windows(wdir, name, wid)
            write_text_if_changed(path, xml, backup=False)
            LOG.info("Wrote Kinovea window descriptor %s -> %s", name, path)
        except OSError as e:
            LOG.warning("Could not write Kinovea window %s: %s", path, e)
    if launch:
        for name in kinovea_windows_to_launch(cfg):
            pids[name] = launch_kinovea_instance(cfg, name, None)
    return {"layout": layout, "workspaces": paths, "pids": pids, "reference": active_ref,
            "ref_clips": (ref_dtl, ref_fo), "backend": "2025"}


def send_udp_trigger(port: int = KINOVEA_DEFAULT_UDP_PORT, host: str = "127.0.0.1", payload: bytes = b"simwatch") -> bool:
    """Fire Kinovea's UDP trigger (UDPMonitor accepts any datagram). Never raises."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.sendto(payload, (host, int(port)))
        return True
    except OSError as e:
        log_throttled("udp-trigger", f"UDP trigger to {host}:{port} failed: {e}")
        return False


def is_putt(club: str | None, ball_speed=None, vla=None) -> bool:
    """Putter, or an unlabelled roll (no club, < 20 mph and launch < 5 deg) - no video capture for these."""
    if club_category(club) == "Putter":
        return True
    if (club or "").strip():
        return False
    spd, ang = _num(ball_speed), _num(vla)
    return spd is not None and spd < 20.0 and (ang is None or ang < 5.0)


def file_ready_for_copy(path: Path, size_stable_sec: float, min_stable_sec: float = 1.5) -> bool:
    """A recording is complete when its size has been stable >= min_stable_sec AND (Windows) it can be
    opened with no sharing (Kinovea/OneDrive no longer hold it)."""
    if size_stable_sec < min_stable_sec:
        return False
    try:
        if path.stat().st_size <= 0:
            return False
    except OSError:
        return False
    return _can_open_exclusive(path)


def _can_open_exclusive(path: Path) -> bool:
    if not IS_WINDOWS:
        return True
    try:
        k32 = ctypes.windll.kernel32
        k32.CreateFileW.restype = ctypes.c_void_p
        h = k32.CreateFileW(str(path), 0x80000000, 0, None, 3, 0x80, None)  # GENERIC_READ, share none
        if h in (None, ctypes.c_void_p(-1).value):
            return False
        k32.CloseHandle(ctypes.c_void_p(h))
        return True
    except Exception:
        return False


def wait_file_ready(path: Path, timeout: float = 8.0, stable_sec: float = 0.6) -> bool:
    """Block until `path` has a stable size for stable_sec and opens exclusively (used by clip-ready)."""
    deadline = time.time() + timeout
    last, since = -1, time.time()
    while time.time() < deadline:
        try:
            size = path.stat().st_size
        except OSError:
            size = -1
        if size != last:
            last, since = size, time.time()
        elif size > 0 and file_ready_for_copy(path, time.time() - since, stable_sec):
            return True
        time.sleep(0.15)
    return False


# --------------------------------------------------------------------------- clip-ready (Kinovea post-recording)

CLIP_EVENTS_DIR = ".clip-events"  # <today>/.clip-events/*.json: clip-ready -> running watchdog notifications
CLIP_READY_LOCK_TIMEOUT_SEC = 60.0   # how long a clip-ready run waits for the other angle's run
CLIP_READY_LOCK_STALE_SEC = 120.0    # a lock older than this is from a crashed run (must exceed one run's work)
CLIP_EVENTS_YESTERDAY_SEC = 900.0    # after midnight, the watchdog also drains yesterday's .clip-events this long
CLIP_LINK_MAX_ATTEMPTS = 8           # watchdog-side retries for a clip link clip-ready could not write


def angle_from_camalias(camalias: str | None, path: Path | None = None, cfg: dict | None = None) -> str:
    """'DTL'/'FO' from the command's angle/alias argument, else from the file name / folder."""
    vcfg = (cfg or {}).get("video", {}) or {}
    a = (camalias or "").strip().strip('"')
    if a and "%" not in a:
        if a.upper() in ("FO", str(vcfg.get("fo_camera", "FO")).upper()):
            return "FO"
        if a.upper() in ("DTL", str(vcfg.get("dtl_camera", "DTL")).upper()):
            return "DTL"
    if path is not None:
        text = f"{path.parent.name}/{path.name}"
        if re.search(r"(?:^|[_\-\s/\\])FO(?:$|[_\-\s.])", text, re.I):
            return "FO"
    return "DTL"


def _shot_epoch(shot: dict) -> float | None:
    try:
        return datetime.fromisoformat(str(shot.get("ts"))).timestamp()
    except (TypeError, ValueError):
        return None


def clip_library_name(shot: dict | None, angle: str, ext: str, number: int | None = None) -> str:
    """Existing naming scheme: NNN_<club>[_<carry>y][_<speed>mph][_D-<drill>]_<ANGLE>.<ext>."""
    ext = ext.lower() if ext.startswith(".") else f".{ext.lower()}"
    if not shot:
        return f"{int(number or 1):03d}_Swing_{angle}{ext}"
    ball = shot.get("ball") or {}
    club = str(shot.get("club") or "Swing").replace(" ", "")
    carry, speed = _num(ball.get("carry")), _num(ball.get("speed"))
    carry_part = f"_{int(round(carry))}y" if carry else ""
    speed_part = f"_{int(round(speed))}mph" if speed else ""
    n = shot.get("shot_num") or number or 1
    return f"{int(n):03d}_{club}{carry_part}{speed_part}{drill_filename_tag(shot.get('drill_id'))}_{angle}{ext}"


def _has_angle_clip(folder: Path, number: int, angle: str) -> bool:
    """A library file NNN_..._<ANGLE>[_2|-1].<ext> exists (only for clips with NO shot record)."""
    rx = re.compile(rf"^{int(number):03d}_.*_{angle}(?:[_-]\d+)?\.[A-Za-z0-9]+$", re.I)
    return any(rx.match(p.name) for p in folder.glob(f"{int(number):03d}_*") if p.suffix.lower() in VIDEO_EXTS)


def find_shot_for_clip(shots: list[dict], clip_time: float, angle: str, library_dir: Path | None = None,
                       window_sec: float = 20.0, taken: set | None = None) -> dict | None:
    """Most recent shot within window_sec before the clip finished that has no `angle` clip yet.

    "Already clipped" comes from the shot record (clips{} / clip) plus `taken` {(ts, angle)} (clip-ready's
    ledger, which also covers a link that failed to write) - never from file numbers, which repeat when
    the launch monitor's ShotNumber resets. library_dir is unused (kept for callers)."""
    best = None
    taken = taken or set()
    for s in shots:
        t = _shot_epoch(s)
        if t is None or not (clip_time - window_sec <= t <= clip_time + 2.0):
            continue
        if is_putt(s.get("club"), (s.get("ball") or {}).get("speed"), (s.get("ball") or {}).get("vla")):
            continue
        if shot_has_angle_clip(s, angle) or (s.get("ts"), angle) in taken:
            continue
        if best is None or t > _shot_epoch(best):
            best = s
    return best


def clip_search_dates(clip_time: float, window_sec: float) -> list[str]:
    """Day folders whose shots can match a clip finished at clip_time: its own day, plus the previous day
    when the match window reaches back across midnight (23:59:58 shot, clip lands 00:00:05)."""
    day = datetime.fromtimestamp(clip_time).strftime("%Y-%m-%d")
    earliest = datetime.fromtimestamp(clip_time - window_sec).strftime("%Y-%m-%d")
    return [day] if earliest == day else [day, earliest]


class _FileLock:
    """Tiny cross-process lock (O_EXCL lock file, stale after `stale_sec`). Serializes clip-ready runs
    (Kinovea fires DTL and FO commands at nearly the same moment) and shots.jsonl writers."""

    def __init__(self, path: Path, timeout: float = 10.0, stale_sec: float = 30.0):
        self.path, self.timeout, self.stale_sec = path, timeout, stale_sec
        self.fd = None

    def __enter__(self):
        deadline = time.time() + self.timeout
        self.path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                self.fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(self.fd, str(os.getpid()).encode())
                return self
            except (FileExistsError, PermissionError):
                # PermissionError: on Windows, O_EXCL on a lock file the previous holder just unlinked (still
                # "delete pending" while AV/indexer holds a handle) fails with ACCESS_DENIED, not EEXIST.
                # Treat it as busy and retry; otherwise the second clip-ready angle / a shot append is dropped.
                try:
                    if time.time() - self.path.stat().st_mtime > self.stale_sec:
                        self.path.unlink(missing_ok=True)
                        continue
                except OSError:
                    pass
                if time.time() >= deadline:
                    raise TimeoutError(f"lock busy: {self.path}")
                time.sleep(0.1)

    def __exit__(self, *exc):
        try:
            if self.fd is not None:
                os.close(self.fd)
            self.path.unlink(missing_ok=True)
        except OSError:
            pass


def clip_ready(cfg: dict, src: Path, camalias: str | None, now: float | None = None, wait: bool = True) -> dict:
    """Organize one finished Kinovea recording: link to its shot, copy into the swing library + replay
    folder with .kva swing lines, and drop a notification for the running watchdog. Idempotent per source.

    The library copy, the shot link and the watchdog event go to the SHOT's day folder (a clip that lands
    just after midnight belongs to the previous day's shot); the replay copy goes to the clip's day (the
    folder Kinovea's LiveReplay watches via %date%)."""
    src = Path(src)
    angle = angle_from_camalias(camalias, src, cfg)
    if not src.exists() or src.suffix.lower() not in VIDEO_EXTS:
        return {"status": "skipped", "reason": f"not a video file: {src}"}
    if wait and not wait_file_ready(src):
        LOG.warning("clip-ready: %s still locked/growing after timeout; continuing anyway", src.name)
    layout = ensure_swings_layout(cfg)
    vcfg = cfg.get("video", {}) or {}
    store = ShotStore(bridge_sessions_dir(cfg))
    try:
        clip_time = src.stat().st_mtime if now is None else now
    except OSError:
        clip_time = time.time()
    window = float(cfg_number(vcfg.get("clip_link_window_sec", 20.0), 20.0))
    dates = clip_search_dates(clip_time, window)
    clip_date = dates[0]
    clip_lib = layout["sessions"] / clip_date
    clip_lib.mkdir(parents=True, exist_ok=True)
    ledger_path = clip_lib / "clip_ready_ledger.json"
    # DTL and FO fire together; the first run copies ~100 MB twice and may decode the clip (OpenCV ball
    # detect + path trace), so the second must be able to wait well past 10 s without stealing the lock.
    # One lock at the Sessions root (not per day) so two angles straddling midnight still serialize.
    with _FileLock(layout["sessions"] / ".clip-ready.lock", timeout=CLIP_READY_LOCK_TIMEOUT_SEC,
                   stale_sec=CLIP_READY_LOCK_STALE_SEC):
        ledgers: dict[str, dict] = {}
        for d in dates:
            try:
                ledgers[d] = json.loads((layout["sessions"] / d / "clip_ready_ledger.json").read_text(encoding="utf-8"))
            except (OSError, ValueError):
                ledgers[d] = {}
        ledger = ledgers[clip_date]
        key = str(src.resolve()).lower()
        prev = ledger.get(key)
        if prev and (layout["sessions"] / str(prev.get("date") or clip_date) / prev["clip"]).exists():
            return {"status": "duplicate", **prev}
        taken = {(e.get("ts"), e.get("angle")) for led in ledgers.values() for e in led.values()
                 if isinstance(e, dict) and e.get("ts")}
        shots = [r for d in dates for r in store.read(d)]
        shot = find_shot_for_clip(shots, clip_time, angle, None, window, taken)
        shot_date = str(shot["ts"])[:10] if shot and shot.get("ts") else clip_date
        lib = layout["sessions"] / shot_date
        lib.mkdir(parents=True, exist_ok=True)
        number = None
        if not shot:
            other = "FO" if angle == "DTL" else "DTL"
            nums = [int(m.group(1)) for p in lib.glob("*") if (m := re.match(r"^(\d{3})_", p.name))]
            # Also stay above recorded shot numbers so a later real shot never collides with this clip.
            for s_ in store.read(shot_date):
                if (n_ := _int_or_none(s_.get("shot_num"))) is not None:
                    nums.append(n_)
            number = max(nums, default=0) + 1
            for p in sorted(lib.glob(f"*_{other}.*"), key=lambda q: q.stat().st_mtime, reverse=True)[:1]:
                m = re.match(r"^(\d{3})_", p.name)
                if m and abs(p.stat().st_mtime - clip_time) < 15 and not _has_angle_clip(lib, int(m.group(1)), angle):
                    number = int(m.group(1))
        name = clip_library_name(shot, angle, src.suffix, number)
        dest = unique_path(lib / name)
        club = (shot or {}).get("club")
        kva_xml = None
        if bool(vcfg.get("swing_lines", {}).get("enabled", True)):
            try:
                kva_xml = build_swing_kva_xml(angle, club, cfg, video_path=src)
            except Exception as e:
                LOG.warning("clip-ready: swing lines failed for %s: %s", src.name, e)
        if kva_xml:
            dest.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
        shutil.copy2(src, dest)
        # Replay folder (watched by LiveReplay): .kva first, then the video, so the observer finds both.
        replay = unique_path(clip_lib / angle / dest.name)
        replay.parent.mkdir(parents=True, exist_ok=True)
        if kva_xml:
            replay.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
        shutil.copyfile(src, replay)
        linked = False
        if shot and shot.get("ts"):
            # Works with or without a watchdog: the link is written here, under the shots.jsonl lock. If it
            # can't be (lock busy / file held), the event says linked=false and the watchdog retries it.
            try:
                linked = store.set_clip(shot["ts"], dest.name, angle)
            except OSError as e:
                LOG.warning("clip-ready: could not link clip to shot (watchdog will retry): %s", e)
        result = {"status": "ok", "clip": dest.name, "angle": angle, "ts": (shot or {}).get("ts"),
                  "date": shot_date, "linked": linked, "src": str(src), "replay": str(replay)}
        ledger[key] = {"clip": dest.name, "angle": angle, "ts": result["ts"], "date": shot_date}
        write_text_if_changed(ledger_path, json.dumps(ledger, indent=1), backup=False)
        ev_dir = lib / CLIP_EVENTS_DIR
        ev_dir.mkdir(exist_ok=True)
        write_text_if_changed(ev_dir / f"{time.time_ns()}_{angle}.json", json.dumps(result), backup=False)
    LOG.info("clip-ready: %s -> %s/%s (shot %s, linked=%s)", src.name, shot_date, dest.name, result["ts"], linked)
    return result


def cmd_clip_ready(config_path: Path, path: str | None, camalias: str | None) -> int:
    """`simwatch.py clip-ready <path> <angle>` - Kinovea's post-recording command. Always exits 0."""
    try:
        if not path:
            LOG.error("clip-ready: no file path given")
            return 0
        try:
            cfg = load_config(Path(config_path), command="clip-ready")
        except SystemExit as e:
            LOG.error("clip-ready: config problem (%s); using defaults", e)
            cfg = {"video": {}, "bridge": {}}
        try:
            clip_ready(cfg, Path(path.strip('"')), camalias)
        except TimeoutError as e:
            LOG.warning("clip-ready: %s; retrying once", e)
            clip_ready(cfg, Path(path.strip('"')), camalias)
    except BaseException as e:  # never fail Kinovea's command (raw capture stays in the capture folder)
        LOG.error("clip-ready failed for %s: %s", path, e, exc_info=not isinstance(e, (SystemExit, KeyboardInterrupt)))
    return 0


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
            log_throttled("swing-template", f"could not load swing line template {p}: {e}")
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
    # Kinovea only loads custom tools from <install dir>\DrawingTools\Custom (Software.CustomToolsDirectory);
    # Swings/Workspaces/CustomTools is a gitignored staging copy for manual install.
    targets = [layout["workspaces"] / "CustomTools"]

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
            log_throttled(f"ktools:{folder}", f"install_kinovea_custom_golf_tools ({folder}) failed: {e}")
    k_exe = Path(cfg.get("video", {}).get("kinovea_exe", r"C:\Program Files\Kinovea\Kinovea.exe"))
    install_custom = k_exe.parent / "DrawingTools" / "Custom"
    if install_custom.parent.exists():
        try:
            install_custom.mkdir(parents=True, exist_ok=True)
            for fname, xml_src in (("Golf_DTL_VPlane.xml", dtl_tool_xml), ("Golf_FO_Box.xml", fo_tool_xml)):
                dst = install_custom / fname
                if not dst.exists() or dst.read_text(encoding="utf-8", errors="replace") != xml_src:
                    dst.write_text(xml_src, encoding="utf-8")
                written.append(dst)
        except OSError as e:
            staged = layout["workspaces"] / "CustomTools"
            log_throttled(
                "ktools-install",
                f"Kinovea custom golf tools not installed ({e}). One-time fix: copy {staged}\\*.xml into "
                f"{install_custom} from an Administrator Explorer/terminal (Program Files is admin-only), "
                f"or run `python simwatch.py lines apply` once from an Administrator terminal.",
                every_sec=3600,
            )
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
    install_kinovea_custom_golf_tools(cfg)
    apply_swing_lines_to_active_clips(cfg, club=club, overwrite=False)
    if resolve_kinovea_backend(cfg) == "2025":
        return setup_video_rig_2025(cfg, layout, ref_name, club, launch, reload_ref)
    sync_kinovea_instance_prefs(cfg, layout)

    # Legacy workspaces are machine-specific (absolute paths): generated at runtime, gitignored.
    cap_xml = layout["workspaces"] / "Capture.xml"
    live_xml = layout["workspaces"] / "LiveReplay.xml"
    ref_xml = layout["workspaces"] / "Reference.xml"

    write_kinovea_workspace(cap_xml, [
        {
            "type": "capture",
            "camera_name": vcfg.get("dtl_camera", "DTL"),
            "autostream": True,
            "delay": vcfg.get("pre_trigger_sec", 3.0),
            "delayed_display": True,
        },
        {
            "type": "capture",
            "camera_name": vcfg.get("fo_camera", "FO"),
            "autostream": True,
            "delay": vcfg.get("pre_trigger_sec", 3.0),
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
        if "Reference" in kinovea_windows_to_launch(cfg):
            pids["Reference"] = launch_kinovea_instance(cfg, "Reference", ref_xml, force_reload=reload_ref)
    return {
        "layout": layout,
        "workspaces": {"Capture": cap_xml, "LiveReplay": live_xml, "Reference": ref_xml},
        "pids": pids,
        "reference": active_ref,
        "ref_clips": (ref_dtl, ref_fo),
        "backend": "legacy",
    }


def tile_video_windows(cfg, wait_sec: float = 0.0) -> None:
    """The 2x2 grid (video.layout.profile = "grid"): LiveReplay (top 50%) and Reference (bottom 50%) on the TV.
    The default adaptive layout uses VideoLayoutController instead."""
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
    # Stable UUIDs so regenerating the collection yields byte-identical JSON (lets us skip no-op rewrites).
    src_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, "simwatch/obs/source/kinovea-liveReplay"))
    scene_uuid = str(uuid.uuid5(uuid.NAMESPACE_URL, "simwatch/obs/scene/dtl-fo-pip"))

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
    write_text_if_changed(out, raw_json)
    obs_dst = _obs_scenes_target_path()
    if obs_dst:
        try:
            if write_text_if_changed(obs_dst, raw_json):
                LOG.info("Wrote OBS scene collection %s (previous kept as %s.bak)", obs_dst, obs_dst.name)
        except OSError as e:
            log_throttled("obs-scene-copy", f"OBS scene collection copy skipped: {e}")
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
        log_throttled("obs-start", f"could not start OBS: {e}")
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
        """The OBS projector window. Cached and searched INCLUDING hidden windows (we SW_HIDE it between
        shots, and a visible-only search could never find it again), restricted to OBS processes so an
        unrelated window titled 'Windowed Projector...' is never restyled."""
        import win32gui
        import win32process
        rx = re.compile(self._pip_cfg().get("window_title_re", r"^Windowed Projector"))
        h = getattr(self, "_hwnd", None)
        try:
            if h and win32gui.IsWindow(h) and rx.search(win32gui.GetWindowText(h) or ""):
                return h
        except Exception:
            pass
        obs_pids = set()
        for p in psutil.process_iter(["pid", "name"]):
            try:
                if re.match(r"^obs(64|32)?\.exe$", (p.info["name"] or ""), re.I):
                    obs_pids.add(p.info["pid"])
            except psutil.Error:
                pass
        found: list[int] = []

        def cb(hwnd, _):
            try:
                t = win32gui.GetWindowText(hwnd) or ""
                if t and rx.search(t) and win32process.GetWindowThreadProcessId(hwnd)[1] in obs_pids:
                    found.append(hwnd)
            except Exception:
                pass
            return True

        if obs_pids:
            try:
                win32gui.EnumWindows(cb, None)
            except Exception:
                pass
        self._hwnd = found[0] if found else None
        return self._hwnd

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
                if not show:
                    self.visible = False  # projector window is gone (OBS closed): nothing left on screen
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
            log_throttled(f"pip-overlay:{show}", f"PiP overlay (show={show}) failed: {e}")
            return False

    def show_for_shot(self) -> None:
        pc = self._pip_cfg()
        if not pc.get("enabled", True):
            return
        if self._apply_overlay(True):
            if not self.pinned:
                self.hide_at = time.time() + cfg_number(pc.get("popup_seconds", 12), 12.0)
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
            # Log only a real hide: a failing hide is retried every tick (0.5 s) and must not flood the log.
            if self._apply_overlay(False):
                LOG.info("Projector PiP auto-hidden")

    def status_text(self) -> str:
        if self.visible and self.pinned:
            return "Pinned ON"
        if self.visible:
            rem = max(0, int(self.hide_at - time.time()))
            return f"Auto-Pop ({rem}s)"
        return "Hidden"


# --------------------------------------------------------------------------- adaptive layout, post-shot replay, compare
# Pure logic first (select_video_layout, ReplayScheduler, compare cycling) so it is testable off Windows; the
# Win32 side lives in KinoveaWindowOps, which VideoLayoutController calls through a small interface.

_VIDEO_STATE_LOCK = threading.Lock()


def read_video_state(path: Path | None = None) -> dict:
    try:
        doc = json.loads((path or VIDEO_STATE_PATH).read_text(encoding="utf-8"))
        return doc if isinstance(doc, dict) else {}
    except (OSError, ValueError):
        return {}


def write_video_state(path: Path | None = None, **sections) -> None:
    """Merge sections into video_state.json (atomic). Read by `status` and `doctor`. Never raises."""
    target = path or VIDEO_STATE_PATH
    with _VIDEO_STATE_LOCK:
        doc = read_video_state(target)
        if doc.get("pid") != os.getpid():
            doc = {}  # written by an earlier run: start fresh
        doc.update(sections)
        doc["pid"] = os.getpid()
        doc["updated"] = datetime.now().isoformat(timespec="seconds")
        try:
            tmp = target.with_name(target.name + ".tmp")
            tmp.write_text(json.dumps(doc, indent=2, default=str), encoding="utf-8")
            os.replace(tmp, target)
        except OSError as e:
            log_throttled("video-state-write", f"could not write {target}: {e}")


def video_state_live(state: dict) -> bool:
    """True when video_state.json was written by a process that is still running."""
    pid = state.get("pid") if isinstance(state, dict) else None
    try:
        return bool(pid) and psutil.pid_exists(int(pid))
    except (ValueError, TypeError, psutil.Error):
        return False


VIDEO_LAYOUT_PROFILES = ("single_small", "single_large", "dual", "grid")
HIDE_METHODS = ("behind", "offscreen", "minimized")
COMPARE_WINDOW = "Compare"
VIDEO_LAYOUT_DEFAULTS = {
    "profile": "auto",          # auto | single_small | single_large | dual | grid (grid = the old 2x2 tiling)
    "large_min_width": 1600,    # one display at least this wide -> single_large
    "capture_hide": "behind",   # where the recording Capture window waits: behind | offscreen | minimized
    "replay_hide": "behind",    # where LiveReplay waits between replays (same choices)
    "display_poll_sec": 5,      # how often to re-check the displays (projector on/off, resolution change)
    "profiles": {
        "single_small": {"replay_width_pct": 100, "replay_height_pct": 80, "anchor": "top"},
        "single_large": {"replay_width_pct": 75, "replay_height_pct": 65, "anchor": "top",
                         "strip": False, "strip_width_pct": 30, "strip_height_pct": 22,
                         "strip_corner": "bottom-right"},
        "dual": {"replay_width_pct": 100, "replay_height_pct": 100, "anchor": "top", "always_on": True},
    },
}
REPLAY_DEFAULTS = {
    "mode": "auto",                 # auto (pop up after each shot) | off (only on Alt+V)
    "delay_sec": 8,                 # wait after the shot before the replay (ball flight + GSPro result panel)
    "delay_by_club": {"Driver": 9, "Iron": 8, "Wedge": 6, "Putter": None},  # null = no replay for that club
    "show_sec": 10,                 # how long the replay stays up (~one 4.5 s clip loop at 50 % speed)
    "manual_delay_sec": 4,          # Alt+C manual trigger: no ball flight, just wait for the clip
    "clip_wait_sec": 4,             # if the clip isn't saved by show time, wait up to this much longer
    "dismiss_on_input": False,      # opt-in: ANY key/mouse input closes the replay (a bumped mouse counts; GetLastInputInfo cannot tell them apart)
    "input_grace_sec": 1.5,         # ...except in the first moments after it appears / after a hotkey
    "cancel_on_club_change": False,  # GSPro auto-selects the next club right after landing: off by default
    "restore_focus": True,          # give GSPro the keyboard back if a Kinovea window took it
}


def _merge_defaults(defaults: dict, over) -> dict:
    out = _jcopy(defaults)
    if isinstance(over, dict):
        for k, v in over.items():
            if isinstance(v, dict) and isinstance(out.get(k), dict):
                out[k] = _merge_defaults(out[k], v)
            else:
                out[k] = _jcopy(v)
    return out


def video_layout_cfg(cfg: dict | None) -> dict:
    vcfg = (cfg or {}).get("video") if isinstance((cfg or {}).get("video"), dict) else {}
    return _merge_defaults(VIDEO_LAYOUT_DEFAULTS, vcfg.get("layout"))


def replay_cfg(cfg: dict | None) -> dict:
    vcfg = (cfg or {}).get("video") if isinstance((cfg or {}).get("video"), dict) else {}
    out = _merge_defaults(REPLAY_DEFAULTS, vcfg.get("replay"))
    if isinstance(vcfg.get("replay"), dict) and isinstance(vcfg["replay"].get("delay_by_club"), dict):
        out["delay_by_club"] = dict(vcfg["replay"]["delay_by_club"])  # an explicit table replaces the defaults
    return out


def replay_delay_for_club(rcfg: dict, club: str | None) -> float | None:
    """Seconds to wait after a shot before the replay, or None for no replay (e.g. Putter)."""
    by = rcfg.get("delay_by_club") if isinstance(rcfg.get("delay_by_club"), dict) else {}
    if club:
        cat = club_category(club)
        if cat in by:
            v = by[cat]
            if v is None or v is False:
                return None
            return max(0.0, cfg_number(v, cfg_number(rcfg.get("delay_sec"), 8.0)))
    return max(0.0, cfg_number(rcfg.get("delay_sec"), 8.0))


def gspro_effective_windowed(cfg: dict, projector_on: bool) -> bool:
    """What gspro_configure picks: gspro_display.windowed, or windowed anyway while the projector is off and the
    video rig is enabled (gspro_display.windowed_when_projector_off)."""
    gdisp = cfg.get("gspro_display", {}) if isinstance(cfg.get("gspro_display"), dict) else {}
    windowed = bool(gdisp.get("windowed", False))
    if (not projector_on and (cfg.get("video") or {}).get("enabled", False)
            and gdisp.get("windowed_when_projector_off", True)):
        windowed = True
    return windowed


def _pct_rect(d: dict, width_pct, height_pct, anchor: str = "top") -> tuple[int, int, int, int]:
    w = max(320, min(d["width"], int(d["width"] * cfg_number(width_pct, 100) / 100)))
    h = max(180, min(d["height"], int(d["height"] * cfg_number(height_pct, 100) / 100)))
    x = d["left"] + (d["width"] - w) // 2
    anchor = str(anchor or "top").lower()
    if anchor == "bottom":
        y = d["top"] + d["height"] - h
    elif anchor == "center":
        y = d["top"] + (d["height"] - h) // 2
    else:
        y = d["top"]
    return x, y, w, h


def _corner_rect(d: dict, width_pct, height_pct, corner: str, margin: int = 12) -> tuple[int, int, int, int]:
    w = max(240, int(d["width"] * cfg_number(width_pct, 30) / 100))
    h = max(135, int(d["height"] * cfg_number(height_pct, 22) / 100))
    corner = str(corner or "bottom-right").lower()
    x = d["left"] + margin if "left" in corner else d["left"] + d["width"] - w - margin
    y = d["top"] + margin if "top" in corner else d["top"] + d["height"] - h - margin
    return x, y, w, h


_FALLBACK_DISPLAY = {"device": "DISPLAY1", "left": 0, "top": 0, "width": 1920, "height": 1080, "primary": True}


def select_video_layout(displays: list[dict], lcfg: dict | None = None, gspro_index: int = 0) -> dict:
    """Pure: displays (list_displays order) + video.layout config + GSPro's display -> the layout profile and the
    rectangles to use. Never raises."""
    lcfg = _merge_defaults(VIDEO_LAYOUT_DEFAULTS, lcfg)
    displays = [d for d in (displays or []) if isinstance(d, dict) and d.get("width") and d.get("height")]
    if not displays:
        displays = [dict(_FALLBACK_DISPLAY)]
    gidx = gspro_index if isinstance(gspro_index, int) and 0 <= gspro_index < len(displays) else 0
    g = displays[gidx]
    min_w = cfg_number(lcfg.get("large_min_width"), 1600)
    want = str(lcfg.get("profile") or "auto").strip().lower()
    note = ""
    if want != "auto" and want not in VIDEO_LAYOUT_PROFILES:
        note, want = f"unknown video.layout.profile {want!r}, using auto", "auto"
    if want == "dual" and len(displays) < 2:
        note, want = "dual requested but only one display is connected, using auto", "auto"
    if want == "auto":
        if len(displays) >= 2:
            profile = "dual"
        elif g["width"] >= min_w:
            profile = "single_large"
        else:
            profile = "single_small"
        forced = False
    else:
        profile, forced = want, True

    ridx = gidx
    if profile == "dual":
        others = [i for i in range(len(displays)) if i != gidx]
        ridx = max(others, key=lambda i: (displays[i]["width"] * displays[i]["height"], displays[i].get("primary", False)))
    r = displays[ridx]
    sizes = " + ".join(f"{d['width']}x{d['height']}" for d in displays)
    if profile == "dual":
        reason = (f"{len(displays)} displays ({sizes}): GSPro on Display {gidx + 1}, "
                  f"replay screen = Display {ridx + 1}")
    elif profile == "grid":
        reason = "2x2 grid (video.layout.profile = grid)"
    else:
        cmp_ = ">=" if g["width"] >= min_w else "<"
        reason = f"{len(displays)} display(s) ({sizes}); GSPro display {g['width']} px wide {cmp_} {int(min_w)}"
    if forced:
        reason = f"forced by video.layout.profile; {reason}"
    if note:
        reason = f"{reason} ({note})"

    pcfg = lcfg.get("profiles", {}).get(profile, {}) if isinstance(lcfg.get("profiles"), dict) else {}
    pcfg = pcfg if isinstance(pcfg, dict) else {}
    replay_rect = _pct_rect(r, pcfg.get("replay_width_pct", 100), pcfg.get("replay_height_pct", 100),
                            pcfg.get("anchor", "top"))
    strip_rect = None
    if profile == "single_large" and pcfg.get("strip"):
        strip_rect = _corner_rect(r, pcfg.get("strip_width_pct", 30), pcfg.get("strip_height_pct", 22),
                                  pcfg.get("strip_corner", "bottom-right"))

    def _method(key: str) -> str:
        m = str(lcfg.get(key) or "behind").strip().lower()
        return m if m in HIDE_METHODS else "behind"

    vright = max(d["left"] + d["width"] for d in displays)
    return {
        "profile": profile,
        "reason": reason,
        "displays": len(displays),
        "gspro_display": gidx,
        "replay_display": ridx,
        "replay_rect": replay_rect,
        "strip_rect": strip_rect,
        "always_on": bool(pcfg.get("always_on", profile == "dual")),
        "topmost": profile != "dual",   # over GSPro on a shared screen; a normal window on its own screen
        "capture_hide": _method("capture_hide"),
        "replay_hide": _method("replay_hide"),
        "park_rect": (g["left"], g["top"], g["width"], g["height"]),           # behind GSPro, same display
        "offscreen_rect": (vright + 64, g["top"], g["width"], g["height"]),     # right of every display
    }


def layout_summary(layout: dict | None) -> str:
    """One line for logs/status/doctor (also accepts the trimmed copy stored in video_state.json)."""
    if not layout:
        return "unknown"
    s = f"{layout.get('profile')} - {layout.get('reason', '')}"
    if layout.get("profile") != "grid" and layout.get("replay_rect"):
        x, y, w, h = layout["replay_rect"]
        s += f"; replay {w}x{h} at ({x},{y}); Capture hidden: {layout.get('capture_hide')}"
        if layout.get("always_on"):
            s += "; replay always on"
    return s


class ReplayScheduler:
    """Post-shot replay timing (pure, thread-safe; `now` is passed in). Methods return the window action the
    caller must perform: "show", "hide" or None.

    shot -> wait delay (per club) -> show (once the clip is saved, or clip_wait_sec later) -> hide after
    show_sec, or on the next shot / any user input / Alt+X. Pinned (Alt+K, or held by compare mode) never
    auto-hides. always_on (dual screen): never auto-hides; a shot only refreshes it."""

    IDLE, WAITING, SHOWING = "idle", "waiting", "showing"

    def __init__(self, rcfg: dict | None = None, always_on: bool = False):
        self.cfg = _merge_defaults(REPLAY_DEFAULTS, rcfg)
        if isinstance((rcfg or {}).get("delay_by_club"), dict):
            self.cfg["delay_by_club"] = dict(rcfg["delay_by_club"])
        mode = str(self.cfg.get("mode") or "auto").lower()
        self.mode = mode if mode in ("auto", "off") else "auto"
        self.always_on = bool(always_on)
        self.state = self.IDLE
        self.pinned = False
        self.show_at = self.hide_at = self.clip_deadline = self.shown_at = 0.0
        self.clip_ready = False
        self.ignore_input_until = 0.0
        self._lock = threading.Lock()

    def _num(self, key: str, default: float) -> float:
        return max(0.0, cfg_number(self.cfg.get(key), default))

    def _show(self, now: float, pinned: bool = False) -> str:
        self.state = self.SHOWING
        self.shown_at = now
        self.pinned = pinned
        self.hide_at = 0.0 if (pinned or self.always_on) else now + self._num("show_sec", 10.0)
        self.ignore_input_until = max(self.ignore_input_until, now + self._num("input_grace_sec", 1.5))
        return "show"

    def _hide(self) -> str | None:
        was = self.state == self.SHOWING
        self.state, self.pinned, self.hide_at = self.IDLE, False, 0.0
        return "hide" if was else None

    def on_shot(self, now: float, club: str | None = None, delay: float | None = -1.0) -> str | None:
        """A new shot. delay=-1 -> look it up per club; None -> no replay for this shot."""
        with self._lock:
            if delay is not None and delay < 0:
                delay = replay_delay_for_club(self.cfg, club)
            if self.always_on:
                if self.state != self.SHOWING:
                    self.state, self.show_at = self.WAITING, now
                    self.clip_ready, self.clip_deadline = False, now + self._num("clip_wait_sec", 4.0)
                return None
            action = self._hide() if self.state == self.SHOWING else None  # watch the new ball fly
            if self.mode == "off" or delay is None:
                self.state = self.IDLE
                return action
            self.state, self.show_at, self.clip_ready = self.WAITING, now + delay, False
            self.clip_deadline = self.show_at + self._num("clip_wait_sec", 4.0)
            return action

    def on_clip_ready(self, now: float) -> None:
        with self._lock:
            self.clip_ready = True

    def on_club_change(self, now: float) -> str | None:
        with self._lock:
            if not self.cfg.get("cancel_on_club_change") or self.always_on:
                return None
            if self.state == self.WAITING:
                self.state = self.IDLE
                return None
            if self.state == self.SHOWING and not self.pinned:
                return self._hide()
            return None

    def tick(self, now: float, last_input: float | None = None) -> str | None:
        with self._lock:
            if self.state == self.WAITING:
                if now >= self.show_at and (self.clip_ready or now >= self.clip_deadline):
                    return self._show(now)
                return None
            if self.state != self.SHOWING or self.pinned or self.always_on:
                return None
            if self.hide_at and now >= self.hide_at:
                return self._hide()
            if (self.cfg.get("dismiss_on_input", False) and last_input is not None
                    and last_input > self.ignore_input_until and last_input > self.shown_at):
                return self._hide()
            return None

    def note_hotkey(self, now: float) -> None:
        """A SimWatch hotkey was pressed: that key press must not count as 'user input -> dismiss'."""
        with self._lock:
            self.ignore_input_until = max(self.ignore_input_until, now + self._num("input_grace_sec", 1.5))

    def show_now(self, now: float) -> str:
        with self._lock:
            return self._show(now, pinned=self.pinned)

    def toggle_pin(self, now: float) -> str | None:
        with self._lock:
            if self.state == self.SHOWING and self.pinned:
                return self._hide()
            if self.state == self.SHOWING:
                self.pinned, self.hide_at = True, 0.0
                return None
            return self._show(now, pinned=True)

    def hold(self, now: float) -> str | None:
        """Keep it open (compare mode). Returns "show" if it wasn't showing."""
        with self._lock:
            if self.state == self.SHOWING:
                self.pinned, self.hide_at = True, 0.0
                return None
            return self._show(now, pinned=True)

    def release(self, now: float) -> None:
        """End a hold: back to a normal timed replay."""
        with self._lock:
            if self.state == self.SHOWING:
                self.pinned = False
                self.hide_at = 0.0 if self.always_on else now + self._num("show_sec", 10.0)
                self.ignore_input_until = max(self.ignore_input_until, now + self._num("input_grace_sec", 1.5))

    def dismiss(self, now: float) -> str | None:
        with self._lock:
            if self.state == self.WAITING:
                self.state = self.IDLE
                return None
            return self._hide()

    def toggle_mode(self, now: float) -> str:
        with self._lock:
            self.mode = "off" if self.mode == "auto" else "auto"
            if self.mode == "off" and self.state == self.WAITING:
                self.state = self.IDLE
            return self.mode

    def status_text(self, now: float) -> str:
        with self._lock:
            if self.state == self.SHOWING:
                if self.pinned:
                    return "showing (kept open)"
                if self.always_on:
                    return "showing (replay screen)"
                return f"showing ({max(0, int(self.hide_at - now))}s left)"
            if self.state == self.WAITING:
                return f"replay in {max(0, int(self.show_at - now))}s"
            return f"auto ({'on' if self.mode == 'auto' else 'off'})"


COMPARE_CYCLE = ("off", "DTL", "FO")


def next_compare_state(cur: str | None) -> str:
    """off -> DTL (you | ref) -> FO (you | ref) -> off (your DTL | FO)."""
    try:
        return COMPARE_CYCLE[(COMPARE_CYCLE.index(cur or "off") + 1) % len(COMPARE_CYCLE)]
    except ValueError:
        return "DTL"


def _angle_rx(angle: str) -> re.Pattern:
    return re.compile(rf"(?:^|[_\-\s]){re.escape(angle)}(?:$|[_\-\s.])", re.I)


def library_swing_clips(day_dir: Path, angle: str) -> list[Path]:
    """Today's organized clips (NNN_<club>..._<angle>.mp4) newest shot first."""
    rx = _angle_rx(angle)
    out = []
    try:
        for p in day_dir.glob("*"):
            m = re.match(r"^(\d+)_", p.name)
            if m and p.is_file() and p.suffix.lower() in VIDEO_EXTS and rx.search(p.stem):
                out.append((int(m.group(1)), p.stat().st_mtime, p))
    except OSError:
        return []
    out.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [p for _n, _t, p in out]


def pick_compare_clips(cfg: dict, angle: str, ref_name: str, club: str | None,
                       you_clip: Path | None = None) -> tuple[Path | None, Path | None, str]:
    """(your clip, reference clip, why-not) for one angle. Last-Swing compares with your previous swing."""
    layout = ensure_swings_layout(cfg)
    lib = library_swing_clips(layout["today"], angle)
    you = you_clip if (you_clip and Path(you_clip).exists()) else None
    if you is None:
        you = lib[0] if lib else next(iter(_latest_clips_in(layout["today"], angle)), None)
    if you is None:
        return None, None, f"no {angle} swing recorded yet today"
    if ref_name == "Last-Swing":
        prev = [p for p in lib if p.resolve() != Path(you).resolve()]
        if not prev:
            return you, None, "Last-Swing needs two swings today"
        return you, prev[0], ""
    dtl, fo = resolve_reference_clips(cfg, ref_name, club)
    ref = dtl if angle == "DTL" else fo
    cat = club_category(club)
    if ref is None or layout["sessions"] in Path(ref).parents:
        where = (layout["goto"] / cat) if ref_name == "My-Go-To" else (layout["pros"] / ref_name)
        return you, None, (f"no {ref_name} {angle} reference for {cat} - add one to {where} "
                           f"(Alt+G saves your last swing as My-Go-To)")
    return you, Path(ref), ""


def build_compare_screens(you: Path, ref: Path, speed) -> list[dict]:
    return [{"type": "playback", "full_path": str(p), "autoplay": True, "speed": speed, "stretch": True,
             "is_watcher": False} for p in (you, ref)]


def launch_compare_window(cfg: dict, screens: list[dict]) -> int | None:
    """Load `screens` into the named Kinovea window "Compare" (you | reference). Kinovea 2025 can't load a file into
    a running window by command, so a changed pair means: close Compare, rewrite its descriptor, relaunch (~2-4 s).
    The same pair again just returns the running instance."""
    layout = ensure_swings_layout(cfg)
    if resolve_kinovea_backend(cfg) != "2025":
        xml_path = layout["workspaces"] / "Compare.xml"
        write_kinovea_workspace(xml_path, screens)
        return launch_kinovea_instance(cfg, COMPARE_WINDOW, xml_path, force_reload=True)
    kdir = kinovea_settings_dir(create=True)
    if kdir is None:
        LOG.warning("Kinovea settings folder unavailable; cannot open the Compare window")
        return None
    xml = build_kinovea_window_xml(COMPARE_WINDOW, screens)
    wid = kinovea_guid(f"window/{COMPARE_WINDOW}")
    path = kdir / "Windows" / f"{wid}.xml"
    try:
        cur = path.read_bytes() if path.exists() else None
    except OSError:
        cur = None
    running = find_kinovea_instance_pid(COMPARE_WINDOW)
    if running and kinovea_window_signature(cur) == kinovea_window_signature(xml):
        return running
    if running:
        _close_kinovea_instance(COMPARE_WINDOW)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        _trash_duplicate_kinovea_windows(path.parent, COMPARE_WINDOW, wid)
        write_text_if_changed(path, xml, backup=False)
    except OSError as e:
        LOG.warning("Could not write Kinovea Compare window %s: %s", path, e)
        return None
    return launch_kinovea_instance(cfg, COMPARE_WINDOW, None)


def kinovea_windows_to_launch(cfg: dict) -> tuple[str, ...]:
    """The adaptive layout never shows the Reference window (compare uses its own window and resolves the
    reference clips when you ask), so only the 2x2 grid launches it."""
    if video_layout_cfg(cfg).get("profile") == "grid":
        return KINOVEA_WINDOW_NAMES
    return tuple(n for n in KINOVEA_WINDOW_NAMES if n != "Reference")


def evaluate_replay_gspro_mode(cfg: dict, projector_on: bool | None) -> tuple[str, str, str]:
    """Doctor row: pop-up replays + fullscreen-exclusive GSPro don't mix (a window over it can minimize it)."""
    item = "replay vs GSPro window mode"
    if video_layout_cfg(cfg).get("profile") == "grid":
        return INFO, item, "2x2 grid layout: no pop-up replay over GSPro"
    if replay_cfg(cfg).get("mode") == "off":
        return INFO, item, "auto replay off (video.replay.mode); Alt+V still pops it up on demand"
    gdisp = cfg.get("gspro_display", {}) if isinstance(cfg.get("gspro_display"), dict) else {}
    if gdisp.get("windowed"):
        return PASS, item, "GSPro runs windowed/borderless (gspro_display.windowed) - safe for pop-up replays"
    if projector_on is False and gspro_effective_windowed(cfg, False):
        return WARN, item, ("GSPro is windowed now (projector off, windowed_when_projector_off), but with the "
                            "projector on it starts exclusive fullscreen (gspro_display.windowed=false); a replay "
                            "window can then minimize or flicker it. Recommended: gspro_display.windowed = true")
    return WARN, item, ("auto replay is on but GSPro starts exclusive fullscreen (gspro_display.windowed=false): "
                        "a replay window over it can minimize it. Set gspro_display.windowed = true (borderless) "
                        "or video.replay.mode = off")


class KinoveaWindowOps:
    """The Win32 side of the adaptive layout (VideoLayoutController talks only to this; tests use a fake)."""

    def __init__(self, cfg: dict):
        self.cfg = cfg

    def displays(self) -> list[dict]:
        return list_displays()

    def gspro_index(self, displays: list[dict]) -> int:
        idx, _disp, _on = choose_display(self.cfg)
        return idx

    def find(self, name: str, wait_sec: float = 0.0) -> int | None:
        deadline = time.time() + max(0.0, float(wait_sec))
        while True:
            pid = find_kinovea_instance_pid(name)
            if pid:
                hwnd = find_window_for_pid(pid, title_re=r"^Kinovea", include_minimized=True)
                if hwnd:
                    return hwnd
            if time.time() >= deadline:
                return None
            time.sleep(0.3)

    def alive(self, hwnd: int) -> bool:
        import win32gui
        return bool(win32gui.IsWindow(hwnd))

    def show(self, hwnd: int, rect, topmost: bool = True) -> None:
        import win32con
        import win32gui
        x, y, w, h = rect
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_SHOWNOACTIVATE)
        win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST if topmost else win32con.HWND_NOTOPMOST, x, y, w, h,
                              win32con.SWP_NOACTIVATE | win32con.SWP_SHOWWINDOW)

    def park(self, hwnd: int, method: str, layout: dict) -> None:
        import win32con
        import win32gui
        if method == "minimized":
            win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, 0, 0, 0, 0,
                                  win32con.SWP_NOACTIVATE | win32con.SWP_NOMOVE | win32con.SWP_NOSIZE)
            if not win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_SHOWMINNOACTIVE)
            return
        if win32gui.IsIconic(hwnd):
            win32gui.ShowWindow(hwnd, win32con.SW_SHOWNOACTIVATE)
        x, y, w, h = layout["offscreen_rect"] if method == "offscreen" else layout["park_rect"]
        # HWND_BOTTOM also drops TOPMOST: below GSPro (and everything else), still open and recording.
        win32gui.SetWindowPos(hwnd, win32con.HWND_BOTTOM, x, y, w, h, win32con.SWP_NOACTIVATE)

    def restore_gspro_focus(self) -> bool:
        """Give GSPro the foreground back, but only when a Kinovea window / SimWatch itself took it (never pull
        focus away from a browser or app the user switched to on purpose)."""
        import win32con
        import win32gui
        import win32process
        try:
            gs = _find_gspro_main_hwnd(self.cfg)
            fg = win32gui.GetForegroundWindow()
            if not gs or fg == gs:
                return False
            if fg:
                _tid, fg_pid = win32process.GetWindowThreadProcessId(fg)
                kin = {p.pid for p in find_procs("Kinovea.exe")}
                if fg_pid not in kin and fg_pid != os.getpid():
                    return False
            if win32gui.IsIconic(gs):
                win32gui.ShowWindow(gs, win32con.SW_RESTORE)
            user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
            fg_tid = user32.GetWindowThreadProcessId(fg, None) if fg else 0
            me = kernel32.GetCurrentThreadId()
            attached = bool(fg_tid and fg_tid != me and user32.AttachThreadInput(me, fg_tid, True))
            try:
                user32.BringWindowToTop(gs)
                ok = bool(user32.SetForegroundWindow(gs))
            finally:
                if attached:
                    user32.AttachThreadInput(me, fg_tid, False)
            if not ok:
                log_throttled("gspro-focus", "could not give GSPro the foreground back (click GSPro once)")
            return ok
        except Exception as e:
            log_throttled("gspro-focus-err", f"restore GSPro focus failed: {e}")
            return False

    def last_input_time(self) -> float | None:
        """Epoch seconds of the last keyboard/mouse input anywhere (GetLastInputInfo)."""
        class _LII(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
        try:
            lii = _LII(ctypes.sizeof(_LII), 0)
            if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                return None
            idle_ms = (ctypes.windll.kernel32.GetTickCount() - lii.dwTime) & 0xFFFFFFFF
            return time.time() - idle_ms / 1000.0
        except Exception:
            return None


class VideoLayoutController:
    """Picks the layout profile from the connected displays (re-checked every display_poll_sec) and positions the
    Kinovea windows for it: Capture parked out of sight (still recording), LiveReplay / Compare shown over GSPro
    (single screen) or on the free screen (dual) only when the replay is up."""

    def __init__(self, cfg: dict, ops=None):
        self.cfg = cfg
        self.ops = ops if ops is not None else KinoveaWindowOps(cfg)
        self.layout: dict | None = None
        self._sig = None
        self._next_check = 0.0
        self._hwnds: dict[str, int] = {}

    def _hwnd(self, name: str, wait_sec: float = 0.0) -> int | None:
        h = self._hwnds.get(name)
        try:
            if h and self.ops.alive(h):
                return h
        except Exception:
            pass
        h = self.ops.find(name, wait_sec)
        if h:
            self._hwnds[name] = h
        else:
            self._hwnds.pop(name, None)
        return h

    def is_grid(self) -> bool:
        return bool(self.layout) and self.layout["profile"] == "grid"

    def refresh(self, now: float | None = None, force: bool = False) -> bool:
        """Re-read the displays; True when the layout changed (and was logged + written to video_state.json)."""
        now = time.time() if now is None else now
        if not force and now < self._next_check:
            return False
        lcfg = video_layout_cfg(self.cfg)
        self._next_check = now + max(1.0, cfg_number(lcfg.get("display_poll_sec"), 5))
        try:
            displays = self.ops.displays()
            gidx = self.ops.gspro_index(displays)
        except Exception as e:
            log_throttled("layout-displays", f"could not read the displays: {e}")
            if self.layout is not None:
                return False
            displays, gidx = [], 0
        sig = (tuple((d.get("left"), d.get("top"), d.get("width"), d.get("height"), bool(d.get("primary")))
                     for d in displays), gidx)
        if sig == self._sig and self.layout is not None:
            return False
        self._sig = sig
        self.layout = select_video_layout(displays, lcfg, gidx)
        LOG.info("Video layout: %s", layout_summary(self.layout))
        write_video_state(layout={k: self.layout[k] for k in ("profile", "reason", "replay_rect", "strip_rect",
                                                              "always_on", "capture_hide", "replay_hide")})
        return True

    def apply(self, replay_visible: bool, compare_visible: bool = False, wait_sec: float = 0.0) -> None:
        if self.layout is None:
            self.refresh(force=True)
        L = self.layout
        if L["profile"] == "grid":
            tile_video_windows(self.cfg, wait_sec=wait_sec)
            return
        ops = self.ops
        try:
            cap = self._hwnd("Capture", wait_sec)
            if cap:
                ops.park(cap, L["capture_hide"], L)
            ref = self._hwnd("Reference", 0)
            if ref:
                ops.park(ref, "minimized", L)
            live = self._hwnd("LiveReplay", wait_sec)
            cmp_ = self._hwnd(COMPARE_WINDOW, wait_sec if compare_visible else 0)
            if compare_visible and cmp_:
                ops.show(cmp_, L["replay_rect"], L["topmost"])
                if live:
                    ops.park(live, L["replay_hide"], L)
                return
            if cmp_:
                ops.park(cmp_, "minimized", L)
            if live:
                if replay_visible:
                    ops.show(live, L["replay_rect"], L["topmost"])
                elif L.get("strip_rect"):
                    ops.show(live, L["strip_rect"], True)
                else:
                    ops.park(live, L["replay_hide"], L)
        except Exception as e:
            log_throttled("layout-apply", f"positioning the Kinovea windows failed: {e}")


_OC_TOP_KEYS = ("ShotNumber", "BallData", "Player", "ShotDataOptions", "DeviceID")


OC_DEDUP_WINDOW_SEC = 30.0  # an identical OpenConnect shot (same ShotNumber + ball data) within this is a repeat


class OpenConnectMonitor:
    """Passively monitors OpenConnect (:921) loopback TCP traffic for shots & club changes."""

    def __init__(self, on_shot, on_club_change):
        self.on_shot = on_shot
        self.on_club_change = on_club_change
        self._stop = threading.Event()
        self._thread = None
        self._recent_shots: dict[tuple, float] = {}  # dedup key -> time last seen (see _shot_dedup_key)
        self._last_club = None
        self._buf = ""
        self._last_seg_key = None
        self.active = False  # True while the raw :921 sniffer socket is open (reported by /api/status)

    def start(self) -> None:
        old = self._thread
        if old and old.is_alive():
            if not self._stop.is_set():
                return  # genuinely running
            # A stop() is still in flight: wait for the old thread to exit BEFORE clearing _stop,
            # otherwise the old thread would never see the stop flag and we'd leak/duplicate it.
            old.join(timeout=3.0)
            if old.is_alive():
                LOG.warning("OpenConnect monitor is still shutting down; not restarting yet")
                return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="OpenConnectMonitor", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        t = self._thread
        if t and t.is_alive() and t is not threading.current_thread():
            t.join(timeout=2.0)  # raw-socket loop polls every 0.5s

    def _handle_json(self, obj: dict) -> None:
        if not isinstance(obj, dict):
            return
        player = obj.get("Player")
        if isinstance(player, dict) and player.get("Club"):
            club = str(player["Club"]).strip()
            if club and club != self._last_club:
                self._last_club = club
                try:
                    self.on_club_change(club)
                except Exception:  # a failed reference swap must not drop the shot in this same message
                    log_throttled("oc-club-cb", f"club change to {club} failed", exc_info=True)

        ball = obj.get("BallData")
        opts = obj.get("ShotDataOptions") or {}
        if opts.get("IsHeartBeat") is True or obj.get("IsHeartBeat") is True:
            return  # connector keep-alive, never a shot (even if it repeats the last BallData)
        if isinstance(ball, dict):
            speed = float(ball.get("Speed") or 0)
            has_ball = opts.get("ContainsBallData", speed > 0)
            if has_ball and speed > 0:  # ContainsBallData=false (club-only / status message) is skipped
                shot_num = obj.get("ShotNumber")
                key = self._shot_dedup_key(shot_num, ball, speed)
                now = time.time()
                self._recent_shots = {k: t for k, t in self._recent_shots.items() if now - t <= OC_DEDUP_WINDOW_SEC}
                if key not in self._recent_shots:
                    self._recent_shots[key] = now
                    carry = ball.get("CarryDistance") or ball.get("TotalDistance")
                    try:
                        shot = openconnect_to_shot(obj, club=self._last_club)
                    except Exception:
                        log_throttled("oc-shot-map", "could not map OpenConnect shot JSON", exc_info=True)
                        shot = None
                    self.on_shot({
                        "shot_num": shot_num,
                        "club": self._last_club,
                        "ball_speed": speed,
                        "carry": float(carry) if carry is not None else None,
                        "timestamp": now,
                        "shot": shot,  # full bridge shot record (see openconnect_to_shot), or None
                    })

    @staticmethod
    def _shot_dedup_key(shot_num, ball: dict, speed: float) -> tuple:
        """The same shot is re-sent (GSPro echo, connector repeats, a GSPconnect reconnect) with the same
        ShotNumber and identical ball data; a real new shot never repeats speed + spin + HLA exactly."""
        spin = _num(ball.get("TotalSpin"))
        if spin is None:
            spin = _num(ball.get("BackSpin"))
        return (shot_num, round(speed, 1), spin, _num(ball.get("HLA")))

    def _safe_handle(self, obj) -> None:
        """_handle_json, but a malformed message or a raising callback (e.g. a reference swap that hits an
        OSError) is logged instead of propagating into _run() and killing the sniffer thread."""
        try:
            self._handle_json(obj)
        except Exception:
            log_throttled("oc-handle", "OpenConnect monitor: message handling failed", exc_info=True)

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
                self._safe_handle(obj)
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
                            self._safe_handle(obj)
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
            self.active = True
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
                    try:
                        self._feed_text(payload.decode("utf-8", errors="ignore"))
                    except Exception:
                        # Belt and braces (_feed_text already isolates callbacks): one bad message must not
                        # end shot detection for the rest of the session - nothing restarts this thread.
                        self._buf = ""
                        log_throttled("oc-feed", "OpenConnect monitor: failed to parse traffic", exc_info=True)
        finally:
            self.active = False
            try:
                sock.ioctl(socket.SIO_RCVALL, socket.RCVALL_OFF)
            except Exception:
                pass
            try:
                sock.close()
            except Exception:
                pass


# --------------------------------------------------------------------------- shot-data bridge
#
# Every OpenConnect shot becomes one record (contract below), appended to
# <sessions_dir>/YYYY-MM-DD/shots.jsonl and pushed to the drills hub page over a local HTTP/SSE API.
#
# Shot record (version 2; the file/API also tolerate version-1 lines, see normalize_shot):
#   {"ts": ISO8601 local with offset, "shot_num": int (day-unique sequence assigned by ShotStore; names the
#    clip files), "device_shot_num": int|null (the launch monitor's ShotNumber; can reset mid-day), "club": str|null,
#    "ball": {"speed": mph, "carry": yd, "total": yd|null, "hla": deg, "vla": deg, "spin": rpm, "spin_axis": deg},
#    "club_data": {"speed": mph, "path": deg, "face": deg, "aoa": deg}|null,
#    "clip": str|null (primary clip: DTL preferred), "clips": {"DTL": str, "FO": str} (when linked),
#    "drill_id": str|null, "demo": true (only on `bridge --demo` records),
#    # v2: coaching context stamped from the hub's active context (POST /api/context); null when unset
#    "feel_id": str|null, "block_id": str|null, "session_id": str|null,
#    "phase": "warmup"|"cold"|"block"|"transfer"|"speed"|null, "cluster": int 0-999|null,
#    "note": str<=200|null,   # one-shot: attached to the next shot only, then cleared
#    "derived": {"smash": ball.speed/club.speed (2dp)|null, "face_to_path": face-path (deg)|null,
#                "start_offline_yd": carry*sin(hla) (yd, + = right of target line)|null}}
# Any value the launch monitor did not send is null. start_offline_yd is the START-line offset only (no
# spin-axis curve is estimated: that can't be done honestly from carry/HLA/axis alone).

BRIDGE_VERSION = 2
CONTEXT_PHASES = ("warmup", "cold", "block", "transfer", "speed")
CONTEXT_FIELDS = ("drill_id", "feel_id", "block_id", "session_id", "phase", "cluster", "note")
CONTEXT_NOTE_MAX = 200
BRIDGE_DEFAULTS = {"enabled": True, "port": 8765, "sessions_dir": "Swings/Sessions", "lan": False}
BRIDGE_DEMO_SESSIONS_DIR = "Swings/Sessions-demo"  # `bridge --demo` (override: bridge.demo_sessions_dir)
DRILL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BRIDGE_HUB = None  # the running ShotHub (if any); the watch loop drops its health summary here
DRILL_IDLE_TIMEOUT_SEC = 60.0  # clear active_drill after this long with zero SSE subscribers (page closed)
BRIDGE_MAX_SUBSCRIBERS = 8     # concurrent /api/events streams; more get 503
SSE_WRITE_TIMEOUT_SEC = 10.0   # a client that stops reading for this long is dropped
BRIDGE_ALLOWED_HOSTS = ("127.0.0.1", "localhost")
BRIDGE_TOKEN_PATH = HERE / "bridge_token.txt"  # phone pairing token for bridge.lan (gitignored, created on demand)
BRIDGE_TOKEN_COOKIE = "simwatch_token"
BRIDGE_LAN_FIREWALL_RULE = "SimWatch bridge LAN (phone)"


def bridge_config(cfg: dict | None) -> dict:
    """The `bridge` config block with defaults filled in."""
    out = dict(BRIDGE_DEFAULTS)
    b = (cfg or {}).get("bridge")
    if isinstance(b, dict):
        out.update({k: v for k, v in b.items() if not k.startswith("_")})
    return out


def bridge_lan_enabled(cfg: dict | None) -> bool:
    return bridge_config(cfg).get("lan") is True


def bridge_token(create: bool = True, path: Path | None = None) -> str | None:
    """The LAN pairing token (bridge_token.txt). Created once (exclusive create, so two processes racing to
    create it agree on one token); delete the file to revoke every paired phone."""
    path = path or BRIDGE_TOKEN_PATH
    for _ in range(2):
        try:
            tok = path.read_text(encoding="utf-8").strip()
            if tok:
                return tok
        except OSError:
            pass
        if not create:
            return None
        try:
            fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            time.sleep(0.05)  # another process is writing it: read theirs
            continue
        except OSError as e:
            LOG.warning("could not create %s: %s", path.name, e)
            return None
        tok = secrets.token_urlsafe(24)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(tok + "\n")
        return tok
    return None


def lan_ipv4_candidates() -> list[str]:
    """This PC's home-network IPv4 addresses, best first: the default-route address, then other private
    addresses. Never loopback or 169.254.x (that is the Launch Pro's direct link, not Wi-Fi)."""
    def usable(ip: str) -> bool:
        try:
            a = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return a.version == 4 and a.is_private and not a.is_loopback and not a.is_link_local

    out: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9))  # UDP connect sends nothing; it only picks the outbound interface
            ip = s.getsockname()[0]
            if usable(ip):
                out.append(ip)
    except OSError:
        pass
    try:
        for addrs in psutil.net_if_addrs().values():
            for a in addrs:
                if a.family == socket.AF_INET and usable(a.address) and a.address not in out:
                    out.append(a.address)
    except Exception:
        pass
    return out


def bridge_phone_url(cfg: dict | None, create_token: bool = True) -> str | None:
    """http://<LAN IP>:<port>/?token=... for a phone on the same Wi-Fi; None if lan is off or no LAN IP."""
    if not bridge_lan_enabled(cfg):
        return None
    ips = lan_ipv4_candidates()
    tok = bridge_token(create=create_token)
    if not ips or not tok:
        return None
    return f"http://{ips[0]}:{int(bridge_config(cfg).get('port', 8765))}/?token={tok}"


def valid_drill_id(value) -> bool:
    """A drill id is None (no active drill) or 1-80 chars of [A-Za-z0-9_-]."""
    return value is None or (isinstance(value, str) and bool(DRILL_ID_RE.match(value)))


def valid_context_id(value) -> bool:
    """feel_id / block_id / session_id: same rule as a drill id (None or 1-80 chars of [A-Za-z0-9_-])."""
    return valid_drill_id(value)


def validate_context(doc) -> dict:
    """Strictly validate a POST /api/context body. Returns only the keys present; raises ValueError."""
    if not isinstance(doc, dict) or not doc:
        raise ValueError("expected a JSON object with at least one of: " + ", ".join(CONTEXT_FIELDS))
    unknown = sorted(k for k in doc if k not in CONTEXT_FIELDS)
    if unknown:
        raise ValueError(f"unknown field(s): {', '.join(map(str, unknown))}")
    out: dict = {}
    for key in ("drill_id", "feel_id", "block_id", "session_id"):
        if key in doc:
            if not valid_context_id(doc[key]):
                raise ValueError(f"{key} must be null or 1-80 chars of [A-Za-z0-9_-]")
            out[key] = doc[key]
    if "phase" in doc:
        if doc["phase"] is not None and doc["phase"] not in CONTEXT_PHASES:
            raise ValueError("phase must be null or one of " + ", ".join(CONTEXT_PHASES))
        out["phase"] = doc["phase"]
    if "cluster" in doc:
        c = doc["cluster"]
        if c is not None and (isinstance(c, bool) or not isinstance(c, int) or not 0 <= c <= 999):
            raise ValueError("cluster must be null or an integer 0-999")
        out["cluster"] = c
    if "note" in doc:
        n = doc["note"]
        if n is not None and (not isinstance(n, str) or len(n) > CONTEXT_NOTE_MAX):
            raise ValueError(f"note must be null or a string of at most {CONTEXT_NOTE_MAX} chars")
        out["note"] = n or None
    return out


def drill_filename_tag(drill_id: str | None) -> str:
    """'_D-<id>' for clip filenames ('' if none). Letters/digits only, so it can never look like an angle token."""
    if not drill_id:
        return ""
    safe = re.sub(r"[^A-Za-z0-9]", "", str(drill_id))[:40]
    if not safe or safe.lower() in ("dtl", "fo"):  # `_D-fo_` would confuse the FO/DTL angle regexes
        return ""
    return f"_D-{safe}"


def _num(v) -> float | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 2) if math.isfinite(f) else None


def local_iso_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def derive_shot_metrics(ball: dict | None, club_data: dict | None) -> dict:
    """The `derived` block of a v2 record. Every value is null when its inputs are missing."""
    ball = ball if isinstance(ball, dict) else {}
    cd = club_data if isinstance(club_data, dict) else {}
    bs, cs = _num(ball.get("speed")), _num(cd.get("speed"))
    face, path = _num(cd.get("face")), _num(cd.get("path"))
    carry, hla = _num(ball.get("carry")), _num(ball.get("hla"))
    return {
        "smash": round(bs / cs, 2) if bs is not None and cs else None,
        "face_to_path": round(face - path, 2) if face is not None and path is not None else None,
        "start_offline_yd": (round(carry * math.sin(math.radians(hla)), 2)
                             if carry is not None and hla is not None else None),
    }


def normalize_shot(rec: dict) -> dict:
    """A shot dict (v1 or v2 line) in full v2 shape: missing keys become null, `derived` is recomputed
    when absent. Returns a new dict; unknown extra keys are kept."""
    out = dict(rec)
    ball = out.get("ball") if isinstance(out.get("ball"), dict) else {}
    out["ball"] = {k: ball.get(k) for k in ("speed", "carry", "total", "hla", "vla", "spin", "spin_axis")}
    cd = out.get("club_data") if isinstance(out.get("club_data"), dict) else None
    out["club_data"] = {k: cd.get(k) for k in ("speed", "path", "face", "aoa")} if cd else None
    for k in ("ts", "shot_num", "club", "clip", "drill_id", "feel_id", "block_id", "session_id",
              "phase", "cluster", "note"):
        out.setdefault(k, None)
    d = out.get("derived") if isinstance(out.get("derived"), dict) else {}
    calc = derive_shot_metrics(out["ball"], out["club_data"])
    out["derived"] = {k: d.get(k) if d.get(k) is not None else calc[k] for k in calc}
    return out


def _mean(vals: list) -> float | None:
    vals = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
    return round(sum(vals) / len(vals), 2) if vals else None


def _std(vals: list) -> float | None:
    """Sample standard deviation (n-1); null with fewer than 2 values."""
    vals = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
    if len(vals) < 2:
        return None
    m = sum(vals) / len(vals)
    return round(math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1)), 2)


def _shot_metrics(s: dict) -> dict:
    cd = s.get("club_data") or {}
    d = s.get("derived") or {}
    ball = s.get("ball") or {}
    return {"smash": d.get("smash"), "aoa": cd.get("aoa"), "path": cd.get("path"), "face": cd.get("face"),
            "face_to_path": d.get("face_to_path"), "carry": ball.get("carry"), "ball_speed": ball.get("speed")}


def _avg_metrics(shots: list[dict]) -> dict:
    ms = [_shot_metrics(s) for s in shots]
    return {k: _mean([m[k] for m in ms]) for k in
            ("smash", "aoa", "path", "face", "face_to_path", "carry", "ball_speed")}


def _spread(shots: list[dict]) -> dict:
    return {"n": len(shots),
            "offline_std": _std([s["derived"]["start_offline_yd"] for s in shots]),
            "carry_std": _std([s["ball"]["carry"] for s in shots])}


def session_stats(shots: list[dict], date: str | None = None, session_id: str | None = None) -> dict:
    """Pure per-session summary of a list of shot dicts (v1 or v2). See the contract in the bridge notes:
    cold start (phase "cold", else first 3), first3-vs-last3 dispersion per club (clubs with >= 6 shots,
    else all shots pooled), per-cluster / per-feel averages, and carry std dev (strike consistency)."""
    shots = [normalize_shot(s) for s in shots if isinstance(s, dict)]
    if session_id is not None:
        shots = [s for s in shots if s.get("session_id") == session_id]

    tagged = [s for s in shots if s.get("phase") == "cold"]
    cold, basis = (tagged, "tagged") if tagged else (shots[:3], "first3" if shots else "none")

    by_club: dict[str, list[dict]] = {}
    for s in shots:
        by_club.setdefault(s.get("club") or "unknown", []).append(s)
    groups = [(c, v) for c, v in by_club.items() if len(v) >= 6]
    disp_basis = "clubs_with_6_plus"
    if not groups:
        disp_basis = "all_shots"
        groups = [("all", shots)]
    dispersion = []
    for club, v in groups:
        if len(v) >= 6:
            dispersion.append({"club": club, "n": len(v), "first3": _spread(v[:3]), "last3": _spread(v[-3:])})
        else:  # fewer than 6 shots: first3/last3 would overlap, so report nothing rather than something misleading
            dispersion.append({"club": club, "n": len(v), "first3": None, "last3": None})

    def grouped(key: str) -> list[dict]:
        buckets: dict = {}
        for s in shots:
            if s.get(key) is not None:
                buckets.setdefault(s[key], []).append(s)
        return [{key: k, "n": len(v), **_avg_metrics(v)} for k, v in sorted(buckets.items())]

    return {
        "date": date,
        "session_id": session_id,
        "shot_count": len(shots),
        "cold_start": {"basis": basis, "count": len(cold),
                       "avg": _avg_metrics(cold) if cold else None,
                       "offline_std": _std([s["derived"]["start_offline_yd"] for s in cold]),
                       "carry_std": _std([s["ball"]["carry"] for s in cold])},
        "dispersion": {"basis": disp_basis, "by_club": dispersion},
        "by_cluster": grouped("cluster"),
        "by_feel": grouped("feel_id"),
        "strike_consistency": {
            "carry_std": _std([s["ball"]["carry"] for s in shots]),
            "by_club": {c: _std([s["ball"]["carry"] for s in v]) for c, v in by_club.items()},
        },
    }


def openconnect_to_shot(obj: dict, club: str | None = None, ts: str | None = None) -> dict:
    """Map a GSPro OpenConnect v1 shot message to a bridge shot record (clip/drill_id left null)."""
    ball = obj.get("BallData") if isinstance(obj.get("BallData"), dict) else {}
    opts = obj.get("ShotDataOptions") if isinstance(obj.get("ShotDataOptions"), dict) else {}

    spin = _num(ball.get("TotalSpin"))
    axis = _num(ball.get("SpinAxis"))
    back, side = _num(ball.get("BackSpin")), _num(ball.get("SideSpin"))
    if spin is None and (back is not None or side is not None):
        spin = round(math.hypot(back or 0.0, side or 0.0), 2)
    if axis is None and back is not None and side is not None and (back or side):
        axis = round(math.degrees(math.atan2(side, back)), 2)

    club_data = None
    cd = obj.get("ClubData")
    if isinstance(cd, dict) and opts.get("ContainsClubData", True) is not False:
        club_data = {
            "speed": _num(cd.get("Speed")),
            "path": _num(cd.get("Path")),
            "face": _num(cd.get("FaceToTarget")),
            "aoa": _num(cd.get("AngleOfAttack")),
        }
        if all(v is None for v in club_data.values()):
            club_data = None

    shot_num = obj.get("ShotNumber")
    try:
        shot_num = int(shot_num) if shot_num is not None and not isinstance(shot_num, bool) else None
    except (TypeError, ValueError):
        shot_num = None

    ball_out = {
        "speed": _num(ball.get("Speed")),
        "carry": _num(ball.get("CarryDistance")),
        "total": _num(ball.get("TotalDistance")),
        "hla": _num(ball.get("HLA")),
        "vla": _num(ball.get("VLA")),
        "spin": spin,
        "spin_axis": axis,
    }
    return {
        "ts": ts or local_iso_now(),
        "shot_num": shot_num,
        "club": (str(club).strip() or None) if club else None,
        "ball": ball_out,
        "club_data": club_data,
        "clip": None,
        "drill_id": None,
        "feel_id": None,
        "block_id": None,
        "session_id": None,
        "phase": None,
        "cluster": None,
        "note": None,
        "derived": derive_shot_metrics(ball_out, club_data),
    }


SHOTS_LOCK_NAME = ".shots.lock"   # <day>/.shots.lock: cross-process lock (watchdog appends vs clip-ready links)
SHOTS_LOCK_TIMEOUT_SEC = 5.0
SHOTS_LOCK_STALE_SEC = 15.0       # longer than any append/set_clip critical section (incl. replace retries)
SHOTS_REPLACE_RETRY_SEC = 2.0     # os.replace PermissionError (AV / OneDrive / a reader) retry budget


def _clip_name_angle(name) -> str | None:
    """'DTL'/'FO' from a library clip name (NNN_..._DTL.mp4, ..._FO_2.mp4, ..._DTL-1.mp4), else None."""
    m = re.search(r"_(DTL|FO)(?:[_-]\d+)?\.[A-Za-z0-9]+$", str(name or ""), re.I)
    return m.group(1).upper() if m else None


def shot_has_angle_clip(shot: dict, angle: str) -> bool:
    """True when the shot RECORD already has a clip for `angle` (clips{} map, or a legacy `clip` name)."""
    clips = shot.get("clips")
    if isinstance(clips, dict) and clips.get(angle):
        return True
    return _clip_name_angle(shot.get("clip")) == angle


def _int_or_none(v) -> int | None:
    if v is None or isinstance(v, bool):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class ShotStore:
    """Append-only daily shots.jsonl files: <sessions_dir>/YYYY-MM-DD/shots.jsonl.

    One JSON object per line. Setting a shot's clip later rewrites that day's file atomically
    (tmp + os.replace) - fine for a few hundred shots/day, and readers never see a half-written file.
    Shots are identified by their unique `ts`.

    Two processes write this file (the watchdog appends shots; Kinovea's `clip-ready` links clips), so
    append and set_clip both hold a cross-process lock (<day>/.shots.lock): otherwise a shot appended
    between set_clip's read and its os.replace would be lost.

    `shot_num` is a day-unique sequence (max in the file + 1) used for clip file names and shown by the
    drills hub; the launch monitor's own ShotNumber (it can reset when GameChanger restarts) is kept as
    `device_shot_num`.
    """

    def __init__(self, sessions_dir: Path):
        self.sessions_dir = Path(sessions_dir)
        self._lock = threading.Lock()

    def path_for(self, date_str: str) -> Path:
        return self.sessions_dir / date_str / "shots.jsonl"

    def _file_lock(self, date_str: str) -> "_FileLock":
        return _FileLock(self.sessions_dir / date_str / SHOTS_LOCK_NAME, timeout=SHOTS_LOCK_TIMEOUT_SEC,
                         stale_sec=SHOTS_LOCK_STALE_SEC)

    def _read_unlocked(self, date_str: str) -> list[dict]:
        path = self.path_for(date_str)
        out: list[dict] = []
        try:
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # a torn last line after a crash must not hide the rest
                    if isinstance(rec, dict):
                        out.append(rec)
        except FileNotFoundError:
            pass
        return out

    def read(self, date_str: str) -> list[dict]:
        with self._lock:
            return self._read_unlocked(date_str)

    def _append_unlocked(self, shot: dict, date_str: str) -> None:
        recs = self._read_unlocked(date_str)
        if "device_shot_num" not in shot:
            shot["device_shot_num"] = _int_or_none(shot.get("shot_num"))
        shot["shot_num"] = max((n for r in recs if (n := _int_or_none(r.get("shot_num"))) is not None),
                               default=0) + 1
        path = self.path_for(date_str)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(shot, separators=(",", ":")) + "\n")

    def append(self, shot: dict) -> dict:
        shot.setdefault("ts", local_iso_now())
        date_str = str(shot["ts"])[:10]
        with self._lock:
            try:
                with self._file_lock(date_str):
                    self._append_unlocked(shot, date_str)
            except TimeoutError as e:
                # Never drop a shot over a busy lock (e.g. a clip-ready run hung on OneDrive): an append-mode
                # write is still safe unless a set_clip rewrite is racing it right now.
                log_throttled("shots-lock", f"shots.jsonl lock busy ({e}); appending without it")
                self._append_unlocked(shot, date_str)
        return shot

    def link_clip(self, ts: str, clip: str, angle: str | None = None) -> dict | None:
        """Record `clip` on the shot whose ts matches; returns the updated record, or None if no match.

        With an angle, clips[angle] is set and the primary `clip` only when it is DTL or there is none yet
        (DTL preferred). Without one, `clip` is set unconditionally (legacy callers). May raise OSError
        (TimeoutError when the cross-process lock stays busy)."""
        date_str = str(ts)[:10]
        with self._lock, self._file_lock(date_str):
            recs = self._read_unlocked(date_str)
            hit = None
            for rec in recs:
                if rec.get("ts") != ts:
                    continue
                if angle:
                    clips = rec.get("clips") if isinstance(rec.get("clips"), dict) else {}
                    clips[angle] = clip
                    rec["clips"] = clips
                    if angle == "DTL" or not rec.get("clip"):
                        rec["clip"] = clip
                else:
                    rec["clip"] = clip
                hit = rec
            if hit is not None:
                data = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in recs)
                deadline = time.monotonic() + SHOTS_REPLACE_RETRY_SEC
                while True:
                    try:
                        write_text_if_changed(self.path_for(date_str), data, backup=False)
                        break
                    except PermissionError:
                        # Windows: os.replace fails while AV/OneDrive/a reader has the file open. Brief retry.
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(0.1)
            return hit

    def set_clip(self, ts: str, clip: str, angle: str | None = None) -> bool:
        """Set `clip` on the shot whose ts matches. Returns True if a record was updated."""
        return self.link_clip(ts, clip, angle) is not None


_GSPRO_KEYS_LOCK = threading.Lock()


def send_gspro_club_keys(key: str, steps: int, cfg: dict | None = None) -> tuple[bool, str]:
    """Send I (club up) or K (club down) keystrokes to the running GSPro window on Windows.

    Used by ShotLab's club auto-detector (manual Sync GSPro or >=90% Auto-Switch).
    Returns (ok, detail). Safe no-op returning (False, ...) off Windows.
    """
    k = str(key or "").strip().lower()
    if k not in ("i", "k"):
        return False, "key must be 'i' or 'k'"
    if not isinstance(steps, int) or isinstance(steps, bool) or not 1 <= steps <= 16:
        return False, "steps must be an integer 1-16"
    if not IS_WINDOWS:
        return False, "GSPro keystroke switching requires Windows"
    if not _GSPRO_KEYS_LOCK.acquire(timeout=2.0):
        return False, "GSPro club switch already in progress"
    try:
        import win32api
        import win32con
        proc_name = (
            ((cfg or {}).get("apps_by_key") or {}).get("gspro", {}).get("process")
            or "GSPro.exe"
        )
        hwnd = None
        for p in find_procs(proc_name):
            hwnd = find_window_for_pid(p.pid, title_re=r"^(?!GSPro Configuration$).+", include_minimized=True)
            if hwnd:
                break
        if not hwnd:
            return False, "GSPro main window not found"
        vk = ord(k.upper())
        scan = win32api.MapVirtualKey(vk, 0)
        lp_down = 1 | (scan << 16)
        lp_up = 1 | (scan << 16) | (1 << 30) | (1 << 31)
        import pywintypes
        try:
            # pywin32's PostMessage returns None and raises pywintypes.error on failure
            for _ in range(steps):
                win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, vk, lp_down)
                time.sleep(0.025)
                win32api.PostMessage(hwnd, win32con.WM_KEYUP, vk, lp_up)
                time.sleep(0.045)
        except pywintypes.error as e:
            if getattr(e, "winerror", None) == 5:  # ERROR_ACCESS_DENIED: UIPI blocks posting to an elevated GSPro
                return False, "GSPro is running as Administrator but SimWatch is not; run SimWatch elevated"
            return False, f"PostMessage failed: {e}"
        LOG.info("Sent %dx '%s' club-switch key(s) to GSPro (hwnd=%s)", steps, k.upper(), hwnd)
        return True, f"sent {steps}x {k.upper()}"
    except Exception as e:
        LOG.warning("send_gspro_club_keys failed: %s", e)
        return False, str(e)
    finally:
        _GSPRO_KEYS_LOCK.release()


class ShotHub:
    """Shared bridge state: the store, the active drill/coaching context, and SSE subscriber fan-out."""

    def __init__(self, store: ShotStore):
        self.store = store
        self.context: dict = {k: None for k in CONTEXT_FIELDS}  # active coaching context (drill_id = active drill)
        self.current_club: str | None = None
        self.last_shot_ts: str | None = None
        self.health: dict | None = None
        self.sniffer = None  # an OpenConnectMonitor (its .active flag is reported as sniffer_ok)
        self.demo = False    # `bridge --demo`: synthetic shots, tagged "demo": true (kept out of real sessions)
        self.cfg: dict | None = None                # for /api/shortcuts (the hotkey map lives in the config)
        self.hotkey_registration: dict | None = None  # set by the video rig once its hotkeys are registered
        self.heartbeat_sec = 15.0
        self.max_subscribers = BRIDGE_MAX_SUBSCRIBERS
        self.drill_idle_timeout = DRILL_IDLE_TIMEOUT_SEC
        self.reaper_interval = 1.0
        self.stopping = threading.Event()
        self._subs: set[queue.Queue] = set()
        self._no_subs_since: float | None = time.monotonic()  # None while at least one SSE client is connected
        self._lock = threading.Lock()

    @property
    def active_drill(self) -> str | None:
        return self.context["drill_id"]

    @active_drill.setter
    def active_drill(self, value: str | None) -> None:
        self.context["drill_id"] = value

    def read_shots(self, date_str: str) -> list[dict]:
        """The day's shots, every line normalized to the v2 shape."""
        return [normalize_shot(r) for r in self.store.read(date_str)]

    def _hotkey_rows(self) -> list[dict]:
        fn = getattr(self, "hotkeys_fn", None)
        try:
            return list(fn()) if fn else []
        except Exception:
            return []

    def set_club(self, club: str | None) -> str | None:
        """Record the active GSPro club (from OpenConnect Code 201) and notify SSE clients."""
        norm = (str(club).strip() or None) if club is not None else None
        with self._lock:
            if norm == self.current_club:
                return norm
            self.current_club = norm
        self.broadcast("club", {"club": norm})
        return norm

    def set_context(self, fields: dict) -> dict:
        """Merge validated context fields (absent keys unchanged, null clears). Returns the new context."""
        fields = validate_context(fields)
        with self._lock:
            self.context.update(fields)
            if self._no_subs_since is not None:
                self._no_subs_since = time.monotonic()  # a headless POST (curl) gets a full idle window
            ctx = dict(self.context)
        LOG.info("Context -> %s", {k: v for k, v in ctx.items() if v is not None} or "(none)")
        self.broadcast("status", self.status())
        return ctx

    def status(self) -> dict:
        with self._lock:
            current_club = self.current_club
            last_shot_ts = self.last_shot_ts
            active_drill = self.context["drill_id"]
            context_snap = dict(self.context)
            health = self.health
        doc = {
            "ok": True,
            "version": BRIDGE_VERSION,
            "sniffer_ok": bool(getattr(self.sniffer, "active", False)),
            "current_club": current_club,
            "hotkeys": self._hotkey_rows(),
            "last_shot_ts": last_shot_ts,
            "active_drill": active_drill,
            "context": context_snap,
        }
        if health is not None:
            doc["health"] = health
        if self.demo:
            doc["demo"] = True
        return doc

    def set_drill(self, drill_id: str | None) -> str | None:
        if not valid_drill_id(drill_id):
            raise ValueError("drill_id must be null or 1-80 chars of [A-Za-z0-9_-]")
        with self._lock:
            self.active_drill = drill_id
            if self._no_subs_since is not None:
                self._no_subs_since = time.monotonic()  # a headless POST (curl) gets a full idle window
        LOG.info("Active drill -> %s", drill_id or "(none)")
        self.broadcast("status", self.status())
        return drill_id

    def expire_drill_if_idle(self, now: float | None = None) -> bool:
        """Clear active_drill once no SSE client (= no open drills page) has been connected for
        drill_idle_timeout seconds, so a closed page can't tag later shots. Returns True if cleared."""
        now = time.monotonic() if now is None else now
        with self._lock:
            idle_since = self._no_subs_since
            if (all(v is None for v in self.context.values()) or idle_since is None
                    or now - idle_since < self.drill_idle_timeout):
                return False
            old = self.context["drill_id"]
            self.context = {k: None for k in CONTEXT_FIELDS}
        LOG.info("Context (drill %s) cleared: no drills page connected for %.0fs", old, now - idle_since)
        self.broadcast("status", self.status())
        return True

    def set_clip(self, ts: str, clip: str, angle: str | None = None) -> bool:
        """Link a saved clip to its shot record and tell SSE clients (`clip` event). May raise OSError."""
        rec = self.store.link_clip(ts, clip, angle)
        if rec is None:
            return False
        if angle:
            self.broadcast("clip", {"ts": ts, "clip": rec.get("clip"), "angle": angle, "clips": rec.get("clips")})
        else:
            self.broadcast("clip", {"ts": ts, "clip": clip})
        return True

    def record_shot(self, shot: dict) -> dict:
        """Tag with the active drill, persist, and push to SSE clients. Never raises."""
        self.expire_drill_if_idle()
        with self._lock:
            ctx = dict(self.context)
            self.context["note"] = None  # the note rides on the next shot only
        for k in CONTEXT_FIELDS:
            if shot.get(k) is None:
                shot[k] = ctx[k]
        if self.demo:
            shot["demo"] = True
        try:
            self.store.append(shot)
        except OSError as e:
            log_throttled("shot-store", f"could not append shot to {self.store.sessions_dir}: {e}")
        self.last_shot_ts = shot.get("ts")
        self.broadcast("shot", shot)
        return shot

    def subscribe(self) -> queue.Queue | None:
        """A new SSE subscriber queue, or None when max_subscribers are already connected."""
        q: queue.Queue = queue.Queue(maxsize=200)
        with self._lock:
            if len(self._subs) >= self.max_subscribers:
                return None
            self._subs.add(q)
            self._no_subs_since = None
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subs.discard(q)
            if not self._subs and self._no_subs_since is None:
                self._no_subs_since = time.monotonic()

    def broadcast(self, event: str, data: dict) -> None:
        # Serialise once, now: callers keep (and later mutate) the dict, e.g. a shot gaining its clip.
        payload = json.dumps(data)
        with self._lock:
            subs = list(self._subs)
        for q in subs:
            try:
                q.put_nowait((event, payload))
            except queue.Full:
                pass  # a stalled client just misses events; it can re-sync via /api/shots


class BridgeRequestHandler(http.server.SimpleHTTPRequestHandler):
    """/api/* JSON + SSE endpoints; everything else is a static file from drills/ (never outside it)."""

    server_version = "SimWatchBridge/1"
    timeout = 30  # socket timeout for ordinary requests (slow/idle clients can't pin a thread forever)

    # Browser access policy (any page in any browser on this PC can reach 127.0.0.1):
    # - Host must be 127.0.0.1/localhost[:port] -> blocks DNS-rebinding pages (421 otherwise).
    # - CORS is never `*`: only http://127.0.0.1:<port>, http://localhost:<port> and the literal "null"
    #   origin (drills/index.html opened via file://) are reflected. Any other Origin gets 403, so a
    #   foreign site can neither read shots nor change the drill (it also can't open the SSE stream).
    # - POST /api/drill and /api/context (same policy) require Content-Type: application/json, which forces a CORS preflight; a plain
    #   cross-site <form>/text/plain "simple request" is refused with 415 before it can change state.
    # Residual risk (documented in README): a hostile page can produce Origin "null" from a sandboxed
    # iframe, so it could read shot data and set/clear the active drill tag. That is the price of keeping
    # the file:// page working without a token; it exposes golf numbers only, nothing on disk.
    #
    # LAN clients (bridge.lan true; anything not from 127.0.0.0/8) never get the rules above. They must present
    # the pairing token (?token=... once, then the HttpOnly SameSite=Strict cookie) on EVERY request, static
    # files included; their Host may then be an IP literal or this PC's hostname (a DNS-rebinding page can
    # neither know the token nor receive the cookie, which is scoped to the real host), and an Origin, if sent,
    # must be that same http://<Host>. With lan off the server binds 127.0.0.1, so no LAN client can connect.
    def log_message(self, fmt, *args):  # route access logs to DEBUG, not stderr
        LOG.debug("bridge %s - %s", self.address_string(), fmt % args)

    def _client_is_loopback(self) -> bool:
        try:
            return ipaddress.ip_address(str(self.client_address[0]).split("%", 1)[0]).is_loopback
        except ValueError:
            return False

    def _split_host(self) -> tuple[str, str]:
        host = (self.headers.get("Host") or "").strip().lower()
        if host.startswith("["):
            name, _, rest = host[1:].partition("]")
            return name, rest[1:] if rest.startswith(":") else ""
        name, sep, port = host.rpartition(":")
        return (name, port) if sep else (host, "")

    def _lan_host_ok(self) -> bool:
        name, port = self._split_host()
        if not name or (port and port != str(self.server.server_address[1])):
            return False
        try:
            ipaddress.ip_address(name)
            return True  # an IP literal can't be a rebinding hostname
        except ValueError:
            pass
        me = socket.gethostname().lower()
        return bool(me) and (name == me or name.startswith(me + "."))

    def _lan_token_ok(self) -> bool:
        want = getattr(self.server, "lan_token", None)
        if not want:
            return False
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        given = (q.get("token") or [""])[0]
        if given and hmac.compare_digest(given.encode(), want.encode()):
            self._set_token_cookie = True
            return True
        jar = http.cookies.SimpleCookie()
        try:
            jar.load(self.headers.get("Cookie") or "")
        except http.cookies.CookieError:
            return False
        c = jar.get(BRIDGE_TOKEN_COOKIE)
        return bool(c) and hmac.compare_digest(c.value.encode(), want.encode())

    def _lan_parse_ok(self) -> bool:
        """Access policy for a non-loopback client (see the class comment)."""
        if not getattr(self.server, "lan_token", None):
            self.close_connection = True
            self._json(403, {"error": "LAN access is disabled (bridge.lan is false)"})
            return False
        if not self._lan_token_ok():
            self.close_connection = True
            self._json(401, {"error": "pairing token required: run `python simwatch.py phone` on the PC and "
                                      "open the URL it prints"})
            return False
        if not self._lan_host_ok():
            self.close_connection = True
            self._json(421, {"error": "Host must be this PC's LAN IP or hostname"})
            return False
        origin = self.headers.get("Origin")
        if origin is not None:
            name, port = self._split_host()
            host = f"[{name}]" if ":" in name else name
            same = {f"http://{host}:{port}" if port else f"http://{host}"}
            if origin.lower() not in same:
                self.close_connection = True
                self._json(403, {"error": "origin not allowed"})
                return False
            self._cors_origin = origin
        return True

    def _allowed_http_origins(self) -> set[str]:
        port = self.server.server_address[1]
        return {f"http://{h}:{port}" for h in BRIDGE_ALLOWED_HOSTS}

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").strip().lower()
        if not host:
            return True  # browsers always send Host; only ancient HTTP/1.0 tools omit it
        name, sep, port = host.rpartition(":") if not host.startswith("[") else (host, "", "")
        if not sep:
            name, port = host, ""
        if name not in BRIDGE_ALLOWED_HOSTS:
            return False
        return port == "" or port == str(self.server.server_address[1])

    def parse_request(self):
        self._cors_origin = None
        self._set_token_cookie = False
        if not super().parse_request():
            return False
        if not self._client_is_loopback():
            return self._lan_parse_ok()
        if not self._host_ok():
            self.close_connection = True
            self._json(421, {"error": "Host must be 127.0.0.1 or localhost"})
            return False
        origin = self.headers.get("Origin")
        if origin is not None:
            if origin == "null" or origin in self._allowed_http_origins():
                self._cors_origin = origin
            else:
                self.close_connection = True
                self._json(403, {"error": "origin not allowed"})
                return False
        return True

    def end_headers(self):
        self.send_header("Vary", "Origin")
        if getattr(self, "_set_token_cookie", False):
            self._set_token_cookie = False
            self.send_header("Set-Cookie", f"{BRIDGE_TOKEN_COOKIE}={self.server.lan_token}; Path=/; "
                                           "Max-Age=31536000; HttpOnly; SameSite=Strict")
        origin = getattr(self, "_cors_origin", None)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Private-Network", "true")
        super().end_headers()

    @property
    def hub(self) -> ShotHub:
        return self.server.hub  # type: ignore[attr-defined]

    def _json(self, code: int, doc) -> None:
        body = json.dumps(doc).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/api/gspro/club" and self.headers.get("Origin") is not None:
            self._cors_origin = None
            return self._json(403, {"error": "cross-origin club switching not allowed"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/api/status":
            self.hub.expire_drill_if_idle()
            return self._json(200, self.hub.status())
        if url.path == "/api/shots":
            q = urllib.parse.parse_qs(url.query)
            date_str = (q.get("date") or [time.strftime("%Y-%m-%d")])[0]
            try:
                if not _DATE_RE.match(date_str):
                    raise ValueError
                datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                return self._json(400, {"error": "date must be YYYY-MM-DD"})
            return self._json(200, {"shots": self.hub.read_shots(date_str)})
        if url.path == "/api/session-stats":
            q = urllib.parse.parse_qs(url.query)
            date_str = (q.get("date") or [time.strftime("%Y-%m-%d")])[0]
            sid = (q.get("session_id") or [None])[0]
            try:
                if not _DATE_RE.match(date_str):
                    raise ValueError
                datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                return self._json(400, {"error": "date must be YYYY-MM-DD"})
            if sid is not None and not valid_context_id(sid):
                return self._json(400, {"error": "session_id must be 1-80 chars of [A-Za-z0-9_-]"})
            return self._json(200, session_stats(self.hub.read_shots(date_str), date_str, sid))
        if url.path == "/api/shortcuts":
            return self._json(200, hotkeys_doc(getattr(self.hub, "cfg", None),
                                               getattr(self.hub, "hotkey_registration", None)))
        if url.path == "/api/events":
            return self._serve_events()
        if url.path.startswith("/api/"):
            return self._json(404, {"error": "unknown endpoint"})
        return super().do_GET()

    def do_HEAD(self):
        if urllib.parse.urlsplit(self.path).path.startswith("/api/"):
            return self._json(405, {"error": "use GET"})
        return super().do_HEAD()

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path not in ("/api/drill", "/api/context", "/api/gspro/club"):
            return self._json(404, {"error": "unknown endpoint"})
        if url.path == "/api/gspro/club" and (self.headers.get("Origin") is not None
                                              or not self._client_is_loopback()):
            # Keystroke injection stays on this PC: never from a browser/sandboxed-iframe Origin (including
            # Origin: "null") and never from the LAN, even with the bridge.lan pairing token.
            self._cors_origin = None
            return self._json(403, {"error": "club switching is only allowed from this PC (no browser origin)"})
        ctype = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            # Keeps this a preflighted request for browsers (see the policy note above).
            self.close_connection = True
            return self._json(415, {"error": "Content-Type must be application/json"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > 4096:
            return self._json(400, {"error": "bad Content-Length"})
        try:
            doc = json.loads(self.rfile.read(length).decode("utf-8") or "null")
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self._json(400, {"error": "body must be JSON"})
        if url.path == "/api/gspro/club":
            if not isinstance(doc, dict):
                return self._json(400, {"error": "expected JSON object with key ('i'|'k') and steps (1-16)"})
            key = str(doc.get("key") or "").strip().lower()
            steps = doc.get("steps")
            if key not in ("i", "k") or not isinstance(steps, int) or isinstance(steps, bool) or not 1 <= steps <= 16:
                return self._json(400, {"error": "expected key in ('i', 'k') and integer steps 1-16"})
            ok, detail = send_gspro_club_keys(key, steps, cfg=getattr(self.server, "cfg", None))
            if not ok:
                return self._json(503, {"ok": False, "error": detail})
            return self._json(200, {"ok": True, "key": key, "steps": steps, "club": doc.get("club"), "detail": detail})
        if url.path == "/api/context":
            try:
                ctx = self.hub.set_context(doc)
            except ValueError as e:
                return self._json(400, {"error": str(e)})
            return self._json(200, {"context": ctx})
        if not isinstance(doc, dict) or "drill_id" not in doc or not valid_drill_id(doc["drill_id"]):
            return self._json(400, {"error": "expected {\"drill_id\": null | 1-80 chars of [A-Za-z0-9_-]}"})
        return self._json(200, {"active_drill": self.hub.set_drill(doc["drill_id"])})

    def _serve_events(self) -> None:
        hub = self.hub
        q = hub.subscribe()
        if q is None:
            self.close_connection = True
            return self._json(503, {"error": f"too many live-event clients (max {hub.max_subscribers})"})
        try:
            self.connection.settimeout(SSE_WRITE_TIMEOUT_SEC)  # a stalled reader is dropped, not waited on
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self._sse("status", hub.status())
            last_beat = time.monotonic()
            while not hub.stopping.is_set():
                try:
                    event, data = q.get(timeout=min(1.0, hub.heartbeat_sec))
                except queue.Empty:
                    if time.monotonic() - last_beat >= hub.heartbeat_sec:
                        self.wfile.write(b": heartbeat\n\n")
                        self.wfile.flush()
                        last_beat = time.monotonic()
                    continue
                self._sse(event, data)
                last_beat = time.monotonic()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass  # client went away
        finally:
            hub.unsubscribe(q)
            self.close_connection = True

    def _sse(self, event: str, data) -> None:
        payload = data if isinstance(data, str) else json.dumps(data)
        self.wfile.write(f"event: {event}\ndata: {payload}\n\n".encode("utf-8"))
        self.wfile.flush()

    def list_directory(self, path):
        self.send_error(404, "No directory listing")
        return None

    def translate_path(self, path):
        # SimpleHTTPRequestHandler already drops '..' segments; additionally refuse anything that resolves
        # (e.g. via a symlink) outside the static root.
        full = super().translate_path(path)
        root = os.path.realpath(self.directory)
        real = os.path.realpath(full)
        if real != root and not real.startswith(root + os.sep):
            return os.path.join(root, "__forbidden__", uuid.uuid4().hex)  # nonexistent -> 404
        return full


class BridgeServer:
    """ThreadingHTTPServer on 127.0.0.1 in a daemon thread. start() never raises (busy port -> logged).
    lan_token set (bridge.lan): binds 0.0.0.0 unless a host is given, and LAN clients must present the token."""

    def __init__(self, hub: ShotHub, port: int = 8765, host: str | None = None, static_dir: Path | None = None,
                 lan_token: str | None = None, cfg: dict | None = None):
        self.hub = hub
        self.lan_token = lan_token or None
        self.host = host or ("0.0.0.0" if self.lan_token else "127.0.0.1")
        self.requested_port = int(port)
        self.static_dir = Path(static_dir) if static_dir else (HERE / "drills")
        self.cfg = cfg
        self.httpd: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int | None:
        return self.httpd.server_address[1] if self.httpd else None

    def start(self) -> bool:
        if self.httpd:
            return True
        handler = functools.partial(BridgeRequestHandler, directory=str(self.static_dir))
        try:
            httpd = http.server.ThreadingHTTPServer((self.host, self.requested_port), handler)
        except OSError as e:
            LOG.warning("Shot bridge could not listen on %s:%s (%s); continuing without it",
                        self.host, self.requested_port, e)
            return False
        httpd.daemon_threads = True
        httpd.hub = self.hub  # type: ignore[attr-defined]
        httpd.lan_token = self.lan_token  # type: ignore[attr-defined]
        httpd.cfg = self.cfg  # type: ignore[attr-defined]
        self.hub.stopping.clear()
        self.httpd = httpd
        self._thread = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.5},
                                        name="BridgeServer", daemon=True)
        self._thread.start()
        threading.Thread(target=self._reap, name="BridgeDrillReaper", daemon=True).start()
        LOG.info("Shot bridge listening on http://%s:%s/ (drills hub + /api/status)", self.host, self.port)
        if self.lan_token:  # never log the token itself
            LOG.info("Shot bridge LAN access ON (pairing token required); phone URL: python simwatch.py phone")
        return True

    def _reap(self) -> None:
        hub = self.hub
        while not hub.stopping.wait(hub.reaper_interval):
            try:
                hub.expire_drill_if_idle()
            except Exception:
                log_throttled("bridge-reaper", "drill expiry check failed", exc_info=True)

    def stop(self) -> None:
        self.hub.stopping.set()
        if self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception:
                pass
            self.httpd = None


def bridge_sessions_dir(cfg: dict | None, demo: bool = False) -> Path:
    """Where shots.jsonl lives: bridge.sessions_dir, or (demo) bridge.demo_sessions_dir - never the real one."""
    bcfg = bridge_config(cfg)
    if demo:
        raw = Path(str(bcfg.get("demo_sessions_dir") or BRIDGE_DEMO_SESSIONS_DIR))
    else:
        raw = Path(str(bcfg.get("sessions_dir") or BRIDGE_DEFAULTS["sessions_dir"]))
    return raw if raw.is_absolute() else HERE / raw


def start_bridge(cfg: dict, force: bool = False, port: int | None = None,
                 demo: bool = False) -> tuple[ShotHub | None, BridgeServer | None]:
    """Create the hub + server from config. Returns (None, None) when disabled. Never raises."""
    global BRIDGE_HUB
    bcfg = bridge_config(cfg)
    if not force and not bcfg.get("enabled", True):
        return None, None
    try:
        hub = ShotHub(ShotStore(bridge_sessions_dir(cfg, demo)))
        hub.demo = demo
        hub.cfg = cfg
        lan_token = bridge_token(create=True) if bridge_lan_enabled(cfg) else None
        if bridge_lan_enabled(cfg) and not lan_token:
            LOG.warning("bridge.lan is on but no pairing token could be created; serving 127.0.0.1 only")
        server = BridgeServer(hub, port=int(port if port is not None else bcfg.get("port", 8765)),
                              lan_token=lan_token, cfg=cfg)
    except Exception as e:
        LOG.warning("Shot bridge disabled: bad bridge config (%s)", e)
        return None, None
    if not server.start():
        # Most likely `simwatch.py bridge` (or another watcher) already owns the port and is recording.
        # Don't build a second recorder here: two processes appending to one shots.jsonl would duplicate shots.
        LOG.warning("Shot bridge already running in another process (port %s busy); not recording shots here",
                    server.requested_port)
        return None, None
    BRIDGE_HUB = hub
    return hub, server


def make_bridge_sniffer(hub: ShotHub) -> OpenConnectMonitor:
    """An OpenConnect sniffer that only records shots into the bridge (no video rig)."""
    def on_shot(info: dict) -> None:
        if info.get("shot"):
            rec = hub.record_shot(info["shot"])
            LOG.info("Shot %s recorded (club=%s, speed=%s, drill=%s)", rec.get("shot_num"), rec.get("club"),
                     rec["ball"].get("speed"), rec.get("drill_id"))

    def on_club(club: str) -> None:
        LOG.info("Active club -> %s", club)
        hub.set_club(club)

    sniffer = OpenConnectMonitor(on_shot, on_club)
    hub.sniffer = sniffer
    return sniffer


def sync_bridge_sniffer(sniffer: OpenConnectMonitor | None, run: bool) -> None:
    """Start/stop a bridge-only sniffer with the watch loop's gate (GSPro running and not paused)."""
    if sniffer is None:
        return
    running = bool(sniffer._thread and sniffer._thread.is_alive() and not sniffer._stop.is_set())
    if run and not running:
        sniffer.start()
    elif not run and running:
        sniffer.stop()


def _bridge_note_health(state: str, res: dict) -> None:
    """Cache the latest watch-loop verdict for /api/status (cheap; no extra checks are run)."""
    hub = BRIDGE_HUB
    if hub is not None:
        prev = hub.health or {}
        health = {"state": state, "all_ok": bool(res.get("all_ok")), "failing": list(res.get("failing") or []),
                  "ts": local_iso_now()}
        hub.health = health
        # Push only real changes (state or failing set) so ShotLab / the drills hub can show rig health live.
        if (prev.get("state"), prev.get("failing")) != (health["state"], health["failing"]):
            hub.broadcast("health", health)


# --------------------------------------------------------------------------- ShotLab companion supervisor

SHOTLAB_DEFAULTS = {
    "enabled": False,
    "dir": "shotlab",
    "obs_port": 8766,
    "startup_grace_sec": 45,       # time a fresh launch gets to answer /api/health
    "health_fail_ticks": 6,        # consecutive failed probes (after grace) before a live process counts as hung
    "restart_backoff_sec": [10, 30, 120, 300],
    "healthy_reset_sec": 300,      # healthy this long -> crash backoff starts over
}


def shotlab_config(cfg: dict | None) -> dict:
    """The `shotlab` section with defaults; bad values fall back to the default (logged) so a config typo
    in this optional feature can never take down the watchdog."""
    out = dict(SHOTLAB_DEFAULTS)
    raw = (cfg or {}).get("shotlab")
    if not isinstance(raw, dict):
        return out

    def bad(key, val):
        log_throttled(f"shotlab-cfg:{key}", f"config shotlab.{key}={val!r} is invalid; using {SHOTLAB_DEFAULTS[key]!r}",
                      every_sec=3600.0)

    for key, val in raw.items():
        if str(key).startswith("_") or key not in SHOTLAB_DEFAULTS:
            continue
        default = SHOTLAB_DEFAULTS[key]
        try:
            if key == "enabled":
                if not isinstance(val, bool):
                    raise ValueError
                out[key] = val
            elif key == "dir":
                if not isinstance(val, str) or not val.strip():
                    raise ValueError
                out[key] = val
            elif key == "restart_backoff_sec":
                seq = [float(x) for x in val] if isinstance(val, list) else None
                if not seq or any(not math.isfinite(x) or x < 0 for x in seq):
                    raise ValueError
                out[key] = seq
            elif key == "obs_port":
                port = int(val)
                if isinstance(val, bool) or not 1 <= port <= 65535:
                    raise ValueError
                out[key] = port
            else:  # numeric knobs
                num = float(val)
                if isinstance(val, bool) or not math.isfinite(num) or num <= 0:
                    raise ValueError
                out[key] = int(num) if isinstance(default, int) else num
        except (TypeError, ValueError):
            bad(key, val)
    return out


def shotlab_dir(cfg: dict | None) -> Path:
    d = Path(str(shotlab_config(cfg).get("dir") or "shotlab"))
    return d if d.is_absolute() else HERE / d


def shotlab_electron_exe(cfg: dict | None) -> Path:
    name = "electron.exe" if IS_WINDOWS else "electron"
    return shotlab_dir(cfg) / "node_modules" / "electron" / "dist" / name


def probe_shotlab_health(port: int, timeout: float = 1.5) -> dict | None:
    """GET ShotLab's /api/health on the OBS server. Returns the doc only if it really is ShotLab."""
    import http.client
    conn = http.client.HTTPConnection("127.0.0.1", int(port), timeout=timeout)
    try:
        conn.request("GET", "/api/health")
        resp = conn.getresponse()
        if resp.status != 200:
            return None
        doc = json.loads(resp.read(65536).decode("utf-8", "replace"))
        return doc if isinstance(doc, dict) and doc.get("app") == "shotlab" else None
    except (OSError, ValueError, http.client.HTTPException):
        return None
    finally:
        conn.close()


def port_listener_pid(port: int) -> int | None:
    """PID listening on 127.0.0.1/any :port, else None (also None if sockets can't be enumerated)."""
    try:
        for c in psutil.net_connections(kind="tcp"):
            if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == int(port):
                return c.pid
    except (psutil.Error, OSError):
        pass
    return None


def launch_shotlab(cfg: dict, bridge_port: int | None = None, activate: bool = False):
    """Start ShotLab's Electron app. By default it opens behind GSPro without taking focus;
    activate=True (hotkey / `shotlab` command) opens it in front. Returns the Popen, or None."""
    exe = shotlab_electron_exe(cfg)
    app_dir = shotlab_dir(cfg)
    if not exe.exists():
        log_throttled("shotlab-missing", f"ShotLab not installed ({exe} missing); run setup.bat or run_shotlab.bat once",
                      every_sec=3600.0)
        return None
    scfg = shotlab_config(cfg)
    env = dict(os.environ)
    if not activate:
        env["SHOTLAB_LAUNCHED_BY"] = "simwatch"  # ShotLab opens its window without activating it
    env["SHOTLAB_OBS_PORT"] = str(int(scfg["obs_port"]))
    env["SIMWATCH_PORT"] = str(int(bridge_port or bridge_config(cfg).get("port", 8765)))
    env.pop("ELECTRON_RUN_AS_NODE", None)
    kwargs: dict = {"cwd": str(app_dir), "env": env}
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 1 if activate else 4  # SW_SHOWNORMAL : SW_SHOWNOACTIVATE
        kwargs["startupinfo"] = si
    try:
        proc = subprocess.Popen([str(exe), str(app_dir)], **kwargs)
    except OSError as e:
        log_throttled("shotlab-start", f"could not start ShotLab: {e}")
        return None
    LOG.info("Launched ShotLab (pid %s, OBS overlays on :%s)", proc.pid, scfg["obs_port"])
    return proc


def toggle_shotlab_window(cfg: dict, supervisor: "ShotLabSupervisor | None" = None) -> str:
    """Alt+S: front-most ShotLab -> minimize (GSPro gets focus back); otherwise restore + focus it;
    not running -> open it in front (through the supervisor when there is one, so crashes still relaunch)."""
    health = probe_shotlab_health(int(shotlab_config(cfg)["obs_port"]))
    if not health:
        ok = supervisor.launch_now(activate=True) if supervisor else bool(launch_shotlab(cfg, activate=True))
        return "launched" if ok else "unavailable (not installed?)"
    try:
        pid = int(health.get("pid"))
    except (TypeError, ValueError):
        return "running but reported no pid"
    hwnd = find_window_for_pid(pid, title_re=r"^ShotLab", include_minimized=True)
    if not hwnd:
        return "running but its window was not found"
    import win32con
    import win32gui
    if win32gui.GetForegroundWindow() == hwnd and not win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
        return "hidden"
    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE if win32gui.IsIconic(hwnd) else win32con.SW_SHOW)
    try:
        win32gui.SetForegroundWindow(hwnd)  # allowed: we just received the WM_HOTKEY input
    except Exception as e:
        log_throttled("shotlab-fg", f"could not bring ShotLab to the front: {e}")
    return "shown"


class ShotLabSupervisor:
    """Keeps the ShotLab desktop app alive alongside the rig, without ever touching rig health/recovery.

    - Launches ShotLab once the gated sim app (GSPro) is up.
    - Exit code 0 = the user closed it: leave it closed until the next GSPro session.
    - Non-zero exit = crash: relaunch with backoff. Alive but not answering /api/health past the grace
      period (and it owns its port) = hung: kill and relaunch with the same backoff.
    - A ShotLab someone started by hand (run_shotlab.bat) is "adopted": monitored, never killed.
    Collaborators are injectable so the state machine is testable off Windows.
    """

    def __init__(self, cfg: dict, launcher=None, probe=None, port_owner=None, clock=time.monotonic,
                 installed=None):
        self.cfg = cfg
        self.scfg = shotlab_config(cfg)
        self.port = int(self.scfg["obs_port"])
        self._launch = launcher or (lambda activate=False: launch_shotlab(cfg, activate=activate))
        self._lock = threading.RLock()  # tick() runs on the watch thread, launch_now() on the hotkey thread
        self._probe = probe or (lambda: probe_shotlab_health(self.port))
        self._port_owner = port_owner or (lambda: port_listener_pid(self.port))
        self._installed = installed or (lambda: shotlab_electron_exe(cfg).exists())
        self._clock = clock
        self.proc = None
        self.state = "idle"
        self.detail = ""
        self.launched_at = 0.0
        self.health_fails = 0
        self.attempts = 0
        self.next_at = 0.0
        self.healthy_since = None
        self.last_health: dict | None = None
        self.prev_gate_up = False
        self.was_healthy = False  # the current launch has answered /api/health at least once

    def _backoff(self) -> float:
        seq = [float(x) for x in (self.scfg.get("restart_backoff_sec") or [30])]
        return seq[min(self.attempts, len(seq)) - 1] if self.attempts else 0.0

    def _schedule_restart(self, why: str) -> None:
        self.proc = None
        self.attempts += 1
        wait = self._backoff()
        self.next_at = self._clock() + wait
        self.state, self.detail = "restart_pending", f"{why}; relaunch in {int(wait)}s (attempt {self.attempts})"
        LOG.warning("ShotLab %s", self.detail)

    def _kill(self) -> None:
        proc = self.proc
        if proc is None:
            return
        try:
            proc.kill()
            proc.wait(timeout=5)
        except Exception:
            pass

    def _mark_healthy(self, health: dict, state: str) -> None:
        now = self._clock()
        self.was_healthy = True
        self.health_fails = 0
        self.last_health = health
        if self.healthy_since is None:
            self.healthy_since = now
        elif self.attempts and now - self.healthy_since >= float(self.scfg["healthy_reset_sec"]):
            self.attempts = 0
        self.state, self.detail = state, ""

    def launch_now(self, activate: bool = True) -> bool:
        """Open ShotLab immediately (hotkey). Clears user_closed/backoff; the result is supervised as usual."""
        with self._lock:
            if self.proc is not None and self.proc.poll() is None:
                return True
            proc = self._launch(activate=activate)
            if proc is None:
                return False
            self.proc, self.launched_at, self.health_fails = proc, self._clock(), 0
            self.was_healthy = False
            self.attempts, self.next_at = 0, 0.0
            self.state, self.detail = "starting", ""
            return True

    def tick(self, gate_up: bool, paused: bool = False) -> None:
        """gate_up = the GSPro session is live (its rising edge = a new session); paused = PAUSE file present
        (only blocks launching, so pausing/unpausing never reopens a ShotLab the user closed)."""
        try:
            with self._lock:
                self._tick(gate_up, paused)
        except Exception as e:  # ShotLab supervision must never disturb the rig watch loop
            self.state, self.detail = "error", f"{type(e).__name__}: {e}"
            log_throttled("shotlab-tick", f"ShotLab supervisor error: {e}", every_sec=300.0, exc_info=True)

    def _tick(self, gate_up: bool, paused: bool = False) -> None:
        if not self.scfg.get("enabled"):
            self.state = "disabled"
            return
        now = self._clock()
        if gate_up and not self.prev_gate_up and self.state == "user_closed":
            self.state, self.detail = "idle", ""  # a new GSPro session: bring ShotLab back
        self.prev_gate_up = gate_up

        health = self._probe()
        if self.proc is not None:
            rc = self.proc.poll()
            if rc is None:
                if health is not None:
                    self._mark_healthy(health, "running")
                    return
                self.healthy_since = None
                if now - self.launched_at < float(self.scfg["startup_grace_sec"]):
                    self.state, self.detail = "starting", ""
                    return
                owner = self._port_owner()
                if owner is not None and owner != self.proc.pid:
                    # Something else holds ShotLab's port; restarting would just loop. Report it.
                    self.state = "port_conflict"
                    self.detail = f"port {self.port} is held by pid {owner}; change shotlab.obs_port or free it"
                    log_throttled("shotlab-port", f"ShotLab: {self.detail}", every_sec=600.0)
                    return
                self.health_fails += 1
                self.state, self.detail = "unresponsive", f"{self.health_fails} failed health probe(s)"
                if self.health_fails >= int(self.scfg["health_fail_ticks"]):
                    self._kill()
                    self._schedule_restart("was unresponsive")
                return
            self.proc = None
            self.healthy_since = None
            if rc == 0 and now - self.launched_at < float(self.scfg["startup_grace_sec"]) and not self.was_healthy:
                # ShotLab is single-instance: a copy that quits with 0 before ever answering means another
                # (unresponsive) ShotLab already holds the lock. Report it; don't call it a user close.
                self.attempts += 1
                self.next_at = now + self._backoff()
                self.state = "other_instance"
                self.detail = ("another ShotLab is running but not answering on "
                               f":{self.port} (hung, or its OBS port is taken); close it in Task Manager")
                log_throttled("shotlab-other", f"ShotLab: {self.detail}", every_sec=600.0)
                return
            if rc == 0:
                self.state, self.detail = "user_closed", "closed by the user; reopens with the next GSPro session"
                LOG.info("ShotLab closed (exit 0); not relaunching until the next GSPro session.")
                return
            self._schedule_restart(f"exited with code {rc}")
            return

        # No process of ours.
        if health is not None:
            self._mark_healthy(health, "adopted")  # started by hand; watch it, never kill it
            return
        self.healthy_since = None
        if self.state == "adopted":
            self.state, self.detail = "user_closed", "manually started instance went away"
            return
        if self.state == "user_closed" or not gate_up or paused:
            return
        if self.state in ("restart_pending", "other_instance") and now < self.next_at:
            return
        if not self._installed():
            self.state, self.detail = "not_installed", "run setup.bat (or run_shotlab.bat once) to install Electron"
            return
        proc = self._launch()
        if proc is None:
            self._schedule_restart("failed to launch")
            return
        self.proc, self.launched_at, self.health_fails = proc, now, 0
        self.was_healthy = False
        self.state, self.detail = "starting", ""

    def status(self) -> dict:
        doc = {"state": self.state, "port": self.port}
        if self.detail:
            doc["detail"] = self.detail
        if self.proc is not None:
            doc["pid"] = self.proc.pid
        if self.last_health and self.state in ("running", "adopted"):
            doc["bridge_connected"] = self.last_health.get("bridgeConnected")
            doc["obs_clients"] = self.last_health.get("obsClients")
        return doc


def demo_openconnect_message(n: int) -> dict:
    """A plausible synthetic OpenConnect v1 shot (for `bridge --demo`), with coherent club data:
    start line follows face (~75%) and path (~25%), spin axis follows face-to-path, AoA follows the club."""
    club, speed, vla, spin, aoa_mu, smash = random.choice([
        ("Driver", 148, 12.5, 2600, 1.5, 1.45), ("7Iron", 118, 17.5, 6500, -4.0, 1.33),
        ("PW", 98, 26.0, 8800, -5.0, 1.24), ("5Iron", 128, 14.0, 5200, -3.0, 1.38),
    ])
    path = random.gauss(-1.0, 2.5)
    face = path + random.gauss(0.0, 1.8)  # face-to-path drives curvature
    f2p = face - path
    hla = 0.75 * face + 0.25 * path + random.gauss(0, 0.4)
    ball_speed = speed + random.uniform(-6, 6)
    club_speed = ball_speed / max(1.1, random.gauss(smash, 0.03))
    msg = {
        "DeviceID": "SimWatch Demo", "Units": "Yards", "ShotNumber": n, "APIversion": "1",
        "Player": {"Handed": "RH", "Club": club},
        "BallData": {
            "Speed": round(ball_speed, 1),
            "SpinAxis": round(max(-25.0, min(25.0, f2p * 3.5)) + random.gauss(0, 1.0), 1),
            "TotalSpin": round(spin + random.uniform(-500, 500)),
            "HLA": round(hla, 1),
            "VLA": round(vla + random.uniform(-2, 2), 1),
            "CarryDistance": round(speed * 1.55 + random.uniform(-8, 8), 1),
        },
        "ShotDataOptions": {"ContainsBallData": True, "ContainsClubData": True},
    }
    msg["ClubData"] = {
        "Speed": round(club_speed, 1),
        "AngleOfAttack": round(random.gauss(aoa_mu, 1.5), 1),
        "FaceToTarget": round(face, 1),
        "Path": round(path, 1),
    }
    return msg


def cmd_bridge(cfg: dict, demo: bool = False, demo_interval: float = 4.0, port: int | None = None) -> None:
    """Run only the shot bridge + OpenConnect sniffer (works off Windows; the sniffer just reports unavailable).

    --demo: synthetic shots only, written to bridge.demo_sessions_dir (default Swings/Sessions-demo) and
    tagged "demo": true; the real :921 sniffer is NOT started, so no real shot lands in the demo files."""
    hub, server = start_bridge(cfg, force=True, port=port, demo=demo)
    if not hub or not server or not server.httpd:
        sys.exit("Shot bridge could not start (see log above).")

    sniffer = make_bridge_sniffer(hub)
    if not demo:
        sniffer.start()
    LOG.info("Bridge-only mode running%s (Ctrl+C to stop). Status: http://127.0.0.1:%s/api/status",
             f" with synthetic demo shots -> {hub.store.sessions_dir}" if demo else "", server.port)
    n = 0
    try:
        while True:
            time.sleep(max(0.5, demo_interval) if demo else 1.0)
            if demo:
                n += 1
                sniffer._handle_json(demo_openconnect_message(n))
    except KeyboardInterrupt:
        LOG.info("Stopping bridge.")
    finally:
        sniffer.stop()
        server.stop()


_HOTKEY_OEM = {"/": 0xBF, ";": 0xBA, "=": 0xBB, ",": 0xBC, "-": 0xBD, ".": 0xBE, "`": 0xC0,
               "[": 0xDB, "\\": 0xDC, "]": 0xDD, "'": 0xDE}


def parse_hotkey(spec: str) -> tuple[int, int] | None:
    """Parse 'Alt+H' / 'Ctrl+Shift+P' / 'F8' / 'Alt+/' into (win32_mods, vk_code)."""
    MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN, MOD_NOREPEAT = 0x0001, 0x0002, 0x0004, 0x0008, 0x4000
    if not isinstance(spec, str):
        return None
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
        else:
            return None
    if len(key) == 1 and ("A" <= key <= "Z" or "0" <= key <= "9"):
        return mods, ord(key)
    if key in _HOTKEY_OEM:
        return mods, _HOTKEY_OEM[key]
    if key.startswith("F") and key[1:].isdigit():
        num = int(key[1:])
        if 1 <= num <= 24:
            return mods, 0x70 + (num - 1)
    special = {"SPACE": 0x20, "ENTER": 0x0D, "RETURN": 0x0D, "TAB": 0x09, "ESC": 0x1B, "ESCAPE": 0x1B}
    if key in special:
        return mods, special[key]
    return None


# --------------------------------------------------------------------------- shortcut map (single source of truth)
# HOTKEY_ACTIONS is the ONE list of global shortcuts: (action, default key, group, plain-English description).
# config.json `video.hotkeys` overrides the key per action ("" or null disables one; a list gives aliases).
# Every consumer renders it: the HUD (Alt+H), `simwatch.py keys` / `hotkeys`, docs/SHORTCUTS.md (`keys md`),
# the bridge's /api/shortcuts (drills hub panel), /api/status + simwatch_status.json `hotkeys` (ShotLab's Keys
# pill: [{action, keys, label, state}]) and the doctor rows.
# Keys are Alt+<letter> on purpose: GSPro binds many bare letter keys and some Ctrl combos, but no Alt+<letter>
# that we know of, and a registered global hotkey is swallowed before GSPro could see it anyway.

HOTKEY_GROUPS = ("Replay", "Compare", "Reference", "Session / Bookmark", "System")
HOTKEY_ACTIONS: tuple[tuple[str, str, str, str], ...] = (
    ("replay_now", "Alt+V", "Replay", "Show the last swing replay now (DTL | FO)"),
    ("replay_pin", "Alt+K", "Replay", "Keep the replay open; press again to close it"),
    ("replay_dismiss", "Alt+X", "Replay", "Close the replay / comparison and go back to GSPro"),
    ("replay_auto", "Alt+A", "Replay", "Auto replay after each shot: on / off"),
    ("toggle_lines", "Alt+L", "Replay", "Show / hide the swing plane lines on the replay"),
    ("save_lines", "Alt+Shift+L", "Replay", "Save the lines you dragged in Kinovea as the new default"),
    ("compare_cycle", "Alt+M", "Compare", "Match up with the reference: DTL you|ref -> FO you|ref -> back"),
    ("cycle_reference", "Alt+R", "Reference", "Next reference: My-Go-To -> each pro -> your previous swing"),
    ("bookmark_goto", "Alt+G", "Session / Bookmark", "Save the last swing as your My-Go-To for this club"),
    ("trigger_shot", "Alt+C", "Session / Bookmark", "Record a swing now (manual camera trigger)"),
    ("open_folder", "Alt+O", "Session / Bookmark", "Open today's swing folder in Explorer"),
    ("open_drills", "Alt+D", "Session / Bookmark", "Open the drills hub"),
    ("cheatsheet", "Alt+H", "System", "Show / hide this shortcut map (auto-hides)"),
    ("toggle_shotlab", "Alt+S", "System", "Show / hide ShotLab (opens it if closed)"),
    ("toggle_pip", "Alt+P", "System", "Pin / unpin the OBS projector picture-in-picture"),
)
HOTKEY_ACTION_NAMES = tuple(d[0] for d in HOTKEY_ACTIONS)
_HOTKEY_GROUP_OF = {d[0]: d[2] for d in HOTKEY_ACTIONS}
_HOTKEY_LABEL_OF = {d[0]: d[3] for d in HOTKEY_ACTIONS}
# Free-key candidates offered when a shortcut can't be registered (another app owns it). Alt+Z / Alt+F-keys are
# skipped: NVIDIA/AMD overlays commonly own them.
HOTKEY_SUGGEST_POOL = ("Alt+B", "Alt+J", "Alt+N", "Alt+U", "Alt+Y", "Alt+I", "Alt+Q", "Alt+W", "Alt+E",
                       "Alt+T", "Alt+1", "Alt+2", "Alt+3", "Alt+4", "Alt+5", "Alt+6", "Alt+7", "Alt+8", "Alt+9")
_HOTKEY_RESERVED = {  # (mods without NOREPEAT, vk) -> why
    (0x0001, 0x09): "Alt+Tab (Windows task switcher)", (0x0001, 0x73): "Alt+F4 (closes the active window)",
    (0x0001, 0x20): "Alt+Space (window menu)", (0x0001, 0x1B): "Alt+Esc (Windows window cycling)",
    (0x0001, 0x0D): "Alt+Enter (Unity/GSPro fullscreen toggle)",
}


def hotkey_specs(value) -> list[str]:
    """A config hotkey value -> list of key specs ("" / None -> disabled; list -> aliases)."""
    if value is None or value is False:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, (list, tuple)):
        return [v.strip() for v in value if isinstance(v, str) and v.strip()]
    return []


def hotkeys_cfg_of(cfg: dict | None) -> dict:
    """The `video.hotkeys` override dict of a full config ({} when absent or malformed)."""
    vcfg = (cfg or {}).get("video", {}) if isinstance(cfg, dict) else {}
    vcfg = vcfg if isinstance(vcfg, dict) else {}
    return vcfg.get("hotkeys") if isinstance(vcfg.get("hotkeys"), dict) else {}


def effective_hotkeys(hotkeys_cfg: dict | None) -> dict[str, list[str]]:
    """action -> key specs for EVERY action in HOTKEY_ACTIONS: the defaults overlaid with `video.hotkeys`
    (pass that dict, e.g. hotkeys_cfg_of(cfg)). A disabled action maps to []. Idempotent: feeding the result
    back in gives the same map."""
    over = hotkeys_cfg if isinstance(hotkeys_cfg, dict) else {}
    return {action: (hotkey_specs(over[action]) if action in over else [default])
            for action, default, _g, _d in HOTKEY_ACTIONS}


def hotkey_states(registration: dict | None, hk_map: dict[str, list[str]] | None = None) -> dict[str, str]:
    """action -> ok | ctrl_alt_only | failed | invalid, from either a register_hotkeys() report
    ({ok: [...], failed: [...]}) or an already-flat {action: state} dict (e.g. read back from /api/status)."""
    reg = registration if isinstance(registration, dict) else {}
    if not ("ok" in reg or "failed" in reg):
        return {str(a): str(s) for a, s in reg.items() if isinstance(s, str)}
    by_spec = {s: a for a, specs in (hk_map or {}).items() for s in specs}
    states: dict[str, str] = {}
    for o in reg.get("ok") or []:
        if isinstance(o, dict) and o.get("action"):
            states.setdefault(o["action"], "ok")
    rank = {"ok": 0, "ctrl_alt_only": 1, "failed": 2, "invalid": 3}
    for f in reg.get("failed") or []:
        if not isinstance(f, dict):
            continue
        action = f.get("action") or by_spec.get(f.get("spec"))
        if not action:
            continue
        st = "invalid" if f.get("error") else ("ctrl_alt_only" if f.get("fallback") else "failed")
        if rank[st] > rank.get(states.get(action, "ok"), 0):
            states[action] = st
    return states


def hotkey_rows(hotkeys_cfg: dict | None, registration: dict | None = None) -> list[dict]:
    """[{action, keys, label, state}] in HOTKEY_ACTIONS order, disabled actions omitted. `keys` is one string
    ("Alt+H" or "Alt+H / Alt+/"): this is the /api/status + simwatch_status.json shape ShotLab's Keys pill reads.
    state: ok | ctrl_alt_only | failed | invalid | unknown (registration not known)."""
    hk = effective_hotkeys(hotkeys_cfg)
    states = hotkey_states(registration, hk)
    return [{"action": a, "keys": " / ".join(hk[a]), "label": label, "state": states.get(a, "unknown")}
            for a, _k, _g, label in HOTKEY_ACTIONS if hk[a]]


def hotkey_groups(cfg: dict | None) -> list[dict]:
    """[{group, keys: [{action, keys: [..], description}]}] in HOTKEY_GROUPS order (disabled actions omitted)."""
    hk = effective_hotkeys(hotkeys_cfg_of(cfg))
    groups = []
    for g in HOTKEY_GROUPS:
        rows = [{"action": a, "keys": hk[a], "description": d} for a, _k, grp, d in HOTKEY_ACTIONS
                if grp == g and hk[a]]
        if rows:
            groups.append({"group": g, "keys": rows})
    return groups


HOTKEY_FALLBACK_NOTE = ("Every plain Alt+<key> shortcut also works as Ctrl+Alt+<key> (registered as a fallback in "
                        "case another program already owns the Alt+<key> combination).")


def format_hotkey_cheatsheet(rows: list[dict]) -> str:
    """hotkey_rows() as grouped plain text (CLI `keys` / `hotkeys`, startup log), flagging unregistered keys."""
    lines = ["== SimWatch shortcuts (change them in config.json -> video.hotkeys) =="]
    for g in HOTKEY_GROUPS:
        grows = [r for r in rows if _HOTKEY_GROUP_OF.get(r.get("action")) == g]
        if not grows:
            continue
        lines += ["", g]
        for r in grows:
            keys = r["keys"]
            note = {
                "failed": f"   [NOT REGISTERED: {keys} - another app owns it; `simwatch.py doctor` suggests a free key]",
                "ctrl_alt_only": "   (taken by another app: use " + " / ".join("Ctrl+" + k for k in keys.split(" / "))
                                 + ")",
                "invalid": f"   [NOT REGISTERED: {keys} is not a valid key spec in config.json]",
            }.get(r.get("state"), "")
            lines.append(f"  {keys:<14} {r['label']}{note}")
    lines += ["", HOTKEY_FALLBACK_NOTE]
    return "\n".join(lines)


def render_hotkeys_text(cfg: dict | None, registration: dict | None = None) -> str:
    """The grouped shortcut map of a full config as plain text."""
    return format_hotkey_cheatsheet(hotkey_rows(hotkeys_cfg_of(cfg), registration))


def _md(text: str) -> str:
    """Markdown-safe: `Alt+<key>`-style placeholders in code spans, pipes escaped for table cells."""
    return re.sub(r"(\S*<\w+>)", r"`\1`", text).replace("|", "\\|")


def render_hotkeys_markdown(cfg: dict | None) -> str:
    """docs/SHORTCUTS.md content (regenerate with `python simwatch.py keys md`)."""
    out = ["# SimWatch shortcuts", "",
           "<!-- Generated by `python simwatch.py keys md` from HOTKEY_ACTIONS in simwatch.py + config.json "
           "`video.hotkeys`. Do not edit by hand. -->", "",
           "Global shortcuts work while SimWatch's video rig runs, even when GSPro has focus. Press **"
           + " / ".join(effective_hotkeys(hotkeys_cfg_of(cfg)).get("cheatsheet") or ["Alt+H"])
           + "** for the on-screen map. Change any key in `config.json` -> `video.hotkeys` (\"\" disables one; "
           "a list such as `[\"Alt+H\", \"Alt+/\"]` gives aliases).", ""]
    for g in hotkey_groups(cfg):
        out += [f"## {g['group']}", "", "| Shortcut | What it does |", "|---|---|"]
        for row in g["keys"]:
            out.append(f"| {' / '.join('`' + k + '`' for k in row['keys'])} | {_md(row['description'])} |")
        out.append("")
    out += ["## Notes", "", f"- {_md(HOTKEY_FALLBACK_NOTE)}",
            "- If a shortcut can't be registered (another program owns it), the startup log says so and suggests "
            "a free one; `python simwatch.py doctor` shows the registration status.",
            "- The same list appears on screen (Alt+H), in `python simwatch.py keys`, in ShotLab's Keys pill and in "
            "the drills hub Shortcuts panel.",
            _md("- Shortcuts use Alt+<key> because GSPro uses many single-letter keys. Avoid bare letters, F-keys "
                "without a modifier, Ctrl+<letter>, Alt+Enter (fullscreen toggle) and Alt+Tab/F4/Space/Esc."), ""]
    return "\n".join(out)


def hotkeys_doc(cfg: dict | None, registration: dict | None = None) -> dict:
    """JSON for the bridge's /api/shortcuts."""
    doc = {"groups": hotkey_groups(cfg), "note": HOTKEY_FALLBACK_NOTE}
    if registration:
        doc["registration"] = registration
    return doc


def _hotkey_canon(spec: str) -> tuple[int, int] | None:
    parsed = parse_hotkey(spec)
    return (parsed[0] & ~0x4000, parsed[1]) if parsed else None


def hotkey_conflicts(cfg: dict | None) -> list[tuple[str, str]]:
    """Static problems in the shortcut map: [(severity, message)]. Pure (no registration attempt)."""
    out: list[tuple[str, str]] = []
    over = hotkeys_cfg_of(cfg)
    for k in over:
        if k not in HOTKEY_ACTION_NAMES and not str(k).startswith("_"):
            out.append(("warning", f"video.hotkeys.{k}: unknown action (valid: {', '.join(HOTKEY_ACTION_NAMES)})"))
    seen: dict[tuple[int, int], str] = {}
    for action, specs in effective_hotkeys(over).items():
        for spec in specs:
            canon = _hotkey_canon(spec)
            if canon is None:
                out.append(("warning", f"{action}: {spec!r} is not a valid key (e.g. Alt+V, Ctrl+Alt+F8, Alt+/)"))
                continue
            mods, vk = canon
            if canon in seen and seen[canon] != action:
                out.append(("warning", f"{spec} is assigned to both {seen[canon]} and {action}"))
            seen.setdefault(canon, action)
            if canon in _HOTKEY_RESERVED:
                out.append(("warning", f"{action}: {spec} overrides {_HOTKEY_RESERVED[canon]}"))
            elif mods == 0:
                out.append(("warning", f"{action}: {spec} has no modifier - GSPro (and every other app) would "
                                       f"never receive that key while SimWatch runs; use Alt+<key>"))
            elif mods in (0x0002, 0x0004, 0x0006):
                out.append(("warning", f"{action}: {spec} (Ctrl/Shift without Alt) may collide with GSPro or "
                                       f"Kinovea shortcuts; Alt+<key> is safer"))
    return out


def suggest_free_hotkey(hk_map: dict[str, list[str]], probe=None, exclude: set | None = None) -> str | None:
    """First HOTKEY_SUGGEST_POOL key not used by `hk_map` (effective_hotkeys), not excluded, and (if `probe`)
    registrable right now."""
    used = {_hotkey_canon(s) for specs in hk_map.values() for s in specs}
    used |= {_hotkey_canon(s) for s in (exclude or set())}
    for cand in HOTKEY_SUGGEST_POOL:
        if _hotkey_canon(cand) in used:
            continue
        try:
            if probe is None or probe(cand):
                return cand
        except Exception:
            continue
    return None


def probe_hotkey(spec: str) -> bool:
    """True if `spec` can be registered right now (registers + immediately unregisters). Windows only."""
    parsed = parse_hotkey(spec)
    if not parsed or not IS_WINDOWS:
        return False
    user32 = ctypes.windll.user32
    probe_id = 0xBF00
    if user32.RegisterHotKey(None, probe_id, parsed[0], parsed[1]):
        user32.UnregisterHotKey(None, probe_id)
        return True
    return False


def register_hotkeys(hk: dict[str, list[str]], actions, register, probe=None) -> tuple[list, dict]:
    """Register each action's keys (+ the Ctrl+Alt fallback for a bare Alt+<key>) through `register`.

    hk: effective_hotkeys(...). register(hk_id, mods, vk) -> bool and probe(spec) -> bool are injected so this
    is testable. Returns (registered [(hk_id, action, spec)], {ok: [{action, spec}], failed: [{action, spec,
    fallback, suggest}]}); hotkey_states() flattens the report to per-action states."""
    registered, ok, failed = [], [], []
    hk_id = 1
    taken: set[str] = set()
    for action in actions:
        for spec in hk.get(action, []):
            parsed = parse_hotkey(spec)
            if not parsed:
                failed.append({"action": action, "spec": spec, "error": "invalid key", "fallback": None,
                               "suggest": None})
                continue
            mods, vk = parsed
            primary_ok = bool(register(hk_id, mods, vk))
            if primary_ok:
                registered.append((hk_id, action, spec))
                hk_id += 1
                ok.append({"action": action, "spec": spec})
            fallback = None
            if (mods & 0x0001) and not (mods & (0x0002 | 0x0004 | 0x0008)):
                fb = "Ctrl+" + spec
                if register(hk_id, mods | 0x0002, vk):
                    registered.append((hk_id, action, fb))
                    hk_id += 1
                    fallback = fb
            if not primary_ok:
                suggest = suggest_free_hotkey(hk, probe=probe, exclude=taken)
                if suggest:
                    taken.add(suggest)
                failed.append({"action": action, "spec": spec, "fallback": fallback, "suggest": suggest})
    return registered, {"ok": ok, "failed": failed}


def hotkey_failure_message(f: dict) -> str:
    msg = f"Could not register hotkey {f['spec']} ({f['action']})"
    if f.get("error"):
        return msg + f": {f['error']}"
    msg += ": another program already uses it."
    if f.get("fallback"):
        msg += f" {f['fallback']} works instead."
    if f.get("suggest"):
        msg += f" Free alternative: set video.hotkeys.{f['action']} to \"{f['suggest']}\" in config.local.json."
    return msg


class HotkeyOverlayManager:
    """Global Win32 hotkeys + an Always-on-Top tkinter shortcut map & status HUD (auto-hides)."""

    def __init__(self, hotkeys_cfg: dict, callbacks: dict, status_fn, on_hotkey=None, on_registered=None,
                 hud_seconds: float = 15.0):
        # hotkeys_cfg: the `video.hotkeys` overrides (or an effective_hotkeys() map - same result).
        self.hk_map = effective_hotkeys(hotkeys_cfg)
        self.callbacks = callbacks
        self.status_fn = status_fn
        self.on_hotkey = on_hotkey
        self.on_registered = on_registered
        self.hud_seconds = hud_seconds
        self.registration: dict | None = None  # register_hotkeys() report {ok, failed} while registered
        self._stop = threading.Event()
        self._hk_thread = None
        self._hud_thread = None
        self._hud_queue: queue.Queue = queue.Queue()
        self._hk_thread_id = None

    def start(self) -> None:
        if self._stop.is_set():
            # finish any in-flight stop() before clearing the flag (see OpenConnectMonitor.start)
            for t in (self._hk_thread, self._hud_thread):
                if t and t.is_alive() and t is not threading.current_thread():
                    t.join(timeout=3.0)
            try:
                while True:
                    self._hud_queue.get_nowait()  # drop stale QUIT/TOGGLE commands
            except queue.Empty:
                pass
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
        for t in (self._hk_thread, self._hud_thread):
            if t and t.is_alive() and t is not threading.current_thread():
                t.join(timeout=2.0)

    def toggle_hud(self) -> None:
        self._hud_queue.put("TOGGLE")

    def rows(self) -> list[dict]:
        """hotkey_rows() with live registration state (/api/status + simwatch_status.json; ShotLab Keys pill)."""
        return hotkey_rows(self.hk_map, self.registration if self._hk_thread_id else None)

    def show_hud(self) -> None:
        self._hud_queue.put("SHOW")

    def dispatch(self, action: str) -> None:
        """Run one hotkey action (called on the hotkey thread)."""
        if self.on_hotkey is not None:
            try:
                self.on_hotkey(action)
            except Exception:
                pass
        try:
            self.callbacks[action]()
        except Exception as e:
            LOG.warning("Hotkey %s error: %s", action, e)

    def _run_hotkeys(self) -> None:
        user32 = ctypes.windll.user32
        self._hk_thread_id = ctypes.windll.kernel32.GetCurrentThreadId()
        registered, reg = register_hotkeys(
            self.hk_map, list(self.callbacks.keys()),
            register=lambda hk_id, mods, vk: user32.RegisterHotKey(None, hk_id, mods, vk), probe=probe_hotkey)
        for f in reg["failed"]:
            LOG.warning(hotkey_failure_message(f))
        LOG.info("Hotkeys: %d registered%s", len(reg["ok"]),
                 f", {len(reg['failed'])} failed" if reg["failed"] else " (all)")
        self.registration = reg
        LOG.info("\n%s", format_hotkey_cheatsheet(hotkey_rows(self.hk_map, reg)))
        if self.on_registered is not None:
            try:
                self.on_registered(reg)
            except Exception:
                pass
        by_id = {hk_id: action for hk_id, action, _spec in registered}

        msg = ctypes.wintypes.MSG()
        while not self._stop.is_set():
            ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
            if ret <= 0:
                break
            if msg.message == 0x0312 and msg.wParam in by_id:  # WM_HOTKEY
                self.dispatch(by_id[msg.wParam])

        for idx in by_id:
            try:
                user32.UnregisterHotKey(None, idx)
            except Exception:
                pass
        self._hk_thread_id = None
        self.registration = None

    def _run_hud(self) -> None:
        try:
            import tkinter as tk
        except Exception:
            return
        try:
            root = tk.Tk()
        except Exception:
            return
        root.title("SimWatch Shortcuts")
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", 0.94)
        root.configure(bg="#111827")
        root.withdraw()
        visible = [False]
        hide_at = [0.0]
        try:  # never take the keyboard from GSPro: WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW on the real toplevel
            # Tk creates the toplevel's wrapper HWND lazily (at the first idle map, even while withdrawn); before
            # that GetParent() does not return the wrapper and the style would land on the wrong window.
            root.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(root.winfo_id()) or root.winfo_id()
            ex = ctypes.windll.user32.GetWindowLongW(hwnd, -20)
            ctypes.windll.user32.SetWindowLongW(hwnd, -20, ex | 0x08000000 | 0x00000080)
        except Exception:
            pass

        frame = tk.Frame(root, bg="#111827", highlightbackground="#38bdf8", highlightthickness=2, padx=14, pady=10)
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text="SimWatch shortcuts", fg="#38bdf8", bg="#111827",
                 font=("Segoe UI", 12, "bold")).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 4))
        failed = set()
        groups = hotkey_groups({"video": {"hotkeys": self.hk_map}})
        cols = [tk.Frame(frame, bg="#111827"), tk.Frame(frame, bg="#111827")]
        cols[0].grid(row=1, column=0, sticky="nw", padx=(0, 18))
        cols[1].grid(row=1, column=1, sticky="nw")
        key_labels = []
        split = (sum(len(g["keys"]) + 1 for g in groups) + 1) // 2
        used = 0
        for g in groups:
            col = cols[0] if used < split else cols[1]
            used += len(g["keys"]) + 1
            tk.Label(col, text=g["group"].upper(), fg="#94a3b8", bg="#111827",
                     font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(6, 1))
            for row in g["keys"]:
                r = tk.Frame(col, bg="#111827")
                r.pack(fill="x", pady=1)
                kl = tk.Label(r, text=f"{' / '.join(row['keys']):<11}", fg="#facc15", bg="#1f2937",
                              font=("Consolas", 10, "bold"), padx=5, pady=1)
                kl.pack(side="left")
                key_labels.append((kl, row["keys"]))
                tk.Label(r, text=f"  {row['description']}", fg="#e5e7eb", bg="#111827",
                         font=("Segoe UI", 10)).pack(side="left")

        status_var = tk.StringVar(value="")
        tk.Label(frame, textvariable=status_var, fg="#9ca3af", bg="#111827", font=("Segoe UI", 9),
                 justify="left", pady=6).grid(row=2, column=0, columnspan=2, sticky="w")

        def mark_failed():
            reg = self.registration or {}
            bad = {f.get("spec") for f in reg.get("failed", [])}
            if bad == failed:
                return
            failed.clear()
            failed.update(bad)
            for kl, keys in key_labels:
                kl.configure(fg="#f87171" if any(k in bad for k in keys) else "#facc15")

        def refresh_status():
            try:
                st = self.status_fn()
                lines = [f"Club: {st.get('club') or '-'}   |   Reference: {st.get('reference')}   |   "
                         f"PiP: {st.get('pip')}"]
                if st.get("layout"):
                    lines.append(f"Layout: {st['layout']}   |   Replay: {st.get('replay', '-')}"
                                 + (f"   |   Compare: {st['compare']}" if st.get("compare") else ""))
                lines.append(f"Last swing: {st.get('last_swing') or 'none yet'}")
                if failed:
                    lines.append("Red keys could not be registered (another app owns them) - "
                                 "see simwatch.log / doctor for a free alternative.")
                status_var.set("\n".join(lines))
            except Exception:
                pass

        def place_top_center():
            root.update_idletasks()
            wl, wt, wr, wb = get_primary_work_area()
            rw = root.winfo_width()
            root.geometry(f"+{wl + ((wr - wl) - rw) // 2}+{wt + 24}")

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
                        hide_at[0] = time.time() + self.hud_seconds if self.hud_seconds > 0 else 0.0
                        mark_failed()
                        refresh_status()
                        place_top_center()
                        root.deiconify()
                    else:
                        root.withdraw()
            except queue.Empty:
                pass
            if visible[0] and hide_at[0] and time.time() >= hide_at[0]:
                visible[0] = False
                root.withdraw()
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
        self._swing_cat: str = club_category(None)  # category of the loaded reference (putter never changes it)
        self.active_reference: str = self.vcfg.get("default_reference", "My-Go-To")
        self.shot_counter = self._init_shot_counter()
        self.last_shot_info: dict | None = None
        self.last_saved_dtl: Path | None = None
        self.last_saved_fo: Path | None = None
        self._stop_capture_at: float = 0.0
        self._stop_capture_failures: int = 0
        self._known_files: dict[Path, tuple[int, float]] = {}
        self._processed_files: set[Path] = set()
        self._last_batch_ts: float = 0.0
        self._last_batch_angles: set[str] = set()
        self._retiled_on_first_clip = False
        self._lock = threading.RLock()  # rig work (reference swaps, tiling, clip organising) - can be held for seconds
        # Short-held lock for the shot path (trigger debounce, club, pending swap): the sniffer thread only
        # ever takes this one, so a slow reference swap can never delay a capture trigger.
        self._state_lock = threading.Lock()
        self._pending_ref_club: str | None = None
        self._ref_swap_thread: threading.Thread | None = None
        self._ref_swap_sync = False  # tests: apply the swap inline instead of on the worker thread
        # Club-change reference reloads are debounced (scrolling I/K through GSPro's clubs relaunches Kinovea
        # once, for the club you land on) and never run after stop(): see _ref_swap_worker.
        self._ref_swap_debounce = cfg_number(self.vcfg.get("club_reload_debounce_sec"), 1.5)
        self._pending_ref_at = 0.0
        self._ref_swap_stop = threading.Event()
        self._stopped = False
        self.hub: ShotHub | None = None  # shot-data bridge (set by watch()/cmd_video() when enabled)
        self.shotlab: "ShotLabSupervisor | None" = None  # set by watch() when shotlab.enabled

        self.pip = ProjectorPiPController(cfg)
        self.oc_monitor = OpenConnectMonitor(self._on_openconnect_shot, self._on_club_change)
        # Adaptive layout + post-shot replay + compare (see VideoLayoutController / ReplayScheduler).
        self.layout_ctl = VideoLayoutController(cfg)
        self.replay = ReplayScheduler(replay_cfg(cfg))
        self.replay_visible = False
        self.compare_state = "off"
        self._win_lock = threading.RLock()       # serializes window moves from the shot/hotkey/tick threads
        self._compare_lock = threading.Lock()    # one Compare (re)launch at a time
        self.hotkeys = HotkeyOverlayManager(
            effective_hotkeys(hotkeys_cfg_of(cfg)),
            {
                "replay_now": self.replay_show_now,
                "replay_pin": self.replay_toggle_pin,
                "replay_dismiss": self.replay_dismiss,
                "replay_auto": self.replay_toggle_auto,
                "compare_cycle": self.compare_cycle,
                "cheatsheet": self._toggle_cheatsheet,
                "toggle_shotlab": self.toggle_shotlab,
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
            on_hotkey=self._on_hotkey,
            on_registered=self._on_hotkeys_registered,
            hud_seconds=cfg_number(self.vcfg.get("hud_seconds"), 15.0),
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
            self.layout_ctl.refresh(force=True)
            self.replay.always_on = bool(self.layout_ctl.layout and self.layout_ctl.layout.get("always_on"))
            if self.replay.always_on:
                self.replay_visible = self.replay.show_now(time.time()) == "show"
            self._retile(wait_sec=6.0)
            if self._replay_enabled():
                # The freshly launched Kinovea windows may have taken the foreground from GSPro (and minimized
                # it in exclusive fullscreen); parking them behind GSPro does not give the keyboard back.
                # Only acts when a Kinovea window / SimWatch holds the foreground (see restore_gspro_focus).
                self._focus_gspro()
        else:
            install_kinovea_custom_golf_tools(self.cfg)
            apply_swing_lines_to_active_clips(self.cfg, club=self.current_club, overwrite=False)
        self._snapshot_existing_files()
        if self.hub is not None:
            self.hub.sniffer = self.oc_monitor
        self._stopped = False
        self._ref_swap_stop.clear()
        self.oc_monitor.start()
        self.hotkeys.start()
        self._started = True
        LOG.info("SwingSessionManager active (ref=%s)", self.active_reference)

    def stop(self) -> None:
        if not self._started:
            return
        # Drop any queued club reload and wake a debouncing worker: Kinovea is never relaunched after stop().
        with self._state_lock:
            self._stopped = True
            self._pending_ref_club = None
        self._ref_swap_stop.set()
        self.oc_monitor.stop()
        self.hotkeys.stop()
        self._started = False
        write_video_state(hotkeys=None, replay=None)  # hotkeys released: doctor may probe them again

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
        """Sniffer thread: note the club and queue a reference swap; the swap itself (close/relaunch Kinovea
        Reference + re-tile, several seconds) runs on a worker thread so a shot that follows the club change
        is triggered immediately (Kinovea's pre-trigger buffer is only ~3 s)."""
        hub = self.hub
        if hub is not None:
            hub.set_club(club)  # ShotLab / drills hub see GSPro's club live (deduplicated, SSE `club` event)
        start_worker = False
        with self._state_lock:
            if getattr(self, "_swing_cat", None) is None:
                # Pin the last FULL-SWING category before current_club changes: Driver -> PT -> 7I must
                # still swap the reference to Iron (the putter itself never swaps it).
                self._swing_cat = club_category(self.current_club)
            self.current_club = club
            new_cat = club_category(club)
            LOG.info("Active club changed -> %s (%s)", club, new_cat)
            if getattr(self, "replay", None) is not None and self.replay.on_club_change(time.time()) == "hide":
                threading.Thread(target=self._hide_replay, name="ReplayHide", daemon=True).start()
            if new_cat == "Putter":
                return  # no capture and no reference swap; keep whatever full-swing reference is loaded
            self._pending_ref_club = club
            self._pending_ref_at = time.monotonic()
            if not getattr(self, "_ref_swap_sync", False) and getattr(self, "_ref_swap_thread", None) is None:
                self._ref_swap_thread = threading.Thread(target=self._ref_swap_worker, name="ReferenceSwap",
                                                         daemon=True)
                start_worker = True
        if getattr(self, "_ref_swap_sync", False):
            self._apply_pending_ref_swap()
        elif start_worker:
            self._ref_swap_thread.start()

    def _ref_swap_wait_quiet(self) -> None:
        """Debounce: wait until no club change arrived for _ref_swap_debounce seconds (stop() cuts it short)."""
        quiet = getattr(self, "_ref_swap_debounce", 0.0) or 0.0
        stop_ev = getattr(self, "_ref_swap_stop", None)
        while quiet > 0:
            with self._state_lock:
                wait = getattr(self, "_pending_ref_at", 0.0) + quiet - time.monotonic()
                if self._pending_ref_club is None or getattr(self, "_stopped", False):
                    return
            if wait <= 0:
                return
            if stop_ev is not None:
                if stop_ev.wait(min(wait, 0.5)):
                    return
            else:
                time.sleep(min(wait, 0.5))

    def _ref_swap_worker(self) -> None:
        """The ONE reference-reload path for club changes. Runs off the sniffer thread (the UDP trigger / shot
        path never waits on it: they only take the short _state_lock), coalesces to the latest club,
        debounces, and serializes with Alt+R / bookmark rig work through self._lock."""
        while True:
            self._ref_swap_wait_quiet()
            try:
                self._apply_pending_ref_swap()
            except Exception:
                log_throttled("ref-swap", "reference swap after club change failed (retried on next club change)",
                              exc_info=True)
            with self._state_lock:
                if self._pending_ref_club is None:
                    self._ref_swap_thread = None  # under the lock, so _on_club_change starts a fresh worker
                    return

    def _apply_pending_ref_swap(self) -> bool:
        """Swap the Reference clips to the latest pending club's category if it changed. Raises on failure
        (the category is then not recorded, so the next club change retries the swap)."""
        with self._lock:  # serialize with set_reference / bookmark rig work (never taken by the shot path)
            with self._state_lock:
                club, self._pending_ref_club = self._pending_ref_club, None
                prev_cat = getattr(self, "_swing_cat", None) or club_category(None)
                stopped = getattr(self, "_stopped", False)
            if club is None or stopped:
                return False  # stop() raced the worker: never relaunch Kinovea after shutdown
            new_cat = club_category(club)
            if new_cat == "Putter" or new_cat == prev_cat:
                return False
            if "Reference" not in kinovea_windows_to_launch(self.cfg):
                # Adaptive layouts have no Reference window to reload (Compare resolves the reference clips for
                # the current club when you ask); just remember the category for _ref_club().
                with self._state_lock:
                    self._swing_cat = new_cat
                return False
            setup_video_rig(self.cfg, ref_name=self.active_reference, club=club, launch=True, reload_ref=True)
            self._retile(wait_sec=4.0)
            # Record the category only once the swap succeeded, so a failed swap is retried next change.
            with self._state_lock:
                self._swing_cat = new_cat
            return True

    def _ref_club(self) -> str | None:
        """Club used to resolve the reference clips: never the putter (there are no putter references),
        so Driver -> PT -> Alt+R keeps resolving Driver references."""
        club = self.current_club
        if club and club_category(club) == "Putter":
            return getattr(self, "_swing_cat", None) or "Iron"
        return club

    def _on_openconnect_shot(self, info: dict) -> None:
        # Fire the capture trigger FIRST: recording the shot (file I/O under a cross-process lock) and the
        # PiP can wait, Kinovea's ~3 s pre-trigger buffer can't.
        shot_rec = info.get("shot") if isinstance(info.get("shot"), dict) else {}
        vla = (shot_rec.get("ball") or {}).get("vla") if shot_rec else None
        putt = is_putt(info.get("club") or self.current_club, info.get("ball_speed"), vla)
        if not putt:
            self.trigger_capture()
        hub = self.hub
        if hub is not None and info.get("shot"):
            try:
                info["shot"] = hub.record_shot(info["shot"])
            except Exception:
                log_throttled("bridge-record", "shot bridge failed to record shot", exc_info=True)
        with self._state_lock:
            self.last_shot_info = info
        LOG.info(
            "Shot detected on :921 (club=%s, speed=%.1f mph, carry=%s)",
            info.get("club") or "-", info.get("ball_speed") or 0.0, info.get("carry"),
        )
        if putt:
            LOG.info("Putt - skipping video capture")
            return
        self.pip.show_for_shot()
        self._schedule_replay(info.get("club") or self.current_club)

    def trigger_capture(self) -> None:
        """2025: one UDP datagram (Kinovea's Delay/MaxDuration/quiet period do the rest).
        Legacy: one ToggleRecording to start; RecordingSeconds (= pre + post) stops it - no stop toggle.
        Takes only the short _state_lock, never the rig lock a reference swap holds."""
        with self._state_lock:
            now = time.time()
            # cfg_number, not float(): a typo'd/null value here must never cost the trigger (or, by raising
            # into the sniffer callback, the shot record too).
            post_sec = cfg_number(self.vcfg.get("post_trigger_sec", 1.5), 1.5)
            pre_sec = cfg_number(self.vcfg.get("pre_trigger_sec", 3.0), 3.0)
            if resolve_kinovea_backend(self.cfg) == "2025":
                if now - getattr(self, "_last_udp_trigger", 0.0) < 1.0:
                    return
                self._last_udp_trigger = now
                port = int(cfg_number(self.vcfg.get("udp_trigger_port", KINOVEA_DEFAULT_UDP_PORT),
                                      KINOVEA_DEFAULT_UDP_PORT))
                if send_udp_trigger(port):
                    LOG.info("Sent Kinovea UDP trigger to 127.0.0.1:%d (pre=%.1fs, post=%.1fs)", port, pre_sec, post_sec)
                return
            if str(self.vcfg.get("legacy_trigger", "toggle")).lower() == "audio":
                return  # Kinovea's own audio trigger records; toggling too would double-trigger
            if self._stop_capture_at > now:
                LOG.debug("Kinovea legacy recording still in progress; trigger ignored")
                return
            if kinovea_send_command("Capture", "CaptureScreen.ToggleRecording"):
                # Assumed recording until RecordingSeconds elapses (+ margin); never toggle in that window,
                # or we would stop it early / start a second recording.
                self._stop_capture_at = now + max(1.0, pre_sec + post_sec) + 0.75
                LOG.info("Triggered Kinovea Capture recording (pre=%.1fs, post=%.1fs)", pre_sec, post_sec)

    def trigger_manual_shot(self) -> None:
        self.trigger_capture()
        self.pip.show_for_shot()
        rc = replay_cfg(self.cfg)
        self._schedule_replay(None, delay=cfg_number(rc.get("manual_delay_sec"), 4.0))

    def _toggle_cheatsheet(self) -> None:
        self.hotkeys.toggle_hud()

    def toggle_shotlab(self) -> None:
        result = toggle_shotlab_window(self.cfg, self.shotlab)
        LOG.info("Hotkey: ShotLab %s", result)

    def get_hud_status(self) -> dict:
        # Deliberately not under self._lock (a reference swap can hold it for seconds; the HUD polls this).
        last = self.last_saved_dtl or self.last_saved_fo
        ctl = getattr(self, "layout_ctl", None)
        sched = getattr(self, "replay", None)
        cmp_state = getattr(self, "compare_state", "off")
        return {
            "club": self.current_club or "Iron",
            "reference": self.active_reference,
            "pip": self.pip.status_text(),
            "last_swing": last.name if last else None,
            "layout": ctl.layout["profile"] if ctl is not None and ctl.layout else None,
            "replay": sched.status_text(time.time()) if sched is not None else None,
            "compare": None if cmp_state == "off" else f"{cmp_state}: you | {self.active_reference}",
        }

    # ------------------------------------------------------------------ adaptive layout / replay / compare

    def _replay_enabled(self) -> bool:
        ctl = getattr(self, "layout_ctl", None)
        return ctl is not None and getattr(self, "replay", None) is not None and not ctl.is_grid()

    def _retile(self, wait_sec: float = 0.0) -> None:
        """Position the Kinovea windows for the current layout (the old 2x2 tiling when profile = grid)."""
        ctl = getattr(self, "layout_ctl", None)
        if ctl is None:
            tile_video_windows(self.cfg, wait_sec=wait_sec)
            return
        with self._win_lock:
            ctl.apply(bool(getattr(self, "replay_visible", False)),
                      getattr(self, "compare_state", "off") != "off", wait_sec=wait_sec)

    def _publish_replay_state(self) -> None:
        sched = self.replay
        write_video_state(replay={"mode": sched.mode, "state": sched.state, "pinned": sched.pinned,
                                  "compare": self.compare_state})

    def _on_hotkey(self, action: str) -> None:
        sched = getattr(self, "replay", None)
        if sched is not None:
            sched.note_hotkey(time.time())

    def _on_hotkeys_registered(self, reg: dict) -> None:
        write_video_state(hotkeys=reg)
        if self.hub is not None:
            self.hub.hotkey_registration = reg

    def _schedule_replay(self, club: str | None, delay: float | None = -1.0) -> None:
        """Shot path (sniffer thread): schedule the post-shot replay; hide one that's up so the ball can be seen."""
        self._shot_gen = getattr(self, "_shot_gen", 0) + 1  # lets a Compare that's still loading notice the shot
        if not self._replay_enabled():
            return
        now = time.time()
        was_compare = self.compare_state != "off"
        if was_compare:
            self.compare_state = "off"
            self.replay.release(now)
        act = self.replay.on_shot(now, club, delay)
        # Window work off the sniffer thread: it must stay free for the next OpenConnect message.
        if act == "hide":
            threading.Thread(target=self._hide_replay, name="ReplayHide", daemon=True).start()
        elif was_compare:
            threading.Thread(target=self._retile, name="ReplayRetile", daemon=True).start()
        LOG.info("Replay: %s", self.replay.status_text(now))

    def _show_replay(self) -> None:
        with self._win_lock:
            self.replay_visible = True
            self._retile()
            self._focus_gspro()
        LOG.info("Replay shown (%s)", self.replay.status_text(time.time()))
        self._publish_replay_state()

    def _hide_replay(self) -> None:
        with self._win_lock:
            self.replay_visible = False
            self.compare_state = "off"
            self._retile()
            self._focus_gspro()
        self._publish_replay_state()

    def _focus_gspro(self) -> None:
        if replay_cfg(self.cfg).get("restore_focus", True):
            try:
                self.layout_ctl.ops.restore_gspro_focus()
            except Exception:
                log_throttled("gspro-focus-mgr", "restore GSPro focus failed", exc_info=True)

    def _do(self, action: str | None) -> None:
        if action == "show":
            self._show_replay()
        elif action == "hide":
            self._hide_replay()

    def replay_show_now(self) -> None:
        if self._replay_enabled():
            self._do(self.replay.show_now(time.time()))

    def replay_toggle_pin(self) -> None:
        if self._replay_enabled():
            act = self.replay.toggle_pin(time.time())
            LOG.info("Replay %s", "kept open" if self.replay.pinned else "closed")
            self._do(act)
            self._publish_replay_state()

    def replay_dismiss(self) -> None:
        if self._replay_enabled():
            act = self.replay.dismiss(time.time())
            if act is None and (self.replay_visible or self.compare_state != "off"):
                act = "hide"
            self._do(act)

    def replay_toggle_auto(self) -> None:
        if self._replay_enabled():
            mode = self.replay.toggle_mode(time.time())
            LOG.info("Auto replay after each shot: %s", "ON" if mode == "auto" else "OFF (Alt+V still shows it)")
            try:
                winsound.Beep(988 if mode == "auto" else 523, 120)
            except Exception:
                pass
            self._publish_replay_state()

    def compare_cycle(self) -> None:
        """Alt+M: DTL you|ref -> FO you|ref -> back to your DTL|FO. Loading a pair relaunches the Kinovea Compare
        window (~2-4 s), so it runs on a worker thread; presses while it loads are ignored."""
        if not self._replay_enabled():
            LOG.info("Compare needs the adaptive layout (video.layout.profile is 'grid')")
            return
        nxt = next_compare_state(self.compare_state)
        if nxt == "off":
            self._exit_compare()
            return
        threading.Thread(target=self._start_compare, args=(nxt,), name="Compare", daemon=True).start()

    def _start_compare(self, angle: str) -> bool:
        if not self._compare_lock.acquire(blocking=False):
            LOG.info("Compare is still loading; press again in a moment")
            return False
        try:
            gen0 = getattr(self, "_shot_gen", 0)
            you_clip = self.last_saved_dtl if angle == "DTL" else self.last_saved_fo
            you, ref, why = pick_compare_clips(self.cfg, angle, self.active_reference, self._ref_club(), you_clip)
            if not (you and ref):
                LOG.warning("Compare %s: %s", angle, why)
                try:
                    winsound.Beep(392, 180)
                except Exception:
                    pass
                return False
            speed = self.vcfg.get("replay_speed_pct", 50)
            if getattr(self, "_stopped", False):
                return False
            if not launch_compare_window(self.cfg, build_compare_screens(you, ref, speed)):
                LOG.warning("Compare %s: could not start the Kinovea Compare window", angle)
                return False
            self.layout_ctl._hwnd(COMPARE_WINDOW, 8.0)  # wait for the (re)launched window outside the lock
            if getattr(self, "_stopped", False) or getattr(self, "_shot_gen", 0) != gen0:
                # A shot landed (or the rig stopped) while Compare loaded: the shot wins; don't pop over GSPro.
                LOG.info("Compare %s cancelled: a new shot arrived while it was loading", angle)
                return False
            self.compare_state = angle
            self.replay.hold(time.time())
            with self._win_lock:
                self.replay_visible = True
                self.layout_ctl.apply(True, True)
                self._focus_gspro()
            LOG.info("Compare %s: you (%s) | %s (%s)", angle, you.name, self.active_reference, ref.name)
            self._publish_replay_state()
            return True
        finally:
            self._compare_lock.release()

    def _exit_compare(self) -> None:
        self.compare_state = "off"
        self.replay.release(time.time())
        with self._win_lock:
            self.replay_visible = self.replay.state == ReplayScheduler.SHOWING
            self._retile()
            self._focus_gspro()
        LOG.info("Compare off: back to your DTL | FO replay")
        self._publish_replay_state()

    def _tick_replay(self, now: float | None = None) -> None:
        """Every ~0.5 s: re-check displays (layout change -> re-position) and run the replay timer."""
        if getattr(self, "layout_ctl", None) is None or getattr(self, "replay", None) is None:
            return
        now = time.time() if now is None else now
        if self.layout_ctl.refresh(now):
            was_always_on = self.replay.always_on
            self.replay.always_on = bool(self.layout_ctl.layout.get("always_on"))
            if self.replay.always_on and self.replay.state != ReplayScheduler.SHOWING:
                self.replay.show_now(now)
                self.replay_visible = True
            elif was_always_on and not self.replay.always_on:
                self.replay.release(now)  # dual -> single screen: the replay now times out normally
            self._retile()
        if self.layout_ctl.is_grid():
            return
        last_input = None
        if self.replay.state == ReplayScheduler.SHOWING and not self.replay.pinned:
            try:
                last_input = self.layout_ctl.ops.last_input_time()
            except Exception:
                last_input = None
        self._do(self.replay.tick(now, last_input))

    def _note_clip_ready(self) -> None:
        sched = getattr(self, "replay", None)
        if sched is not None:
            sched.on_clip_ready(time.time())

    def _infer_angle(self, p: Path) -> str:
        text = f"{p.parent.name}/{p.name}"
        if re.search(r"(?:^|[_\-\s/\\])FO(?:$|[_\-\s.])", text, re.I) or re.search(r"[-_]2\.[^.]+$", p.name):
            return "FO"
        return "DTL"

    def _clip_event_dirs(self, now: float | None = None) -> list[Path]:
        """Today's .clip-events, plus yesterday's for CLIP_EVENTS_YESTERDAY_SEC after midnight (a clip that
        lands at 00:00:05 for a 23:59:58 shot writes its event into the shot's - yesterday's - folder)."""
        sessions = ensure_swings_layout(self.cfg)["sessions"]
        now = time.time() if now is None else now
        today = datetime.fromtimestamp(now)
        dirs = [sessions / today.strftime("%Y-%m-%d") / CLIP_EVENTS_DIR]
        midnight = today.replace(hour=0, minute=0, second=0, microsecond=0)
        if (today - midnight).total_seconds() < CLIP_EVENTS_YESTERDAY_SEC:
            dirs.append(sessions / (midnight - timedelta(days=1)).strftime("%Y-%m-%d") / CLIP_EVENTS_DIR)
        return dirs

    def _clip_link_store(self) -> ShotStore:
        if self.hub is not None:
            return self.hub.store
        if getattr(self, "_own_store", None) is None:
            self._own_store = ShotStore(bridge_sessions_dir(self.cfg))
        return self._own_store

    def _apply_clip_link(self, ev: dict) -> bool:
        """Write (or, if clip-ready already did, just broadcast) the shot<->clip link. True when done."""
        try:
            if self.hub is not None:
                self.hub.set_clip(ev["ts"], str(ev["clip"]), ev.get("angle"))
            elif not ev.get("linked"):
                self._clip_link_store().set_clip(ev["ts"], str(ev["clip"]), ev.get("angle"))
            return True
        except OSError as e:
            log_throttled("bridge-clip", f"could not link clip {ev.get('clip')} to shot {ev.get('ts')}: {e}")
            return False

    def _retry_clip_links(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        pending = getattr(self, "_pending_clip_links", None) or []
        keep = []
        for ev, attempts, next_at in pending:
            if now < next_at:
                keep.append((ev, attempts, next_at))
            elif not self._apply_clip_link(ev):
                if attempts + 1 < CLIP_LINK_MAX_ATTEMPTS:
                    keep.append((ev, attempts + 1, now + min(60.0, 2.0 * (2 ** attempts))))
                else:
                    LOG.warning("Giving up linking clip %s to shot %s after %d attempts",
                                ev.get("clip"), ev.get("ts"), attempts + 1)
        self._pending_clip_links = keep

    def _consume_clip_events(self, now: float | None = None) -> None:
        """2025 backend: pick up `clip-ready` notifications (<day>/.clip-events/*.json) - remember the last
        clips, push the SSE `clip` event via the hub and pop the PiP. When clip-ready could NOT write the
        link (lock busy / shots.jsonl held on Windows) the event says linked=false and the link is written
        here, retried with backoff. Kinovea's LiveReplay already loads the clip from the replay folder."""
        self._retry_clip_links(now)
        got = False
        for ev_dir in self._clip_event_dirs(now):
            if not ev_dir.is_dir():
                continue
            for f in sorted(ev_dir.glob("*.json")):
                try:
                    ev = json.loads(f.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    ev = None
                try:
                    f.unlink()
                except OSError:
                    continue
                if not isinstance(ev, dict) or not ev.get("clip"):
                    continue
                got = True
                clip_path = ev_dir.parent / str(ev["clip"])
                if ev.get("angle") == "FO":
                    self.last_saved_fo = clip_path
                else:
                    self.last_saved_dtl = clip_path
                if ev.get("ts") and not self._apply_clip_link(ev) and not ev.get("linked"):
                    pending = getattr(self, "_pending_clip_links", None) or []
                    pending.append((ev, 1, (time.time() if now is None else now) + 2.0))
                    self._pending_clip_links = pending
                LOG.info("Swing clip ready: %s", ev["clip"])
        if got:
            self._note_clip_ready()
            self.pip.show_for_shot()
            if not self._retiled_on_first_clip:
                self._retiled_on_first_clip = True
                self._retile(wait_sec=2.0)

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
                        # Complete = size stable >= 1.5s AND exclusively openable (Kinovea closed it).
                        if cur_size == prev_size and file_ready_for_copy(p, now - first_seen, 1.5):
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
            shot_rec = info.get("shot") if isinstance(info.get("shot"), dict) else None
            drill_part = drill_filename_tag(
                shot_rec.get("drill_id") if shot_rec else (self.hub.active_drill if self.hub else None))
            lines_on = bool(self.cfg.get("video", {}).get("swing_lines", {}).get("enabled", True))

            for src in ready:
                angle = self._infer_angle(src)
                dest_name = f"{self.shot_counter:03d}_{club}{carry_part}{speed_part}{drill_part}_{angle}{src.suffix.lower()}"
                # Never overwrite: two clips can infer the same angle (e.g. both unlabeled -> DTL).
                session_copy = unique_path(layout["today"] / dest_name)
                try:
                    kva_xml = build_swing_kva_xml(angle, club, self.cfg, video_path=src) if lines_on else None
                    if kva_xml and not src.with_suffix(".kva").exists():
                        src.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                    if kva_xml and not session_copy.with_suffix(".kva").exists():
                        session_copy.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                    shutil.copy2(src, session_copy)
                    angle_dir = layout["today_dtl"] if angle == "DTL" else layout["today_fo"]
                    if src.parent.resolve() != angle_dir.resolve():
                        angle_copy = unique_path(angle_dir / src.name)
                        if kva_xml and not angle_copy.with_suffix(".kva").exists():
                            angle_copy.with_suffix(".kva").write_text(kva_xml, encoding="utf-8")
                        shutil.copy2(src, angle_copy)
                    if angle == "DTL":
                        self.last_saved_dtl = session_copy
                    else:
                        self.last_saved_fo = session_copy
                    LOG.info("Saved swing clip: %s", session_copy)
                    # Link the clip to its shot record (clips[angle]; primary `clip` DTL preferred).
                    if self.hub and shot_rec and shot_rec.get("ts"):
                        if angle == "DTL" or not shot_rec.get("clip"):
                            shot_rec["clip"] = session_copy.name
                        try:
                            self.hub.set_clip(shot_rec["ts"], session_copy.name, angle)
                        except OSError as e:
                            log_throttled("bridge-clip", f"could not link clip to shot: {e}")
                except OSError as e:
                    LOG.warning("Failed organizing swing clip %s: %s", src, e)
                self._processed_files.add(src)

            self._note_clip_ready()
            self.pip.show_for_shot()
            if not self._retiled_on_first_clip:
                self._retiled_on_first_clip = True
                self._retile(wait_sec=2.0)

    def bookmark_last_swing(self, club_override: str | None = None) -> tuple[Path | None, Path | None]:
        with self._lock:
            layout = ensure_swings_layout(self.cfg)
            dtl = self.last_saved_dtl or next(iter(_latest_clips_in(layout["sessions"], "DTL")), None)
            fo = self.last_saved_fo or next(iter(_latest_clips_in(layout["sessions"], "FO")), None)
            club = club_override or self._ref_club()
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
                try:
                    if src_clip.resolve() != dest_clip.resolve():
                        shutil.copy2(src_clip, dest_clip)
                except PermissionError:
                    # Destination is held open (Kinovea Reference has it loaded). Don't kill Reference:
                    # save under a fresh name instead; the newest GoTo_* clip wins when resolving references.
                    alt = unique_path(dest_clip)
                    try:
                        shutil.copy2(src_clip, alt)
                    except OSError as e:
                        LOG.warning("Destination %s is locked and fallback copy failed: %s", dest_clip, e)
                        return None
                    LOG.warning("Go-To clip %s is locked; saved as %s instead", dest_clip.name, alt.name)
                    dest_clip = alt
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
                    self._retile(wait_sec=3.0)
            else:
                LOG.warning("No recent swing clips found to bookmark")
            return saved_dtl, saved_fo

    def set_reference(self, ref_name: str, launch_rig: bool = True) -> None:
        with self._lock:
            self.active_reference = ref_name
            setup_video_rig(self.cfg, ref_name=ref_name, club=self._ref_club(), launch=launch_rig, reload_ref=launch_rig)
            if launch_rig:
                self._retile(wait_sec=4.0)
            LOG.info("Reference switched -> %s", ref_name)

    def cycle_reference(self) -> None:
        with self._lock:
            choices = ["My-Go-To"] + list(self.vcfg.get("pros", [])) + ["Last-Swing"]
            try:
                idx = (choices.index(self.active_reference) + 1) % len(choices)
            except ValueError:
                idx = 0
            self.set_reference(choices[idx], launch_rig=True)
        cmp_state = getattr(self, "compare_state", "off")
        if cmp_state != "off":  # comparing: reload the same angle against the new reference
            threading.Thread(target=self._start_compare, args=(cmp_state,), name="Compare", daemon=True).start()

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
            for inst in ("LiveReplay", "Reference", COMPARE_WINDOW):
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

    def tick(self, allow_new_work: bool = True) -> None:
        """Housekeeping, safe to call every ~0.5s.

        Pending stop-capture and PiP auto-hide always run (so a pause/gate-down can't leave a recording on
        or the PiP stuck on screen). New clip organising / rig work only runs when allow_new_work is True.
        """
        with self._lock:
            try:
                # Legacy: Kinovea stops on its own (RecordingSeconds); this only expires the busy marker.
                with self._state_lock:
                    if self._stop_capture_at and time.time() >= self._stop_capture_at:
                        self._stop_capture_at = 0.0
                if allow_new_work:
                    if resolve_kinovea_backend(self.cfg) == "2025":
                        self._consume_clip_events()
                    else:
                        self._poll_new_recordings()
                self.pip.tick()
                if allow_new_work or getattr(self, "replay_visible", False):
                    self._tick_replay()  # (auto-hide still runs while paused, like the PiP)
            except Exception:
                log_throttled("video-tick", "SwingSessionManager.tick error", exc_info=True)


# --------------------------------------------------------------------------- watch / startup

def _sleep_with_video(seconds: float, video_mgr: SwingSessionManager | None, allow_new_work: bool = True) -> None:
    if not video_mgr:
        time.sleep(seconds)
        return
    end = time.time() + seconds
    while time.time() < end:
        try:
            video_mgr.tick(allow_new_work=allow_new_work)
        except Exception:
            log_throttled("video-tick-outer", "video tick failed", exc_info=True)
        time.sleep(min(0.5, max(0.05, end - time.time())))


# --------------------------------------------------------------------------- PAUSE file (with expiry)

PAUSE_PATH = HERE / "PAUSE"
_PAUSE_TS_RE = re.compile(r"paused_at:\s*(\S+)")


def write_pause(reason: str = "") -> None:
    """Create PAUSE with an ISO timestamp so a forgotten PAUSE expires (see pause_active)."""
    PAUSE_PATH.write_text(f"paused_at: {datetime.now().astimezone().isoformat(timespec='seconds')}\n{reason}\n",
                          encoding="utf-8")


def pause_age_sec(path: Path | None = None) -> float | None:
    """Seconds since the PAUSE was created (timestamp inside the file, else its mtime); None if absent."""
    p = path or PAUSE_PATH
    try:
        text = p.read_text(encoding="utf-8", errors="replace")
        mtime = p.stat().st_mtime
    except OSError:
        return None
    m = _PAUSE_TS_RE.search(text)
    if m:
        try:
            ts = datetime.fromisoformat(m.group(1))
            created = ts.timestamp() if ts.tzinfo else time.mktime(ts.timetuple())
            return max(0.0, time.time() - created)
        except ValueError:
            pass
    return max(0.0, time.time() - mtime)


def pause_active(cfg: dict | None = None, path: Path | None = None) -> bool:
    """True while a PAUSE file exists and is younger than `pause_max_hours` (default 4). A stale PAUSE
    (e.g. reconnect run and release-device forgotten) is logged and removed so the watchdog resumes."""
    p = path or PAUSE_PATH
    age = pause_age_sec(p)
    if age is None:
        return False
    try:
        max_h = float((cfg or {}).get("pause_max_hours", 4) or 0)
    except (TypeError, ValueError):
        log_throttled("pause-max-hours", "config pause_max_hours is not a number; using 4")
        max_h = 4.0
    if max_h > 0 and age > max_h * 3600:
        LOG.warning("PAUSE file is %.1f h old (limit %g h); ignoring and removing it - watchdog resumes.",
                    age / 3600, max_h)
        try:
            p.unlink(missing_ok=True)
        except OSError as e:
            log_throttled("pause-unlink", f"could not remove stale PAUSE: {e}")
        return False
    return True


class _WatchState:
    """Mutable state of the watch loop, kept on an object so one iteration can be a plain function."""

    def __init__(self, grace_until: float = 0.0):
        self.fails = 0
        self.level = 0
        self.last_status = None
        self.gate_running = False
        self.grace_until = grace_until
        self.last_cfg_attempt = 0.0
        self.offline_ticks = 0        # consecutive ticks with ping AND device_tcp both failing
        self.device_attempts = 0      # device-only (GameChanger-only) recoveries since the device was last healthy
        self.device_next_at = 0.0     # earliest time the next device-only recovery may run
        self.video_failures = 0       # consecutive video_mgr.start() failures (retried with backoff)
        self.video_next_at = 0.0      # earliest time the next video_mgr.start() attempt may run
        self.video_forced = False     # last seen state of the VIDEO_ON practice-video request (for logging)

    def reset(self, keep_video_backoff: bool = False) -> None:
        self.fails, self.level, self.last_status, self.gate_running = 0, 0, None, False
        self.offline_ticks = 0
        if not keep_video_backoff:
            self.video_failures, self.video_next_at = 0, 0.0


VIDEO_START_BACKOFF_SEC = (15.0, 30.0, 60.0, 120.0, 300.0)  # retry delays after a failed video rig start


def _ensure_video_started(st: _WatchState, video_mgr: SwingSessionManager | None) -> None:
    """Start the video rig while the gate is up; a failed start is retried with backoff (not only after
    the next GSPro restart) and logged once per attempt, never every tick."""
    if not video_mgr or getattr(video_mgr, "_started", False) or time.time() < st.video_next_at:
        return
    try:
        video_mgr.start(launch_rig=True)
        if st.video_failures:
            LOG.info("Video rig started after %d failed attempt(s)", st.video_failures)
        st.video_failures, st.video_next_at = 0, 0.0
    except Exception as e:
        delay = VIDEO_START_BACKOFF_SEC[min(st.video_failures, len(VIDEO_START_BACKOFF_SEC) - 1)]
        st.video_failures += 1
        st.video_next_at = time.time() + delay
        LOG.warning("Video rig start failed (%s: %s); retry #%d in %.0fs", type(e).__name__, e,
                    st.video_failures, delay, exc_info=st.video_failures == 1)


def _watch_step(cfg, st: _WatchState, video_mgr: SwingSessionManager | None) -> None:
    """One watchdog iteration (including its own sleep). Exceptions propagate to watch(), which survives them."""
    interval = cfg.get("interval_sec", 5)
    threshold = cfg.get("fail_threshold", 3)
    grace_sec = float(cfg.get("post_recover_grace_sec", 35))
    gate = cfg.get("only_when_running")

    # VIDEO_ON (written by `simwatch.py video` / run_practice_video.bat while this daemon runs): keep the video
    # rig up even without GSPro, until `simwatch.py video off` (or deleting the file).
    forced = video_request_active()
    if forced != st.video_forced:
        st.video_forced = forced
        LOG.info("Practice video request %s", "received (VIDEO_ON): starting the video rig regardless of GSPro"
                 if forced else "cleared: the video rig follows GSPro again")
    # A manager created only because of a request (video.enabled false) runs only while the request is up.
    want_video = bool(video_mgr) and (forced or not getattr(video_mgr, "forced_only", False))
    if video_mgr and not want_video:
        video_mgr.stop()

    paused = pause_active(cfg)
    gate_up = (not gate) or bool(find_procs(gate))
    if paused or not gate_up:
        if video_mgr and forced:
            _ensure_video_started(st, video_mgr)
        elif video_mgr and not gate_up:
            video_mgr.stop()
        st.reset(keep_video_backoff=forced)
        write_status("paused" if paused else "waiting_for_gate", paused=paused, gate=gate, gate_up=gate_up,
                     failing=[], level=0, video_request=forced)
        # Keep servicing pending stop-capture / PiP auto-hide; new rig work only for a requested practice rig.
        _sleep_with_video(interval, video_mgr, allow_new_work=forced and not paused)
        return

    if not st.gate_running:
        st.gate_running = True
        if "gspro" in cfg["apps_by_key"] and WindowSpec(r"^GSPro Configuration$").exists(timeout=2):
            LOG.info("GSPro Configuration dialog detected; configuring display and waiting for startup...")
            st.last_cfg_attempt = time.time()
            run_actions(cfg["apps_by_key"]["gspro"], cfg)
            time.sleep(cfg.get("settle_sec", 15))
            st.grace_until = time.time() + grace_sec
    if want_video:
        _ensure_video_started(st, video_mgr)  # first start, or a retry after a failed one

    if "gspro" in cfg["apps_by_key"] and (time.time() - st.last_cfg_attempt) >= 15.0:
        if WindowSpec(r"^GSPro Configuration$").exists(timeout=0):
            LOG.info("GSPro Configuration dialog reappeared; configuring display...")
            st.last_cfg_attempt = time.time()
            run_actions(cfg["apps_by_key"]["gspro"], cfg)
            st.grace_until = time.time() + grace_sec

    res = evaluate_checks(cfg, verbose=False)
    state = "unknown"
    # Debounce "device offline": ping AND device_tcp must both fail on N consecutive ticks (default 3).
    dev = cfg.get("device") if isinstance(cfg.get("device"), dict) else {}
    offline_need = max(1, int(cfg_number(dev.get("offline_ticks", 3), 3)))
    st.offline_ticks = st.offline_ticks + 1 if res.get("device_offline_raw") else 0
    device_offline = st.offline_ticks >= offline_need
    device_suspect = bool(res.get("device_offline_raw")) and not device_offline
    if not res.get("device_failing"):
        st.device_attempts, st.device_next_at = 0, 0.0   # device side healthy: reset device-only backoff
    if res["all_ok"]:
        if not res["any_unknown"] and st.last_status is not True:
            LOG.info("All green.")
        enforce_gspro_window_state(cfg)
        suppress_background_focus(cfg)
        st.fails, st.level, st.last_status = 0, 0, True
        state = "healthy"
    elif not res.get("non_device_failing") and (device_offline or device_suspect):
        # Only device checks fail and the Launch Pro looks off/asleep: wait for hardware, restart nothing.
        if device_offline:
            if st.last_status != "device_offline":
                LOG.warning("Launch Pro unreachable (off or asleep); waiting for hardware without restarting apps.")
            state = "device_offline"
        else:
            state = "device_check"
        st.fails, st.level, st.last_status = 0, 0, state
    elif res["only_device_failed"] and fsx_holds_device(cfg):
        # The user is on FSX Pro, which holds the Launch Pro: an intentional state, not a failure.
        if st.last_status != "fsx_holds_device":
            LOG.info("FSX Pro is using the Launch Pro; leaving FSX Pro and GameChanger alone "
                     "(run `python simwatch.py release-device` when done).")
        st.fails, st.last_status = 0, "fsx_holds_device"
        state = "fsx_holds_device"
    elif res["only_device_failed"] and time.time() < st.grace_until:
        if st.last_status != "discovery_grace":
            LOG.info("Waiting for GameChanger auto-discovery grace period (%ds remaining)...", int(max(0, st.grace_until - time.time())))
        st.last_status = "discovery_grace"
        state = "discovery_grace"
    elif res["only_device_failed"]:
        # Launch Pro reachable but GameChanger has no session: restart GameChanger ONLY, with backoff.
        st.fails += 1
        st.last_status = False
        state = "degraded"
        if st.fails >= threshold:
            st.fails = 0
            if time.time() >= st.device_next_at:
                state = "recovering"
                write_status(state, failing=res["failing"], level=st.level, device_attempt=st.device_attempts + 1,
                             skipped_checks=res["skipped"])
                recover_device(cfg)
                st.device_attempts += 1
                wait = device_backoff_sec(cfg, st.device_attempts)
                st.device_next_at = time.time() + wait
                st.grace_until = time.time() + grace_sec
                LOG.warning("Device-only recovery #%d done; if still failing, next GameChanger restart in >= %d min.",
                            st.device_attempts, int(wait // 60))
            else:
                state = "device_backoff"
                log_throttled("device-backoff",
                              f"Device-side check(s) still failing ({', '.join(res['failing']) or '?'}); "
                              f"next GameChanger-only restart in {int(st.device_next_at - time.time())}s",
                              every_sec=120.0)
    elif time.time() < st.grace_until and st.level > 0:
        # Just ran a recovery level: apps are still starting, so don't escalate to the next (heavier) level yet.
        if st.last_status != "post_recover_grace":
            LOG.info("Post-recovery grace (%ds remaining) before escalating further...",
                     int(max(0, st.grace_until - time.time())))
        st.last_status = "post_recover_grace"
        state = "post_recover_grace"
    else:
        # A non-device link (GSPconnect, :9050, :921, a hung app) is failing: escalate even if the Launch
        # Pro is offline - then device checks are ignored when choosing the level.
        st.fails += 1
        st.last_status = False
        state = "degraded"
        if st.fails >= threshold:
            if device_offline or device_suspect:
                max_needed_level = res.get("non_device_level") or 0
                LOG.warning("Launch Pro looks offline, but %s failing - recovering that chain anyway.",
                            ", ".join(res.get("non_device_failing") or []) or "?")
            else:
                max_needed_level = res["level"] or 0
            state = "recovering"
            write_status(state, failing=res["failing"], level=st.level, fails=st.fails, skipped_checks=res["skipped"])
            st.level = max(st.level, max_needed_level)
            if st.level >= len(cfg["recovery"]):
                alert(
                    "All recovery levels failed. Check the hardware (power, USB, Wi-Fi). "
                    f"Backing off {cfg.get('giveup_backoff_sec', 300)}s."
                )
                write_status("gave_up", failing=res["failing"], level=st.level,
                             backoff_sec=cfg.get("giveup_backoff_sec", 300))
                _sleep_with_video(cfg.get("giveup_backoff_sec", 300), video_mgr)
                st.level = 0
            else:
                recover(cfg, st.level)
                st.grace_until = time.time() + grace_sec
                st.level += 1
            st.fails = 0
    _bridge_note_health(state, res)
    write_status(state, failing=res["failing"], level=st.level, fails=st.fails,
                 skipped_checks=res["skipped"], paused=False, gate_up=True)
    _sleep_with_video(interval, video_mgr)


def _video_running(video_mgr) -> bool:
    return bool(video_mgr) and bool(getattr(video_mgr, "_started", False))


def _wire_companions(video_mgr, hub, shotlab) -> None:
    """Give the video rig the ShotLab supervisor (Alt+S) and the bridge the hotkey list (ShotLab Keys pill)."""
    if video_mgr is None:
        return
    video_mgr.shotlab = shotlab
    hotkeys = getattr(video_mgr, "hotkeys", None)
    if hub is not None and hotkeys is not None:
        hub.hotkeys_fn = hotkeys.rows


def _update_companion_status(cfg, shotlab, video_mgr) -> None:
    """ShotLab supervision + status extras. Isolated: an error here must never skip the rig's _watch_step."""
    try:
        if shotlab is not None:
            # Separate from the rig checks on purpose: ShotLab can never trigger GSPro/GameChanger recovery.
            gate = cfg.get("only_when_running")
            shotlab.tick((not gate) or bool(find_procs(gate)), paused=pause_active(cfg))
            STATUS_EXTRAS["shotlab"] = shotlab.status()
        hotkeys = getattr(video_mgr, "hotkeys", None)
        if hotkeys is not None:
            STATUS_EXTRAS["hotkeys"] = hotkeys.rows()
    except Exception as e:
        log_throttled("companion-status", f"ShotLab/hotkey status update failed: {e}", every_sec=300.0, exc_info=True)


def watch(cfg, initial_grace: bool = False) -> None:
    if not acquire_singleton_lock("watch"):
        msg = already_running_message("watch")
        LOG.warning(msg)
        print(msg)
        return
    pause_active(cfg)  # clear a stale PAUSE at startup (logged)

    interval = cfg.get("interval_sec", 5)
    grace_sec = float(cfg.get("post_recover_grace_sec", 35))
    video_enabled = bool(cfg.get("video", {}).get("enabled", False))
    video_mgr = SwingSessionManager(cfg) if video_enabled else None
    hub, bridge = start_bridge(cfg)  # never raises; a busy port is logged and the watchdog carries on
    if video_mgr and hub:
        video_mgr.hub = hub
    # Without the video rig nothing else sniffs :921, so give the bridge its own (gated like the rig).
    bridge_sniffer = make_bridge_sniffer(hub) if (hub and not video_mgr) else None

    try:
        shotlab = ShotLabSupervisor(cfg) if shotlab_config(cfg).get("enabled") else None
    except Exception as e:  # optional feature: never block the watchdog from starting
        LOG.warning("ShotLab supervision disabled: %s", e)
        shotlab = None
    _wire_companions(video_mgr, hub, shotlab)

    st = _WatchState((time.time() + grace_sec) if initial_grace else 0.0)
    LOG.info("SimWatch running. Create a file named PAUSE next to this script to pause. Status: %s", STATUS_PATH)
    try:
        while True:
            if stop_requested():
                LOG.info("Stop requested (`simwatch.py stop`); shutting down cleanly.")
                break
            try:
                if video_request_active():
                    if video_mgr is None:  # video.enabled is false: build a rig just for this request
                        video_mgr = SwingSessionManager(cfg)
                        video_mgr.forced_only = True
                        video_mgr.hub = hub
                        _wire_companions(video_mgr, hub, shotlab)
                    # The rig's own :921 sniffer feeds the bridge; never run two (shots would be recorded twice).
                    sync_bridge_sniffer(bridge_sniffer, False)
                _update_companion_status(cfg, shotlab, video_mgr)
                _watch_step(cfg, st, video_mgr)  # writes the status (incl. the extras above), then sleeps
                if bridge_sniffer is not None:  # same gate as the video rig: run while the gated app is up
                    gate = cfg.get("only_when_running")
                    run_sniffer = ((not gate) or bool(find_procs(gate))) and not _video_running(video_mgr)
                    sync_bridge_sniffer(bridge_sniffer, run_sniffer)
                    if run_sniffer and hub is not None:
                        hub.sniffer = bridge_sniffer  # a requested video rig may have pointed it at its own
            except (KeyboardInterrupt, SystemExit):
                raise
            except Exception as e:
                # One bad iteration (bad config, a Win32 hiccup...) must never kill the watchdog.
                LOG.exception("watch iteration failed (%s: %s); continuing in %ss", type(e).__name__, e, interval)
                write_status("error", error=f"{type(e).__name__}: {e}")
                try:
                    time.sleep(interval)
                except Exception:
                    pass
    finally:
        if video_mgr:
            video_mgr.stop()
        if bridge_sniffer:
            bridge_sniffer.stop()
        if bridge:
            bridge.stop()
        STATUS_EXTRAS.clear()  # don't report a live ShotLab / hotkeys after we've stopped
        write_status("stopped")


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


def device_link_iface() -> str | None:
    """Name of an UP network interface holding a link-local 169.254.* IPv4 address (the wired Launch Pro
    link: Windows only assigns APIPA once the adapter has link and DHCP gave up), else None."""
    try:
        addrs, stats = psutil.net_if_addrs(), psutil.net_if_stats()
    except (psutil.Error, OSError):
        return None
    for nic, al in addrs.items():
        if any(a.family == socket.AF_INET and str(a.address).startswith("169.254.") for a in al):
            s = stats.get(nic)
            if s is not None and s.isup:
                return nic
    return None


def wait_device_link(cfg, timeout: float) -> bool:
    """Startup only: wait (bounded, never fatal) for the wired device adapter to come up. Skipped unless
    the configured device IP is link-local (Wi-Fi setups have no such adapter)."""
    if not str(cfg.get("device", {}).get("ip") or "").startswith("169.254.") or timeout <= 0:
        return True
    end = time.time() + timeout
    while True:
        nic = device_link_iface()
        if nic:
            LOG.info("Device network adapter %r is up (link-local address present).", nic)
            return True
        if time.time() >= end:
            LOG.warning("No link-local (169.254.*) adapter came up within %ds; continuing (Wi-Fi or cable out?).",
                        int(timeout))
            return False
        time.sleep(2)


def startup(cfg) -> None:
    """Cold start after a PC reboot: bring the whole chain up in order, then watch it."""
    if not acquire_singleton_lock("startup"):
        msg = already_running_message("startup")
        LOG.warning(msg)
        print(msg)
        return
    st = cfg.get("startup")
    if not st or not st.get("order"):
        raise SystemExit("config.json has no 'startup.order'; cannot run `startup`")
    pause_active(cfg)  # logs + removes a stale PAUSE left over from before the reboot
    time.sleep(st.get("boot_delay_sec", 20))
    total = float(st.get("wait_timeout_sec", 180))
    end = time.time() + total
    wait_device_link(cfg, min(total, float(st.get("wait_link_sec", 60))))
    wait_until(cfg, st.get("wait_for", []), max(15.0, end - time.time()))
    for key in st["order"]:
        app = cfg["apps_by_key"].get(key)
        if app is None:
            LOG.error("startup.order: unknown app key %r; skipping", key)
            continue
        if key == "integrator":
            release_fsx_for_recovery(cfg)  # FSX Pro holding the device is left alone (just logged)
        launch_app(cfg, app, 60)
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


def running_watchdog_status() -> dict | None:
    """simwatch_status.json if it was written by a SimWatch process that is still alive, else None."""
    try:
        doc = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(doc, dict) or doc.get("state") == "stopped":
        return None
    try:
        pid = int(doc.get("pid"))
        if pid == os.getpid():
            return None
        proc = psutil.Process(pid)
        # Guard against PID reuse after a crash: it must still be a Python process running simwatch.py.
        if "python" not in (proc.name() or "").lower() or not any("simwatch" in str(a).lower() for a in proc.cmdline()):
            return None
    except (TypeError, ValueError, psutil.Error):
        return None
    return doc


def live_hotkey_registration() -> tuple[dict | None, str]:
    """(registration, source) of the running SimWatch's hotkeys: the full register_hotkeys() report from
    video_state.json (with free-key suggestions) when the video rig is live, else the per-action states from
    simwatch_status.json. source: "rig" | "watchdog" | "no_rig" (watchdog running, video rig off) | "not_running"."""
    st = read_video_state()
    reg = st.get("hotkeys") if video_state_live(st) else None
    if isinstance(reg, dict):
        return reg, "rig"
    doc = running_watchdog_status()
    if doc is None:
        return None, "not_running"
    hk = doc.get("hotkeys")
    if isinstance(hk, list) and hk:
        return {r.get("action"): r.get("state") for r in hk if isinstance(r, dict) and r.get("action")}, "watchdog"
    return None, "no_rig"


def print_hotkey_cheatsheet(cfg: dict) -> None:
    """Print the grouped shortcut map; if SimWatch is running, include which keys it actually registered."""
    reg, source = live_hotkey_registration()
    print()
    print(render_hotkeys_text(cfg, reg))
    for _sev, msg in hotkey_conflicts(cfg):
        print(f"  ! {msg}")
    if source == "rig":
        for f in reg.get("failed", []):
            print(f"  ! {hotkey_failure_message(f)}")
    elif source == "not_running":
        print("  (SimWatch isn't running, so key registration couldn't be checked.)")
    elif source == "no_rig":
        print("  (SimWatch is running without the video rig, so no hotkeys are active.)")


SHORTCUTS_DOC_PATH = HERE / "docs" / "SHORTCUTS.md"


def cmd_keys(cfg: dict, mode: str | None = None, doc_path: Path | None = None) -> int:
    """`keys`: print the grouped shortcut map. `keys md`: regenerate docs/SHORTCUTS.md from the same table."""
    mode = (mode or "show").strip().lower()
    if mode == "md":
        path = doc_path or SHORTCUTS_DOC_PATH
        path.parent.mkdir(parents=True, exist_ok=True)
        changed = write_text_if_changed(path, render_hotkeys_markdown(cfg), backup=False)
        print(f"{'Wrote' if changed else 'Up to date:'} {path}")
        return 0
    if mode not in ("show", "list", "text"):
        print(f"Invalid keys mode {mode!r} (valid: md, or nothing to print the map)")
        return 2
    print_hotkey_cheatsheet(cfg)
    return 0


def cmd_video(cfg: dict, mode: str | None = None) -> int:
    """Practice video: Kinovea 2x2 grid + hotkeys + shot/audio watcher, no GSPro needed.

    If the watch/startup daemon is running, hand off instead of fighting it: write VIDEO_ON so the daemon starts
    its own video rig regardless of GSPro (kept on until `video off` / the file is deleted) and exit 0.
    With no daemon running, run standalone in this console (Ctrl+C stops it)."""
    mode = (mode or "on").strip().lower()
    if mode not in ("on", "off"):
        print(f"Invalid video mode {mode!r} (valid: on, off)")
        return 2
    if mode == "off":
        had = clear_video_request()
        d = running_daemon()
        if d and d.get("command") == "video":
            print(f"Standalone video mode is running (pid {d['pid']}): close its window / Ctrl+C, "
                  "or run: python simwatch.py stop")
        else:
            print("Practice video request cleared; the video rig follows GSPro again." if had
                  else "No practice video request was active.")
        return 0
    if not acquire_singleton_lock("video"):
        d = running_daemon()
        if d and d.get("command") == "video":
            msg = f"Standalone video mode is already running (pid {d['pid']}); nothing to do."
        else:
            write_video_request()
            who = f" (pid {d['pid']}, `{d['command']}`)" if d and d.get("pid") else ""
            msg = (f"SimWatch is already running in the background{who}: asked it to start the video rig "
                   "(no GSPro needed). It picks this up within a few seconds (after its startup sequence, if one "
                   "is still running). The rig stays on until: python simwatch.py video off")
        LOG.info(msg)
        print(msg)
        return 0
    mgr = SwingSessionManager(cfg)
    mgr.hub, bridge = start_bridge(cfg)
    mgr.start(launch_rig=True)
    print_hotkey_cheatsheet(cfg)
    LOG.info("Standalone video mode running (Ctrl+C to stop).")
    try:
        while True:
            if stop_requested():
                LOG.info("Stop requested (`simwatch.py stop`); leaving standalone video mode.")
                break
            if pause_active(cfg):
                time.sleep(1)
                continue
            mgr.tick()
            time.sleep(0.5)
    except KeyboardInterrupt:
        LOG.info("Stopping standalone video mode.")
    finally:
        mgr.stop()
        if bridge:
            bridge.stop()
    return 0


# --------------------------------------------------------------------------- doctor

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
SKIP, INFO = "SKIP", "INFO"


def _port_state(port: int) -> str:
    """'listening' | 'connected' | 'none' | 'unknown' (psutil may need admin on some platforms)."""
    try:
        conns = psutil.net_connections(kind="tcp")
    except (psutil.Error, OSError):
        return "unknown"
    state = "none"
    for c in conns:
        if c.status == psutil.CONN_LISTEN and c.laddr and c.laddr.port == port:
            return "listening"
        if c.status == psutil.CONN_ESTABLISHED and (
            (c.laddr and c.laddr.port == port) or (c.raddr and c.raddr.port == port)
        ):
            state = "connected"
    return state


def doctor_report(config_path: Path) -> list[tuple[str, str, str]]:
    """Build the doctor rows: [(PASS|WARN|FAIL, item, detail)]. Pure of printing/exiting so it is testable."""
    rows: list[tuple[str, str, str]] = []

    def add(status, item, detail=""):
        rows.append((status, item, detail))

    v = sys.version_info
    add(PASS if v >= (3, 10) else FAIL, "Python version", f"{v.major}.{v.minor}.{v.micro} (needs >= 3.10)")
    add(PASS if IS_WINDOWS else WARN, "Platform", sys.platform if IS_WINDOWS
        else f"{sys.platform}: SimWatch only runs on Windows; app/port/task checks are informational")
    if IS_WINDOWS:
        try:
            admin = bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            admin = False
        add(PASS if admin else WARN, "Administrator", "elevated" if admin else
            "not elevated - clicks/raw sockets to elevated sim apps will fail")

    for mod, hard in (("psutil", True), ("pywinauto", IS_WINDOWS), ("win32gui", IS_WINDOWS),
                      ("PIL", IS_WINDOWS), ("cv2", False)):
        try:
            __import__(mod)
            add(PASS, f"module {mod}", "importable")
        except ImportError:
            add(FAIL if hard else WARN, f"module {mod}",
                "missing" + ("" if hard else " (optional / Windows-only)"))

    if os.access(HERE, os.W_OK):
        add(PASS, "HERE writable (log/status)", str(HERE))
    else:
        add(FAIL, "HERE writable (log/status)", f"{HERE} is not writable")

    # config (+ config.local.json overlay)
    try:
        cfg_raw, local_path = read_config_layers(Path(config_path))
    except FileNotFoundError:
        add(FAIL, "config", f"not found: {config_path}")
        return rows
    except LocalConfigError as e:
        add(FAIL, "config.local.json", f"{e} -> fix: correct or delete it")
        return rows
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        add(FAIL, "config", f"invalid JSON: {e}")
        return rows
    add(PASS if local_path else INFO, "config.local.json",
        f"merged over {Path(config_path).name}" if local_path else
        "not present (optional per-machine exe/device overrides; setup.bat or `discover --write-local` creates it)")
    # PAUSE: same age/limit logic as the watchdog (pause_age_sec + pause_max_hours) but read-only
    # (pause_active() would delete a stale file).
    pause_row = pause_file_row(pause_age_sec(), cfg_raw.get("pause_max_hours", 4) if isinstance(cfg_raw, dict) else 4)
    if pause_row:
        add(*pause_row)
    issues = validate_config(cfg_raw, check_paths=False)
    if not issues:
        add(PASS, "config validation", "no issues")
    for sev, msg in issues:
        add(FAIL if sev == "error" else WARN, "config validation", msg)
    if not isinstance(cfg_raw, dict):
        return rows

    # app exes
    for a in cfg_raw.get("apps", []) if isinstance(cfg_raw.get("apps"), list) else []:
        if not isinstance(a, dict) or not a.get("exe"):
            continue
        item = f"app exe: {a.get('key')}"
        if not IS_WINDOWS:
            add(WARN, item, f"skipped (not Windows): {a['exe']}")
        else:
            add(PASS if Path(a["exe"]).exists() else FAIL, item, a["exe"])

    vcfg = cfg_raw.get("video", {}) if isinstance(cfg_raw.get("video"), dict) else {}
    if vcfg.get("enabled"):
        pip_on = bool(vcfg.get("projector_pip", {}).get("enabled", True))
        for key, needed in (("kinovea_exe", True), ("obs_exe", pip_on)):
            path = vcfg.get(key)
            item = f"video.{key}"
            if not path:
                add(FAIL if needed else WARN, item, "not configured")
            elif not IS_WINDOWS:
                add(WARN, item, f"skipped (not Windows): {path}")
            elif Path(path).exists():
                add(PASS, item, path)
            else:
                add(FAIL if needed else WARN, item, f"not found: {path}")

    rows.extend(doctor_shotlab_rows(cfg_raw))
    if vcfg.get("enabled"):
        try:
            rows.extend(doctor_video_rows(cfg_raw))
        except Exception as e:  # a doctor row must never crash the report
            add(WARN, "video layout / hotkeys", f"check failed: {type(e).__name__}: {e}")

    # ports
    dev = cfg_raw.get("device", {}) if isinstance(cfg_raw.get("device"), dict) else {}
    ports = [(GSPRO_PORT, "OpenConnect"), (9050, "GSPconnect<->GSPro")]
    try:
        ports += [(p, "launch monitor") for p in sorted(_device_ports(dev))]
    except (TypeError, ValueError):
        add(WARN, "device ports", "could not parse device.port/ports")
    for port, what in ports:
        st = _port_state(port)
        add(PASS if st in ("listening", "connected") else WARN, f"port {port} ({what})",
            {"none": "not listening / no session (fine if the sim is not running)",
             "unknown": "could not enumerate sockets (try an admin shell)"}.get(st, st))

    # phone access to the drills hub (bridge.lan)
    if bridge_lan_enabled(cfg_raw):
        url = bridge_phone_url(cfg_raw)
        add(INFO if url else WARN, "bridge LAN (phone)",
            f"on - open on your phone (same Wi-Fi): {url}" if url else
            "on, but no home-network IPv4 address or pairing token found (Wi-Fi/Ethernet connected?)")
    else:
        add(INFO, "bridge LAN (phone)", "off (bridge.lan false: drills hub served to this PC only)")

    # scheduled task, sniffer, firewall, device adapter, power, ... (Windows only; SKIP elsewhere)
    rows.extend(doctor_system_rows(cfg_raw))
    return rows


def doctor_shotlab_rows(cfg_raw: dict) -> list[tuple[str, str, str]]:
    """ShotLab companion: installed? answering on its OBS port? Never a FAIL (it is optional)."""
    scfg = shotlab_config(cfg_raw)
    if not scfg.get("enabled"):
        return [(INFO, "ShotLab", "disabled (set shotlab.enabled=true to have SimWatch run it)")]
    rows = []
    exe = shotlab_electron_exe(cfg_raw)
    rows.append((PASS if exe.exists() else WARN, "ShotLab installed",
                 str(exe) if exe.exists() else f"{exe} missing -> run setup.bat (needs Node.js 20+) or run_shotlab.bat once"))
    port = int(scfg["obs_port"])
    health = probe_shotlab_health(port)
    if health:
        rows.append((PASS, f"ShotLab :{port}", f"running (pid {health.get('pid')}, bridge "
                     f"{'connected' if health.get('bridgeConnected') else 'NOT connected'})"))
    else:
        owner = port_listener_pid(port)
        rows.append((WARN if owner else INFO, f"ShotLab :{port}",
                     f"port held by another program (pid {owner})" if owner else
                     "not running (fine; the watchdog starts it with GSPro)"))
    return rows


def current_video_layout(cfg: dict) -> tuple[dict | None, str]:
    """(layout, source) for status/doctor: live from the displays on Windows, else what the running rig wrote."""
    if IS_WINDOWS:
        try:
            displays = list_displays()
            gidx = choose_display(cfg)[0]
            return select_video_layout(displays, video_layout_cfg(cfg), gidx), "displays now"
        except Exception as e:
            return None, f"could not read displays: {e}"
    st = read_video_state()
    if video_state_live(st) and isinstance(st.get("layout"), dict):
        return st["layout"], "running rig"
    return None, "Windows only"


def replay_settings_text(cfg: dict) -> str:
    rc = replay_cfg(cfg)
    by = rc.get("delay_by_club") if isinstance(rc.get("delay_by_club"), dict) else {}
    parts = []
    for club, v in by.items():
        d = replay_delay_for_club({"delay_by_club": {club: v}, "delay_sec": rc.get("delay_sec")}, club)
        parts.append(f"{club} {'no replay' if d is None else f'{d:g}s'}")
    clubs = ", ".join(parts) or "same for every club"
    return (f"{rc.get('mode')} - {cfg_number(rc.get('delay_sec'), 8):g}s after the shot ({clubs}), "
            f"shown {cfg_number(rc.get('show_sec'), 10):g}s")


def doctor_video_rows(cfg: dict) -> list[tuple[str, str, str]]:
    """Doctor: layout profile, replay vs GSPro fullscreen, shortcut conflicts + registration."""
    rows: list[tuple[str, str, str]] = []
    layout, src = current_video_layout(cfg)
    if layout:
        rows.append((INFO, "video layout", f"{layout_summary(layout)} ({src})"))
    else:
        rows.append((SKIP if src == "Windows only" else WARN, "video layout",
                     f"{video_layout_cfg(cfg).get('profile')} ({src})"))
    rows.append((INFO, "replay", replay_settings_text(cfg)))
    projector_on = None
    if IS_WINDOWS:
        try:
            projector_on = bool(choose_display(cfg)[2])
        except Exception:
            projector_on = None
    rows.append(evaluate_replay_gspro_mode(cfg, projector_on))

    conflicts = hotkey_conflicts(cfg)
    n_keys = sum(len(v) for v in effective_hotkeys(hotkeys_cfg_of(cfg)).values())
    if conflicts:
        rows.extend((WARN, "hotkeys (config)", m) for _sev, m in conflicts)
    else:
        rows.append((PASS, "hotkeys (config)", f"{n_keys} shortcuts, no conflicts (list: python simwatch.py keys)"))

    st = read_video_state()
    reg = st.get("hotkeys") if video_state_live(st) else None
    if isinstance(reg, dict):
        for f in reg.get("failed", []):
            rows.append((WARN, "hotkey registration", hotkey_failure_message(f)))
        if not reg.get("failed"):
            rows.append((PASS, "hotkey registration",
                         f"all {len(reg.get('ok', []))} registered by the running SimWatch (pid {st.get('pid')})"))
    elif IS_WINDOWS:
        hk = effective_hotkeys(hotkeys_cfg_of(cfg))
        bad = [(a, spec) for a, specs in hk.items() for spec in specs if not probe_hotkey(spec)]
        for a, spec in bad:
            sug = suggest_free_hotkey(hk, probe=probe_hotkey)
            rows.append((WARN, "hotkey registration",
                         f"{spec} ({a}) is already taken by another program"
                         + (f"; free alternative: video.hotkeys.{a} = \"{sug}\"" if sug else "")))
        if not bad:
            rows.append((PASS, "hotkey registration", f"all {n_keys} keys are free (probed; the video rig isn't running)"))
    else:
        rows.append((SKIP, "hotkey registration", "Windows only"))
    return rows


def run_doctor(config_path: Path) -> int:
    rows = doctor_report(config_path)
    w_item = max(len(r[1]) for r in rows)
    print(f"{'STATUS':<6}  {'ITEM':<{w_item}}  DETAIL")
    print(f"{'-' * 6}  {'-' * w_item}  {'-' * 40}")
    for status, item, detail in rows:
        print(f"{status:<6}  {item:<{w_item}}  {detail}")
    counts = {k: sum(1 for r in rows if r[0] == k) for k in (PASS, WARN, FAIL, SKIP, INFO)}
    print(f"\n{counts[PASS]} passed, {counts[WARN]} warning(s), {counts[FAIL]} failure(s)"
          + (f", {counts[SKIP]} skipped" if counts[SKIP] else ""))
    if counts[FAIL] or counts[WARN]:
        print("Most network/power/firewall fixes: `python simwatch.py harden` (dry run) then `harden --apply` as Administrator.")
    return 1 if counts[FAIL] else 0


# --------------------------------------------------------------------------- doctor: system checks (Windows)

HARDEN_HINT = "python simwatch.py harden --apply (as Administrator)"
HIGH_PERF_GUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
ULTIMATE_GUID = "e9a42b02-d5df-448d-aa00-03f14749eb61"
USB_SS = ("2a737441-1930-4402-8d77-b2bebba308a3", "48e6b7a6-50f5-4782-a5d4-53bb8f07e226")
PCIE_ASPM = ("501a4d13-42af-4429-9fd1-a8218c268e20", "ee12f906-d277-404b-b6da-e5fa1a576df5")
HOST_LINK_IP = "169.254.6.1"
# Network List Manager policy key for "Unidentified Networks" (what secpol.msc writes): Category 1 = Private.
NLM_UNIDENTIFIED_KEY = (r"HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\CurrentVersion\NetworkList\Signatures"
                        r"\010103000F0000F0010000000F0000F0C967A3643C3AD745950DA7859209176EF5B87C875FA20DF21951640E807D7C24")
PAUSE_STALE_SEC = 4 * 3600
KINOVEA_MIN_VERSION = (2025, 1)
DOCTOR_SYSTEM_CHECKS = ("scheduled task 'SimWatch'", "sniffer raw socket", "firewall", "GameChanger exe",
                        "device adapter", "device ping", "power", "FSX Pro device hold", "Kinovea version",
                        "GameChanger OpenConnect target", "firewall: bridge LAN (phone)")


def _run_cmd(args: list, timeout: float = 20) -> tuple[int, str]:
    """Run a console command; (returncode, stdout [+stderr on failure]). Never raises; rc -1 on error/timeout."""
    try:
        r = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=timeout,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return r.returncode, (r.stdout or "") + ("" if r.returncode == 0 else (r.stderr or ""))
    except subprocess.TimeoutExpired:
        return -1, f"timed out after {timeout:.0f}s"
    except (OSError, subprocess.SubprocessError) as e:
        return -1, str(e)


def _ps(script: str, timeout: float = 30) -> tuple[int, str]:
    return _run_cmd(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                     "-Command", script], timeout)


def _ps_json(script: str, timeout: float = 30):
    rc, out = _ps(script, timeout)
    if rc != 0 or not out.strip():
        return None
    try:
        return json.loads(out.strip())
    except ValueError:
        return None


def _psq(s) -> str:
    """PowerShell single-quoted literal."""
    return "'" + str(s).replace("'", "''") + "'"


def _is_admin() -> bool:
    if not IS_WINDOWS:
        return False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _norm_win_path(p) -> str:
    return os.path.expandvars(str(p)).replace("/", "\\").strip().rstrip("\\").lower()


def _cfg_app(cfg: dict, key: str, process: str) -> dict | None:
    for a in cfg.get("apps") or []:
        if isinstance(a, dict) and (a.get("key") == key or str(a.get("process", "")).lower() == process.lower()):
            return a
    return None


def _python_exes() -> dict[str, str]:
    """label -> path for the interpreter(s) that own the sniffer socket (a venv python.exe re-launches the base one)."""
    out: dict[str, str] = {}
    seen = set()
    for label, p in (("python.exe (venv)", sys.executable),
                     ("python.exe (base)", str(Path(sys.base_prefix) / "python.exe"))):
        n = _norm_win_path(p)
        if n not in seen and (Path(p).exists() or not IS_WINDOWS):
            seen.add(n)
            out[label] = str(p)
    return out


def firewall_programs(cfg: dict) -> dict[str, list[str]]:
    """label -> program paths that need inbound Allow (and no Block) rules."""
    progs: dict[str, list[str]] = {"python.exe (sniffer)": list(_python_exes().values())}
    for key, proc in (("integrator", "GameChanger.exe"), ("gspro_connect", "GSPconnect.exe"),
                      ("fs_connector", "FSX Pro.exe")):
        a = _cfg_app(cfg, key, proc)
        if a and a.get("exe"):
            progs[a.get("process") or proc] = [a["exe"]]
    return progs


# Inbound remote-address scope of SimWatch's firewall Allow rules (what `harden` sets, what `doctor` expects):
# - python.exe: the :921 sniffer is a raw socket bound to 127.0.0.1 and the bridge serves 127.0.0.1 - loopback
#   only. (Phone access over Wi-Fi gets its own port-only rule: BRIDGE_LAN_FIREWALL_RULE, TCP <port>, LocalSubnet.)
# - GSPconnect.exe: :921 from GameChanger and :9050 to GSPro are both on this PC - loopback only.
# - GameChanger.exe / FSX Pro.exe: talk to the Launch Pro at 169.254.x on the direct link (TCP replies are
#   allowed statefully anyway) and may receive its UDP discovery/broadcasts, whose SOURCE is the device's
#   169.254.x address; LocalSubnet also covers a Launch Pro joined to the home Wi-Fi instead of the direct link.
#   169.254.0.0/16 is listed explicitly because LocalSubnet only contains it while the link adapter has its
#   169.254 address (i.e. not during a replug/APIPA wait).
FIREWALL_SCOPE_LOOPBACK = ("127.0.0.1",)
FIREWALL_SCOPE_DEVICE = ("169.254.0.0/16", "LocalSubnet")


def firewall_remote_scope(label: str) -> tuple[str, ...]:
    """The -RemoteAddress list for a firewall_programs()/harden label."""
    low = label.lower()
    if low.startswith("python") or "gspconnect" in low:
        return FIREWALL_SCOPE_LOOPBACK
    return FIREWALL_SCOPE_DEVICE


def _scope_networks(scope) -> tuple[list, set[str]]:
    nets, keywords = [], set()
    for e in scope:
        if e == "127.0.0.1":
            nets.append(ipaddress.ip_network("127.0.0.0/8"))  # any loopback address is as narrow as it gets
        elif e[:1].isdigit():
            nets.append(ipaddress.ip_network(e, strict=False))
        else:
            keywords.add(e.lower())
    return nets, keywords


def remote_scope_within(remote, expected) -> bool:
    """Is a rule's RemoteAddress (Windows form: 'Any', 'LocalSubnet', '127.0.0.1', '169.254.0.0/255.255.0.0',
    'a-b' ranges; list or comma-joined) no broader than `expected`? Unparseable -> False (treated as broad)."""
    items = remote if isinstance(remote, (list, tuple)) else str(remote or "").split(",")
    items = [str(i).strip() for i in items if str(i).strip()]
    if not items:
        return False
    nets, keywords = _scope_networks(expected)

    def ip_ok(ip) -> bool:
        return any(ip.version == n.version and ip in n for n in nets)

    for e in items:
        low = e.lower()
        if low in ("any", "*"):
            return False
        if not (low[:1].isdigit() or ":" in low):
            if low.rstrip("46") not in keywords:  # LocalSubnet4/6 count as LocalSubnet
                return False
            continue
        try:
            if "-" in e:
                lo, hi = (ipaddress.ip_address(x.strip()) for x in e.split("-", 1))
                if not (ip_ok(lo) and ip_ok(hi)):
                    return False
            else:
                net = ipaddress.ip_network(e, strict=False)
                if not any(net.version == n.version and net.subnet_of(n) for n in nets):
                    return False
        except ValueError:
            return False
    return True


def pause_file_row(age_sec: float | None, max_hours=4):
    """Doctor row for the PAUSE file given its age (pause_age_sec()) and config pause_max_hours."""
    if age_sec is None:
        return None
    try:
        max_h = float(max_hours or 0)
    except (TypeError, ValueError):
        max_h = PAUSE_STALE_SEC / 3600
    if max_h > 0 and age_sec > max_h * 3600:
        return (WARN, "PAUSE file", f"stale ({age_sec / 3600:.1f} h old, limit {max_h:g} h) - the watchdog will "
                                    "ignore and delete it -> fix: run release_device.bat or delete PAUSE")
    return (WARN, "PAUSE file", f"present ({age_sec / 60:.0f} min old) - watchdog is paused")


# ---- pure parsers / evaluators (unit-tested off Windows)

def parse_powercfg_ac_index(text: str) -> int | None:
    m = re.search(r"Current AC Power Setting Index:\s*0x([0-9a-f]+)", text or "", re.I)
    return int(m.group(1), 16) if m else None


def parse_active_scheme(text: str) -> tuple[str | None, str | None]:
    m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*(?:\(([^)]*)\))?", text or "", re.I)
    if not m:
        return None, None
    return m.group(1).lower(), ((m.group(2) or "").strip() or None)


def is_performance_scheme(guid: str | None, name: str | None) -> bool:
    return guid in (HIGH_PERF_GUID, ULTIMATE_GUID) or bool(name and re.search(r"high perf|ultimate", name, re.I))


def evaluate_power(scheme_text: str, usb_idx: int | None, standby_idx: int | None, aspm_idx: int | None,
                   hibernate: int | None, hiberboot: int | None) -> list[tuple[str, str, str]]:
    rows = []
    guid, name = parse_active_scheme(scheme_text)
    rows.append((PASS, "power plan", name or guid) if is_performance_scheme(guid, name) else
                (WARN, "power plan", f"active plan is {name or guid or 'unknown'} -> fix: {HARDEN_HINT} (High performance)"))
    if usb_idx is None:
        rows.append((WARN, "USB selective suspend (AC)", "could not read setting"))
    else:
        rows.append((PASS, "USB selective suspend (AC)", "disabled") if usb_idx == 0 else
                    (WARN, "USB selective suspend (AC)", f"enabled - Windows may suspend the Launch Pro USB NIC "
                                                         f"-> fix: {HARDEN_HINT}"))
    if standby_idx is None:
        rows.append((WARN, "sleep after (AC)", "could not read setting"))
    else:
        rows.append((PASS, "sleep after (AC)", "never") if standby_idx == 0 else
                    (WARN, "sleep after (AC)", f"{standby_idx // 60} min -> fix: powercfg /change standby-timeout-ac 0"))
    if aspm_idx is not None:
        rows.append((PASS, "PCIe link power mgmt (AC)", "off") if aspm_idx == 0 else
                    (WARN, "PCIe link power mgmt (AC)", f"level {aspm_idx} -> fix: {HARDEN_HINT}"))
    if hibernate is None and hiberboot is None:
        rows.append((WARN, "hibernate / fast startup", "could not read setting"))
        return rows
    if hibernate == 0:  # fast startup needs the hiberfile: with hibernation off it can't run, whatever HiberbootEnabled says
        on = []
    else:
        on = [n for n, v in (("hibernate", hibernate), ("fast startup", hiberboot)) if v]
    rows.append((PASS, "hibernate / fast startup", "off" if hibernate != 0 or not hiberboot else
                 "off (hibernation disabled, so fast startup can't run)") if not on else
                (WARN, "hibernate / fast startup", f"{' + '.join(on)} on - restores stale USB NIC state "
                                                   "-> fix: powercfg /hibernate off"))
    return rows


def parse_task_xml(xml_text: str) -> dict:
    """Settings of a `schtasks /Query /XML` export that matter for a forever-running watchdog.
    Missing elements get Task Scheduler's defaults (PT72H limit, AC-only)."""
    text = re.sub(r"^\s*<\?xml[^>]*\?>", "", (xml_text or "").lstrip("\ufeff"))
    root = ET.fromstring(text)
    for el in root.iter():
        if isinstance(el.tag, str):
            el.tag = el.tag.split("}", 1)[-1]

    def val(path, default):
        el = root.find(path)
        return el.text.strip() if el is not None and el.text else default

    def flag(path, default):
        return val(path, "true" if default else "false").lower() == "true"

    return {
        "execution_time_limit": val("Settings/ExecutionTimeLimit", "PT72H"),
        "disallow_on_batteries": flag("Settings/DisallowStartIfOnBatteries", True),
        "stop_on_batteries": flag("Settings/StopIfGoingOnBatteries", True),
        "enabled": flag("Settings/Enabled", True),
        "run_level": val("Principals/Principal/RunLevel", "LeastPrivilege"),
    }


def evaluate_task(info: dict) -> tuple[str, str, str]:
    item = "scheduled task 'SimWatch'"
    problems = []
    if not info.get("enabled", True):
        problems.append("disabled")
    if info.get("execution_time_limit") != "PT0S":
        problems.append(f"ExecutionTimeLimit {info.get('execution_time_limit')} (task is killed after that)")
    if info.get("disallow_on_batteries") or info.get("stop_on_batteries"):
        problems.append("AC-only (won't start/keeps stopping on battery or UPS)")
    if info.get("run_level") != "HighestAvailable":
        problems.append("not run with highest privileges")
    if not problems:
        return (PASS, item, "registered, no time limit, runs on battery, highest privileges")
    # harden's task step only changes Settings (time limit / battery); it can't enable the task or change its
    # principal, so a disabled or non-elevated task needs install_autostart.bat (re-registers it).
    reinstall = not info.get("enabled", True) or info.get("run_level") != "HighestAvailable"
    fix = "rerun install_autostart.bat" if reinstall else HARDEN_HINT
    return (WARN, item, "; ".join(problems) + f" -> fix: {fix}")


def exe_location_issue(path: str) -> str | None:
    p = "\\" + str(path).replace("/", "\\").lower()
    if "\\downloads\\" in p:
        return "under Downloads"
    if "\\temp\\" in p or "\\tmp\\" in p:
        return "under a Temp folder"
    return None


def evaluate_gamechanger_exe(path: str | None, exists: bool, zone: bool, version: str | None) -> tuple[str, str, str]:
    item = "GameChanger exe"
    if not path:
        return (WARN, item, "integrator exe not configured")
    if not exists:
        return (FAIL, item, f"not found: {path} -> fix: set apps[integrator].exe in config.local.json")
    issues = [i for i in (exe_location_issue(path), "has Zone.Identifier (downloaded/blocked)" if zone else None) if i]
    ver = f"v{version}" if version else "version unknown"
    if issues:
        return (WARN, item, f"{ver}; {', '.join(issues)} -> fix: move folder to C:\\SimTools\\GameChanger, "
                            "Get-ChildItem C:\\SimTools\\GameChanger -Recurse | Unblock-File, update config.local.json")
    return (PASS, item, f"{ver}; {path}")


def parse_version(s: str | None) -> tuple[int, ...]:
    return tuple(int(n) for n in re.findall(r"\d+", s or "")[:4])


def evaluate_kinovea(path: str | None, exists: bool, version: str | None) -> tuple[str, str, str]:
    item = "Kinovea version"
    if not path:
        return (INFO, item, "video.kinovea_exe not configured")
    if not exists:
        return (WARN, item, f"not found: {path} -> fix: install Kinovea 2025.1+ or set video.kinovea_exe")
    v = parse_version(version)
    if not v:
        return (INFO, item, f"version unknown: {path}")
    if v < KINOVEA_MIN_VERSION:
        return (WARN, item, f"v{version} is older than 2025.1 (legacy capture backend) -> fix: upgrade Kinovea")
    return (PASS, item, f"v{version}")


def evaluate_firewall(rules: list, programs: dict[str, list[str]]) -> list[tuple[str, str, str]]:
    """rules: [{Program, Name, Direction, Action, Enabled}] for the programs of interest (from PowerShell)."""
    rows = []
    for label, paths in programs.items():
        wanted = {_norm_win_path(p) for p in paths if p}
        mine = [r for r in rules or [] if isinstance(r, dict) and _norm_win_path(r.get("Program", "")) in wanted
                and str(r.get("Enabled", "True")).lower() in ("true", "1")]
        blocks = [r for r in mine if str(r.get("Action", "")).lower() == "block"]
        allows = [r for r in mine if str(r.get("Action", "")).lower() == "allow"
                  and str(r.get("Direction", "")).lower() == "inbound"]
        item = f"firewall: {label}"
        expected = firewall_remote_scope(label)
        broad = [r for r in allows if "RemoteAddress" in r and not remote_scope_within(r["RemoteAddress"], expected)]
        if blocks:
            names = ", ".join(sorted({str(r.get("Name", "?")) for r in blocks}))[:80]
            rows.append((FAIL, item, f"Block rule(s): {names} -> fix: {HARDEN_HINT} (or delete them in wf.msc)"))
        elif broad:
            desc = "; ".join(sorted({f"{r.get('Name', '?')} (remote {r.get('RemoteAddress') or 'Any'})"
                                     for r in broad}))[:160]
            rows.append((WARN, item, f"inbound Allow broader than needed: {desc}; expected {','.join(expected)} -> "
                                     f"fix: {HARDEN_HINT} narrows SimWatch's own rule; narrow or delete any "
                                     "other listed rule in wf.msc"))
        elif allows:
            rows.append((PASS, item, f"inbound Allow rule present (remote {','.join(expected)})"))
        else:
            rows.append((WARN, item, f"no inbound Allow rule -> fix: {HARDEN_HINT}"))
    return rows


def evaluate_adapter(info: dict | None, device_ip: str) -> list[tuple[str, str, str]]:
    """info: route/adapter facts for the device IP (see _adapter_info). Device off/unplugged -> WARN, not FAIL."""
    item = "device adapter"
    if not info or not info.get("Name"):
        return [(WARN, item, f"no route to {device_ip} (Launch Pro off or USB cable unplugged?)")]
    src = str(info.get("Source") or "")
    if not src.startswith("169.254."):
        return [(WARN, item, f"route to {device_ip} goes via {info['Name']} (src {src or '?'}), not the Launch Pro "
                             "USB adapter - is the Launch Pro on and cabled?")]
    name = f"{info['Name']} ({info.get('Desc', '')})".replace(" ()", "")
    rows = []
    if str(info.get("Status", "")).lower() != "up":
        rows.append((FAIL, item, f"{name} is {info.get('Status')} -> fix: enable it in ncpa.cpl / replug the cable"))
        return rows
    rows.append((PASS, item, f"{name} Up, src {src}"))
    dhcp = str(info.get("Dhcp", "")).lower()
    rows.append((PASS, "adapter IP", "static") if dhcp == "disabled" else
                (WARN, "adapter IP", f"DHCP/APIPA (~60 s to get an address after replug) -> fix: {HARDEN_HINT} "
                                     f"(static {HOST_LINK_IP}/16)"))
    route32 = bool(info.get("Route32"))
    try:
        metric = int(info.get("Metric"))
    except (TypeError, ValueError):
        metric = None
    if route32 and metric is not None and metric <= 5:
        rows.append((PASS, "adapter route/metric", f"/32 route to device, metric {metric}"))
    else:
        rows.append((WARN, "adapter route/metric", f"{'' if route32 else 'no /32 route to device; '}metric {metric} "
                                                   f"-> fix: {HARDEN_HINT}"))
    prof = str(info.get("Profile") or "none")
    rows.append((PASS, "adapter network profile", prof) if prof in ("Private", "DomainAuthenticated") else
                (WARN, "adapter network profile",
                 f"{prof} -> fix: {HARDEN_HINT} (Private profile + Unidentified Networks policy = Private; a direct "
                 "link is an 'Unidentified network' that Windows re-creates as Public after an adapter restart)"))
    rows.append(evaluate_adapter_power(info.get("AllowSleep"), info.get("WmiPower")))
    return rows


def evaluate_adapter_power(allow_sleep, wmi_enable) -> tuple[str, str, str]:
    """allow_sleep: Get-NetAdapterPowerManagement AllowComputerToTurnOffDevice (Enabled/Disabled/Unsupported/'').
    wmi_enable: root/wmi MSPower_DeviceEnable.Enable for the adapter ('True'/'False'/'' if unreadable) - this is the
    Device Manager 'Allow the computer to turn off this device' checkbox, i.e. what actually lets Windows power it
    off, so it wins when readable. Without it, only AllowComputerToTurnOffDevice=Enabled means 'may turn off'."""
    item = "adapter power mgmt"
    allow = str(allow_sleep or "").strip()
    wmi = str(wmi_enable or "").strip().lower()
    detail = f"AllowComputerToTurnOffDevice={allow or '?'}, MSPower_DeviceEnable={wmi_enable if wmi else '?'}"
    fix = f"-> fix: {HARDEN_HINT}"
    if wmi == "true":
        return (WARN, item, f"Windows may turn off the adapter (Device Manager power checkbox on; {detail}) {fix}")
    if wmi == "false":
        return (PASS, item, f"off ({detail})")
    if allow.lower() == "enabled":
        return (WARN, item, f"Windows may turn off the adapter ({detail}) {fix}")
    if allow.lower() == "disabled":
        return (PASS, item, f"off ({detail})")
    return (INFO, item, f"can't confirm ({detail}; run doctor as Administrator to read the WMI flag)")


_HOSTPORT_RE = re.compile(r"(localhost|::1|\d{1,3}(?:\.\d{1,3}){3})\]?\s*[:,]\s*\"?(\d{2,5})\b", re.I)
_HOSTKEY_RE = re.compile(r"(?:host|ip|address|server)\w*\"?\s*[:=]\s*\"?(localhost|::1|\d{1,3}(?:\.\d{1,3}){3})", re.I)
_PORTKEY_RE = re.compile(r"port\w*\"?\s*[:=]\s*\"?(\d{2,5})\b", re.I)


def find_openconnect_targets(text: str) -> list[tuple[str, int]]:
    """Best-effort (host, port) pairs pointing at OpenConnect (:921) in a settings file's text."""
    text = text or ""
    out = [(h.lower(), int(p)) for h, p in _HOSTPORT_RE.findall(text) if int(p) == GSPRO_PORT]
    if not out and any(int(p) == GSPRO_PORT for p in _PORTKEY_RE.findall(text)):
        out = [(h.lower(), GSPRO_PORT) for h in _HOSTKEY_RE.findall(text)]
    return out


def evaluate_openconnect_targets(found: list[tuple[str, str, int]]) -> tuple[str, str, str]:
    """found: [(file, host, port)]."""
    item = "GameChanger OpenConnect target"
    if not found:
        return (INFO, item, "settings not located - make sure GameChanger targets 127.0.0.1:921 (not localhost)")
    bad = [(f, h) for f, h, _ in found if h != "127.0.0.1"]
    if bad:
        f, h = bad[0]
        return (WARN, item, f"{h}:921 in {Path(f).name} - the :921 sniffer only sees IPv4 loopback "
                            "-> fix: set the GameChanger OpenConnect host to 127.0.0.1")
    return (PASS, item, f"127.0.0.1:921 ({Path(found[0][0]).name})")


# ---- Windows probes

def sniffer_probe() -> tuple[bool, str]:
    """Can this process open the :921 sniffer (raw IPv4 socket + SIO_RCVALL on 127.0.0.1)? Closed immediately."""
    if not hasattr(socket, "SIO_RCVALL"):
        return False, "SIO_RCVALL unavailable on this platform"
    s = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_IP)
        s.bind(("127.0.0.1", 0))
        s.ioctl(socket.SIO_RCVALL, socket.RCVALL_ON)
        s.ioctl(socket.SIO_RCVALL, socket.RCVALL_OFF)
        return True, "raw socket + SIO_RCVALL on 127.0.0.1 OK"
    except OSError as e:
        if isinstance(e, PermissionError) or getattr(e, "winerror", None) == 10013:
            return False, "access denied -> fix: run as Administrator (the scheduled task already does)"
        return False, f"{e} -> fix: run as Administrator; check firewall/AV"
    finally:
        if s is not None:
            try:
                s.close()
            except OSError:
                pass


def file_version(path) -> str | None:
    try:
        import win32api  # pywin32
        info = win32api.GetFileVersionInfo(str(path), "\\")
        ms, ls = info["FileVersionMS"], info["FileVersionLS"]
        return f"{ms >> 16}.{ms & 0xFFFF}.{ls >> 16}.{ls & 0xFFFF}"
    except Exception:
        pass
    if IS_WINDOWS:
        rc, out = _ps(f"(Get-Item -LiteralPath {_psq(path)}).VersionInfo.FileVersion", 15)
        if rc == 0 and out.strip():
            return out.strip()
    return None


def has_zone_identifier(path) -> bool:
    try:
        with open(f"{path}:Zone.Identifier", "rb"):
            return True
    except OSError:
        return False


def _adapter_info(device_ip: str) -> dict | None:
    script = f"""$ErrorActionPreference='SilentlyContinue'
$ip={_psq(device_ip)}
$r = Find-NetRoute -RemoteIPAddress $ip
if (-not $r) {{ exit 0 }}
$idx = ($r | Select-Object -First 1).InterfaceIndex
$src = ($r | Where-Object {{ $_.IPAddress }} | Select-Object -First 1).IPAddress
$a = Get-NetAdapter -InterfaceIndex $idx
$i = Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4
$p = Get-NetConnectionProfile -InterfaceIndex $idx
$pm = if ($a) {{ Get-NetAdapterPowerManagement -Name $a.Name }}
$r32 = Get-NetRoute -DestinationPrefix "$ip/32"
$w = if ($a -and $a.PnPDeviceID) {{ Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable |
  Where-Object {{ $_.InstanceName -like "$($a.PnPDeviceID)*" }} | Select-Object -First 1 }}
[pscustomobject]@{{Name=$a.Name; Desc=$a.InterfaceDescription; Status=[string]$a.Status; Index=$idx; Source=$src;
 Dhcp=[string]$i.Dhcp; Metric=$i.InterfaceMetric; Profile=[string]$p.NetworkCategory;
 AllowSleep=[string]$pm.AllowComputerToTurnOffDevice; WmiPower=$(if ($w) {{ [string]$w.Enable }} else {{ '' }});
 Route32=[bool]$r32}} | ConvertTo-Json -Compress"""
    info = _ps_json(script, 30)
    return info if isinstance(info, dict) else None


def _firewall_rules(paths: list[str]) -> list | None:
    plist = ",".join(_psq(p) for p in paths)
    script = f"""$ErrorActionPreference='SilentlyContinue'
$p=@({plist})
$out = foreach ($f in (Get-NetFirewallApplicationFilter -PolicyStore ActiveStore |
    Where-Object {{ $p -contains [Environment]::ExpandEnvironmentVariables($_.Program) }})) {{
  foreach ($r in ($f | Get-NetFirewallRule)) {{
    [pscustomobject]@{{Program=[Environment]::ExpandEnvironmentVariables($f.Program); Name=$r.DisplayName;
      Direction=[string]$r.Direction; Action=[string]$r.Action; Enabled=[string]$r.Enabled;
      RemoteAddress=(@(($r | Get-NetFirewallAddressFilter).RemoteAddress) -join ',')}} }} }}
ConvertTo-Json -InputObject @($out) -Compress"""
    res = _ps_json(script, 60)
    if isinstance(res, dict):
        res = [res]
    return res if isinstance(res, list) else None


def _bridge_lan_rule_info() -> list | None:
    """[{Name, Enabled, Action, Profile, LocalPort, Protocol, RemoteAddress}] for BRIDGE_LAN_FIREWALL_RULE."""
    script = f"""$ErrorActionPreference='SilentlyContinue'
$out = foreach ($r in @(Get-NetFirewallRule -DisplayName {_psq(BRIDGE_LAN_FIREWALL_RULE)})) {{
  $pf = $r | Get-NetFirewallPortFilter; $af = $r | Get-NetFirewallAddressFilter
  [pscustomobject]@{{Name=$r.DisplayName; Enabled=[string]$r.Enabled; Action=[string]$r.Action;
    Profile=[string]$r.Profile; Protocol=[string]$pf.Protocol; LocalPort=(@($pf.LocalPort) -join ',');
    RemoteAddress=(@($af.RemoteAddress) -join ',')}} }}
ConvertTo-Json -InputObject @($out) -Compress"""
    res = _ps_json(script, 30)
    if isinstance(res, dict):
        res = [res]
    return res if isinstance(res, list) else None


def evaluate_bridge_lan_rule(lan_on: bool, rules: list | None, port: int) -> tuple[str, str, str]:
    """Doctor row for the phone-access firewall rule (only wanted while bridge.lan is true)."""
    item = "firewall: bridge LAN (phone)"
    rules = [r for r in rules or [] if isinstance(r, dict)]
    remove = f"Remove-NetFirewallRule -DisplayName {_psq(BRIDGE_LAN_FIREWALL_RULE)}"
    if not lan_on:
        if rules:
            return (INFO, item, f"leftover rule while bridge.lan is off (harmless: the bridge binds 127.0.0.1) "
                                f"-> remove (Administrator PowerShell): {remove}")
        return (PASS, item, "no LAN rule (bridge.lan off)")
    if not rules:
        return (WARN, item, f"bridge.lan is on but no inbound rule for TCP {port}; the phone can't connect -> "
                            f"fix: {HARDEN_HINT}")
    for r in rules:
        prof = str(r.get("Profile", "")).lower()
        ok = (str(r.get("Enabled", "True")).lower() in ("true", "1") and str(r.get("Action", "")).lower() == "allow"
              and str(r.get("LocalPort", "")).strip() == str(port) and str(r.get("Protocol", "")).upper() == "TCP"
              and "public" not in prof and prof not in ("any", "")
              and remote_scope_within(r.get("RemoteAddress"), ("LocalSubnet",)))
        if not ok:
            return (WARN, item, f"rule differs from TCP {port} / Private / LocalSubnet (port {r.get('LocalPort')}, "
                                f"profile {r.get('Profile')}, remote {r.get('RemoteAddress')}) -> fix: {HARDEN_HINT}")
    return (PASS, item, f"TCP {port} inbound, Private profile, LocalSubnet only")


def _reg_hklm_dword(subkey: str, value: str) -> int | None:
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey) as k:
            return int(winreg.QueryValueEx(k, value)[0])
    except (OSError, ImportError, ValueError, TypeError):
        return None


def _gamechanger_settings_files(exe: str | None) -> list[Path]:
    dirs: list[Path] = []
    if exe:
        dirs.append(Path(exe).parent)
    for env in ("APPDATA", "LOCALAPPDATA", "USERPROFILE"):
        base = os.environ.get(env)
        if not base:
            continue
        b = Path(base)
        for pat in ("GameChanger*", "*/GameChanger*", "Documents/GameChanger*"):
            try:
                dirs += [d for d in b.glob(pat) if d.is_dir()]
            except OSError:
                pass
    exts = {".json", ".ini", ".cfg", ".config", ".xml", ".txt", ".settings", ".yaml", ".yml"}
    files: list[Path] = []
    for d in dict.fromkeys(dirs):
        for depth_pat in ("*", "*/*", "*/*/*"):
            try:
                for f in d.glob(depth_pat):
                    if (f.suffix.lower() in exts and f.is_file() and f.stat().st_size < 512_000
                            and not f.name.lower().endswith((".deps.json", ".runtimeconfig.json"))):
                        files.append(f)
            except OSError:
                pass
            if len(files) > 300:
                break
    return files[:300]


def _doc_task(cfg):
    rc, out = _run_cmd(["schtasks", "/Query", "/TN", "SimWatch", "/XML"], 15)
    if rc != 0:
        return [(WARN, "scheduled task 'SimWatch'", "not found -> fix: run install_autostart.bat for start-at-sign-in")]
    try:
        return [evaluate_task(parse_task_xml(out))]
    except ET.ParseError as e:
        return [(WARN, "scheduled task 'SimWatch'", f"registered, but XML unreadable: {e}")]


def _doc_sniffer(cfg):
    ok, msg = sniffer_probe()
    if not ok and not _is_admin():
        return [(WARN, "sniffer raw socket", f"{msg} (expected when not elevated; the SimWatch task runs elevated "
                                              "- rerun doctor as Administrator to check for real)")]
    return [(PASS if ok else FAIL, "sniffer raw socket", msg)]


def _doc_firewall(cfg):
    progs = firewall_programs(cfg)
    paths = [os.path.expandvars(p) for ps in progs.values() for p in ps]
    rules = _firewall_rules(paths)
    if rules is None:
        return [(WARN, "firewall", "could not query rules (Get-NetFirewallApplicationFilter failed)")]
    return evaluate_firewall(rules, progs)


def _doc_bridge_lan(cfg):
    rules = _bridge_lan_rule_info()
    if rules is None:
        return [(WARN, "firewall: bridge LAN (phone)", "could not query rules (Get-NetFirewallRule failed)")]
    return [evaluate_bridge_lan_rule(bridge_lan_enabled(cfg), rules, int(bridge_config(cfg).get("port", 8765)))]


def _doc_gamechanger(cfg):
    a = _cfg_app(cfg, "integrator", "GameChanger.exe") or {}
    exe = a.get("exe")
    exists = bool(exe) and Path(exe).exists()
    return [evaluate_gamechanger_exe(exe, exists, exists and has_zone_identifier(exe),
                                     file_version(exe) if exists else None)]


def _doc_device(cfg):
    ip = (cfg.get("device") or {}).get("ip")
    if not ip:
        return [(WARN, "device adapter", "device.ip not configured")]
    rows = evaluate_adapter(_adapter_info(ip), ip)
    rc, out = _run_cmd(["ping", "-n", "2", "-w", "1000", ip], 10)
    rows.append((PASS, "device ping", f"{ip} replies") if _ping_ok(rc, out) else
                (WARN, "device ping", f"{ip} no reply (Launch Pro off/asleep, or adapter issue above)"))
    return rows


def parse_powercfg_a_hibernate(text: str) -> int | None:
    """`powercfg /a` -> 0 if it says hibernation is off/unavailable, 1 if Hibernate is listed as available, else None."""
    t = text or ""
    if re.search(r"Hibernation has not been enabled|Hibernation is not available", t, re.I):
        return 0
    avail = re.split(r"not available", t, maxsplit=1, flags=re.I)[0]
    return 1 if re.search(r"^\s*Hibernate\s*$", avail, re.I | re.M) else None


def _doc_power(cfg):
    _, scheme = _run_cmd(["powercfg", "/getactivescheme"], 10)
    q = lambda sub, setting: parse_powercfg_ac_index(_run_cmd(["powercfg", "/query", "SCHEME_CURRENT", sub, setting], 10)[1])
    hib = _reg_hklm_dword(r"SYSTEM\CurrentControlSet\Control\Power", "HibernateEnabled")
    if hib is None:
        hib = parse_powercfg_a_hibernate(_run_cmd(["powercfg", "/a"], 10)[1])
    return evaluate_power(
        scheme, q(*USB_SS), q("SUB_SLEEP", "STANDBYIDLE"), q(*PCIE_ASPM),
        hib,
        _reg_hklm_dword(r"SYSTEM\CurrentControlSet\Control\Session Manager\Power", "HiberbootEnabled"),
    )


def _doc_fsx_hold(cfg):
    a = _cfg_app(cfg, "fs_connector", "FSX Pro.exe")
    if not a:
        return []
    dev = cfg.get("device") or {}
    pids = {p.pid for p in find_procs(a.get("process") or "FSX Pro.exe")}
    try:
        sess = _find_device_tcp_session(pids, dev.get("ip"), _device_ports(dev)) if pids else None
    except (psutil.Error, OSError, TypeError, ValueError):
        sess = None
    if sess:
        ra = f"{sess.raddr.ip}:{sess.raddr.port}" if getattr(sess, "raddr", None) else "device"
        return [(FAIL, "FSX Pro device hold", f"FSX Pro holds {ra} - GameChanger can't connect "
                                              "-> fix: release_device.bat (or close FSX Pro)")]
    return [(PASS, "FSX Pro device hold", "not holding the Launch Pro" if pids else "FSX Pro not running")]


def _doc_kinovea(cfg):
    path = (cfg.get("video") or {}).get("kinovea_exe") if isinstance(cfg.get("video"), dict) else None
    exists = bool(path) and Path(path).exists()
    return [evaluate_kinovea(path, exists, file_version(path) if exists else None)]


def _doc_oc_target(cfg):
    exe = (_cfg_app(cfg, "integrator", "GameChanger.exe") or {}).get("exe")
    found = []
    for f in _gamechanger_settings_files(exe):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        found += [(str(f), h, p) for h, p in find_openconnect_targets(text)]
    return [evaluate_openconnect_targets(found)]


def disk_space_row(free_bytes: int, where: str = "C:") -> tuple[str, str, str]:
    """Doctor row for free disk space: swing clips at 260 fps, logs and shot files all need room."""
    gb = free_bytes / 1024 ** 3
    item = f"free disk space ({where})"
    fix = "-> fix: run `python simwatch.py space` to see what's using it, then delete or move files"
    if gb < 2:
        return (FAIL, item, f"{gb:.2f} GB free - Kinovea can't save clips, logs/shots may fail {fix}")
    if gb < 10:
        return (WARN, item, f"{gb:.1f} GB free - getting low {fix}")
    return (PASS, item, f"{gb:.0f} GB free")


def _doc_disk(cfg):
    import shutil
    drive = os.environ.get("SystemDrive", "C:")
    return [disk_space_row(shutil.disk_usage(drive + "\\").free, drive)]


def doctor_system_rows(cfg: dict) -> list[tuple[str, str, str]]:
    """Read-only Windows environment checks (each PASS/WARN/FAIL/INFO with a one-line fix). SKIP off Windows."""
    if not IS_WINDOWS:
        return [(SKIP, name, "Windows only") for name in DOCTOR_SYSTEM_CHECKS]
    rows: list[tuple[str, str, str]] = []
    for name, fn in zip(DOCTOR_SYSTEM_CHECKS, (_doc_task, _doc_sniffer, _doc_firewall, _doc_gamechanger, _doc_device,
                                               None, _doc_power, _doc_fsx_hold, _doc_kinovea, _doc_oc_target,
                                               _doc_bridge_lan)):
        if fn is None:  # "device ping" is produced by _doc_device
            continue
        try:
            rows.extend(fn(cfg))
        except Exception as e:  # a broken probe must never take down the whole report
            rows.append((WARN, name, f"check crashed: {type(e).__name__}: {e}"))
    try:
        rows.extend(_doc_disk(cfg))
    except Exception as e:
        rows.append((WARN, "free disk space", f"check crashed: {type(e).__name__}: {e}"))
    return rows


# --------------------------------------------------------------------------- discover --write-local

DISCOVER_TARGETS = {
    "gspro": ("GSPro.exe", r"^GSPro", [r"C:\GSProV1\Core\GSP\GSPro.exe"]),
    "gspro_connect": ("GSPconnect.exe", r"^GSPro", [r"C:\GSProV1\Core\GSPC\GSPconnect.exe"]),
    "fs_connector": ("FSX Pro.exe", r"FSX ?Pro", [r"%ProgramFiles(x86)%\FSX Pro\FSX Pro.exe",
                                                  r"%ProgramFiles%\FSX Pro\FSX Pro.exe"]),
    "integrator": ("GameChanger.exe", r"Game ?Changer", [
        r"C:\SimTools\GameChanger\GameChanger.exe", r"C:\SimTools\GameChanger*\GameChanger.exe",
        r"%ProgramFiles%\GameChanger*\GameChanger.exe", r"%ProgramFiles(x86)%\GameChanger*\GameChanger.exe",
        r"%LOCALAPPDATA%\Programs\GameChanger*\GameChanger.exe", r"%USERPROFILE%\Desktop\GameChanger*\GameChanger.exe",
        r"%USERPROFILE%\Downloads\GameChanger*\GameChanger.exe",
        r"%USERPROFILE%\Downloads\GameChanger*\*\GameChanger.exe"]),
    "video.kinovea_exe": ("Kinovea.exe", r"^Kinovea", [r"%ProgramFiles%\Kinovea\Kinovea.exe",
                                                       r"%LOCALAPPDATA%\Programs\Kinovea\Kinovea.exe",
                                                       r"%ProgramFiles%\Kinovea*\Kinovea.exe"]),
    "video.obs_exe": ("obs64.exe", r"^OBS Studio", [r"%ProgramFiles%\obs-studio\bin\64bit\obs64.exe"]),
}


def _registry_install_dirs(name_re: str) -> list[Path]:
    """InstallLocation / DisplayIcon folders of HKLM+HKCU Uninstall entries whose DisplayName matches."""
    try:
        import winreg
    except ImportError:
        return []
    out: list[Path] = []
    roots = [(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
             (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
             (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")]
    for hive, sub in roots:
        try:
            root = winreg.OpenKey(hive, sub)
        except OSError:
            continue
        with root:
            for i in range(winreg.QueryInfoKey(root)[0]):
                try:
                    with winreg.OpenKey(root, winreg.EnumKey(root, i)) as k:
                        def q(v):
                            try:
                                return str(winreg.QueryValueEx(k, v)[0] or "")
                            except OSError:
                                return ""
                        if not re.search(name_re, q("DisplayName"), re.I):
                            continue
                        for v in (q("InstallLocation"), q("DisplayIcon").split(",")[0].strip('"')):
                            if v:
                                p = Path(v)
                                out.append(p.parent if p.suffix.lower() == ".exe" else p)
                except OSError:
                    continue
    return out


def discover_exe_paths() -> dict[str, str]:
    """target -> exe path, from (1) running processes, (2) common install dirs, (3) Uninstall registry entries."""
    import glob as _glob
    found: dict[str, str] = {}
    running: dict[str, str] = {}
    for p in psutil.process_iter(["name", "exe"]):
        try:
            if p.info["name"] and p.info["exe"]:
                running.setdefault(p.info["name"].lower(), p.info["exe"])
        except psutil.Error:
            pass
    for target, (exe_name, reg_re, patterns) in DISCOVER_TARGETS.items():
        hit = running.get(exe_name.lower())
        if not hit:
            for pat in patterns:
                matches = sorted(_glob.glob(os.path.expandvars(pat)), reverse=True)
                if matches:
                    hit = matches[0]
                    break
        if not hit:
            for d in _registry_install_dirs(reg_re):
                for pat in (exe_name, f"*/{exe_name}", f"*/*/{exe_name}", f"*/*/*/{exe_name}"):
                    try:
                        m = next(iter(d.glob(pat)), None)
                    except OSError:
                        m = None
                    if m:
                        hit = str(m)
                        break
                if hit:
                    break
        if hit:
            found[target] = hit
    return found


def build_local_overlay(found: dict[str, str], cfg: dict | None = None) -> dict:
    """config.local.json content for discovered paths; skips paths identical to what `cfg` already has."""
    cfg = cfg or {}
    apps_by_key = {a.get("key"): a for a in cfg.get("apps") or [] if isinstance(a, dict)}
    video = cfg.get("video") if isinstance(cfg.get("video"), dict) else {}
    over: dict = {}
    for target, path in found.items():
        if target.startswith("video."):
            k = target.split(".", 1)[1]
            if _norm_win_path(video.get(k, "")) != _norm_win_path(path):
                over.setdefault("video", {})[k] = path
        elif _norm_win_path((apps_by_key.get(target) or {}).get("exe", "")) != _norm_win_path(path):
            over.setdefault("apps", []).append({"key": target, "exe": path})
    return over


def cmd_discover_write_local(config_path: Path) -> int:
    if not IS_WINDOWS:
        print("discover --write-local only works on Windows (it probes install folders and the registry).")
        return 1
    try:
        cfg, _ = read_config_layers(config_path)
    except (OSError, ValueError) as e:
        print(f"Cannot read {config_path}: {e}")
        return 1
    found = discover_exe_paths()
    print("Detected executables:")
    for target in DISCOVER_TARGETS:
        print(f"  {target:<18} {found.get(target, '(not found - set it by hand in config.local.json)')}")
    over = build_local_overlay(found, cfg)
    lp = local_config_path(config_path)
    if not over:
        print(f"\nNothing to change: {config_path.name}{' + ' + lp.name if lp.exists() else ''} already has these paths.")
        return 0
    existing = {}
    if lp.exists():
        try:
            existing = json.loads(lp.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"{lp} is unreadable ({e}); not overwriting it.")
            return 1
    merged = deep_merge_config(existing if isinstance(existing, dict) else {}, over)
    write_text_if_changed(lp, json.dumps(merged, indent=2) + "\n", backup=True)
    print(f"\nWrote {lp} (previous copy kept as {lp.name}.bak if it existed). Review it, then run `simwatch.py doctor`.")
    return 0


# --------------------------------------------------------------------------- harden

def harden_steps(ctx: dict) -> list[tuple[str, str, bool]]:
    """[(description, PowerShell command, needs_adapter)] that harden this PC for the Launch Pro link.
    ctx: adapter, device_ip, host_ip, programs {label: path}, ultimate_active, task_exists."""
    alias = ctx.get("adapter") or "<ADAPTER>"
    a = _psq(alias)
    dev = ctx.get("device_ip")
    host = ctx.get("host_ip") or HOST_LINK_IP
    if dev and host == dev:
        host = "169.254.6.2"
    steps: list[tuple[str, str, bool]] = []
    if dev:
        # New-NetIPAddress refuses a DHCP-enabled interface ("Inconsistent parameters PolicyStore
        # PersistentStore and Dhcp Enabled"), so DHCP must go off first - but if adding the static address
        # then fails, DHCP is switched back on and the step stops before removing anything, so the adapter
        # is never left with no address. Old addresses are removed only once the static one exists.
        steps.append((f"Static IP {host}/16 on '{alias}' (no ~60 s APIPA wait after a replug)",
                      f"if (-not (Get-NetIPAddress -InterfaceAlias {a} -AddressFamily IPv4 -IPAddress '{host}' "
                      f"-ErrorAction SilentlyContinue)) {{ "
                      f"Set-NetIPInterface -InterfaceAlias {a} -AddressFamily IPv4 -Dhcp Disabled -ErrorAction Stop; "
                      f"try {{ New-NetIPAddress -InterfaceAlias {a} -IPAddress {host} -PrefixLength 16 "
                      f"-ErrorAction Stop | Out-Null }} "
                      f"catch {{ Set-NetIPInterface -InterfaceAlias {a} -AddressFamily IPv4 -Dhcp Enabled "
                      f"-ErrorAction SilentlyContinue; throw }} }} "
                      f"else {{ Set-NetIPInterface -InterfaceAlias {a} -AddressFamily IPv4 -Dhcp Disabled }}; "
                      f"Get-NetIPAddress -InterfaceAlias {a} -AddressFamily IPv4 -ErrorAction SilentlyContinue | "
                      f"Where-Object {{ $_.IPAddress -ne '{host}' }} | Remove-NetIPAddress -Confirm:$false", True))
        steps.append((f"Persistent /32 route to the Launch Pro {dev} via '{alias}'",
                      f"Remove-NetRoute -DestinationPrefix '{dev}/32' -Confirm:$false -ErrorAction SilentlyContinue; "
                      f"New-NetRoute -DestinationPrefix '{dev}/32' -InterfaceAlias {a} -NextHop 0.0.0.0 -RouteMetric 1",
                      True))
    steps.append((f"Interface metric 5 on '{alias}'",
                  f"Set-NetIPInterface -InterfaceAlias {a} -AddressFamily IPv4 -AutomaticMetric Disabled -InterfaceMetric 5",
                  True))
    # Adapter-restarting steps (static IP above, power management here) must run BEFORE the profile steps:
    # a restarted direct link comes back as an 'Unidentified network', which Windows re-creates as Public.
    steps.append((f"Stop Windows powering off '{alias}' (adapter restarts briefly; also clears the Device Manager "
                  "'Allow the computer to turn off this device' checkbox, which some drivers e.g. Intel I219-V ignore "
                  "the cmdlet for)",
                  f"Disable-NetAdapterPowerManagement -Name {a}; "
                  f"$id = (Get-NetAdapter -Name {a}).PnPDeviceID; "
                  "if ($id) { Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable | "
                  "Where-Object { $_.InstanceName -like \"$id*\" } | Set-CimInstance -Property @{Enable=$false} }",
                  True))
    steps.append(("Unidentified networks default to Private (Network List Manager policy, same as secpol.msc > "
                  "Network List Manager Policies > Unidentified Networks > Location type: Private; survives "
                  "adapter restarts)",
                  f"New-Item -Path {_psq(NLM_UNIDENTIFIED_KEY)} -Force | Out-Null; "
                  f"New-ItemProperty -Path {_psq(NLM_UNIDENTIFIED_KEY)} -Name Category -PropertyType DWord -Value 1 "
                  "-Force | Out-Null; "
                  f"New-ItemProperty -Path {_psq(NLM_UNIDENTIFIED_KEY)} -Name CategoryReadOnly -PropertyType DWord "
                  "-Value 0 -Force | Out-Null", False))
    steps.append((f"Network profile Private on '{alias}' (after the adapter restarts above)",
                  f"Set-NetConnectionProfile -InterfaceAlias {a} -NetworkCategory Private", True))
    programs = ctx.get("programs") or {}
    for label, path in programs.items():
        # Remove + recreate (not "add if missing"), so an older, broader SimWatch rule is narrowed in place.
        name = _psq(f"SimWatch allow {label}")
        scope = firewall_remote_scope(label)
        steps.append((f"Firewall inbound Allow for {label} (remote {','.join(scope)} only)",
                      f"Get-NetFirewallRule -DisplayName {name} -ErrorAction SilentlyContinue | Remove-NetFirewallRule; "
                      f"New-NetFirewallRule -DisplayName {name} -Direction Inbound -Action Allow "
                      f"-Program {_psq(path)} -Profile Private,Domain "
                      f"-RemoteAddress {','.join(_psq(x) for x in scope)}", False))
    if ctx.get("bridge_lan"):
        port = int(ctx.get("bridge_port") or 8765)
        name = _psq(BRIDGE_LAN_FIREWALL_RULE)
        steps.append((f"Firewall inbound Allow TCP {port} for the drills hub on your phone (bridge.lan; Private "
                      "profile, same subnet only)",
                      f"Get-NetFirewallRule -DisplayName {name} -ErrorAction SilentlyContinue | Remove-NetFirewallRule; "
                      f"New-NetFirewallRule -DisplayName {name} -Direction Inbound -Action Allow -Protocol TCP "
                      f"-LocalPort {port} -Profile Private -RemoteAddress LocalSubnet", False))
    if programs:
        plist = ",".join(_psq(p) for p in programs.values())
        steps.append(("Remove firewall Block rules for those programs (created when a firewall prompt was cancelled)",
                      f"$p=@({plist}); Get-NetFirewallApplicationFilter | Where-Object "
                      "{ $p -contains [Environment]::ExpandEnvironmentVariables($_.Program) } | Get-NetFirewallRule | "
                      "Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule", False))
    if not ctx.get("ultimate_active"):
        steps.append(("Activate the High performance power plan (restores it if hidden)",
                      f"powercfg /setactive {HIGH_PERF_GUID}; if ($LASTEXITCODE -ne 0) "
                      f"{{ powercfg -duplicatescheme {HIGH_PERF_GUID} {HIGH_PERF_GUID}; powercfg /setactive {HIGH_PERF_GUID} }}",
                      False))
    steps.append(("USB selective suspend off (AC)",
                  f"powercfg /setacvalueindex SCHEME_CURRENT {USB_SS[0]} {USB_SS[1]} 0; powercfg /setactive SCHEME_CURRENT",
                  False))
    steps.append(("PCIe link state power management off (AC)",
                  f"powercfg /setacvalueindex SCHEME_CURRENT {PCIE_ASPM[0]} {PCIE_ASPM[1]} 0; "
                  "powercfg /setactive SCHEME_CURRENT", False))
    steps.append(("Never sleep on AC", "powercfg /change standby-timeout-ac 0", False))
    steps.append(("Hibernate + fast startup off",
                  "powercfg /hibernate off; New-ItemProperty -Path "
                  "'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power' -Name HiberbootEnabled "
                  "-PropertyType DWord -Value 0 -Force | Out-Null", False))
    if ctx.get("task_exists"):
        steps.append(("Scheduled task 'SimWatch': no time limit, runs on battery/UPS",
                      "$t = Get-ScheduledTask -TaskName 'SimWatch'; $s = $t.Settings; $s.ExecutionTimeLimit = 'PT0S'; "
                      "$s.DisallowStartIfOnBatteries = $false; $s.StopIfGoingOnBatteries = $false; "
                      "Set-ScheduledTask -TaskName 'SimWatch' -Settings $s", False))
    return steps


def _detect_device_adapter(device_ip: str | None) -> str | None:
    if not IS_WINDOWS:
        return None
    if device_ip:
        info = _adapter_info(device_ip)
        if info and info.get("Name") and str(info.get("Source") or "").startswith("169.254."):
            return info["Name"]
    # No guessing by description (RNDIS/USB): that can match a USB Ethernet/Wi-Fi dongle carrying the PC's
    # internet, and the static-IP step would strip its address. Undetected -> the user passes the name.
    return None


def harden_context(cfg: dict, adapter: str | None = None) -> dict:
    dev = cfg.get("device") if isinstance(cfg.get("device"), dict) else {}
    programs = dict(_python_exes())
    for label, paths in firewall_programs(cfg).items():
        if not label.startswith("python.exe"):
            programs[label] = paths[0]
    ctx = {"adapter": adapter or _detect_device_adapter(dev.get("ip")), "device_ip": dev.get("ip"),
           "host_ip": dev.get("host_ip"), "programs": programs, "ultimate_active": False, "task_exists": False,
           "bridge_lan": bridge_lan_enabled(cfg), "bridge_port": int(bridge_config(cfg).get("port", 8765))}
    if IS_WINDOWS:
        ctx["ultimate_active"] = parse_active_scheme(_run_cmd(["powercfg", "/getactivescheme"], 10)[1])[0] == ULTIMATE_GUID
        ctx["task_exists"] = _run_cmd(["schtasks", "/Query", "/TN", "SimWatch"], 15)[0] == 0
    return ctx


def cmd_harden(cfg: dict, apply: bool = False, adapter: str | None = None) -> int:
    ctx = harden_context(cfg, adapter)
    steps = harden_steps(ctx)
    no_adapter = not ctx.get("adapter")
    print(f"SimWatch hardening plan ({'APPLY' if apply else 'dry run - nothing is changed'})")
    print(f"  device adapter: {ctx.get('adapter') or '<not detected>'}   Launch Pro: {ctx.get('device_ip')}")
    if no_adapter:
        print("  Adapter not detected (Launch Pro off/unplugged?). Plug it in and rerun, or pass the name:\n"
              "    python simwatch.py harden \"Ethernet 3\"     (names: Get-NetAdapter)")
    for i, (desc, cmd, _) in enumerate(steps, 1):
        print(f"\n[{i}] {desc}\n    {cmd}")
    if not apply:
        if any(n for _, _, n in steps):
            print("\nNote: the adapter steps drop GameChanger's Launch Pro session; --apply offers to restart "
                  "GameChanger afterwards (or restart it yourself).")
        print("\nPaste these into an Administrator PowerShell, or run: python simwatch.py harden --apply (elevated).")
        return 0
    if not IS_WINDOWS:
        print("\n--apply only works on Windows.")
        return 1
    if not _is_admin():
        print("\nNot elevated. Open Start > type PowerShell > right-click > Run as administrator, then:\n"
              f"  cd \"{HERE}\"\n  \"{sys.executable}\" simwatch.py harden --apply")
        return 1
    failed = 0
    adapter_touched = False
    for i, (desc, cmd, needs_adapter) in enumerate(steps, 1):
        if needs_adapter and no_adapter:
            print(f"\n[{i}] SKIPPED (no adapter): {desc}")
            continue
        try:
            ans = input(f"\n[{i}/{len(steps)}] {desc}\n    {cmd}\n  Run it? [y]es / [n]o / [q]uit: ").strip().lower()
        except EOFError:
            ans = "q"
        if ans.startswith("q"):
            break
        if not ans.startswith("y"):
            LOG.info("harden step %d skipped: %s", i, desc)
            continue
        # Stop on the first error: PowerShell's exit code otherwise reflects only the last statement.
        rc, out = _ps("$ErrorActionPreference = 'Stop'; " + cmd, 120)
        LOG.info("harden step %d rc=%s: %s | %s", i, rc, desc, out.strip()[-500:])
        print(f"  {'OK' if rc == 0 else f'FAILED (rc {rc})'}" + (f": {out.strip()[-300:]}" if out.strip() else ""))
        failed += rc != 0
        adapter_touched |= needs_adapter
    if adapter_touched:
        harden_offer_integrator_restart(cfg)
    print(f"\nDone ({failed} failed; details in simwatch.log). Replug the Launch Pro, then run: python simwatch.py doctor")
    return 1 if failed else 0


def harden_offer_integrator_restart(cfg: dict, wait_sec: float = 30.0) -> bool | None:
    """After harden changed the device adapter, GameChanger keeps a dead Launch Pro session and doesn't reconnect.
    If it's running, offer to restart it (kill, wait for device sockets to clear, relaunch) and report device_tcp.
    None = not running/not configured or declined; else whether a device session came back."""
    app = (cfg.get("apps_by_key") or {}).get("integrator") or _cfg_app(cfg, "integrator", "GameChanger.exe")
    if not app or not app.get("process") or not find_procs(app["process"]):
        return None
    try:
        ans = input(f"\nThe adapter changed, so GameChanger has lost its Launch Pro session.\n"
                    f"  Restart GameChanger now? [y]es / [n]o: ").strip().lower()
    except EOFError:
        ans = "n"
    if not ans.startswith("y"):
        print("  Skipped - restart GameChanger yourself before hitting balls.")
        return None
    app = dict(app, key=app.get("key") or "integrator")
    kill_app(app)
    time.sleep(2)
    wait_device_sockets_clear(cfg, cfg_number((cfg.get("device") or {}).get("socket_clear_sec", 10), 10))
    launch_app(cfg, app, 45)
    run_cfg = dict(cfg, apps_by_key=dict(cfg.get("apps_by_key") or {}, **{app["key"]: app}))
    end = time.time() + wait_sec
    while True:
        ok, msg = check_device_tcp({"app": app["key"]}, run_cfg)
        if ok or time.time() >= end:
            break
        time.sleep(2)
    LOG.info("harden: GameChanger restarted; device_tcp %s: %s", "OK" if ok else "FAIL", msg)
    print(f"  device_tcp: {'OK' if ok else 'FAIL'} - {msg}")
    return ok


# --------------------------------------------------------------------------- main

STATUS_LOG_PATTERNS = ("passive shot monitor", "Shot bridge", "Shot ", "Kinovea", "ERROR", "WARNING", "All green",
                       "Video layout", "Hotkeys:")


def cmd_status(cfg: dict, tail: int = 15) -> int:
    """Print bridge /api/status, today's shot count and the interesting tail of simwatch.log.

    Exists so the rig can be checked with one shift-free command (remote-desktop sessions often drop Shift,
    which rules out URLs, pipes and parentheses at the prompt)."""
    import urllib.request
    bcfg = bridge_config(cfg)
    port = int(bcfg.get("port", 8765))
    url = f"http://127.0.0.1:{port}/api/status"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            print(f"Bridge {url}:")
            print(json.dumps(json.loads(r.read().decode("utf-8")), indent=2))
    except Exception as e:
        print(f"Bridge {url}: not reachable ({e})")
    raw = Path(str(bcfg.get("sessions_dir") or BRIDGE_DEFAULTS["sessions_dir"]))
    shots = (raw if raw.is_absolute() else HERE / raw) / time.strftime("%Y-%m-%d") / "shots.jsonl"
    try:
        n = sum(1 for line in shots.read_text(encoding="utf-8").splitlines() if line.strip())
        print(f"\nToday's shots: {n} in {shots}")
    except OSError:
        print(f"\nToday's shots: none yet ({shots} missing)")
    try:
        import shutil
        st, _item, msg = disk_space_row(shutil.disk_usage(HERE).free, str(HERE.anchor or HERE))
        print(f"Disk: {st} {msg}")
    except OSError:
        pass
    log = HERE / "simwatch.log"
    try:
        lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        lines = []
    hits = [l for l in lines if any(p in l for p in STATUS_LOG_PATTERNS)][-tail:]
    print(f"\nLast {len(hits)} notable lines of {log.name}:")
    for l in hits:
        print("  " + l)
    d = running_daemon()
    print("\nSimWatch daemon: " + (f"running (pid {d['pid']}, `{d['command']}`)" if d else "not running"))
    print("Practice video request (VIDEO_ON): " + ("ON - clear with: python simwatch.py video off"
                                                  if video_request_active() else "off"))
    if (cfg.get("video") or {}).get("enabled") or video_request_active():
        layout, src = current_video_layout(cfg)
        if layout:
            print(f"Video layout ({src}): {layout_summary(layout)}")
        else:
            print(f"Video layout: {video_layout_cfg(cfg).get('profile')} ({src})")
        print("Replay: " + replay_settings_text(cfg))
        vst = read_video_state()
        if video_state_live(vst):
            rep = vst.get("replay") or {}
            if rep:
                print(f"  running: mode {rep.get('mode')}, {rep.get('state')}"
                      + (f", comparing {rep.get('compare')}" if rep.get("compare") not in (None, "off") else ""))
            for f in (vst.get("hotkeys") or {}).get("failed", []):
                print("  " + hotkey_failure_message(f))
    if bridge_lan_enabled(cfg):
        url = bridge_phone_url(cfg)
        print(f"Phone URL (same Wi-Fi): {url or 'no home-network IPv4 address found'}")
    return 0


def print_ascii_qr(text: str) -> bool:
    """Print a scannable QR code if the optional `qrcode` package is installed (pip install qrcode)."""
    try:
        import qrcode  # type: ignore
    except ImportError:
        return False
    try:
        qr = qrcode.QRCode(border=2)
        qr.add_data(text)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        return True
    except Exception as e:
        LOG.debug("QR print failed: %s", e)
        return False


def cmd_phone(cfg: dict) -> int:
    """Print the drills-hub URL (with pairing token) for a phone on the same Wi-Fi."""
    if not bridge_lan_enabled(cfg):
        print("Phone access is off. To turn it on:\n"
              "  1. In config.local.json (or config.json) set:  \"bridge\": {\"lan\": true}\n"
              "  2. Restart SimWatch:  python simwatch.py stop   then run run_simwatch.bat (or reboot)\n"
              "  3. Firewall rule (Administrator):  python simwatch.py harden --apply\n"
              "  4. Run  python simwatch.py phone  again for the URL.")
        return 1
    url = bridge_phone_url(cfg)
    if not url:
        print("bridge.lan is on, but no home-network IPv4 address (or pairing token) was found. "
              "Is the PC on Wi-Fi/Ethernet?")
        return 1
    print("Open this on your phone (same Wi-Fi). The token is remembered in a cookie after the first visit:\n")
    print(f"  {url}\n")
    others = lan_ipv4_candidates()[1:]
    if others:
        print("If that does not load, try the same URL with: " + ", ".join(others))
    if not print_ascii_qr(url):
        print("(For a scannable QR code here: pip install qrcode)")
    print(f"\nRevoke every paired phone: delete {BRIDGE_TOKEN_PATH.name} and restart SimWatch.")
    return 0


CLIP_READY_LOG = HERE / "logs" / "clip-ready.log"
CLIP_READY_LOG_MAX_BYTES = 1_000_000


def clip_ready_log_handler(path: Path | None = None, max_bytes: int = CLIP_READY_LOG_MAX_BYTES) -> logging.Handler:
    """clip-ready's own log file. It must not share simwatch.log: two processes each running a
    RotatingFileHandler on one file collide on Windows (PermissionError on rollover). No in-process
    rotation either (DTL + FO runs overlap): an oversized file is rolled once, best effort, at startup."""
    path = path or CLIP_READY_LOG
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if path.stat().st_size > max_bytes:
            os.replace(path, path.with_name(path.name + ".1"))
    except OSError:
        pass  # missing, or the other angle's run has it open: just keep appending
    return logging.FileHandler(path, encoding="utf-8")


def _dir_size(path: Path, budget: list) -> int:
    """Total bytes under `path` (no symlinks/junctions; unreadable entries skipped). `budget` = [max entries]."""
    total = 0
    stack = [path]
    while stack:
        cur = stack.pop()
        try:
            with os.scandir(cur) as it:
                for e in it:
                    budget[0] -= 1
                    if budget[0] < 0:
                        return total
                    try:
                        if e.is_symlink():
                            continue
                        if e.is_dir(follow_symlinks=False):
                            # Skip Windows junctions/reparse points (e.g. "Application Data") to avoid loops.
                            st = e.stat(follow_symlinks=False)
                            if getattr(st, "st_file_attributes", 0) & 0x400:
                                continue
                            stack.append(Path(e.path))
                        else:
                            total += e.stat(follow_symlinks=False).st_size
                    except OSError:
                        continue
        except OSError:
            continue
    return total


def _gb(n: float) -> str:
    return f"{n / 1024 ** 3:7.1f} GB"


def cmd_space(cfg: dict, top: int = 15, folder: str | None = None) -> int:
    """`simwatch.py space`: free disk space plus the biggest folders in the places that usually fill a sim PC
    (swing captures, Kinovea, the user profile, GSPro, Program Files). Shift-free, read-only."""
    import shutil
    drive = Path(os.environ.get("SystemDrive", "C:") + "\\") if os.name == "nt" else Path("/")
    try:
        du = shutil.disk_usage(drive)
        print(f"{drive}  used {_gb(du.used).strip()}  free {_gb(du.free).strip()}  of {_gb(du.total).strip()}")
    except OSError as e:
        print(f"could not read disk usage for {drive}: {e}")
    if folder:  # `simwatch.py space <folder>`: size each child of that folder (files too), biggest first
        base = Path(folder).expanduser()
        rows_f: list[tuple[int, str]] = []
        try:
            entries = list(os.scandir(base))
        except OSError as e:
            print(f"cannot read {base}: {e}")
            return 1
        print(f"Scanning {base} (read-only)...")
        for e in entries:
            try:
                size = (_dir_size(Path(e.path), [3_000_000]) if e.is_dir(follow_symlinks=False)
                        else e.stat(follow_symlinks=False).st_size)
            except OSError:
                continue
            rows_f.append((size, e.name + ("\\" if e.is_dir(follow_symlinks=False) else "")))
        rows_f.sort(reverse=True)
        print(f"\nBiggest items in {base} (top {top}):")
        for size, name in rows_f[:top]:
            print(f"  {_gb(size)}  {name}")
        return 0
    home = Path.home()
    roots = [HERE / "Swings", kinovea_capture_root(cfg), *_read_kinovea_capture_dirs()]
    groups = [home, home / "AppData" / "Local", home / "AppData" / "Roaming", home / "OneDrive",
              Path(os.environ.get("ProgramData", "C:\\ProgramData")), Path("C:\\GSProV1"),
              Path(os.environ.get("ProgramFiles", "C:\\Program Files")),
              Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")), Path("C:\\Windows\\Temp"),
              home / "AppData" / "Local" / "Temp", Path("C:\\$Recycle.Bin")]
    rows: list[tuple[int, Path]] = []
    seen: set[str] = set()
    print("Scanning (read-only, can take a minute or two)...")
    for r in roots:
        if r.exists() and str(r).lower() not in seen:
            seen.add(str(r).lower())
            rows.append((_dir_size(r, [3_000_000]), r))
    for g in groups:
        try:
            children = [Path(e.path) for e in os.scandir(g) if e.is_dir(follow_symlinks=False)]
        except OSError:
            continue
        for c in children:
            key = str(c).lower()
            if key in seen or any(key == str(x).lower() for x in groups):
                continue  # don't double count a folder listed as its own group
            seen.add(key)
            rows.append((_dir_size(c, [3_000_000]), c))
    rows.sort(key=lambda t: t[0], reverse=True)
    print(f"\nBiggest folders (top {top}):")
    for size, path in rows[:top]:
        print(f"  {_gb(size)}  {path}")
    print("\nNothing was deleted. Free space by removing what you don't need (or move swing captures to another drive).")
    return 0


def _configure_logging(command: str | None = None) -> None:
    handlers: list[logging.Handler] = []
    if sys.stderr is not None:  # pythonw.exe (clip-ready from Kinovea) has no console
        handlers.append(logging.StreamHandler())
    try:
        if command == "clip-ready":
            handlers.append(clip_ready_log_handler())
        else:
            handlers.append(
                RotatingFileHandler(HERE / "simwatch.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
            )
    except OSError:
        pass
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(threadName)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
    )

    def _thread_excepthook(args):
        if args.exc_type is SystemExit:
            return
        LOG.error("Unhandled exception in thread %s", getattr(args.thread, "name", "?"),
                  exc_info=(args.exc_type, args.exc_value, args.exc_traceback))

    threading.excepthook = _thread_excepthook


def main() -> None:
    ap = argparse.ArgumentParser(description="Golf sim connection watchdog & Kinovea/OBS swing controller")
    ap.add_argument(
        "command",
        choices=[
            "discover", "dump", "calibrate", "check", "recover", "watch", "startup", "stop", "restart",
            "displays", "reconnect", "release-device",
            "video", "bookmark", "reference", "obs-setup", "hotkeys", "drills", "lines", "save-lines",
            "doctor", "bridge", "harden", "clip-ready", "status", "space", "phone", "shotlab", "keys",
        ],
    )
    ap.add_argument("arg", nargs="?")
    ap.add_argument("arg2", nargs="?", help="clip-ready: camera angle/alias (DTL or FO)")
    ap.add_argument("--config", default=str(HERE / "config.json"))
    ap.add_argument("--demo", action="store_true", help="bridge: emit a synthetic shot every few seconds (no rig needed)")
    ap.add_argument("--demo-interval", type=float, default=4.0, help="bridge --demo: seconds between synthetic shots")
    ap.add_argument("--port", type=int, default=None, help="bridge: override bridge.port from config.json")
    ap.add_argument("--write-local", action="store_true",
                    help="discover: detect app exe paths and write them to config.local.json")
    ap.add_argument("--apply", action="store_true",
                    help="harden: run the commands (Administrator, asks before each); default is a dry run")
    a = ap.parse_args()

    _configure_logging(a.command)

    if a.command == "clip-ready":  # Kinovea post-recording command: light, never fails (exit 0)
        sys.exit(cmd_clip_ready(Path(a.config), a.arg, a.arg2))
    if a.command == "restart":
        sys.exit(cmd_restart())
    if a.command == "stop":
        stopped = request_stop()
        print(f"Stopped {stopped} running SimWatch background instance(s).")
        return
    if a.command == "drills":
        drills_html = HERE / "drills" / "index.html"
        if not drills_html.exists():
            sys.exit(f"Drills page not found at {drills_html}")
        os.startfile(str(drills_html))
        return
    if a.command == "doctor":
        sys.exit(run_doctor(Path(a.config)))
    if a.command == "discover":
        if a.write_local:
            sys.exit(cmd_discover_write_local(Path(a.config)))
        return discover()
    if a.command == "harden":
        sys.exit(cmd_harden(load_config(Path(a.config), command="harden"), apply=a.apply, adapter=a.arg))
    if a.command == "dump":
        return dump(a.arg or ".*")
    if a.command == "calibrate":
        return calibrate()

    cfg = load_config(Path(a.config), command=a.command)
    if a.command == "status":
        sys.exit(cmd_status(cfg))
    if a.command == "space":
        sys.exit(cmd_space(cfg, folder=a.arg))
    if a.command == "phone":
        sys.exit(cmd_phone(cfg))
    if a.command == "keys":
        sys.exit(cmd_keys(cfg, a.arg))
    if a.command == "bridge":
        return cmd_bridge(cfg, demo=a.demo, demo_interval=a.demo_interval, port=a.port)
    if a.command == "shotlab":
        # Open ShotLab now (or focus the running one: ShotLab is single-instance). The watchdog adopts it.
        sys.exit(0 if launch_shotlab(cfg, activate=True) else 1)
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
        write_pause("Paused by simwatch reconnect while FSX Pro connects.")
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
        sys.exit(cmd_video(cfg, a.arg))
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
        if running_watchdog_status() is not None:  # read-only: never stop the live watchdog for this
            print("\nSimWatch is running: press Alt+H (or Ctrl+Alt+H) to show the on-screen cheat sheet.")
            return
        mgr = SwingSessionManager(cfg)
        mgr.hotkeys.hud_seconds = 0  # stay up until Ctrl+C
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
