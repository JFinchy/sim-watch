/**
 * ShotLab — Strokes Gained (Broadie Baseline) & 2D "DECADE" Dispersion Engine.
 *
 * Computes per-shot Strokes Gained (Off-the-Tee & Approach) from BLP 1-dot flight outputs
 * (carry, total, offline) and computes 2D dispersion ellipses (1-sigma & 80% confidence),
 * DECADE aim offsets, and root-cause stroke-leak rankings across stored swing patterns.
 */
'use strict';

// Broadie-calibrated PGA Tour expected strokes to hole out by distance (yards)
const PGA_FAIRWAY = [
  [10, 2.18], [20, 2.40], [30, 2.52], [40, 2.60], [50, 2.66],
  [75, 2.75], [100, 2.80], [125, 2.86], [150, 2.98], [175, 3.08],
  [200, 3.19], [225, 3.32], [250, 3.45], [275, 3.58], [300, 3.71],
  [350, 3.88], [400, 3.99], [450, 4.17], [500, 4.41],
];

const PGA_ROUGH = [
  [10, 2.34], [20, 2.59], [30, 2.74], [40, 2.83], [50, 2.90],
  [75, 3.01], [100, 3.08], [125, 3.15], [150, 3.23], [175, 3.34],
  [200, 3.46], [225, 3.60], [250, 3.74], [300, 3.95], [400, 4.22],
];

const PGA_RECOVERY = [
  [30, 3.25], [75, 3.45], [125, 3.65], [175, 3.80], [250, 3.98], [350, 4.25],
];

// Putting expected strokes by distance (feet)
const PGA_GREEN_FT = [
  [2, 1.01], [4, 1.13], [6, 1.34], [8, 1.50], [10, 1.61],
  [15, 1.78], [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.21],
];

// Tier baseline offset (strokes per shot relative to PGA Tour so 5-HCP & Scratch are meaningful)
const TIER_SG_OFFSET = {
  scratch: 0.04,
  low_hcp: 0.14,
  mid_hcp: 0.30,
  personal: 0.14,
};

