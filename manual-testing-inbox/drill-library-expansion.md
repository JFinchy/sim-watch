# Drill library expansion + coach taxonomy data

Branch: `feature/coach-system`
Files changed: drills/drills_data.js (drills, cadencePresets, new keys faults / environments / sessionTemplates), drills/tools/validate_data.js

## What to verify

The drill library grew from 24 to 52 drills, every drill now carries `faultTags`, `environments`, `swingPhase`, `equipment`, `keyFeel` (and optional `pacing`), and three new data blocks exist for the coach features: `faults`, `environments`, `sessionTemplates` (15/30/45/60 min). Five new 2:1 short-game and putting cadence presets were added and all presets have a `use` field. The validator checks structure only; a human needs to confirm the new drills read well, render with no blank fields, and that the hub still behaves.

## Steps

1. Run `node drills/tools/validate_data.js`. Expect `0 error(s)` (existing warnings about course hole counts and customPracticeRounds courseKeys are not new).
2. Open `drills/index.html` in Chrome. Use a fresh profile or Reset drills, because edited drills keep your saved copy.
3. Drill deck: confirm the drill count is 52. Open at least: `Ball Between the Elbows`, `Butt-on-Wall Setup & Turn`, `Pocket Pause`, `Smash Bag Elbow Trap`, `Putting Mirror + Gate`, `Timed 4-Foot Pressure Putts`, `Kettlebell Swings (Speed Prep)`, `Overload / Underload Swing Training`. Each should show why, instructions, checkpoints and the mode plan with no "undefined" text. The video pane falls back to the diagram because the shorts files do not exist yet.
4. Switch to Gym-Sore mode: every new drill that lists it has a plan ending with the safety line; no loaded wrist flexion or impact-bag contact.
5. Cadence view: 11 presets show. The new ones (`sg-14-7`, `sg-16-8`, `pt-14-7`, `pt-16-8`, `pt-18-9`) select and play; BPM reads 257/225/257/225/200.
6. Read the gym drills: each says to stop if smash factor falls below about 1.40 or contact degrades.
7. In a console, check `DEFAULT_DRILLS_DATA.sessionTemplates` has 4 entries and each blocks total matches its minutes.
8. Skim that no drill text mentions a specific person, injury or private gear.

## Pass criteria

- Validator: 0 errors.
- All 52 drills render without blank or "undefined" fields; the app loads with no console errors.
- New presets play like the existing ones.
- Content is generic and safe for a public repo.
