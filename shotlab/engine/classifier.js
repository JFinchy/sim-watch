/**
 * ShotLab — Bayesian Multivariate Gaussian Club Auto-Detector + Online Calibration Loop.
 *
 * Uses ball speed, vertical launch angle, backspin, launch-to-speed ratio, and (when present)
 * club head speed + angle of attack + estimated dynamic loft to classify the club hit.
 *
 * Online calibration (Empirical Bayes shrinkage):
 *   Every time the golfer clicks "Confirm" or "Actually hit [Club]", ShotLab updates the
 *   player's personal per-club feature distributions and tracks rolling accuracy toward
 *   the 90%+ auto-switch target.
 */
'use strict';

const { CLUB_ORDER, CLUB_SPECS, normalizeClubCode, clubDistance } = require('./constants');

const FEATURES = [
  { key: 'ballSpeed', label: 'Ball Speed', unit: 'mph', weight: 1.25 },
  { key: 'vla', label: 'Vertical Launch', unit: '°', weight: 1.15 },
  { key: 'backSpin', label: 'Backspin', unit: 'rpm', weight: 1.05 },
  { key: 'vlaSpeedRatio', label: 'Launch / Speed Ratio', unit: '°/100mph', weight: 0.65 },
  { key: 'clubSpeed', label: 'Club Speed', unit: 'mph', weight: 2.65, clubOnly: true },
  { key: 'aoa', label: 'Angle of Attack', unit: '°', weight: 0.95, clubOnly: true },
  { key: 'estDynLoft', label: 'Est. Dynamic Loft', unit: '°', weight: 0.70, clubOnly: true },
];

function createEmptyCalibration(driverSpeedMph = 98) {
  return {
    version: 1,
    driverSpeedMph,
    bagClubs: [...CLUB_ORDER],
    customLofts: {},
    clubs: {},          // { '7I': { n, features: { ballSpeed: { mean, m2 }, ... } } }
    history: [],        // [{ ts, predicted, actual, confidence, exact, withinOne }]
    autoSwitch: {
      enabled: false,
      minConfidence: 0.90,
      onlyInRange: false,
    },
  };
}

function toNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the feature vector from a normalized shot object.
 */
function extractFeatures(shot) {
  const ball = shot.ball || {};
  const cd = shot.club_data || {};
  const ballSpeedRaw = toNum(ball.speed);
  const ballSpeed = ballSpeedRaw !== null && ballSpeedRaw > 0 ? ballSpeedRaw : null;
  const vla = toNum(ball.vla);
  const totalSpin = toNum(ball.spin);
  const spinAxis = toNum(ball.spin_axis) ?? 0;
  const explicitBackSpin = toNum(ball.back_spin);
  let backSpin = null;
  if (explicitBackSpin !== null && explicitBackSpin > 0) {
    backSpin = explicitBackSpin;
  } else if (totalSpin !== null && totalSpin > 0) {
    backSpin = Math.abs(totalSpin * Math.cos((spinAxis * Math.PI) / 180));
  }

  const csRaw = cd ? toNum(cd.speed) : null;
  const clubSpeed = csRaw !== null && csRaw > 20 ? csRaw : null;
  const aoa = cd ? toNum(cd.aoa) : null;

  const vlaSpeedRatio = ballSpeed !== null && ballSpeed > 20 && vla !== null
    ? (vla / ballSpeed) * 100
    : null;

  // Generic dynamic loft estimate (loftFactor ~ 0.82) for club separation
  const estDynLoft = vla !== null && aoa !== null
    ? (vla - 0.18 * aoa) / 0.82
    : null;

  return {
    ballSpeed,
    vla,
    backSpin,
    vlaSpeedRatio,
    clubSpeed,
    aoa,
    estDynLoft,
  };
}

/**
 * Compute prior Gaussian { mean, std } for a club given the player's baseline Driver speed.
 */
