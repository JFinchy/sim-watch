/**
 * ShotLab — Unified Shot Analysis Pipeline & FSX CSV Parser.
 *
 * Accepts raw shot records from SimWatch Bridge (/api/events or shots.jsonl),
 * OpenConnect v1 payloads, FSX Pro / FSX 2020 CSV rows, or Demo Shots,
 * and returns a complete, self-contained ShotAnalysis object for both the
 * Electron Desktop Dashboard and the OBS Studio Browser Source overlays.
 */
'use strict';

const {
  CLUB_ORDER,
  GSPRO_CLUB_ORDER,
  CLUB_SPECS,
  BENCHMARK_TIERS,
  normalizeClubCode,
  normalizeGsproClubCode,
  getClubSpec,
} = require('./constants');
const { simulateBallFlight, computeDistancePotential } = require('./physics');
const {
  createEmptyCalibration,
  classifyClub,
  recordConfirmation,
  getCalibrationStats,
  posteriorForClub,
} = require('./classifier');
const {
  analyzeDPlane,
  classifyShotShape,
  diagnoseDelivery,
  inferFaceStrike,
  gradeMetrics,
} = require('./diagnostics');
const { computeShotStrokesGained, computeDispersionStats } = require('./strokesGained');
const { SwingDatabase, deriveSiblingClips } = require('./swingDb');
const { loadDrillsHubData, recommendDrillsForFault, detectFaultStreak } = require('./drillsBridge');

function toNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize either a SimWatch bridge v2 shot record or raw OpenConnect v1 JSON
 * into a standard flat metric bundle.
 */
