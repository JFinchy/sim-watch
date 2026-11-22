/**
 * ShotLab — 14-club bag definitions, benchmark tiers, and GSPro club code mapping.
 *
 * Baseline priors assume a ~98 mph Driver swing speed (typical solid single-digit
 * amateur) and automatically scale with the player's configured/calibrated Driver speed.
 */
'use strict';

const CLUB_ORDER = [
  'DR', '3W', '5W', '4H', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'
];

// Default GSPro bag order matching the 14 full-swing clubs + Putter (used to compute I / K keystrokes)
const GSPRO_CLUB_ORDER = [...CLUB_ORDER, 'PT'];

/**
 * Per-club physical specs and baseline launch distributions at a 98 mph Driver baseline.
 *
 * speedRatio: typical Club Speed relative to Driver Club Speed (e.g. 7I ≈ 0.825 * DR).
 * smash:      [greenMin, optimal, yellowMin] for Low Handicap baseline (adjusted per tier).
 * vla:        [min, ideal, max, std] vertical launch angle (deg).
 * spin:       [min, ideal, max, std] backspin (rpm).
 * aoa:        [min, ideal, max, std] angle of attack (deg).
 * descent:    [min, ideal, max] landing descent angle (deg).
 * shaftLean:  [min, ideal, max] forward shaft lean at impact = StaticLoft - DynamicLoft (deg).
 * loftFactor: fraction of vertical launch driven by dynamic loft vs AoA (TrackMan D-plane).
 * faceWeight: fraction of HLA driven by clubface angle vs club path.
 */
