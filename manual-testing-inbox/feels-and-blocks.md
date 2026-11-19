# Feels, test blocks & personalized checklist

Branch: `feature/coach-system`
Files changed: `drills/index.html` (renderFeels, renderChecklist, Pre-shot cards, Park it, state/backup), `drills/drills_data.js` (`swingChecklist.defaultFocusIds`), `drills/player_data.example.js`, `.gitignore`; private and git-ignored: `drills/player_data.js`

## What to verify

A new "🧪 Feels & Blocks" tab (feel library, flashcards, one active test block with a switch guard, breakthrough prompt, parking lot, final-pick criteria), a personalized Swing Checklist (My Fundamentals, club toggle, max 2 active cues), and a "Park it" capture button. Automated checks only cover syntax and a scripted browser pass; a human has to confirm it is usable at the mat on the phone and over `file://` on the Windows rig, both with and without `player_data.js`.

## Steps

1. Open `drills\index.html` with `drills\player_data.js` present. Open **✅ Swing Checklist**: Active cues (max 2) shows "Head down, butt back" and "Post, then turn"; 4 items carry a "Pre-swing check" badge; "Reference: consensus fundamentals" is collapsed (tap to expand).
2. Tap **Driver**, then **Irons**: the "One system, two releases" panel and the scoped items change. **All** restores everything.
3. Star a third item: an inline chooser asks you to un-star one first (no alert). Pick one; the other goes to the backlog.
4. Tap **🎴 Pre-shot cards**: pre-swing checks first, then active cues, then (if a block is running) the active feel's cue as the last card.
5. Open **🧪 Feels & Blocks**. Filter the library by club and status. Add a feel, edit it, delete it (Undo works). Start **🃏 Flashcards**: the cue stays hidden until **Reveal cue**.
6. **Start a block** on one feel: fill hypothesis (a bare template is rejected), keep defaults (7 days, "dispersion and strike vs baseline", switch rule). The dashboard strip shows the feel, "Day 1 of 7" and the cue. The previously active feel becomes Parked.
7. Press **Start block** on a different feel mid-block: the guard names the cycling pattern, shows "day 1 of 7", repeats your switching rules, and needs a reason. **Keep my current block** leaves everything alone.
8. **💡 I think I found it**: fill name and hypothesis. It is saved as a Candidate, the active feel does not change, and you can **Schedule as next block**.
9. Tap **🅿️ Park it** (Checklist and Feels views; in Mat mode use the "🅿️ Park" button in the top bar). Type, press Enter. In the Parking lot, **Promote to candidate** adds a Candidate feel; **Dismiss** and **Reopen** work.
10. **End block…**: needs a verdict and notes. It appears under Block history with dates, feel, hypothesis, verdict.
11. Reload: the active block, history, parking lot and feel edits persist. On the Drill Deck, the compact active-feel banner appears above Tonight's Session.
12. Editor tab: Export Full Backup, Reset Everything, Import Backup: feels, blocks and parking lot all return.
13. Rename `player_data.js` away and reload: no errors beyond one missing-file request; Feels tab shows "Add your player profile" with copy instructions; checklist falls back to the consensus items with 2 default cues.
14. Phone width: no horizontal scroll, buttons easy to tap.

## Pass criteria

All steps behave as described, no console errors (other than the offline-bridge and missing-shorts messages and, in step 13, the missing player_data.js), an old saved state with more than 2 focus ids is trimmed to 2 with a one-time toast, and a keyboard-only user can operate every button, form and chooser. In Mat mode, pressing Space while the Park button is focused logs a rep (Mat shortcut) rather than clicking it; use Enter or tap.
