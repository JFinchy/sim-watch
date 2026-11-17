# Drills hub fixes

Branch: `master` (uncommitted working tree)
Files changed: drills/index.html, drills/tools/validate_data.js

## What to verify

Workstream B fixes to the Drills & Courses Hub (`drills/index.html`, opened over file:// in Chrome/Edge on the Windows PC): drill edit/delete persistence, sample-accurate metronome, full backup/restore, persistent shorts folder, mobile layout and keyboard/a11y. Automated checks (node --check, data validator, headless load) cannot judge audio timing, File System Access prompts or real-device layout.

## Steps

1. Run `node drills/tools/validate_data.js` - expect `0 error(s)` (warnings are informational).
2. Edit persistence: open the hub, go to "Add / Edit Drill" via "Edit Drill / Add Short Link" on any default drill, change the Title and untick a Routine day, click "Save Drill". Reload the page (F5). The edited title and days are still there.
3. Untouched default drills: confirm another default drill you never edited is unchanged after reload.
4. Delete persistence: open a default drill in the editor, click "Delete Drill", confirm. Reload. The drill does not come back. Then Editor tab > "Reset Drills & Goals" restores it (confirm dialog lists exactly what is reset).
5. Metronome timing: open "Cadence & Tempo", choose "24 / 8", click "Start Tour Cadence". Run a phone metronome at the matching BPM next to it for 60 s; beeps should stay locked with no drift. Move the slider for delay and change preset while running; confirm it keeps playing. Click "Stop Metronome": sound stops immediately, orb returns to ready.
6. Background tab: start the metronome, switch to another tab for 60 s, come back. Beeps kept playing steadily while hidden; Session Reps counter caught up.
7. Hotkeys: click into a text field (course search, notes) and type "t", "m", space and arrow keys; nothing fires. Outside inputs, `T` toggles the metronome, arrows move between drills, `M` marks done.
8. Backup round trip: add a round log, edit a Club Bag yardage, change the cadence preset and add a drill note. Editor tab > "Export Full Backup" (file contains `"schemaVersion": 2`). Then "Reset Everything" (two confirms) - page reloads empty. "Import Backup" the file: toast lists counts (drills, courses, rounds, bag clubs) and the round, bag edit, cadence preset and note are back. The status line under the buttons shows today's date.
9. Legacy import: import an older drills-only backup JSON; it still loads without errors. Import a random `.json` (e.g. `{"a":1}`); toast says it is not a SimWatch backup and nothing changes.
10. Backup reminder: with data present and no export in 14+ days, the Editor tab status line turns amber and a toast appears on load.
11. Shorts folder: on a drill, click "Link Shorts Folder", pick `drills/shorts`. Reload; if shown, click "Reconnect Shorts Folder" once. A drill whose `localPath` filename exists in that folder plays. For a drill whose file is missing, the frame shows "Video short not found" with the expected filename.
12. Phone width (Chrome DevTools device toolbar, 390 px): Club Bag table scrolls horizontally inside its card; Cadence hero stacks (orb above details); no page-level horizontal scroll.
13. Keyboard only (Tab / Shift+Tab / Enter / Space): reach and activate routine cards, drill cards, cadence preset cards, the tempo orb, "Pick Local Short", "Import Backup" and "Upload .csv / .json". A visible blue focus outline shows on each.
14. OS "reduce motion" on: orb stops scaling/animating.

## Pass criteria

All steps behave as described: edits and deletions survive reload, metronome stays in sync with a reference for 60 s and while backgrounded, backup round-trips every data area, shorts folder persists (Chromium) or shows the session-only message (other browsers), layout is usable at 390 px, and every control is reachable and operable by keyboard with a visible focus ring.
