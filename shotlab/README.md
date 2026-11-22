# ShotLab v2 — Desktop Golf Launch Monitor Intelligence & OBS Studio Suite

ShotLab is a standalone **Electron desktop application** + **local OBS Studio Browser Source server** built for **Bushnell Launch Pro → GameChanger → GSPconnect (`:921`) → GSPro** via SimWatch's local shot-data bridge (`http://127.0.0.1:8765`).

It transforms raw 1-dot launch monitor data into instant, plain-English **Red / Yellow / Green** coaching visuals, **named shot shapes** with dynamic flight curves, **Flipping / Casting / Over-Hold** delivery diagnostics, **inferred face strike (Toe / Heel / Thin / Fat / Flush)** maps, **Distance Left on the Table** physics counterfactuals, **Strokes Gained & 2D DECADE Dispersion**, **A/B Active Feel Lab** analytics, **Audio Caddie + Tour Tempo**, **Synced Kinovea Video Compare**, and a **Context-Aware Club Auto-Detector** that calibrates to your bag toward **90%+ accuracy** and can optionally auto-switch GSPro's club via `I` / `K` keystrokes.

---

## Quick Start (Windows Sim Rig)

1. Install **Node.js 20+ LTS** once on your sim PC if not already installed (`https://nodejs.org/`).
2. Start SimWatch as usual (`run_simwatch.bat` or `python simwatch.py bridge` in an Admin terminal so the passive `:921` sniffer is live).
3. Double-click **`run_shotlab.bat`** in the repo root.
   - First run automatically runs `npm install` inside `shotlab/` to install Electron.
   - Subsequent runs open the ShotLab desktop cockpit immediately.

> **No sim rig handy?** ShotLab works completely offline too — pick any of the **16 built-in Bushnell Launch Pro shot archetypes** in the top bar (Snap Hook, Pull Hook, Push Slice, Flipping Floater, Early Cast, Over-Hold Block, Toe/Heel/Thin/Fat strikes, Tour Push Draw, Pure Compression) and click **▶ Test Shot**.

---

## What's New in ShotLab v2