const CLUB_SPECS = {
  DR: {
    code: 'DR', label: 'Driver', short: 'DR', category: 'driver',
    staticLoft: 10.5, speedRatio: 1.000,
    smash: { ideal: 1.48, greenMin: 1.45, yellowMin: 1.40, maxPhys: 1.51 },
    vla: { min: 10.5, ideal: 12.8, max: 15.0, std: 2.1 },
    spin: { min: 1950, ideal: 2450, max: 2950, std: 520 },
    aoa: { min: 0.5, ideal: 3.0, max: 6.0, std: 2.2 },
    descent: { min: 32, ideal: 37, max: 43 },
    shaftLean: { min: -6.5, ideal: -4.0, max: -0.5 },
    loftFactor: 0.85, faceWeight: 0.85,
  },
  '3W': {
    code: '3W', label: '3 Wood', short: '3W', category: 'wood',
    staticLoft: 15.0, speedRatio: 0.945,
    smash: { ideal: 1.45, greenMin: 1.42, yellowMin: 1.37, maxPhys: 1.49 },
    vla: { min: 9.5, ideal: 11.8, max: 14.2, std: 1.9 },
    spin: { min: 3000, ideal: 3650, max: 4300, std: 560 },
    aoa: { min: -3.2, ideal: -1.5, max: 0.8, std: 1.8 },
    descent: { min: 37, ideal: 42, max: 47 },
    shaftLean: { min: -1.5, ideal: 0.8, max: 4.0 },
    loftFactor: 0.84, faceWeight: 0.82,
  },
  '5W': {
    code: '5W', label: '5 Wood', short: '5W', category: 'wood',
    staticLoft: 18.0, speedRatio: 0.915,
    smash: { ideal: 1.43, greenMin: 1.40, yellowMin: 1.35, maxPhys: 1.47 },
    vla: { min: 10.8, ideal: 13.0, max: 15.5, std: 1.9 },
    spin: { min: 3700, ideal: 4350, max: 5000, std: 580 },
    aoa: { min: -3.8, ideal: -2.0, max: 0.2, std: 1.7 },
    descent: { min: 40, ideal: 45, max: 50 },
    shaftLean: { min: -0.5, ideal: 2.0, max: 5.0 },
    loftFactor: 0.83, faceWeight: 0.80,
  },
  '4H': {
    code: '4H', label: '4 Hybrid', short: '4H', category: 'hybrid',
    staticLoft: 21.0, speedRatio: 0.892,
    smash: { ideal: 1.41, greenMin: 1.38, yellowMin: 1.33, maxPhys: 1.45 },
    vla: { min: 12.0, ideal: 14.2, max: 16.8, std: 1.9 },
    spin: { min: 4100, ideal: 4750, max: 5450, std: 590 },
    aoa: { min: -4.2, ideal: -2.5, max: -0.5, std: 1.7 },
    descent: { min: 42, ideal: 47, max: 52 },
    shaftLean: { min: 0.5, ideal: 3.2, max: 6.5 },
    loftFactor: 0.82, faceWeight: 0.78,
  },
  '4I': {
    code: '4I', label: '4 Iron', short: '4I', category: 'long_iron',
    staticLoft: 22.0, speedRatio: 0.885,
    smash: { ideal: 1.40, greenMin: 1.37, yellowMin: 1.32, maxPhys: 1.44 },
    vla: { min: 11.2, ideal: 13.2, max: 15.5, std: 1.8 },
    spin: { min: 4200, ideal: 4850, max: 5500, std: 580 },
    aoa: { min: -4.5, ideal: -2.8, max: -1.0, std: 1.6 },
    descent: { min: 42, ideal: 46, max: 51 },
    shaftLean: { min: 3.5, ideal: 6.2, max: 9.5 },
    loftFactor: 0.82, faceWeight: 0.76,
  },
  '5I': {
    code: '5I', label: '5 Iron', short: '5I', category: 'long_iron',
    staticLoft: 25.0, speedRatio: 0.865,
    smash: { ideal: 1.39, greenMin: 1.36, yellowMin: 1.31, maxPhys: 1.43 },
    vla: { min: 12.5, ideal: 14.8, max: 17.2, std: 1.8 },
    spin: { min: 4750, ideal: 5450, max: 6150, std: 600 },
    aoa: { min: -4.8, ideal: -3.2, max: -1.2, std: 1.6 },
    descent: { min: 44, ideal: 48, max: 52 },
    shaftLean: { min: 4.0, ideal: 6.8, max: 10.0 },
    loftFactor: 0.82, faceWeight: 0.75,
  },
  '6I': {
    code: '6I', label: '6 Iron', short: '6I', category: 'mid_iron',
    staticLoft: 28.0, speedRatio: 0.845,
    smash: { ideal: 1.38, greenMin: 1.34, yellowMin: 1.29, maxPhys: 1.42 },
    vla: { min: 14.0, ideal: 16.3, max: 18.8, std: 1.8 },
    spin: { min: 5400, ideal: 6150, max: 6900, std: 620 },
    aoa: { min: -5.2, ideal: -3.6, max: -1.5, std: 1.6 },
    descent: { min: 45, ideal: 49, max: 53 },
    shaftLean: { min: 4.5, ideal: 7.4, max: 10.5 },
    loftFactor: 0.81, faceWeight: 0.75,
  },
  '7I': {
    code: '7I', label: '7 Iron', short: '7I', category: 'mid_iron',
    staticLoft: 31.5, speedRatio: 0.825,
    smash: { ideal: 1.36, greenMin: 1.32, yellowMin: 1.27, maxPhys: 1.40 },
    vla: { min: 15.8, ideal: 18.0, max: 20.5, std: 1.9 },
    spin: { min: 6100, ideal: 6900, max: 7700, std: 650 },
    aoa: { min: -5.6, ideal: -4.0, max: -1.8, std: 1.6 },
    descent: { min: 46, ideal: 50, max: 54 },
    shaftLean: { min: 5.0, ideal: 8.2, max: 11.5 },
    loftFactor: 0.81, faceWeight: 0.75,
  },
  '8I': {
    code: '8I', label: '8 Iron', short: '8I', category: 'mid_iron',
    staticLoft: 35.5, speedRatio: 0.802,
    smash: { ideal: 1.34, greenMin: 1.30, yellowMin: 1.25, maxPhys: 1.38 },
    vla: { min: 17.8, ideal: 20.2, max: 22.8, std: 2.0 },
    spin: { min: 6900, ideal: 7750, max: 8600, std: 700 },
    aoa: { min: -6.0, ideal: -4.3, max: -2.0, std: 1.7 },
    descent: { min: 47, ideal: 51, max: 55 },
    shaftLean: { min: 5.5, ideal: 9.0, max: 12.5 },
    loftFactor: 0.80, faceWeight: 0.74,
  },
  '9I': {
    code: '9I', label: '9 Iron', short: '9I', category: 'short_iron',
    staticLoft: 40.0, speedRatio: 0.778,
    smash: { ideal: 1.31, greenMin: 1.27, yellowMin: 1.22, maxPhys: 1.35 },
    vla: { min: 20.0, ideal: 22.6, max: 25.2, std: 2.1 },
    spin: { min: 7600, ideal: 8550, max: 9450, std: 750 },
    aoa: { min: -6.4, ideal: -4.6, max: -2.2, std: 1.7 },
    descent: { min: 48, ideal: 52, max: 56 },
    shaftLean: { min: 6.0, ideal: 10.0, max: 13.5 },
    loftFactor: 0.79, faceWeight: 0.73,
  },
  PW: {
    code: 'PW', label: 'Pitching Wedge', short: 'PW', category: 'wedge',
    staticLoft: 45.0, speedRatio: 0.752,
    smash: { ideal: 1.27, greenMin: 1.23, yellowMin: 1.17, maxPhys: 1.32 },
    vla: { min: 22.5, ideal: 25.2, max: 28.0, std: 2.2 },
    spin: { min: 8200, ideal: 9250, max: 10300, std: 820 },
    aoa: { min: -6.8, ideal: -4.9, max: -2.4, std: 1.8 },
    descent: { min: 48, ideal: 52, max: 57 },
    shaftLean: { min: 6.5, ideal: 11.2, max: 15.0 },
    loftFactor: 0.78, faceWeight: 0.72,
  },
  GW: {
    code: 'GW', label: 'Gap Wedge (50°)', short: 'GW', category: 'wedge',
    staticLoft: 50.0, speedRatio: 0.720,
    smash: { ideal: 1.22, greenMin: 1.17, yellowMin: 1.11, maxPhys: 1.28 },
    vla: { min: 25.2, ideal: 28.0, max: 31.0, std: 2.4 },
    spin: { min: 8600, ideal: 9700, max: 10900, std: 880 },
    aoa: { min: -7.0, ideal: -5.0, max: -2.5, std: 1.9 },
    descent: { min: 49, ideal: 53, max: 58 },
    shaftLean: { min: 7.0, ideal: 12.0, max: 16.5 },
    loftFactor: 0.77, faceWeight: 0.70,
  },
  SW: {
    code: 'SW', label: 'Sand Wedge (54°)', short: 'SW', category: 'wedge',
    staticLoft: 54.0, speedRatio: 0.688,
    smash: { ideal: 1.16, greenMin: 1.11, yellowMin: 1.04, maxPhys: 1.23 },
    vla: { min: 27.5, ideal: 30.8, max: 34.2, std: 2.6 },
    spin: { min: 8800, ideal: 10000, max: 11400, std: 950 },
    aoa: { min: -7.2, ideal: -5.1, max: -2.5, std: 2.0 },
    descent: { min: 50, ideal: 54, max: 59 },
    shaftLean: { min: 7.0, ideal: 12.0, max: 16.5 },
    loftFactor: 0.76, faceWeight: 0.68,
  },
  LW: {
    code: 'LW', label: 'Lob Wedge (58°)', short: 'LW', category: 'wedge',
    staticLoft: 58.0, speedRatio: 0.650,
    smash: { ideal: 1.10, greenMin: 1.04, yellowMin: 0.97, maxPhys: 1.18 },
    vla: { min: 30.2, ideal: 34.0, max: 38.0, std: 2.8 },
    spin: { min: 9000, ideal: 10300, max: 11800, std: 1050 },
    aoa: { min: -7.4, ideal: -5.2, max: -2.5, std: 2.1 },
    descent: { min: 51, ideal: 55, max: 60 },
    shaftLean: { min: 6.5, ideal: 11.0, max: 16.0 },
    loftFactor: 0.75, faceWeight: 0.66,
  },
};