function normalizeRawShot(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Reject OpenConnect heartbeats or non-ball packets
  const ocOpts = raw.ShotDataOptions || {};
  if (ocOpts.IsHeartBeat === true || ocOpts.ContainsBallData === false) {
    return null;
  }

  // Support both SimWatch bridge format ({ ball: {...}, club_data: {...} })
  // and raw GSPro OpenConnect v1 ({ BallData: {...}, ClubData: {...} })
  let ball = raw.ball;
  let cd = raw.club_data;
  if (!ball && raw.BallData) {
    const b = raw.BallData;
    const bs = toNum(b.BackSpin);
    const ss = toNum(b.SideSpin);
    let spin = toNum(b.TotalSpin);
    let axis = toNum(b.SpinAxis);
    if ((spin === null || spin <= 0) && (bs !== null || ss !== null)) {
      const mag = Math.round(Math.hypot(bs || 0, ss || 0));
      spin = mag > 0 ? mag : spin;
    }
    if (axis === null && bs !== null && ss !== null && (bs || ss)) {
      axis = Math.round((Math.atan2(ss, bs) * 180) / Math.PI * 10) / 10;
    }
    ball = {
      speed: toNum(b.Speed),
      carry: toNum(b.CarryDistance),
      total: toNum(b.TotalDistance),
      hla: toNum(b.HLA),
      vla: toNum(b.VLA),
      spin,
      spin_axis: axis,
      back_spin: bs,
      side_spin: ss,
    };
  }
  if (!cd && raw.ClubData) {
    const c = raw.ClubData;
    if (ocOpts.ContainsClubData !== false) {
      const spd = toNum(c.Speed);
      const pathVal = toNum(c.Path);
      const aoaVal = toNum(c.AngleOfAttack);
      const faceVal = toNum(c.FaceToTarget);
      if ((spd !== null && spd > 0) || pathVal !== null || aoaVal !== null) {
        cd = {
          speed: spd && spd > 0 ? spd : null,
          path: pathVal,
          face: faceVal,
          aoa: aoaVal,
        };
      }
    }
  }

  ball = ball || {};
  cd = cd || null;

  const ballSpeed = toNum(ball.speed);
  if (ballSpeed === null || ballSpeed <= 0) return null;

  const vla = toNum(ball.vla);
  const hla = toNum(ball.hla);
  let totalSpin = toNum(ball.spin);
  let spinAxis = toNum(ball.spin_axis);
  let backSpin = toNum(ball.back_spin);
  let sideSpin = toNum(ball.side_spin);

  // Fall back to BackSpin/SideSpin if TotalSpin is missing or 0
  if ((totalSpin === null || totalSpin <= 0) && (backSpin !== null || sideSpin !== null)) {
    const mag = Math.round(Math.hypot(backSpin || 0, sideSpin || 0));
    if (mag > 0) totalSpin = mag;
  }
  if (spinAxis === null && backSpin !== null && sideSpin !== null && (backSpin || sideSpin)) {
    spinAxis = Math.round((Math.atan2(sideSpin, backSpin) * 180) / Math.PI * 10) / 10;
  }
  if (backSpin === null && totalSpin !== null && totalSpin > 0) {
    const axRad = ((spinAxis || 0) * Math.PI) / 180;
    backSpin = Math.round(totalSpin * Math.cos(axRad));
    sideSpin = Math.round(totalSpin * Math.sin(axRad));
  }

  // Treat 0 placeholder Carry/Total from OpenConnect v1 as null when ball speed is meaningful
  const rawCarry = toNum(ball.carry);
  const rawTotal = toNum(ball.total);
  const carry = rawCarry !== null && (rawCarry > 0 || ballSpeed <= 5) ? rawCarry : null;
  const total = rawTotal !== null && (rawTotal > 0 || ballSpeed <= 5) ? rawTotal : null;

  const clubSpeed = cd ? toNum(cd.speed) : null;
  const validClubSpeed = clubSpeed !== null && clubSpeed > 20 ? clubSpeed : null;
  const smash = (validClubSpeed !== null)
    ? Math.round((ballSpeed / validClubSpeed) * 100) / 100
    : null;

  // The 1-dot BLP reads club speed, path and AoA from the same club marker, so they arrive together or not
  // at all. With no valid club speed the marker wasn't read: drop the rest too, so 0/placeholder path & AoA
  // (some connectors send zeros instead of omitting ClubData) are never graded as a perfect 0.0°.
  // Any positive club speed means the marker was read (a slow chip can be < 20 mph); the 20 mph floor above
  // only guards smash / club-speed grading against junk values.
  const clubRead = clubSpeed !== null && clubSpeed > 0;
  const reportedRaw = raw.club || raw.gspro_club || (raw.Player && raw.Player.Club);

  return {
    ts: raw.ts || new Date().toISOString(),
    shotNum: toNum(raw.shot_num ?? raw.ShotNumber),
    reportedClub: normalizeGsproClubCode(reportedRaw),
    confirmedClub: normalizeClubCode(raw.confirmed_club),
    demoLabel: raw.demo_label || null,
    demoActualClub: normalizeClubCode(raw.demo_actual_club),
    metrics: {
      ballSpeed,
      carry,
      total,
      hla,
      vla,
      totalSpin: totalSpin !== null && totalSpin > 0 ? totalSpin : null,
      spinAxis,
      backSpin,
      sideSpin,
      clubSpeed: validClubSpeed,
      smash,
      path: clubRead ? toNum(cd.path) : null,
      rawFace: clubRead ? toNum(cd.face) : null,
      aoa: clubRead ? toNum(cd.aoa) : null,
      clubRead,
    },
    raw,
  };
}

// Grade cards that need the club marker (BLP 1-dot sticker) read.
const CLUB_METRIC_KEYS = new Set(['clubSpeed', 'smash', 'aoa', 'path', 'faceToPath']);
// "Nothing wrong" delivery verdicts; without club data they can't actually be confirmed.
const HEALTHY_DELIVERY_IDS = new Set(['pure_compression', 'neutral_delivery', 'tour_sweep', 'solid_driver']);

