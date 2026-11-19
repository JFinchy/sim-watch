# Swing Checklist (Drills Hub view + Pre-shot cards)

Branch: `master` (working tree)
Files changed: `drills/index.html` (renderChecklist, Pre-shot cards overlay, backup/import/state), `drills/drills_data.js` (`swingChecklist`), `drills/tools/validate_data.js`, `README.md`

## What to verify

A new "Swing Checklist" tab in the Drills Hub lists swing cues by phase, with a daily check, a "My Focus" star, details, and drill chips that open the drill in the Drill Deck. "Pre-shot cards" (not the same as Tonight's Session Mat mode) shows starred items fullscreen, one per screen. Automated checks only cover syntax and data; a human has to confirm it is readable and usable at the hitting mat on the phone/tablet and on the Windows rig over `file://`.

## Steps

1. Open `drills\index.html` in the rig browser (and on the phone/tablet). Click **✅ Swing Checklist** (right after Drill Deck).
2. Confirm the header shows `0 / 19 checked today` and "Days checked, last 7 days", and Active cues (max 2) shows 2 cards: with drills/player_data.js present these are your first two pre-swing checks; without it, maintain tilt and trail shoulder under chin.
3. Tap the check button on two items. The count rises and the button stays pressed after a page reload.
4. Un-star one My Focus item, reload: it stays un-starred (defaults must not come back).
5. Under **Downswing**, confirm the "Am I standing up?" card, and that its two buttons scroll to and open the matching items.
6. Open **Details** on "Maintain tilt: don't stand up", click a related-drill chip: the Drill Deck opens on that drill.
7. Toggle **Focus only**, then back. Click **Clear today**, then press Undo in the toast.
8. In **Add my own item**, add one (title, cue, phase). Star it, check it, then delete it (Undo works). Built-in items have no delete button.
9. Click **🎴 Pre-shot cards**. Tap the card, swipe left/right on the phone, use the Left/Right arrow keys. Esc closes it. Text is readable from standing distance.
10. Editor tab: Export Full Backup, Reset Everything, Import Backup. Checklist focus, checks and custom items all return.
11. Narrow the window to phone width: no horizontal scroll.

## Pass criteria

All steps behave as described, no console errors, checks reset on a new day (change the system date or edit `checklistLog` to confirm yesterday's checks do not count today), and a keyboard-only user can reach every check/star/details/chip button with Tab and activate it with Enter or Space.
