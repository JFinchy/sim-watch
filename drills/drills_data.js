window.DEFAULT_DRILLS_DATA = {
  "modes": [
    {
      "id": "real",
      "label": "Real Balls",
      "shortLabel": "Real Balls",
      "icon": "🏌️",
      "badgeColor": "#10b981",
      "subtitle": "Full Sim & Launch Monitor Metrics (GSPro + Kinovea)"
    },
    {
      "id": "almost",
      "label": "Almost Golf Balls",
      "shortLabel": "Kids Asleep",
      "icon": "🌙",
      "badgeColor": "#818cf8",
      "subtitle": "Kids Asleep / Quiet Mode — Low-Noise Strike, Start Line & Sequencing. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls."
    },
    {
      "id": "sore",
      "label": "Gym-Sore / Recovery",
      "shortLabel": "Gym-Sore",
      "icon": "💪",
      "badgeColor": "#f59e0b",
      "subtitle": "Zero/Low-Impact Mobility, Slow-Mo Kinovea Rehearsals & Putting/Chipping. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
    }
  ],
  "routines": [
    {
      "id": "daily-calibration",
      "title": "Daily Calibration",
      "fullTitle": "Daily 15-Min Calibration & Delivery Warmup",
      "focus": "Setup, Tempo & Impact Reset",
      "recommendedModes": [
        "real",
        "almost",
        "sore"
      ],
      "summary": "Quick daily baseline to wake up low point, center strike, and start line before sim play or focused block work.",
      "hackmotionPrescription": "10 calibration reps with a 7-iron: note your address reading, check the top reads flatter than address and impact reads ~5–10° more flexion than your top. Green tone check.",
      "cadenceTarget": "24/8 (Tour Standard) • 1.07s rhythm"
    },
    {
      "id": "day-1-takeaway",
      "title": "Day 1: Takeaway & Top",
      "fullTitle": "Day 1: Setup, Takeaway & Top of Backswing (P1-P4)",
      "focus": "P1 Setup -> P4 Top Structure",
      "recommendedModes": [
        "real",
        "almost",
        "sore"
      ],
      "summary": "Dial in athletic posture, one-piece P2 takeaway, and centered turn at P4 without over-swinging or rolling the face open.",
      "hackmotionPrescription": "Record your address reading as the baseline. P2: little change from address. P4: ~10–20° less extension than address (flat, not cupped).",
      "cadenceTarget": "27/9 (Tour Smooth) • Calm takeaway"
    },
    {
      "id": "day-2-transition",
      "title": "Day 2: Transition & Shallow",
      "fullTitle": "Day 2: Transition, Shallowing & Pivot (P4-P6)",
      "focus": "P4 -> P6 Delivery Slot",
      "recommendedModes": [
        "real",
        "almost",
        "sore"
      ],
      "summary": "Sequence lower body pressure shift first while keeping the trail elbow ahead of the seam and shallowing the shaft inside the hand path.",
      "hackmotionPrescription": "P5-P6 motorcycle move: lead wrist adds a few degrees of flexion versus your top reading as the face squares; no added extension in transition.",
      "cadenceTarget": "24/8 (Tour Standard) • Continuous transition, no pause at the top"
    },
    {
      "id": "day-3-impact",
      "title": "Day 3: Impact & Compression",
      "fullTitle": "Day 3: Impact Delivery, Low Point & Compression (P6-P8)",
      "focus": "P6 -> P8 Strike & Shaft Lean",
      "recommendedModes": [
        "real",
        "almost",
        "sore"
      ],
      "summary": "Hold lead wrist flexion through the ball, shift low point forward of the ball, and eliminate early extension.",
      "hackmotionPrescription": "P7 impact: ~5–10° more flexion than your own top reading (irons). Alert if the impact reading is more extended than address.",
      "cadenceTarget": "24/8 or 21/7 • Crisp acceleration"
    },
    {
      "id": "day-4-wedges",
      "title": "Day 4: Wedge Clock",
      "fullTitle": "Day 4: Wedge Distance Clock & Flight Windows",
      "focus": "Scoring Distance & Spin Control",
      "recommendedModes": [
        "real",
        "almost",
        "sore"
      ],
      "summary": "Own your 9-o'clock / 10:30 / full carry yardages with matched tempo and predictable peak height.",
      "hackmotionPrescription": "Consistency clamp: repeat the same impact reading within ±3° shot-to-shot at each clock position (repeatability, not a frozen wrist).",
      "cadenceTarget": "18/9 (Short Game 2:1) • Smooth decel-free tempo"
    },
    {
      "id": "day-5-driver",
      "title": "Day 5: Driver Start Line",
      "fullTitle": "Day 5: Driver Launch Window & Start Line",
      "focus": "Tee Height, Upward AoA & Dispersion",
      "recommendedModes": [
        "real",
        "almost"
      ],
      "summary": "Build one-side miss predictability with an upward attack angle, neutral path, and disciplined start-line window.",
      "hackmotionPrescription": "Driver: impact reading close to your top (0–5° more flexion), much flatter than irons, while AoA reads +2° to +4° (Launch Pro club data).",
      "cadenceTarget": "21/7 or 24/8 • Uncoiling power"
    },
    {
      "id": "kids-asleep",
      "title": "Kids Asleep (Almost)",
      "fullTitle": "Quiet Night Session — Almost Golf Balls (Kids Asleep)",
      "focus": "Silent Speed, Strike & Start-Line Gates",
      "recommendedModes": [
        "almost",
        "sore"
      ],
      "summary": "Full coaching session at 9pm+ with almost golf balls: no driver booms, maximum kinovea DTL/FO feedback, strike spray, and alignment gates.",
      "hackmotionPrescription": "Audio Biofeedback Rehearsal: Headphone tone mode for slow-mo delivery without waking the house.",
      "cadenceTarget": "27/9 (Tour Smooth) or 30/10 (Slow-Mo)"
    },
    {
      "id": "gym-sore",
      "title": "Gym-Sore Recovery",
      "fullTitle": "Gym-Sore Recovery & Slow-Mo Mirror/Camera Routine",
      "focus": "Mobility, Slow-Mo Checkpoints & Feel Mapping",
      "recommendedModes": [
        "sore",
        "almost"
      ],
      "summary": "When DOMS hits from squats/deadlifts/push day, stack clean motor patterns with low joint stress so you still hit Daily Delivery. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion.",
      "hackmotionPrescription": "Wrist Mobility Flow: 15 slow unloaded wrist circles + slow P1-P6 checkpoint pauses. No loaded or pressed wrist-flexion holds.",
      "cadenceTarget": "30/10 (Deliberate Slow-Mo) • Zero strain"
    }
  ],
  "drills": [
    {
      "id": "thoracic-pelvic-unlock",
      "title": "T-Spine Open Books + Hip CARs Setup Flow",
      "section": "Mobility & Setup Calibration",
      "focus": "Rotation Separation & Posture",
      "faultTags": ["poor-setup-posture","overturning"],
      "environments": ["mirror","gym"],
      "swingPhase": "setup",
      "equipment": ["Alignment stick"],
      "keyFeel": "Open your ribcage and hips first so the turn comes from the body, not the arms.",
      "pacing": "block",
      "days": [
        "daily-calibration",
        "gym-sore",
        "day-1-takeaway"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "5 min",
      "reps": "6 open books/side + 3 hip CARs each direction/side + 10 hip hinges",
      "clubs": [
        "Bodyweight",
        "Alignment Stick"
      ],
      "video": {
        "localPath": "shorts/01_mobility_setup.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Sore back/hams? Spend 3 minutes unlocking ribcage & hips before grabbing an iron."
      },
      "why": "Tight lats, chest, and sore hips from gym sessions cause early spine extension and restricted shoulder turn. If the ribcage can't rotate independently over the pelvis, your arms hijack the backswing and pull the club inside. Five minutes of rotation prep restores full coil without needing high swing speed.",
      "instructions": [
        "Lie on your side with a foam roller or pillow under the top knee; perform 6 slow Open-Book thoracic rotations each side, exhaling at end range.",
        "Hip CARs: stand holding a club for balance, lift one knee to hip height and slowly draw the largest pain-free circle you can with it (out, back, down), 3 each direction per side, keeping the pelvis and trunk still.",
        "Stand with an alignment stick across your belt line and perform 10 slow athletic golf hinges (hips back, soft knees, neutral lumbar).",
        "Cross a club over your shoulders in golf posture and practice turning lead shoulder under chin while keeping lead knee flexed (no sway).",
        "Pause 2 seconds at P4 and verify balanced mid-foot pressure on both feet."
      ],
      "checkpoints": {
        "dtl": "Neutral spine angle (not overly arched 'S' or rounded 'C'); armpits aligned over balls of feet.",
        "fo": "Zero lateral hip slide outside trail foot; shirt buttons rotate cleanly ~45 deg hips / ~90 deg shoulders."
      },
      "modePlans": {
        "real": "Do this 5-minute flow before hitting your first 7i on GSPro to wake up rotation.",
        "almost": "Skip dynamic jumps—keep breathing nasal and silent while loosening upper back.",
        "sore": "CORE DRILL ON GYM-SORE DAYS: Extend to 2 rounds at 6/10 effort; stop short of muscle strain. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "gate-towel-lowpoint",
      "target": {"metric": "hla", "goal": 0, "tol": 3, "reps": 15, "pass": 10},
      "title": "Towel Behind Ball + Tee Strike Spray Calibration",
      "section": "Mobility & Setup Calibration",
      "focus": "Ball-First Strike & Low Point",
      "faultTags": ["low-point-control","early-release-scoop"],
      "environments": ["sim","range"],
      "swingPhase": "impact",
      "equipment": ["Towel","Tee"],
      "keyFeel": "Strike the ball first and the turf after, without touching the towel.",
      "pacing": "block",
      "days": [
        "daily-calibration",
        "kids-asleep",
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "15 slow-to-75% balls",
      "clubs": [
        "8 Iron",
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/02_towel_lowpoint.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Never touch the flat towel 4 inches behind the ball—force low point forward."
      },
      "why": "Many poor strikes on the sim come from an inconsistent low point: hitting slightly behind the ball changes dynamic loft and face angle at the last moment. A flat towel 4 inches behind the ball gives instant, quiet feedback on whether your sternum and hands moved forward through impact.",
      "instructions": [
        "Lay a thin microfiber towel flat 4–5 inches behind the ball (roughly one grip width behind).",
        "Spray the iron face with foot powder spray so every strike marks heel/center/toe and groove height.",
        "Hit half-to-3/4 punch shots concentrating on brushing the mat *ahead* of the ball position.",
        "Inspect the strike mark after every 3 balls—move towel closer (3.5 in) only after 5 clean sweeps."
      ],
      "checkpoints": {
        "dtl": "Lead hip clears backward on target line without jumping up toward the ball.",
        "fo": "Sternum stays slightly ahead of the ball at impact with hands leading the clubhead."
      },
      "modePlans": {
        "real": "Hit 12-15 8-iron punch shots: AoA -3° to -5° (down) and smash factor 1.28+ with a centered face mark. (Path/face/AoA/club speed need the Launch Pro club-data subscription; without it use ball data and start line.)",
        "almost": "Good night drill: judge strike by face-spray marks and quiet ball-first turf contact, not by flight. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Optional with half-swings only (no towel slam); keep swing length knee-to-knee."
      }
    },
    {
      "id": "nine-to-three-delivery",
      "target": {"metric": "hla", "goal": 0, "tol": 2, "reps": 21, "pass": 14},
      "title": "9-to-3 Delivery Reset (Metronome Sync)",
      "section": "Mobility & Setup Calibration",
      "focus": "Arms-Body Sync & Face Control",
      "faultTags": ["holding-off","face-control"],
      "environments": ["sim","range","mirror"],
      "swingPhase": "impact",
      "equipment": [],
      "keyFeel": "Body and arms arrive together from hip height to hip height.",
      "pacing": "block",
      "days": [
        "daily-calibration",
        "kids-asleep",
        "gym-sore",
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "3 sets of 7 reps",
      "clubs": [
        "PW",
        "8 Iron"
      ],
      "video": {
        "localPath": "shorts/03_9to3_delivery.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Shaft horizontal at P2, brush turf, finish with hands belt-high and clubface square to spine."
      },
      "why": "The 9-to-3 swing strips away backswing momentum and exposes pure delivery mechanics. If your hands outrun your chest—or if your chest stalls and flips the club—you feel it immediately in the finish height and face angle.",
      "instructions": [
        "Take a slightly narrower stance (feet shoulder-width) with ball centered.",
        "Swing arms back only until lead arm is parallel to the ground (P3 / 9 o'clock) with chest turned ~45 degrees.",
        "Unwind chest and hips together smoothly through the ball, finishing symmetrically at 3 o'clock (trail arm parallel).",
        "Freeze the 3 o'clock finish for 2 seconds: verify clubhead stays outside hands from FO and butt of club points back toward your belt."
      ],
      "checkpoints": {
        "dtl": "At 3 o'clock finish, shaft matches the primary address plane angle; clubface is slightly bowed/square to spine.",
        "fo": "Triangle between arms and chest stays intact; zero chicken wing on lead elbow."
      },
      "modePlans": {
        "real": "On crisp 75-95 yard 8i shots, aim for club path within ±2.5–3° and face-to-path within ±2°. (Path/face/AoA/club speed need the Launch Pro club-data subscription; without it use ball data and start line.)",
        "almost": "Kids-Asleep staple: swing at 60% effort through a foam/start-line gate; focus on turf brush sound and start line. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Do 2 sets of 8 brush-only or slow-mo 30% reps with 2-second hold at 3 o'clock finish—zero harsh deceleration stress."
      },
      "hackmotion": {
        "targetMode": "P6 to P8 Delivery & Metronome Sync (half swing)",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "9 o'clock: flatter than address (less extension)",
        "p6Angle": "A few degrees more flexion than your 9 o'clock reading",
        "impactAngle": "~5–10° more flexion than your 9 o'clock reading (hands slightly ahead)",
        "biofeedbackTone": "Set the green band relative to your own readings; sync the tone with Metronome Tone 2 and Tone 3.",
        "equipment": [
          "HackMotion",
          "Tour Tempo Metronome",
          "8 Iron"
        ]
      }
    },
    {
      "id": "headcover-outside-takeaway",
      "title": "Headcover Gate P2 One-Piece Takeaway",
      "section": "P1-P4 Backswing Structure",
      "focus": "Prevent Inside Roll & Steep Top",
      "faultTags": ["takeaway-inside-roll","over-the-top"],
      "environments": ["sim","range"],
      "swingPhase": "takeaway",
      "equipment": ["Headcover"],
      "keyFeel": "Move the club straight back past the headcover with the clubhead outside your hands.",
      "pacing": "block",
      "days": [
        "day-1-takeaway",
        "kids-asleep",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "10 min",
      "reps": "20 slow rehearsals + 12 shots",
      "clubs": [
        "7 Iron",
        "6 Iron"
      ],
      "video": {
        "localPath": "shorts/04_p2_headcover.mp4",
        "youtubeUrl": "",
        "diagram": "takeaway",
        "keyFrameCue": "P2 check: Clubhead covers the hands down-the-line, grooves tilted ~matching spine angle."
      },
      "why": "Rolling the wrists and whipping the club inside during the first 18 inches sets off an over-the-top reroute later in transition. Placing a headcover just inside and behind your takeaway path forces your ribcage—not your forearms—to start the swing so the shaft tracks cleanly up the plane.",
      "instructions": [
        "Set a headcover (or rolled towel) on the mat 6 inches behind the ball and 2 inches *inside* the target line.",
        "Take P1 address and move hands, triangle, and clubhead back together past the headcover without touching it.",
        "Pause at P2 (shaft parallel to ground): glance in Kinovea DTL replay—clubhead should stay directly in line with or slightly *outside* your hands, toe slightly up matching spine.",
        "Complete 2 pump rehearsals to P2 before hitting an actual shot."
      ],
      "checkpoints": {
        "dtl": "At P2 (shaft parallel to the ground, hands over trail thigh), clubhead covers/slightly outside hands; shaft parallel to the target line with the grip end pointing along the target line.",
        "fo": "Lead arm straight without rigid tension; slight forward shaft lean maintained early."
      },
      "modePlans": {
        "real": "Use 2-rehearsal + 1-real-ball ratio; check Kinovea DTL Live Replay after every 3rd swing.",
        "almost": "Hit 20 almost golf balls focusing solely on hitting the P2 window cleanly at 65% speed (judge start line only).",
        "sore": "Pure P1 -> P2 -> P3 slow-motion pauses in front of Kinovea DTL camera (no ball impact needed)."
      }
    },
    {
      "id": "wall-glute-turn-p4",
      "title": "Trail-Side Wall / Stick P4 Depth Check",
      "section": "P1-P4 Backswing Structure",
      "focus": "Hip Depth & Structure at the Top",
      "faultTags": ["early-extension","overturning"],
      "environments": ["mirror","sim"],
      "swingPhase": "top",
      "equipment": ["Wall, chair or golf bag"],
      "keyFeel": "Turn back into your trail glute with depth, not sideways away from the ball.",
      "pacing": "block",
      "days": [
        "day-1-takeaway",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "15 slow holds + 10 shots",
      "clubs": [
        "7 Iron",
        "No Club"
      ],
      "video": {
        "localPath": "shorts/05_p4_depth.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Trail glute turns BACK deeper into the imaginary wall at P4—don't slide laterally."
      },
      "why": "When players turn flat or sway their hips toward the trail foot, the pelvis loses its angle and forces arms to lift or get stuck behind the torso. Turning the trail hip *back* toward an imaginary rear wall creates automatic space for the arms and trail elbow to drop in front during transition.",
      "instructions": [
        "Stand with your glutes 1-2 inches off a chair back, golf bag, or alignment stick behind your trail butt cheek.",
        "Turn into your backswing so your trail hip/glute gently brushes backward into the bag/chair rather than drifting right.",
        "Hold at P4 for 3 seconds: feel pressure loaded into the inside heel of your trail foot and left shoulder tucked down.",
        "Maintain that depth as you initiate transition—lead glute replaces the spot on the bag/chair."
      ],
      "checkpoints": {
        "dtl": "Trail butt stays back against reference line from P1 through P6 (zero goat-hump toward ball).",
        "fo": "Lead hip stays under head center; hands achieve solid width/depth above trail shoulder."
      },
      "modePlans": {
        "real": "Place your golf bag behind your trail glute during mid-iron block work on GSPro.",
        "almost": "Quiet living-room/sim rehearsal: 10 slow 3-second P4 holds followed by 10 60% almost-ball swings.",
        "sore": "GOOD GYM-SORE DRILL: no explosive load; builds awareness of pelvis tilt and depth. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "pump-and-drop-p5",
      "title": "P4-to-P5 Split-Hand Shallowing Pump",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Drop Trail Elbow & Shallow Shaft",
      "faultTags": ["over-the-top","lazy-transition","trail-elbow-flying"],
      "environments": ["sim","range","mirror"],
      "swingPhase": "transition",
      "equipment": [],
      "keyFeel": "Drop the hands and trail elbow into the slot before the shoulders turn.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "kids-asleep",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "10 min",
      "reps": "3 pumps x 12 shots",
      "clubs": [
        "7 Iron",
        "6 Iron"
      ],
      "video": {
        "localPath": "shorts/06_split_hand_pump.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Shift lead foot pressure first while hands drop vertically and shaft flattens inside ball line."
      },
      "why": "The #1 amateur fault is firing the trail shoulder out toward the ball from P4, steepening the shaft outside the plane line. Splitting your hands or doing slow transition pumps teaches your nervous system the split-second feel of lower-body weight shift *while* the trail elbow drops in front of your seam and the shaft flattens.",
      "instructions": [
        "Grip the 7 iron with hands separated ~3 inches (trail hand choked slightly down on top of steel grip).",
        "Turn cleanly to P4, then rehearse a 2-inch downward 'pump' to P5: bump lead knee toward target while letting trail elbow soften toward your belly button.",
        "Check in Kinovea DTL: at P5 (lead arm parallel in downswing), the shaft should point at or slightly inside the ball-target line.",
        "Do two split-hand pumps, slide hands back together, and hit a smooth 70% swing."
      ],
      "checkpoints": {
        "dtl": "Between P4 and P5, shaft pitches shallower toward trail forearm (never steeper toward neck).",
        "fo": "Lead hip starts rotating/shifting forward while torso stays coiled closed for a split second."
      },
      "modePlans": {
        "real": "Alternate 2 slow-pump rehearsals with 1 smooth 75% ball; track club path moving from out-to-in toward +1° to +3° in-to-out. (Path/face/AoA/club speed need the Launch Pro club-data subscription; without it use ball data and start line.)",
        "almost": "With almost balls, hit real shots straight from the split-hand grip at 50% speed—instant feel for trail arm shallowing!",
        "sore": "Slow-mo mirror/Kinovea split-hand pumps only (3 sets of 10 pauses at P5, no full swing needed)."
      },
      "hackmotion": {
        "targetMode": "P4 to P5 Shallowing Flexion Increase",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "Flatter than address (~10–20° less extension)",
        "p6Angle": "A few degrees more flexion than your top reading as the shaft shallows (no added extension)",
        "impactAngle": "~5–10° more flexion than your top reading",
        "biofeedbackTone": "Audio tone fires as you pump down to P5 with lead wrist flexion increasing from your own top reading.",
        "equipment": [
          "HackMotion",
          "Kinovea FO",
          "7 Iron"
        ]
      }
    },
    {
      "id": "step-through-pressure-shift",
      "title": "Gary Player Step-Through Sequencing Drill",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Ground Force & Sequence Timing",
      "faultTags": ["lazy-transition","low-speed"],
      "environments": ["sim","range"],
      "swingPhase": "transition",
      "equipment": [],
      "keyFeel": "Push into the ground and get to the lead side before you turn.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-5-driver"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "12 balls",
      "clubs": [
        "8 Iron",
        "Driver (Real only)"
      ],
      "video": {
        "localPath": "shorts/07_step_through.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Recenter onto lead foot BEFORE P4 completes—step trail foot forward smoothly after impact."
      },
      "why": "Hanging back on the trail foot costs compression and promotes an early scoop. Stepping through toward the target right after impact encourages your pressure to move onto your lead side early in transition and full hip rotation through P8.",
      "instructions": [
        "Take your normal stance and swing smoothly back to P4.",
        "Before your hands finish rising to the top, gently initiate pressure onto your lead heel.",
        "Sweep through impact and allow your trail foot to naturally unweight and walk through a step toward the target in balance.",
        "Hold the walking-finish balanced on your lead foot without falling sideways."
      ],
      "checkpoints": {
        "dtl": "Hips stay deep while hands drop; smooth balanced walk forward along target line.",
        "fo": "Center of mass shifts onto lead foot by P5/P6 with zero stalling over the trail leg."
      },
      "modePlans": {
        "real": "Hit 10-12 mid-irons focusing on rhythmic pressure transfer; notice carry distance tighten and launch lower.",
        "almost": "Use quiet 70% tempo swings with an 8-iron and almost golf balls—keep footsteps soft on the mat so kids stay asleep.",
        "sore": "Avoid full dynamic step-throughs if hips/quads are very sore; swap for P4-to-P5 Split-Hand Pump."
      }
    },
    {
      "id": "noodle-plane-gate",
      "target": {"metric": "path", "goal": 2, "tol": 2, "reps": 15, "pass": 10},
      "title": "Alignment Stick / Noodle Anti-OTT Plane Guard",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Neutralize Steep Over-The-Top Path",
      "faultTags": ["over-the-top"],
      "environments": ["sim","range"],
      "swingPhase": "transition",
      "equipment": ["Pool noodle or alignment stick"],
      "keyFeel": "Swing under the noodle and keep the handle on the inside track.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "10 min",
      "reps": "15 slow-to-medium balls",
      "clubs": [
        "8 Iron",
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/08_noodle_guard.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Swing UNDER the angled alignment stick on the downswing to force an in-to-out delivery arc."
      },
      "why": "Feel isn't real: visual feedback in space gives immediate information on path. Setting a foam pool noodle along your shaft plane behind and slightly above your hands makes an over-the-top move hit the foam, so your arms learn to drop underneath.",
      "instructions": [
        "Angle a soft foam noodle on an alignment stick base 18 inches behind the ball, tilted parallel to your shaft at address (just above your hands).",
        "Make 3 slow rehearsal passes: take club slightly above/outside the stick going back, then loop *underneath* the noodle coming down.",
        "Hit 12 shots starting at 50% speed and gradually building to 80%, never clipping the noodle on the downswing.",
        "Verify on Kinovea DTL Live Replay that club shaft tracks inside the noodle line at P5 and P6."
      ],
      "checkpoints": {
        "dtl": "Clubhead stays visibly below the noodle/plane line from P5 into P7.",
        "fo": "Lead arm stays tight across chest into impact without pulling left too early."
      },
      "modePlans": {
        "real": "Ideal visual blocker drill when sim shots are leaking right or pulling left with a negative path.",
        "almost": "Top Quiet-Night drill: foam noodle + almost golf balls is safe, quiet motor retraining. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Set noodle up and do 15 slow practice sweeps at 30% effort—zero ball impact stress."
      }
    },
    {
      "id": "impact-bag-motorcycle",
      "title": "Impact Bag + Motorcycle Lead-Wrist Bow Drill",
      "section": "P6-P8 Impact & Compression",
      "focus": "Forward Shaft Lean & Face Squareness",
      "faultTags": ["early-release-scoop"],
      "environments": ["sim","mirror"],
      "swingPhase": "impact",
      "equipment": ["Impact bag"],
      "keyFeel": "Handle ahead of the clubhead with the lead wrist bent forward at impact.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "15 pauses + 10 half shots",
      "clubs": [
        "7 Iron",
        "Impact Bag / Cushion"
      ],
      "video": {
        "localPath": "shorts/09_motorcycle_impact.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Rev a motorcycle downward with your lead wrist from P4->P6 so clubface points at ball at P6."
      },
      "why": "An open clubface coming into P6 forces your brain to stand up and flip your wrists at the last frame just to avoid a shank or push-slice. Flexing ('bowing') the lead wrist early in transition squares the face automatically, giving your body permission to rotate hard through impact with delofted compression.",
      "instructions": [
        "Set an impact bag or folded sofa cushion at ball position (for Quiet/Sore days, simply pause against a wall/chair).",
        "Swing to P4, then feel like you twist a motorcycle throttle *down* with your lead wrist while keeping trail wrist bent back (waiter tray).",
        "Pause at P6 (shaft parallel before ball) and check Kinovea DTL: clubface leading edge matches your spine tilt—NOT open to the sky.",
        "Press cleanly into impact position with hands ahead of the clubhead, trail heel slightly lifted, chest ~35 deg open."
      ],
      "checkpoints": {
        "dtl": "At P6, face matches spine angle and clubhead tracks inside/behind hand path.",
        "fo": "Lead forearm + club shaft form a straight line leaning ~8-10 deg forward; trail wrist stays extended."
      },
      "modePlans": {
        "real": "Follow 5 slow-mo motorcycle P6 pauses with 10 crisp 7i shots looking for lower dynamic loft and penetrating flight.",
        "almost": "Skip noisy impact bag thuds when kids are asleep—press silently against a pillow or do P6 holds + half almost-ball shots.",
        "sore": "Unloaded slow rehearsal only: no bag, no pressing, no isometric holds. 8 slow-motion swings to P6-P7 at 20% speed, checking face and hand position on Kinovea. Skip entirely after heavy pull/deadlift days. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      },
      "hackmotion": {
        "targetMode": "Impact Lead Wrist Flexion & Forward Lean",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "Flatter than address (~10–20° less extension)",
        "p6Angle": "A few degrees more flexion than your top reading (motorcycle)",
        "impactAngle": "~5–10° more flexion than your top reading. Stop there: more bow is not better.",
        "biofeedbackTone": "Green tone when the impact reading is 5–10° more flexed than your own top reading.",
        "equipment": [
          "HackMotion",
          "Impact Bag",
          "7 Iron"
        ]
      }
    },
    {
      "id": "left-hip-clearance-rope",
      "title": "Hip Clearance / Anti-Early-Extension Doorframe Feel",
      "section": "P6-P8 Impact & Compression",
      "focus": "Eliminate Early Extension & Scoop",
      "faultTags": ["early-extension","early-release-scoop"],
      "environments": ["mirror","sim"],
      "swingPhase": "impact",
      "equipment": ["Chair or golf bag"],
      "keyFeel": "Slide the lead hip back, not at the ball, so your arms have room.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "gym-sore",
        "day-2-transition"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "15 isometric holds + 10 balls",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/10_hip_clearance.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Lead pocket pulls BACK away from the ball line while sternum stays angled down through P8."
      },
      "why": "Early extension ('humping the goat') steals all arm room under the ribcage, causing heel hits, blocks, and thin wipes. Teaching the lead hip pocket to peel straight *back* toward the rear corner while maintaining spine inclination locks in crisp center-face contact.",
      "instructions": [
        "Keep a chair or golf bag lightly touching your trail hip at address and your *lead* hip by impact.",
        "Take club to P4, then push off the lead ground so your lead hip pocket slides *back* along the chair instead of thrusting hips forward toward the ball.",
        "Check Kinovea DTL at P7: both butt cheeks should still cover the original address butt-line drawn in Kinovea.",
        "Hit 10 smooth 75% swings keeping trail shoulder moving down-and-around rather than stalling."
      ],
      "checkpoints": {
        "dtl": "Vertical line behind glutes at P1 stays touched (or crossed backward) at P7; head doesn't back up excessively.",
        "fo": "Belt buckle open ~40 deg at impact while chest clears to ~30 deg open."
      },
      "modePlans": {
        "real": "Turn on Kinovea DTL vertical butt-line drawing on Reference + Replay and verify zero hip drift on 10 7i balls.",
        "almost": "Almost balls at 65% tempo give all the time needed to feel your lead pocket clear backward cleanly.",
        "sore": "Slow-mo dry rehearsals against a chair back—15 slow turns holding impact shape for 2 seconds."
      }
    },
    {
      "id": "wedge-distance-clock",
      "title": "3-Clock Wedge Matrix (8 / 9 / 10:30 Systems)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Repeatable Carry Gaps & Trajectory",
      "faultTags": ["wedge-distance"],
      "environments": ["sim","range"],
      "swingPhase": "short-game",
      "equipment": [],
      "keyFeel": "Match swing length to the clock face and log every carry.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "12 min",
      "reps": "5 balls per clock x 3 wedges",
      "clubs": [
        "LW (58/60)",
        "SW (54/56)",
        "GW/PW"
      ],
      "video": {
        "localPath": "shorts/11_wedge_clock.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Match backswing hand height (Hip = 8:00, Rib = 9:00, Shoulder = 10:30) with identical smooth 3:1 tempo."
      },
      "why": "Throwing hard or decelerating wedges by feel creates large carry errors inside 100 yards. Controlling distance with swing length (clock positions) while accelerating smoothly with constant tempo makes 45–110 yard wedges far more repeatable under pressure.",
      "instructions": [
        "Pick one wedge (start with 54 deg) and establish 3 clean backswing checkpoints: Hip-High (8:00), Rib/Arm Parallel (9:00), and Shoulder-High (10:30).",
        "Keep backswing-to-through-swing tempo constant (think '1-and-2', finishing chest facing target with zero deceleration).",
        "Hit 5 balls at each station and record your median GSPro carry yardage in your session note.",
        "Finish with a Random Target Ladder: call out 52y -> 78y -> 64y -> 92y and execute on the first ball."
      ],
      "checkpoints": {
        "dtl": "No overswinging past target clock position; finish matches backswing length proportionally.",
        "fo": "Slight weight favor forward (60/40) throughout; minimal hip sway."
      },
      "modePlans": {
        "real": "Log exact carry yardages for 8 / 9 / 10:30 across PW, GW, SW inside GSPro Practice Range.",
        "almost": "Practice hitting the exact 8:00, 9:00, 10:30 P3 stops cleanly on Kinovea FO camera—nail backswing length precision quietly.",
        "sore": "Chip & pitch variations around 8:00 only; work on wrist hinge feel and clean ball-first brush."
      },
      "hackmotion": {
        "targetMode": "Wedge Impact Consistency",
        "addressAngle": "Baseline: record your wedge address reading (hands slightly forward; calibration-dependent)",
        "topAngle": "Flatter than address; swing length set by the clock position, not the wrist",
        "p6Angle": "A few degrees more flexion than your top reading",
        "impactAngle": "Repeat your own median impact reading within ±3° shot-to-shot",
        "biofeedbackTone": "The ±3° band is shot-to-shot consistency of the impact reading at each clock position, not a frozen wrist through the whole stroke.",
        "equipment": [
          "HackMotion",
          "54° / 58° Wedges",
          "GSPro Range"
        ]
      }
    },
    {
      "id": "putting-chipping-startline",
      "title": "Silent Ruler / Tee-Gate Start-Line Precision",
      "section": "Scoring Wedges & Start Line",
      "focus": "Face-at-Impact Calibration (Zero Impact)",
      "faultTags": ["putting-start-line"],
      "environments": ["putting-mat","sim"],
      "swingPhase": "putting",
      "equipment": ["Alignment sticks or tees"],
      "keyFeel": "Start the ball through the gate by keeping the face square at impact.",
      "pacing": "either",
      "days": [
        "kids-asleep",
        "gym-sore",
        "day-4-wedges"
      ],
      "modes": [
        "almost",
        "sore",
        "real"
      ],
      "duration": "10 min",
      "reps": "20 gates / 15 chips",
      "clubs": [
        "Putter",
        "PW / GW"
      ],
      "video": {
        "localPath": "shorts/12_startline_gate.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Roll or chip through a 2-inch gate 14 inches ahead—pure face angle & stroke path test."
      },
      "why": "Face angle is the dominant factor in start direction (roughly 75–85% on full shots and more on putts). Placing a tight visual gate right in front of the ball turns silent indoor time into face-control work without waking anyone or stressing sore muscles.",
      "instructions": [
        "Place two coins, tees, or alignment rods 2.5 inches wide, positioned ~14 inches directly in front of the ball on your start line.",
        "For putting: roll balls down a 36-inch metal yardstick or cleanly between the front gate 10 times in a row.",
        "For chipping/pitching (Almost or Real): hit smooth 15-to-35 yard pitches right through the center of the gate without brushing either side.",
        "Track consecutive clean starts—aim for 8/10 before moving closer or narrowing the gate."
      ],
      "checkpoints": {
        "dtl": "Clubhead stays square to arc smoothly past impact; eyes stay quiet over ball.",
        "fo": "Triangle hands/shoulders rock smoothly without wrist breakdown."
      },
      "modePlans": {
        "real": "Warm up wedges/putter on the sim with strict +/- 1.0 deg horizontal launch (HLA) tolerance.",
        "almost": "PRIMARY KIDS-ASLEEP DRILL: whisper quiet, high focus, and every rep gives clear pass/fail start-line feedback.",
        "sore": "PRIMARY GYM-SORE DRILL: Standing upright with zero spinal load—keeps daily delivery streak alive cleanly."
      },
      "hackmotion": {
        "targetMode": "Putting Stroke Lead Wrist Stability",
        "addressAngle": "Baseline: your putting address reading (note it as 0)",
        "topAngle": "End of backstroke: within ±2° of address",
        "p6Angle": "Downstroke: within ±2° of address",
        "impactAngle": "Impact & follow-through: within ±2° of address (no flick or breakdown)",
        "biofeedbackTone": "Putting only: set the flex/ext band to ±2° around your address reading. Chips use a little hinge, so don't use this band for the pitching reps.",
        "equipment": [
          "HackMotion",
          "Putter"
        ]
      }
    },
    {
      "id": "driver-headcover-aoa",
      "target": {"metric": "aoa", "goal": 3, "tol": 1, "reps": 12, "pass": 8, "club": "Driver"},
      "title": "Driver Upward AoA Gate (Forward Tee + Box Shield)",
      "section": "Driver Launch & Start Line",
      "focus": "+2 to +4 Deg Attack Angle & High Launch",
      "faultTags": ["steep-driver-aoa"],
      "environments": ["sim","range"],
      "swingPhase": "impact",
      "equipment": ["Headcover","Tee"],
      "keyFeel": "Swing up through the ball off a high tee without hitting the front box.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "12 min",
      "reps": "12 balls",
      "clubs": [
        "Driver"
      ],
      "video": {
        "localPath": "shorts/13_driver_aoa.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Ball inside lead heel, spine tilted ~6 deg trail side—clip ball on the upswing above a flat box 14 in ahead."
      },
      "why": "Steep downward iron mechanics ruin driver launch: low, high-spin knuckles or snap-hooks. Teed-up drivers require low point *behind* the ball so the club sweeps upward (+2 to +4 deg). Placing an empty sleeve/foam strip 14 inches in front forces an ascending arc naturally.",
      "instructions": [
        "Tee ball high (half ball above driver crown at address), inside your lead heel.",
        "Feel slight spine tilt away from target (~5-7 deg trail shoulder lower) and set a flat empty ball sleeve/towel 12–14 inches *ahead* of the ball.",
        "Swing smoothly focusing on swinging *up* and slightly inside-out past the low point without hitting the front box.",
        "Check numbers: target AoA +2 to +4 deg, launch 12–14 deg, spin 2100–2500 rpm. (Path/face/AoA/club speed need the Launch Pro club-data subscription; without it use ball data and start line.)"
      ],
      "checkpoints": {
        "dtl": "Head stays calmly behind ball into impact; path exits low-left safely without steep swipe.",
        "fo": "Clear secondary axis tilt (belt slightly ahead, upper spine stacked calmly behind ball)."
      },
      "modePlans": {
        "real": "Main driver sim block drill—hit 12 drives with full Kinovea DTL + FO sync and GSPro dispersion chart.",
        "almost": "Quiet swap: use a 5-wood or 7-iron off a low rubber tee with almost golf balls at 65% speed (leave driver in bag if kids sleep overhead). Read AoA (club data) and HLA only.",
        "sore": "Skip full-speed driver on heavy DOMS days; move to Putting/Short-Putt Gates or Slow-Mo Takeaways."
      },
      "hackmotion": {
        "targetMode": "Driver Flat Wrist with Upward AoA",
        "addressAngle": "Baseline: record your driver address reading (often a touch more extended than irons)",
        "topAngle": "Flatter than address, similar to your iron top",
        "p6Angle": "Close to your top reading (0–3° change)",
        "impactAngle": "0–5° more flexion than your top: flatter than irons, no extension (scoop) through the ball",
        "biofeedbackTone": "Green tone confirms the wrist stays near your top reading through the ball while hitting over the box.",
        "equipment": [
          "HackMotion",
          "Driver",
          "Tee Box Gate"
        ]
      }
    },
    {
      "id": "driver-startline-fairway-challenge",
      "target": {"metric": "hla", "goal": 0, "tol": 4, "reps": 10, "pass": 6, "club": "Driver"},
      "title": "One-Side Miss Fairway Start-Line Test",
      "section": "Driver Launch & Start Line",
      "focus": "Eliminate Two-Way Miss & Pressure Reps",
      "faultTags": ["face-control","driver-hook","open-face-slice"],
      "environments": ["sim","range","course"],
      "swingPhase": "impact",
      "equipment": ["Alignment sticks"],
      "keyFeel": "Pick one fairway side and hold the line under pressure.",
      "pacing": "transfer",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "10 min",
      "reps": "10 scored balls",
      "clubs": [
        "Driver",
        "3 Wood / Hybrid"
      ],
      "video": {
        "localPath": "shorts/14_driver_startline.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Pick an unmistakable micro-target, commit to ONE shot shape, track fairways out of 10."
      },
      "why": "Block practice on a wide range creates false confidence. Scoring 10 drives against a 40-yard virtual fairway, and logging whether your miss stays on ONE side of the target, trains course-transfer commitment and exposes under-pressure tendencies.",
      "instructions": [
        "Open GSPro Driving Range with a 40-yard target corridor (20 yds left / 20 yds right of center line).",
        "Commit to your stock shot shape (e.g., baby fade starting just left of center, or draw starting just right).",
        "Complete full pre-shot routine behind every single ball—change target line slightly every 2 balls.",
        "Score 10 balls: +1 for hitting the 40-yard corridor, -1 for a miss on the forbidden side. Pass = 5-6/10 in the corridor with misses on one side only. Log score in Daily Delivery!"
      ],
      "checkpoints": {
        "dtl": "Committed full balanced finish held for 3 seconds on every shot (P9/P10 balance).",
        "fo": "Head stays steady behind ball with chest fully turned toward target."
      },
      "modePlans": {
        "real": "Capstone game at the end of Day 5 Driver sessions—log X/10 Fairways & Stock Shape Consistency in Goals Tracker.",
        "almost": "Replace with Alignment Stick Gate start-line challenge using an 8-iron and almost balls.",
        "sore": "Skip on recovery days; run visualization/pre-shot routine reps only."
      }
    },
    {
      "id": "hackmotion-motorcycle-p5-p6",
      "title": "HackMotion Motorcycle Shallowing & Flexion Lock (P5-P6)",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Lead Wrist Flexion & Early Face Squaring",
      "faultTags": ["early-release-scoop","top-position-wrist"],
      "environments": ["sim","mirror"],
      "swingPhase": "transition",
      "equipment": ["HackMotion sensor"],
      "keyFeel": "Flex the lead wrist into the downswing and keep it there at P6.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "daily-calibration",
        "kids-asleep",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "15 slow-motion reps + 10 live balls",
      "clubs": [
        "7 Iron",
        "HackMotion Sensor"
      ],
      "video": {
        "localPath": "shorts/hackmotion-motorcycle-p5-p6.mp4",
        "youtubeUrl": "",
        "diagram": "motorcycle",
        "keyFrameCue": "Rev the motorcycle throttle downward at P5—squaring the clubface before body rotation fires."
      },
      "why": "Many amateur slices and steep over-the-top deliveries start with a face that is open at P4/P5. Sensing an open face, the body tends to cast the hands or throw the club outside-in to avoid a block right. HackMotion helps train a move common among good ball-strikers: adding lead-wrist flexion during transition (P5) so the face is squaring earlier, letting you rotate your chest and hips without fear of the slice.",
      "instructions": [
        "Strap on HackMotion, take your normal 7-iron address and record your address and top readings as your baseline.",
        "Open Flexion/Extension Biofeedback and set the green band to roughly 3–8° more flexion than your own top reading.",
        "Turn smoothly to P4 (flatter than address, not cupped).",
        "During transition from P4 to P5, feel your lead wrist 'bow' like revving a motorcycle throttle down toward the turf as pressure shifts to lead heel.",
        "Listen for the HackMotion audio tone confirmation at P5 before continuing rotation through to finish.",
        "Hit 5 slow-motion balls (50% speed) stopping at P6 to verify clubface angle matches spine angle on Kinovea DTL."
      ],
      "checkpoints": {
        "dtl": "Shaft shallows below trail shoulder plane; clubface matches spine angle (closed relative to path, square to arc).",
        "fo": "Lead wrist visibly flatter/more flexed than at the top; shaft near parallel to the ground with the clubhead well behind the hands at P6; handle leads into P7 with modest forward shaft lean."
      },
      "hackmotion": {
        "targetMode": "Transition Flexion Biofeedback",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "Flatter than address (~10–20° less extension)",
        "p6Angle": "~3–8° more flexion than your top reading (motorcycle)",
        "impactAngle": "~5–10° more flexion than your top reading",
        "biofeedbackTone": "Green tone sounds when the lead wrist reaches your P5 band (3–8° more flexed than your top).",
        "equipment": [
          "HackMotion Pro",
          "7 Iron",
          "Kinovea FO"
        ]
      },
      "modePlans": {
        "real": "Hit 10 live balls on GSPro: look for a straight-to-drawing flight (start at or right of target, curving back). The miss you're removing is the open-face block/slice that starts right and keeps going right.",
        "almost": "15 dry rehearsal reps with the tone in headphones, then 10 almost balls judged on start line only. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Ultra-slow-motion motor pattern mapping: 10 reps holding P5-P6 for 3 seconds each with zero joint shock."
      }
    },
    {
      "id": "hackmotion-shaft-lean-impact",
      "title": "HackMotion Pure Shaft Lean & Compression (P7 Strike)",
      "section": "P6-P8 Impact & Compression",
      "focus": "Anti-Scoop & Forward Shaft Lean",
      "faultTags": ["early-release-scoop"],
      "environments": ["sim"],
      "swingPhase": "impact",
      "equipment": ["HackMotion sensor","Impact bag"],
      "keyFeel": "Lead the clubhead with the handle through impact.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "daily-calibration",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "10 min",
      "reps": "20 balls + 10 dry rehearsals",
      "clubs": [
        "8 Iron",
        "HackMotion Sensor",
        "Impact Bag"
      ],
      "video": {
        "localPath": "shorts/hackmotion-shaft-lean-impact.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Lead wrist more flexed at impact than at the top: forward shaft lean, zero scoop."
      },
      "why": "Golfers often scoop or flip at impact trying to help the ball into the air, which adds loft and spin, produces fat/thin strikes and costs distance. HackMotion shows whether your lead wrist adds flexion from the top to impact (good ball-strikers typically do) or adds extension (a flip). Training a modest increase from your own top reading supports forward shaft lean without forcing an exaggerated bow.",
      "instructions": [
        "Set HackMotion Flexion/Extension mode. Record your address and top readings; set a red alert for any impact reading more extended than address.",
        "Position an impact bag or soft foam target 2 inches ahead of normal ball position (Real/Almost only).",
        "Take a 3/4 backswing and move the handle toward the bag with hips open ~40°, at moderate speed.",
        "Check HackMotion: impact reading ~5–10° more flexion than your top reading, with no extension breakdown.",
        "Transfer immediately to 10 live balls on GSPro, taking a shallow divot pattern ahead of the ball."
      ],
      "checkpoints": {
        "dtl": "Trail elbow bent against right rib cage; lead shoulder clearing up and around without chest lifting.",
        "fo": "Shaft leaning forward toward target; hands ahead of lead thigh; lead wrist flat/bowed with zero scoop."
      },
      "hackmotion": {
        "targetMode": "Impact Deloft & Compression",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "Flatter than address (~10–20° less extension)",
        "p6Angle": "A few degrees more flexion than your top reading",
        "impactAngle": "~5–10° more flexion than your top reading (no need to chase more)",
        "biofeedbackTone": "Green tone confirms the impact reading is 5–10° more flexed than your own top reading.",
        "equipment": [
          "HackMotion",
          "Impact Bag",
          "8 Iron"
        ]
      },
      "modePlans": {
        "real": "Hit 10 balls on GSPro with an 8-iron: launch ~19–23° and spin ~6500–7500 rpm (ball data, valid with real balls).",
        "almost": "Strike almost golf balls off a strike mat with spray checking low point is ~2 inches past the ball. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Unloaded slow rehearsal only: no bag presses or isometric holds. 8 slow-motion swings to P7 at 20% speed watching the HackMotion graph. Skip entirely after heavy pull/deadlift days. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "hackmotion-p4-flat-wrist",
      "title": "HackMotion P4 Top-of-Swing Face Alignment (Anti-Slice Cup Fix)",
      "section": "P1-P4 Backswing Structure",
      "focus": "Top-of-Swing Wrist Alignment & Face Control",
      "faultTags": ["top-position-wrist"],
      "environments": ["sim","mirror"],
      "swingPhase": "top",
      "equipment": ["HackMotion sensor","Alignment stick"],
      "keyFeel": "Flat lead wrist at the top, flatter than address, not cupped.",
      "pacing": "block",
      "days": [
        "day-1-takeaway",
        "daily-calibration",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "7 min",
      "reps": "15 pause reps at P4",
      "clubs": [
        "6 Iron",
        "HackMotion Sensor",
        "Alignment Stick"
      ],
      "video": {
        "localPath": "shorts/hackmotion-p4-flat-wrist.mp4",
        "youtubeUrl": "",
        "diagram": "takeaway",
        "keyFrameCue": "Eliminate the P4 wrist cup: flat lead wrist keeps the clubface aligned to lead forearm."
      },
      "why": "Excessive lead-wrist extension (cupping) at the top opens the clubface, so the downswing needs a compensating move to square it. A top position flatter than address keeps the face more in line with the lead forearm and makes it easier to shallow without a late rescue.",
      "instructions": [
        "Open HackMotion Top-of-Swing Mode and record your address reading.",
        "Set the green zone to roughly 10–20° less extension than your address reading (flat to slight bow for most players).",
        "Set the audio warning to sound if the top reading is as extended as, or more than, your address reading.",
        "Take your stance and hinge smoothly into P4. Pause for 2 seconds at the top (positional drill: leave the metronome off for these reps).",
        "Check mirror or Kinovea DTL: lead wrist flat, clubface roughly matching lead arm angle; then swing down smoothly into a balanced finish."
      ],
      "checkpoints": {
        "dtl": "Leading edge of clubface parallel to lead forearm plane at P4; zero cup or bow distortion.",
        "fo": "Lead arm straight without tension; full 90° shoulder turn with chest rotated over trail hip."
      },
      "hackmotion": {
        "targetMode": "P4 Top Alignment Window",
        "addressAngle": "Baseline: record your own address reading (calibration-dependent; often +10° to +25° ext)",
        "topAngle": "~10–20° less extension than address (flat, not cupped)",
        "p6Angle": "A few degrees more flexion than your top reading",
        "impactAngle": "~5–10° more flexion than your top reading",
        "biofeedbackTone": "Green chime validates the top reading is in your flat window before the downswing begins.",
        "equipment": [
          "HackMotion",
          "Kinovea DTL",
          "6 Iron"
        ]
      },
      "modePlans": {
        "real": "10 pause-and-hit swings at P4: pause 2 sec for green tone, then uncoil into GSPro.",
        "almost": "10 pause-at-P4 reps for the green tone, then hit 10 almost balls with a smooth rhythmic transition; judge start line only. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Slow-motion stretch reps: hold P4 for 4 deep breaths to stretch chest & lats without pain."
      }
    },
    {
      "id": "hackmotion-wedge-matrix",
      "target": {"metric": "carry", "goal": 50, "tol": 3, "reps": 15, "pass": 10},
      "title": "HackMotion Wedge Wrist Extension Clamp (Low Spinner vs Soft Pitch)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Wedge Distance Consistency & Spin Control",
      "faultTags": ["wedge-distance"],
      "environments": ["sim","range"],
      "swingPhase": "short-game",
      "equipment": ["HackMotion sensor"],
      "keyFeel": "Control wedge distance with wrist hinge and swing length, not extra speed.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "10 min",
      "reps": "15 shots at 50 yds + 15 shots at 75 yds",
      "clubs": [
        "54° Wedge",
        "58° Wedge",
        "HackMotion Sensor"
      ],
      "video": {
        "localPath": "shorts/hackmotion-wedge-matrix.mp4",
        "youtubeUrl": "",
        "diagram": "clock",
        "keyFrameCue": "Repeat the same impact reading within ±3° shot-to-shot: consistent dynamic loft, tighter distance control."
      },
      "why": "Wedge distance dispersion comes from varying speed, strike and dynamic loft. Variable wrist action at impact is a big contributor to the loft part. Matching your own HackMotion impact reading shot-to-shot keeps dynamic loft more consistent and tightens carry windows.",
      "instructions": [
        "Select your 54° wedge, record your address reading and set HackMotion to Flexion/Extension mode.",
        "Low Check & Spinner: hands slightly forward; impact reading ~5–8° more flexion than your address reading (lower launch, more spin than the soft pitch).",
        "Soft High Pitch: impact reading close to your address reading (little added flexion), letting the bounce glide through turf.",
        "Hit 10 balls to a 50-yard target on GSPro range; pass = 7/10 carries within ±3 yards and impact readings within ±3° of your median.",
        "Move to a 75-yard pin and repeat with the 54° wedge."
      ],
      "checkpoints": {
        "dtl": "Shallow bounce engagement; clubhead does not dig or flip past hands through impact.",
        "fo": "Chest turns through with hands; sternum leads the clubhead into finish."
      },
      "hackmotion": {
        "targetMode": "Wedge Dynamic Loft Consistency",
        "addressAngle": "Baseline: record your wedge address reading (calibration-dependent)",
        "topAngle": "Flatter than address (half-swing clock)",
        "p6Angle": "A few degrees more flexion than your top reading",
        "impactAngle": "Spinner: ~5–8° more flexion than address • High Soft: close to address reading",
        "biofeedbackTone": "Tolerance chime when the impact reading lands within ±3° of your median for that shot type (shot-to-shot consistency, not the whole stroke).",
        "equipment": [
          "HackMotion",
          "54° / 58° Wedges",
          "GSPro Range"
        ]
      },
      "modePlans": {
        "real": "Hit 10 balls to 50 yds, 10 to 75 yds on GSPro; log carry consistency in Bag Matrix.",
        "almost": "Start-line and launch-window gates: hit almost balls through low and high foam gates in the room. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Short putting/chipping stroke calibration: 20 low-stress 10-yard chip-and-runs."
      }
    },
    {
      "id": "hackmotion-radial-ulnar-whip",
      "title": "HackMotion Radial Cock & Ulnar Unhinge Release Gate",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Lag Generation & Low-Point Strike Timing",
      "faultTags": ["early-release-scoop","low-speed"],
      "environments": ["sim"],
      "swingPhase": "transition",
      "equipment": ["HackMotion sensor"],
      "keyFeel": "Keep lag then release it late for speed without early flipping.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-5-driver"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "15 whip reps",
      "clubs": [
        "Driver",
        "5 Iron",
        "HackMotion Sensor"
      ],
      "video": {
        "localPath": "shorts/hackmotion-radial-ulnar-whip.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Radial cock sets the hinge; lag peaks around P5-P6; the unhinge happens progressively into impact."
      },
      "why": "Radial deviation (lead thumb up) sets the wrist hinge; maximum lag typically occurs around P5-P6 in the downswing, not at the top. Ulnar deviation then unhinges the wrists into impact. Watching the timing of that unhinge on the HackMotion graph helps spot an early cast (unhinging from the top), which costs speed and moves low point back.",
      "instructions": [
        "Record your address reading in Radial / Ulnar Deviation as your baseline.",
        "Hinge to P4: note your radial reading (lead thumb pointing up).",
        "Downswing: keep the hinge through P5-P6, where lag is greatest; the graph should not drop back toward address before P6.",
        "Through impact (P7): the reading returns toward (or slightly past) your address value as the arms extend.",
        "Take 10 step-through whip swings feeling the 'crack of the towel' at low point; check clubhead speed on Launch Pro, not HackMotion."
      ],
      "checkpoints": {
        "dtl": "Clubhead lags behind hands entering delivery zone; no early casting outside the line.",
        "fo": "Lead wrist fully unhinged down at strike; arms extend into triangle at P8."
      },
      "hackmotion": {
        "targetMode": "Radial / Ulnar Deviation Timing",
        "addressAngle": "Baseline: record your address radial/ulnar reading (calibration-dependent)",
        "topAngle": "Radial cock set (more radial than address)",
        "p6Angle": "Lag peaks around P5-P6: still near or above your top radial reading",
        "impactAngle": "Back toward (or slightly past) your address reading: progressive release, not from the top",
        "biofeedbackTone": "HackMotion can't detect clubhead speed peak. Review the graph for release timing (unhinge after P6) and use Launch Pro for speed.",
        "equipment": [
          "HackMotion",
          "Driver",
          "Kinovea FO"
        ]
      },
      "modePlans": {
        "real": "Hit 10 drives on GSPro tracking ball speed (and club speed/smash if you have club data) while checking release timing on the graph.",
        "almost": "Swap driver for wedges (GW/SW) at 60–70% speed: watch release timing on the graph and judge contact and start line only. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Wrist mobility rolls: gentle circular wrist rotations 10 reps each direction."
      }
    },
    {
      "id": "random-variable-practice-block",
      "target": {"metric": "manual", "reps": 18, "pass": 12},
      "title": "Random Practice Block (New Club + Target Every Ball)",
      "section": "Course Transfer & Pressure",
      "focus": "Transfer to the Course & Pre-Shot Routine",
      "faultTags": ["false-groove","course-transfer"],
      "environments": ["sim","range","course"],
      "swingPhase": "mental-tempo",
      "equipment": [],
      "keyFeel": "Change club and target every shot and run the full routine each time.",
      "pacing": "transfer",
      "days": [
        "day-3-impact",
        "day-5-driver",
        "day-4-wedges"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "12 min",
      "reps": "18 balls, no two in a row with the same club/target. Pass: 12/18 inside the target window (wedges ±10% of distance, irons a 20-yd green, driver a 40-yd fairway).",
      "clubs": [
        "Driver",
        "7 Iron",
        "9 Iron",
        "PW",
        "SW"
      ],
      "video": {
        "localPath": "shorts/15_random_block.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Full pre-shot routine on every ball: pick target, rehearse, commit, go."
      },
      "why": "Hitting the same club at the same target over and over feels good but transfers poorly to the course. Changing club and target every ball, with your full pre-shot routine, is harder in the session but builds the skill you actually use on the course: one shot, one chance.",
      "instructions": [
        "Write or call a sequence of 18 shots in advance (e.g. driver to a fairway, 7i to a green, 60y wedge, 9i, SW 40y...). Never repeat the same club and target back-to-back.",
        "Behind the ball every time: pick a precise target, make one rehearsal swing, step in and hit within ~10 seconds.",
        "Score each ball pass/fail against the window for that club and log the total.",
        "No re-hits. A miss is data: note it and move on to the next shot."
      ],
      "checkpoints": {
        "dtl": "Same setup routine and alignment check on every ball (club down first, then feet).",
        "fo": "Balanced finish held for 2 seconds on every shot."
      },
      "modePlans": {
        "real": "Use GSPro range targets and score carry/dispersion. Pass = 12/18.",
        "almost": "Swap driver for a 7-wood or 7-iron and score start line only (HLA within ±3°). Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Skip on sore days: run 5 slow pre-shot-routine rehearsals (no balls) instead."
      }
    },
    {
      "id": "nine-shot-shape-test",
      "target": {"metric": "manual", "reps": 9, "pass": 6},
      "title": "9-Shot Shape Test (Scored Pressure Game)",
      "section": "Course Transfer & Pressure",
      "focus": "Face & Path Control Under Pressure",
      "faultTags": ["face-control","false-groove"],
      "environments": ["sim","range"],
      "swingPhase": "impact",
      "equipment": [],
      "keyFeel": "Own the curve both ways by controlling face and path on purpose.",
      "pacing": "either",
      "days": [
        "day-2-transition",
        "day-5-driver"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "10 min",
      "reps": "9 called shots (high/mid/low × draw/straight/fade), 1 ball each. Pass: 6/9 with correct start side and curve direction; personal best logged.",
      "clubs": [
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/16_nine_shot.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Call it, then hit it: one ball per shape, no mulligans."
      },
      "why": "Being able to start the ball where you choose and curve it the way you intend is the clearest test of face-to-path control. Scoring it with one ball per shape adds the pressure that block practice lacks.",
      "instructions": [
        "Draw a 3×3 grid in your notes: rows high/mid/low trajectory, columns draw/straight/fade.",
        "Before each ball, say the shape out loud and pick a start line. Draw: start right, curve left. Fade: start left, curve right (right-handed).",
        "One ball per square. Score 1 if the start side and curve direction match the call (and trajectory is visibly high/mid/low).",
        "Log the score. Repeat the test weekly with the same club to track progress."
      ],
      "checkpoints": {
        "dtl": "Ball position/handle position change for high vs low, not a different swing each time.",
        "fo": "Finish height matches the trajectory: high finish for high, held-off finish for low."
      },
      "modePlans": {
        "real": "Score from GSPro start direction (HLA) and curve. Face-to-path from club data helps diagnose misses if you have the subscription.",
        "almost": "Score start line and trajectory only (straight / draw / fade start sides). Curvature with foam balls is not reliable. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Skip on sore days: visualize each of the 9 shapes with your pre-shot routine and a slow rehearsal swing."
      }
    },
    {
      "id": "wedge-distance-control-ladder",
      "target": {"metric": "manual", "reps": 16, "pass": 11},
      "title": "Wedge Distance Control Ladder (30–100 yds, Scored)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Carry Distance Control Inside 100 yds",
      "faultTags": ["wedge-distance"],
      "environments": ["sim","range"],
      "swingPhase": "short-game",
      "equipment": [],
      "keyFeel": "Build a yardage ladder you can trust, one calibrated swing per number.",
      "pacing": "either",
      "days": [
        "day-4-wedges"
      ],
      "modes": [
        "real"
      ],
      "duration": "12 min",
      "reps": "8 targets (30, 40, 50, 60, 70, 80, 90, 100y) × 2 balls, random order. Pass: 70%+ of balls carry within 10% of the target distance (e.g. ±5y at 50y).",
      "clubs": [
        "PW",
        "GW (50°)",
        "SW (54°)",
        "LW (58°)"
      ],
      "video": {
        "localPath": "shorts/17_wedge_ladder.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Pick the club and clock length, commit, then check carry against a ±10% window."
      },
      "why": "Most strokes inside 100 yards are lost to carry distance error, not direction. Scoring every ball against a window that scales with distance (10%) gives an honest, repeatable number you can track week to week.",
      "instructions": [
        "Write the 8 target distances on cards, shuffle, and draw two at a time.",
        "Choose club and backswing length (Wedge Clock) for each; full pre-shot routine on every ball.",
        "Score a ball as a pass if carry is within 10% of the target (30y: ±3y, 60y: ±6y, 100y: ±10y).",
        "Record % passed. Re-test the distances you missed most at the end of the session."
      ],
      "checkpoints": {
        "dtl": "Same tempo regardless of distance: length changes, speed doesn't jump.",
        "fo": "Chest turns through to the target on every shot (no deceleration)."
      },
      "modePlans": {
        "real": "Use carry (not total) from the launch monitor. Pass = 70%+ within 10%.",
        "almost": "Not valid with Almost balls (no reliable carry). Use the 3-Clock Wedge Matrix backswing-length checks instead.",
        "sore": "Skip on sore days; use the 3-Foot Circle + Lag Ladder instead."
      }
    },
    {
      "id": "putting-circle-lag-ladder",
      "title": "3-Foot Circle + Lag Speed Ladder (Carpet Gate in Quiet Mode)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Short-Putt Conversion & Lag Speed",
      "faultTags": ["putting-speed","short-putt-pressure"],
      "environments": ["putting-mat"],
      "swingPhase": "putting",
      "equipment": ["Putting mat","Cup"],
      "keyFeel": "Roll lag putts 0-3 ft past the hole and make every 3-footer.",
      "pacing": "either",
      "days": [
        "kids-asleep",
        "gym-sore",
        "day-4-wedges",
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "12 min",
      "reps": "Circle: 8 balls around the hole at 3 ft; pass = 8/8 twice in a row. Ladder: 3 balls each at 20/30/40 ft; pass = 7/9 finishing 0–3 ft past the hole (none short). Quiet gate: pass = 18/20 through a 2-ball-wide gate at 3 ft.",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/18_putting_circle.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Short putts: start line through the gate. Long putts: speed that finishes just past the hole."
      },
      "why": "Three-footers and long-putt speed decide most putting scores: short misses from poor start line, three-putts from poor lag speed. Scoring both with clear pass marks gives you a standard you can hit on any night, with zero noise and no physical load.",
      "instructions": [
        "3-ft circle: place 8 balls in a circle 3 ft from the cup. Hole all 8; if you miss one, start again. Goal: two clean circles in a row.",
        "Lag ladder: 3 balls each from 20, 30 and 40 ft. Score a ball if it finishes 0–3 ft past the hole. Short = fail.",
        "Quiet/carpet version: two tees 2 ball-widths apart, 12 in in front of the ball on a 3-ft line. Roll 20 putts through the gate without touching.",
        "Log all three scores."
      ],
      "checkpoints": {
        "dtl": "Eyes over or just inside the ball; putter face square to the start line at address.",
        "fo": "Shoulders rock, wrists quiet, stroke length grows with distance (tempo stays the same)."
      },
      "modePlans": {
        "real": "Run circle + ladder on a putting green or mat (or GSPro putting if your rig reads putts).",
        "almost": "Carpet start-line gate + 3-ft circle on a mat or carpet with a cup. Fully silent.",
        "sore": "Ideal on sore days: upright posture, no loaded rotation. Run the gate and circle. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "structured-5min-warmup",
      "title": "Structured 5-Minute Warm-Up",
      "section": "Mobility & Setup Calibration",
      "focus": "Ready to Swing in 5 Minutes",
      "faultTags": ["false-groove","rushed-tempo"],
      "environments": ["sim","range","mirror"],
      "swingPhase": "setup",
      "equipment": [],
      "keyFeel": "Five one-minute blocks that take you from loose to routine-ready.",
      "pacing": "either",
      "days": [
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "5 min",
      "reps": "5 one-minute blocks. Pass: last 3 balls with the 7-iron start within ±3° HLA of your target line and strike near center of the face.",
      "clubs": [
        "SW (54°)",
        "8 Iron",
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/19_five_min_warmup.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Mobility, then half swings, then 9-to-3, then 3/4, then your first real shot with full routine."
      },
      "why": "Cold swings at full speed produce ugly first shots and raise injury risk. A fixed 5-minute progression raises body temperature, rehearses contact and ends with a full pre-shot-routine rep, so your practice starts with quality instead of warming up on the first 10 balls.",
      "instructions": [
        "Min 1: arm circles, 10 torso turns with a club across the shoulders, 3 hip CARs each direction per side.",
        "Min 2: SW half swings (hip to hip) at 50% speed, focusing on ball-first contact.",
        "Min 3: 8-iron 9-to-3 swings at 70% (see 9-to-3 Delivery Reset).",
        "Min 4: 7-iron 3/4 swings, building toward stock speed.",
        "Min 5: 3 shots with the 7-iron using your full pre-shot routine to a defined target. Score against the pass criterion."
      ],
      "checkpoints": {
        "dtl": "Posture and alignment set with a club on the ground for the final 3 shots.",
        "fo": "Balanced finish held on every swing; speed builds gradually, not from swing one."
      },
      "modePlans": {
        "real": "Run all 5 blocks; score the last 3 balls on HLA and face strike.",
        "almost": "Same progression with almost balls; score HLA only. Launch Pro: trust start line (HLA) and club data only; carry, ball speed and spin are not valid for Almost Golf Balls.",
        "sore": "Minute 1 only plus slow-motion rehearsal swings (no balls) for minutes 2-5. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "ball-between-elbows",
      "title": "Ball Between the Elbows",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Elbow Separation & Out-to-In Handle",
      "faultTags": [
        "over-the-top",
        "trail-elbow-flying"
      ],
      "environments": [
        "mirror",
        "sim",
        "range"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Ball or headcover"
      ],
      "keyFeel": "Keep the ball pinned between your upper arms so the arms and body turn as one unit.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "kids-asleep",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "3 rounds: half, 3/4, full",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/20_ball_between_elbows.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Ball stays pinned between the upper arms until after impact; arms never run away from the chest."
      },
      "why": "Arms that separate from the chest in transition force the handle outward and across the ball. Holding a ball between the upper arms ties arm motion to body rotation and teaches you to drop the hands first, then turn.",
      "instructions": [
        "Place a ball or small headcover between your upper arms, just above the elbows, and take your normal grip.",
        "Make half swings (hip to hip) keeping the ball pinned; feel the arms follow the chest turn rather than lifting away.",
        "Move to 3/4 swings; if the ball drops, your arms are racing the body, so slow the transition.",
        "Finish with 5 full swings, ball held to just after impact, then remove it and hit 5 shots keeping the same connected feel."
      ],
      "checkpoints": {
        "dtl": "Handle drops toward the trail hip pocket, not out toward the ball; shaft stays on or inside the target line from P5 to P6.",
        "fo": "Both elbows stay close to the ribcage; lead arm stays across the chest through P7."
      },
      "modePlans": {
        "real": "3 balls between elbows, then 3 real shots; look for a path trending toward neutral or slightly in-to-out and no pull.",
        "almost": "Half to 3/4 swings with almost balls at 60% speed; read start line (HLA) and club data only.",
        "sore": "Slow rehearsals in front of a mirror, half swings only, ball between the elbows, 2 sets of 10. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "butt-on-wall",
      "title": "Butt-on-Wall Setup & Turn",
      "section": "P6-P8 Impact & Compression",
      "focus": "Early Extension (Setup-to-Impact Posture)",
      "faultTags": [
        "early-extension"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Wall"
      ],
      "keyFeel": "Keep your glutes in light contact with the wall while the chest turns over them.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "day-2-transition",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 8 slow turns, then 10 balls",
      "clubs": [
        "7 Iron",
        "No Club"
      ],
      "video": {
        "localPath": "shorts/21_butt_on_wall.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Glutes keep light contact with the wall from setup into the downswing; they never move toward the ball."
      },
      "why": "Early extension means the hips drift toward the ball and the spine stands up. Feeling a wall behind your glutes gives immediate feedback on hip depth. It is the setup-and-turn version of the hip-clearance drill: that drill trains the lead hip to clear back at impact; this one keeps the glutes back from address.",
      "instructions": [
        "Set up with your glutes touching a wall (or a door) lightly, knees soft, spine tilted forward from the hips.",
        "Turn to the top with your trail glute staying on the wall; do not sit back into it.",
        "Start down and keep the lead glute in touch with the wall as the belt buckle turns open.",
        "If you lose contact, stop; the hips have moved toward the ball. Repeat 8 slow turns, then hit 10 balls from a normal setup, trying to keep the same back-of-hip feel."
      ],
      "checkpoints": {
        "dtl": "Glute line from P1 stays behind the original vertical line through P7; head does not lift.",
        "fo": "Pelvis rotates open while posture stays stacked; no belt-line rise toward the ball."
      },
      "modePlans": {
        "real": "Rehearse 5 turns on the wall, then 5 balls; check Kinovea DTL for butt-line drift.",
        "almost": "Wall turns plus quiet half swings with almost balls; focus on contact with the wall, not speed.",
        "sore": "Wall turns slowly, hands crossed on chest, no club or ball, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "parallel-pump",
      "title": "Parallel Pump",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Transition Sequencing",
      "faultTags": [
        "lazy-transition",
        "rushed-tempo",
        "over-the-top"
      ],
      "environments": [
        "sim",
        "range",
        "mirror"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Metronome (optional)"
      ],
      "keyFeel": "Let the body wait while the arms pump down to parallel, then release.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "3 pumps x 10 swings",
      "clubs": [
        "7 Iron",
        "8 Iron"
      ],
      "video": {
        "localPath": "shorts/22_parallel_pump.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Club reaches parallel back, pumps down to parallel two or three times with the hips settled, then releases."
      },
      "why": "Rushing from the top throws the shoulders at the ball. Pumping to parallel two or three times rehearses a patient sequence: lower body settles, hands drop, and then the club is released.",
      "instructions": [
        "Swing back to parallel (club roughly parallel to the ground) with a calm tempo; a metronome at about 60 BPM helps.",
        "Pump down to the parallel-down position 2-3 times, feeling the lead leg post and the body wait while the hands drop.",
        "On the last pump, release through the ball at 70% speed.",
        "Do 10 swings; if the club gets steep or the shoulders spin first, reduce the pump size."
      ],
      "checkpoints": {
        "dtl": "Shaft at parallel-down points at or inside the ball-target line; trail elbow in front of the hip.",
        "fo": "Chest still faces the ball at the bottom of the pump; lead leg firm."
      },
      "modePlans": {
        "real": "Alternate 2 pumps with 1 ball; track path trending toward neutral (Launch Pro club data required for path).",
        "almost": "Pump and hit almost balls at 60% speed; check HLA.",
        "sore": "Pump rehearsals only, no balls, 20% speed, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "pocket-pause",
      "title": "Pocket Pause",
      "section": "Driver Launch & Start Line",
      "focus": "Hook and Cut-Slice Timing",
      "faultTags": [
        "driver-hook",
        "open-face-slice"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Camera"
      ],
      "keyFeel": "Pause with your hands at your trail pocket and your chest still facing the ball.",
      "pacing": "block",
      "days": [
        "day-5-driver",
        "day-2-transition"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "10 min",
      "reps": "3 x 8 swings",
      "clubs": [
        "Driver",
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/23_pocket_pause.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Hands reach the trail pocket with the chest still facing the ball before the swing continues."
      },
      "why": "Early body opening produces hooks; a stalled club with hips popping open produces cut-slices. Pausing at P6 trains the body to wait for the club so chest and club arrive in sync.",
      "instructions": [
        "Swing to P6 (hands near the trail pocket) in slow motion and pause.",
        "Check that the chest still faces the ball and the club shaft points near the target line.",
        "Swing through at about 50% speed and check the start line.",
        "Repeat 8 times; then hit 3 swings at full tempo, trying to keep the same chest and club timing."
      ],
      "checkpoints": {
        "dtl": "At the pause, hands are near the trail pocket and the shaft is on plane, not across the line.",
        "fo": "Chest still facing the ball at the pause; lead shoulder not already open."
      },
      "modePlans": {
        "real": "Pause, then 50% swings; compare face-to-path on the monitor; check the dial both ways.",
        "almost": "Quiet low-speed reps with 7 iron and almost balls; read HLA."
      }
    },
    {
      "id": "stick-across-chest",
      "title": "Stick Across the Chest",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Overturning",
      "faultTags": [
        "overturning"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Alignment stick"
      ],
      "keyFeel": "At P6 the stick across your chest points near the ball, not out at the target.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 8 swings",
      "clubs": [
        "No Club",
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/24_stick_across_chest.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Stick across the chest points at the ball at P6, not at the target."
      },
      "why": "An overly open chest at P6 means the body has outrun the club. The stick across the chest gives a clear visual for chest direction.",
      "instructions": [
        "Hold an alignment stick (or club) across your chest, arms crossed over it.",
        "Turn back to P4, then start down; at P6 look down at the stick.",
        "The stick should point at or near the ball line, not at the target or left of it.",
        "Do 8 slow turns, then hit 5 half-swing shots keeping that chest timing."
      ],
      "checkpoints": {
        "dtl": "Stick points toward the ball/target-line at P6.",
        "fo": "Chest has not yet rotated past about 20-30 degrees open at P6."
      },
      "modePlans": {
        "real": "After 8 stick turns, hit 5 balls; look for fewer pulls and hooks.",
        "almost": "Same, with almost balls at 60%.",
        "sore": "Stick turns only, 20% effort, no balls, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "smash-bag-elbow-trap",
      "title": "Smash Bag Elbow Trap",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Trail Elbow Flying",
      "faultTags": [
        "trail-elbow-flying"
      ],
      "environments": [
        "sim"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Smash bag",
        "Towel",
        "GBox"
      ],
      "keyFeel": "Pin a towel under your trail elbow and swing slow into the bag.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "3 x 8 slow swings",
      "clubs": [
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/25_smash_bag_elbow_trap.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Towel stays pinned under the trail elbow until after impact with the bag."
      },
      "why": "A trail elbow that flies out steepens the downswing. Pinning a towel keeps the elbow near the ribcage so the club can drop into the slot.",
      "instructions": [
        "Tuck a small towel under your trail upper arm and set the smash bag at ball position.",
        "Swing at 40-50% speed into the bag, keeping the towel pinned.",
        "If the towel drops, the elbow has left your side; slow the transition and let the hands drop first.",
        "After 8 swings remove the towel and hit 5 real or foam balls with the same elbow feel."
      ],
      "checkpoints": {
        "dtl": "Trail elbow stays in front of the trail hip; no flying or lifting.",
        "fo": "Trail upper arm connected to the ribcage until after impact."
      },
      "modePlans": {
        "real": "3 sets of 8 with the bag, then 5 balls; record face-to-path (club data) if available.",
        "almost": "Replace the bag with almost balls at 50%.",
        "sore": "Skip bag contact. Towel-pinned dry rehearsals only, 20% speed, no impact, 2 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "tee-behind-the-ball",
      "title": "Tee Behind the Ball",
      "section": "P6-P8 Impact & Compression",
      "focus": "Irons: Angle of Attack",
      "faultTags": [
        "low-point-control",
        "early-release-scoop"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Tee",
        "Tour Strike ball (optional)"
      ],
      "keyFeel": "Hit the ball without touching the tee one inch behind it.",
      "pacing": "block",
      "days": [
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "15 shots",
      "clubs": [
        "7 Iron",
        "8 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/26_tee_behind_ball.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Tee sits one inch behind the ball; strike the ball without clipping the tee."
      },
      "why": "A tee just behind the ball makes a scoop obvious: if the club bottoms out early you hit the tee. It trains a forward low point and a downward attack angle with irons.",
      "instructions": [
        "Place a ball and push a tee into the ground about 1 inch behind it, with the head flush to the turf.",
        "Hit 5 shots at 60% speed trying not to touch the tee.",
        "Increase to 75% speed for 5 more shots.",
        "Remove the tee and hit 5 shots with the same low-point feel; check attack angle (target -4 to -6 with a 7 iron)."
      ],
      "checkpoints": {
        "dtl": "Club bottoms out ahead of the ball; divot starts at or after the ball.",
        "fo": "Weight on the lead side at impact; handle forward."
      },
      "modePlans": {
        "real": "Check attack angle on the monitor (needs club data); track the tee-touch count.",
        "almost": "Quiet version off a mat with foam balls; focus on strike, read HLA only."
      }
    },
    {
      "id": "narrow-stick-gate",
      "title": "Narrow Stick Gate",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Path Too In-to-Out",
      "faultTags": [
        "path-too-in-to-out"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Alignment sticks"
      ],
      "keyFeel": "Clip the inside stick and you dropped the club too far behind you.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "15 shots",
      "clubs": [
        "7 Iron",
        "8 Iron"
      ],
      "video": {
        "localPath": "shorts/27_narrow_stick_gate.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Two sticks outside the ball; the club passes between them without hitting the inside stick."
      },
      "why": "A path that is too far inside leads to pushes and push-hooks. A stick placed inside the ball line gives instant feedback when the club comes too far from the inside.",
      "instructions": [
        "Place one stick just outside the ball (target side) and one about a clubhead's width behind the ball on the inside.",
        "Make slow swings and watch the club path pass the inside stick without touching.",
        "Hit 5 balls at 60% speed; if you clip the inside stick, feel the hands stay in front of the trail hip.",
        "Increase to 75% for 10 shots; check path and start line."
      ],
      "checkpoints": {
        "dtl": "Club approaches slightly from the inside but never underneath the inside stick.",
        "fo": "Trail elbow in front of the hip at P6."
      },
      "modePlans": {
        "real": "Track path on the monitor; target about +1 to +3 with irons.",
        "almost": "Same with almost balls at 60%; read HLA."
      }
    },
    {
      "id": "hit-hard-stop-quick",
      "title": "Hit Hard, Stop Quick",
      "section": "P6-P8 Impact & Compression",
      "focus": "Early Flip",
      "faultTags": [
        "early-release-scoop"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Camera"
      ],
      "keyFeel": "Strike, then stop: the handle must still be ahead of the clubhead when you freeze.",
      "pacing": "block",
      "days": [
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "6 min",
      "reps": "3 x 8 swings",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/28_hit_hard_stop_quick.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Waist-high backswing, hit, stop; handle ahead of clubhead at the stop."
      },
      "why": "Stopping right after impact exposes an early flip: if you cannot hold the position, the hands and clubhead were not synced. Short swings force a forward handle.",
      "instructions": [
        "Take a waist-high backswing and swing through; stop the club about hip high through the ball.",
        "Hold the stop; the handle should be ahead of the clubhead and the lead wrist flat or bent forward.",
        "Hit at about 70% effort; try to keep the face square through the stop.",
        "Do 8 swings x 3 sets; film one set and check the stop position."
      ],
      "checkpoints": {
        "dtl": "At the stop, handle is ahead of the clubhead; shaft leaning toward the target.",
        "fo": "Chest facing the ball or slightly open; lead arm still connected."
      },
      "modePlans": {
        "real": "Hit 3 sets, then 5 full shots; check shaft lean via camera or HackMotion if available.",
        "almost": "Same with almost balls; quiet stops."
      }
    },
    {
      "id": "p6-to-impact",
      "title": "P6-to-Impact Short Swings",
      "section": "P6-P8 Impact & Compression",
      "focus": "Release Timing",
      "faultTags": [
        "early-release-scoop",
        "holding-off"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "impact",
      "equipment": [],
      "keyFeel": "Swing from shaft-parallel down to impact with the hands slightly ahead of the ball.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 10 short swings",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/29_p6_to_impact.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Short swings from P6 to impact; hands slightly ahead of the ball at contact."
      },
      "why": "Most release problems show up in the last few feet. Rehearsing P6 to impact in isolation lets you feel timing without the whole swing.",
      "instructions": [
        "Start with the club at P6 (shaft parallel to the ground, hands near the trail hip).",
        "Swing through the ball to hip high with a smooth release.",
        "Check that the hands are slightly ahead of the ball at contact and the face is square.",
        "Do 10 swings x 3 sets, then hit 5 balls with a full swing keeping that feel."
      ],
      "checkpoints": {
        "dtl": "Hands slightly ahead of the ball at impact; shaft leaning forward.",
        "fo": "Lead arm and club form a straight line at P7; no flipping."
      },
      "modePlans": {
        "real": "Short-swing balls first; then full swing; track attack angle.",
        "almost": "Same with almost balls at 50%.",
        "sore": "Dry slow rehearsals in a mirror, 20% speed, 3 sets of 10. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "wrist-twist-p2",
      "title": "Wrist Twist at P2",
      "section": "P1-P4 Backswing Structure",
      "focus": "Face Dial",
      "faultTags": [
        "face-control"
      ],
      "environments": [
        "mirror",
        "sim",
        "range"
      ],
      "swingPhase": "takeaway",
      "equipment": [],
      "keyFeel": "Pause at P2 with the face slightly down and dial the twist up or down to steer the flight.",
      "pacing": "block",
      "days": [
        "day-1-takeaway",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 6 swings",
      "clubs": [
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/30_wrist_twist_p2.mp4",
        "youtubeUrl": "",
        "diagram": "takeaway",
        "keyFrameCue": "At P2 the clubface points slightly toward the ground; exaggerate or soften the twist and watch the flight."
      },
      "why": "The face at P2 influences the face at the top. Learning to dial the twist at P2 gives you a controllable face reference for the whole swing.",
      "instructions": [
        "Take the club to P2 (shaft parallel, hands hip high) and pause.",
        "Look at the face: toe pointing up (open), face pointing toward the ground (slightly down), or somewhere between.",
        "Exaggerate the twist toward face-down for 3 swings and note the flight; then soften it for 3 swings.",
        "Pick the setting that produces a straight shot and repeat it."
      ],
      "checkpoints": {
        "dtl": "At P2 the leading edge is roughly parallel to your spine angle and the toe points up; face neither wide open nor shut.",
        "fo": "Hands in front of the chest; no excessive forearm roll."
      },
      "modePlans": {
        "real": "Compare face-to-path in each setting; log the best one.",
        "almost": "Same with almost balls; read HLA.",
        "sore": "Pause and dial at P2 with no ball, 20% speed, 3 sets of 6. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "low-tee-driver-bridge",
      "title": "Low-Tee Driver Bridge",
      "section": "Driver Launch & Start Line",
      "focus": "Driver vs Iron Release",
      "faultTags": [
        "driver-hook",
        "steep-driver-aoa"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Tee"
      ],
      "keyFeel": "Start with a low tee and wedge-like ball position, then raise and move forward gradually.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "10 min",
      "reps": "3 stages x 5 shots",
      "clubs": [
        "Driver"
      ],
      "video": {
        "localPath": "shorts/31_low_tee_driver_bridge.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Driver with a very low tee and a ball position like a wedge; raise the tee and move forward over three stages."
      },
      "why": "Many players release the driver like an iron and hook it. Starting low and centered shortens the arc and quiets the hands; gradually moving to a full driver setup carries the calm release into the normal position.",
      "instructions": [
        "Stage 1: tee barely above the ground, ball in the middle of the stance; hit 5 shots at 70% speed and watch start line.",
        "Stage 2: raise the tee a half inch and move the ball slightly forward; hit 5 shots, keeping the same release.",
        "Stage 3: normal driver tee height and ball position; hit 5 shots, release at about 80% intensity.",
        "Check the dial both ways; if the miss swings to the other side, back off one stage."
      ],
      "checkpoints": {
        "dtl": "Club approaches slightly from the inside; face closing gradually.",
        "fo": "Chest not open early; head stays behind the ball."
      },
      "modePlans": {
        "real": "Count how many of the 5 shots start on line in each stage; track face-to-path."
      }
    },
    {
      "id": "three-ball-ladder",
      "title": "Three-Ball Ladder",
      "section": "Scoring Wedges & Start Line",
      "focus": "Face Control",
      "faultTags": [
        "face-control",
        "driver-hook",
        "open-face-slice"
      ],
      "environments": [
        "sim"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Launch monitor"
      ],
      "keyFeel": "Hit one exaggerated slice feel, one exaggerated hook feel, and one middle ball.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "10 min",
      "reps": "3-4 rounds of 3 balls",
      "clubs": [
        "7 Iron",
        "Driver"
      ],
      "video": {
        "localPath": "shorts/32_three_ball_ladder.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Exaggerate slice feel, exaggerate hook feel, then find the middle."
      },
      "why": "Feeling both extremes gives you a reference for the neutral face. The middle ball becomes the one you can repeat on purpose.",
      "instructions": [
        "Hit ball 1 with an exaggerated slice feel (open face).",
        "Hit ball 2 with an exaggerated hook feel (closed face).",
        "Hit ball 3 trying to find the middle: straight start, neutral curve.",
        "Repeat 3-4 rounds, logging face angle and face-to-path each time."
      ],
      "checkpoints": {
        "dtl": "Club path within about 2 degrees of the target line on the middle ball.",
        "fo": "Face square within about 1-2 degrees at impact on the middle ball."
      },
      "modePlans": {
        "real": "Log face angle and face-to-path for each ball; the middle ball should land inside the two extremes."
      }
    },
    {
      "id": "straight-station",
      "title": "Straight Station",
      "section": "Scoring Wedges & Start Line",
      "focus": "Knowing Straight",
      "faultTags": [
        "face-control"
      ],
      "environments": [
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Alignment sticks"
      ],
      "keyFeel": "Make half swings through a stick gate with face and path both close to zero.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "8 min",
      "reps": "15 half swings",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/33_straight_station.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Half swings through a stick gate; path and face both within about 1 degree."
      },
      "why": "If you cannot hit a straight shot at slow speed, you have no zero reference. Spend about 15-20% of your reps proving you can find it.",
      "instructions": [
        "Set two sticks 2-3 feet ahead of the ball forming a gate on the target line.",
        "Make half swings (hip to hip) trying to start the ball through the gate.",
        "Check face and path on the monitor; both within about 1 degree.",
        "If the numbers drift, reduce speed until the zero returns, then build back up."
      ],
      "checkpoints": {
        "dtl": "Shaft returns to the target line at impact.",
        "fo": "Chest square at impact; no early opening."
      },
      "modePlans": {
        "real": "Count balls through the gate; keep 10 of 15 straight.",
        "almost": "Count gate passes with almost balls."
      }
    },
    {
      "id": "finish-and-freeze",
      "title": "Finish and Freeze",
      "section": "P6-P8 Impact & Compression",
      "focus": "Release Feedback",
      "faultTags": [
        "holding-off",
        "early-release-scoop"
      ],
      "environments": [
        "sim",
        "range",
        "mirror"
      ],
      "swingPhase": "finish",
      "equipment": [
        "Camera"
      ],
      "keyFeel": "Freeze your finish for two seconds with the toe of your trail foot up.",
      "pacing": "either",
      "days": [
        "day-3-impact",
        "kids-asleep",
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 8 swings",
      "clubs": [
        "7 Iron",
        "Driver"
      ],
      "video": {
        "localPath": "shorts/34_finish_freeze.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Hold the finish for 2 seconds; trail toe up, chest to target, weight on the lead foot."
      },
      "why": "A balanced finish proves the sequence was on time. Falling back or off balance usually means the release or weight shift was wrong.",
      "instructions": [
        "Hit a shot or make a swing at 70% speed.",
        "Freeze in the finish for 2 seconds; trail toe up, belt buckle facing the target.",
        "If you wobble, slow the swing; the release is out of sync with the body.",
        "Film one set from DTL and check the freeze."
      ],
      "checkpoints": {
        "dtl": "Trail foot on its toe, body stacked over the lead leg.",
        "fo": "Chest facing the target; club wrapped around the neck."
      },
      "modePlans": {
        "real": "Count balanced finishes out of 10.",
        "almost": "Same with almost balls.",
        "sore": "Slow finishes with no ball, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "swing-plate-45-check",
      "title": "Swing Plate 45 Degree Check",
      "section": "Mobility & Setup Calibration",
      "focus": "Driver Setup",
      "faultTags": [
        "poor-setup-posture"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "setup",
      "equipment": [
        "Swing plate"
      ],
      "keyFeel": "Set a plate at 45 degrees and freeze at address, P2 and P6 to check your setup.",
      "pacing": "block",
      "days": [
        "daily-calibration",
        "day-5-driver"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 5 freezes",
      "clubs": [
        "Driver"
      ],
      "video": {
        "localPath": "shorts/35_swing_plate_45.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Plate at 45 degrees, check address, then freeze at P2 and P6."
      },
      "why": "A swing plate shows whether your driver setup, plane and positions repeat. A check before you start makes the first shots more consistent.",
      "instructions": [
        "Place the swing plate at about 45 degrees to the target line.",
        "Set up with the driver and check ball position, spine tilt and distance from the plate.",
        "Swing to P2 and freeze; the club should match the plate angle.",
        "Swing to P6 and freeze; check the club is on the plate and not through it."
      ],
      "checkpoints": {
        "dtl": "Shaft parallels the plate at P2 and P6.",
        "fo": "Posture unchanged between address and P2."
      },
      "modePlans": {
        "real": "Run 3 sets, then hit 5 drives.",
        "almost": "Freeze checks with a short club and almost balls.",
        "sore": "Freeze checks with no ball, 20% speed, 3 sets. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "lead-side-brace-reps",
      "title": "Lead-Side Brace Reps",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Post, Then Turn",
      "faultTags": [
        "lazy-transition"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "transition",
      "equipment": [],
      "keyFeel": "Post on the lead leg first, then turn with long legs and a short torso.",
      "pacing": "block",
      "days": [
        "day-2-transition",
        "day-5-driver",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 8 slow reps",
      "clubs": [
        "7 Iron",
        "Driver"
      ],
      "video": {
        "localPath": "shorts/36_lead_side_brace.mp4",
        "youtubeUrl": "",
        "diagram": "shallow",
        "keyFrameCue": "Hips go back, lead leg braces, then the body turns."
      },
      "why": "Without a brace the hips spin and the club falls behind; contact degrades as the session goes on. Slow reps build the brace feel; add volume gradually.",
      "instructions": [
        "Set up and turn to P4 with weight loading into the trail side.",
        "Start down by pressing into the lead foot and posting on the lead leg; feel the hips move back, not at the ball.",
        "Keep the legs long and the torso short as you turn through.",
        "Do 8 slow reps, then 3 sets; build volume over several sessions."
      ],
      "checkpoints": {
        "dtl": "Lead leg straightens or posts; hips stay back.",
        "fo": "Weight on the lead heel at impact; no lead knee collapse."
      },
      "modePlans": {
        "real": "Rehearse slowly, then hit 5 balls; compare the first 3 and last 3 of the session.",
        "almost": "Same, with almost balls at 60%.",
        "sore": "Slow brace rehearsals only, 20% speed; reduce depth if any joint feels sore, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "door-drill",
      "title": "Door Drill",
      "section": "P6-P8 Impact & Compression",
      "focus": "Early Release / Hitting Up",
      "faultTags": [
        "early-release-scoop"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Door frame"
      ],
      "keyFeel": "Press into the lead side and let the club drop naturally to square impact.",
      "pacing": "block",
      "days": [
        "day-3-impact",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "3 x 8 reps",
      "clubs": [
        "7 Iron",
        "PW"
      ],
      "video": {
        "localPath": "shorts/37_door_drill.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Pressure on the lead side with the club dropping to a square impact position."
      },
      "why": "Hitting up on irons often comes from the weight staying back and the hands flipping. A door frame gives a fixed reference so you can feel pressure on the lead side.",
      "instructions": [
        "Stand with your lead hip near a door frame, club at P6.",
        "Press into the lead side without moving your head toward the target; feel the club drop naturally.",
        "Swing through at 50% speed with the face square at impact.",
        "Do 8 reps, then hit 5 shots keeping the lead pressure."
      ],
      "checkpoints": {
        "dtl": "Hands ahead of the ball at impact; no hand flip.",
        "fo": "Weight on the lead foot; chest open about 30 degrees."
      },
      "modePlans": {
        "real": "Door reps then 5 shots; attack angle should trend negative with irons.",
        "almost": "Same with almost balls.",
        "sore": "Slow door-frame pressure feels only, no club speed, 3 sets of 8. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "wood-block-push",
      "title": "Wood Block Push",
      "section": "P6-P8 Impact & Compression",
      "focus": "Holding vs Releasing",
      "faultTags": [
        "holding-off"
      ],
      "environments": [
        "mirror",
        "sim"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Wooden block"
      ],
      "keyFeel": "Push a flat clubface through impact with the hands leading, then let it release.",
      "pacing": "block",
      "days": [
        "day-3-impact"
      ],
      "modes": [
        "real",
        "almost"
      ],
      "duration": "6 min",
      "reps": "3 x 8 reps",
      "clubs": [
        "7 Iron"
      ],
      "video": {
        "localPath": "shorts/38_wood_block_push.mp4",
        "youtubeUrl": "",
        "diagram": "impact",
        "keyFrameCue": "Arms down, hands lead, push a flat face a few inches past impact, then release."
      },
      "why": "Holding off keeps the face open past impact. Pushing a flat face a few inches teaches you the feeling of the release being a natural result of the body turning.",
      "instructions": [
        "Place a small wooden block (or a firm headcover) at ball position.",
        "Set up and push the block with a flat face a few inches toward the target.",
        "Continue the swing and let the club release naturally past the block.",
        "Repeat 8 times, then hit 5 balls with a smooth release."
      ],
      "checkpoints": {
        "dtl": "Flat lead wrist at impact; no face rolling early.",
        "fo": "Forearms rotate after impact, not before."
      },
      "modePlans": {
        "real": "Check face-to-path on 5 balls after the block work.",
        "almost": "Same, with almost balls."
      }
    },
    {
      "id": "putting-mirror-gate",
      "title": "Putting Mirror + Gate",
      "section": "Scoring Wedges & Start Line",
      "focus": "Start Line & Stroke Path",
      "faultTags": [
        "putting-start-line"
      ],
      "environments": [
        "putting-mat",
        "mirror"
      ],
      "swingPhase": "putting",
      "equipment": [
        "Mirror",
        "Two tees or putter gate",
        "Putter"
      ],
      "keyFeel": "Keep the eyes over the ball and roll it through a tight gate.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "kids-asleep",
        "gym-sore",
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "20 putts from 4 ft",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/39_putting_mirror_gate.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Eyes over the ball, shoulders level, and the ball rolls through a gate two balls wide."
      },
      "why": "Most missed short putts start off line. A mirror shows eye and shoulder alignment; a gate gives instant start-line feedback.",
      "instructions": [
        "Place a mirror behind or beside the ball so you can see your eyes and shoulders (or use a phone camera).",
        "Set two tees a ball-and-a-half apart about 12 inches in front of the ball.",
        "Roll 20 putts from 4 ft; the ball must pass through without touching a tee.",
        "Log how many pass; check the mirror for eye line and shoulder tilt."
      ],
      "checkpoints": {
        "dtl": "Putter head swings along a gentle arc with the face square.",
        "fo": "Eyes directly over the ball line; shoulders level."
      },
      "modePlans": {
        "real": "Run on a mat or green; log gate passes.",
        "almost": "Quiet mat version; fully silent.",
        "sore": "Upright posture, slow strokes, gate only. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "putting-ruler-speed-ladder",
      "title": "Putting Ruler Speed Ladder",
      "section": "Scoring Wedges & Start Line",
      "focus": "Speed Control",
      "faultTags": [
        "putting-speed"
      ],
      "environments": [
        "putting-mat"
      ],
      "swingPhase": "putting",
      "equipment": [
        "Ruler or tape measure",
        "Putter"
      ],
      "keyFeel": "Match stroke length to distance and measure where the ball stops with a ruler.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "gym-sore",
        "kids-asleep"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "8 min",
      "reps": "3 balls each at 10, 20, 30 ft",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/40_putting_ruler_ladder.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "Putt to a ruler at 10, 20 and 30 feet; measure the distance past or short."
      },
      "why": "Putting speed is what keeps you out of three-putts. Measuring the miss with a ruler gives objective feedback.",
      "instructions": [
        "Place a ruler or tape marker as the target at 10 ft; putt 3 balls.",
        "Measure each ball's distance past or short of the ruler; aim to finish 0-12 inches past.",
        "Move to 20 ft, then 30 ft; keep the same tempo and adjust only stroke length.",
        "Log the average miss at each distance."
      ],
      "checkpoints": {
        "dtl": "Putter path arcs gently; stroke length scales with distance.",
        "fo": "Head still, shoulders rock, same tempo."
      },
      "modePlans": {
        "real": "Run on a green or mat; log average miss at each distance.",
        "almost": "Quiet mat version.",
        "sore": "Upright, slow strokes. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "putting-metronome-60",
      "title": "60 BPM Putting Metronome",
      "section": "Scoring Wedges & Start Line",
      "focus": "Putting Tempo",
      "faultTags": [
        "putting-speed",
        "rushed-tempo"
      ],
      "environments": [
        "putting-mat"
      ],
      "swingPhase": "putting",
      "equipment": [
        "Metronome",
        "Putter"
      ],
      "keyFeel": "Back on one beat, through on the next, same tempo for every putt.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "gym-sore",
        "kids-asleep",
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "15 putts",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/41_putting_metronome.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "A metronome at about 60 BPM; back on one beat, through on the next."
      },
      "why": "A steady tempo gives consistent speed. A metronome removes guesswork; only stroke length changes with distance.",
      "instructions": [
        "Set a metronome to about 60 BPM (see the 2:1 putting presets for the cadence timing).",
        "Start the stroke on one beat and reach impact on the next beat.",
        "Putt from 10, 20 and 30 ft changing only stroke length.",
        "Hit 15 putts; log the average distance past the hole."
      ],
      "checkpoints": {
        "dtl": "Stroke length scales with distance; tempo is constant.",
        "fo": "Quiet head, smooth acceleration through the ball."
      },
      "modePlans": {
        "real": "Run on a mat or green; log the average miss.",
        "almost": "Quiet mat version.",
        "sore": "Slow metronome strokes, upright. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "putting-devil-ball",
      "title": "Devil Ball Putting",
      "section": "Scoring Wedges & Start Line",
      "focus": "Start Line & Strike",
      "faultTags": [
        "putting-start-line"
      ],
      "environments": [
        "putting-mat"
      ],
      "swingPhase": "putting",
      "equipment": [
        "Irregular or marked ball",
        "Putter"
      ],
      "keyFeel": "Roll an uneven ball on the line you picked; a pure strike keeps it true.",
      "pacing": "block",
      "days": [
        "day-4-wedges",
        "kids-asleep",
        "gym-sore"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "6 min",
      "reps": "15 putts",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/42_putting_devil_ball.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "A ball with an irregular or weighted line reveals strike quality; roll it on the line you picked."
      },
      "why": "A weighted or irregular ball punishes poor strike and misalignment. A good strike makes it roll true.",
      "instructions": [
        "Use a weighted or marked training ball (or a ball with a line drawn).",
        "Pick a spot 3 ft in front of the ball and aim the line at it.",
        "Roll 15 putts; the line on the ball should roll end over end.",
        "Log how many roll true; adjust strike point and face angle."
      ],
      "checkpoints": {
        "dtl": "Face square and strike on the sweet spot.",
        "fo": "Eyes over the ball; head still."
      },
      "modePlans": {
        "real": "Use on a mat or green; log true rolls.",
        "almost": "Quiet mat version.",
        "sore": "Slow strokes, upright. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "putting-timed-4ft-pressure",
      "title": "Timed 4-Foot Pressure Putts",
      "section": "Course Transfer & Pressure",
      "focus": "Short Putt Pressure",
      "faultTags": [
        "short-putt-pressure",
        "putting-start-line"
      ],
      "environments": [
        "putting-mat",
        "course"
      ],
      "swingPhase": "putting",
      "equipment": [
        "Putter",
        "Timer"
      ],
      "keyFeel": "Make as many 4-footers as you can in a fixed time, one routine, no practice strokes.",
      "pacing": "transfer",
      "days": [
        "day-4-wedges",
        "daily-calibration"
      ],
      "modes": [
        "real",
        "almost",
        "sore"
      ],
      "duration": "5 min",
      "reps": "3 rounds of 10 putts",
      "clubs": [
        "Putter"
      ],
      "video": {
        "localPath": "shorts/43_putting_timed_4ft.mp4",
        "youtubeUrl": "",
        "diagram": "wedge",
        "keyFrameCue": "10 putts from 4 ft against a timer; log makes."
      },
      "why": "Pressure turns a technical stroke into a decision. A timer adds consequence and trains you to commit.",
      "instructions": [
        "Place 10 balls in a circle 4 ft from the cup.",
        "Set a timer (about 90 seconds for 10 putts).",
        "Hole as many as you can with a consistent routine; each miss costs the time it takes to reset.",
        "Log makes per round; try to beat it next session."
      ],
      "checkpoints": {
        "dtl": "Same stroke length and tempo on every putt.",
        "fo": "Routine unchanged under time pressure."
      },
      "modePlans": {
        "real": "Run on a mat or green with a cup.",
        "almost": "Quiet mat version.",
        "sore": "Upright slow putts, no timer. Safety: muscular soreness 3/10 or less only. Stop on sharp or joint pain. After heavy pull/deadlift days skip loaded rotation and wrist flexion."
      }
    },
    {
      "id": "gym-kettlebell-swings",
      "title": "Kettlebell Swings (Speed Prep)",
      "section": "Driver Launch & Start Line",
      "focus": "Hip Drive & Ground Force",
      "faultTags": [
        "low-speed",
        "lazy-transition"
      ],
      "environments": [
        "gym"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Kettlebell"
      ],
      "keyFeel": "Snap the hips and let the bell float; the power comes from the glutes, not the arms.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "10 min",
      "reps": "4 sets of 10",
      "clubs": [],
      "video": {
        "localPath": "shorts/44_gym_kettlebell_swings.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Hinge, then snap the hips forward and let the kettlebell float to chest height."
      },
      "why": "Kettlebell swings train explosive hip extension and posterior-chain power, the engine for club speed. They are a gym session, not a range drill.",
      "instructions": [
        "Use a moderate bell; feet shoulder-width, hinge at the hips, flat back.",
        "Hike the bell back, then snap the hips forward and let the bell float to chest height (arms relaxed).",
        "Do 4 sets of 10 with 60-90 s rest; stop a set if the form breaks down.",
        "Smash-factor guard: if you test speed after this session, stop if smash drops below about 1.40 or contact degrades; cut back volume."
      ],
      "checkpoints": {
        "dtl": "Flat back and hip hinge; no rounding.",
        "fo": "Shoulders square, no sway."
      },
      "modePlans": {
        "real": "Gym session before or after a golf day; keep it away from heavy lower-body days so your legs are fresh for ball striking."
      }
    },
    {
      "id": "gym-cable-chops",
      "title": "Cable Chops (Rotational Power)",
      "section": "Driver Launch & Start Line",
      "focus": "Rotation & Core Sequencing",
      "faultTags": [
        "low-speed",
        "overturning"
      ],
      "environments": [
        "gym"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Cable machine"
      ],
      "keyFeel": "Rotate from the hips first, then the chest, and keep the arms long.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "8 min",
      "reps": "3 sets of 8 each side",
      "clubs": [],
      "video": {
        "localPath": "shorts/45_gym_cable_chops.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Hip rotation first, then chest, arms long, resisting the cable."
      },
      "why": "Cable chops build rotational strength and teach the pelvis-to-chest sequence without any golf swing.",
      "instructions": [
        "Set a cable at shoulder height and stand side-on with a split stance.",
        "Pull the cable diagonally across your body, rotating hips then chest.",
        "Keep your arms long and your head still.",
        "Do 3 sets of 8 each side. Smash-factor guard: if you test speed afterwards, stop if smash drops below about 1.40 or contact degrades."
      ],
      "checkpoints": {
        "dtl": "Hips lead the rotation; spine angle stable.",
        "fo": "Chest rotates after the pelvis."
      },
      "modePlans": {
        "real": "Gym session; do not do heavy rotational work the day before a hard ball-striking day."
      }
    },
    {
      "id": "gym-jump-training",
      "title": "Jump Training (Ground Force)",
      "section": "Driver Launch & Start Line",
      "focus": "Explosive Lower Body",
      "faultTags": [
        "low-speed",
        "lazy-transition"
      ],
      "environments": [
        "gym"
      ],
      "swingPhase": "transition",
      "equipment": [
        "Box or soft surface"
      ],
      "keyFeel": "Push into the ground and jump high; land softly and reset between reps.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "8 min",
      "reps": "4 sets of 5 jumps",
      "clubs": [],
      "video": {
        "localPath": "shorts/46_gym_jump_training.mp4",
        "youtubeUrl": "",
        "diagram": "posture",
        "keyFrameCue": "Load, push hard into the ground, jump, land quiet, reset."
      },
      "why": "Vertical jumps train the ground-force timing that powers a fast downswing.",
      "instructions": [
        "Stand on a flat, non-slip surface.",
        "Squat to a quarter depth, then jump as high as you can.",
        "Land softly with bent knees and reset before the next rep.",
        "Do 4 sets of 5; stop if any joint complains. Smash-factor guard: if you test speed afterwards, stop if smash drops below about 1.40 or contact degrades."
      ],
      "checkpoints": {
        "dtl": "Spine stays long and stable; no collapse on landing.",
        "fo": "Knees track over toes."
      },
      "modePlans": {
        "real": "Gym session; skip on heavy lower-body days."
      }
    },
    {
      "id": "gym-overload-underload-swings",
      "title": "Overload / Underload Swing Training",
      "section": "Driver Launch & Start Line",
      "focus": "Club Head Speed Training",
      "faultTags": [
        "low-speed"
      ],
      "environments": [
        "gym",
        "sim",
        "range"
      ],
      "swingPhase": "impact",
      "equipment": [
        "Weighted club or speed stick",
        "Light club or speed stick",
        "Launch monitor"
      ],
      "keyFeel": "Alternate heavy and light swings, max effort with balance, and stop when contact or smash fades.",
      "pacing": "block",
      "days": [
        "day-5-driver"
      ],
      "modes": [
        "real"
      ],
      "duration": "12 min",
      "reps": "3 rounds: 3 heavy, 3 normal, 3 light",
      "clubs": [
        "Driver"
      ],
      "video": {
        "localPath": "shorts/47_overload_underload.mp4",
        "youtubeUrl": "",
        "diagram": "driver",
        "keyFrameCue": "Heavy swings first, then normal, then light; max intent with balance."
      },
      "why": "Overload and underload swing training lets the nervous system practice faster speeds. It only helps if contact holds, so a smash-factor guard is part of the drill.",
      "instructions": [
        "Warm up, then make 3 maximum-effort swings with the overload implement.",
        "Make 3 swings with your normal driver (or hit balls) at maximum controlled effort.",
        "Make 3 swings with the underload implement, trying for your fastest.",
        "Smash-factor guard: stop if smash drops below about 1.40 or contact degrades. Rest 20-30 s between max swings and keep the total to 2-3 clusters."
      ],
      "checkpoints": {
        "dtl": "Same plane as your normal swing; no loss of posture.",
        "fo": "Balanced finish."
      },
      "modePlans": {
        "real": "Weekly only while contact holds; log club head speed and smash."
      }
    }
  ],
  "goals": [
    {
      "id": "goal-daily-delivery",
      "title": "Daily Delivery Consistency (5+ Days/Week)",
      "category": "Habit & Volume",
      "metric": "Met Daily Delivery Check-In (Real, Almost, or Gym-Sore)",
      "target": "22+ green days per 30 days",
      "progress": 65,
      "notes": "Use Almost Golf Balls when kids are asleep or Gym-Sore Slow-Mo flows on heavy lifting days so streaks stay alive!"
    },
    {
      "id": "goal-p2-takeaway",
      "title": "P2 Takeaway Clubhead Over Hands (Kinovea DTL)",
      "category": "Mechanics P1-P4",
      "metric": "9/10 swings pass Headcover Gate without rolling inside",
      "target": "90% pass rate on Kinovea Replay",
      "progress": 55,
      "notes": "Re-check P2 frame every 3rd swing in Kinovea 2x2 top-left/top-right windows."
    },
    {
      "id": "goal-p5-shallowing",
      "title": "Transition Shallowing & Trail Elbow Slot (P5-P6)",
      "category": "Mechanics P4-P6",
      "metric": "Shaft tracks at or inside plane line; GSPro Path -1.5 to +2.5",
      "target": "Stock neutral/slight-draw path",
      "progress": 40,
      "notes": "Split-Hand Pumps before live balls keep lower body starting first. Path needs Launch Pro club data."
    },
    {
      "id": "goal-wedge-matrix",
      "title": "Dialed 3-Clock Wedge Carry Matrix (50–105 yds)",
      "category": "Scoring",
      "metric": "Average miss within +/- 4 yards of target window",
      "target": "All 3 wedges mapped (8/9/10:30)",
      "progress": 50,
      "notes": "Run 3-Clock Wedge Matrix every Day 4 and save screenshot/notes."
    },
    {
      "id": "goal-driver-startline",
      "title": "Eliminate Two-Way Miss with Driver",
      "category": "Course Transfer",
      "metric": "50-60% of drives inside a 40-yard corridor; misses on one side only",
      "target": "50-60% fairways in Challenge (40-yd corridor)",
      "progress": 45,
      "notes": "Stick to one committed start-line window and balance-hold finishes."
    },
    {
      "id": "goal-hackmotion-impact-compression",
      "title": "HackMotion Impact Flexion vs Your Top Reading",
      "category": "Mechanics P6-P8",
      "metric": "8/10 7-iron shots read ~5–10° more lead wrist flexion at impact than at the top",
      "target": "80% of iron shots in your own impact window",
      "progress": 70,
      "notes": "No scooping! Readings are calibration-dependent, so compare to your own address/top values, not tour numbers."
    },
    {
      "id": "goal-tempo-cadence-consistency",
      "title": "Tour Tempo Cadence 3:1 Lock (24/8 Ratio)",
      "category": "Rhythm & Timing",
      "metric": "Maintain 3.0:1 swing tempo ratio within ±1 frame at 30fps (±2 at 60fps) on Kinovea",
      "target": "24/8 standard cadence on 85% of simulator swings",
      "progress": 60,
      "notes": "Use built-in Cadence Metronome during GSPro practice rounds."
    }
  ],
  "courseCategories": [
    {
      "id": "drills-playground",
      "label": "Drills, Range & Playgrounds",
      "icon": "🎯",
      "description": "Skills challenges, explosive target playgrounds, short-game complexes & distance-ladder training layouts."
    },
    {
      "id": "short-par3",
      "label": "Short Courses & Par 3s",
      "icon": "⛳",
      "description": "Pitch-and-putt loops and Par 3 courses (9 to 18 holes) for scoring wedges, iron flighting & quick 20-min rounds."
    },
    {
      "id": "kids-asleep-almost",
      "label": "Kids Asleep / Almost (<125y)",
      "icon": "🌙",
      "description": "Pitch-and-putt or short tee loops under ~1,800y where smooth wedges & 9-irons feel true even with Almost Golf Balls."
    },
    {
      "id": "forgiving-scoring",
      "label": "Forgiving & Confidence",
      "icon": "😌",
      "description": "Wide landing zones, resort setups, or playable tracks great for casual rounds and building driver confidence."
    },
    {
      "id": "bucket-majors",
      "label": "Bucket-List Majors & Tour",
      "icon": "🏆",
      "description": "Major championship & PGA Tour host venues to test course management and one-side-miss driver discipline."
    },
    {
      "id": "links-dunes",
      "label": "Links, Coastal & Dunes",
      "icon": "🌊",
      "description": "Seaside wind, rumpled dunes & ground-game bump-and-run creativity."
    },
    {
      "id": "mountain-desert",
      "label": "Mountain, Desert & Altitude",
      "icon": "🏔️",
      "description": "Dramatic elevation drops, canyon targets, or high-altitude thin-air carry calibration."
    },
    {
      "id": "fantasy-group",
      "label": "Fantasy, Wild & Group Fun",
      "icon": "🐉",
      "description": "Creative fantasy layouts, islands/caves, and fun beer-round venues with friends."
    }
  ],
  "customPracticeRounds": [
    {
      "id": "crd-short-game",
      "name": "Short Game",
      "courseName": "Whispering Pines",
      "courseKey": "whispering_pines_gsp",
      "shots": 6,
      "attempts": 18,
      "surfaces": [
        "Fairway",
        "Rough",
        "Sand Bunker"
      ],
      "focus": "Wedge Trajectory & Sand/Rough Saves",
      "drillNote": "6 stations x 3 balls each across fairway, rough, and bunkers on Whispering Pines (holes 1, 3, 6, 13, 17). Pair with Wedge Clock (8:00/9:00) + Start-Line Gate."
    },
    {
      "id": "crd-par3-challenge",
      "name": "Par 3 Challenge",
      "courseName": "Whispering Pines",
      "courseKey": "whispering_pines_gsp",
      "shots": 1,
      "attempts": 1,
      "surfaces": [
        "Tee"
      ],
      "focus": "Pressure One-Shot Par 3 Execution",
      "drillNote": "Single-hole pressure tee shot on Whispering Pines Hole 14. Treat like Day 1/Day 4 transfer rep—full pre-shot routine + Kinovea DTL plane check."
    },
    {
      "id": "crd-night-range",
      "name": "Night Range Challenge",
      "courseName": "Night Range",
      "courseKey": "nightrange_v2_gsp",
      "shots": 18,
      "attempts": 18,
      "surfaces": [
        "Tee"
      ],
      "focus": "18-Station Target Dispersion Test",
      "drillNote": "18 consecutive tee target challenges. (Note: requires Night Range course installed if not currently in Courses/ — great blueprint for night block tests on GSPRange22/Top of the Rock Range)."
    },
    {
      "id": "crd-par3-x4",
      "name": "Par 3 x 4",
      "courseName": "Premonition",
      "courseKey": "Premonition_gsp",
      "shots": 4,
      "attempts": 4,
      "surfaces": [
        "Tee"
      ],
      "focus": "4-Hole Iron Stock Yardage Block",
      "drillNote": "4 Par-3 tee shots back-to-back. Recreate on any installed course using its Par 3 Tee preset when Premonition isn't downloaded."
    },
    {
      "id": "crd-difficult-lie",
      "name": "Difficult Lie 10 Shot Challenge",
      "courseName": "Premonition",
      "courseKey": "Premonition_gsp",
      "shots": 5,
      "attempts": 10,
      "surfaces": [
        "Rough",
        "Fairway"
      ],
      "focus": "Heavy Rough & Uneven Lie Low-Point Control",
      "drillNote": "5 stations x 2 shots from rough/tight fairway lies testing steep vs clean contact and carry penalty awareness."
    },
    {
      "id": "crd-hills-10",
      "name": "The Hills 10 Shot Challenge",
      "courseName": "The Hills Course",
      "courseKey": "The_Hills_Course_gsp",
      "shots": 10,
      "attempts": 10,
      "surfaces": [
        "Fairway",
        "Tee"
      ],
      "focus": "Elevation-Adjusted Approach Carry",
      "drillNote": "10 approach/tee shots testing slope calculation (+uphill/+downhill adjustment) without rushing transition."
    },
    {
      "id": "crd-mid-game",
      "name": "Mid Round / Mid Game",
      "courseName": "Top of the World",
      "courseKey": "top_of_the_world_gsp",
      "shots": 6,
      "attempts": 12,
      "surfaces": [
        "Fairway",
        "Tee"
      ],
      "focus": "Scoring Irons (130–185y)",
      "drillNote": "6 mid-iron approach/tee stations x 2 attempts each—ideal for P6->P8 compression & start-line discipline."
    },
    {
      "id": "crd-bad",
      "name": "The BAD Challenge",
      "courseName": "BAD HIO Challenge",
      "courseKey": "bad_hio_challenge_gsp",
      "shots": 1,
      "attempts": 1,
      "surfaces": [
        "Tee"
      ],
      "focus": "Closest-to-Pin / Ace Hunting",
      "drillNote": "1-shot Hole-In-One shootout station. Recreate on The Hay #7 or Flushing Meadows when playing with friends."
    },
    {
      "id": "crd-over-house",
      "name": "Over the House Challenge",
      "courseName": "Lot 15 - OG Course",
      "courseKey": "Lot15_gsp",
      "shots": 1,
      "attempts": 10,
      "surfaces": [
        "Tee"
      ],
      "focus": "High Launch Flop / Carry Clearance",
      "drillNote": "10 high-lofted shots clearing an elevated obstacle—great inspiration for flop/lofted wedge windows on Riverwalk Skills Challenge."
    }
  ],
  "courses": [
    {
      "id": "3s_greenville",
      "name": "3s Greenville",
      "location": "Greenville, SC",
      "designer": "JPruitt10",
      "par": 54,
      "holes": 18,
      "altitudeFt": 3228,
      "tees": {
        "black": 2375,
        "white": 2084,
        "green": 1558,
        "red": 0,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "83-167y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "short-par3",
        "drills-playground",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "60-167y Iron & Wedge Par 3",
        "Low-Stress 18h",
        "Target Greens"
      ],
      "drillNote": "Super playable 18-hole Par 3 (Black 2,375y / White 2,084y / Green 1,558y). Play Green tees (60-135y) for pure wedge/PW scoring or White/Black to sharpen 7-iron through GW distance control.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "gate-towel-lowpoint",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "A-Ga-Ming_Sundance_v1_gsp",
      "name": "A-Ga-Ming Sundance",
      "location": "Kewadin, MI",
      "designer": "BoilerTom",
      "par": 72,
      "holes": 18,
      "altitudeFt": 2133,
      "tees": {
        "black": 6078,
        "white": 5546,
        "green": 0,
        "red": 4736,
        "junior": 0,
        "par3": 1685
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring",
        "mountain-desert"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Tree-Lined Resort Golf",
        "Mid-Yardage Scoring",
        "Par 3 Loop (1685y)"
      ],
      "drillNote": "Playable Michigan resort track (6,078y Black / 5,546y White) with elevation changes; includes a 1,685y Par 3 tee (40-144y) great for wedge/iron practice.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "Alpine Valley_GSP",
      "name": "Swiss Alpine Valley",
      "location": "Davos, Graubünden, Switzerland",
      "designer": "Greg McDonald",
      "par": 71,
      "holes": 18,
      "altitudeFt": 6565,
      "tees": {
        "black": 0,
        "white": 5610,
        "green": 0,
        "red": 5160,
        "junior": 2965,
        "par3": 2497
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "mountain-desert",
        "fantasy-group"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Thin-Air 6,565 ft Carry Gains",
        "Risk-Reward Valley Holes",
        "Scenic Fun"
      ],
      "drillNote": "Fictional Swiss Alps course at 6,565 ft Davos elevation—track carry gains (~8-10% longer) and use Par 3 tee (2,497y) or Junior tee (2,965y) for iron shaping.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "step-through-pressure-shift"
      ]
    },
    {
      "id": "animalrange",
      "name": "Clarksons Farm (Animal Range)",
      "location": "Clarksons Farm, UK",
      "designer": "johnmeyer",
      "par": 67,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 0,
        "white": 69,
        "green": 0,
        "red": 32,
        "junior": 23,
        "par3": 0
      },
      "holeRange": "",
      "favorite": true,
      "rating": 4,
      "categories": [
        "drills-playground",
        "fantasy-group",
        "kids-asleep-almost"
      ],
      "drillFocus": "short-game",
      "bestFor": [
        "Explosive Target Playground",
        "Start-Line Aiming",
        "Fun With Kids"
      ],
      "drillNote": "Open in On-Course Practice Mode! Aim at animals, buildings, and objects around the farm to trigger hilarious 'explosive' reactions—awesome start-line target game or relaxed stress-relief drill session.",
      "recommendedDrills": [
        "putting-chipping-startline",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "bandon_v2_gsp",
      "name": "Bandon Dunes",
      "location": "Bandon, OR",
      "designer": "Community Build",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6457,
        "white": 5517,
        "green": 0,
        "red": 4874,
        "junior": 3374,
        "par3": 2561
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Pacific Bluff Wind",
        "Low Punch / Trajectory Control",
        "Links Ground Game"
      ],
      "drillNote": "Turn coastal wind up 12-18 mph to practice knock-down 9-to-3 iron flights and low-point compression; Par 3 tee (2,561y) also plays cleanly as an iron clinic.",
      "recommendedDrills": [
        "nine-to-three-delivery",
        "gate-towel-lowpoint",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "bandontrails_gsp",
      "name": "Bandon Trails",
      "location": "Bandon, OR",
      "designer": "Adamtc4",
      "par": 71,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6196,
        "white": 0,
        "green": 5726,
        "red": 0,
        "junior": 3517,
        "par3": 2005
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Dunes-to-Forest Transitions",
        "Positional Tee Shots",
        "Coore & Crenshaw Design"
      ],
      "drillNote": "More inland tree-lined targets than Bandon Dunes—rewards one-side-miss driver/3W commitment off the tee and clean approach distances.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "pump-and-drop-p5"
      ]
    },
    {
      "id": "bayhill_gsp",
      "name": "Bay Hill",
      "location": "Orlando, FL",
      "designer": "soupy",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6631,
        "white": 5791,
        "green": 5335,
        "red": 4776,
        "junior": 3035,
        "par3": 2244
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Arnold Palmer Invitational",
        "Water Carries on Closing Holes",
        "Long Iron Control"
      ],
      "drillNote": "Demanding PGA Tour test requiring confident water carries and solid lead-wrist compression under pressure on 16-18.",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "bear_dance_v1_gsp",
      "name": "Bear Dance Golf Club",
      "location": "Larkspur, CO",
      "designer": "Mashie",
      "par": 72,
      "holes": 18,
      "altitudeFt": 6801,
      "tees": {
        "black": 6657,
        "white": 5742,
        "green": 7038,
        "red": 6451,
        "junior": 4514,
        "par3": 1896
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Colorado Mile-High Bombs (6,800 ft)",
        "Pine Framing",
        "Short Par-3 Tees (1896y)"
      ],
      "drillNote": "At 6,800 ft in Larkspur, CO your driver flies ~10% farther! Plus check the Par 3 tee (1,896y, 81-131y holes)—one of the hidden best 18-hole wedge loops on your disk.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "blackberry_oaks_gsp",
      "name": "Blackberry Oaks",
      "location": "Bristol, IL",
      "designer": "soupy",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 0,
        "white": 5495,
        "green": 5176,
        "red": 4808,
        "junior": 2881,
        "par3": 2477
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Relaxed Parkland 5,500y",
        "Confidence Scoring",
        "Everyday Play"
      ],
      "drillNote": "Approachable 5,495y White / 5,176y Green layout ideal when you want an authentic full round that builds birdie momentum without unfair penal rough.",
      "recommendedDrills": [
        "nine-to-three-delivery",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "cabotcliffs_gsp",
      "name": "Cabot Cliffs",
      "location": "Cape Breton, Canada",
      "designer": "Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 50,
      "tees": {
        "black": 6121,
        "white": 5527,
        "green": 5812,
        "red": 4650,
        "junior": 3990,
        "par3": 2137
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Ocean Cliff Vistas",
        "Finishing Stretch 15-18",
        "Hero Drive Commitments"
      ],
      "drillNote": "Bucket-list coastal links—don't miss cliffside #16 Par 3 and reachable #18 Par 5. Great venue to test Kinovea balance hold under bold target lines.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "step-through-pressure-shift"
      ]
    },
    {
      "id": "castleheights_v2_gsp",
      "name": "Castle Heights GC",
      "location": "Fictional Mountains",
      "designer": "johnmeyer",
      "par": 71,
      "holes": 18,
      "altitudeFt": 3000,
      "tees": {
        "black": 6325,
        "white": 6141,
        "green": 0,
        "red": 0,
        "junior": 3261,
        "par3": 2619
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "fantasy-group",
        "mountain-desert"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Medieval Castle Backdrop",
        "Tight Hazard Driving",
        "Punishing Penalty Test"
      ],
      "drillNote": "Deep rough and cliffside hazards demand strict tee accuracy—play as a 'fairways or bust' driver accountability round.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "noodle-plane-gate"
      ]
    },
    {
      "id": "central_park_lower_gsp",
      "name": "Central Park South",
      "location": "New York City, New York, USA",
      "designer": "runpuddrun/rdeyer",
      "par": 72,
      "holes": 18,
      "altitudeFt": 52,
      "tees": {
        "black": 6740,
        "white": 5304,
        "green": 0,
        "red": 4518,
        "junior": 848,
        "par3": 2020
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "fantasy-group",
        "drills-playground",
        "kids-asleep-almost"
      ],
      "drillFocus": "wedge-clock",
      "bestFor": [
        "NYC Landmark Holes",
        "848y Junior Pitch & Putt",
        "Built-In Central Par Range"
      ],
      "drillNote": "NYC South Course! Hidden gem: Junior tees total just 848 yards (17-70y per hole!) turning Central Park into a quiet night pitch-and-putt, plus the Central Par range sits between North & South!",
      "recommendedDrills": [
        "wedge-distance-clock",
        "putting-chipping-startline"
      ]
    },
    {
      "id": "central_park_upper_gsp",
      "name": "Central Park North",
      "location": "New York, New York, USA",
      "designer": "runpuddrun/rdeyer",
      "par": 72,
      "holes": 18,
      "altitudeFt": 246,
      "tees": {
        "black": 7069,
        "white": 5802,
        "green": 0,
        "red": 4693,
        "junior": 899,
        "par3": 1954
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "fantasy-group",
        "forgiving-scoring"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Wide Fairways 7,069y",
        "Bomber Driver Day",
        "Junior 899y Night Loop"
      ],
      "drillNote": "Bigger, wider fairways than South Course—turn loose Day 5 Driver swing speed here, or switch to the 899y Junior tees when kids are asleep.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "cypress_point_club_v3_3_gsp",
      "name": "Cypress Point Club",
      "location": "Pebble Beach, CA",
      "designer": "Stingreye, Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 262,
      "tees": {
        "black": 5910,
        "white": 5698,
        "green": 0,
        "red": 5291,
        "junior": 3504,
        "par3": 2366
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Monterey Coastline #15-#17",
        "5,910y Classic Shotmaking",
        "Forced Ocean Carries"
      ],
      "drillNote": "Shorter 5,910y championship track where precision iron trajectory beats raw length—test #15 and #16 ocean carries cleanly.",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "headcover-outside-takeaway"
      ]
    },
    {
      "id": "Domaine_Laforest_gsp",
      "name": "Domaine Laforest",
      "location": "Charlevoix-Est, QC",
      "designer": "Kraizzed",
      "par": 72,
      "holes": 18,
      "altitudeFt": 2628,
      "tees": {
        "black": 0,
        "white": 5692,
        "green": 5924,
        "red": 4863,
        "junior": 2771,
        "par3": 2230
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Quebec Hidden Gem",
        "Augusta-Like Conditioning",
        "Rolling Terrain"
      ],
      "drillNote": "Gorgeous private Canadian mountain-forest course (5,692y White / 5,924y Green)—great mix of elevated approaches and clean visuals.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "dpc_scottsdale_gsp",
      "name": "TPC Scottsdale (DPC Legacy)",
      "location": "Phoenix, Arizona, USA",
      "designer": "runpuddrun, rdeyer",
      "par": 71,
      "holes": 18,
      "altitudeFt": 1257,
      "tees": {
        "black": 6677,
        "white": 5598,
        "green": 0,
        "red": 5011,
        "junior": 1043,
        "par3": 1930
      },
      "holeRange": "",
      "favorite": false,
      "rating": 3,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Legacy DPC Stadium Build",
        "16th Stadium Par 3 Prep",
        "Arizona Desert"
      ],
      "drillNote": "Early DPC community build of TPC Scottsdale (see also tpcscottsdale_v4_gsp). Same 1,043y Junior and 1,930y Par 3 tees if you want desert wedge targets.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "dpc_sodgrass_gsp",
      "name": "DPC Sodgrass",
      "location": "Ponte Vedra, FL, USA",
      "designer": "DPR-OPCD",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6624,
        "white": 5879,
        "green": 4929,
        "red": 4599,
        "junior": 3521,
        "par3": 2371
      },
      "holeRange": "",
      "favorite": false,
      "rating": 3,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Legacy DPC Sawgrass Build",
        "Island #17 Target",
        "Risk-Reward Par 5s"
      ],
      "drillNote": "Legacy DPC build of TPC Sawgrass Stadium Course (twin to The Home of the Players). Still great for 17th Island Green nearest-to-pin pressure reps!",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "edgewood_tahoe_v1_gsp",
      "name": "Edgewood Tahoe",
      "location": "Stateline, NV",
      "designer": "Mashie",
      "par": 72,
      "holes": 18,
      "altitudeFt": 6201,
      "tees": {
        "black": 0,
        "white": 5795,
        "green": 6082,
        "red": 5006,
        "junior": 3936,
        "par3": 1960
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Lake Tahoe 6,200 ft Altitude",
        "Relaxed Celebrity Vibe",
        "Wide Tree-Lined Drives"
      ],
      "drillNote": "6,200 ft alpine lake golf—very playable 5,795y White tees plus wide pine corridors for freeing up driver launch (+2 to +4 AoA) and enjoying lakeside closing holes.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "step-through-pressure-shift"
      ]
    },
    {
      "id": "farmlinks_al_2_7_gsp",
      "name": "Farmlinks Golf Club",
      "location": "Sylacauga, AL",
      "designer": "Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6720,
        "white": 5862,
        "green": 5378,
        "red": 4714,
        "junior": 3765,
        "par3": 2367
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "forgiving-scoring",
        "mountain-desert"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Resort Scoring & Fun",
        "Signature #5 Cliff Par 3",
        "Elevation Wedge Play"
      ],
      "drillNote": "Wide, immaculate resort course famous for huge elevation changes and the dramatic cliff drop Par 3 #5—great 'feel-good' scoring track.",
      "recommendedDrills": [
        "nine-to-three-delivery",
        "driver-headcover-aoa"
      ]
    },
    {
      "id": "fishersisland_gsp",
      "name": "Fishers Island Club",
      "location": "Fishers Island, NY",
      "designer": "Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6030,
        "white": 5571,
        "green": 4620,
        "red": 0,
        "junior": 3206,
        "par3": 2133
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Seth Raynor Template Greens",
        "Seaside Wind",
        "Sub-6,030y Architecture"
      ],
      "drillNote": "Coastal NY gem by Seth Raynor—blind/elevated approaches demand disciplined alignment and center-face compression over pure bomber speed.",
      "recommendedDrills": [
        "gate-towel-lowpoint",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "FlushingMeadowsPitchandPutt_GSP",
      "name": "Flushing Meadows Pitch and Putt",
      "location": "Queens, New York",
      "designer": "JROCKAWAY",
      "par": 54,
      "holes": 18,
      "altitudeFt": 29,
      "tees": {
        "black": 0,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 0,
        "par3": 902
      },
      "holeRange": "38-76y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "drills-playground",
        "short-par3",
        "kids-asleep-almost",
        "forgiving-scoring"
      ],
      "drillFocus": "wedge-clock",
      "bestFor": [
        "Pitch & Putt 38-76y",
        "3-Clock Wedges",
        "Kids Asleep Loop"
      ],
      "drillNote": "TOP DRILL COURSE: All 18 holes sit between 38 and 76 yards (902y total). Built specifically for 8:00/9:00 wedge clock calibration, partial PW/SW gapping, and quiet Almost Golf Ball loops after kids go to bed.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "putting-chipping-startline",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "georgia_threes_gsp",
      "name": "Georgia Threes",
      "location": "Magnolia, GA",
      "designer": "DPRoberts",
      "par": 27,
      "holes": 9,
      "altitudeFt": 0,
      "tees": {
        "black": 977,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "71-128y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "short-par3",
        "bucket-majors",
        "kids-asleep-almost"
      ],
      "drillFocus": "wedge-clock",
      "bestFor": [
        "Augusta Par 3 Replica",
        "Water Carry Wedges",
        "Quick 9 Holes"
      ],
      "drillNote": "Masters Wednesday vibes in 9 holes (977y total, 71-128y holes over creeks and ponds). Demands spin control and clean start-line commitment without needing driver.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "putting-chipping-startline",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "georgiacc_v2_gsp",
      "name": "Georgia Golf Club",
      "location": "Augusta, GA",
      "designer": "Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6914,
        "white": 5850,
        "green": 5039,
        "red": 4314,
        "junior": 3537,
        "par3": 2094
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Augusta National Experience",
        "Amen Corner 11-13",
        "Precise Draw/Fade Shaping"
      ],
      "drillNote": "Ultimate major test: practice shaping fades/draws off the tee, flighting approaches into #12 Golden Bell (~155y), and playing GSPro On-Course Practice on Amen Corner alone.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "impact-bag-motorcycle",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "GlacierGulphClub_GSP",
      "name": "Glacier Gulph Club",
      "location": "Nicholson, PA",
      "designer": "masta_blasta",
      "par": 72,
      "holes": 18,
      "altitudeFt": 728,
      "tees": {
        "black": 5534,
        "white": 5198,
        "green": 4662,
        "red": 3986,
        "junior": 2806,
        "par3": 2183
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "fantasy-group",
        "forgiving-scoring"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "5 Waterfalls & Monster #18",
        "Split Fairway #10 Island Green",
        "Fun Group Night"
      ],
      "drillNote": "Wildly fun 5,534y hybrid layout featuring a 650y downhill closer and split-fairway island green—entertaining casual round.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "gsp_practicearea",
      "name": "GSPro Short Game Practice Area",
      "location": "GSPro Built-In",
      "designer": "GSPro Team",
      "par": 54,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 0,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 96,
        "par3": 370
      },
      "holeRange": "6-46y",
      "favorite": false,
      "rating": 4,
      "categories": [
        "drills-playground",
        "kids-asleep-almost"
      ],
      "drillFocus": "short-game",
      "bestFor": [
        "Chip & Pitch Green Complex",
        "3-Ball Random Lie Reps",
        "Quiet Almost-Balls"
      ],
      "drillNote": "Ultra-short built-in pitching & chipping green (Junior 96y total across 18 stations, 2-9y & 6-46y Par 3 stations). Best for silent towel-behind-ball low-point reps and putter/chip start-line gates.",
      "recommendedDrills": [
        "putting-chipping-startline",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "GSPRange22",
      "name": "GSPro Driving Range",
      "location": "GSPro Built-In",
      "designer": "GSPro Team",
      "par": 68,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 377,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "",
      "favorite": true,
      "rating": 4,
      "categories": [
        "drills-playground"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Dispersion Cone & Carry Matrix",
        "Day 5 Driver Test",
        "Kinovea Live Replay Block"
      ],
      "drillNote": "Core data lab for checking GSPro Club Path, Attack Angle (+2 to +4 driver / -4 iron), and running the Day 5 30-yard Fairway Start-Line Test side-by-side with Kinovea.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "driver-startline-fairway-challenge",
        "noodle-plane-gate",
        "headcover-outside-takeaway"
      ]
    },
    {
      "id": "harvester_v3_gsp",
      "name": "Harvester Golf Club",
      "location": "Rhodes, IA",
      "designer": "cooke23",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6615,
        "white": 5962,
        "green": 0,
        "red": 4718,
        "junior": 2893,
        "par3": 2348
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Pure Bentgrass Midwest Classic",
        "Strong Greens",
        "Balanced Test"
      ],
      "drillNote": "Clean Iowa parkland gem (5,962y White / 6,615y Black)—no gimmicks, pure ball-striking benchmark for tracking handicap progress over time.",
      "recommendedDrills": [
        "gate-towel-lowpoint",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "hay_gsp",
      "name": "The Hay",
      "location": "Pebble Beach, CA",
      "designer": "runpuddrun",
      "par": 27,
      "holes": 9,
      "altitudeFt": 0,
      "tees": {
        "black": 635,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 298,
        "par3": 582
      },
      "holeRange": "46-101y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "drills-playground",
        "short-par3",
        "kids-asleep-almost",
        "forgiving-scoring"
      ],
      "drillFocus": "wedge-clock",
      "bestFor": [
        "23-101y Short Loop",
        "Pebble #7 Replica",
        "Kids Asleep / Family"
      ],
      "drillNote": "Tiger Woods' 9-hole Par 3 at Pebble (582-635y; Junior tee 298y!). Fast 15-minute loop with 40-100y pitch windows and the famous downhill #7 Pebble Beach replica.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "putting-chipping-startline",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "Island_Backup",
      "name": "Lost Island Par 3",
      "location": "South Pacific, Fictional",
      "designer": "Carl's Place",
      "par": 27,
      "holes": 9,
      "altitudeFt": 0,
      "tees": {
        "black": 1103,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 0,
        "par3": 1103
      },
      "holeRange": "92-175y",
      "favorite": true,
      "rating": 4,
      "categories": [
        "short-par3",
        "fantasy-group",
        "drills-playground"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Cave Hole #7",
        "Hero Carry 9h",
        "Group Contest"
      ],
      "drillNote": "9-hole South Pacific Par 3 (1,103y, holes 92-175y) featuring cliffside greens and Hole 7 played straight inside a cave! Awesome quick 9-hole target shootout with friends or evening iron work.",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "wedge-distance-clock",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "kiawah_b_01_gsp",
      "name": "Kiawah Ocean Course",
      "location": "Kiawah Island, SC",
      "designer": "DPRoberts",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6271,
        "white": 5968,
        "green": 5689,
        "red": 4873,
        "junior": 3475,
        "par3": 3756
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Atlantic Crosswinds",
        "10 Oceanfront Holes",
        "Tough Finishing Stretch"
      ],
      "drillNote": "Brutal wind test—ideal on a Real-Balls day to stress-test low-spin knockdowns and committed one-side start lines in heavy coastal wind.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "lahontan_gsp",
      "name": "Lahontan Golf Club",
      "location": "Truckee, CA",
      "designer": "Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 5817,
      "tees": {
        "black": 6429,
        "white": 5783,
        "green": 6741,
        "red": 4739,
        "junior": 3885,
        "par3": 2286
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Truckee Pines 5,800 ft",
        "Clean Weiskopf Resort",
        "Approach Accuracy"
      ],
      "drillNote": "Mountain resort test near Tahoe (5,817 ft elevation)—clean bunkers and pine framing reward confident committed lines.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "losangeles_cc_gsp",
      "name": "Los Angeles Country Club",
      "location": "Los Angeles, CA",
      "designer": "Stingreye",
      "par": 71,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6439,
        "white": 5871,
        "green": 0,
        "red": 5302,
        "junior": 0,
        "par3": 2313
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "US Open Barranca Carries",
        "2023 US Open Host",
        "Wide-Yet-Demanding Tees"
      ],
      "drillNote": "Championship barancas and rolling green complexes—tests landing angles with wedges and iron distance control.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "mammoth_dunes_gsp",
      "name": "Mammoth Dunes",
      "location": "Nekoosa, WI",
      "designer": "Tekbud",
      "par": 73,
      "holes": 18,
      "altitudeFt": 951,
      "tees": {
        "black": 6401,
        "white": 5526,
        "green": 4683,
        "red": 4310,
        "junior": 3801,
        "par3": 1898
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "forgiving-scoring",
        "links-dunes"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Massive Fairways (Easy to Hit)",
        "Fun Risk-Reward & Par 73",
        "Par 3 Tee 1,898y"
      ],
      "drillNote": "TOP CONFIDENCE COURSE: David McLay Kidd designed Mammoth Dunes specifically to help golfers—enormous fairways let you swing freely on Day 5 Driver work while still testing creative Sand Valley green contours.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "step-through-pressure-shift",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "Mattaponi_Springs_gsp",
      "name": "Mattaponi Springs",
      "location": "Ruther Glen, VA",
      "designer": "rcperkinsjr",
      "par": 72,
      "holes": 18,
      "altitudeFt": 712,
      "tees": {
        "black": 6249,
        "white": 5606,
        "green": 0,
        "red": 4478,
        "junior": 3430,
        "par3": 2527
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Undulating Fairways",
        "Companion to Mattaponi Short",
        "Mid-Yardage Test"
      ],
      "drillNote": "Full 18 championship partner to Mattaponi Springs Short—warm up on the Short Course (25-150y fixed tees), then bring that wedge feel straight to the full layout.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "Mattaponi_Springs_Short_gsp",
      "name": "Mattaponi Springs Short",
      "location": "Ruther Glen, VA",
      "designer": "rcperkinsjr",
      "par": 54,
      "holes": 18,
      "altitudeFt": 712,
      "tees": {
        "black": 2464,
        "white": 2050,
        "green": 1643,
        "red": 413,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "25-150y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "drills-playground",
        "short-par3",
        "kids-asleep-almost"
      ],
      "drillFocus": "wedge-clock",
      "bestFor": [
        "Exact 25/50/75/100/125/150y Tees",
        "Carry Ladder",
        "Wedge Combine"
      ],
      "drillNote": "TOP TRAINING COURSE: Literally built as a distance combine! Each tee color locks every hole to an exact yardage: Red=25y, Yellow=50y, Blue=75y, Green=100y (92y avg), White=125y (114y avg), Black=150y (137y avg). Unmatched for 18-shot proximity combines.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "nine-to-three-delivery",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "meriongc_v2_gsp",
      "name": "Merion Golf Club",
      "location": "Ardmore, PA",
      "designer": "Soupy",
      "par": 70,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6385,
        "white": 5338,
        "green": 0,
        "red": 0,
        "junior": 3245,
        "par3": 2825
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "US Open Classic Par 70",
        "Brutal Finishing 5 Holes",
        "Iron Precision"
      ],
      "drillNote": "Compact 6,385y / 5,338y US Open classic where short-game & short-iron control rules over long drive bombing.",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "Middle_EarthGC_GSP",
      "name": "Middle Earth GC",
      "location": "Middle Earth, Arda, Fictional",
      "designer": "Guy Holman_GregMc Donald",
      "par": 73,
      "holes": 18,
      "altitudeFt": 3281,
      "tees": {
        "black": 5926,
        "white": 0,
        "green": 2026,
        "red": 3975,
        "junior": 0,
        "par3": 2271
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "fantasy-group",
        "mountain-desert"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Hobbit Par-3 Tees (2,026y)",
        "Lord of the Rings Theme",
        "Fun Creative Shots"
      ],
      "drillNote": "Play Green 'Hobbit' tees (2,026y!) or Black 'Elf' tees (5,926y) on this creative Shire/mountain fantasy layout—great change-up with friends.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "mountain_top_gsp",
      "name": "Mountain Top Golf Course",
      "location": "Hollister, MO",
      "designer": "runpuddrun",
      "par": 39,
      "holes": 13,
      "altitudeFt": 1640,
      "tees": {
        "black": 1710,
        "white": 1414,
        "green": 0,
        "red": 0,
        "junior": 604,
        "par3": 1094
      },
      "holeRange": "73-191y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "short-par3",
        "mountain-desert",
        "kids-asleep-almost"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "13-Hole Gary Player Par 3",
        "Cliff/Rock Greens",
        "Elevation Adjustments"
      ],
      "drillNote": "13 scenic Ozark limestone Par 3 holes (1,710y Black / 1,414y White / 604y Junior for night almost-balls). Great for dialing high-flighted wedges and short-iron trajectory into shallow rock-framed greens.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "nine-to-three-delivery",
        "pump-and-drop-p5"
      ]
    },
    {
      "id": "oakmont_gsp",
      "name": "Oakmont CC",
      "location": "Oakmont, PA",
      "designer": "Adamtc4",
      "par": 70,
      "holes": 18,
      "altitudeFt": 2539,
      "tees": {
        "black": 6568,
        "white": 5626,
        "green": 6353,
        "red": 5123,
        "junior": 3377,
        "par3": 2034
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Church Pews Bunkers",
        "Brutal Major Benchmark",
        "Tight Accuracy Check"
      ],
      "drillNote": "No-mercy US Open exam—use strictly when your start-line and low-point are dialed and you want to see how your game holds up under major-level penalties.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "noodle-plane-gate",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "olympicclub_gsp",
      "name": "Olympic Club",
      "location": "San Francisco, CA",
      "designer": "Tekbud",
      "par": 71,
      "holes": 18,
      "altitudeFt": 164,
      "tees": {
        "black": 6494,
        "white": 5759,
        "green": 5181,
        "red": 0,
        "junior": 3889,
        "par3": 2249
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Narrow Cypress Corridors",
        "Sloping Fairways",
        "Par 71 US Open"
      ],
      "drillNote": "Demands working the ball both ways off the tee and disciplined P5/P6 face-to-path control on tight SF fairways.",
      "recommendedDrills": [
        "noodle-plane-gate",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "pacificdunesv2_5_gsp",
      "name": "Pacific Dunes",
      "location": "Bandon, OR",
      "designer": "RCPerkinsJr",
      "par": 71,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6062,
        "white": 0,
        "green": 5654,
        "red": 4671,
        "junior": 3391,
        "par3": 2455
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "World-Class Cliffside Links",
        "Wild Green Undulations",
        "Creative Wedges"
      ],
      "drillNote": "Tom Doak masterpiece—wide driving corridors paired with ruthless small green sections make this an A+ wedge flighting and pitch-mark control exam.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "nine-to-three-delivery",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "paynes_valley_gsp",
      "name": "Paynes Valley",
      "location": "Hollister, MO",
      "designer": "runpuddrun",
      "par": 72,
      "holes": 18,
      "altitudeFt": 1391,
      "tees": {
        "black": 6744,
        "white": 0,
        "green": 6231,
        "red": 4684,
        "junior": 4566,
        "par3": 1717
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "forgiving-scoring",
        "mountain-desert",
        "fantasy-group"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Tiger Woods Generous Fairways",
        "Spectacular 19th Island Cliff Hole",
        "Ozarks Scenery"
      ],
      "drillNote": "Wide, player-friendly Tiger Woods resort design (6,744y Black, generous 6,231y Green)—don't miss the 19th Hole ('The Big Rock') surrounded by cliffs and waterfalls!",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "wedge-distance-clock",
        "step-through-pressure-shift"
      ]
    },
    {
      "id": "pebblebeach_gsp",
      "name": "DPC Pebble",
      "location": "Pebble Beach, CA",
      "designer": "cooke23",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6474,
        "white": 5506,
        "green": 5836,
        "red": 4661,
        "junior": 3065,
        "par3": 2471
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Coastal Holes 4-10 & 17-18",
        "Tiny Postage-Stamp Greens",
        "Wedge/Short-Iron Exam"
      ],
      "drillNote": "Iconic coastal test with tiny greens—every approach from 150 yards and in rewards crisp ball-first compression and clock-wedge distance discipline.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "impact-bag-motorcycle",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "phillips_park_il_2_6_gsp",
      "name": "Phillips Park",
      "location": "Aurora, IL",
      "designer": "Tekbud",
      "par": 71,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 5676,
        "white": 5190,
        "green": 0,
        "red": 4432,
        "junior": 3232,
        "par3": 2193
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring",
        "drills-playground"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Approachable Muni 5,190-5,676y",
        "Real-World Prep",
        "Warmup Pace"
      ],
      "drillNote": "Realistic 5,190y White / 5,676y Black municipal layout (built with range + junior loop)—ideal mirror of everyday weekend outdoor golf pacing.",
      "recommendedDrills": [
        "nine-to-three-delivery",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "pinehurst2_0_2_gsp",
      "name": "Pinehurst #2",
      "location": "Pinehurst, NC",
      "designer": "Cintigolfer, Tekbud",
      "par": 72,
      "holes": 18,
      "altitudeFt": 1841,
      "tees": {
        "black": 6897,
        "white": 5774,
        "green": 5356,
        "red": 4853,
        "junior": 3831,
        "par3": 2607
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "short-game",
      "bestFor": [
        "Turtleback Domed Greens",
        "Pitching & Bump-and-Run",
        "US Open Anchor"
      ],
      "drillNote": "The toughest short-game exam in golf: hitting a domed green demands accurate spin/trajectory or smart low-running chips from the collection areas.",
      "recommendedDrills": [
        "putting-chipping-startline",
        "wedge-distance-clock",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "pinevalley_v1_gsp",
      "name": "Pine Valley",
      "location": "Pine Hill, New Jersey, USA",
      "designer": "Tekbud",
      "par": 70,
      "holes": 18,
      "altitudeFt": 571,
      "tees": {
        "black": 6499,
        "white": 5999,
        "green": 0,
        "red": 0,
        "junior": 3187,
        "par3": 2409
      },
      "holeRange": "",
      "favorite": false,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Target Golf Over Sand Waste",
        "No Bailouts",
        "Elite Ball-Striking Test"
      ],
      "drillNote": "Ultimate target execution course—every tee and approach demands full commitment to carry distance and start-line window.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "predator_gsp",
      "name": "Predator Ridge - Ridge Course",
      "location": "Vernon, BC",
      "designer": "RustyDave",
      "par": 72,
      "holes": 18,
      "altitudeFt": 1247,
      "tees": {
        "black": 6483,
        "white": 5695,
        "green": 0,
        "red": 4625,
        "junior": 3201,
        "par3": 2045
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "BC Granite Outcroppings",
        "Playable Resort Layout",
        "Long Par 5s"
      ],
      "drillNote": "Scenic British Columbia Ridge course (5,695y White) blending playable fairways with dramatic granite views.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "pump-and-drop-p5"
      ]
    },
    {
      "id": "quailhollow_v2_gsp",
      "name": "Quail Hollow Club",
      "location": "Charlotte, NC",
      "designer": "CE Simgolf",
      "par": 72,
      "holes": 18,
      "altitudeFt": 2949,
      "tees": {
        "black": 7009,
        "white": 6437,
        "green": 6098,
        "red": 0,
        "junior": 4904,
        "par3": 2647
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Green Mile 16-18",
        "Long PGA Tour Layout (6,437-7,009y)",
        "Water Carries"
      ],
      "drillNote": "Heavyweight Tour track—great test for Day 5 Driver speed paired with long-iron/hybrid commitment down the Green Mile.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "Quintero_GSP",
      "name": "Quintero Golf Club",
      "location": "Peoria, AZ",
      "designer": "pakman",
      "par": 72,
      "holes": 18,
      "altitudeFt": 1893,
      "tees": {
        "black": 6526,
        "white": 5836,
        "green": 0,
        "red": 4718,
        "junior": 4079,
        "par3": 2404
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "mountain-desert"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Downhill Desert Par 3s",
        "Canyon Target Driving",
        "Arizona Showcase"
      ],
      "drillNote": "Purest desert target golf in AZ (5,836y White / 6,526y Black) featuring steep elevated Par 3 tee boxes—amazing for checking high-launch iron dispersion.",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "driver-startline-fairway-challenge",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "revelstoke_golf_club_gsp",
      "name": "Revelstoke Golf Club",
      "location": "Revelstoke, Canada",
      "designer": "RustyDave/JGixrod3",
      "par": 72,
      "holes": 18,
      "altitudeFt": 1450,
      "tees": {
        "black": 0,
        "white": 5709,
        "green": 5350,
        "red": 0,
        "junior": 2964,
        "par3": 1970
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring",
        "mountain-desert"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Forgiving Tree-Lined BC Valley",
        "Built-In Range Warmup",
        "Confidence Scoring"
      ],
      "drillNote": "Described right in GSPro as 'challenging, yet forgiving' with a mountain backdrop and practice range—easy, calm sim loop.",
      "recommendedDrills": [
        "nine-to-three-delivery",
        "left-hip-clearance-rope"
      ]
    },
    {
      "id": "riverwalk_gsp",
      "name": "Riverwalk Skills Challenge",
      "location": "Metropolis, NY, Fictional",
      "designer": "rdeyer, CE Simgolf",
      "par": 60,
      "holes": 12,
      "altitudeFt": 0,
      "tees": {
        "black": 844,
        "white": 0,
        "green": 0,
        "red": 0,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "6-229y",
      "favorite": true,
      "rating": 5,
      "categories": [
        "drills-playground",
        "fantasy-group",
        "kids-asleep-almost"
      ],
      "drillFocus": "short-game",
      "bestFor": [
        "Skills Challenge",
        "Break Glass / Flop Shot",
        "Custom Distance Targets"
      ],
      "drillNote": "GSPro's premier accuracy playground: pick custom distances and score points on Break Glass, Flop Shot, accuracy rings, and Long Drive. Best warmup playground before an 18-hole round or fun group night.",
      "recommendedDrills": [
        "putting-chipping-startline",
        "wedge-distance-clock",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "riviera_gsp",
      "name": "Riviera",
      "location": "Los Angeles, California",
      "designer": "bortimus1, Soupy",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6704,
        "white": 5569,
        "green": 0,
        "red": 4855,
        "junior": 3170,
        "par3": 2629
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Driveable #10 Risk-Reward",
        "Shotmaker's Classic",
        "PGA Genesis Host"
      ],
      "drillNote": "One of the finest strategic courses on Tour—especially great for practicing partial 60-90y wedge finesse around #10 and drawing/fading long irons.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "pump-and-drop-p5"
      ]
    },
    {
      "id": "Sanctuary_Moon_GSP",
      "name": "Sanctuary Moon",
      "location": "Endor, Outer Rim, Fictional",
      "designer": "Greg McDonald_Guy Holman",
      "par": 72,
      "holes": 18,
      "altitudeFt": 2949,
      "tees": {
        "black": 6633,
        "white": 5940,
        "green": 0,
        "red": 5523,
        "junior": 3779,
        "par3": 2293
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "fantasy-group"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Endor Redwood Forest Theme",
        "Tight Tree Chutes",
        "Fun Sci-Fi Night"
      ],
      "drillNote": "Star Wars Forest Moon of Endor! Giant redwoods force clean start lines off the tee, and Ewok / blaster humor keeps group sessions lighthearted.",
      "recommendedDrills": [
        "driver-startline-fairway-challenge",
        "noodle-plane-gate"
      ]
    },
    {
      "id": "sandhollow_gsp",
      "name": "Sand Hollow",
      "location": "Hurricane, UT",
      "designer": "Soupy",
      "par": 72,
      "holes": 18,
      "altitudeFt": 3248,
      "tees": {
        "black": 6603,
        "white": 5698,
        "green": 0,
        "red": 5184,
        "junior": 3252,
        "par3": 2181
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Red Rock Cliffs #12-#15",
        "Wide Fairways + Huge Greens",
        "Utah Resort Fun"
      ],
      "drillNote": "Dramatic Utah red-rock cliffs along 12-15 paired with huge, receptive fairways—fantastic balance of eye candy and relaxed scoring.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "Silverado_North_GSP",
      "name": "Silverado Resort & Spa - North",
      "location": "Napa, CA",
      "designer": "pakman",
      "par": 72,
      "holes": 18,
      "altitudeFt": 66,
      "tees": {
        "black": 6567,
        "white": 5794,
        "green": 5420,
        "red": 4761,
        "junior": 3552,
        "par3": 2401
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring",
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Oak-Lined Napa Classic",
        "Approach Spin Control",
        "Balanced 5,794y White"
      ],
      "drillNote": "Classic Johnny Miller Tour stop in Napa—steady parkland test for fairways hit and wedge proximity.",
      "recommendedDrills": [
        "gate-towel-lowpoint",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "standrews_v1_gsp",
      "name": "The Old Course",
      "location": "St Andrews, UK",
      "designer": "Anonymous",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6126,
        "white": 6656,
        "green": 5584,
        "red": 0,
        "junior": 3211,
        "par3": 2286
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "bucket-majors",
        "forgiving-scoring"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Widest Fairways in Golf",
        "17th Road Hole",
        "Low Ground-Game Runups"
      ],
      "drillNote": "Enormous double greens and wide links fairways make The Old Course awesome for driver freedom PLUS learning low-trajectory 8i/PW bump-and-run shots.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "putting-chipping-startline",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "streamsongblue_gsp",
      "name": "Streamsong Blue",
      "location": "Bowling Green, FL",
      "designer": "Adamtc4",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6168,
        "white": 5727,
        "green": 6685,
        "red": 0,
        "junior": 3147,
        "par3": 1898
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "links-dunes",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Wide Dunes & Big Greens",
        "Creative Approaches",
        "Tom Doak Fun Factor"
      ],
      "drillNote": "Wide dunesland fairways with playful green contours—great 'fun architectural' full 18 where bad swings don't auto-OB.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "wedge-distance-clock"
      ]
    },
    {
      "id": "thehomeoftheplayers_gsp",
      "name": "The Home of the Players",
      "location": "Ponte Vedra, FL",
      "designer": "DPR-OPCD",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6624,
        "white": 5879,
        "green": 4929,
        "red": 4599,
        "junior": 3621,
        "par3": 2355
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "bucket-majors"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "TPC Sawgrass #17 Island Green",
        "No-Favoritism Ball-Striking Test",
        "Closing Stretch 16-18"
      ],
      "drillNote": "Full Pete Dye championship test—replay #17 Island Green (~135y) repeatedly in On-Course Practice Mode to lock in 9i/PW start line under pressure!",
      "recommendedDrills": [
        "impact-bag-motorcycle",
        "nine-to-three-delivery",
        "driver-startline-fairway-challenge"
      ]
    },
    {
      "id": "topoftherock_gsp",
      "name": "Top of the Rock",
      "location": "Ridgedale, MO",
      "designer": "runpuddrun",
      "par": 54,
      "holes": 18,
      "altitudeFt": 4573,
      "tees": {
        "black": 2550,
        "white": 2015,
        "green": 0,
        "red": 1660,
        "junior": 786,
        "par3": 1680
      },
      "holeRange": "94-189y",
      "favorite": true,
      "rating": 4,
      "categories": [
        "short-par3",
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Dramatic Par 3s",
        "Big Cedar Resort Vibe",
        "Elevation & Spin"
      ],
      "drillNote": "Jack Nicklaus Ozarks Par 3 course (2,550y Black / 2,015y White / 786y Junior!). Dramatic downhill carries over Table Rock water hazards test club selection and high-cut/draw commitment.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "pump-and-drop-p5",
        "impact-bag-motorcycle"
      ]
    },
    {
      "id": "topoftherockrange_gsp",
      "name": "Top of the Rock Range",
      "location": "Ridgedale, MO",
      "designer": "runpuddrun",
      "par": 54,
      "holes": 18,
      "altitudeFt": 4468,
      "tees": {
        "black": 0,
        "white": 0,
        "green": 0,
        "red": 2349,
        "junior": 0,
        "par3": 0
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "drills-playground",
        "mountain-desert"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Scenic Target Range",
        "Island & Creek Greens",
        "Block Rep Sessions"
      ],
      "drillNote": "Target green driving-range companion to Top of the Rock (~1,394 ft Ozarks elevation). Use for structured block work: 10 reps on Kinovea P5/P6 shallowing or Day 5 Driver Launch window.",
      "recommendedDrills": [
        "pump-and-drop-p5",
        "noodle-plane-gate",
        "driver-headcover-aoa"
      ]
    },
    {
      "id": "torrey_pines_south_v3_gsp",
      "name": "Torrey Pines South Course",
      "location": "La Jolla, CA",
      "designer": "Johnmeyer",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 7077,
        "white": 5708,
        "green": 6096,
        "red": 0,
        "junior": 3337,
        "par3": 2359
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "bucket-majors",
        "links-dunes"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "La Jolla Ocean Cliffs",
        "Long Heavy US Open Setup",
        "Driver Launch Marathon"
      ],
      "drillNote": "Long coastal championship test (Play White 5,708y / Green 6,096y for normal human distances, or Black 7,077y for bomber endurance).",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "step-through-pressure-shift"
      ]
    },
    {
      "id": "tpcscottsdale_v4_gsp",
      "name": "TPC Scottsdale",
      "location": "Scottsdale, AZ",
      "designer": "runpuddrun, rdeyer",
      "par": 71,
      "holes": 18,
      "altitudeFt": 1257,
      "tees": {
        "black": 6677,
        "white": 5598,
        "green": 0,
        "red": 5011,
        "junior": 1043,
        "par3": 1930
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "bucket-majors",
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "#16 Coliseum Par 3",
        "Playable Stadium Scoring",
        "Short Junior Loop (1043y!)"
      ],
      "drillNote": "Always fun on the sim—charge the Stadium #16 (~145-165y), or switch to the surprising 1,043y Junior tee (32-125y holes!) for a quick Stadium night wedge loop!",
      "recommendedDrills": [
        "wedge-distance-clock",
        "driver-startline-fairway-challenge",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "Waialae_gsp",
      "name": "Waialae",
      "location": "Honolulu, Hawaii, USA",
      "designer": "RustyDave",
      "par": 72,
      "holes": 18,
      "altitudeFt": 33,
      "tees": {
        "black": 0,
        "white": 5937,
        "green": 0,
        "red": 5182,
        "junior": 3359,
        "par3": 1719
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "forgiving-scoring",
        "bucket-majors"
      ],
      "drillFocus": "driver",
      "bestFor": [
        "Hawaii Ocean Breezes",
        "Playable 5,937y White",
        "Birdie Tour Test"
      ],
      "drillNote": "Relaxed tropical Sony Open venue—flat corridors keep focus cleanly on start-line dispersion and scoring irons.",
      "recommendedDrills": [
        "left-hip-clearance-rope",
        "nine-to-three-delivery"
      ]
    },
    {
      "id": "whispering_pines_gsp",
      "name": "Whispering Pines",
      "location": "Evans, MN USA",
      "designer": "OPCD-Sting, DPR, JM",
      "par": 72,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6406,
        "white": 5723,
        "green": 5410,
        "red": 4702,
        "junior": 2503,
        "par3": 2129
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "drills-playground",
        "forgiving-scoring"
      ],
      "drillFocus": "short-game",
      "bestFor": [
        "Built Your Custom 'Short Game' .CRD Here",
        "Tees From 2,503y-6,406y",
        "GSPro Classic"
      ],
      "drillNote": "Your custom 'Short Game' (6-station wedge/sand/rough) and 'Par 3 Challenge' (.crd files) run right on Whispering Pines! Also has 2,503y Junior and 2,129y Par 3 tees.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "putting-chipping-startline",
        "gate-towel-lowpoint"
      ]
    },
    {
      "id": "whistlernn_gsp",
      "name": "Whistler Nicklaus North",
      "location": "Whistler, Canada",
      "designer": "RustyDave",
      "par": 71,
      "holes": 18,
      "altitudeFt": 0,
      "tees": {
        "black": 6276,
        "white": 5517,
        "green": 5063,
        "red": 4404,
        "junior": 3056,
        "par3": 1771
      },
      "holeRange": "",
      "favorite": false,
      "rating": 4,
      "categories": [
        "mountain-desert",
        "forgiving-scoring"
      ],
      "drillFocus": "short-iron",
      "bestFor": [
        "Scenic Canadian Valley Floor",
        "Gentle Playable Fairways (5,517y)",
        "Short Par-3 Tees (1,771y)"
      ],
      "drillNote": "Beautiful emerald mountain valley that stays gently flat and walkable—also carries a 1,771y Par 3 tee (59-118y) great for smooth clock-wedges.",
      "recommendedDrills": [
        "wedge-distance-clock",
        "headcover-outside-takeaway"
      ]
    },
    {
      "id": "wolf_creek_v1_gsp",
      "name": "Wolf Creek Golf Club",
      "location": "Mesquite, NV",
      "designer": "RaceTo100",
      "par": 72,
      "holes": 18,
      "altitudeFt": 2031,
      "tees": {
        "black": 6236,
        "white": 5225,
        "green": 0,
        "red": 3734,
        "junior": 3091,
        "par3": 2041
      },
      "holeRange": "",
      "favorite": true,
      "rating": 5,
      "categories": [
        "mountain-desert",
        "fantasy-group"
      ],
      "drillFocus": "elevation",
      "bestFor": [
        "Wild Elevated Canyon Tees",
        "Hero Carries",
        "Unforgettable Visuals"
      ],
      "drillNote": "GSPro bucket-list classic: huge vertical elevation drops and cliffside desert landings train commitment and club-up/club-down altitude math.",
      "recommendedDrills": [
        "driver-headcover-aoa",
        "pump-and-drop-p5"
      ]
    }
  ],
  "artillery": [
    {
      "id": "hackmotion",
      "name": "HackMotion Pro / Core Wrist Sensor",
      "icon": "🎯",
      "category": "Biofeedback Wrist Sensor",
      "status": "Active Artillery",
      "desc": "Measures lead wrist flexion/extension, radial/ulnar deviation, and clubface rotation in real time with audio tone biofeedback.",
      "greenZones": {
        "address": "Your own baseline reading (calibration-dependent; often +10° to +25° ext)",
        "top": "Flatter than address (~10–20° less extension)",
        "p6": "A few degrees more flexion than your top",
        "impact": "Irons ~5–10° more flexion than top; driver 0–5°; putting ±2° of address"
      },
      "audioCues": "Set green zone band in HackMotion app. Continuous tone sounds when wrist angle is in the sweet spot."
    },
    {
      "id": "kinovea",
      "name": "Kinovea Dual-Cam Rig (DTL & FO)",
      "icon": "🎥",
      "category": "Multi-Angle Video",
      "status": "Active Rig",
      "desc": "SimWatch 2x2 synchronized high-speed video recording with Down-the-Line (plane/depth) and Face-On (shaft lean/sway) checkpoints.",
      "keyMetrics": "P2 takeaway line, P4 trail hip depth, P6 delivery slot, P7 impact shaft lean angle."
    },
    {
      "id": "gspro",
      "name": "GSPro Launch Monitor Studio",
      "icon": "⛳",
      "category": "Sim Ball Flight Engine",
      "status": "Connected Sim",
      "desc": "Ball flight physics, club path/face angle data (Launch Pro club-data subscription), and a large library of courses and practice ranges.",
      "keyMetrics": "Ball Speed, Launch Angle, Spin Rate, Path vs Face, Attack Angle (AoA)."
    },
    {
      "id": "cadence-metronome",
      "name": "Tour Tempo Cadence Metronome (3:1 & 2:1)",
      "icon": "⏱️",
      "category": "Swing Rhythm & Timing",
      "status": "Audio Engine",
      "desc": "Built-in Web Audio cadence engine replicating Tour Tempo ratios (21/7, 24/8, 27/9 for full swings; 18/9, 20/10 for short game).",
      "keyMetrics": "Backswing time, downswing time, swing ratio (3.0:1 ideal), impact sync."
    },
    {
      "id": "bag-matrix",
      "name": "Club Bag & Gapping Matrix",
      "icon": "🎒",
      "category": "Yardage Calibration",
      "status": "Profile Matrix",
      "desc": "Personalized carry, total distance, ball speed, and launch window targets for each club in your bag (inspired by agentic-caddy).",
      "keyMetrics": "Stock carry yardages, gapping intervals, HackMotion wrist angle targets per club."
    },
    {
      "id": "impact-bag",
      "name": "Impact Compression Bag",
      "icon": "💥",
      "category": "Feel & Strike Tool",
      "status": "Strike Station",
      "desc": "Low-impact strike station to physically train lead wrist bow, open hips, and forward shaft lean without high shock.",
      "keyMetrics": "Forward shaft lean check, square face contact, lead leg brace."
    }
  ],
  // cadencePresets: backFrames/downFrames are Tour Tempo frame counts at 30fps (fps field);
  // backSec = backFrames / 30. bpm is the metronome setting where one beat = the downswing
  // duration (60 / downSec): takeaway on beat 1, top on beat 4 (3:1) or beat 3 (2:1), impact on the next beat.
  // index.html displays bpm; it does not drive the built-in metronome.
  "cadencePresets": [
    {
      "id": "21-7",
      "name": "21 / 7 (Tour Fast)",
      "ratio": "3:1",
      "type": "full-swing",
      "use": "full",
      "backFrames": 21,
      "downFrames": 7,
      "backSec": 0.7,
      "downSec": 0.23,
      "totalSec": 0.93,
      "bpm": 257,
      "proExamples": "Fast-tempo athletic swingers",
      "desc": "Aggressive, athletic tempo for high swing speeds and fast hip rotation. Frames are at 30fps (= 42/14 at 60fps, 84/28 at 120fps, 168/56 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "24-8",
      "name": "24 / 8 (Tour Standard)",
      "ratio": "3:1",
      "type": "full-swing",
      "use": "full",
      "backFrames": 24,
      "downFrames": 8,
      "backSec": 0.8,
      "downSec": 0.27,
      "totalSec": 1.07,
      "bpm": 225,
      "proExamples": "Most common full-swing tempo in Tour Tempo research",
      "desc": "A common Tour Tempo full-swing benchmark. Balances full coil with calm transition. Frames are at 30fps (= 48/16 at 60fps, 96/32 at 120fps, 192/64 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "27-9",
      "name": "27 / 9 (Tour Smooth)",
      "ratio": "3:1",
      "type": "full-swing",
      "use": "full",
      "backFrames": 27,
      "downFrames": 9,
      "backSec": 0.9,
      "downSec": 0.3,
      "totalSec": 1.2,
      "bpm": 200,
      "proExamples": "Smooth deliberate swingers",
      "desc": "Silky, deliberate takeaway that lets gravity and momentum do the work. Frames are at 30fps (= 54/18 at 60fps, 108/36 at 120fps, 216/72 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "30-10",
      "name": "30 / 10 (Deliberate / Drill)",
      "ratio": "3:1",
      "type": "full-swing",
      "use": "full",
      "backFrames": 30,
      "downFrames": 10,
      "backSec": 1,
      "downSec": 0.33,
      "totalSec": 1.33,
      "bpm": 180,
      "proExamples": "Motor Learning & Slow-Mo Checkpoint Calibration",
      "desc": "Slow-motion rhythm ideal for HackMotion biofeedback and gym-sore days. Frames are at 30fps (= 60/20 at 60fps, 120/40 at 120fps, 240/80 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "18-9",
      "name": "18 / 9 (Short Game / Pitch)",
      "ratio": "2:1",
      "type": "short-game",
      "use": "short-game",
      "backFrames": 18,
      "downFrames": 9,
      "backSec": 0.6,
      "downSec": 0.3,
      "totalSec": 0.9,
      "bpm": 200,
      "proExamples": "Wedge pitches / flops / bunker splash",
      "desc": "2:1 short-game rhythm for smooth acceleration through turf without decel. Frames are at 30fps (= 36/18 at 60fps, 72/36 at 120fps, 144/72 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "20-10",
      "name": "20 / 10 (Putting Standard)",
      "ratio": "2:1",
      "type": "putting",
      "use": "putting",
      "backFrames": 20,
      "downFrames": 10,
      "backSec": 0.67,
      "downSec": 0.33,
      "totalSec": 1,
      "bpm": 180,
      "proExamples": "Pendulum putting stroke",
      "desc": "Pendulum putting tempo ensuring consistent roll distance on GSPro greens. Frames are at 30fps (= 40/20 at 60fps, 80/40 at 120fps, 160/80 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "sg-14-7",
      "name": "14 / 7 (Short Game / Quick Chip)",
      "ratio": "2:1",
      "type": "short-game",
      "use": "short-game",
      "backFrames": 14,
      "downFrames": 7,
      "backSec": 0.47,
      "downSec": 0.23,
      "totalSec": 0.7,
      "bpm": 257,
      "proExamples": "Chips, bump-and-runs, short pitches",
      "desc": "Fast 2:1 rhythm for short chips and bump-and-runs. Frames are at 30fps (= 28/14 at 60fps, 56/28 at 120fps, 112/56 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "sg-16-8",
      "name": "16 / 8 (Short Game / Standard Pitch)",
      "ratio": "2:1",
      "type": "short-game",
      "use": "short-game",
      "backFrames": 16,
      "downFrames": 8,
      "backSec": 0.53,
      "downSec": 0.27,
      "totalSec": 0.8,
      "bpm": 225,
      "proExamples": "Standard pitches and partial wedges",
      "desc": "Mid-pace 2:1 rhythm for standard pitches and partial wedges. Frames are at 30fps (= 32/16 at 60fps, 64/32 at 120fps, 128/64 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "pt-14-7",
      "name": "14 / 7 (Putting / Quick)",
      "ratio": "2:1",
      "type": "putting",
      "use": "putting",
      "backFrames": 14,
      "downFrames": 7,
      "backSec": 0.47,
      "downSec": 0.23,
      "totalSec": 0.7,
      "bpm": 257,
      "proExamples": "Quick, firm short putts",
      "desc": "Quicker pendulum putting tempo for firm short putts. Frames are at 30fps (= 28/14 at 60fps, 56/28 at 120fps, 112/56 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "pt-16-8",
      "name": "16 / 8 (Putting / Medium)",
      "ratio": "2:1",
      "type": "putting",
      "use": "putting",
      "backFrames": 16,
      "downFrames": 8,
      "backSec": 0.53,
      "downSec": 0.27,
      "totalSec": 0.8,
      "bpm": 225,
      "proExamples": "Medium-length putts",
      "desc": "Medium pendulum putting tempo for mid-range putts. Frames are at 30fps (= 32/16 at 60fps, 64/32 at 120fps, 128/64 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    },
    {
      "id": "pt-18-9",
      "name": "18 / 9 (Putting / Smooth)",
      "ratio": "2:1",
      "type": "putting",
      "use": "putting",
      "backFrames": 18,
      "downFrames": 9,
      "backSec": 0.6,
      "downSec": 0.3,
      "totalSec": 0.9,
      "bpm": 200,
      "proExamples": "Smooth, longer lag putts",
      "desc": "Smooth pendulum putting tempo for lag putts and slower greens. Frames are at 30fps (= 36/18 at 60fps, 72/36 at 120fps, 144/72 at 240fps). Smooth continuous motion, no pause at the top.",
      "fps": 30
    }
  ],
  "bagMatrix": [
    {
      "id": "dr",
      "club": "Driver",
      "loft": "9.0°",
      "carry": 250,
      "total": 275,
      "ballSpeed": 154,
      "launch": 12.5,
      "spin": 2400,
      "hmFlex": "0–5° flex vs top",
      "role": "Fairway Finder & Power"
    },
    {
      "id": "3w",
      "club": "3 Wood",
      "loft": "15.0°",
      "carry": 225,
      "total": 242,
      "ballSpeed": 145,
      "launch": 13.5,
      "spin": 3200,
      "hmFlex": "3–7° flex vs top",
      "role": "Long Par 5s & Tight Tees"
    },
    {
      "id": "5w",
      "club": "5 Wood / 3H",
      "loft": "18.5°",
      "carry": 205,
      "total": 218,
      "ballSpeed": 136,
      "launch": 15,
      "spin": 3800,
      "hmFlex": "3–7° flex vs top",
      "role": "High Soft Landings"
    },
    {
      "id": "4i",
      "club": "4 Iron",
      "loft": "21.0°",
      "carry": 177,
      "total": 187,
      "ballSpeed": 128,
      "launch": 14.5,
      "spin": 4400,
      "hmFlex": "5–10° flex vs top",
      "role": "Stinger & Long Approach"
    },
    {
      "id": "5i",
      "club": "5 Iron",
      "loft": "24.0°",
      "carry": 167,
      "total": 175,
      "ballSpeed": 122,
      "launch": 16,
      "spin": 5000,
      "hmFlex": "5–10° flex vs top",
      "role": "Standard Long Approach"
    },
    {
      "id": "6i",
      "club": "6 Iron",
      "loft": "27.5°",
      "carry": 157,
      "total": 163,
      "ballSpeed": 116,
      "launch": 17.5,
      "spin": 5600,
      "hmFlex": "5–10° flex vs top",
      "role": "Mid-Iron Workhorse"
    },
    {
      "id": "7i",
      "club": "7 Iron",
      "loft": "31.5°",
      "carry": 148,
      "total": 153,
      "ballSpeed": 110,
      "launch": 19,
      "spin": 6300,
      "hmFlex": "5–10° flex vs top",
      "role": "Calibration Baseline Club"
    },
    {
      "id": "8i",
      "club": "8 Iron",
      "loft": "35.5°",
      "carry": 138,
      "total": 142,
      "ballSpeed": 104,
      "launch": 21,
      "spin": 7100,
      "hmFlex": "5–10° flex vs top",
      "role": "Scoring Iron Target Pin"
    },
    {
      "id": "9i",
      "club": "9 Iron",
      "loft": "40.0°",
      "carry": 126,
      "total": 129,
      "ballSpeed": 97,
      "launch": 23.5,
      "spin": 8000,
      "hmFlex": "5–10° flex vs top",
      "role": "Aggressive Pin Attack"
    },
    {
      "id": "pw",
      "club": "PW (46°)",
      "loft": "46.0°",
      "carry": 113,
      "total": 115,
      "ballSpeed": 89,
      "launch": 26.5,
      "spin": 8900,
      "hmFlex": "5–10° flex vs top",
      "role": "Full PW Scoring Shot (~110y)"
    },
    {
      "id": "gw",
      "club": "GW (50°)",
      "loft": "50.0°",
      "carry": 103,
      "total": 104,
      "ballSpeed": 82,
      "launch": 29,
      "spin": 9400,
      "hmFlex": "5–10° flex vs top",
      "role": "Full Wedge Control"
    },
    {
      "id": "sw",
      "club": "SW (54°)",
      "loft": "54.0°",
      "carry": 91,
      "total": 92,
      "ballSpeed": 74,
      "launch": 31.5,
      "spin": 9800,
      "hmFlex": "5–10° flex vs top",
      "role": "Mid Wedge & Greenside"
    },
    {
      "id": "lw",
      "club": "LW (58°)",
      "loft": "58.0°",
      "carry": 79,
      "total": 80,
      "ballSpeed": 66,
      "launch": 34,
      "spin": 9500,
      "hmFlex": "±3° shot-to-shot",
      "role": "Pinpoint Stop & Flop"
    }
  ],
  // Coach taxonomy (additive; the hub works without it). Drills reference fault ids (faultTags),
  // environment ids (environments) and a swingPhase. sessionTemplates blocks sum to the template minutes.
  "faults": [
    {
      "id": "early-extension",
      "name": "Early extension",
      "symptom": "Hips move toward the ball in the downswing; fat, thin or blocked/open-face strikes, heel hits.",
      "rootCauseHint": "Lead hip thrusts forward instead of back; spine angle lost; no room for the arms.",
      "swingPhase": "impact"
    },
    {
      "id": "over-the-top",
      "name": "Over the top (out-to-in handle)",
      "symptom": "Handle and shoulders move out and across; pull, pull-slice or steep out-to-in path.",
      "rootCauseHint": "Shoulder-led turn starts the downswing before the hands drop; trail elbow separates from the body.",
      "swingPhase": "transition"
    },
    {
      "id": "driver-hook",
      "name": "Driver hook (early opening)",
      "symptom": "Ball starts straight or right then hooks hard with the driver.",
      "rootCauseHint": "Chest and trail shoulder open early, face already closing; iron-style throw too aggressive for the driver arc.",
      "swingPhase": "impact"
    },
    {
      "id": "open-face-slice",
      "name": "Open-face cut-slice",
      "symptom": "Push-fade or out-to-in slice; face open to path at impact.",
      "rootCauseHint": "Club stalls while hips pop open; hands pulled toward lead hip, or an armsy swing with no body-to-club sync.",
      "swingPhase": "impact"
    },
    {
      "id": "lazy-transition",
      "name": "Lazy transition (no lead-side brace)",
      "symptom": "Contact and face fall apart late in a session, worst with driver; no post on the lead leg.",
      "rootCauseHint": "Lead leg never braces; hips spin instead of posting then turning.",
      "swingPhase": "transition"
    },
    {
      "id": "early-release-scoop",
      "name": "Early release / scoop (hitting up on irons)",
      "symptom": "Fat/thin irons, high spin-less flight, hands behind the ball at impact, shallow or positive attack angle with irons.",
      "rootCauseHint": "Wrist angles thrown away early; handle stalls and the clubhead passes the hands.",
      "swingPhase": "impact"
    },
    {
      "id": "holding-off",
      "name": "Holding off (club held back)",
      "symptom": "Block-push or fade, face stays open, hands never release; feels stuck through the ball.",
      "rootCauseHint": "Fear of the left miss; lead arm pulled in; face held square-to-open past impact.",
      "swingPhase": "impact"
    },
    {
      "id": "trail-elbow-flying",
      "name": "Trail elbow flying",
      "symptom": "Trail elbow rises or sticks out at the top and in transition; steep, inconsistent delivery.",
      "rootCauseHint": "Trail arm separates from the torso; no room to drop the club into the slot.",
      "swingPhase": "top"
    },
    {
      "id": "overturning",
      "name": "Overturning",
      "symptom": "Chest and shoulders spin open too early or too far; pull, hook or weak strikes.",
      "rootCauseHint": "Body turn outruns the club; chest points left of target before the club arrives.",
      "swingPhase": "transition"
    },
    {
      "id": "path-too-in-to-out",
      "name": "Path too in-to-out",
      "symptom": "Push or push-hook; club path far right of target; clipping the inside of the ball.",
      "rootCauseHint": "Club dropped too far behind the body; trail side drives under and out.",
      "swingPhase": "transition"
    },
    {
      "id": "grip-tension",
      "name": "Grip and arm tension",
      "symptom": "Lead hand squeezes on irons, trail index finger over-controls; lost speed and open face.",
      "rootCauseHint": "White-knuckle pressure; structure coming from the hands instead of the elbows and shoulders.",
      "swingPhase": "setup"
    },
    {
      "id": "false-groove",
      "name": "False groove (range vs course)",
      "symptom": "Great late-session reps but poor cold shots on the course.",
      "rootCauseHint": "Long blocked repetition grooves a feel that does not survive a cold start or a full routine.",
      "swingPhase": "mental-tempo"
    },
    {
      "id": "wedge-distance",
      "name": "Wedge distance control",
      "symptom": "Wedge carries are not pinpoint; gaps between clubs are uneven.",
      "rootCauseHint": "No calibrated swing lengths; speed varies with tempo and strike.",
      "swingPhase": "short-game"
    },
    {
      "id": "putting-speed",
      "name": "Putting speed control",
      "symptom": "Lag putts finish short or long; three-putts.",
      "rootCauseHint": "Stroke length and tempo not matched to distance; inconsistent strike.",
      "swingPhase": "putting"
    },
    {
      "id": "putting-start-line",
      "name": "Putting start line",
      "symptom": "Putts start off the intended line even on short putts.",
      "rootCauseHint": "Face angle at impact is not square; path is not repeatable; aim off.",
      "swingPhase": "putting"
    },
    {
      "id": "low-speed",
      "name": "Low swing speed",
      "symptom": "Club head speed and ball speed below target; short carries.",
      "rootCauseHint": "Weak ground force and sequencing, low rotational power, tension, or no speed training.",
      "swingPhase": "transition"
    },
    {
      "id": "takeaway-inside-roll",
      "name": "Inside roll takeaway",
      "symptom": "Club rolls inside and behind the hands early; steep or stuck from the top.",
      "rootCauseHint": "Forearms rotate the face open in the first move instead of a one-piece takeaway.",
      "swingPhase": "takeaway"
    },
    {
      "id": "low-point-control",
      "name": "Low point control (fat/thin)",
      "symptom": "Fat and thin strikes; divot starts behind the ball.",
      "rootCauseHint": "Weight and handle not forward at impact; low point behind the ball.",
      "swingPhase": "impact"
    },
    {
      "id": "face-control",
      "name": "Face control (two-way miss)",
      "symptom": "Cannot reliably start the ball straight; face-to-path wanders hook to slice.",
      "rootCauseHint": "No reference for neutral face; feel cycling between releases.",
      "swingPhase": "impact"
    },
    {
      "id": "top-position-wrist",
      "name": "Top-of-swing wrist position",
      "symptom": "Cupped or bowed lead wrist at the top; face open or closed before transition.",
      "rootCauseHint": "Wrist angle set too early or collapsed; grip and takeaway rotation.",
      "swingPhase": "top"
    },
    {
      "id": "rushed-tempo",
      "name": "Rushed tempo",
      "symptom": "Quick transition, no sequence; inconsistent contact.",
      "rootCauseHint": "Backswing too short in time, or hitting from the top with the arms.",
      "swingPhase": "mental-tempo"
    },
    {
      "id": "steep-driver-aoa",
      "name": "Hitting down on the driver",
      "symptom": "Low launch, high spin, weak driver; negative attack angle.",
      "rootCauseHint": "Ball too far back or tee too low; weight left at address and spine tilted toward target.",
      "swingPhase": "impact"
    },
    {
      "id": "course-transfer",
      "name": "Range-to-course transfer",
      "symptom": "Practice swing quality does not show up on the course or under a full pre-shot routine.",
      "rootCauseHint": "Blocked practice with no variation, no target and no routine.",
      "swingPhase": "mental-tempo"
    },
    {
      "id": "short-putt-pressure",
      "name": "Short putt pressure",
      "symptom": "Misses inside 5 ft when it counts; tentative stroke.",
      "rootCauseHint": "No pressure-practice; decelerating stroke.",
      "swingPhase": "putting"
    },
    {
      "id": "poor-setup-posture",
      "name": "Setup and posture",
      "symptom": "Inconsistent spine angle, ball position or alignment at address.",
      "rootCauseHint": "No repeatable pre-swing check; limited hip hinge or rotation mobility.",
      "swingPhase": "setup"
    }
  ],
  "environments": [
    {
      "id": "mirror",
      "name": "Mirror (no ball)",
      "desc": "Full-length mirror or camera at home; slow rehearsals and position checks with no ball."
    },
    {
      "id": "putting-mat",
      "name": "Putting mat",
      "desc": "Putting mat or carpet with a cup; quiet and good for sore days."
    },
    {
      "id": "sim",
      "name": "Sim (garage net / launch monitor)",
      "desc": "Garage net with a launch monitor and sim software for data feedback."
    },
    {
      "id": "range",
      "name": "Range",
      "desc": "Outdoor range or practice area with real ball flight."
    },
    {
      "id": "course",
      "name": "Course",
      "desc": "On-course practice or play; full pre-shot routine and real consequences."
    },
    {
      "id": "gym",
      "name": "Gym",
      "desc": "Weight room or home gym for speed and strength work."
    }
  ],
  "sessionTemplates": [
    {
      "id": "session-15",
      "minutes": 15,
      "name": "15-Minute Tune-Up",
      "blocks": [
        {
          "name": "Warm-up",
          "minutes": 3,
          "kind": "warmup",
          "note": "Short mobility and half swings (see Structured 5-Minute Warm-Up, compressed)."
        },
        {
          "name": "Cold start",
          "minutes": 2,
          "kind": "cold",
          "note": "First 3 shots with a full routine to a target, before any grooving. Log them separately."
        },
        {
          "name": "Active feel block",
          "minutes": 6,
          "kind": "block",
          "note": "One drill, one cue. 2-5 s between swings. Rest 20-30 s between hard reps. Pick 2-3 training aids for the block, not all of them."
        },
        {
          "name": "Transfer",
          "minutes": 3,
          "kind": "transfer",
          "note": "3 shots, different target each, full pre-shot routine, 15-20 s between shots."
        },
        {
          "name": "Log",
          "minutes": 1,
          "kind": "log",
          "note": "Session summary, key takeaway, next step."
        }
      ]
    },
    {
      "id": "session-30",
      "minutes": 30,
      "name": "30-Minute Core Session",
      "blocks": [
        {
          "name": "Warm-up drill",
          "minutes": 5,
          "kind": "warmup",
          "note": "Structured warm-up or the day's setup drill."
        },
        {
          "name": "Cold start",
          "minutes": 3,
          "kind": "cold",
          "note": "3-5 shots first, full routine, one target, before any grooving. Log first 3 vs last 3 later."
        },
        {
          "name": "Active feel block",
          "minutes": 12,
          "kind": "block",
          "note": "One or two cues only. 2-3 training aids max. Driver capped about 15-20 min total, in 2-3 clusters. Rest 20-30 s between hard reps."
        },
        {
          "name": "Transfer / random set",
          "minutes": 8,
          "kind": "transfer",
          "note": "Change club and target every shot; full pre-shot routine; 15-20 s between shots."
        },
        {
          "name": "2-minute log",
          "minutes": 2,
          "kind": "log",
          "note": "Session summary, ball flight and feel findings, key takeaway, next session step, fault tags."
        }
      ]
    },
    {
      "id": "session-45",
      "minutes": 45,
      "name": "45-Minute Session",
      "blocks": [
        {
          "name": "Warm-up drill",
          "minutes": 5,
          "kind": "warmup",
          "note": "Structured warm-up."
        },
        {
          "name": "Cold start",
          "minutes": 4,
          "kind": "cold",
          "note": "3-5 shots first with a full routine; log separately."
        },
        {
          "name": "Active feel block A",
          "minutes": 12,
          "kind": "block",
          "note": "Main fault drill. 2-3 aids max. Rest 20-30 s between hard reps."
        },
        {
          "name": "Active feel block B",
          "minutes": 10,
          "kind": "block",
          "note": "Second drill or driver cluster. Driver stays inside 15-20 min across 2-3 clusters with pauses."
        },
        {
          "name": "Putting",
          "minutes": 4,
          "kind": "putting",
          "note": "Gate or speed ladder; one putting cue only."
        },
        {
          "name": "Transfer / random set",
          "minutes": 8,
          "kind": "transfer",
          "note": "Full pre-shot routine, new target each shot, 15-20 s between shots."
        },
        {
          "name": "2-minute log",
          "minutes": 2,
          "kind": "log",
          "note": "Structured end-of-session log with fault tags."
        }
      ]
    },
    {
      "id": "session-60",
      "minutes": 60,
      "name": "60-Minute Full Session",
      "blocks": [
        {
          "name": "Warm-up drill",
          "minutes": 5,
          "kind": "warmup",
          "note": "Structured warm-up."
        },
        {
          "name": "Cold start",
          "minutes": 4,
          "kind": "cold",
          "note": "3-5 shots first with a full routine; log separately."
        },
        {
          "name": "Active feel block A",
          "minutes": 12,
          "kind": "block",
          "note": "Main fault drill. 2-3 aids max. Rest 20-30 s between hard reps."
        },
        {
          "name": "Active feel block B",
          "minutes": 10,
          "kind": "block",
          "note": "Second drill. Driver work here is cluster 1 or 2 of 2-3; total driver stays 15-20 min."
        },
        {
          "name": "Speed set",
          "minutes": 6,
          "kind": "speed",
          "note": "Optional overload/underload swings. Stop if smash factor drops below ~1.40 or contact degrades. Rest 20-30 s between max swings."
        },
        {
          "name": "Putting",
          "minutes": 8,
          "kind": "putting",
          "note": "Start-line gate, then speed ladder or pressure 4-footers."
        },
        {
          "name": "Transfer / random set",
          "minutes": 12,
          "kind": "transfer",
          "note": "Course simulation: full pre-shot routine, 15-20 s between shots, last 3 vs first 3 compared."
        },
        {
          "name": "Log",
          "minutes": 3,
          "kind": "log",
          "note": "Session summary, ball flight and feel findings, key takeaway, next step, body state."
        }
      ]
    }
  ],
  "simulatorRoutines": {
    "swing-speed": {
      "id": "swing-speed",
      "title": "Overspeed Sticks & Max Intent Speed Combine",
      "tagline": "Build effortless clubhead speed with speed sticks & launch monitor tracking.",
      "focusArea": "Speed & Power",
      "recommendedClub": "Driver / Overspeed Sticks",
      "hackmotionCue": "Hold lead wrist flexion through high-speed release without casting early.",
      "cadence": "21/7 (Tour Fast)",
      "steps": [
        "Dynamic warmup: 5 minutes ribcage & hip CARs setup rotations.",
        "Speed sticks protocol: 3 sets of 5 swings (Light, Medium, Heavy) at 100% effort (3 non-dominant / 5 dominant).",
        "Driver max-intent release: 8 balls tracking ball speed on GSPro, completely ignoring direction.",
        "Reset: 5 smooth 7-iron swings with HackMotion focusing on crisp center-face compression."
      ]
    },
    "variation-training": {
      "id": "variation-training",
      "title": "Differential Shot-Shaping Matrix (High/Low Draw/Fade)",
      "tagline": "Master clubface awareness by hitting extreme shapes on command (from agentic-caddy).",
      "focusArea": "Face & Path Control",
      "recommendedClub": "7 Iron / 8 Iron",
      "hackmotionCue": "Compare to your own stock readings: draw = slightly more flexion through P6-P7 (face closed to path); fade = slightly less (hold the face off).",
      "cadence": "24/8 (Tour Standard)",
      "steps": [
        "Hit 3 balls with a high push-draw: in-to-out path, face closed to the path but open to the target (starts right, curves back).",
        "Hit 3 balls with a low pull-fade: out-to-in path, face open to the path but closed to the target (starts left, curves back).",
        "Hit 3 balls with a high soft tower shot: ball slightly forward, more dynamic loft, centered strike, neutral path.",
        "Hit 3 balls with a low piercing punch: ball back, hands pressed forward, abbreviated finish (impact a few degrees more flexed than your stock reading).",
        "Sim challenge: play 3 virtual holes alternating high draw and low fade off every tee box."
      ]
    },
    "iron-ladder": {
      "id": "iron-ladder",
      "title": "Pin Hunter & Trajectory Control Ladder",
      "tagline": "Dial in distance gapping and ball compression using your stock yardages.",
      "focusArea": "Distance Control & Gapping",
      "recommendedClub": "7 Iron & 8 Iron",
      "hackmotionCue": "Repeat your stock impact reading within ±3° to keep dynamic loft consistent.",
      "cadence": "24/8 (Tour Standard)",
      "steps": [
        "Target lock: hit 10 balls to a virtual green at your stock 7-iron carry (~148y); track dispersion circle diameter on GSPro.",
        "Distance ladder: with the same 7-iron hit stock, stock -10y and stock -20y by shortening backswing length.",
        "Window ladder: hit low punch (<50ft apex), stock (70-80ft apex), and high (95ft+ apex) with an 8-iron."
      ]
    },
    "driving-combine": {
      "id": "driving-combine",
      "title": "Fairway Finder & Upward AoA Driver Combine",
      "tagline": "Establish a reliable tournament driver delivery with +2° to +4° upward AoA.",
      "focusArea": "Driver Dispersion & Launch",
      "recommendedClub": "Driver",
      "hackmotionCue": "Impact reading close to your top (0–5° more flexion), no extension through the ball, while AoA reads about +3° (Launch Pro club data).",
      "cadence": "24/8 or 21/7",
      "steps": [
        "Spray clubface with strike spray or dry shampoo; hit 5 drives focusing on high-toe sweet spot strike.",
        "Fairway corridor test: 10 consecutive drives; score 1 point for every ball finishing in a 40-yard fairway (pass = 5-6/10).",
        "Pressure drive: Imagine 18th hole at Cabot Cliffs with ocean right; execute committed stock shape."
      ]
    }
  },
  "swingChecklist": {
    "phases": [
      {
        "id": "setup",
        "name": "Setup"
      },
      {
        "id": "backswing",
        "name": "Backswing"
      },
      {
        "id": "top",
        "name": "Top"
      },
      {
        "id": "downswing",
        "name": "Downswing"
      },
      {
        "id": "impact",
        "name": "Impact"
      },
      {
        "id": "finish",
        "name": "Finish"
      }
    ],
    "defaultFocusIds": [
      "ds-maintain-tilt",
      "ds-trail-shoulder-chin"
    ],
    "items": [
      {
        "id": "setup-grip",
        "phase": "setup",
        "title": "Neutral grip",
        "cue": "Two to two-and-a-half knuckles on the lead hand; both Vs point at the trail shoulder.",
        "why": "Grip sets the clubface; most face problems start here.",
        "check": {
          "dtl": "",
          "fo": "Count knuckles on the lead hand at address."
        },
        "drillIds": []
      },
      {
        "id": "setup-posture",
        "phase": "setup",
        "title": "Athletic posture: hinge from the hips",
        "cue": "Hinge from the hips with a flat back. Slight knee flex. Arms hang straight down from the shoulders.",
        "why": "This forward bend is the 'tilt' you have to keep for the whole swing. If you start too upright you have nothing to keep.",
        "check": {
          "dtl": "Spine line from tailbone to the base of the neck, arms hanging under the shoulders, balanced over the middle of the feet.",
          "fo": ""
        },
        "drillIds": [
          "thoracic-pelvic-unlock"
        ]
      },
      {
        "id": "setup-side-tilt",
        "phase": "setup",
        "title": "Trail shoulder slightly lower",
        "cue": "Trail hand is lower on the grip, so the trail shoulder sits a little lower and the spine tilts slightly away from the target.",
        "why": "Presets the body behind the ball and an inside path.",
        "check": {
          "dtl": "",
          "fo": "Shoulder line tilts slightly. Driver has more tilt than irons."
        },
        "drillIds": [
          "driver-headcover-aoa"
        ]
      },
      {
        "id": "setup-alignment",
        "phase": "setup",
        "title": "Alignment & ball position",
        "cue": "Feet, hips and shoulders parallel to the target line. Ball in the middle for mid-irons, moving forward to inside the lead heel for driver.",
        "check": {
          "dtl": "Alignment stick on the ground; check that the shoulder line matches it.",
          "fo": "Ball position relative to the sternum."
        },
        "drillIds": [
          "gate-towel-lowpoint"
        ]
      },
      {
        "id": "bs-takeaway",
        "phase": "backswing",
        "title": "One-piece takeaway",
        "cue": "Club, hands and chest move away together. At P2 the clubhead is outside or covering the hands.",
        "why": "An inside roll early leads to a steep, over-the-top move later.",
        "check": {
          "dtl": "At shaft-parallel the clubhead covers the hands and the toe points up, matching the spine.",
          "fo": ""
        },
        "drillIds": [
          "headcover-outside-takeaway"
        ]
      },
      {
        "id": "bs-lead-shoulder-chin",
        "phase": "backswing",
        "title": "Lead shoulder turns under the chin",
        "cue": "The lead shoulder turns down and under the chin. It doesn't go level around the body.",
        "why": "Turning around a tilted spine keeps you in posture. A level shoulder turn pulls you upright.",
        "check": {
          "dtl": "Lead shoulder moves toward the ball and down. Head stays roughly where it started.",
          "fo": "Lead shoulder ends behind the ball, under the chin."
        },
        "drillIds": [
          "thoracic-pelvic-unlock"
        ]
      },
      {
        "id": "bs-shoulder-plane",
        "phase": "backswing",
        "title": "Shoulders turn on a tilted plane",
        "cue": "Turn the shoulders at roughly 90° to your spine angle. It's steeper than it feels. Lead shoulder down, trail shoulder up and back.",
        "why": "Shoulders that turn flat (level to the ground) are the classic reason people stand up. The body has to rise to make room for the arms.",
        "check": {
          "dtl": "At the top the shoulder line points well below the shoulder height you had at address. A level shoulder line at the top means a flat turn.",
          "fo": ""
        },
        "drillIds": [
          "thoracic-pelvic-unlock",
          "wall-glute-turn-p4"
        ]
      },
      {
        "id": "bs-keep-tilt",
        "phase": "backswing",
        "title": "Keep your tilt, head height steady",
        "cue": "Keep the forward bend you set at address. Chest stays over the ball, and the head doesn't rise.",
        "why": "Losing posture in the backswing forces a re-dip or a stand-up later.",
        "check": {
          "dtl": "Draw a line along the head and the spine at address in Kinovea. At the top, the head is still at that line and the spine angle is the same.",
          "fo": ""
        },
        "drillIds": [
          "wall-glute-turn-p4"
        ]
      },
      {
        "id": "bs-trail-hip-deep",
        "phase": "backswing",
        "title": "Trail hip turns back, not up or toward the ball",
        "cue": "The trail pocket turns back, behind you. Seat stays on the 'wall' line. Trail knee keeps some flex. No sway.",
        "why": "Depth in the hips makes room for the arms on the way down.",
        "check": {
          "dtl": "The rear end stays on or behind the butt line you drew at address.",
          "fo": "Trail hip doesn't slide outside the trail foot."
        },
        "drillIds": [
          "wall-glute-turn-p4"
        ]
      },
      {
        "id": "top-flat-wrist",
        "phase": "top",
        "title": "Lead wrist flat-ish, face square",
        "cue": "Lead wrist flat or slightly bowed, not cupped. Clubface roughly matches the lead forearm.",
        "check": {
          "dtl": "Leading edge roughly parallel to the lead forearm.",
          "fo": ""
        },
        "drillIds": [
          "hackmotion-p4-flat-wrist"
        ]
      },
      {
        "id": "top-full-turn",
        "phase": "top",
        "title": "Full turn, back to target",
        "cue": "Back faces the target, lead shoulder is behind the ball, and the weight is on the inside of the trail foot.",
        "check": {
          "dtl": "",
          "fo": "Lead shoulder is behind the ball. Head hasn't drifted outside the trail foot."
        },
        "drillIds": [
          "wall-glute-turn-p4"
        ]
      },
      {
        "id": "ds-pressure-first",
        "phase": "downswing",
        "title": "Pressure shifts lead first",
        "cue": "Start the downswing from the ground. Pressure moves into the lead foot before the arms fire.",
        "why": "Sequencing: lower body leads, upper body follows.",
        "check": {
          "dtl": "",
          "fo": "Belt buckle moves toward the target early in the downswing."
        },
        "drillIds": [
          "step-through-pressure-shift"
        ]
      },
      {
        "id": "ds-trail-elbow",
        "phase": "downswing",
        "title": "Trail elbow drops in front of the hip",
        "cue": "The trail elbow works down in front of the trail hip, which shallows the shaft.",
        "check": {
          "dtl": "At P5-P6 the shaft is on or under the hands-to-ball plane line.",
          "fo": ""
        },
        "drillIds": [
          "pump-and-drop-p5",
          "noodle-plane-gate"
        ]
      },
      {
        "id": "ds-maintain-tilt",
        "phase": "downswing",
        "title": "Maintain tilt: don't stand up",
        "cue": "Chest stays down and the seat stays back on the wall line while the hips open. Don't thrust the hips toward the ball.",
        "why": "Early extension (standing up) closes the space for the arms, which causes heel strikes, blocks, thin shots and flips. It is the most common amateur fault.",
        "check": {
          "dtl": "The butt line from address: hips stay on it through impact. The head line: the head doesn't rise or move toward the ball. If the hips move off the line toward the ball and the head lifts, you're standing up.",
          "fo": ""
        },
        "fault": "Early extension / standing up",
        "drillIds": [
          "left-hip-clearance-rope",
          "hackmotion-shaft-lean-impact"
        ]
      },
      {
        "id": "ds-trail-shoulder-chin",
        "phase": "downswing",
        "title": "Trail shoulder goes down and under the chin",
        "cue": "Through impact the trail shoulder works DOWN and under the chin, not out and around. Shoulders tilt steeply through the ball.",
        "why": "It's the downswing mirror of the backswing turn. A trail shoulder that turns level forces you up and out of posture.",
        "check": {
          "dtl": "Just after impact the trail shoulder is lower than the lead, and the spine angle is still bent toward the ball.",
          "fo": "The trail shoulder passes under the chin as the head stays behind the ball."
        },
        "fault": "Shoulders spin level / over the top",
        "drillIds": [
          "left-hip-clearance-rope",
          "step-through-pressure-shift"
        ]
      },
      {
        "id": "imp-hands-ahead",
        "phase": "impact",
        "title": "Hands ahead, ball-first strike",
        "cue": "Hands ahead of the ball with forward shaft lean. Strike the ball, then the turf.",
        "check": {
          "dtl": "",
          "fo": "Shaft leans toward the target at impact; divot starts after the ball."
        },
        "drillIds": [
          "impact-bag-motorcycle",
          "gate-towel-lowpoint",
          "hackmotion-shaft-lean-impact"
        ]
      },
      {
        "id": "imp-weight-forward",
        "phase": "impact",
        "title": "Weight forward, hips open",
        "cue": "About 70-80% of the weight on the lead side. Hips open, shoulders close to square.",
        "check": {
          "dtl": "",
          "fo": "Lead hip is over or outside the lead foot at impact."
        },
        "drillIds": [
          "step-through-pressure-shift"
        ]
      },
      {
        "id": "imp-head-behind",
        "phase": "impact",
        "title": "Head behind the ball",
        "cue": "Head stays behind the ball through impact, especially with driver.",
        "check": {
          "dtl": "",
          "fo": "Head is behind the ball at impact."
        },
        "drillIds": [
          "driver-headcover-aoa"
        ]
      },
      {
        "id": "fin-balanced",
        "phase": "finish",
        "title": "Balanced full finish",
        "cue": "Chest faces the target, nearly all the weight is on the lead foot, trail toe up on its tip. Hold it for three seconds.",
        "why": "A finish you can hold proves the sequence and the balance were right.",
        "check": {
          "dtl": "",
          "fo": "Belt buckle and chest face the target; trail shoulder ends closer to the target than the lead shoulder."
        },
        "drillIds": [
          "step-through-pressure-shift"
        ]
      }
    ]
  }
};