/**
 * Missing-data policy (mutates delivery / strike / scorecard in place, returns the dataQuality summary).
 *
 * Measured values are never invented: anything the launch monitor didn't send stays null and shows "—".
 * When the club marker wasn't read we keep what ball flight genuinely supports and say so:
 *  - Face-to-target still estimates from start line (already labelled EST by analyzeDPlane).
 *  - Delivery FAULTS still fire from launch/spin (AoA assumed for the club) but at reduced confidence,
 *    labelled "(ball-flight estimate)". "All good" verdicts become "Launch & Spin On Window" because
 *    compression, AoA and shaft lean can't be confirmed without club data.
 *  - Strike: a clean result can't be claimed without smash, so it becomes "Strike not measured";
 *    a thin/fat/toe/heel signal from launch & spin is kept at low confidence, labelled "(estimate)".
 *  - Quiet Mode grades club-only metrics, so with no club read there is nothing to grade: "No club read".
 */
function applyDataQuality({ metrics, clubSpec, delivery, strike, scorecard, practiceMode }) {
  const clubRead = metrics.clubRead !== false;
  const missing = [];
  if (!clubRead) missing.push('Club Speed', 'Smash', 'Club Path', 'Angle of Attack');
  if (metrics.vla === null) missing.push('Launch Angle');
  if (metrics.hla === null) missing.push('Start Direction');
  if (metrics.totalSpin === null) missing.push('Spin');
  if (metrics.spinAxis === null) missing.push('Spin Axis');
  const dq = { clubRead, basis: clubRead ? 'full' : 'ball_only', missing, note: null };

  if (scorecard && Array.isArray(scorecard.cards)) {
    const graded = scorecard.cards.filter((c) => c.grade && c.grade !== 'neutral').length;
    scorecard.coverage = { graded, total: scorecard.cards.length };
    scorecard.basis = dq.basis;
  }
  if (clubRead) return dq;

  const club = clubSpec.label;
  dq.note = 'No club read (sticker missed): club speed, smash, path and AoA unavailable. '
    + 'Delivery and strike are estimates from ball flight only.';

  if (scorecard && Array.isArray(scorecard.cards)) {
    for (const c of scorecard.cards) {
      if (CLUB_METRIC_KEYS.has(c.key) && (c.raw === null || c.raw === undefined)) {
        c.source = 'missing';
        c.target = 'no club read';
      }
    }
  }

  if (delivery) {
    delivery.basis = 'ball_only';
    if (practiceMode === 'almost') {
      Object.assign(delivery, {
        id: 'no_data',
        name: 'No club read',
        severity: 'neutral',
        confidence: 0,
        tagline: 'Quiet Mode grades club path and attack angle, but the club sticker wasn\'t read on this swing.',
        cues: ['Check the club sticker is clean, flat and square to the face'],
        evidence: [],
        alternates: [],
        estDynamicLoft: null,
        estShaftLean: null,
        spinLoft: null,
      });
    } else if (HEALTHY_DELIVERY_IDS.has(delivery.id)) {
      // No club-based fault fired. Read what launch & spin alone say, graded against this club's window.
      const card = (key) => (scorecard && scorecard.cards || []).find((c) => c.key === key) || null;
      const vlaCard = card('vla');
      const spinCard = card('backSpin');
      const vlaDelta = metrics.vla !== null ? metrics.vla - clubSpec.vla.ideal : 0;
      const spinDelta = metrics.backSpin !== null ? metrics.backSpin - clubSpec.spin.ideal : 0;
      const offWindow = [vlaCard, spinCard].some((c) => c && (c.grade === 'yellow' || c.grade === 'red'));
      const anyRed = [vlaCard, spinCard].some((c) => c && c.grade === 'red');
      if (offWindow && vlaDelta > 0 && spinDelta >= 0) {
        Object.assign(delivery, {
          id: 'flipping_floater',
          name: 'High Launch & Spin (ball-flight estimate)',
          severity: anyRed ? 'red' : 'yellow',
          confidence: 0.45,
          tagline: `No club read: launch and spin are high for a ${club}, the usual sign of added loft at impact (flip / scoop). Can't confirm without club data.`,
          cues: ['Hands ahead of the ball at impact', 'Check the club sticker is clean, flat and square to the face'],
          evidence: [
            `Launch ${metrics.vla}° vs ${clubSpec.vla.ideal}° typical ${club}`,
            metrics.backSpin !== null ? `Backspin ${Math.round(metrics.backSpin)} rpm vs ${clubSpec.spin.ideal} typical` : '',
          ].filter(Boolean),
          estShaftLean: null,
          spinLoft: null,
          alternates: [],
        });
      } else if (offWindow && vlaDelta < 0 && spinDelta <= 0) {
        Object.assign(delivery, {
          id: 'over_hold',
          name: 'Low Launch & Spin (ball-flight estimate)',
          severity: anyRed ? 'red' : 'yellow',
          confidence: 0.45,
          tagline: `No club read: launch and spin are low for a ${club}: delofted or held-off delivery, or a thin strike. Can't confirm without club data.`,
          cues: ['Let the club release through impact', 'Check the club sticker is clean, flat and square to the face'],
          evidence: [
            `Launch ${metrics.vla}° vs ${clubSpec.vla.ideal}° typical ${club}`,
            metrics.backSpin !== null ? `Backspin ${Math.round(metrics.backSpin)} rpm vs ${clubSpec.spin.ideal} typical` : '',
          ].filter(Boolean),
          estShaftLean: null,
          spinLoft: null,
          alternates: [],
        });
      } else {
        Object.assign(delivery, {
          id: 'ball_flight_ok',
          name: 'Launch & Spin On Window',
          severity: 'green',
          confidence: Math.min(delivery.confidence || 0, 0.5),
          tagline: `No club read: launch and spin look right for a ${club}, but compression, attack angle and shaft lean can't be confirmed.`,
          cues: ['Check the club sticker is clean, flat and square to the face'],
          estShaftLean: null,
          spinLoft: null,
        });
        delivery.evidence = [
          `Ball-flight only: attack angle assumed ${clubSpec.aoa.ideal}° (typical ${club})`,
          ...(delivery.evidence || []).filter((e) => !/Smash|Angle of Attack|Shaft Lean|Spin Loft/i.test(e)),
        ];
      }
    } else {
      delivery.confidence = Math.round(Math.min((delivery.confidence || 0) * 0.7, 0.6) * 100) / 100;
      delivery.name = `${delivery.name} (ball-flight estimate)`;
      delivery.evidence = [
        `No club read: attack angle assumed ${clubSpec.aoa.ideal}° for ${club}; verdict from launch & spin only`,
        ...(delivery.evidence || []),
      ];
    }
  }

  if (strike && practiceMode !== 'almost') {
    strike.basis = 'ball_only';
    if (strike.location === 'center') {
      Object.assign(strike, {
        location: 'unknown',
        label: 'Strike not measured',
        severity: 'neutral',
        confidence: 0,
        coords: null,
        rationale: ['No club read, so smash factor (the main strike signal) is unavailable. Launch and spin show no clear thin/fat pattern.'],
      });
    } else if (strike.location !== 'unknown') {
      strike.confidence = Math.min(strike.confidence || 0, 0.5);
      strike.label = `${strike.label} (estimate)`;
      strike.rationale = ['No club read: inferred from launch & spin only', ...(strike.rationale || [])];
    }
  }
  return dq;
}

