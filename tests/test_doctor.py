"""Pure-logic tests for config.local.json overlay, doctor parsers/evaluators and `harden` command generation."""
import json

import pytest

import simwatch as sw
from conftest import ROOT


# ------------------------------------------------------------------ config overlay

def test_deep_merge_dicts_and_apps_by_key():
    base = {"interval_sec": 5, "device": {"ip": "169.254.6.44", "port": 9970},
            "apps": [{"key": "integrator", "exe": "C:\\Downloads\\GC.exe", "process": "GameChanger.exe"},
                     {"key": "gspro", "exe": "C:\\GSPro.exe"}],
            "checks": [{"name": "a"}, {"name": "b"}]}
    over = {"device": {"ip": "169.254.9.9"},
            "apps": [{"key": "integrator", "exe": "C:\\SimTools\\GameChanger\\GameChanger.exe"},
                     {"key": "extra", "exe": "X.exe"}],
            "checks": [{"name": "only"}]}
    out = sw.deep_merge_config(base, over)
    assert out["device"] == {"ip": "169.254.9.9", "port": 9970}
    gc = out["apps"][0]
    assert gc["exe"].endswith("SimTools\\GameChanger\\GameChanger.exe") and gc["process"] == "GameChanger.exe"
    assert out["apps"][1] == {"key": "gspro", "exe": "C:\\GSPro.exe"}
    assert out["apps"][2]["key"] == "extra"
    assert out["checks"] == [{"name": "only"}]  # non-keyed lists replace
    assert base["apps"][0]["exe"] == "C:\\Downloads\\GC.exe"  # inputs untouched


def test_load_config_applies_local_overlay(tmp_path, real_cfg):
    (tmp_path / "config.json").write_text(json.dumps(real_cfg), encoding="utf-8")
    (tmp_path / "config.local.json").write_text(json.dumps(
        {"apps": [{"key": "integrator", "exe": "C:\\SimTools\\GameChanger\\GameChanger.exe"}]}), encoding="utf-8")
    cfg = sw.load_config(tmp_path / "config.json", command="check")
    assert cfg["apps_by_key"]["integrator"]["exe"] == "C:\\SimTools\\GameChanger\\GameChanger.exe"
    assert cfg["apps_by_key"]["integrator"]["process"] == "GameChanger.exe"


def test_load_config_bad_local_overlay(tmp_path, real_cfg):
    (tmp_path / "config.json").write_text(json.dumps(real_cfg), encoding="utf-8")
    (tmp_path / "config.local.json").write_text("{nope", encoding="utf-8")
    with pytest.raises(SystemExit, match="config.local.json"):
        sw.load_config(tmp_path / "config.json")
    rows = sw.doctor_report(tmp_path / "config.json")
    assert any(r[0] == sw.FAIL and r[1] == "config.local.json" for r in rows)


def test_local_config_path_and_example_is_valid():
    assert sw.local_config_path(ROOT / "config.json").name == "config.local.json"
    ex = json.loads((ROOT / "config.local.example.json").read_text(encoding="utf-8"))
    merged = sw.deep_merge_config(json.loads((ROOT / "config.json").read_text(encoding="utf-8")), ex)
    assert not [m for s, m in sw.validate_config(merged, check_paths=False) if s == "error"]


def test_build_local_overlay_skips_identical():
    cfg = {"apps": [{"key": "gspro", "exe": "C:\\GSProV1\\Core\\GSP\\GSPro.exe"}],
           "video": {"kinovea_exe": "C:\\Program Files\\Kinovea\\Kinovea.exe"}}
    over = sw.build_local_overlay({"gspro": "c:\\gsprov1\\core\\gsp\\GSPro.exe",
                                   "integrator": "C:\\SimTools\\GameChanger\\GameChanger.exe",
                                   "video.kinovea_exe": "D:\\Kinovea\\Kinovea.exe"}, cfg)
    assert over == {"apps": [{"key": "integrator", "exe": "C:\\SimTools\\GameChanger\\GameChanger.exe"}],
                    "video": {"kinovea_exe": "D:\\Kinovea\\Kinovea.exe"}}