function priorForClub(clubCode, driverSpeedMph = 98) {
  const spec = CLUB_SPECS[clubCode];
  const expectedClubSpeed = driverSpeedMph * spec.speedRatio;
  // Use slightly below ideal smash for realistic average amateur strike
  const typicalSmash = spec.smash.ideal - 0.025;
  const expectedBallSpeed = expectedClubSpeed * typicalSmash;
  const expectedVla = spec.vla.ideal;
  const expectedSpin = spec.spin.ideal;
  const expectedAoa = spec.aoa.ideal;
  const expectedRatio = (expectedVla / Math.max(40, expectedBallSpeed)) * 100;
  const expectedDynLoft = (expectedVla - 0.18 * expectedAoa) / 0.82;

  return {
    ballSpeed: { mean: expectedBallSpeed, std: Math.max(4.5, expectedBallSpeed * 0.045) },
    vla: { mean: expectedVla, std: Math.max(1.7, spec.vla.std) },
    backSpin: { mean: expectedSpin, std: Math.max(550, spec.spin.std * 1.15) },
    vlaSpeedRatio: { mean: expectedRatio, std: Math.max(1.8, expectedRatio * 0.11) },
    clubSpeed: { mean: expectedClubSpeed, std: Math.max(2.6, expectedClubSpeed * 0.032) },
    aoa: { mean: expectedAoa, std: Math.max(1.6, spec.aoa.std) },
    estDynLoft: { mean: expectedDynLoft, std: 2.3 },
  };
}

/**
 * Blend prior distribution with player's confirmed shots using Empirical Bayes shrinkage.
 * After ~3-5 confirmed shots on a club, the player's actual numbers dominate while keeping
 * safe variance floors so outlier miss-hits don't break classification.
 */
function posteriorForClub(clubCode, calibration) {
  const driverSpeed = (calibration && calibration.driverSpeedMph) || 98;
  const prior = priorForClub(clubCode, driverSpeed);
  const learned = calibration && calibration.clubs && calibration.clubs[clubCode];
  if (!learned || !learned.n) {
    return { dist: prior, samples: 0, calibrated: false };
  }

  const n = learned.n;
  const priorStrength = 2.5; // equivalent sample weight of the prior
  const out = {};

  for (const f of FEATURES) {
    const p = prior[f.key];
    const lf = learned.features && learned.features[f.key];
    if (lf && lf.n >= 1 && Number.isFinite(lf.mean)) {
      const wf = lf.n / (lf.n + priorStrength);
      const mean = wf * lf.mean + (1 - wf) * p.mean;
      const sampleVar = lf.n >= 2 ? lf.m2 / (lf.n - 1) : p.std * p.std;
      const priorVar = p.std * p.std;
      // Variance shrinkage with realistic floor (58% of prior std) to survive miss-hits
      const blendedVar = wf * sampleVar + (1 - wf) * priorVar;
      const std = Math.max(p.std * 0.58, Math.sqrt(blendedVar));
      out[f.key] = { mean, std };
    } else {
      out[f.key] = p;
    }
  }

  return { dist: out, samples: n, calibrated: n >= 3 };
}

function gaussianLogPdf(x, mean, std) {
  const z = (x - mean) / Math.max(1e-6, std);
  // Huber-like soft tail clamp beyond 4.5 sigma so one freak miss-hit metric (e.g. topped spin)
  // doesn't completely nuke an otherwise obvious club match
  const zClamped = Math.abs(z) <= 4.5 ? z : Math.sign(z) * (4.5 + Math.log1p(Math.abs(z) - 4.5));
  return {
    logPdf: -Math.log(std) - 0.5 * zClamped * zClamped,
    z,
  };
}

function matchQualityLabel(absZ) {
  if (absZ <= 0.65) return { label: 'Bullseye', grade: 'green' };
  if (absZ <= 1.35) return { label: 'Strong match', grade: 'green' };
  if (absZ <= 2.15) return { label: 'Plausible', grade: 'yellow' };
  return { label: 'Outlier', grade: 'red' };
}

/**
 * Predict the club used for a shot with confidence scores and explainable per-feature voting.
 */