/**
 * Benchmark tiers for Red / Yellow / Green grading.
 * Users can toggle between Scratch, Low HCP (default), Mid HCP, and Personal Baseline.
 */
const BENCHMARK_TIERS = {
  tour_pro: {
    id: 'tour_pro',
    label: 'Tour Pro (PGA Avg)',
    shortLabel: 'Tour Pro',
    smashOffset: 0.03,
    pathGreen: 1.8,
    pathYellow: 3.2,
    faceGreen: 1.2,
    faceYellow: 2.5,
    f2pGreen: 1.4,
    f2pYellow: 2.8,
    hlaGreen: 1.4,
    hlaYellow: 2.8,
    spinAxisGreen: 4.5,
    spinAxisYellow: 9.0,
    offlineGreenPct: 0.035,
    offlineYellowPct: 0.065,
    vlaPad: -0.3,
    spinPad: -150,
    aoaPad: -0.2,
  },
  scratch: {
    id: 'scratch',
    label: 'Scratch (0–2 HCP)',
    shortLabel: 'Scratch',
    smashOffset: 0.02,      // tighter smash requirement (+0.02 over Low HCP)
    pathGreen: 2.5,
    pathYellow: 4.5,
    faceGreen: 1.8,
    faceYellow: 3.5,
    f2pGreen: 2.0,
    f2pYellow: 3.8,
    hlaGreen: 2.0,
    hlaYellow: 3.8,
    spinAxisGreen: 6.0,
    spinAxisYellow: 12.0,
    offlineGreenPct: 0.045, // 4.5% of carry (~12 yd on 265 yd drive, ~7.5 yd on 7I)
    offlineYellowPct: 0.085,
    vlaPad: 0.0,
    spinPad: 0.0,
    aoaPad: 0.0,
  },
  low_hcp: {
    id: 'low_hcp',
    label: 'Low Handicap (5–8 HCP)',
    shortLabel: 'Low HCP',
    smashOffset: 0.0,
    pathGreen: 3.5,
    pathYellow: 6.0,
    faceGreen: 2.5,
    faceYellow: 4.8,
    f2pGreen: 2.8,
    f2pYellow: 5.0,
    hlaGreen: 2.8,
    hlaYellow: 5.0,
    spinAxisGreen: 8.5,
    spinAxisYellow: 16.0,
    offlineGreenPct: 0.065, // ~16 yd on 250 yd drive, ~10 yd on 7I
    offlineYellowPct: 0.120,
    vlaPad: 0.6,
    spinPad: 250,
    aoaPad: 0.5,
  },
  mid_hcp: {
    id: 'mid_hcp',
    label: 'Mid Handicap (10–18 HCP)',
    shortLabel: 'Mid HCP',
    smashOffset: -0.04,
    pathGreen: 5.0,
    pathYellow: 8.0,
    faceGreen: 3.8,
    faceYellow: 6.5,
    f2pGreen: 4.2,
    f2pYellow: 7.2,
    hlaGreen: 4.0,
    hlaYellow: 7.0,
    spinAxisGreen: 12.0,
    spinAxisYellow: 21.0,
    offlineGreenPct: 0.095,
    offlineYellowPct: 0.165,
    vlaPad: 1.4,
    spinPad: 500,
    aoaPad: 1.0,
  },
  personal: {
    id: 'personal',
    label: 'Personal Baseline',
    shortLabel: 'Personal',
    smashOffset: 0.0,
    pathGreen: 3.5,
    pathYellow: 6.0,
    faceGreen: 2.5,
    faceYellow: 4.8,
    f2pGreen: 2.8,
    f2pYellow: 5.0,
    hlaGreen: 2.8,
    hlaYellow: 5.0,
    spinAxisGreen: 8.5,
    spinAxisYellow: 16.0,
    offlineGreenPct: 0.065,
    offlineYellowPct: 0.120,
    vlaPad: 0.6,
    spinPad: 250,
    aoaPad: 0.5,
  },
};

