"""`simwatch status`: shift-free rig check (bridge unreachable path, shot count, log filtering)."""
import simwatch as sw


def test_status_reports_unreachable_bridge_shots_and_log(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(sw, "HERE", tmp_path)
    day = tmp_path / "S" / sw.time.strftime("%Y-%m-%d")
    day.mkdir(parents=True)
    (day / "shots.jsonl").write_text('{"n":1}\n{"n":2}\n\n', encoding="utf-8")
    (tmp_path / "simwatch.log").write_text(
        "x INFO noise\nx INFO OpenConnect (:921) passive shot monitor active\nx WARNING boom\n", encoding="utf-8")
    cfg = {"bridge": {"port": 1, "sessions_dir": "S"}}
    assert sw.cmd_status(cfg) == 0
    out = capsys.readouterr().out
    assert "not reachable" in out
    assert "Today's shots: 2" in out
    assert "passive shot monitor active" in out and "boom" in out and "noise" not in out