function classifyClub(shot, calibration = null, options = {}) {
  const cal = calibration || createEmptyCalibration();
  const rawBag = Array.isArray(cal.bagClubs) && cal.bagClubs.length ? cal.bagClubs : CLUB_ORDER;
  const validBag = rawBag.filter((c) => Boolean(CLUB_SPECS[c]));
  const bag = validBag.length ? validBag : CLUB_ORDER;
  const feats = extractFeatures(shot);

  // Recent clubs (newest first) for Session Markov Stickiness + Partial-Swing Guard
  const recentClubs = Array.isArray(options.recentClubs)
    ? options.recentClubs.map(normalizeClubCode).filter((c) => c && CLUB_SPECS[c])
    : [];
  const lastClub = recentClubs[0] || null;
  let lastClubStreak = 0;
  if (lastClub) {
    for (const c of recentClubs) {
      if (c === lastClub) lastClubStreak += 1;
      else break;
    }
  }

  // Kids-Asleep ("Almost Golf Ball") mode: foam balls distort ballSpeed/VLA/spin,
  // so restrict classification to club-only metrics (clubSpeed, aoa) and don't treat full swings as putts.
  const isAlmost = options.practiceMode === 'almost';

  // Detect putts / tiny chips before running full-swing Gaussian classifier
  const isFullAlmostClubSpeed = isAlmost && feats.clubSpeed !== null && feats.clubSpeed >= 55;
  const isPuttLike = !isFullAlmostClubSpeed && feats.ballSpeed !== null && (
    feats.ballSpeed < 28 ||
    (feats.vla !== null && feats.vla < 4.0 && feats.ballSpeed < 55)
  );
  if (isPuttLike) {
    return {
      predictedClub: null,
      predictedLabel: null,
      confidence: 0,
      confidencePct: 0,
      isPartialOrShortGame: true,
      isPartialSwing: false,
      partialSpeedPct: null,
      markovBoostClub: null,
      shotCategory: 'putt',
      top3: [],
      featuresUsed: [],
      factorBreakdown: [],
      summary: 'Putt / ground roll detected — full-swing club detection skipped.',
    };
  }

  // Determine which features are available for this shot
  const activeFeatures = FEATURES.filter((f) => {
    if (feats[f.key] === null) return false;
    if (isAlmost) return f.key === 'clubSpeed' || f.key === 'aoa';
    return true;
  });
  if (!activeFeatures.length) {
    return {
      predictedClub: null,
      predictedLabel: null,
      confidence: 0,
      confidencePct: 0,
      isPartialOrShortGame: false,
      isPartialSwing: false,
      partialSpeedPct: null,
      markovBoostClub: null,
      shotCategory: 'unknown',
      top3: [],
      featuresUsed: [],
      factorBreakdown: [],
      summary: 'Insufficient launch data to classify club.',
    };
  }

  // Normalize total weight so log-likelihood temperature stays consistent whether club data is present or not
  const totalWeight = activeFeatures.reduce((s, f) => s + f.weight, 0);
  const tempScale = 4.8 / Math.max(1, totalWeight);

  // Partial / Knockdown Swing Guard:
  // If the golfer has been hitting `lastClub` and takes an intentional 3/4 or flighted swing
  // (68%–90.5% of expected full clubSpeed for lastClub, while launch/spin/AoA remain compatible
  // with `lastClub` — i.e., not a switch from Driver to an iron/wood/hybrid), flag isPartialSwing!
  let isPartialSwing = false;
  let partialSpeedPct = null;
  if (lastClub && CLUB_SPECS[lastClub] && feats.clubSpeed !== null) {
    const lastPost = posteriorForClub(lastClub, cal);
    const expLastCS = lastPost.dist.clubSpeed.mean;
    const speedRatio = feats.clubSpeed / Math.max(1, expLastCS);
    const vlaContradicts = !isAlmost && feats.vla !== null && feats.vla > lastPost.dist.vla.mean + 2.5;
    const spinContradicts = !isAlmost && feats.backSpin !== null && feats.backSpin > lastPost.dist.backSpin.mean + 1400;
    const driverContradicts = lastClub === 'DR' && (
      (feats.aoa !== null && feats.aoa < -0.5) ||
      (!isAlmost && feats.backSpin !== null && feats.backSpin > 3600)
    );
    if (speedRatio >= 0.68 && speedRatio <= 0.905 && !vlaContradicts && !spinContradicts && !driverContradicts) {
      isPartialSwing = true;
      partialSpeedPct = Math.round(speedRatio * 100);
    }
  }

  // Markov prior bonus for club stickiness during block practice (capped so a true club switch still wins)
  const markovBonus = lastClubStreak >= 3 ? 1.15 : lastClubStreak === 2 ? 0.85 : lastClubStreak === 1 ? 0.45 : 0;

  const scored = [];
  for (const clubCode of bag) {
    const { dist, samples, calibrated } = posteriorForClub(clubCode, cal);
    let score = 0;
    const factors = [];

    for (const f of activeFeatures) {
      const val = feats[f.key];
      const { mean, std } = dist[f.key];
      const { logPdf, z } = gaussianLogPdf(val, mean, std);
      const contrib = f.weight * tempScale * logPdf;
      score += contrib;
      const qual = matchQualityLabel(Math.abs(z));
      factors.push({
        key: f.key,
        label: f.label,
        unit: f.unit,
        actual: Math.round(val * 10) / 10,
        expected: Math.round(mean * 10) / 10,
        rangeLow: Math.round((mean - 1.3 * std) * 10) / 10,
        rangeHigh: Math.round((mean + 1.3 * std) * 10) / 10,
        zScore: Math.round(z * 100) / 100,
        match: qual.label,
        grade: qual.grade,
        weight: f.weight,
      });
    }

    const clubMeanAbsZ = factors.reduce((s, f) => s + Math.abs(f.zScore) * f.weight, 0) / Math.max(1e-6, totalWeight);
    let appliedMarkov = 0;
    if (clubCode === lastClub && markovBonus > 0 && (clubMeanAbsZ <= 2.4 || isPartialSwing)) {
      appliedMarkov = isPartialSwing ? markovBonus + 0.6 : markovBonus;
      score += appliedMarkov;
    }

    scored.push({
      club: clubCode,
      label: CLUB_SPECS[clubCode].label,
      score,
      appliedMarkov,
      samples,
      calibrated,
      factors,
    });
  }

  // Softmax to probabilities
  const maxScore = Math.max(...scored.map((s) => s.score));
  let sumExp = 0;
  for (const s of scored) {
    s.exp = Math.exp(Math.max(-40, s.score - maxScore));
    sumExp += s.exp;
  }
  for (const s of scored) {
    s.probability = sumExp > 0 ? s.exp / sumExp : 0;
    s.confidencePct = Math.round(s.probability * 1000) / 10;
  }

  scored.sort((a, b) => b.probability - a.probability);
  // Partial-swing guard is decisive: the swing already passed the launch/spin/driver plausibility
  // checks for `lastClub`, and a knockdown inherently looks like a shorter club on speed and a
  // longer club on launch/loft, so the softmax alone can't be trusted to hold the club.
  if (isPartialSwing) {
    const holdIdx = scored.findIndex((s) => s.club === lastClub);
    if (holdIdx > 0) scored.unshift(scored.splice(holdIdx, 1)[0]);
    else if (holdIdx < 0) { isPartialSwing = false; partialSpeedPct = null; } // lastClub not in bag
  }
  const top = scored[0];
  const runnerUp = scored[1] || null;

  // Out-of-distribution (OOD) check: chips, pitches, and partial knockdowns can otherwise get
  // 95%+ softmax confidence on LW simply because LW is the slowest club in the bag.
  const meanAbsZ = top.factors.reduce((sum, f) => sum + Math.abs(f.zScore) * f.weight, 0) / Math.max(1e-6, totalWeight);
  const isChipOrPitch = !isAlmost && feats.ballSpeed !== null && feats.ballSpeed < 52;
  const isOodPartial = isChipOrPitch || isPartialSwing || meanAbsZ >= 2.75;

  let finalProb = top.probability;
  if (isChipOrPitch) {
    finalProb = Math.min(finalProb, 0.45);
  } else if (isPartialSwing) {
    finalProb = Math.min(finalProb, 0.78);
  } else if (isOodPartial) {
    finalProb = Math.min(finalProb, 0.62);
  }
  const finalConfPct = Math.round(finalProb * 1000) / 10;

  const top3 = scored.slice(0, 3).map((s, idx) => ({
    club: s.club,
    label: s.label,
    probability: Math.round((idx === 0 ? finalProb : s.probability) * 1000) / 1000,
    confidencePct: idx === 0 ? finalConfPct : s.confidencePct,
    calibrated: s.calibrated,
    samples: s.samples,
  }));

  // Explain why top beat runner-up
  const decisive = [...top.factors]
    .sort((a, b) => Math.abs(a.zScore) - Math.abs(b.zScore))
    .slice(0, 3)
    .map((f) => `${f.label} (${f.actual}${f.unit} vs ${f.expected}${f.unit})`)
    .join(', ');

  const oodNote = isChipOrPitch
    ? ' Short chip/pitch detected — confidence capped.'
    : isPartialSwing
      ? ` Partial / knockdown swing (~${partialSpeedPct}% ${CLUB_SPECS[lastClub].label} speed) — club held steady, auto-switch paused.`
      : isOodPartial
        ? ' Partial/off-profile swing — confidence capped.'
        : '';

  const markovNote = top.appliedMarkov > 0 && !isPartialSwing
    ? ` (Markov stickiness: ${lastClubStreak} recent ${top.label})`
    : '';

  const summary = isPartialSwing
    ? `Held ${top.label}: partial / knockdown swing (~${partialSpeedPct}% of full ${top.label} speed) — auto-switch paused.`
      + (runnerUp && runnerUp.probability > top.probability ? ` Raw full-swing fit favored ${runnerUp.label} (${runnerUp.confidencePct.toFixed(0)}%).` : '')
    : (runnerUp
    ? `Predicted ${top.label} (${finalConfPct.toFixed(0)}% vs ${runnerUp.label} ${runnerUp.confidencePct.toFixed(0)}%) driven by ${decisive}${markovNote}.`
    : `Predicted ${top.label} (${finalConfPct.toFixed(0)}%) driven by ${decisive}${markovNote}.`) + oodNote;

  return {
    predictedClub: top.club,
    predictedLabel: top.label,
    confidence: Math.round(finalProb * 1000) / 1000,
    confidencePct: finalConfPct,
    isPartialOrShortGame: isOodPartial,
    isPartialSwing,
    partialSpeedPct,
    markovBoostClub: top.appliedMarkov > 0 ? top.club : null,
    shotCategory: isChipOrPitch ? 'chip' : isPartialSwing ? 'partial' : isOodPartial ? 'partial' : 'full',
    calibrated: top.calibrated,
    clubSamples: top.samples,
    top3,
    featuresUsed: activeFeatures.map((f) => f.key),
    factorBreakdown: top.factors,
    summary,
  };
}

