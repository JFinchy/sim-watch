# Drill recommender, pacing timer, cue repeater & tone profiles

Branch: `feature/coach-system`
Files changed: `drills/index.html`, `drills/drills_data.js` (grip-tension tagging, new "Grip Pressure Ladder" drill, gym drills moved to a new "Speed & Strength (Gym)" section and `gym-speed` routine), `drills/tools/validate_data.js`

## What to verify

Wave 3 of the coach layer: a "What's going wrong?" fault recommender with a session queue, a block/transfer pacing timer, a hands-free spoken cue repeater, three tone profiles, and timestamped YouTube clips. Headless Chrome (mocked speech, no real speakers) covers the logic, layout and persistence; only a human can judge how it sounds and reads on the sim PC, a phone and the TV from 6-10 ft, and whether the speech voices exist on Windows.

## Steps

Open `drills/index.html` over `file://` on the Windows sim PC (Chrome or Edge), then repeat the visual checks on the phone.

1. **Recommender.** Drill Deck tab, tap `What's going wrong?`. Check the environment chips default to Sim, Putting mat, Mirror and Gym (from your player_data gear), tap `All` and `My setup` to switch. Pick `Grip and arm tension`: symptom and root cause show, then ranked drills with key feel, equipment badges and "used N d ago / never logged". Pick `Low swing speed`, untick `Gym`: the gym drills drop to "Needs other setup".
2. **Queue + aid warning.** Tap `Add to today's session` on 4 drills that need different equipment (for example the HackMotion, speed-stick and Launch monitor drills). A yellow warning must say the block needs more than 3 training aids. Remove one and the warning clears.
3. **Promote keyFeel.** Tap `Promote keyFeel to active cue`. With 2 active cues already set you land in the Swing Checklist at the swap chooser; pick one to replace. With fewer than 2 it is added directly.
4. **Deck filters.** In the filter bar use `Swing phase` chips and the `Problem solved` dropdown. Filtering `Grip and arm tension` must show the Grip Pressure Ladder and Ball Between the Elbows. `Speed & Strength (Gym)` section shows the 4 gym drills; the Routines & Sections tab lists that section too, and tonight's auto-plan never contains gym drills.
5. **Session runner.** Queue drills of different kinds (block drill, a gym drill, a putting drill, a transfer drill), then `Start coached session`. The length picker must show every template's blocks and minutes; the selected one lists the queued drills under their block. Start a 60-min session: each block lists its drills, the current drill's key feel is a bold card, and tapping another drill re-posts context. With the bridge running, check `Swings/Sessions/<today>/shots.jsonl` shots carry that `drill_id`.
6. **Pacing timer.** In a Feel block: Start timer. Block mode chimes every 4 s (slider 2-5 s). Switch to Transfer: 18 s cycle with big digits and prompts "Step behind the ball", "Pick a target", "Rehearse", "Hit one committed shot", one chime at the hit step. Tick `Speak the prompts`. Stop it; leave and re-enter the Cadence & Tempo tab, where the same panel exists standalone.
7. **Cue repeater.** In Pre-shot cards, Mat mode, the session runner and the Cadence tab, press `V` (or tap the Voice button): a soft chime, then your 2 active cues are spoken every 10 s. Change interval (5-20 s), rate, volume and voice in the Cadence tab panel. Tick the active feel's cue to include it. Close the overlay, change tabs, or minimise the browser: speech must stop. Press `V` while typing in a text box: nothing happens.
8. **Tone profiles.** Cadence tab, tone profile chips: tap Crisp strike, Woodblock, Soft thud (each previews). Start the metronome and the pacing timer with each.
9. **Clips.** Edit a drill (Add / Edit Drill tab), set a YouTube URL, clip start `0:42` and end `1:08`, save. The deck shows `0:42-1:08` above the embed and the key feel as a bold takeaway card under it. `abc` or an end before the start is rejected.
10. Export a full backup, import it, and confirm queue, pacing, voice settings and tone profile survive a page reload.

### Listening and viewing checks (human only)

- Each tone profile is audible on the sim PC speakers at normal volume with the sim running: Crisp strike, Woodblock (the click must sound like wood, not static) and Soft thud (audible at low volume, not boomy). Late-night: Soft thud is quiet enough not to wake the house.
- The spoken cue is understandable from 10 ft standing on the mat, at the default rate, with the sim running. Note which Windows voice sounded best.
- Pacing digits and the HIT prompt are readable from 10 ft on the TV and from about 6 ft on the phone.
- The soft chime before the voice is audible but not startling; the chime does not get cut off by the speech.
- If speech is unavailable (turn off the voice or use a browser without it), cues flash full screen on the same loop.

## Pass criteria

Faults list ranked drills with the right symptom text; queued drills appear in the matching block and are sent as `drill_id`; the aid warning fires above 3 distinct items; promote respects the 2-cue cap; pacing and cue timers start, stop and stop cleanly on leaving the view, closing the overlay or hiding the page; all three tone profiles are audible and distinct; clip start/end embed correctly; state persists across a reload and a backup round trip; no horizontal scroll at phone width.

## Review fixes (2026-11-19)

1. Turn on the cue repeater (V) and a transfer-mode pacing timer with speech on. Cues are spoken whole; pacing only beeps.
2. In the recommender, deselect every environment chip. The last one stays on with the toast "Pick at least one environment".
3. Paste `https://youtu.be/<id>?t=90` as a drill clip. The embed starts at 1:30. A non-YouTube URL shows no embed.
4. A drill you edited before wave 3 now shows up under fault and phase filters.
