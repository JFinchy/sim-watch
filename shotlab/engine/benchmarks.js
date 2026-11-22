/**
 * ShotLab — reference ball flights per club for the trajectory chart's toggleable benchmark lines.
 *
 * Tour: TrackMan's published PGA Tour averages (club/ball speed, launch, spin) for DR..PW.
 *       GW/SW/LW are extrapolated estimates (TrackMan's classic table stops at PW).
 * Scratch / Low HCP / Mid HCP: modelled from the Tour line - ball speed scaled by the tier's driver club
 *       speed vs Tour's 113 mph (and the tier's smash offset), with the tier's launch and spin pads. They are typical-player estimates, not
 *       measured averages, and are labelled that way in the UI.
 * Every line is simulated through the same physics as the user's shot, so heights and carries compare
 * like for like (same altitude, straight spin axis).
 */
'use strict';

const { CLUB_SPECS, BENCHMARK_TIERS } = require('./constants');
const { simulateBallFlight } = require('./physics');

// TrackMan PGA Tour averages: ballSpeed mph, vla deg, spin rpm.
const TOUR_LAUNCH = {
  DR: { ballSpeed: 167, vla: 10.9, spin: 2686 },
  '3W': { ballSpeed: 158, vla: 9.2, spin: 3655 },
  '5W': { ballSpeed: 152, vla: 9.4, spin: 4350 },
  '4H': { ballSpeed: 146, vla: 10.2, spin: 4437 },
  '4I': { ballSpeed: 137, vla: 11.0, spin: 4836 },
  '5I': { ballSpeed: 132, vla: 12.1, spin: 5361 },
  '6I': { ballSpeed: 127, vla: 14.1, spin: 6231 },
  '7I': { ballSpeed: 120, vla: 16.3, spin: 7097 },
  '8I': { ballSpeed: 115, vla: 18.1, spin: 7998 },
  '9I': { ballSpeed: 109, vla: 20.4, spin: 8647 },
  PW: { ballSpeed: 102, vla: 24.2, spin: 9304 },
  // Estimates beyond TrackMan's classic table:
  GW: { ballSpeed: 96, vla: 26.5, spin: 9700, estimate: true },
  SW: { ballSpeed: 90, vla: 29.0, spin: 10100, estimate: true },
  LW: { ballSpeed: 83, vla: 31.5, spin: 10400, estimate: true },
};

// Driver club speed (mph) assumed for each amateur tier.
const TIER_DRIVER_SPEED = { scratch: 108, low_hcp: 100, mid_hcp: 93 };
const TOUR_DRIVER_SPEED = 113; // TrackMan PGA Tour average driver club speed (mph)

const REFERENCE_LINES = [
  { id: 'tour', label: 'Tour', color: '#facc15', dash: '6 3' },
  { id: 'scratch', label: 'Scratch', color: '#c084fc', dash: '4 3' },
  { id: 'low_hcp', label: 'Low HCP', color: '#60a5fa', dash: '3 3' },
  { id: 'mid_hcp', label: 'Mid HCP', color: '#94a3b8', dash: '2 3' },
];

function downsample(points, maxPts = 32) {
  if (!Array.isArray(points) || points.length <= maxPts) return points || [];
  const out = [];
  const step = (points.length - 1) / (maxPts - 1);
  for (let i = 0; i < maxPts; i += 1) out.push(points[Math.round(i * step)]);
  return out.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}

/** Launch conditions for one reference line on one club, or null if unknown. */
function referenceLaunch(lineId, clubCode) {
  if (typeof clubCode !== 'string' || !Object.hasOwn(CLUB_SPECS, clubCode)) return null;
  if (typeof lineId !== 'string') return null;
  if (lineId === 'tour' || lineId === 'tour_pro') {
    const t = Object.hasOwn(TOUR_LAUNCH, clubCode) ? TOUR_LAUNCH[clubCode] : null;
    return t ? { ...t, source: t.estimate ? 'Tour estimate' : 'TrackMan PGA Tour avg' } : null;
  }
  const tier = Object.hasOwn(BENCHMARK_TIERS, lineId) ? BENCHMARK_TIERS[lineId] : null;
  const drv = Object.hasOwn(TIER_DRIVER_SPEED, lineId) ? TIER_DRIVER_SPEED[lineId] : null;
  const tour = Object.hasOwn(TOUR_LAUNCH, clubCode) ? TOUR_LAUNCH[clubCode] : null;
  if (!tier || !drv || !tour) return null;
  // Anchored to the Tour line so tiers can never out-carry it: ball speed scales with the tier's driver
  // club speed vs Tour's (and its smash offset relative to PGA Tour baseline); launch and spin get the tier's pads.
  const tourSmashOffset = BENCHMARK_TIERS.tour_pro ? (BENCHMARK_TIERS.tour_pro.smashOffset || 0) : 0;
  const speedScale = (drv / TOUR_DRIVER_SPEED) * (1 + ((tier.smashOffset || 0) - tourSmashOffset) / 1.45);
  return {
    ballSpeed: tour.ballSpeed * speedScale,
    vla: tour.vla + (tier.vlaPad || 0),
    spin: tour.spin + (tier.spinPad || 0),
    source: 'ShotLab model',
  };
}

const cache = new Map();

/**
 * Reference flights for a club: [{id, label, color, dash, carryYds, apexFt, descentAngleDeg, points, source}].
 * Cached per club + altitude (rounded to 250 ft).
 */
function referenceFlights(clubCode, altitudeFt = 0) {
  const alt = Math.round((Number(altitudeFt) || 0) / 250) * 250;
  const key = `${clubCode}|${alt}`;
  if (cache.has(key)) return cache.get(key);
  const out = [];
  for (const line of REFERENCE_LINES) {
    const launch = referenceLaunch(line.id, clubCode);
    if (!launch) continue;
    const fl = simulateBallFlight({
      ballSpeedMph: launch.ballSpeed,
      vlaDeg: launch.vla,
      hlaDeg: 0,
      totalSpinRpm: launch.spin,
      spinAxisDeg: 0,
      altitudeFt: alt,
      includePoints: true,
    });
    if (!fl.points || fl.points.length < 2) continue;
    out.push({
      ...line,
      carryYds: Math.round(fl.carryYds),
      apexFt: Math.round(fl.apexFt),
      descentAngleDeg: Math.round(fl.descentAngleDeg * 10) / 10,
      points: downsample(fl.points),
      source: launch.source,
    });
  }
  if (out.length > 0) cache.set(key, out);
  return out;
}

module.exports = { TOUR_LAUNCH, TIER_DRIVER_SPEED, REFERENCE_LINES, referenceLaunch, referenceFlights };