const CLUB_ALIASES = {
  dr: 'DR', driver: 'DR', '1w': 'DR', w1: 'DR', '1wood': 'DR',
  '3w': '3W', w3: '3W', '3wood': '3W', '2w': '3W', w2: '3W',
  '5w': '5W', w5: '5W', '5wood': '5W', '4w': '5W', w4: '5W', '7w': '5W', w7: '5W',
  '4h': '4H', h4: '4H', '4hybrid': '4H', '3h': '4H', h3: '4H', '3hybrid': '4H', '5h': '4H', h5: '4H', hybrid: '4H',
  '4i': '4I', i4: '4I', '4iron': '4I', '3i': '4I', i3: '4I', '3iron': '4I',
  '5i': '5I', i5: '5I', '5iron': '5I',
  '6i': '6I', i6: '6I', '6iron': '6I',
  '7i': '7I', i7: '7I', '7iron': '7I',
  '8i': '8I', i8: '8I', '8iron': '8I',
  '9i': '9I', i9: '9I', '9iron': '9I',
  pw: 'PW', pitchingwedge: 'PW', p: 'PW',
  gw: 'GW', gapwedge: 'GW', aw: 'GW', approachwedge: 'GW', '50': 'GW', '50deg': 'GW', '52': 'GW',
  sw: 'SW', sandwedge: 'SW', '54': 'SW', '56': 'SW',
  lw: 'LW', lobwedge: 'LW', '58': 'LW', '60': 'LW',
};