# ------------------------------------------------------------------ scheduled task XML

TASK_XML = """<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Principals><Principal id="Author"><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <DisallowStartIfOnBatteries>{dis}</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>{stop}</StopIfGoingOnBatteries>
    {limit}
    <Enabled>true</Enabled>
  </Settings>
</Task>"""


def test_task_xml_good():
    info = sw.parse_task_xml(TASK_XML.format(dis="false", stop="false",
                                             limit="<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>"))
    assert info["execution_time_limit"] == "PT0S" and not info["disallow_on_batteries"]
    assert sw.evaluate_task(info)[0] == sw.PASS


def test_task_xml_defaults_are_flagged():
    info = sw.parse_task_xml(TASK_XML.format(dis="true", stop="true", limit=""))
    assert info["execution_time_limit"] == "PT72H"
    status, _, detail = sw.evaluate_task(info)
    assert status == sw.WARN and "PT72H" in detail and "AC-only" in detail


# ------------------------------------------------------------------ GameChanger location / versions

@pytest.mark.parametrize("path,issue", [
    (r"C:\Users\finch\Downloads\GameChanger_v2.1\GameChanger.exe", "under Downloads"),
    (r"C:\Users\finch\AppData\Local\Temp\gc\GameChanger.exe", "under a Temp folder"),
    (r"C:\SimTools\GameChanger\GameChanger.exe", None),
])
def test_exe_location_issue(path, issue):
    assert sw.exe_location_issue(path) == issue


def test_evaluate_gamechanger_exe():
    ok = sw.evaluate_gamechanger_exe(r"C:\SimTools\GameChanger\GameChanger.exe", True, False, "2.1.0.0")
    assert ok[0] == sw.PASS and "v2.1.0.0" in ok[2]
    zoned = sw.evaluate_gamechanger_exe(r"C:\SimTools\GameChanger\GameChanger.exe", True, True, None)
    assert zoned[0] == sw.WARN and "Unblock-File" in zoned[2]
    dl = sw.evaluate_gamechanger_exe(r"C:\Users\x\Downloads\GC\GameChanger.exe", True, False, "2.1")
    assert dl[0] == sw.WARN and "C:\\SimTools\\GameChanger" in dl[2]
    assert sw.evaluate_gamechanger_exe(r"C:\nope.exe", False, False, None)[0] == sw.FAIL


def test_zone_identifier_absent_off_windows(tmp_path):
    f = tmp_path / "x.exe"
    f.write_bytes(b"")
    assert sw.has_zone_identifier(f) is False


def test_kinovea_version_gate():
    assert sw.evaluate_kinovea("K.exe", True, "2023.1.2.0")[0] == sw.WARN
    assert sw.evaluate_kinovea("K.exe", True, "0.9.5.0")[0] == sw.WARN
    assert sw.evaluate_kinovea("K.exe", True, "2025.1.0.0")[0] == sw.PASS
    assert sw.evaluate_kinovea("K.exe", False, None)[0] == sw.WARN


# ------------------------------------------------------------------ powercfg

def test_powercfg_parsing():
    assert sw.parse_powercfg_ac_index("    Current AC Power Setting Index: 0x00000001\n"
                                      "    Current DC Power Setting Index: 0x00000000") == 1
    assert sw.parse_powercfg_ac_index("garbage") is None
    guid, name = sw.parse_active_scheme("Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)")
    assert guid == sw.HIGH_PERF_GUID and name == "High performance"
    assert sw.is_performance_scheme(*sw.parse_active_scheme(
        "Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)")) is False