function interp(table, x) {
  if (!Number.isFinite(x)) return table[table.length - 1][1];
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i += 1) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) {
      const t = (x - x0) / Math.max(1e-6, x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  const [xA, yA] = table[table.length - 2];
  const [xB, yB] = table[table.length - 1];
  const slope = (yB - yA) / Math.max(1e-6, xB - xA);
  return yB + slope * (x - xB);
}

function expectedStrokes(lie, distYds) {
  const d = Math.max(0, Number(distYds) || 0);
  if (lie === 'green') {
    return interp(PGA_GREEN_FT, d * 3);
  }
  if (lie === 'rough') return interp(PGA_ROUGH, d);
  if (lie === 'recovery') return interp(PGA_RECOVERY, d);
  return interp(PGA_FAIRWAY, d);
}

/**
 * Compute Strokes Gained for a single shot.
 *
 * - Driver / 3W / 5W -> SG: Off-the-Tee (benchmark Par 4 hole sized to club)
 * - Hybrids / Irons / Wedges -> SG: Approach (target pin = club's expected carry)
 */
function computeShotStrokesGained({
  clubSpec,
  carryYds,
  totalYds,
  offlineYds,
  targetCarryYds = null,
  tierId = 'low_hcp',
  practiceMode = 'real',
}) {
  if (practiceMode === 'almost' || practiceMode === 'sore') {
    return {
      sg: null,
      sgPga: null,
      category: clubSpec && (clubSpec.category === 'driver' || clubSpec.category === 'wood') ? 'OTT' : 'APP',
      resultLie: 'practice',
      targetCarryYds: null,
      proximityYds: null,
      explanation: 'Strokes Gained paused in Quiet / Foam-Ball mode (carry & spin are not real-ball calibrated).',
    };
  }

  const carry = Number(carryYds);
  const total = Number.isFinite(Number(totalYds)) && Number(totalYds) > 0 ? Number(totalYds) : carry;
  const offline = Number.isFinite(Number(offlineYds)) ? Number(offlineYds) : 0;
  if (!Number.isFinite(carry) || carry <= 5 || !clubSpec) {
    return {
      sg: null,
      sgPga: null,
      category: 'APP',
      resultLie: 'unknown',
      targetCarryYds: null,
      proximityYds: null,
      explanation: 'Insufficient carry data for Strokes Gained.',
    };
  }

  const safeTier = String(tierId || 'low_hcp');
  const offset = TIER_SG_OFFSET[safeTier] ?? TIER_SG_OFFSET.low_hcp;
  const isTeeClub = clubSpec.category === 'driver' || clubSpec.category === 'wood';

  if (isTeeClub) {
    const holeLen = clubSpec.category === 'driver' ? 410 : 375;
    const expectedBefore = expectedStrokes('fairway', holeLen);
    const absOff = Math.abs(offline);
    let resultLie = 'fairway';
    let penalty = 0;

    if (absOff > 48) {
      resultLie = 'penalty';
      penalty = 1.0; // OB / hazard drop
    } else if (absOff > 30) {
      resultLie = 'recovery';
    } else if (absOff > 16) {
      resultLie = 'rough';
    }

    const forwardYds = Math.max(0, total);
    const remYds = resultLie === 'penalty'
      ? Math.max(140, holeLen - Math.min(forwardYds * 0.65, holeLen - 140))
      : Math.max(15, holeLen - forwardYds);
    const lieAfter = resultLie === 'penalty' ? 'rough' : resultLie;
    const expectedAfter = expectedStrokes(lieAfter, remYds) + penalty;

    const sgPga = expectedBefore - expectedAfter - 1.0;
    const sgTier = sgPga + offset;
    return {
      sg: Math.round(sgTier * 100) / 100,
      sgPga: Math.round(sgPga * 100) / 100,
      category: 'OTT',
      resultLie,
      targetCarryYds: holeLen,
      proximityYds: Math.round(remYds),
      explanation: `${Math.round(total)}y total (${Math.abs(offline).toFixed(0)}y offline -> ${resultLie}, ${Math.round(remYds)}y left): ${sgTier >= 0 ? '+' : ''}${sgTier.toFixed(2)} SG vs ${safeTier.replace('_', ' ')} (${sgPga >= 0 ? '+' : ''}${sgPga.toFixed(2)} vs PGA).`,
    };
  }

  // Approach shot: target pin at club's calibrated/nominal carry
  const fallbackTarget = clubSpec.speedRatio
    ? Math.round(clubSpec.speedRatio * 235)
    : Math.max(60, carry);
  const target = targetCarryYds !== null && targetCarryYds !== undefined && Number.isFinite(Number(targetCarryYds)) && Number(targetCarryYds) > 20
    ? Number(targetCarryYds)
    : fallbackTarget;
  const expectedBefore = expectedStrokes('fairway', target);
  const shortLong = carry - target;
  const proxYds = Math.hypot(shortLong, offline);

  // Realistic green radius scales slightly with approach distance (10y wedge .. 13y long iron)
  const greenRadiusYds = target <= 115 ? 10 : target <= 165 ? 11.5 : 13;
  let resultLie = 'green';
  let expectedAfter;

  if (proxYds <= greenRadiusYds) {
    resultLie = 'green';
    expectedAfter = expectedStrokes('green', proxYds);
  } else if (proxYds <= 30) {
    resultLie = 'rough';
    expectedAfter = expectedStrokes('rough', proxYds);
  } else {
    resultLie = 'recovery';
    expectedAfter = expectedStrokes('recovery', proxYds);
  }

  const sgPga = expectedBefore - expectedAfter - 1.0;
  const sgTier = sgPga + offset;
  return {
    sg: Math.round(sgTier * 100) / 100,
    sgPga: Math.round(sgPga * 100) / 100,
    category: 'APP',
    resultLie,
    targetCarryYds: Math.round(target),
    proximityYds: Math.round(proxYds * 10) / 10,
    explanation: `Target ${Math.round(target)}y -> ${proxYds.toFixed(1)}y prox (${resultLie}): ${sgTier >= 0 ? '+' : ''}${sgTier.toFixed(2)} SG vs ${safeTier.replace('_', ' ')} (${sgPga >= 0 ? '+' : ''}${sgPga.toFixed(2)} vs PGA).`,
  };
}

/**
 * Compute 2D Dispersion Ellipse (1-sigma + 80% confidence), DECADE Aim Recommendation,
 * and Root-Cause Stroke Leaks across a list of shots (from SQLite DB or current session).
 */
function computeDispersionStats(shots = [], { club = null } = {}) {
  const valid = (shots || []).filter(
    (s) => Number.isFinite(s.carry_yds ?? s.carryYds) && Number.isFinite(s.offline_yds ?? s.offlineYds)
  );
  const n = valid.length;
  if (n === 0) {
    return {
      club,
      n: 0,
      meanCarry: null,
      meanOffline: null,
      stdCarry: null,
      stdOffline: null,
      ellipse80: null,
      avgSg: null,
      totalSg: null,
      avgScore: null,
      decadeAdvice: 'Hit 5+ real-ball shots with this club to unlock your 80% DECADE dispersion ellipse & aim offset.',
      faultLeaks: [],
      strikeCounts: {},
      points: [],
    };
  }

  const xs = valid.map((s) => Number(s.offline_yds ?? s.offlineYds));
  const ys = valid.map((s) => Number(s.carry_yds ?? s.carryYds));
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  const denom = Math.max(1, n - 1);
  let varX = 0;
  let varY = 0;
  let covXY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    varX += dx * dx;
    varY += dy * dy;
    covXY += dx * dy;
  }
  varX /= denom;
  varY /= denom;
  covXY /= denom;

  const stdX = Math.sqrt(Math.max(0, varX));
  const stdY = Math.sqrt(Math.max(0, varY));

  // 2D principal-axis eigenvalues for rotated 80% confidence ellipse (chi2(2, 0.80) = 3.2189)
  const chi80 = Math.sqrt(3.2189);
  const trace = varX + varY;
  const det = Math.max(0, varX * varY - covXY * covXY);
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - det));
  const lam1 = Math.max(0.25, trace / 2 + disc);
  const lam2 = Math.max(0.25, trace / 2 - disc);
  const angleRad = Math.abs(covXY) < 1e-6 && Math.abs(varX - varY) < 1e-6
    ? 0
    : 0.5 * Math.atan2(2 * covXY, varX - varY);
  const angleDeg = (angleRad * 180) / Math.PI;

  const rx80 = Math.sqrt(lam1) * chi80;
  const ry80 = Math.sqrt(lam2) * chi80;
  const width80 = Math.round(stdX * chi80 * 2 * 10) / 10;
  const depth80 = Math.round(stdY * chi80 * 2 * 10) / 10;

  // SG & Score aggregates
  const sgVals = valid.map((s) => s.sg_shot ?? s.sg).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const totalSg = sgVals.length ? Math.round(sgVals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  const avgSg = sgVals.length ? Math.round((totalSg / sgVals.length) * 100) / 100 : null;

  const scores = valid.map((s) => s.score).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  // DECADE Aim Advisor
  let decadeAdvice;
  if (n < 4) {
    decadeAdvice = `Sample size is ${n} shot${n === 1 ? '' : 's'} — hit ${5 - n} more to lock your reliable 80% dispersion center.`;
  } else if (Math.abs(meanX) >= 3.5) {
    const missDir = meanX < 0 ? 'left' : 'right';
    const aimDir = meanX < 0 ? 'right' : 'left';
    const aimYds = Math.round(Math.abs(meanX));
    decadeAdvice = `Your 80% pattern is ${Math.round(width80)}y wide × ${Math.round(depth80)}y deep, centered ${Math.abs(meanX).toFixed(1)}y ${missDir}. Aim ${aimYds}y ${aimDir} of target to center your miss cone.`;
  } else {
    decadeAdvice = `Well-centered pattern (${Math.round(width80)}y wide × ${Math.round(depth80)}y deep, bias ${Math.abs(meanX).toFixed(1)}y). Play to the center of the green and manage your ${Math.round(depth80)}y depth window.`;
  }

  // Root-Cause Stroke Leak ranking by delivery fault
  const byFault = new Map();
  const strikeCounts = {};
  for (const s of valid) {
    const fId = s.delivery_id || s.deliveryId || 'unknown';
    const fName = s.delivery_name || s.deliveryName || fId;
    if (!byFault.has(fId)) {
      byFault.set(fId, { deliveryId: fId, deliveryName: fName, count: 0, sgSum: 0, sgCount: 0, lostCarrySum: 0 });
    }
    const g = byFault.get(fId);
    g.count += 1;
    const sgv = s.sg_shot ?? s.sg;
    if (typeof sgv === 'number' && Number.isFinite(sgv)) {
      g.sgSum += sgv;
      g.sgCount += 1;
    }
    const lost = s.left_on_table_yds ?? s.leftOnTableYds ?? 0;
    if (Number.isFinite(lost)) g.lostCarrySum += lost;

    const loc = s.strike_location || s.strikeLocation || 'center';
    strikeCounts[loc] = (strikeCounts[loc] || 0) + 1;
  }

  const faultLeaks = [...byFault.values()]
    .map((g) => ({
      deliveryId: g.deliveryId,
      deliveryName: g.deliveryName,
      count: g.count,
      pct: Math.round((g.count / n) * 100),
      avgSg: g.sgCount ? Math.round((g.sgSum / g.sgCount) * 100) / 100 : null,
      totalSg: g.sgCount ? Math.round(g.sgSum * 100) / 100 : null,
      avgLostYds: Math.round((g.lostCarrySum / g.count) * 10) / 10,
    }))
    .sort((a, b) => ((a.totalSg ?? 0) - (b.totalSg ?? 0)) || (b.count - a.count));

  const points = valid.slice(0, 120).map((s) => ({
    id: s.id,
    ts: s.ts,
    club: s.club,
    offlineYds: Math.round(Number(s.offline_yds ?? s.offlineYds) * 10) / 10,
    carryYds: Math.round(Number(s.carry_yds ?? s.carryYds) * 10) / 10,
    score: s.score ?? null,
    sg: s.sg_shot ?? s.sg ?? null,
    deliveryName: s.delivery_name || s.deliveryName || '',
    shotShape: s.shot_shape || s.shotShape || '',
    feelId: s.feel_id || s.feelId || null,
  }));

  return {
    club,
    n,
    meanCarry: Math.round(meanY * 10) / 10,
    meanOffline: Math.round(meanX * 10) / 10,
    stdCarry: Math.round(stdY * 10) / 10,
    stdOffline: Math.round(stdX * 10) / 10,
    ellipse80: n >= 2 ? {
      cx: Math.round(meanX * 10) / 10,
      cy: Math.round(meanY * 10) / 10,
      rx: Math.round(rx80 * 10) / 10,
      ry: Math.round(ry80 * 10) / 10,
      angleDeg: Math.round(angleDeg * 10) / 10,
      widthYds: width80,
      depthYds: depth80,
    } : null,
    avgSg,
    totalSg,
    avgScore,
    decadeAdvice,
    faultLeaks,
    strikeCounts,
    points,
  };
}

module.exports = {
  expectedStrokes,
  computeShotStrokesGained,
  computeDispersionStats,
};
