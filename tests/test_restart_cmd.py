"""`simwatch.py restart`: stop, end a task stuck in Running, start, wait for the daemon."""
import simwatch as sw


def _setup(monkeypatch, task_states, daemon_after_run=True):
    calls = []
    states = list(task_states)
    started = {"v": False}

    def fake_run(args, timeout=20):
        calls.append(args[1])
        if args[1] == "/Query":
            st = states.pop(0) if states else "Ready"
            return 0, f'"\\SimWatch","N/A","{st}"\n'
        if args[1] == "/Run":
            started["v"] = True
        return 0, ""

    monkeypatch.setattr(sw, "_run_cmd", fake_run)
    monkeypatch.setattr(sw, "request_stop", lambda: 1)
    monkeypatch.setattr(sw.time, "sleep", lambda s: None)
    monkeypatch.setattr(sw, "read_daemon_info",
                        lambda: {"pid": 4242, "command": "startup"} if started["v"] and daemon_after_run else None)
    monkeypatch.setattr(sw.psutil, "pid_exists", lambda pid: True)
    return calls


def test_restart_ends_task_stuck_in_running(monkeypatch):
    calls = _setup(monkeypatch, ["Running"] * 100)
    assert sw.cmd_restart(wait_task_sec=0) == 0
    assert "/End" in calls and calls.index("/End") < calls.index("/Run")


def test_restart_skips_end_when_task_already_stopped(monkeypatch):
    calls = _setup(monkeypatch, ["Ready"])
    assert sw.cmd_restart() == 0
    assert "/End" not in calls and "/Run" in calls


def test_restart_reports_failure_when_daemon_never_comes_up(monkeypatch):
    _setup(monkeypatch, ["Ready"], daemon_after_run=False)
    assert sw.cmd_restart(wait_start_sec=0) == 1
