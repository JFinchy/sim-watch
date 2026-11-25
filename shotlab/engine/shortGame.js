/**
 * ShotLab — Short Game (≤100 Yards), Live Wedge Clock Matrix & Putting Start-Line/Speed Lab.
 *
 * Designed specifically for an indoor Fiberbuilt / Launch Pro / GSPro studio:
 *   - Putting Lab: Start-Line HLA (±0.5°/±1.0°) + Ball-Speed-to-Stimp Distance Calibration
 *     (skipping mat-grain friction lies; meant for flat stance mat or roll-out strip).
 *   - Chip & Pitch Lab: Trajectory Window + Fiberbuilt "Mat-Fat Detector" (spots high-launch /
 *     low-spin bounce traps disguised by thick bristles).
 *   - Live Wedge Matrix Calibrator: Captures 3-10 live shots per (Wedge x Swing Clock),
 *     trims outlier when N>=5, computes robust median Carry/Roll/VLA/Spin/±yd spread.
 *   - 20-100y Scoring Combine: Recommends closest calibrated Matrix swing and grades proximity + SG.
 */
'use strict';

function toNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function medianOf(arr) {
  const clean = arr.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function extractShortFields(shotOrRaw = {}) {
  const s = shotOrRaw && typeof shotOrRaw === 'object' ? shotOrRaw : {};
  const m = s.metrics || {};
  const f = s.flight || {};
  const b = s.ball || {};
  const ocb = s.BallData || {};
  const cd = s.club_data || {};

  const ballSpeed = toNum(m.ballSpeed ?? b.speed ?? ocb.Speed ?? s.ballSpeed ?? s.ball_speed);
  const vla = toNum(m.vla ?? b.vla ?? ocb.VLA ?? s.vla);
  const hla = toNum(m.hla ?? b.hla ?? ocb.HLA ?? s.hla);
  const backSpin = toNum(m.backSpin ?? b.back_spin ?? ocb.BackSpin ?? m.totalSpin ?? b.spin ?? ocb.TotalSpin);
  const carryRaw = toNum(m.effectiveCarry ?? f.carryYds ?? b.carry ?? ocb.CarryDistance ?? s.carryYds ?? s.carry);
  const totalRaw = toNum(m.totalYds ?? f.totalYds ?? b.total ?? ocb.TotalDistance ?? s.totalYds ?? s.total);
  const carryYds = carryRaw !== null ? Math.round(carryRaw * 10) / 10 : (totalRaw !== null ? Math.round(totalRaw * 0.85 * 10) / 10 : 0);
  const totalYds = totalRaw !== null ? Math.round(Math.max(carryYds, totalRaw) * 10) / 10 : Math.round((carryYds + 3) * 10) / 10;
  const rollYds = Math.round((totalYds - carryYds) * 10) / 10;
  const offlineRaw = toNum(f.offlineYds ?? s.offlineYds);
  const offlineYds = offlineRaw !== null
    ? Math.round(offlineRaw * 10) / 10
    : (hla !== null ? Math.round(carryYds * Math.sin((hla * Math.PI) / 180) * 10) / 10 : 0);
  const smash = toNum(m.smash);
  const aoa = toNum(m.aoa ?? cd.aoa);
  const club = s.activeClub || s.club || 'SW';

  return { ballSpeed, vla, hla, backSpin, carryYds, totalYds, rollYds, offlineYds, smash, aoa, club };
}

/**
 * Convert initial Launch Pro putt ball speed (mph) to roll distance (feet) at a Stimp rating.
 * Empirically derived from Pelz / Quintic flat-green deceleration (~0.29 * mph^2 * (stimp / 10)).
 *
 * @param {number} mph
 * @param {number} [stimp=10]
 * @returns {number}
 */
function ballSpeedMphToPuttFt(mph, stimp = 10) {
  const spd = toNum(mph);
  if (spd === null || spd <= 0) return 0;
  const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
  return Math.round(0.29 * spd * spd * (st / 10) * 10) / 10;
}

/**
 * Target initial putt ball speed (mph) for a given distance in feet & Stimp speed.
 *
 * @param {number} targetFt
 * @param {number} [stimp=10]
 * @returns {number}
 */
function targetPuttSpeedMph(targetFt, stimp = 10) {
  const ft = Math.max(1, toNum(targetFt) ?? 10);
  const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
  return Math.round(Math.sqrt(ft / (0.29 * (st / 10))) * 10) / 10;
}

/**
 * Analyze a Launch Pro putt strictly on the 2 variables that transfer 100% outdoors:
 *   1) Start Line (HLA degrees)
 *   2) Initial Ball Speed -> calibrated Stimp feet
 */
function analyzePuttShot(shotOrRaw, { stimp = 10, targetFt = 12, gateDeg = 1.0 } = {}) {
  const f = extractShortFields(shotOrRaw);
  const st = Math.max(7, Math.min(14, toNum(stimp) ?? 10));
  const tgtFt = Math.max(2, Math.min(60, toNum(targetFt) ?? 12));
  const gate = Math.max(0.3, Math.min(3.0, toNum(gateDeg) ?? 1.0));

  const mph = f.ballSpeed ?? 0;
  const hla = f.hla ?? 0;
  const estDistFt = ballSpeedMphToPuttFt(mph, st);
  const targetMph = targetPuttSpeedMph(tgtFt, st);
  const distErrFt = Math.round((estDistFt - tgtFt) * 10) / 10;
  const missAtTargetIn = Math.round(Math.tan((Math.abs(hla) * Math.PI) / 180) * tgtFt * 12 * 10) / 10;
  const wouldMakeLine = missAtTargetIn <= 2.125; // standard 4.25" cup radius
  const linePass = Math.abs(hla) <= gate;
  const speedTol = Math.max(1.2, tgtFt * 0.14);
  const speedPass = mph > 0 && Math.abs(distErrFt) <= speedTol;

  const grade = (mph > 0 && linePass && speedPass)
    ? 'green'
    : (mph > 0 && (linePass || speedPass))
      ? 'yellow'
      : 'red';

  let cue = 'Pure start line & die-in speed!';
  if (!linePass) {
    const dir = hla > 0 ? 'RIGHT (open face)' : 'LEFT (closed face)';
    cue = `Started ${Math.abs(hla).toFixed(1)}° ${dir} — roll over tee gate 12" ahead.`;
  } else if (!speedPass) {
    cue = distErrFt > 0
      ? `${Math.abs(distErrFt).toFixed(1)} ft hot (${mph.toFixed(1)} vs ${targetMph.toFixed(1)} mph) — shorten backswing.`
      : `${Math.abs(distErrFt).toFixed(1)} ft short (${mph.toFixed(1)} vs ${targetMph.toFixed(1)} mph) — hold finish rhythm.`;
  }

  return {
    ballSpeedMph: Math.round(mph * 10) / 10,
    hla: Math.round(hla * 10) / 10,
    stimp: st,
    targetFt: tgtFt,
    gateDeg: gate,
    targetMph,
    estDistFt,
    distErrFt,
    missAtTargetIn,
    wouldMakeLine,
    linePass,
    speedPass,
    grade,
    cue,
  };
}

/**
 * Analyze a 5-100y chip, pitch, or partial wedge shot, including Fiberbuilt Mat-Fat detection.
 */
function analyzeShortGameShot(shotOrRaw, { matType = 'fiberbuilt', targetYds = null } = {}) {
  const f = extractShortFields(shotOrRaw);
  const { carryYds, totalYds, rollYds, vla, hla, backSpin, offlineYds, smash, aoa } = f;

  let window = 'stock_pitch';
  let windowLabel = 'Stock Mid Pitch (27–34°)';
  if (vla !== null && vla < 18 && carryYds >= 10) {
    window = 'thin_skull';
    windowLabel = 'Low Skulled / Thin Groove (<18°)';
  } else if (vla !== null && vla < 27) {
    window = 'low_spinner';
    windowLabel = 'Low Nipper / Hop-Check (<27°)';
  } else if (vla !== null && vla > 34) {
    window = 'high_soft';
    windowLabel = 'High Soft Lob (>34°)';
  }

  // Fiberbuilt bristle mat trap: hitting behind the ball skips cleanly off thick turf,
  // ballooning launch upward while robbing face friction/spin.
  const matFatLikely = Boolean(
    carryYds >= 10 && (
      (vla !== null && vla >= 35 && backSpin !== null && backSpin < 4300) ||
      (smash !== null && smash < 0.72 && vla !== null && vla >= 31)
    )
  );
  const crispNipper = Boolean(
    !matFatLikely &&
    carryYds >= 10 &&
    vla !== null &&
    vla >= 22 &&
    vla <= 33 &&
    (backSpin === null || backSpin >= 4800)
  );

  const absHla = hla !== null ? Math.abs(hla) : null;
  const hlaGrade = absHla === null ? 'neutral' : absHla <= 1.5 ? 'green' : absHla <= 3.0 ? 'yellow' : 'red';
  const carryErrYds = (targetYds !== null && Number.isFinite(Number(targetYds)))
    ? Math.round((carryYds - Number(targetYds)) * 10) / 10
    : null;

  let grade = 'green';
  let verdict = crispNipper ? 'Crisp One-Hop Contact' : 'Clean Trajectory Window';
  let cue = 'Hold soft chest pivot & keep bounce gliding.';

  if (matFatLikely) {
    grade = 'red';
    verdict = `Mat-Fat Bounce Warning (${matType})`;
    cue = 'High VLA + low spin: place folded towel 2–3" behind ball so trailing turf grabs before cheating contact.';
  } else if (window === 'thin_skull') {
    grade = 'red';
    verdict = 'Low Thin / Groove Strike';
    cue = 'Feel soft arms & let the trailing bounce thump the mat under the ball.';
  } else if (hlaGrade === 'red') {
    grade = 'yellow';
    verdict = 'Start Line Off Corridor';
    cue = `Start line ${absHla.toFixed(1)}° ${hla > 0 ? 'R' : 'L'} — aim chest & clubface together.`;
  } else if (carryErrYds !== null && Math.abs(carryErrYds) > Math.max(4, Number(targetYds) * 0.10)) {
    grade = 'yellow';
    verdict = carryErrYds > 0 ? `Flew ${carryErrYds}y Long` : `Came Up ${Math.abs(carryErrYds)}y Short`;
    cue = 'Commit to swing-clock length without decelerating through impact.';
  }

  return {
    club: f.club,
    carryYds,
    totalYds,
    rollYds,
    vla: vla !== null ? Math.round(vla * 10) / 10 : null,
    hla: hla !== null ? Math.round(hla * 10) / 10 : null,
    backSpin: backSpin !== null ? Math.round(backSpin) : null,
    offlineYds,
    aoa: aoa !== null ? Math.round(aoa * 10) / 10 : null,
    window,
    windowLabel,
    matFatLikely,
    crispNipper,
    hlaGrade,
    carryErrYds,
    grade,
    verdict,
    cue,
  };
}

/**
 * Compute robust medians for a Wedge Matrix cell from N captured Launch Pro swings.
 * When >=5 shots are recorded, trims the single furthest carry outlier automatically.
 */
function summarizeCalibrationShots(shots = []) {
  const parsed = (Array.isArray(shots) ? shots : [])
    .map(extractShortFields)
    .filter((f) => f.carryYds > 0);
  if (!parsed.length) return null;

  let active = parsed;
  if (parsed.length >= 5) {
    const rawMed = medianOf(parsed.map((x) => x.carryYds));
    let maxIdx = 0;
    let maxDev = -1;
    parsed.forEach((x, idx) => {
      const dev = Math.abs(x.carryYds - rawMed);
      if (dev > maxDev) { maxDev = dev; maxIdx = idx; }
    });
    active = parsed.filter((_, idx) => idx !== maxIdx);
  }

  const carries = active.map((x) => x.carryYds);
  const rolls = active.map((x) => x.rollYds);
  const vlas = active.map((x) => x.vla).filter((v) => v !== null);
  const spins = active.map((x) => x.backSpin).filter((v) => v !== null);
  const minC = Math.min(...carries);
  const maxC = Math.max(...carries);

  return {
    n: parsed.length,
    usedN: active.length,
    carry: Math.round(medianOf(carries)),
    roll: Math.round(medianOf(rolls)),
    vla: vlas.length ? Math.round(medianOf(vlas) * 10) / 10 : null,
    spin: spins.length ? Math.round(medianOf(spins)) : null,
    spreadYds: Math.round(((maxC - minC) / 2) * 10) / 10,
  };
}

/**
 * Recommend the best matching (Wedge x Swing Clock) from the calibrated Matrix for a target yardage.
 */
function recommendWedgeFromMatrix(matrix = [], targetYds) {
  const tgt = toNum(targetYds);
  if (tgt === null || !Array.isArray(matrix) || !matrix.length) return null;

  const entries = [];
  for (const row of matrix) {
    if (!row || !Array.isArray(row.cells)) continue;
    for (const cell of row.cells) {
      const carry = toNum(cell?.carry);
      if (carry === null || carry <= 0) continue;
      entries.push({
        club: row.club,
        label: row.label || row.club,
        arm: cell.arm,
        pct: cell.pct,
        carry,
        roll: toNum(cell.roll) ?? 0,
        vla: toNum(cell.vla),
        spin: toNum(cell.spin),
        deltaYds: Math.round(tgt - carry),
        absDiff: Math.abs(tgt - carry),
      });
    }
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a.absDiff - b.absDiff || b.carry - a.carry);
  const decorate = (e) => {
    let hint = 'Stock clock swing';
    if (e.deltaYds <= -3) hint = `Take ${Math.abs(e.deltaYds)}y off (choke down 1/2" & smooth)`;
    else if (e.deltaYds >= 3) hint = `Add +${e.deltaYds}y (slightly firmer pivot)`;
    return { ...e, hint };
  };
  return {
    primary: decorate(entries[0]),
    alternate: entries[1] ? decorate(entries[1]) : null,
  };
}

/**
 * Grade a 10-100y scoring-zone shot against PGA Tour proximity benchmarks.
 */
function scoreScoringZoneShot(shotOrRaw, targetYds) {
  const f = extractShortFields(shotOrRaw);
  const tgt = Math.max(5, Math.min(130, toNum(targetYds) ?? 50));
  const carry = f.carryYds;
  const offline = f.offlineYds;
  const carryErrYds = Math.round((carry - tgt) * 10) / 10;
  const proxYds = Math.round(Math.hypot(carryErrYds, offline) * 10) / 10;
  const proxFt = Math.round(proxYds * 3 * 10) / 10;
  const tourProxFt = Math.round((7.5 + tgt * 0.165) * 10) / 10;
  const sgEst = Math.round(Math.max(-1.2, Math.min(0.65, (tourProxFt - proxFt) * 0.018)) * 100) / 100;
  const grade = proxFt <= tourProxFt * 1.15 ? 'green' : proxFt <= tourProxFt * 1.85 ? 'yellow' : 'red';
  const shortAnalysis = analyzeShortGameShot(shotOrRaw, { targetYds: tgt });

  return {
    targetYds: tgt,
    carryYds: carry,
    offlineYds: offline,
    carryErrYds,
    proxYds,
    proxFt,
    tourProxFt,
    sgEst,
    grade,
    matFatLikely: shortAnalysis.matFatLikely,
    vla: shortAnalysis.vla,
    backSpin: shortAnalysis.backSpin,
    verdict: `${proxFt} ft from pin (Tour avg ${tourProxFt} ft)`,
  };
}

module.exports = {
  ballSpeedMphToPuttFt,
  targetPuttSpeedMph,
  analyzePuttShot,
  analyzeShortGameShot,
  summarizeCalibrationShots,
  recommendWedgeFromMatrix,
  scoreScoringZoneShot,
};