/**
 * Full end-to-end shot analysis.
 *
 * @param {object} rawShot
 * @param {object} [options]
 * @param {object} [options.calibration]  Player's calibration profile
 * @param {string} [options.tierId='low_hcp']  'scratch' | 'low_hcp' | 'mid_hcp' | 'personal'
 * @param {string} [options.handedness='RH']   'RH' | 'LH'
 * @param {string} [options.clubOverride]      Explicit club code (e.g. after user confirms club)
 * @param {number} [options.altitudeFt=0]
 */
function analyzeShot(rawShot, options = {}) {
  const norm = normalizeRawShot(rawShot);
  if (!norm || norm.metrics.ballSpeed === null) {
    return null;
  }

  const cal = options.calibration || createEmptyCalibration();
  const tierId = options.tierId || 'low_hcp';
  const handedness = options.handedness || 'RH';
  const altitudeFt = toNum(options.altitudeFt) ?? 0;
  const practiceMode = options.practiceMode || 'real';
  const recentClubs = Array.isArray(options.recentClubs) ? options.recentClubs : [];

  // 1. Run Context-Aware Club Auto-Detector (with Markov stickiness & partial-swing guard)
  const clubDetection = classifyClub(
    {
      ball: {
        speed: norm.metrics.ballSpeed,
        vla: norm.metrics.vla,
        spin: norm.metrics.totalSpin,
        spin_axis: norm.metrics.spinAxis,
        back_spin: norm.metrics.backSpin,
      },
      club_data: (norm.metrics.clubSpeed || norm.metrics.aoa !== null || norm.metrics.path !== null)
        ? { speed: norm.metrics.clubSpeed, aoa: norm.metrics.aoa, path: norm.metrics.path }
        : null,
    },
    cal,
    { recentClubs, practiceMode }
  );

  // Active club priority: explicit override > confirmed club > detected club (when confident) > GSPro reported full-swing club > 7I
  const overrideClub = normalizeClubCode(options.clubOverride) || norm.confirmedClub;
  const reportedFullClub = normalizeClubCode(norm.reportedClub);
  // Without club data (Quiet Mode foam balls, or the club sticker wasn't read) ball-only detection is circular:
  // a floaty 7-iron simply "looks like" a normal PW. Trust the club selected in GSPro in that case.
  const trustReportedClub = practiceMode === 'almost' || !norm.metrics.clubRead;
  const activeClub = overrideClub
    || (trustReportedClub && reportedFullClub ? reportedFullClub : null)
    || (clubDetection.predictedClub && clubDetection.confidence >= 0.45 ? clubDetection.predictedClub : null)
    || reportedFullClub
    || clubDetection.predictedClub
    || '7I';

  const activeClubSource = overrideClub
    ? 'confirmed'
    : (activeClub === clubDetection.predictedClub ? 'detected' : 'gspro');

  const clubSpec = getClubSpec(activeClub, cal.customLofts);

  // 2. Run 3D aerodynamic ball-flight physics simulation
  const flight = simulateBallFlight({
    ballSpeedMph: norm.metrics.ballSpeed,
    vlaDeg: norm.metrics.vla ?? clubSpec.vla.ideal,
    hlaDeg: norm.metrics.hla ?? 0,
    totalSpinRpm: norm.metrics.totalSpin ?? clubSpec.spin.ideal,
    spinAxisDeg: norm.metrics.spinAxis ?? 0,
    altitudeFt,
    includePoints: true,
  });

  // If launch monitor reported carry, preserve it alongside physics carry
  const effectiveCarry = norm.metrics.carry !== null && norm.metrics.carry > 5
    ? norm.metrics.carry
    : flight.carryYds;

  // 3. Distance Left on the Table / Counterfactual Potential (apples-to-apples physicsCarryYds + altitudeFt)
  const potential = computeDistancePotential(
    {
      ballSpeed: norm.metrics.ballSpeed,
      clubSpeed: norm.metrics.clubSpeed,
      vla: norm.metrics.vla ?? clubSpec.vla.ideal,
      totalSpin: norm.metrics.totalSpin ?? clubSpec.spin.ideal,
      spinAxis: norm.metrics.spinAxis ?? 0,
      smash: norm.metrics.smash,
      altitudeFt,
    },
    clubSpec,
    { ...flight, carryYds: effectiveCarry, physicsCarryYds: flight.carryYds }
  );

  flight.efficiencyPct = potential.efficiencyPct;

  // 4. D-Plane Face Estimation
  const dplane = analyzeDPlane(norm.metrics, clubSpec, handedness);

  // 5. Shot Shape Classification
  const shotShape = classifyShotShape(norm.metrics, flight, dplane, clubSpec, handedness);

  // 6. Delivery / Release Fault Detection (Flipping / Casting / Over-Hold / Compression / Quiet Mode / Partial)
  const delivery = diagnoseDelivery(norm.metrics, flight, dplane, clubSpec, cal, handedness, {
    practiceMode,
    isPartialSwing: clubDetection.isPartialSwing,
    partialSpeedPct: clubDetection.partialSpeedPct,
  });

  // 7. Face Strike / Miss-Hit Inference (Toe / Heel / Thin / Fat / High / Center)
  const strike = inferFaceStrike(norm.metrics, dplane, clubSpec, cal, practiceMode);

  // 8. Low-Handicap Red / Yellow / Green Metric Grades (adapts automatically for Kids-Asleep & partial swings)
  const scorecard = gradeMetrics(
    norm.metrics, flight, dplane, delivery, clubSpec, tierId, cal, handedness, potential, practiceMode, clubDetection.isPartialSwing
  );

  // 9. Per-Shot Strokes Gained (Off-the-Tee / Approach vs Tier & PGA baselines)
  const clubPost = posteriorForClub(activeClub, cal);
  const expSpeed = clubPost && clubPost.dist && clubPost.dist.ballSpeed ? clubPost.dist.ballSpeed.mean : null;
  const targetCarry = expSpeed
    ? simulateBallFlight({
        ballSpeedMph: expSpeed,
        vlaDeg: clubSpec.vla.ideal,
        hlaDeg: 0,
        totalSpinRpm: clubSpec.spin.ideal,
        spinAxisDeg: 0,
        altitudeFt,
        includePoints: false,
      }).carryYds
    : null;

  const strokesGained = computeShotStrokesGained({
    clubSpec,
    carryYds: effectiveCarry,
    totalYds: norm.metrics.total ?? flight.totalYds,
    offlineYds: flight.offlineYds,
    targetCarryYds: targetCarry,
    tierId,
    practiceMode,
  });

  // Check if auto-switch should recommend changing GSPro's club (never auto-switch on putts/partials/foam balls!)
  const shouldAutoSwitch = Boolean(
    practiceMode === 'real' &&
    cal.autoSwitch &&
    cal.autoSwitch.enabled &&
    !clubDetection.isPartialOrShortGame &&
    !clubDetection.isPartialSwing &&
    clubDetection.predictedClub &&
    clubDetection.confidence >= (cal.autoSwitch.minConfidence || 0.90) &&
    norm.reportedClub &&
    clubDetection.predictedClub !== norm.reportedClub &&
    norm.metrics.clubRead // no club read: ball-only detection isn't trusted to change GSPro's club
  );

  const dataQuality = applyDataQuality({ metrics: norm.metrics, clubSpec, delivery, strike, scorecard, practiceMode });

  const clipInfo = deriveSiblingClips(norm.raw.clip || null);

  return {
    id: `${norm.ts}_${norm.shotNum || 0}`,
    ts: norm.ts,
    shotNum: norm.shotNum,
    practiceMode,
    feelId: options.feelId ?? norm.raw.feel_id ?? null,
    drillId: options.drillId ?? norm.raw.drill_id ?? null,
    clipDtl: clipInfo.dtl,
    clipFo: clipInfo.fo,
    activeClub,
    activeClubLabel: clubSpec.label,
    activeClubSource,
    reportedClub: norm.reportedClub,
    confirmedClub: overrideClub || null,
    demoLabel: norm.demoLabel,
    demoActualClub: norm.demoActualClub,
    metrics: {
      ...norm.metrics,
      effectiveCarry: Math.round(effectiveCarry * 10) / 10,
      physicsCarry: flight.carryYds,
      totalYds: norm.metrics.total ?? flight.totalYds,
      faceToTarget: dplane.faceToTarget,
      faceToPath: dplane.faceToPath,
      estDynamicLoft: delivery.estDynamicLoft,
      estShaftLean: delivery.estShaftLean,
      spinLoft: delivery.spinLoft,
    },
    clubSpec: {
      code: clubSpec.code,
      label: clubSpec.label,
      category: clubSpec.category,
      staticLoft: clubSpec.staticLoft,
      idealSmash: clubSpec.smash.ideal,
    },
    flight,
    potential,
    dplane: {
      faceToTarget: dplane.faceToTarget,
      faceToPath: dplane.faceToPath,
      faceSource: dplane.faceSource,
      faceRationale: dplane.faceRationale,
      expectedSpinAxis: dplane.expectedSpinAxis,
      gearEffectResidual: dplane.gearEffectResidual,
    },
    shotShape,
    delivery,
    strike,
    scorecard,
    dataQuality,
    strokesGained,
    clubDetection,
    shouldAutoSwitch,
    raw: norm.raw,
  };
}

