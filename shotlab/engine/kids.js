/**
 * ShotLab — Kids Zone (Ages 4–5) Low-Speed Analyzer & Dad-Stats Isolation Gate.
 *
 * Completely isolated from adult SQLite calibration, Strokes Gained, DECADE patterns,
 * OBS overlays, and GSPro auto-switching. Handles both live Launch Pro payloads
 * (including slow 1–40 mph swings & vla <= 0 ground rollers) and manual tap hits.
 */
'use strict';

const { simulateBallFlight } = require('./physics');

function toNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Determine whether a raw shot record belongs to Kids Zone and MUST NEVER
 * enter Dad's SQLite database, runtime tape, calibration, or Drills Hub Mat Mode.
 *
 * @param {object} raw
 * @param {Set<string>|null} [quarantineSet=null]
 * @returns {boolean}
 */
function isKidsZoneRawShot(raw, quarantineSet = null) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.session_id === 'kids_zone') return true;
  if (raw.kids_zone === true || raw.isKids === true) return true;
  if (raw.practice_mode === 'kids' || raw.practiceMode === 'kids') return true;
  const drillId = String(raw.drill_id || raw.drillId || '').toLowerCase();
  if (drillId.startsWith('kids-')) return true;
  const feelId = String(raw.feel_id || raw.feelId || '').toLowerCase();
  if (feelId.startsWith('kids-')) return true;
  if (quarantineSet && typeof raw.ts === 'string' && quarantineSet.has(raw.ts)) return true;
  return false;
}

const CONTEXT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Sanitize an adult Drills Hub drill ID for Dad's active context.
 * Rejects any `kids-*` ID so Kids Zone drills can never poison Dad's persisted
 * settings or quarantine subsequent adult shots.
 *
 * @param {unknown} val
 * @returns {string|null}
 */
function sanitizeAdultDrillId(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  if (!CONTEXT_ID_RE.test(s)) return null;
  if (s.toLowerCase().startsWith('kids-')) return null;
  return s;
}

/**
 * Decide whether ShotLab should push Kids Zone context back to SimWatch upon
 * receiving an SSE `status` event. Avoids infinite POST <-> SSE feedback loops
 * when SimWatch already holds the exact Kids Zone context.
 *
 * @param {boolean} kidsMode
 * @param {object|null|undefined} bridgeContext
 * @returns {boolean}
 */
function shouldPushKidsContextOnStatus(kidsMode, bridgeContext) {
  if (!kidsMode) return false;
  const ctx = bridgeContext && typeof bridgeContext === 'object' ? bridgeContext : null;
  if (!ctx) return true;
  return ctx.session_id !== 'kids_zone' || ctx.drill_id !== 'kids-zone' || (ctx.feel_id ?? null) !== null;
}

/**
 * Analyze either a live Launch Pro / OpenConnect kid shot OR a manual tap hit
 * into a purely encouraging, NaN-free celebration bundle for Kids Zone.
 *
 * @param {object} rawShot
 * @returns {object|null}
 */