const PUTTER_ALIASES = new Set(['pt', 'putter', 'putt']);

function normalizeClubCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned) return null;
  if (Object.hasOwn(CLUB_ALIASES, cleaned)) return CLUB_ALIASES[cleaned];
  const upper = cleaned.toUpperCase();
  if (Object.hasOwn(CLUB_SPECS, upper)) return upper;
  return null;
}

function normalizeGsproClubCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleaned) return null;
  if (PUTTER_ALIASES.has(cleaned)) return 'PT';
  return normalizeClubCode(raw);
}

function getClubSpec(code, customLofts = null) {
  const norm = normalizeClubCode(code) || '7I';
  const base = CLUB_SPECS[norm] || CLUB_SPECS['7I'];
  if (customLofts && typeof customLofts[norm] === 'number' && Number.isFinite(customLofts[norm])) {
    return { ...base, staticLoft: customLofts[norm] };
  }
  return base;
}

function clubDistance(codeA, codeB) {
  const a = CLUB_ORDER.indexOf(normalizeClubCode(codeA));
  const b = CLUB_ORDER.indexOf(normalizeClubCode(codeB));
  if (a < 0 || b < 0) return 99;
  return Math.abs(a - b);
}

const CLUB_CATEGORY_GROUPS = {
  woods: ['DR', '3W', '5W'],
  hybrids: ['4H'],
  irons: ['4I', '5I', '6I', '7I', '8I', '9I'],
  wedges: ['PW', 'GW', 'SW', 'LW'],
};

module.exports = {
  CLUB_ORDER,
  GSPRO_CLUB_ORDER,
  CLUB_CATEGORY_GROUPS,
  CLUB_SPECS,
  BENCHMARK_TIERS,
  normalizeClubCode,
  normalizeGsproClubCode,
  getClubSpec,
  clubDistance,
};
