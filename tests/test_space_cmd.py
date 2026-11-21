"""`simwatch.py space`: read-only folder sizing."""
import simwatch as sw


def test_dir_size_counts_files_recursively(tmp_path):
    (tmp_path / "a").mkdir()
    (tmp_path / "a" / "x.bin").write_bytes(b"0" * 1000)
    (tmp_path / "y.bin").write_bytes(b"0" * 24)
    assert sw._dir_size(tmp_path, [1000]) == 1024


def test_space_lists_biggest_folder_first(tmp_path, monkeypatch, capsys):
    home = tmp_path / "home"
    (home / "Videos").mkdir(parents=True)
    (home / "Videos" / "big.mp4").write_bytes(b"0" * 5000)
    (home / "Docs").mkdir()
    (home / "Docs" / "small.txt").write_bytes(b"0" * 10)
    monkeypatch.setattr(sw.Path, "home", classmethod(lambda cls: home))
    monkeypatch.setattr(sw, "HERE", tmp_path / "repo")
    monkeypatch.setattr(sw, "_read_kinovea_capture_dirs", lambda: [])
    monkeypatch.setattr(sw, "kinovea_capture_root", lambda cfg: tmp_path / "caps")
    assert sw.cmd_space({}) == 0
    out = capsys.readouterr().out
    assert out.index("Videos") < out.index("Docs") and "Nothing was deleted" in out


def test_disk_space_row_thresholds():
    assert sw.disk_space_row(int(0.05 * 1024 ** 3))[0] == sw.FAIL
    assert sw.disk_space_row(5 * 1024 ** 3)[0] == sw.WARN
    assert sw.disk_space_row(50 * 1024 ** 3)[0] == sw.PASS