function analyzeKidsShot(rawShot) {
  if (!rawShot || typeof rawShot !== 'object') return null;
  const ts = typeof rawShot.ts === 'string' && rawShot.ts ? rawShot.ts : new Date().toISOString();
  const isManual = rawShot.source === 'manual';

  if (isManual) {
    const isSuper = rawShot.tier === 'super';
    const ballSpeed = isSuper ? 34 : 18;
    const carryYds = isSuper ? 26 : 11;
    const totalYds = isSuper ? 36 : 18;
    const apexFt = isSuper ? 14 : 5;
    return {
      id: `kids_${ts}_manual`,
      ts,
      source: 'manual',
      isKids: true,
      practiceMode: 'kids',
      isRoller: !isSuper,
      ballSpeed,
      carryYds,
      totalYds,
      rollYds: totalYds - carryYds,
      apexFt,
      hla: 0,
      vla: isSuper ? 24 : 4,
      offlineYds: 0,
      starsEarned: isSuper ? 2 : 1,
      powerPct: isSuper ? 78 : 42,
      cheerLabel: isSuper ? 'SUPER SHOT!!' : 'NICE HIT!',
    };
  }

  const ball = rawShot.ball || {};
  const ocBall = rawShot.BallData || {};
  const ballSpeed = toNum(ball.speed ?? ocBall.Speed ?? rawShot.ball_speed ?? rawShot.ballSpeed);
  if (ballSpeed === null || ballSpeed <= 0) return null;

  const vlaRaw = toNum(ball.vla ?? ocBall.VLA);
  const hlaRaw = toNum(ball.hla ?? ocBall.HLA);
  const vla = vlaRaw ?? 0;
  const hla = hlaRaw ?? 0;
  const totalSpin = toNum(ball.spin ?? ocBall.TotalSpin) ?? 1800;
  const spinAxis = toNum(ball.spin_axis ?? ocBall.SpinAxis) ?? 0;
  const reportedCarry = toNum(ball.carry ?? ocBall.CarryDistance);
  const reportedTotal = toNum(ball.total ?? ocBall.TotalDistance);

  const isAirborne = ballSpeed > 5 && vla > 0.5;
  let carryYds = 0;
  let totalYds = 0;
  let apexFt = 0;
  let offlineYds = 0;

  if (isAirborne) {
    const flight = simulateBallFlight({
      ballSpeedMph: ballSpeed,
      vlaDeg: Math.max(1, Math.min(60, vla)),
      hlaDeg: Math.max(-45, Math.min(45, hla)),
      totalSpinRpm: Math.max(200, Math.min(12000, totalSpin)),
      spinAxisDeg: Math.max(-45, Math.min(45, spinAxis)),
      altitudeFt: 0,
      includePoints: false,
    });
    carryYds = reportedCarry !== null && reportedCarry > 0
      ? Math.round(reportedCarry * 10) / 10
      : (Number.isFinite(flight.carryYds) ? flight.carryYds : Math.round(ballSpeed * 0.65 * 10) / 10);
    totalYds = reportedTotal !== null && reportedTotal >= carryYds
      ? Math.round(reportedTotal * 10) / 10
      : (Number.isFinite(flight.totalYds) ? Math.max(carryYds, flight.totalYds) : Math.round((carryYds + 6) * 10) / 10);
    apexFt = Number.isFinite(flight.apexFt) ? Math.max(1, Math.round(flight.apexFt * 10) / 10) : 2;
    offlineYds = Number.isFinite(flight.offlineYds) ? flight.offlineYds : 0;
  } else {
    // Low-speed putts or topped rollers — celebrate the roll cleanly!
    const estRoll = reportedTotal !== null && reportedTotal > 0
      ? reportedTotal
      : Math.max(2, Math.round(ballSpeed * 0.9 * 10) / 10);
    carryYds = 0;
    totalYds = Math.round(estRoll * 10) / 10;
    apexFt = 0;
    offlineYds = Math.round(totalYds * Math.sin((Math.max(-35, Math.min(35, hla)) * Math.PI) / 180) * 10) / 10;
  }

  const rollYds = Math.max(0, Math.round((totalYds - carryYds) * 10) / 10);
  let starsEarned = 1;
  if (totalYds >= 30 || ballSpeed >= 36) starsEarned = 3;
  else if (totalYds >= 12 || ballSpeed >= 18) starsEarned = 2;

  const cheerLabel = starsEarned === 3
    ? 'MEGA BLASTOFF!!'
    : starsEarned === 2
      ? (isAirborne ? 'ROCKET LAUNCH!' : 'POWER ROLL!')
      : (isAirborne ? 'NICE AIR SHOT!' : 'GREAT ROLL!');

  return {
    id: `kids_${ts}_${Math.round(ballSpeed * 10)}`,
    ts,
    source: 'launch_monitor',
    isKids: true,
    practiceMode: 'kids',
    isRoller: !isAirborne,
    ballSpeed: Math.round(ballSpeed * 10) / 10,
    carryYds,
    totalYds,
    rollYds,
    apexFt,
    hla: Math.round(hla * 10) / 10,
    vla: Math.round(vla * 10) / 10,
    offlineYds,
    starsEarned,
    powerPct: Math.max(12, Math.min(100, Math.round((ballSpeed / 42) * 100))),
    cheerLabel,
  };
}

module.exports = {
  isKidsZoneRawShot,
  analyzeKidsShot,
  sanitizeAdultDrillId,
  shouldPushKidsContextOnStatus,
};