### 1. Local SQLite Swing Pattern Database (`shotlab/data/swings.sqlite`)
- Every real and quiet-mode swing is persisted locally in `shotlab/data/swings.sqlite` (using Node's built-in `node:sqlite`, with automatic JSON fallback if unavailable).
- Powers **multi-session trend sparklines** (Score, Smash, Carry, Strokes Gained, Fault %), **Warmup & Fatigue Curves** (shots 1–10 vs 11–25 vs 26–45 vs 46–70 vs 71+), and a **14-Club Bag Gapping & Stopping-Power** audit (with overlap and dead-zone gap alerts).

### 2. Context-Aware Club Brain (Markov Stickiness + Partial-Swing Guard)
- Combines your personal **Empirical Bayes Gaussian bag profile** (`shotlab/data/state.json`) with **Markov session stickiness** (recognizing block practice on one club) and a **Partial-Swing / Knockdown Guard** so intentional 75% wedge shots or punch outs don't falsely misclassify as a different club or trigger erroneous GSPro club switches.

### 3. Kids-Asleep / Quiet Mode (Almost Golf Balls)
- Switch Practice Mode to **Quiet / Foam Ball (`almost`)** for late-night practice without waking the house.
- Automatically excludes invalid foam-ball carry, ball speed, spin, and smash from grading and Strokes Gained — coaching strictly on the **BLP 1-dot metrics that stay accurate**: **Start Line (HLA ±1.5° gate)**, **Club Path**, **Angle of Attack**, and **Estimated Face-to-Path**.

### 4. Active Feel Lab & Drills Hub Bridge
- Tag shots with your **Active Swing Feel** (synced with SimWatch's Drills Hub) and let ShotLab run an **A/B Feel Verdict** proving with real BLP data which feel produces the highest Score, Smash, Strokes Gained, and tightest 80% dispersion width.
- Automatically detects **fault streaks** (e.g., repeated Flipping Floaters or Over-Hold blocks) and surfaces targeted **Drills Hub** fixes inline.

### 5. Strokes Gained (Broadie) & 2D DECADE Dispersion
- Computes per-shot **Strokes Gained: Off-the-Tee (OTT)** for woods and **Strokes Gained: Approach (APP)** for hybrids/irons/wedges against your selected tier (`Scratch`, `Low HCP`, `Mid HCP`) and PGA Tour baselines.
- Renders a **2D Bird's-Eye Dispersion Plot** with rotated **80% confidence ellipse**, score-coded shot dots, mean landing crosshair, **DECADE recommended aim offset** (when lateral bias ≥ 3 yds), and **root-cause stroke-leak rankings** by delivery fault.

### 6. Synced Kinovea Video Compare & My-Go-To Promotion
- Automatically links incoming DTL & Face-On Kinovea clips to each shot record in SQLite.
- Side-by-side **Compare vs. Best** playback pairs your current swing against your highest-scoring club benchmark, and lets you promote any pure swing to **My Go-To** for permanent reference.

### 7. Audio Caddie, Tour Tempo Metronome & Mat Glance
- **Audio Caddie** (`renderer/audio.js`): Zero-dependency **Web Audio R/Y/G grade chimes** plus concise **Web Speech eyes-free callouts** (cancels stale utterances so callouts never back up; adapts automatically to Quiet Mode start-line/path readouts vs. full-flight carry/smash/cue readouts).
- **Tour Tempo 3-Tone Cadence Metronome**: Built-in Web Audio 3-beat trainer (Takeaway `440 Hz` → Top `660 Hz` → Impact `988 Hz`) with **`24/8` Tour (3:1)**, **`27/9` Smooth (3:1)**, **`21/7` Brisk (3:1)**, and **`18/9` Short Game (2:1)** presets.
- **Mat Glance**: High-contrast, large-type full-screen view designed to be read from the hitting mat without stepping back to the desk.

---

## OBS Studio Transparent Overlays (9 Broadcast Widgets)

While ShotLab is open, it serves **100% transparent, real-time OBS Studio Browser Source widgets** at `http://127.0.0.1:8766` (no chroma-keying needed; no `backdrop-filter` artifacts in OBS CEF).

In OBS Studio: **Sources → + → Browser**, paste a URL below, and set the recommended dimensions:

| Widget | URL | Recommended Size | Best For |
|---|---|---|---|
| **Full Broadcast Lower-Third HUD** | `http://127.0.0.1:8766/obs/overlay.html?widget=hud` | `1280 × 156` | Full-width bottom broadcast HUD on stream |
| **Shot Shape & Flight Badge** | `http://127.0.0.1:8766/obs/overlay.html?widget=shape` | `320 × 170` | Corner curved-flight graphic + shot shape name |
| **R / Y / G Key Metrics Strip** | `http://127.0.0.1:8766/obs/overlay.html?widget=metrics` | `960 × 105` | Clean 8-tile color-coded metrics bar |
| **Coach Diagnosis & Miss-Hit Card** | `http://127.0.0.1:8766/obs/overlay.html?widget=diagnosis` | `440 × 190` | Release fault + clubface strike + max carry |
| **Compact Corner PiP Stack** | `http://127.0.0.1:8766/obs/overlay.html?widget=compact` | `330 × 420` | Stacking beside your Kinovea DTL+FO PiP |
| **Club Auto-Detector Pill** | `http://127.0.0.1:8766/obs/overlay.html?widget=club` | `280 × 92` | Minimal club + confidence badge |
| **3D-Perspective Broadcast Shot Tracer** | `http://127.0.0.1:8766/obs/overlay.html?widget=tracer` | `640 × 360` | Animated 3D shot tracer arc + floating Carry/Apex/Curve/Speed pill |
| **Live Dispersion Radar** | `http://127.0.0.1:8766/obs/overlay.html?widget=dispersion` | `360 × 310` | Live 2D dispersion scatter, 80% ellipse, width & Avg SG |
| **Session & Active Feel Broadcast Ticker** | `http://127.0.0.1:8766/obs/overlay.html?widget=ticker` | `1280 × 48` | Ultra-clean single-line session stats, active feel/mode & DB total |

Add `&autohide=12` to any URL if you want the widget to fade out automatically 12 seconds after each shot.

---

## Reaching 90%+ Club Auto-Detection & GSPro Auto-Switching

1. Open **⚙ Settings** and enter your approximate **Baseline Driver Club Speed** (e.g., `98` mph).
2. Hit 3–5 shots per club in your bag. After each shot, click **✓ Confirm [Club]** if ShotLab guessed right, or click the actual club button in the **Actually hit:** strip.
3. ShotLab updates your personal **Empirical Bayes Gaussian profile** (`shotlab/data/state.json`), combines it with **Markov Stickiness** and the **Partial-Swing Guard**, and tracks your rolling **Exact Accuracy**, **±1 Club Accuracy**, and **≥85% Confidence Accuracy**.
4. Once calibrated (3+ shots per club), click **⇄ Sync GSPro** to test club switching, or check **Auto-Switch** to automatically send GSPro's `I` (club up) / `K` (club down) keys via SimWatch (`POST /api/gspro/club`) whenever confidence crosses your threshold (default **90%**). Auto-switch automatically pauses during Quiet Mode and partial/short-game swings.

---

## Measured vs. Inferred Metrics (Bushnell Launch Pro 1-Dot)

Every metric tile is explicitly badged so you always know what came directly off the Launch Pro cameras vs. what ShotLab calculated:

- **`BLP` (Measured):** Ball Speed, VLA, HLA, Backspin, Spin Axis, Club Speed, Smash Factor, Club Path, Angle of Attack.
- **`PHYS` (3D Aerodynamic Physics):** Carry (when LM omits it), Total Distance, Rollout, Apex, Descent Angle, Curve, Offline, 3D Tracer points, and Center-Strike / Speed-Ceiling counterfactuals.
- **`EST` (Inferred with Hover Rationale):** Face-to-Target & Face-to-Path (D-Plane ball flight laws), Dynamic Loft & Shaft Lean (vertical D-Plane), Flipping/Casting/Over-Hold diagnosis, and Toe/Heel/Thin/Fat strike map (Smash drop + D-Plane Gear Effect residual).

---

## When the Club Isn't Read (Sticker Missed)

The Launch Pro reads club speed, smash, path and attack angle from the club sticker. When it misses, ShotLab never invents those numbers:

- **Shown as missing:** club speed, smash, path, AoA and face-to-path tiles show `—` (tagged `NO READ`), and a yellow **No club read** notice explains what's estimated. Zero placeholders some connectors send instead are treated as missing, so a fake `0.0°` path never grades green.
- **Still estimated from ball flight:** carry, apex, curve and shot shape (pure ball physics), face-to-target from start line (`EST`), and delivery faults from launch & spin with the club's typical attack angle assumed. These are labelled **"(ball-flight estimate)"** at reduced confidence.
- **Not claimed:** "Pure Compression"-style verdicts (shown instead as "Launch & Spin On Window") and a clean strike (shown as **Strike not measured**, with `?` on the clubface map).
- **Club:** graded against the club selected in GSPro, because guessing the club from ball flight alone can't tell a different club apart from a mishit with this one. GSPro Auto-Switch never fires on these shots.
- **Session:** the average score uses full reads only, and the session chip shows `Club read N/M`, a quick sign the sticker needs replacing.

## FSX Pro / FSX 2020 CSV Support

Click **FSX CSV** in the top bar to:
- **Import** a saved FSX Pro / FSX 2020 CSV session, or
- **Watch** FSX 2020's `LastShot.csv` / `shots.csv` live for real-time analysis without GSPro running.