/**
 * Record user ground-truth confirmation ("Confirm" or "Actually hit X") and update
 * the player's Empirical Bayes personal club model using Welford's online algorithm.
 */
function recordConfirmation(calibration, shot, actualClubRaw, prediction = null) {
  const cal = calibration ? JSON.parse(JSON.stringify(calibration)) : createEmptyCalibration();
  const actualClub = normalizeClubCode(actualClubRaw);
  if (!actualClub || !CLUB_SPECS[actualClub]) return cal;

  const pred = prediction || classifyClub(shot, cal);
  const feats = extractFeatures(shot);

  // Guard full-swing calibration against partial swings / chips / putts polluting club stats
  const driverBase = cal.driverSpeedMph || 98;
  const expectedCS = driverBase * CLUB_SPECS[actualClub].speedRatio;
  const expectedBS = expectedCS * (CLUB_SPECS[actualClub].smash.ideal - 0.025);
  const isPartialShot =
    (feats.ballSpeed !== null && feats.ballSpeed < Math.max(45, expectedBS * 0.72)) ||
    (feats.clubSpeed !== null && feats.clubSpeed < expectedCS * 0.78);

  if (!isPartialShot) {
    if (!cal.clubs[actualClub]) {
      cal.clubs[actualClub] = { n: 0, features: {} };
    }
    const c = cal.clubs[actualClub];
    c.n += 1;

    for (const f of FEATURES) {
      const val = feats[f.key];
      if (val === null || !Number.isFinite(val)) continue;
      if (!c.features[f.key]) {
        c.features[f.key] = { n: 0, mean: 0, m2: 0 };
      }
      const st = c.features[f.key];
      st.n += 1;
      const delta = val - st.mean;
      st.mean += delta / st.n;
      const delta2 = val - st.mean;
      st.m2 += delta * delta2;
    }

    // Automatically refine the player's baseline Driver speed when full-swing club speed is confirmed
    if (feats.clubSpeed && feats.clubSpeed > 45) {
      const impliedDriver = feats.clubSpeed / CLUB_SPECS[actualClub].speedRatio;
      if (impliedDriver >= 65 && impliedDriver <= 135) {
        const alpha = actualClub === 'DR' ? 0.30 : 0.12;
        cal.driverSpeedMph = Math.round(((1 - alpha) * driverBase + alpha * impliedDriver) * 10) / 10;
      }
    }
  }

  const predictedClub = pred && pred.predictedClub ? pred.predictedClub : null;
  const exact = predictedClub === actualClub;
  const withinOne = predictedClub ? clubDistance(predictedClub, actualClub) <= 1 : false;

  cal.history.push({
    ts: shot.ts || new Date().toISOString(),
    predicted: predictedClub,
    actual: actualClub,
    confidence: pred ? pred.confidence : 0,
    exact,
    withinOne,
    partial: isPartialShot,
  });

  // Keep latest 500 confirmation entries
  if (cal.history.length > 500) {
    cal.history = cal.history.slice(-500);
  }

  return cal;
}