def test_evaluate_power():
    good = sw.evaluate_power(f"GUID: {sw.ULTIMATE_GUID}  (Ultimate Performance)", 0, 0, 0, 0, 0)
    assert {r[0] for r in good} == {sw.PASS}
    bad = sw.evaluate_power("GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)", 1, 1800, 2, 1, 1)
    assert all(r[0] == sw.WARN for r in bad)
    assert any("30 min" in r[2] for r in bad)


# ------------------------------------------------------------------ firewall / adapter / openconnect

def test_evaluate_firewall():
    progs = {"python.exe (sniffer)": [r"C:\Py\python.exe"], "GameChanger.exe": [r"C:\SimTools\GC\GameChanger.exe"],
             "GSPconnect.exe": [r"C:\GSProV1\Core\GSPC\GSPconnect.exe"]}
    rules = [{"Program": r"c:\py\python.exe", "Name": "py", "Direction": "Inbound", "Action": "Allow", "Enabled": "True"},
             {"Program": r"C:\SimTools\GC\GameChanger.exe", "Name": "TCP Query User", "Direction": "Inbound",
              "Action": "Block", "Enabled": "True"},
             {"Program": r"C:\GSProV1\Core\GSPC\GSPconnect.exe", "Name": "off", "Direction": "Inbound",
              "Action": "Allow", "Enabled": "False"}]
    rows = {r[1]: r for r in sw.evaluate_firewall(rules, progs)}
    assert rows["firewall: python.exe (sniffer)"][0] == sw.PASS
    assert rows["firewall: GameChanger.exe"][0] == sw.FAIL and "TCP Query User" in rows["firewall: GameChanger.exe"][2]
    assert rows["firewall: GSPconnect.exe"][0] == sw.WARN


def test_evaluate_adapter():
    info = {"Name": "Ethernet 3", "Desc": "Remote NDIS", "Status": "Up", "Source": "169.254.6.1", "Dhcp": "Disabled",
            "Metric": 5, "Profile": "Private", "AllowSleep": "Disabled", "Route32": True}
    assert {r[0] for r in sw.evaluate_adapter(info, "169.254.6.44")} == {sw.PASS}
    worse = dict(info, Dhcp="Enabled", Metric=25, Profile="Public", AllowSleep="Enabled", Route32=False)
    assert [r[0] for r in sw.evaluate_adapter(worse, "169.254.6.44")][1:] == [sw.WARN] * 4
    assert sw.evaluate_adapter(dict(info, Status="Disconnected"), "x")[0][0] == sw.FAIL
    assert sw.evaluate_adapter(dict(info, Source="192.168.1.20"), "x")[0][0] == sw.WARN
    assert sw.evaluate_adapter(None, "x")[0][0] == sw.WARN


def test_openconnect_targets():
    assert sw.find_openconnect_targets('{"OpenConnectHost": "127.0.0.1", "OpenConnectPort": 921}') == [("127.0.0.1", 921)]
    assert sw.find_openconnect_targets("target=localhost:921") == [("localhost", 921)]
    assert sw.find_openconnect_targets("server=127.0.0.1:9050") == []
    assert sw.evaluate_openconnect_targets([("a.json", "127.0.0.1", 921)])[0] == sw.PASS
    assert sw.evaluate_openconnect_targets([("a.json", "localhost", 921)])[0] == sw.WARN
    assert sw.evaluate_openconnect_targets([])[0] == sw.INFO


def test_pause_file_row():
    assert sw.pause_file_row(None) is None
    assert "stale" in sw.pause_file_row(5 * 3600, 4)[2]
    assert "stale" not in sw.pause_file_row(60, 4)[2]
    assert "stale" not in sw.pause_file_row(10 * 3600, 0)[2]  # 0 = never stale (matches pause_active)
    assert "stale" in sw.pause_file_row(3 * 3600, 2)[2]


def test_system_rows_skip_off_windows(monkeypatch, real_cfg):
    monkeypatch.setattr(sw, "IS_WINDOWS", False)
    rows = sw.doctor_system_rows(real_cfg)
    assert rows and all(r[0] == sw.SKIP for r in rows)


