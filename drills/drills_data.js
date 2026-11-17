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
      "subtitle": "Kids Asleep / Quiet Mode — Low-Noise Strike, Start Line & Sequencing"
    },
    {
      "id": "sore",
      "label": "Gym-Sore / Recovery",
      "shortLabel": "Gym-Sore",
      "icon": "💪",
      "badgeColor": "#f59e0b",
      "subtitle": "Zero/Low-Impact Mobility, Slow-Mo Kinovea Rehearsals & Putting/Chipping"
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
      "hackmotionPrescription": "10 Biofeedback calibration reps: P4 Flat Wrist (0°) -> P7 Bowed Impact (-14°). Green tone check.",
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
      "hackmotionPrescription": "P1 Address: +14° Ext -> P2 Takeaway: +8° Ext -> P4 Top: 0° to -4° Flexion (Zero slice cup).",
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
      "hackmotionPrescription": "P5-P6 Motorcycle move: Bow lead wrist to -10° to -14° flexion during transition to square face early.",
      "cadenceTarget": "24/8 (Tour Standard) • Patient top pause"
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
      "hackmotionPrescription": "P7 Impact Bow: -14° to -18° Flexion with forward shaft lean. Red alert tone if wrist extends > 0°.",
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
      "hackmotionPrescription": "Extension Clamp: Lock wrist within ±3° throughout stroke to eliminate flippy distance variance.",
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
      "hackmotionPrescription": "Maintain flat wrist (-5° flexion) at impact while swinging +2° to +4° upward on GSPro.",
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
      "summary": "When DOMS hits from squats/deadlifts/push day, stack clean motor patterns with zero joint stress so you still hit Daily Delivery.",
      "hackmotionPrescription": "Wrist Mobility Flow: 15 slow radial/ulnar deviation rolls + P1-P6 slow-motion checkpoint holds.",
      "cadenceTarget": "30/10 (Deliberate Slow-Mo) • Zero strain"
    }
  ],
  "drills": [
    {
      "id": "thoracic-pelvic-unlock",
      "title": "T-Spine Open Books + Hip CARs Setup Flow",
      "section": "Mobility & Setup Calibration",
      "focus": "Rotation Separation & Posture",
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
      "reps": "8 reps/side + 10 hip hinges",
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
        "Place a foam roller or pillow under top knee on your side; perform 6 slow Open-Book thoracic rotations each side, exhaling at end range.",
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
        "sore": "CORE DRILL ON GYM-SORE DAYS: Extend to 2 rounds at 6/10 effort; stop short of muscle strain."
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "gate-towel-lowpoint",
      "title": "Towel Behind Ball + Tee Strike Spray Calibration",
      "section": "Mobility & Setup Calibration",
      "focus": "Ball-First Strike & Low Point",
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
      "why": "Most directional misses on the sim come from a shifting low point—hitting slightly behind the ball tricks the launch monitor or flips the clubface shut/open at the last millisecond. A flat towel 4 inches behind the ball gives instant, quiet feedback on whether your sternum and lead wrist moved forward through impact.",
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
        "real": "Hit 12-15 8-iron punch shots watching GSPro AoA (-3 to -5 deg down) and center smash factor (>1.33).",
        "almost": "Ideal for night! Almost golf balls compress cleanly off a thin towel with whisper-quiet mat contact—track face marks every ball.",
        "sore": "Optional with half-swings only (no towel slam); keep swing length knee-to-knee."
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "nine-to-three-delivery",
      "title": "9-to-3 Delivery Reset (Metronome Sync)",
      "section": "Mobility & Setup Calibration",
      "focus": "Arms-Body Sync & Face Control",
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
        "real": "Watch GSPro Club Path (+/- 1.5 deg) and Face to Path (+/- 1 deg) on crisp 75-95 yard 8i shots.",
        "almost": "Perfect Kids-Asleep staple: swing at 60% effort through a foam/start-line gate; focus on pure turf brush sound.",
        "sore": "Do 2 sets of 8 brush-only or slow-mo 30% reps with 2-second hold at 3 o'clock finish—zero harsh deceleration stress."
      },
      "hackmotion": {
        "targetMode": "P6 to P8 Delivery & Metronome Sync",
        "addressAngle": "+14° Extension",
        "topAngle": "0° (Half swing top)",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion (Shaft lean)",
        "biofeedbackTone": "Sync wrist flexion beep with Metronome Tone 2 and Tone 3.",
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
        "dtl": "At P2 (hands over trail thigh), clubhead covers/slightly outside hands; grip end points toward belt buckle.",
        "fo": "Lead arm straight without rigid tension; slight forward shaft lean maintained early."
      },
      "modePlans": {
        "real": "Use 2-rehearsal + 1-real-ball ratio; check Kinovea DTL Live Replay after every 3rd swing.",
        "almost": "Do 20 almost golf balls focusing solely on hitting P2 window cleanly at 65% speed.",
        "sore": "Pure P1 -> P2 -> P3 slow-motion pauses in front of Kinovea DTL camera (no ball impact needed)."
      },
      "hackmotion": {
        "targetMode": "P1 to P4 Top-of-Swing Face Alignment",
        "addressAngle": "+14° Extension",
        "topAngle": "0° to -4° Flexion (Anti-Slice flat wrist)",
        "p6Angle": "-8° Flexion",
        "impactAngle": "-12° Flexion",
        "biofeedbackTone": "Buzzer alerts if wrist cups > +8° extension at P4.",
        "equipment": [
          "HackMotion",
          "Kinovea DTL",
          "6 Iron"
        ]
      }
    },
    {
      "id": "wall-glute-turn-p4",
      "title": "Trail-Side Wall / Stick P4 Depth Check",
      "section": "P1-P4 Backswing Structure",
      "focus": "Hip Depth & Structure at the Top",
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
        "sore": "EXCELLENT GYM-SORE DRILL: Zero explosive load, builds massive awareness of pelvis tilt and depth."
      },
      "hackmotion": {
        "targetMode": "P1 to P4 Top-of-Swing Face Alignment",
        "addressAngle": "+14° Extension",
        "topAngle": "0° to -4° Flexion (Anti-Slice flat wrist)",
        "p6Angle": "-8° Flexion",
        "impactAngle": "-12° Flexion",
        "biofeedbackTone": "Buzzer alerts if wrist cups > +8° extension at P4.",
        "equipment": [
          "HackMotion",
          "Kinovea DTL",
          "6 Iron"
        ]
      }
    },
    {
      "id": "pump-and-drop-p5",
      "title": "P4-to-P5 Split-Hand Shallowing Pump",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Drop Trail Elbow & Shallow Shaft",
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
        "real": "Alternate 2 slow-pump rehearsals with 1 smooth 75% ball; track GSPro Club Path shifting from out-to-in toward +1 to +3 in-to-out.",
        "almost": "With almost balls, hit real shots straight from the split-hand grip at 50% speed—instant feel for trail arm shallowing!",
        "sore": "Slow-mo mirror/Kinovea split-hand pumps only (3 sets of 10 pauses at P5, no full swing needed)."
      },
      "hackmotion": {
        "targetMode": "P4 to P5 Shallowing Flexion Increase",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-12° Flexion (Motorcycle shallow move)",
        "impactAngle": "-15° Flexion",
        "biofeedbackTone": "Audio tone fires as you pump down to P5 with flexed lead wrist.",
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
      "why": "Hanging back on the trail foot kills compression and promotes an early scoop. Stepping through toward the target right after impact forces your weight onto your lead side early in transition and guarantees full hip rotation through P8.",
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
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "noodle-plane-gate",
      "title": "Alignment Stick / Noodle Anti-OTT Plane Guard",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Neutralize Steep Over-The-Top Path",
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
      "why": "Feel isn't real—visual feedback in space reprograms path in minutes. Setting a foam pool noodle along your shaft plane behind and slightly above your hands makes swinging over-the-top physically impossible without hitting the foam, instantly teaching your arms to drop underneath.",
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
        "almost": "Top Quiet-Night drill: foam noodle + almost golf balls is completely safe, quiet, and pure motor retraining.",
        "sore": "Set noodle up and do 15 slow practice sweeps at 30% effort—zero ball impact stress."
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "impact-bag-motorcycle",
      "title": "Impact Bag + Motorcycle Lead-Wrist Bow Drill",
      "section": "P6-P8 Impact & Compression",
      "focus": "Forward Shaft Lean & Face Squareness",
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
        "sore": "TOP GYM-SORE DRILL: Hold P7 impact alignments isometric-style for 3 seconds x 12 reps without fast impacts."
      },
      "hackmotion": {
        "targetMode": "Impact Lead Wrist Flexion & Forward Lean",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion (Flat)",
        "p6Angle": "-12° Flexion (Motorcycle Bow)",
        "impactAngle": "-16° to -20° Flexion (Maximum Compression)",
        "biofeedbackTone": "Continuous green tone when lead wrist exceeds -12° flexion into impact bag.",
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
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "wedge-distance-clock",
      "title": "3-Clock Wedge Matrix (8 / 9 / 10:30 Systems)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Repeatable Carry Gaps & Trajectory",
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
      "why": "Throwing hard or decelerating wedges out of intuition creates 12-yard carry errors inside 100 yards. Controlling distance with *swing length* (clock face positions) while accelerating smoothly with constant tempo makes every 45–110 yard wedge automatic under pressure.",
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
        "targetMode": "Wedge Wrist Extension Stability Clamp",
        "addressAngle": "+10° Extension",
        "topAngle": "0° Flexion",
        "p6Angle": "-6° Flexion",
        "impactAngle": "-12° Flexion (Shaft lean)",
        "biofeedbackTone": "Keep wrist deviation within ±3° throughout stroke to eliminate distance float.",
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
      "why": "Face angle dictates 75–85% of initial ball direction across wedges, irons, and putts. Placing a tight visual gate right in front of the ball turns silent indoor time into tournament-grade face control work without waking anyone or stressing sore muscles.",
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
        "almost": "PRIMARY KIDS-ASLEEP DRILL: Whisper quiet, high focus, genuinely lowers handicaps fastest per minute spent.",
        "sore": "PRIMARY GYM-SORE DRILL: Standing upright with zero spinal load—keeps daily delivery streak alive cleanly."
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "driver-headcover-aoa",
      "title": "Driver Upward AoA Gate (Forward Tee + Box Shield)",
      "section": "Driver Launch & Start Line",
      "focus": "+2 to +4 Deg Attack Angle & High Launch",
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
        "Check GSPro numbers: target AoA +2 to +4 deg, launch 12–14 deg, spin 2100–2500 rpm."
      ],
      "checkpoints": {
        "dtl": "Head stays calmly behind ball into impact; path exits low-left safely without steep swipe.",
        "fo": "Clear secondary axis tilt (belt slightly ahead, upper spine stacked calmly behind ball)."
      },
      "modePlans": {
        "real": "Main driver sim block drill—hit 12 drives with full Kinovea DTL + FO sync and GSPro dispersion chart.",
        "almost": "Quiet swap: use a 5-wood or 7-iron off a low rubber tee with almost golf balls at 65% speed (leave driver in bag if kids sleep overhead).",
        "sore": "Skip full-speed driver on heavy DOMS days; move to Putting/Short-Putt Gates or Slow-Mo Takeaways."
      },
      "hackmotion": {
        "targetMode": "Driver Flat Wrist with Upward AoA",
        "addressAngle": "+16° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-8° Flexion",
        "impactAngle": "-5° Flexion (Flat wrist, no scoop, sweeping up)",
        "biofeedbackTone": "Green tone confirms flat wrist through ball while hitting over headcover box.",
        "equipment": [
          "HackMotion",
          "Driver",
          "Tee Box Gate"
        ]
      }
    },
    {
      "id": "driver-startline-fairway-challenge",
      "title": "One-Side Miss Fairway Start-Line Test",
      "section": "Driver Launch & Start Line",
      "focus": "Eliminate Two-Way Miss & Pressure Reps",
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
      "why": "Random block practice on a wide range creates false confidence. Scoring 10 consecutive drives against a 30-yard virtual fairway—and logging whether your miss stays strictly on ONE side of the target—trains course-transfer commitment and exposes under-pressure tendencies.",
      "instructions": [
        "Open GSPro Driving Range with a 30-yard target grid (15 yds left / 15 yds right of center line).",
        "Commit to your stock shot shape (e.g., baby fade starting just left of center, or draw starting just right).",
        "Complete full pre-shot routine behind every single ball—change target line slightly every 2 balls.",
        "Score 10 balls: +1 for hitting the 30-yard corridor, -1 for a two-way miss on the forbidden side. Log score in Daily Delivery!"
      ],
      "checkpoints": {
        "dtl": "Committed full balanced finish held for 3 seconds on every shot (P9/P10 balance).",
        "fo": "Head stays steady behind ball with chest fully turned toward target."
      },
      "modePlans": {
        "real": "Capstone game at the end of Day 5 Driver sessions—log X/10 Fairways & Stock Shape Consistency in Goals Tracker.",
        "almost": "Replace with Alignment Stick Gate start-line challenge using an 8-iron and almost balls.",
        "sore": "Skip on recovery days; run visualization/pre-shot routine reps only."
      },
      "hackmotion": {
        "targetMode": "Standard Tour Delivery Profile",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Biofeedback active in transition and impact windows.",
        "equipment": [
          "HackMotion",
          "SimWatch"
        ]
      }
    },
    {
      "id": "hackmotion-motorcycle-p5-p6",
      "title": "HackMotion Motorcycle Shallowing & Flexion Lock (P5-P6)",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Lead Wrist Flexion & Early Face Squaring",
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
      "why": "Over 85% of amateur slices and steep over-the-top deliveries happen because the clubface is open at P4/P5. When the brain senses an open face, it frantically casts the hands or throws the club outside-in to prevent a block right. HackMotion trains the signature modern Tour move: bowing the lead wrist early during transition (P5) so the clubface is square 3 feet before impact, allowing you to aggressively rotate your chest and hips without fear of slicing.",
      "instructions": [
        "Strap on HackMotion and open the Flexion/Extension Biofeedback mode with target green band set between -8° and -15° flexion.",
        "Take your normal 7-iron address (+12° to +16° extension) and turn smoothly to P4 (flat wrist, 0° to -3°).",
        "During transition from P4 to P5, feel your lead wrist 'bow' like revving a motorcycle throttle down toward the turf as pressure shifts to lead heel.",
        "Listen for the HackMotion audio tone confirmation at P5 before continuing rotation through to finish.",
        "Hit 5 slow-motion balls (50% speed) stopping at P6 to verify clubface angle matches spine angle on Kinovea DTL."
      ],
      "checkpoints": {
        "dtl": "Shaft shallows below trail shoulder plane; clubface matches spine angle (closed relative to path, square to arc).",
        "fo": "Lead wrist visibly bowed; knuckles pointing down; hands leading the clubhead by 4+ inches at P6."
      },
      "hackmotion": {
        "targetMode": "Transition Flexion Biofeedback",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion (Flat)",
        "p6Angle": "-12° to -15° Flexion (Motorcycle Bow)",
        "impactAngle": "-15° to -18° Flexion (Shaft Lean)",
        "biofeedbackTone": "Continuous green tone sounds when lead wrist reaches -10° flexion at P5.",
        "equipment": [
          "HackMotion Pro",
          "7 Iron",
          "Kinovea FO"
        ]
      },
      "modePlans": {
        "real": "Execute 10 live balls on GSPro; verify push-draw ball flight with zero right-side miss.",
        "almost": "Perform 15 continuous dry rehearsal reps listening for HackMotion audio tone in headphones.",
        "sore": "Ultra-slow-motion motor pattern mapping: 10 reps holding P5-P6 for 3 seconds each with zero joint shock."
      }
    },
    {
      "id": "hackmotion-shaft-lean-impact",
      "title": "HackMotion Pure Shaft Lean & Compression (P7 Strike)",
      "section": "P6-P8 Impact & Compression",
      "focus": "Anti-Scoop & Forward Shaft Lean",
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
        "keyFrameCue": "Lead wrist bowed -15° at impact—knuckles to turf, forward shaft lean, zero scoop."
      },
      "why": "Amateur golfers commonly scoop or flip at impact trying to help the golf ball into the air, resulting in weak spinny launch, fat/thin strikes, and loss of 20+ yards of iron distance. HackMotion measures the exact millisecond of impact: elite tour ball strikers have 12° to 18° of forward shaft lean (negative wrist extension) at strike. Training this eliminates early release permanently.",
      "instructions": [
        "Set HackMotion to Impact Flexion Mode. Set red buzzer alert for any strike where lead wrist is positive (cupped).",
        "Position an impact bag or soft foam target 2 inches ahead of normal ball position.",
        "Take a 3/4 backswing and drive lead knuckles down into the impact bag with hips open 40°.",
        "Verify HackMotion confirms -14° to -18° flexion at contact with zero wrist extension breakdown.",
        "Transfer immediately to 10 live balls on GSPro, taking a crisp dollar-bill divot pattern ahead of the ball."
      ],
      "checkpoints": {
        "dtl": "Trail elbow bent against right rib cage; lead shoulder clearing up and around without chest lifting.",
        "fo": "Shaft leaning forward toward target; hands ahead of lead thigh; lead wrist flat/bowed with zero scoop."
      },
      "hackmotion": {
        "targetMode": "Impact Deloft & Compression",
        "addressAngle": "+14° Extension",
        "topAngle": "-2° Flexion",
        "p6Angle": "-12° Flexion",
        "impactAngle": "-16° to -20° Flexion (Pure Tour Shaft Lean)",
        "biofeedbackTone": "Green tone confirms -14° or more flexion at the precise instant of ball strike.",
        "equipment": [
          "HackMotion",
          "Impact Bag",
          "8 Iron"
        ]
      },
      "modePlans": {
        "real": "Hit 10 balls on GSPro with 8-iron; aim for 21° launch angle and 7000+ rpm backspin.",
        "almost": "Strike almost golf balls off a strike mat with spray paint checking low point is 2 inches past ball.",
        "sore": "Static impact bag press: push club into bag holding -16° flexion for 5 seconds x 10 reps."
      }
    },
    {
      "id": "hackmotion-p4-flat-wrist",
      "title": "HackMotion P4 Top-of-Swing Face Alignment (Anti-Slice Cup Fix)",
      "section": "P1-P4 Backswing Structure",
      "focus": "Top-of-Swing Wrist Alignment & Face Control",
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
      "why": "Excessive wrist extension (cupping > 15°) at the top of the backswing fans the clubface wide open to the sky. From this open position, you must make a frantic compensating move on the downswing to square the clubface. Locking in 0° to -4° flexion at P4 synchronizes clubface angle with forearm plane and guarantees an effortless shallow downswing.",
      "instructions": [
        "Open HackMotion Top-of-Swing Mode. Set the green zone between 0° and -5° flexion (flat to slight bow).",
        "Set audio warning to sound if extension exceeds +6° at the top.",
        "Take your stance and hinge smoothly into P4. Pause for 2 seconds at the top.",
        "Check mirror or Kinovea DTL: lead wrist is flat like a board, clubface matches lead arm angle.",
        "Once you hear the solid confirmation tone, swing down smoothly into a balanced finish."
      ],
      "checkpoints": {
        "dtl": "Leading edge of clubface parallel to lead forearm plane at P4; zero cup or bow distortion.",
        "fo": "Lead arm straight without tension; full 90° shoulder turn with chest rotated over trail hip."
      },
      "hackmotion": {
        "targetMode": "P4 Top Alignment Window",
        "addressAngle": "+14° Extension",
        "topAngle": "0° to -4° Flexion (Flat wrist, 0° cup)",
        "p6Angle": "-10° Flexion",
        "impactAngle": "-14° Flexion",
        "biofeedbackTone": "Green chime validates flat wrist at P4 before downswing begins.",
        "equipment": [
          "HackMotion",
          "Kinovea DTL",
          "6 Iron"
        ]
      },
      "modePlans": {
        "real": "10 pause-and-hit swings at P4: pause 2 sec for green tone, then uncoil into GSPro.",
        "almost": "15 dry swings with almost balls focusing on smooth rhythmic transition.",
        "sore": "Slow-motion stretch reps: hold P4 for 4 deep breaths to stretch chest & lats without pain."
      }
    },
    {
      "id": "hackmotion-wedge-matrix",
      "title": "HackMotion Wedge Wrist Extension Clamp (Low Spinner vs Soft Pitch)",
      "section": "Scoring Wedges & Start Line",
      "focus": "Wedge Distance Consistency & Spin Control",
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
        "keyFrameCue": "Clamp wrist delta to ±2°—consistent dynamic loft equals laser distance control."
      },
      "why": "Wedge distance dispersion is rarely caused by swing speed; it is almost always caused by variable wrist action flipping or de-lofting randomly at impact. By measuring and clamping your HackMotion wrist angle delta, dynamic loft stays identical on every swing, landing your wedges within 6 feet of your target yardage every time.",
      "instructions": [
        "Select your 54° wedge and set HackMotion to Wedge Distance Control mode.",
        "For Low Check & Spinner: Preset -10° flexion at address; maintain -14° flexion through impact (low launch, 9000+ rpm).",
        "For Soft High Pitch: Maintain neutral +4° extension through impact, allowing bounce to glide through turf.",
        "Hit 10 consecutive 50-yard targets on GSPro range; track carry yardage variance (goal: < 3 yards spread).",
        "Move to 75-yard pin and repeat with 54° wedge."
      ],
      "checkpoints": {
        "dtl": "Shallow bounce engagement; clubhead does not dig or flip past hands through impact.",
        "fo": "Chest turns through with hands; sternum leads the clubhead into finish."
      },
      "hackmotion": {
        "targetMode": "Wedge Dynamic Loft Clamp",
        "addressAngle": "+10° Extension (Neutral)",
        "topAngle": "0° (Half swing clock)",
        "p6Angle": "-8° Flexion",
        "impactAngle": "-12° Flexion (Spinner) or +2° (High Soft)",
        "biofeedbackTone": "Tolerance chime sounds when wrist angle stays within ±3° window.",
        "equipment": [
          "HackMotion",
          "54° / 58° Wedges",
          "GSPro Range"
        ]
      },
      "modePlans": {
        "real": "Hit 10 balls to 50 yds, 10 to 75 yds on GSPro; log carry consistency in Bag Matrix.",
        "almost": "Start-line and launch window gates: hit almost balls through low and high foam gates in room.",
        "sore": "Short putting/chipping stroke calibration: 20 low-stress 10-yard chip-and-runs."
      }
    },
    {
      "id": "hackmotion-radial-ulnar-whip",
      "title": "HackMotion Radial Cock & Ulnar Unhinge Release Gate",
      "section": "P4-P6 Transition & Shallowing",
      "focus": "Lag Generation & Low-Point Strike Timing",
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
        "keyFrameCue": "Radial cock creates lag; ulnar unhinge releases the whip through low point."
      },
      "why": "Radial deviation cocks the lead thumb vertically creating effortless lag. Ulnar deviation unhinges the wrists down toward the turf through impact, guaranteeing the club reaches bottom of arc 2-3 inches past the golf ball. Monitoring this timing on HackMotion prevents early casting and maximizes clubhead speed transfer.",
      "instructions": [
        "Switch HackMotion graph to Radial / Ulnar Deviation.",
        "Hinge to P4: check for +22° to +26° radial deviation (lead thumb pointing straight up).",
        "Downswing: hold radial lag until hands reach trail thigh (P6).",
        "Through impact (P7): release into -15° to -22° ulnar deviation as arms extend down into turf.",
        "Take 10 step-through whip swings feeling the 'crack of the towel' at low point."
      ],
      "checkpoints": {
        "dtl": "Clubhead lags behind hands entering delivery zone; no early casting outside the line.",
        "fo": "Lead wrist fully unhinged down at strike; arms extend into triangle at P8."
      },
      "hackmotion": {
        "targetMode": "Radial / Ulnar Deviation Timing",
        "addressAngle": "Neutral (0° to +5° Radial)",
        "topAngle": "+24° Radial Cock (Maximum Lag)",
        "p6Angle": "+18° Radial Hold",
        "impactAngle": "-18° Ulnar Unhinge (Crisp Low Point Release)",
        "biofeedbackTone": "Speed peak chime validates ulnar release happens at ball, not before.",
        "equipment": [
          "HackMotion",
          "Driver",
          "Kinovea FO"
        ]
      },
      "modePlans": {
        "real": "Hit 10 drives on GSPro tracking clubhead speed and smash factor gains.",
        "almost": "Almost ball speed swings with alignment stick whip sound past impact.",
        "sore": "Wrist mobility rolls: gentle circular wrist rotations 10 reps each direction."
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
      "notes": "Split-Hand Pumps before live balls keep lower body starting first."
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
      "metric": "7+/10 inside 30-yard fairway window with zero opposite-side big misses",
      "target": "70%+ fairways in Challenge",
      "progress": 45,
      "notes": "Stick to one committed start-line window and balance-hold finishes."
    },
    {
      "id": "goal-hackmotion-impact-compression",
      "title": "HackMotion -14° Impact Flexion Compression",
      "category": "Mechanics P6-P8",
      "metric": "8/10 iron shots achieve -12° to -18° lead wrist flexion at strike",
      "target": "80% Tour compression rate on HackMotion",
      "progress": 70,
      "notes": "No scooping! Knuckles pointing to turf with forward shaft lean."
    },
    {
      "id": "goal-tempo-cadence-consistency",
      "title": "Tour Tempo Cadence 3:1 Lock (24/8 Ratio)",
      "category": "Rhythm & Timing",
      "metric": "Maintain 3.0:1 swing tempo ratio within ±1 frame on Kinovea",
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
        "address": "+12° to +18° Extension (Neutral setup)",
        "top": "-2° to -6° Flexion (Flat to bowed, square face)",
        "p6": "-10° to -14° Flexion (Motorcycle shallowing slot)",
        "impact": "-14° to -18° Flexion (Forward shaft lean & pure compression)"
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
      "desc": "Ultra-realistic ball flight physics, club path/face angle data, and 60+ world-class courses and practice ranges.",
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
  "cadencePresets": [
    {
      "id": "21-7",
      "name": "21 / 7 (Tour Fast)",
      "ratio": "3:1",
      "type": "full-swing",
      "backFrames": 21,
      "downFrames": 7,
      "backSec": 0.7,
      "downSec": 0.23,
      "totalSec": 0.93,
      "bpm": 193,
      "proExamples": "Brooks Koepka, Rory McIlroy, Tiger Woods, Jon Rahm",
      "desc": "Aggressive, athletic tempo for high swing speeds and fast hip rotation."
    },
    {
      "id": "24-8",
      "name": "24 / 8 (Tour Standard)",
      "ratio": "3:1",
      "type": "full-swing",
      "backFrames": 24,
      "downFrames": 8,
      "backSec": 0.8,
      "downSec": 0.27,
      "totalSec": 1.07,
      "bpm": 169,
      "proExamples": "Scottie Scheffler, Justin Thomas, Jordan Spieth, Viktor Hovland",
      "desc": "The universal PGA Tour benchmark. Balances full coil with calm transition."
    },
    {
      "id": "27-9",
      "name": "27 / 9 (Tour Smooth)",
      "ratio": "3:1",
      "type": "full-swing",
      "backFrames": 27,
      "downFrames": 9,
      "backSec": 0.9,
      "downSec": 0.3,
      "totalSec": 1.2,
      "bpm": 150,
      "proExamples": "Ernie Els, Fred Couples, Collin Morikawa, Hideki Matsuyama",
      "desc": "Silky, deliberate takeaway that lets gravity and momentum do the work."
    },
    {
      "id": "30-10",
      "name": "30 / 10 (Deliberate / Drill)",
      "ratio": "3:1",
      "type": "full-swing",
      "backFrames": 30,
      "downFrames": 10,
      "backSec": 1,
      "downSec": 0.33,
      "totalSec": 1.33,
      "bpm": 135,
      "proExamples": "Motor Learning & Slow-Mo Checkpoint Calibration",
      "desc": "Slow-motion rhythm ideal for HackMotion biofeedback and gym-sore days."
    },
    {
      "id": "18-9",
      "name": "18 / 9 (Short Game / Pitch)",
      "ratio": "2:1",
      "type": "short-game",
      "backFrames": 18,
      "downFrames": 9,
      "backSec": 0.6,
      "downSec": 0.3,
      "totalSec": 0.9,
      "bpm": 133,
      "proExamples": "Wedge Pitches, Flop Shots, Bunker Splash",
      "desc": "2:1 short-game rhythm for smooth acceleration through turf without decel."
    },
    {
      "id": "20-10",
      "name": "20 / 10 (Putting Standard)",
      "ratio": "2:1",
      "type": "putting",
      "backFrames": 20,
      "downFrames": 10,
      "backSec": 0.67,
      "downSec": 0.33,
      "totalSec": 1,
      "bpm": 120,
      "proExamples": "Brad Faxon, Tiger Woods Putting Stroke",
      "desc": "Pendulum putting tempo ensuring consistent roll distance on GSPro greens."
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
      "hmFlex": "-5°",
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
      "hmFlex": "-8°",
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
      "hmFlex": "-10°",
      "role": "High Soft Landings"
    },
    {
      "id": "4i",
      "club": "4 Iron",
      "loft": "21.0°",
      "carry": 190,
      "total": 200,
      "ballSpeed": 128,
      "launch": 14.5,
      "spin": 4400,
      "hmFlex": "-12°",
      "role": "Stinger & Long Approach"
    },
    {
      "id": "5i",
      "club": "5 Iron",
      "loft": "24.0°",
      "carry": 180,
      "total": 188,
      "ballSpeed": 122,
      "launch": 16,
      "spin": 5000,
      "hmFlex": "-13°",
      "role": "Standard Long Approach"
    },
    {
      "id": "6i",
      "club": "6 Iron",
      "loft": "27.5°",
      "carry": 170,
      "total": 176,
      "ballSpeed": 116,
      "launch": 17.5,
      "spin": 5600,
      "hmFlex": "-14°",
      "role": "Mid-Iron Workhorse"
    },
    {
      "id": "7i",
      "club": "7 Iron",
      "loft": "31.5°",
      "carry": 160,
      "total": 165,
      "ballSpeed": 110,
      "launch": 19,
      "spin": 6300,
      "hmFlex": "-15°",
      "role": "Calibration Baseline Club"
    },
    {
      "id": "8i",
      "club": "8 Iron",
      "loft": "35.5°",
      "carry": 150,
      "total": 154,
      "ballSpeed": 104,
      "launch": 21,
      "spin": 7100,
      "hmFlex": "-16°",
      "role": "Scoring Iron Target Pin"
    },
    {
      "id": "9i",
      "club": "9 Iron",
      "loft": "40.0°",
      "carry": 140,
      "total": 143,
      "ballSpeed": 97,
      "launch": 23.5,
      "spin": 8000,
      "hmFlex": "-17°",
      "role": "Aggressive Pin Attack"
    },
    {
      "id": "pw",
      "club": "PW (46°)",
      "loft": "46.0°",
      "carry": 125,
      "total": 127,
      "ballSpeed": 89,
      "launch": 26.5,
      "spin": 8900,
      "hmFlex": "-18°",
      "role": "100-125yd Scoring Weapon"
    },
    {
      "id": "gw",
      "club": "GW (50°)",
      "loft": "50.0°",
      "carry": 112,
      "total": 113,
      "ballSpeed": 82,
      "launch": 29,
      "spin": 9400,
      "hmFlex": "-18°",
      "role": "Full Wedge Control"
    },
    {
      "id": "sw",
      "club": "SW (54°)",
      "loft": "54.0°",
      "carry": 98,
      "total": 99,
      "ballSpeed": 74,
      "launch": 31.5,
      "spin": 9800,
      "hmFlex": "-18°",
      "role": "Mid Wedge & Greenside"
    },
    {
      "id": "lw",
      "club": "LW (58°)",
      "loft": "58.0°",
      "carry": 82,
      "total": 83,
      "ballSpeed": 66,
      "launch": 34,
      "spin": 9500,
      "hmFlex": "-15°",
      "role": "Pinpoint Stop & Flop"
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
      "hackmotionCue": "Draw: increase P5-P6 flexion (-14°). Fade: hold off release (-8° flexion).",
      "cadence": "24/8 (Tour Standard)",
      "steps": [
        "Hit 3 balls with a high push-draw (feel trail forearm supination and closed face relative to out-to-in path).",
        "Hit 3 balls with a low pull-fade (feel wrist flexion hold-off and steep delivery angle).",
        "Hit 3 balls with a high soft tower shot (toe-biased sweet spot, neutral path).",
        "Hit 3 balls with a low piercing punch (forward ball position or hands pressed, -18° impact flexion).",
        "Sim challenge: Play 3 virtual holes alternating high draw and low fade off every tee box."
      ]
    },
    "iron-ladder": {
      "id": "iron-ladder",
      "title": "Pin Hunter & Trajectory Control Ladder",
      "tagline": "Dial in distance gapping and ball compression using your stock yardages.",
      "focusArea": "Distance Control & Gapping",
      "recommendedClub": "7 Iron & 8 Iron",
      "hackmotionCue": "Consistent -15° impact flexion produces identical dynamic loft every swing.",
      "cadence": "24/8 (Tour Standard)",
      "steps": [
        "Target lock: Hit 10 balls to a virtual 150-yard green; track dispersion circle diameter on GSPro.",
        "Distance ladder: Hit 140, 150, and 160 yards with the exact same 7-iron by adjusting backswing clock length.",
        "Window ladder: Hit low punch (<50ft apex), stock (70-80ft apex), and high tower (95ft+ apex) with an 8-iron."
      ]
    },
    "driving-combine": {
      "id": "driving-combine",
      "title": "Fairway Finder & Upward AoA Driver Combine",
      "tagline": "Establish a reliable tournament driver delivery with +2° to +4° upward AoA.",
      "focusArea": "Driver Dispersion & Launch",
      "recommendedClub": "Driver",
      "hackmotionCue": "Maintain flat wrist (-5° flexion) at impact while sweeping up +3°.",
      "cadence": "24/8 or 21/7",
      "steps": [
        "Spray clubface with strike spray or dry shampoo; hit 5 drives focusing on high-toe sweet spot strike.",
        "Fairway corridor test: 10 consecutive drives; score 1 point for every ball landing in a 30-yard fairway.",
        "Pressure drive: Imagine 18th hole at Cabot Cliffs with ocean right; execute committed stock shape."
      ]
    }
  }
};