/**
 * Compute GSPro I (Club Up) / K (Club Down) keystroke plan to move from currentClub to targetClub.
 * Accepts optional bagOrder matching the player's configured GSPro bag (defaults to 14 clubs + PT).
 */
function planGsproClubSwitch(currentClubRaw, targetClubRaw, bagOrder = null) {
  const cur = normalizeGsproClubCode(currentClubRaw);
  const tgt = normalizeGsproClubCode(targetClubRaw);
  if (!cur) return { steps: 0, key: null, from: cur, to: tgt, reason: 'unknown_gspro_club' };
  if (!tgt) return { steps: 0, key: null, from: cur, to: tgt, reason: 'unknown_target_club' };
  if (cur === tgt) return { steps: 0, key: null, from: cur, to: tgt, reason: 'already_selected' };
  const order = Array.isArray(bagOrder) && bagOrder.length
    ? [...bagOrder.map((c) => normalizeGsproClubCode(c)).filter(Boolean), ...(bagOrder.includes('PT') ? [] : ['PT'])]
    : GSPRO_CLUB_ORDER;
  const idxCur = order.indexOf(cur);
  const idxTgt = order.indexOf(tgt);
  if (idxCur < 0 || idxTgt < 0) return { steps: 0, key: null, from: cur, to: tgt, reason: 'club_not_in_bag' };
  // In GSPro: 'I' moves UP toward Driver (lower index), 'K' moves DOWN toward Wedges/Putter (higher index)
  const diff = idxTgt - idxCur;
  return {
    from: cur,
    to: tgt,
    key: diff > 0 ? 'k' : 'i',
    steps: Math.abs(diff),
  };
}