def test_system_rows_survive_crashing_probe(monkeypatch, real_cfg):
    monkeypatch.setattr(sw, "IS_WINDOWS", True)
    for name in ("_doc_task", "_doc_sniffer", "_doc_firewall", "_doc_gamechanger", "_doc_device",
                 "_doc_power", "_doc_fsx_hold", "_doc_kinovea", "_doc_oc_target"):
        monkeypatch.setattr(sw, name, lambda cfg: (_ for _ in ()).throw(RuntimeError("boom")))
    rows = sw.doctor_system_rows(real_cfg)
    assert rows and all(r[0] == sw.WARN and "boom" in r[2] for r in rows)


def test_run_cmd_handles_missing_binary():
    rc, out = sw._run_cmd(["definitely-not-a-real-binary-xyz"], 5)
    assert rc == -1 and out


# ------------------------------------------------------------------ harden

def _ctx(**kw):
    ctx = {"adapter": "Ethernet 3", "device_ip": "169.254.6.44", "host_ip": None,
           "programs": {"python.exe (base)": r"C:\Py311\python.exe",
                        "GameChanger.exe": r"C:\SimTools\GameChanger\GameChanger.exe"},
           "ultimate_active": False, "task_exists": True}
    ctx.update(kw)
    return ctx


def test_harden_steps_sample_adapter():
    steps = sw.harden_steps(_ctx())
    cmds = "\n".join(c for _, c, _ in steps)
    assert "New-NetIPAddress -InterfaceAlias 'Ethernet 3' -IPAddress 169.254.6.1 -PrefixLength 16" in cmds
    assert "New-NetRoute -DestinationPrefix '169.254.6.44/32' -InterfaceAlias 'Ethernet 3'" in cmds
    assert "-InterfaceMetric 5" in cmds and "-NetworkCategory Private" in cmds
    assert "Disable-NetAdapterPowerManagement -Name 'Ethernet 3'" in cmds
    assert "-Program 'C:\\SimTools\\GameChanger\\GameChanger.exe'" in cmds
    assert "-Program 'C:\\Py311\\python.exe'" in cmds
    assert "Where-Object { $_.Action -eq 'Block' } | Remove-NetFirewallRule" in cmds
    assert f"powercfg /setactive {sw.HIGH_PERF_GUID}" in cmds
    assert f"{sw.USB_SS[1]} 0" in cmds and f"{sw.PCIE_ASPM[1]} 0" in cmds
    assert "standby-timeout-ac 0" in cmds and "powercfg /hibernate off" in cmds
    assert "ExecutionTimeLimit = 'PT0S'" in cmds
    assert all(n for _, c, n in steps if "'Ethernet 3'" in c)


def test_harden_steps_variants():
    cmds = "\n".join(c for _, c, _ in sw.harden_steps(_ctx(adapter="Bob's NIC", ultimate_active=True,
                                                            task_exists=False, host_ip="169.254.6.44")))
    assert "'Bob''s NIC'" in cmds  # PowerShell quote escaping
    assert "duplicatescheme" not in cmds  # don't downgrade an active Ultimate plan
    assert "Set-ScheduledTask" not in cmds
    assert "-IPAddress 169.254.6.2" in cmds  # never collide with the device IP
    assert "<ADAPTER>" in "\n".join(c for _, c, _ in sw.harden_steps(_ctx(adapter=None)))


def test_cmd_harden_dry_run_off_windows(monkeypatch, capsys, real_cfg):
    monkeypatch.setattr(sw, "IS_WINDOWS", False)
    assert sw.cmd_harden(real_cfg, apply=False, adapter="Ethernet 3") == 0
    out = capsys.readouterr().out
    assert "dry run" in out and "Ethernet 3" in out
    assert sw.cmd_harden(real_cfg, apply=True, adapter="Ethernet 3") == 1