/**
 * Compute live accuracy statistics & 90% auto-switch readiness.
 */
function getCalibrationStats(calibration) {
  const cal = calibration || createEmptyCalibration();
  const hist = Array.isArray(cal.history) ? cal.history : [];
  const total = hist.length;
  const exactCount = hist.filter((h) => h.exact).length;
  const withinOneCount = hist.filter((h) => h.withinOne).length;

  // Rolling last-30 shots accuracy (shows progress after calibration warms up)
  const recent = hist.slice(-30);
  const recentExact = recent.length ? Math.round((recent.filter((h) => h.exact).length / recent.length) * 1000) / 10 : null;
  const recentWithinOne = recent.length ? Math.round((recent.filter((h) => h.withinOne).length / recent.length) * 1000) / 10 : null;

  const highConf = hist.filter((h) => (h.confidence || 0) >= 0.85);
  const highConfExact = highConf.length ? Math.round((highConf.filter((h) => h.exact).length / highConf.length) * 1000) / 10 : null;

  const calibratedClubs = Object.entries(cal.clubs || {})
    .filter(([, v]) => (v.n || 0) >= 3)
    .map(([k]) => k);

  const hasEnoughClubs = calibratedClubs.length >= 3;

  return {
    totalConfirmed: total,
    exactPct: total ? Math.round((exactCount / total) * 1000) / 10 : null,
    withinOnePct: total ? Math.round((withinOneCount / total) * 1000) / 10 : null,
    recentExactPct: recentExact,
    recentWithinOnePct: recentWithinOne,
    highConfExactPct: highConfExact,
    highConfCount: highConf.length,
    calibratedClubs,
    driverSpeedMph: cal.driverSpeedMph || 98,
    readyForAutoSwitch: hasEnoughClubs && (
      (recentExact !== null && recentExact >= 88 && total >= 12) ||
      (highConfExact !== null && highConfExact >= 90 && highConf.length >= 10)
    ),
  };
}

module.exports = {
  createEmptyCalibration,
  extractFeatures,
  priorForClub,
  posteriorForClub,
  classifyClub,
  recordConfirmation,
  getCalibrationStats,
};