/**
 * Parse an FSX Pro / FSX 2020 exported CSV string into ShotLab raw shot records.
 * Handles common Foresight CSV header variations, thousands commas, and directional suffixes cleanly.
 */
function parseFsxCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Find header row (Foresight CSVs sometimes have metadata/summary lines above the header)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    if (/ball\s*speed/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const splitRow = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = splitRow(lines[headerIdx]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const findCol = (patterns, exclude = []) => headers.findIndex(
    (h) => patterns.some((p) => p.test(h)) && !exclude.some((ex) => ex.test(h))
  );

  const col = {
    club: findCol([/^club$/, /club name/, /club type/]),
    ballSpeed: findCol([/ball speed/]),
    vla: findCol([/launch angle/, /vertical launch/, /^vla$/]),
    hla: findCol([/azimuth/, /side angle/, /horizontal launch/, /^hla$/]),
    totalSpin: findCol([/total spin/, /^spin$/]),
    backSpin: findCol([/back\s*spin/]),
    sideSpin: findCol([/side\s*spin/]),
    spinAxis: findCol([/spin\s*axis/, /tilt/]),
    carry: findCol([/^carry$/, /^carry\b/, /carry distance/], [/side/, /offline/, /lateral/, /curve/]),
    total: findCol([/^total$/, /total distance/], [/spin/, /side/, /offline/]),
    clubSpeed: findCol([/club\s*head\s*speed/, /club\s*speed/]),
    aoa: findCol([/angle of attack/, /^aoa$/, /attack angle/]),
    path: findCol([/club\s*path/, /^path$/]),
    face: findCol([/face\s*to\s*target/, /face\s*angle/]),
  };

  if (col.ballSpeed < 0) return [];

  const shots = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const val = (idx) => {
      if (idx < 0 || idx >= cells.length) return null;
      const cleaned = cells[idx].replace(/,/g, '').replace(/[^\d.+-]/g, '');
      return toNum(cleaned);
    };
    const bs = val(col.ballSpeed);
    if (!bs || bs < 15) continue;

    // Handle L/R/In-Out/Closed/Open/Up/Down directional suffix strings, including thousands commas ("1,250 R", "2.3L", "4.2 Down")
    const dirVal = (idx, mode = 'horiz') => {
      if (idx < 0 || idx >= cells.length) return null;
      const s = cells[idx].trim();
      const sNoComma = s.replace(/,/g, '');
      const m = sNoComma.match(/[+-]?\d+(?:\.\d+)?/);
      if (!m) return null;
      const num = toNum(m[0]);
      if (num === null) return null;
      if (mode === 'aoa') {
        if (/\b(down|dn|d)\b|(?:\d)d\b/i.test(s)) return -Math.abs(num);
        if (/\b(up|u)\b|(?:\d)u\b/i.test(s)) return Math.abs(num);
        return num;
      }
      if (/out[\s-]*(?:to[\s-]*)?in/i.test(s) || /\bclosed\b/i.test(s)) return -Math.abs(num);
      if (/in[\s-]*(?:to[\s-]*)?out/i.test(s) || /\bopen\b/i.test(s)) return Math.abs(num);
      if (/\b(left|l)\b|(?:\d)l\b/i.test(s)) return -Math.abs(num);
      if (/\b(right|r)\b|(?:\d)r\b/i.test(s)) return Math.abs(num);
      return num;
    };

    const backSpin = val(col.backSpin);
    const sideSpin = dirVal(col.sideSpin);
    let totalSpin = val(col.totalSpin);
    let spinAxis = dirVal(col.spinAxis);
    if ((totalSpin === null || totalSpin <= 0) && (backSpin !== null || sideSpin !== null)) {
      totalSpin = Math.round(Math.hypot(backSpin || 0, sideSpin || 0));
    }
    if (spinAxis === null && backSpin && sideSpin !== null) {
      spinAxis = Math.round((Math.atan2(sideSpin, backSpin) * 180) / Math.PI * 10) / 10;
    }

    const cs = val(col.clubSpeed);
    const aoaVal = dirVal(col.aoa, 'aoa');
    const pathVal = dirVal(col.path);
    const faceVal = dirVal(col.face);
    const hasClubData = (cs !== null && cs > 20) || aoaVal !== null || pathVal !== null || faceVal !== null;

    shots.push({
      ts: new Date(Date.now() - (lines.length - i) * 1000).toISOString(),
      shot_num: shots.length + 1,
      club: col.club >= 0 ? normalizeGsproClubCode(cells[col.club]) : null,
      ball: {
        speed: bs,
        carry: val(col.carry),
        total: val(col.total),
        hla: dirVal(col.hla),
        vla: val(col.vla),
        spin: totalSpin,
        spin_axis: spinAxis,
        back_spin: backSpin,
        side_spin: sideSpin,
      },
      club_data: hasClubData
        ? { speed: cs && cs > 20 ? cs : null, aoa: aoaVal, path: pathVal, face: faceVal }
        : null,
    });
  }
  return shots;
}

module.exports = {
  CLUB_ORDER,
  GSPRO_CLUB_ORDER,
  CLUB_SPECS,
  BENCHMARK_TIERS,
  normalizeClubCode,
  normalizeGsproClubCode,
  getClubSpec,
  simulateBallFlight,
  computeDistancePotential,
  createEmptyCalibration,
  classifyClub,
  recordConfirmation,
  getCalibrationStats,
  posteriorForClub,
  analyzeShot,
  planGsproClubSwitch,
  parseFsxCsv,
  computeShotStrokesGained,
  computeDispersionStats,
  SwingDatabase,
  deriveSiblingClips,
  loadDrillsHubData,
  recommendDrillsForFault,
  detectFaultStreak,
};
