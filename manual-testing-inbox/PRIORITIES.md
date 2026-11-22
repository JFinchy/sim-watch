# Manual testing priorities

## Critical

- [ ] Watchdog hardening - see `watchdog-hardening.md`
- [ ] Setup & launcher hardening - see `setup-ops.md`
- [ ] Watchdog recovery reliability (device debounce, backoff, PAUSE expiry, 72h task limit) - see `watchdog-reliability.md`
- [ ] Doctor checks, `harden`, config.local.json - see `doctor-hardening.md` (2026-11-19 rig: harden 0 failed, doctor 40 pass / 1 warn / 0 fail; reboot persistence check still pending)

## Important

- [ ] Kinovea 2025 integration (UDP trigger, clip-ready, legacy fallback) - see `kinovea-2025.md`
- [ ] Shot-data bridge (simwatch.py → drills hub; incl. simulate-shot / selftest) - see `shot-bridge.md`
- [ ] Tonight's Session + Mat mode + live auto-scoring - see `tonights-session-mat-mode.md`
- [ ] Drills content accuracy & safety (HackMotion, Gym-Sore, new drills) - see `drills-content-accuracy.md`
- [ ] Drills hub fixes - see `drills-hub-fixes.md`
- [ ] Swing Checklist - see `swing-checklist.md`
- [ ] Feels, test blocks & personalized checklist - see `feels-and-blocks.md`
- [ ] Bridge session context + session stats - see `bridge-session-context.md`
- [ ] Drill library expansion (faults, environments, templates) - see `drill-library-expansion.md`
- [ ] Session runner, structured log, miss dial & weekly review - see `session-log-and-review.md`
- [ ] Drill recommender, pacing timer, cue repeater & tone profiles - see `pacing-cues-recommender.md`
- [ ] ShotLab Electron desktop dashboard, club auto-detector & OBS Studio overlays - see `shotlab-desktop-obs.md`
- [ ] SimWatch ↔ ShotLab integration (supervisor, Rig pill, setup/doctor) - see `shotlab-simwatch-integration.md`
- [ ] Practice-video handoff, phone access (bridge.lan) & narrowed firewall rules - see `video-handoff-phone-firewall.md`
- [ ] Adaptive replay layout, post-shot replay, compare & shortcut map - see `adaptive-replay-layout.md`
- [ ] Bug-hunt review fixes (lock retry, rig-start focus, HUD no-activate) - see `bug-hunt-review-fixes.md`

## Minor

- [ ] Drills hub correctness, a11y & phone layout - see `drills-hub-correctness-ux.md`

## Backlog (passed)
