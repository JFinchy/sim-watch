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
      path: cd ? toNum(cd.path) : null,
      rawFace: cd ? toNum(cd.face) : null,
      aoa: cd ? toNum(cd.aoa) : null,
    },
    raw,
  };
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
  const activeClub = overrideClub
    || (practiceMode === 'almost' && reportedFullClub ? reportedFullClub : null)
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
    clubDetection.predictedClub !== norm.reportedClub
  );

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
