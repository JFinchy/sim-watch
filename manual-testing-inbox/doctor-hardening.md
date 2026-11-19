# Doctor system checks, `harden`, config.local.json

Branch: `master (working tree)`
Files changed: `simwatch.py` (load_config overlay, doctor system checks, `discover --write-local`, `harden`), `setup.bat`, `SETUP.md`, `.gitignore`, `config.local.example.json` (new), `tests/test_doctor.py` (new)

## What to verify

None of the PowerShell, powercfg, schtasks or raw-socket probes have run on Windows yet. They were written on macOS
against stubbed output. `harden --apply` changes network, firewall and power settings, so a human has to confirm the
commands work and don't break the Launch Pro link.

## Steps

1. Non-admin terminal: `.venv\Scripts\python.exe simwatch.py doctor`. Expect `sniffer raw socket` FAIL ("run as
   Administrator") and exit code 1 (`echo %errorlevel%`).
2. Admin terminal: run `doctor` again. Expect the sniffer to PASS. Check that the GameChanger row reports a version
   and WARNs about Downloads. Check the firewall, device adapter, power and scheduled-task rows, and that each
   non-PASS row has a fix hint. The full run should take under ~60 s.
3. Make a copy of the current settings, then `simwatch.py discover --write-local`. Expect `config.local.json` with the
   GameChanger path. Run `simwatch.py check` and confirm the merged paths are used.
4. Put invalid JSON in `config.local.json` and confirm `check` exits with "Local config overlay error". Restore it.
5. `simwatch.py harden` (dry run). Confirm it detected the Launch Pro adapter and the commands look right.
6. Admin: `simwatch.py harden --apply`. Answer `y` step by step and note any FAILED steps. Then replug the Launch Pro:
   GameChanger should reconnect and `ping 169.254.6.44` should reply. The adapter should show a static 169.254.6.1.
7. Run `doctor` again. The adapter, power and firewall rows should PASS.
8. While FSX Pro is connected to the device (`reconnect_sim.bat`), `doctor` should show `FSX Pro device hold` FAIL.
   `release_device.bat` should clear it.
9. Rename `config.local.json` away and run `setup.bat`. It should offer auto-detect and write the file.

## Pass criteria

- Doctor rows are accurate and the exit code is 1 only on FAIL.
- `harden --apply` steps succeed (or fail with a clear message) and the Launch Pro still connects after a replug and
  a reboot.
- The overlay changes paths without touching `config.json`.
