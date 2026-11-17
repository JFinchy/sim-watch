# Drills content accuracy pass

Branch: `master` (working tree)
Files changed: drills/drills_data.js, drills/tools/validate_data.js (optional `fps` check on cadence presets)

## What to verify

An expert review of the practice content in `drills/drills_data.js`: HackMotion targets are now relative to your own address/top readings, Gym-Sore mode has no loaded wrist-flexion holds, Almost-ball plans use only start line (HLA) and club data, launch-monitor targets are looser, bag carries were recomputed from ball speed, tempo presets are labelled as 30fps, and 5 drills were added. The validator only checks structure. A human needs to read the copy in the UI and confirm it renders and makes sense.

## Steps

1. Run `node drills/tools/validate_data.js`. Expect `0 error(s)`. The 9 warnings (2 course hole counts, 7 customPracticeRounds courseKeys) were already there.
2. Open `drills/index.html` in Chrome/Edge. If you have saved state, check with **Reset Stock Yardages** or a fresh profile. Drills you edited before keep your saved copy.
3. Drill deck. Open each of these and confirm the HackMotion card is **hidden**. This depends on the concurrent index.html change: without it the card shows the old fallback numbers. Drills: `T-Spine Open Books + Hip CARs Setup Flow`, `Towel Behind Ball + Tee Strike Spray Calibration`, `Headcover Gate P2 One-Piece Takeaway`, `Trail-Side Wall / Stick P4 Depth Check`, `Gary Player Step-Through`, `Alignment Stick / Noodle Anti-OTT Plane Guard`, `Hip Clearance / Anti-Early-Extension`, `One-Side Miss Fairway Start-Line Test`.
4. Open `Silent Ruler / Tee-Gate Start-Line Precision`. The HackMotion card should read "within ±2° of address". Open `Driver Upward AoA Gate`. Impact should read "0–5° more flexion than your top".
5. Open `Impact Bag + Motorcycle` and `HackMotion Pure Shaft Lean`. The Gym-Sore plan box should say "Unloaded slow rehearsal only…" and include the safety rule. Impact should be "~5–10° more flexion than your top reading".
6. `T-Spine Open Books + Hip CARs`: the instructions now include a Hip CARs step.
7. `HackMotion Motorcycle Shallowing`: the Real plan no longer says "push-draw, zero right-side miss". The FO checkpoint no longer says "4+ inches".
8. Filter to the **Almost Golf Balls** mode. Plans for `HackMotion P4`, `Radial Cock & Ulnar` (wedges, not driver) and `Towel Behind Ball` should mention HLA/club data only.
9. Routines view → `Gym-Sore Recovery`. The summary ends with "Safety: muscular soreness 3/10 or less only…". `Day 2` cadence no longer mentions a top pause.
10. New drills appear and render with no blank fields: `Random Practice Block`, `9-Shot Shape Test` (new section "Course Transfer & Pressure"), `Wedge Distance Control Ladder`, `3-Foot Circle + Lag Speed Ladder`, `Structured 5-Minute Warm-Up`.
11. Cadence view: BPM badges now read 257/225/200/180/200/180. The "Tour Pros" tile shows neutral descriptions, not pro names. Each description mentions 30fps and the 60/120/240fps equivalents.
12. Bag Matrix: 7 Iron carry is 148, PW is 113, the HackMotion column reads "5–10° flex vs top", and driver/woods are unchanged.
13. Simulator routines → `Differential Shot-Shaping`: push-draw is described as an in-to-out path with the face closed to path but open to target. The tower shot no longer says "toe strike".

## Pass criteria

- Every listed drill renders with no blank or "undefined" text.
- The wording matches the steps above.
- No remaining absolute HackMotion targets like "-16° to -20°".
- No loaded wrist-flexion holds in any Gym-Sore plan.

## Known gaps (left on purpose)

- The mode `subtitle` field (where the Gym-Sore safety rule and the Almost-ball HLA note were also added) is not rendered by index.html today.
- Seven `customPracticeRounds.courseKey` values match no course id, and none has an obvious match (Top of the World is not Top of the Rock), so they were left as they are.
- `bpm` is display-only. It now means a metronome setting where one beat equals the downswing (commented in the data file).
