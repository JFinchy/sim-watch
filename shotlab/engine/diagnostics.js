/**
 * ShotLab — Coach Brain & Diagnostics Engine.
 *
 * Converts raw launch monitor metrics (Bushnell Launch Pro 1-dot club data + ball data)
 * into plain-English golfer insights with transparent hover rationales:
 *   1. D-Plane Face Estimation (Measured vs Estimated tagging)
 *   2. Shot Shape Classification (15+ named flight patterns + SVG parameters)
 *   3. Delivery & Release Fault Detection (Flipping Floater, Early Cast, Over-Hold, Compression, etc.)
 *   4. Face Strike / Miss-Hit Inference (Center, Toe, Heel, Thin, Fat, High Face + impact map coords)
 *   5. Low-Handicap Priority Scorecard (Red / Yellow / Green grades for every key metric)
 */
'use strict';

const { BENCHMARK_TIERS } = require('./constants');
const { posteriorForClub } = require('./classifier');

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmtSigned(n, digits = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const v = digits === 2 ? round2(n) : round1(n);
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

/**
 * 1. D-Plane Face-to-Target & Face-to-Path estimation.
 *
 * Bushnell Launch Pro (1-dot) natively measures Ball Data + Club Speed + Path + AoA,
 * NOT Face-to-Target (which requires 4-dot GCQuad).
 * Using TrackMan/Foresight D-Plane ball flight laws:
 *   HLA = w * Face + (1 - w) * Path  =>  Face = (HLA - (1 - w) * Path) / w
 * where w ≈ 0.85 (driver), 0.75 (mid-iron), 0.70 (wedge).
 *
 * We also compute the "Gear Effect Residual":
 *   actualSpinAxis - expectedSpinAxisFromDPlane
 * On drivers/woods/hybrids, a large draw/hook residual with low smash = TOE gear effect;
 * a large fade/slice residual with low smash = HEEL gear effect!
 */
function analyzeDPlane(metrics, clubSpec, handedness = 'RH') {
  const sign = handedness === 'LH' ? -1 : 1;
  // Normalize into RH-equivalent coordinates internally (+ = push/open/in-to-out, - = pull/closed/out-to-in)
  const hla = metrics.hla !== null ? metrics.hla * sign : null;
  const path = metrics.path !== null ? metrics.path * sign : null;
  const spinAxis = metrics.spinAxis !== null ? metrics.spinAxis * sign : null;
  const rawFace = metrics.rawFace !== null ? metrics.rawFace * sign : null;

  const w = clubSpec.faceWeight || 0.78;
  let face = null;
  let faceSource = 'estimated';
  let faceRationale = '';

  // Note: GameChanger sometimes sends 0.0 when BLP doesn't measure face.
  // Reject exact 0.0 unless both HLA and Path are near square.
  const hasExplicitFace = rawFace !== null && (
    Math.abs(rawFace) > 0.05 ||
    (hla !== null && Math.abs(hla) < 0.8 && (path === null || Math.abs(path) < 1.0))
  );

  if (hasExplicitFace) {
    face = rawFace;
    faceSource = 'connector';
    faceRationale = `Provided by GameChanger/OpenConnect (${fmtSigned(face * sign)}°). Note: 1-dot Launch Pro hardware does not optically measure face angle; connector values are derived estimates.`;
  } else if (hla !== null && path !== null) {
    face = (hla - (1 - w) * path) / w;
    faceSource = 'estimated';
    faceRationale = `Estimated via D-Plane law: Face ≈ (HLA ${fmtSigned(metrics.hla)}° − ${Math.round((1 - w) * 100)}% × Path ${fmtSigned(metrics.path)}°) / ${Math.round(w * 100)}% = ${fmtSigned(face * sign)}°.`;
  } else if (hla !== null) {
    face = hla / w;
    faceSource = 'estimated';
    faceRationale = `Estimated from Start Line (HLA ${fmtSigned(metrics.hla)}° / ${Math.round(w * 100)}%) since Club Path was unavailable.`;
  }

  const faceToPath = face !== null && path !== null ? face - path : null;

  // Expected D-Plane spin axis from Face-to-Path (approximate sensitivity: ~2.8° spin axis per 1° F2P on woods, ~2.1° on irons)
  const axisGain = clubSpec.category === 'driver' ? 2.8
    : (clubSpec.category === 'wood' || clubSpec.category === 'hybrid') ? 2.5
    : clubSpec.category === 'wedge' ? 1.5
    : 2.1;

  const expectedSpinAxis = faceToPath !== null ? clamp(faceToPath * axisGain, -35, 35) : null;
  const gearEffectResidual = (spinAxis !== null && expectedSpinAxis !== null)
    ? round1(spinAxis - expectedSpinAxis)
    : null;

  return {
    faceToTarget: face !== null ? round1(face * sign) : null,
    faceToPath: faceToPath !== null ? round1(faceToPath * sign) : null,
    faceSource,
    faceRationale,
    expectedSpinAxis: expectedSpinAxis !== null ? round1(expectedSpinAxis * sign) : null,
    gearEffectResidual: gearEffectResidual !== null ? round1(gearEffectResidual * sign) : null,
    // RH-normalized internals for downstream rules (+ = push/open/in-to-out/fade-slice, - = pull/closed/out-to-in/draw-hook)
    _rh: { hla, path, face, faceToPath, spinAxis, expectedSpinAxis, gearEffectResidual },
  };
}

/**
 * 2. Shot Shape Classifier (15+ named golf ball flight shapes + visual curve params + hover rationale).
 */
function classifyShotShape(metrics, flight, dplane, clubSpec, handedness = 'RH') {
  const isLH = handedness === 'LH';
  const sign = isLH ? -1 : 1;
  const pullSide = isLH ? 'right' : 'left';
  const pushSide = isLH ? 'left' : 'right';
  const drawFlow = isLH ? 'left-to-right' : 'right-to-left';
  const fadeFlow = isLH ? 'right-to-left' : 'left-to-right';

  // World-space numbers (exact values displayed to the golfer)
  const worldHla = metrics.hla || 0;
  const worldSpinAxis = metrics.spinAxis || 0;
  const worldCurve = flight.curveYds || 0;
  const worldOffline = flight.offlineYds || 0;

  // Handedness-normalized internals (- = pull/draw/hook side, + = push/fade/slice side)
  const hla = worldHla * sign;
  const spinAxis = worldSpinAxis * sign;
  const curve = worldCurve * sign;
  const offline = worldOffline * sign;
  const vla = metrics.vla || 0;

  // Start direction buckets (handedness-normalized: 'pull' | 'center' | 'push')
  let startRel = 'center';
  if (hla <= -1.6) startRel = 'pull';
  else if (hla >= 1.6) startRel = 'push';

  const worldStartDir = worldHla <= -1.6 ? 'left' : worldHla >= 1.6 ? 'right' : 'center';

  // Curve buckets (scale thresholds slightly by carry distance so a 130y wedge curving 9y counts cleanly)
  const carryScale = clamp((flight.carryYds || 160) / 200, 0.55, 1.25);
  const absCurve = Math.abs(curve);
  const absAxis = Math.abs(spinAxis);

  let curveType = 'straight';
  if (curve < 0) {
    if (absCurve >= 26 * carryScale || absAxis >= 18) curveType = 'snap_hook';
    else if (absCurve >= 14 * carryScale || absAxis >= 11) curveType = 'hook';
    else if (absCurve >= 4.5 * carryScale || absAxis >= 3.5) curveType = 'draw';
  } else {
    if (absCurve >= 26 * carryScale || absAxis >= 18) curveType = 'big_slice';
    else if (absCurve >= 14 * carryScale || absAxis >= 11) curveType = 'slice';
    else if (absCurve >= 4.5 * carryScale || absAxis >= 3.5) curveType = 'fade';
  }

  let name = 'Straight';
  let shortTag = 'STRAIGHT';
  let severity = 'green';
  let description = 'Starts on target and holds its line.';

  if (curveType === 'snap_hook') {
    if (startRel === 'pull' || vla < clubSpec.vla.min - 1.5) {
      name = 'Snap Hook';
      shortTag = 'SNAP HOOK';
      severity = 'red';
      description = `Violent ${pullSide}-curving hook (often low launch / shut face or severe toe gear effect).`;
    } else {
      name = 'Big Hook';
      shortTag = 'BIG HOOK';
      severity = 'red';
      description = `Heavy over-draw curving sharply ${pullSide} of target.`;
    }
  } else if (curveType === 'big_slice') {
    if (startRel === 'pull') {
      name = 'Pull Slice (Wipe)';
      shortTag = 'PULL SLICE';
      severity = 'red';
      description = `Starts ${pullSide} and peels sharply ${pushSide} — classic steep out-to-in glancing wipe.`;
    } else if (startRel === 'push') {
      name = 'Push Slice (Banana)';
      shortTag = 'PUSH SLICE';
      severity = 'red';
      description = `Starts ${pushSide} and curves hard ${pushSide} — double-cross open face relative to path.`;
    } else {
      name = 'Big Slice';
      shortTag = 'BIG SLICE';
      severity = 'red';
      description = `Severe ${pushSide}-curving slice bleeding carry distance and accuracy.`;
    }
  } else if (curveType === 'hook') {
    if (startRel === 'pull') {
      name = 'Pull Hook';
      shortTag = 'PULL HOOK';
      severity = 'red';
      description = `Starts ${pullSide} and keeps hooking ${pullSide} — face closed to both target and path.`;
    } else if (startRel === 'push') {
      name = 'Over-Draw / Push Hook';
      shortTag = 'PUSH HOOK';
      severity = 'yellow';
      description = `Starts ${pushSide} of target and hooks strongly back across the target line.`;
    } else {
      name = 'Hook';
      shortTag = 'HOOK';
      severity = 'red';
      description = `Starts near target and bends significantly ${pullSide}.`;
    }
  } else if (curveType === 'slice') {
    if (startRel === 'pull') {
      name = 'Pull Slice';
      shortTag = 'PULL SLICE';
      severity = 'red';
      description = `Starts ${pullSide} of target and curves heavily ${pushSide}.`;
    } else if (startRel === 'push') {
      name = 'Push Slice';
      shortTag = 'PUSH SLICE';
      severity = 'red';
      description = `Starts ${pushSide} and leaks further ${pushSide} — open face + weak spin axis.`;
    } else {
      name = 'Slice';
      shortTag = 'SLICE';
      severity = 'red';
      description = `Starts near target and bends heavily ${pushSide}.`;
    }
  } else if (curveType === 'draw') {
    if (startRel === 'push') {
      name = Math.abs(offline) <= 12 * carryScale ? 'Push Draw (Tour)' : 'Push Draw';
      shortTag = 'PUSH DRAW';
      severity = Math.abs(offline) <= 14 * carryScale ? 'green' : 'yellow';
      description = `Starts ${pushSide} of target and draws softly back toward the flag — ideal draw pattern.`;
    } else if (startRel === 'pull') {
      name = 'Pull Draw';
      shortTag = 'PULL DRAW';
      severity = 'yellow';
      description = `Starts ${pullSide} of target and draws further ${pullSide} — double miss ${pullSide}.`;
    } else {
      name = absCurve <= 9 * carryScale ? 'Baby Draw' : 'Straight Draw';
      shortTag = absCurve <= 9 * carryScale ? 'BABY DRAW' : 'DRAW';
      severity = Math.abs(offline) <= 12 * carryScale ? 'green' : 'yellow';
      description = `Starts on target line and works gently ${drawFlow}.`;
    }
  } else if (curveType === 'fade') {
    if (startRel === 'pull') {
      name = Math.abs(offline) <= 12 * carryScale ? 'Pull Fade (Power)' : 'Pull Fade';
      shortTag = 'PULL FADE';
      severity = Math.abs(offline) <= 14 * carryScale ? 'green' : 'yellow';
      description = `Starts slightly ${pullSide} and fades cleanly back onto the target line — controlled power fade.`;
    } else if (startRel === 'push') {
      name = 'Push Fade';
      shortTag = 'PUSH FADE';
      severity = 'yellow';
      description = `Starts ${pushSide} and drifts further ${pushSide} — check face control through impact.`;
    } else {
      name = absCurve <= 9 * carryScale ? 'Baby Fade' : 'Straight Fade';
      shortTag = absCurve <= 9 * carryScale ? 'BABY FADE' : 'FADE';
      severity = Math.abs(offline) <= 12 * carryScale ? 'green' : 'yellow';
      description = `Starts on target and falls gently ${fadeFlow}.`;
    }
  } else {
    // Straight curve
    if (startRel === 'pull') {
      name = 'Straight Pull';
      shortTag = 'PULL';
      severity = Math.abs(hla) >= 3.8 ? 'red' : 'yellow';
      description = `Ball flies straight with almost no curve, but starts ${pullSide} of target (path & face aligned ${pullSide}).`;
    } else if (startRel === 'push') {
      name = 'Block Push';
      shortTag = 'BLOCK PUSH';
      severity = Math.abs(hla) >= 3.8 ? 'red' : 'yellow';
      description = `Straight flight starting ${pushSide} of target — often from hanging back or holding the face open.`;
    } else {
      name = 'Pure Straight';
      shortTag = 'PURE STRAIGHT';
      severity = 'green';
      description = 'Starts right down the target line with minimal curve.';
    }
  }

  // Height window tag
  let heightTag = 'Optimal Height';
  if (clubSpec.category === 'driver' && vla >= 18.0) heightTag = 'Pop-Up / Sky';
  else if (vla > clubSpec.vla.max + 2.5 || flight.apexFt > 125) heightTag = 'High / Balloon';
  else if (vla < clubSpec.vla.min - 2.5 || (flight.apexFt < 52 && flight.carryYds > 110)) heightTag = 'Low / Stinger';

  const startStr = `${fmtSigned(worldHla)}° (${worldHla < -0.5 ? 'Left' : worldHla > 0.5 ? 'Right' : 'Center'})`;
  const axisStr = `${fmtSigned(worldSpinAxis)}° (${spinAxis < -1 ? 'Draw/Hook tilt' : spinAxis > 1 ? 'Fade/Slice tilt' : 'Neutral'})`;
  const curveStr = `${Math.abs(round1(worldCurve))} yds ${worldCurve < -0.5 ? 'Left' : worldCurve > 0.5 ? 'Right' : 'Straight'}`;

  const rationale = [
    `Start Line (HLA): ${startStr}`,
    `Spin Axis: ${axisStr} → Curve: ${curveStr}`,
    `Final Offline: ${Math.abs(round1(worldOffline))} yds ${worldOffline < -0.5 ? 'Left' : worldOffline > 0.5 ? 'Right' : 'On Line'}`,
    dplane.faceToPath !== null
      ? `Club Path ${fmtSigned(metrics.path)}° + Est. Face ${fmtSigned(dplane.faceToTarget)}° (F2P ${fmtSigned(dplane.faceToPath)}°)`
      : `Height profile: ${heightTag} (VLA ${metrics.vla !== null ? `${round1(vla)}°` : '—'}, Apex ${Math.round(flight.apexFt)} ft)`,
  ];

  return {
    name,
    shortTag,
    severity,
    heightTag,
    description,
    startDir: worldStartDir,
    curveType,
    curveYds: round1(worldCurve),
    offlineYds: round1(worldOffline),
    svgParams: {
      hlaDeg: round1(worldHla),
      curveYds: round1(worldCurve),
      offlineYds: round1(worldOffline),
      carryYds: round1(flight.carryYds || 0),
      severity,
    },
    rationale,
  };
}

/**
 * 3. Delivery & Release Fault Detector (Flipping / Casting / Over-Holding / Pure Compression).
 *
 * Uses TrackMan / Foresight vertical D-Plane:
 *   VLA ≈ loftFactor * DynamicLoft + (1 - loftFactor) * AoA
 *   => DynamicLoft ≈ (VLA - (1 - loftFactor) * AoA) / loftFactor
 *   => ShaftLean   = StaticLoft - DynamicLoft (+ = forward shaft lean / compression; - = flipping / added loft)
 *   => SpinLoft    = DynamicLoft - AoA
 */
function diagnoseDelivery(metrics, flight, dplane, clubSpec, calibration = null, handedness = 'RH', opts = {}) {
  const isLH = handedness === 'LH';
  const pullSide = isLH ? 'right' : 'left';
  const pushSide = isLH ? 'left' : 'right';
  const practiceMode = opts.practiceMode || 'real';
  const isPartialSwing = Boolean(opts.isPartialSwing);
  const partialSpeedPct = opts.partialSpeedPct || null;
  const { vla, aoa, path, backSpin, smash, clubSpeed } = metrics;
  const lf = clubSpec.loftFactor || 0.81;
  const isDriver = clubSpec.category === 'driver';
  const isWood = clubSpec.category === 'wood';
  const isIronOrWedge = !isDriver && !isWood;

  const effectiveAoa = aoa !== null ? aoa : clubSpec.aoa.ideal;
  const estDynamicLoft = vla !== null ? round1((vla - (1 - lf) * effectiveAoa) / lf) : null;
  const estShaftLean = estDynamicLoft !== null ? round1(clubSpec.staticLoft - estDynamicLoft) : null;
  const spinLoft = estDynamicLoft !== null ? round1(estDynamicLoft - effectiveAoa) : null;

  // Kids-Asleep / Almost Golf Balls Mode: foam-ball carry/spin/smash are invalid,
  // so diagnose strictly on 1-dot BLP metrics that remain accurate (Path, AoA, Start Line HLA, Est. Face).
  if (practiceMode === 'almost') {
    const rhQuiet = dplane._rh;
    const absHla = rhQuiet.hla !== null ? Math.abs(rhQuiet.hla) : null;
    const gatePass = absHla !== null && absHla <= 1.5;
    const ev = [
      rhQuiet.hla !== null ? `Start Line (HLA): ${fmtSigned(metrics.hla)}° (${gatePass ? 'INSIDE ±1.5° gate' : 'outside ±1.5° gate'})` : 'Start Line unavailable',
      path !== null ? `Club Path: ${fmtSigned(path)}°` : '',
      aoa !== null ? `Angle of Attack: ${fmtSigned(aoa)}° (target ${clubSpec.aoa.min} to ${clubSpec.aoa.max}°)` : '',
      dplane.faceToPath !== null ? `Est. Face-to-Path: ${fmtSigned(dplane.faceToPath)}°` : '',
      'Quiet Mode: foam-ball carry, ball speed & spin excluded from diagnosis.',
    ].filter(Boolean);

    if (rhQuiet.hla !== null && rhQuiet.hla >= 2.2 && (rhQuiet.faceToPath === null || rhQuiet.faceToPath >= 1.5)) {
      return {
        id: 'over_hold',
        name: 'Quiet Mode: Open Start / Over-Hold',
        severity: 'yellow',
        confidence: 0.82,
        tagline: `Ball started ${pushSide} of the ±1.5° gate with an open face — release the toe cleanly through impact.`,
        cues: ['Focus on start-line gate (±1.5° HLA)', 'Let forearms rotate smoothly through impact'],
        evidence: ev,
        estDynamicLoft: null,
        estShaftLean: null,
        spinLoft: null,
        alternates: [],
      };
    }
    if (rhQuiet.hla !== null && rhQuiet.hla <= -2.2 && (rhQuiet.faceToPath === null || rhQuiet.faceToPath <= -1.0)) {
      return {
        id: 'hooded_trap',
        name: 'Quiet Mode: Shut Face / Pull',
        severity: rhQuiet.hla <= -3.5 ? 'red' : 'yellow',
        confidence: 0.82,
        tagline: `Ball started ${pullSide} of the ±1.5° gate with a shut face — neutralize grip and keep chest rotating through impact.`,
        cues: ['Focus on start-line gate (±1.5° HLA)', 'Keep chest turning through impact so hands do not flip shut'],
        evidence: ev,
        estDynamicLoft: null,
        estShaftLean: null,
        spinLoft: null,
        alternates: [],
      };
    }
    if (rhQuiet.path !== null && rhQuiet.path <= -3.5) {
      return {
        id: 'steep_chop',
        name: 'Quiet Mode: Out-to-In Path',
        severity: 'yellow',
        confidence: 0.80,
        tagline: `Path swung ${Math.abs(rhQuiet.path).toFixed(1)}° out-to-in — shallow the shaft in transition.`,
        cues: ['Keep trail elbow in front of seam on downswing', 'Feel path swinging gently inside-out'],
        evidence: ev,
        estDynamicLoft: null,
        estShaftLean: null,
        spinLoft: null,
        alternates: [],
      };
    }
    if (aoa !== null && ((isDriver && aoa < -1.5) || (isIronOrWedge && aoa > clubSpec.aoa.max + 1.0))) {
      return {
        id: 'flipping_floater',
        name: isDriver ? 'Quiet Mode: Downward Driver AoA' : 'Quiet Mode: Shallow / Scooped AoA',
        severity: 'yellow',
        confidence: 0.78,
        tagline: isDriver
          ? 'Hitting down on Driver — shift low point behind tee and sweep up (+2° to +4°).'
          : 'Shallow attack angle on iron/wedge — shift pressure forward so low point is ahead of the ball.',
        cues: ['Check low-point towel behind ball', 'Keep lead wrist flat through impact'],
        evidence: ev,
        estDynamicLoft: null,
        estShaftLean: null,
        spinLoft: null,
        alternates: [],
      };
    }
    return {
      id: 'pure_compression',
      name: gatePass ? 'Quiet Mode: Pure Gate Delivery' : 'Quiet Mode: Solid Mechanics',
      severity: gatePass ? 'green' : 'yellow',
      confidence: 0.85,
      tagline: gatePass
        ? 'Clean start line inside the ±1.5° gate with dialed path & attack angle — elite quiet-session rep!'
        : 'Club delivery mechanics look solid — tighten start line inside ±1.5° HLA.',
      cues: ['Repeat this tempo and start-line picture'],
      evidence: ev,
      estDynamicLoft: null,
      estShaftLean: null,
      spinLoft: null,
      alternates: [],
    };
  }

  // Intentional Partial / Knockdown swing guard (from Context-Aware Club Brain)
  if (isPartialSwing) {
    const cleanFace = dplane._rh.hla === null || Math.abs(dplane._rh.hla) <= 2.2;
    return {
      id: 'solid_delivery',
      name: `Partial / Knockdown (${partialSpeedPct || 78}%)`,
      severity: cleanFace ? 'green' : 'yellow',
      confidence: 0.84,
      tagline: `Controlled ~${partialSpeedPct || 78}% speed swing with ${clubSpec.label} — Early Cast alert suppressed.`,
      cues: ['Keep pivot rotating smoothly through abbreviated finish', 'Own this clock-system carry number'],
      evidence: [
        clubSpeed !== null ? `Club Speed ${round1(clubSpeed)} mph (~${partialSpeedPct || 78}% of full ${clubSpec.label})` : '',
        vla !== null ? `Controlled Launch ${round1(vla)}° (Est. Shaft Lean ${fmtSigned(estShaftLean)}°)` : '',
        metrics.hla !== null ? `Start Line HLA ${fmtSigned(metrics.hla)}°` : '',
      ].filter(Boolean),
      estDynamicLoft,
      estShaftLean,
      spinLoft,
      alternates: [],
    };
  }

  // Compare club speed against player's expected speed for this club (for Early Cast detection)
  const driverBase = (calibration && calibration.driverSpeedMph) || 98;
  const expectedClubSpeed = driverBase * clubSpec.speedRatio;
  const speedRatioToBase = clubSpeed ? clubSpeed / expectedClubSpeed : 1.0;

  const smashDeficit = smash !== null ? clubSpec.smash.ideal - smash : 0;
  const spinExcess = backSpin !== null ? backSpin - clubSpec.spin.max : 0;
  const vlaExcess = vla !== null ? vla - clubSpec.vla.max : 0;
  const vlaDeficit = vla !== null ? clubSpec.vla.min - vla : 0;
  const rh = dplane._rh;

  // Score candidate delivery patterns
  const candidates = [];

  // A. Sky / Pop-Up (Driver & Woods)
  if ((isDriver || isWood) && vla !== null && vla >= 18.0 && (smashDeficit >= 0.12 || (backSpin && backSpin > 3800))) {
    candidates.push({
      id: 'pop_up',
      name: 'Sky Ball / Pop-Up',
      severity: 'red',
      confidence: 0.92,
      tagline: 'Steep strike high on the crown — massive energy loss.',
      cues: ['Check tee height and ball position', 'Feel wider, shallower arc through impact'],
      evidence: [
        `VLA ${round1(vla)}° is way above ${clubSpec.label} window (${clubSpec.vla.min}–${clubSpec.vla.max}°)`,
        aoa !== null ? `Angle of Attack ${fmtSigned(aoa)}°` : 'Steep downward delivery inferred',
        smash !== null ? `Smash dropped to ${round2(smash)} vs ${clubSpec.smash.ideal}` : '',
      ].filter(Boolean),
    });
  }

  // B. Flipping Floater (irons/wedges/hybrids: added dynamic loft, negative/low shaft lean, high VLA + high spin + soft smash)
  if (isIronOrWedge && estShaftLean !== null) {
    let flipScore = 0;
    const ev = [];
    if (estShaftLean < clubSpec.shaftLean.min - 1.5) {
      flipScore += 35 + Math.min(25, (clubSpec.shaftLean.min - estShaftLean) * 5);
      ev.push(`Est. Shaft Lean ${fmtSigned(estShaftLean)}° (expected ${fmtSigned(clubSpec.shaftLean.min)}° to ${fmtSigned(clubSpec.shaftLean.max)}°) → Est. Dynamic Loft ${estDynamicLoft}° vs ${clubSpec.staticLoft}° static loft`);
    }
    if (vlaExcess > 1.2) {
      flipScore += 18 + Math.min(15, vlaExcess * 3);
      ev.push(`High VLA ${round1(vla)}° (+${round1(vlaExcess)}° over ${clubSpec.label} window)`);
    }
    if (aoa !== null && aoa > clubSpec.aoa.max + 0.3) {
      flipScore += 18;
      ev.push(`Shallow/upward AoA (${fmtSigned(aoa)}°) instead of downward strike (${clubSpec.aoa.min} to ${clubSpec.aoa.max}°)`);
    }
    if (spinExcess > 350) {
      flipScore += 14;
      ev.push(`Elevated Backspin ${Math.round(backSpin)} rpm (high spin loft ${spinLoft}°)`);
    }
    if (smashDeficit >= 0.05) {
      flipScore += 12;
      ev.push(`Glancing energy transfer: Smash ${round2(smash)} vs ${clubSpec.smash.ideal} ideal`);
    }
    if (flipScore >= 46) {
      candidates.push({
        id: 'flipping_floater',
        name: 'Flipping Floater',
        severity: flipScore >= 68 ? 'red' : 'yellow',
        confidence: clamp(Math.round(flipScore) / 100, 0.55, 0.95),
        tagline: 'Hands stopped and clubhead passed the shaft at impact, adding dynamic loft and ballooning the ball.',
        cues: ['Lead wrist flat/bowed through impact', 'Keep sternum ahead of the ball (divot after ball)'],
        evidence: ev,
      });
    }
  }

  // C. Early Cast (casting from the top: lost club speed + out-to-in path / added loft / steep driver AoA)
  {
    let castScore = 0;
    let castIndicators = 0;
    const ev = [];
    if (clubSpeed && speedRatioToBase < 0.935) {
      castScore += 28 + Math.min(22, (0.935 - speedRatioToBase) * 280);
      ev.push(`Club Speed ${round1(clubSpeed)} mph is ${Math.round((1 - speedRatioToBase) * 100)}% below your ${clubSpec.label} baseline (~${round1(expectedClubSpeed)} mph)`);
    }
    if (rh.path !== null && rh.path < -3.2) {
      castScore += 24 + Math.min(18, Math.abs(rh.path + 3.2) * 3.5);
      castIndicators += 1;
      ev.push(`Out-to-In Club Path (${fmtSigned(path)}°) suggests early over-the-top release`);
    }
    if (estShaftLean !== null && estShaftLean < clubSpec.shaftLean.min) {
      castScore += 20;
      castIndicators += 1;
      ev.push(`Added loft at impact (Est. Shaft Lean ${fmtSigned(estShaftLean)}°, Dynamic Loft ${estDynamicLoft}°)`);
    }
    if (isDriver && aoa !== null && aoa < -2.0) {
      castScore += 22;
      castIndicators += 1;
      ev.push(`Downward Driver AoA (${fmtSigned(aoa)}°) — early release steepens angle into the tee`);
    }
    // Require at least one mechanical cast indicator so intentional 3/4 swings don't false-trigger from speed drop alone
    if (castScore >= 48 && castIndicators >= 1) {
      candidates.push({
        id: 'early_cast',
        name: 'Early Cast',
        severity: castScore >= 68 ? 'red' : 'yellow',
        confidence: clamp(Math.round(castScore) / 100, 0.55, 0.93),
        tagline: `Wrist angles released early in transition, bleeding clubhead speed and pulling path ${pullSide}.`,
        cues: ['Start downswing with lower-body pressure shift', 'Keep trail wrist bent through hip-high'],
        evidence: ev,
      });
    }
  }

  // D. Over-Hold / Stalled Block (dragging handle / holding face open — low/flat launch or push HLA + open F2P)
  {
    let holdScore = 0;
    const ev = [];
    if (rh.hla !== null && rh.hla >= 2.4) {
      holdScore += 26 + Math.min(18, (rh.hla - 2.4) * 5);
      ev.push(`Ball started well ${pushSide} (HLA ${fmtSigned(metrics.hla)}°) — clubface held open through impact`);
    }
    if (rh.faceToPath !== null && rh.faceToPath >= 2.2) {
      holdScore += 22 + Math.min(16, (rh.faceToPath - 2.2) * 4);
      ev.push(`Open Face-to-Path (${fmtSigned(dplane.faceToPath)}°) indicates delayed/stalled toe release`);
    }
    if (rh.path !== null && rh.path >= 2.0) {
      holdScore += 14;
      ev.push(`In-to-out Path (${fmtSigned(path)}°) paired with open face = classic handle-drag block`);
    }
    if (estShaftLean !== null && estShaftLean > clubSpec.shaftLean.ideal + 2.0) {
      holdScore += 18;
      ev.push(`Excessive forward shaft lean (${fmtSigned(estShaftLean)}° vs ${fmtSigned(clubSpec.shaftLean.ideal)}° ideal) — dragging handle without squaring face`);
    } else if (vlaDeficit > 1.5 && vla !== null) {
      holdScore += 12;
      ev.push(`Lower launch (${round1(vla)}°) from delofted/held handle`);
    }
    if (holdScore >= 50) {
      candidates.push({
        id: 'over_hold',
        name: 'Over-Hold / Stalled Block',
        severity: holdScore >= 70 ? 'red' : 'yellow',
        confidence: clamp(Math.round(holdScore) / 100, 0.55, 0.93),
        tagline: 'Handle pulled/held through impact without letting the face release square, causing a push or block-fade.',
        cues: ['Allow forearm rotation / toe release past the ball', 'Avoid holding lag artificially past trail thigh'],
        evidence: ev,
      });
    }
  }

  // E. Hooded / Shut-Face Trap (excessive deloft + closed face + snap/pull hook)
  if (estShaftLean !== null && estShaftLean > clubSpec.shaftLean.max + 1.5 && rh.hla !== null && rh.hla < -1.5 && rh.spinAxis !== null && rh.spinAxis < -8) {
    candidates.push({
      id: 'hooded_trap',
      name: 'Hooded / Shut-Face Trap',
      severity: 'red',
      confidence: 0.84,
      tagline: 'Face shut down and heavily delofted at impact, producing a low diving hook.',
      cues: ['Check grip strength (avoid overly strong trail hand)', 'Keep chest rotating through impact so hands don’t flip shut'],
      evidence: [
        `Excessive deloft: Est. Shaft Lean ${fmtSigned(estShaftLean)}° (Dynamic Loft ${estDynamicLoft}° vs ${clubSpec.staticLoft}° static)`,
        `Closed start line (HLA ${fmtSigned(metrics.hla)}°) + hook spin axis (${fmtSigned(metrics.spinAxis)}°)`,
        backSpin ? `Low backspin (${Math.round(backSpin)} rpm) deepens dive` : '',
      ].filter(Boolean),
    });
  }

  // F. Steep Chop / Dig (excessively negative AoA)
  if (aoa !== null && ((isDriver && aoa <= -2.5) || (isIronOrWedge && aoa <= clubSpec.aoa.min - 1.8))) {
    const sev = (isDriver && aoa <= -4.0) || (isIronOrWedge && aoa <= clubSpec.aoa.min - 3.2) ? 'red' : 'yellow';
    candidates.push({
      id: 'steep_dig',
      name: isDriver ? 'Steep Downward Driver' : 'Steep Chop / Heavy Dig',
      severity: sev,
      confidence: 0.82,
      tagline: isDriver
        ? 'Hitting down on Driver creates excess spin loft and robs easy carry distance.'
        : 'Overly steep attack angle increases spin loft and narrows strike margin.',
      cues: isDriver
        ? ['Ball forward off lead heel, slight spine tilt away from target', 'Sweep up (+2° to +4° AoA) off the tee']
        : ['Shallow the transition slightly from the inside', 'Avoid lunging upper body toward target'],
      evidence: [
        `Angle of Attack ${fmtSigned(aoa)}° (target ${clubSpec.aoa.min} to ${clubSpec.aoa.max}° for ${clubSpec.label})`,
        spinLoft !== null ? `Spin Loft ${spinLoft}°` : '',
        backSpin !== null ? `Backspin ${Math.round(backSpin)} rpm` : '',
      ].filter(Boolean),
    });
  }

  // Sort detected faults by confidence; if none fired, evaluate positive Tour delivery!
  candidates.sort((a, b) => b.confidence - a.confidence);
  if (candidates.length > 0) {
    return {
      ...candidates[0],
      estDynamicLoft,
      estShaftLean,
      spinLoft,
      alternates: candidates.slice(1, 3).map((c) => c.name),
    };
  }

  // Healthy / Positive delivery verdict
  const isCleanSmash = smash === null || smash >= clubSpec.smash.greenMin;
  if (isDriver) {
    const upward = aoa !== null && aoa >= 0.5;
    return {
      id: upward && isCleanSmash ? 'tour_sweep' : 'solid_driver',
      name: upward && isCleanSmash ? 'Tour Upward Sweep' : 'Solid Delivery',
      severity: isCleanSmash ? 'green' : 'yellow',
      confidence: 0.86,
      tagline: upward
        ? 'Optimal upward strike through the tee box — high launch, controlled spin, maximum energy transfer.'
        : 'Balanced driver delivery with playable launch and spin.',
      cues: ['Keep repeating this tempo and tee-box setup'],
      evidence: [
        aoa !== null ? `Angle of Attack ${fmtSigned(aoa)}° (target +${clubSpec.aoa.min} to +${clubSpec.aoa.max}°)` : 'Clean driver launch window',
        vla !== null ? `VLA ${round1(vla)}° & Backspin ${Math.round(backSpin || 0)} rpm` : (backSpin ? `Backspin ${Math.round(backSpin)} rpm` : ''),
        smash !== null ? `Smash Factor ${round2(smash)} (ideal ${clubSpec.smash.ideal})` : '',
      ].filter(Boolean),
      estDynamicLoft,
      estShaftLean,
      spinLoft,
      alternates: [],
    };
  }

  return {
    id: isCleanSmash ? 'pure_compression' : 'neutral_delivery',
    name: isCleanSmash ? 'Pure Compression' : 'Neutral Release',
    severity: isCleanSmash ? 'green' : 'yellow',
    confidence: 0.85,
    tagline: isCleanSmash
      ? 'Forward shaft lean with crisp downward strike — ball-first Tour-style compression.'
      : 'Release mechanics look solid; focus on centering face contact for higher smash.',
    cues: ['Maintain this handle-ahead impact geometry'],
    evidence: [
      estShaftLean !== null ? `Est. Shaft Lean ${fmtSigned(estShaftLean)}° (Dynamic Loft ${estDynamicLoft}° vs ${clubSpec.staticLoft}° static)` : '',
      aoa !== null ? `Angle of Attack ${fmtSigned(aoa)}° (target ${clubSpec.aoa.min} to ${clubSpec.aoa.max}°)` : '',
      smash !== null ? `Smash Factor ${round2(smash)} (ideal ${clubSpec.smash.ideal})` : '',
      spinLoft !== null ? `Spin Loft ${spinLoft}°` : '',
    ].filter(Boolean),
    estDynamicLoft,
    estShaftLean,
    spinLoft,
    alternates: [],
  };
}

/**
 * 4. Face Strike / Miss-Hit Inference (Center / Toe / Heel / Thin / Fat / High Face).
 *
 * Uses Smash Factor deficit + Gear Effect residual (actual SpinAxis vs D-Plane expected)
 * + Backspin anomaly + VLA anomaly + AoA to infer WHERE on the clubface contact occurred.
 * Returns normalized impact coordinates (x: -1 heel .. +1 toe; y: -1 thin/low .. +1 high face).
 */
function inferFaceStrike(metrics, dplane, clubSpec, calibration = null, practiceMode = 'real') {
  if (practiceMode === 'almost') {
    return {
      location: 'foam_na',
      label: 'Quiet Mode (Foam Ball)',
      severity: 'neutral',
      confidence: 0,
      coords: { x: 0, y: 0 },
      rationale: ['Face strike inference paused in Kids-Asleep mode — foam balls distort smash and gear-effect spin.'],
    };
  }
  const { smash, vla, backSpin, aoa, clubSpeed } = metrics;
  const isDriverOrWood = clubSpec.category === 'driver' || clubSpec.category === 'wood' || clubSpec.category === 'hybrid';
  const idealSmash = clubSpec.smash.ideal;
  const smashRatio = smash !== null ? smash / idealSmash : 1.0;
  const smashDrop = smash !== null ? idealSmash - smash : 0;
  const gearRes = dplane._rh.gearEffectResidual; // Handedness-normalized: negative = extra draw/hook (TOE), positive = extra fade/slice (HEEL)

  const spinDelta = backSpin !== null ? backSpin - clubSpec.spin.ideal : 0;
  const vlaDelta = vla !== null ? vla - clubSpec.vla.ideal : 0;

  // Flush center strike check
  if (smash !== null && smashRatio >= 0.975 && Math.abs(vlaDelta) <= 3.5 && (!isDriverOrWood || spinDelta < 1100)) {
    return {
      location: 'center',
      label: 'Center Flush',
      severity: 'green',
      confidence: 0.88,
      coords: { x: 0.0, y: 0.05 },
      rationale: [
        `Smash Factor ${round2(smash)} hits ${Math.round(smashRatio * 100)}% of ${clubSpec.label} optimal (${idealSmash})`,
        vla !== null
          ? `Launch (${round1(vla)}°) and Backspin (${Math.round(backSpin || 0)} rpm) confirm sweet-spot compression`
          : `Backspin (${Math.round(backSpin || 0)} rpm) confirms sweet-spot compression`,
      ],
    };
  }

  // Score candidate miss locations
  const candidates = [];

  // 1. TOE STRIKE (Driver/Wood/Hybrid/Long Iron: gear effect adds draw/hook spin + slightly lowers backspin)
  {
    let s = 0;
    const ev = [];
    if (smashDrop >= 0.03) {
      s += 22 + Math.min(25, smashDrop * 220);
      ev.push(`Smash dropped to ${round2(smash)} (${round2(smashDrop)} below ${idealSmash} sweet spot)`);
    }
    if (gearRes !== null && gearRes <= -4.5) {
      s += (isDriverOrWood ? 38 : 26) + Math.min(22, Math.abs(gearRes + 4.5) * 2.5);
      ev.push(`Toe Gear Effect signature: Spin Axis is ${Math.abs(gearRes)}° MORE draw/hook than Path+Face predict`);
    }
    if (isDriverOrWood && backSpin !== null && spinDelta <= -300) {
      s += 14;
      ev.push(`Lower backspin (${Math.round(backSpin)} rpm vs ${clubSpec.spin.ideal} ideal) matches toe-side CG deflection`);
    }
    if (s >= 48) {
      const mag = clamp(0.35 + smashDrop * 3.5, 0.35, 0.88);
      candidates.push({
        location: 'toe',
        label: 'Likely Toe Miss-Hit',
        severity: smashDrop >= 0.08 ? 'red' : 'yellow',
        confidence: clamp(Math.round(s) / 100, 0.52, 0.90),
        coords: { x: round2(mag), y: round2(clamp(vlaDelta * 0.04, -0.3, 0.3)) },
        rationale: ev,
      });
    }
  }

  // 2. HEEL STRIKE (Gear effect adds fade/slice spin + spikes backspin!)
  {
    let s = 0;
    const ev = [];
    if (smashDrop >= 0.03) {
      s += 22 + Math.min(25, smashDrop * 220);
      ev.push(`Smash dropped to ${round2(smash)} (${round2(smashDrop)} below ${idealSmash} sweet spot)`);
    }
    if (gearRes !== null && gearRes >= 4.5) {
      s += (isDriverOrWood ? 36 : 26) + Math.min(22, (gearRes - 4.5) * 2.5);
      ev.push(`Heel Gear Effect signature: Spin Axis is +${gearRes}° MORE fade/slice than Path+Face predict`);
    }
    if (backSpin !== null && spinDelta >= 550) {
      s += 18 + Math.min(14, (spinDelta - 550) / 120);
      ev.push(`Backspin spiked to ${Math.round(backSpin)} rpm (+${Math.round(spinDelta)} over ideal) — classic heel strike friction`);
    }
    if (s >= 48) {
      const mag = clamp(0.35 + smashDrop * 3.5, 0.35, 0.88);
      candidates.push({
        location: 'heel',
        label: 'Likely Heel Miss-Hit',
        severity: smashDrop >= 0.08 ? 'red' : 'yellow',
        confidence: clamp(Math.round(s) / 100, 0.52, 0.90),
        coords: { x: round2(-mag), y: round2(clamp(vlaDelta * 0.04, -0.35, 0.25)) },
        rationale: ev,
      });
    }
  }

  // 3. HIGH FACE (Driver / Wood: high launch + surprisingly LOW spin)
  if (isDriverOrWood && vla !== null && backSpin !== null && vlaDelta >= 2.2 && spinDelta <= -250) {
    const s = 55 + Math.min(30, vlaDelta * 5 + Math.abs(spinDelta) / 80);
    candidates.push({
      location: 'high',
      label: vla >= 17.5 ? 'High Crown / Sky' : 'High Face Strike',
      severity: vla >= 17.5 || smashDrop >= 0.09 ? 'red' : 'yellow',
      confidence: clamp(Math.round(s) / 100, 0.58, 0.90),
      coords: { x: round2(clamp(-(gearRes || 0) * 0.02, -0.3, 0.3)), y: round2(clamp(0.45 + vlaDelta * 0.08, 0.45, 0.88)) },
      rationale: [
        `High VLA (${round1(vla)}° vs ${clubSpec.vla.ideal}° ideal) paired with reduced spin (${Math.round(backSpin)} rpm)`,
        'Vertical gear effect above the CG increases launch while reducing backspin',
        smash !== null ? `Smash Factor ${round2(smash)} vs ${idealSmash}` : '',
      ].filter(Boolean),
    });
  }

  // 4. THIN / LOW GROOVE STRIKE (low VLA + smash drop; on drivers adds high spin, on irons low/skulled)
  {
    let s = 0;
    const ev = [];
    if (vla !== null && vlaDelta <= -2.4) {
      s += 32 + Math.min(26, Math.abs(vlaDelta + 2.4) * 6);
      ev.push(`Low Vertical Launch (${round1(vla)}° is ${Math.abs(round1(vlaDelta))}° below ${clubSpec.label} ideal)`);
    }
    if (smashDrop >= 0.04) {
      s += 22 + Math.min(20, smashDrop * 180);
      ev.push(`Energy loss: Smash ${round2(smash)} vs ${idealSmash}`);
    }
    if (isDriverOrWood && backSpin !== null && spinDelta >= 500) {
      s += 18;
      ev.push(`Elevated backspin (${Math.round(backSpin)} rpm) from low-face vertical gear effect`);
    }
    if (!isDriverOrWood && aoa !== null && aoa > clubSpec.aoa.max + 0.3) {
      s += 16;
      ev.push(`Shallow AoA (${fmtSigned(aoa)}°) caught the ball thin on the bottom grooves`);
    }
    if (s >= 50) {
      candidates.push({
        location: 'thin',
        label: 'Likely Thin / Low Face',
        severity: smashDrop >= 0.09 || vlaDelta <= -4.5 ? 'red' : 'yellow',
        confidence: clamp(Math.round(s) / 100, 0.55, 0.89),
        coords: { x: 0.0, y: round2(-clamp(0.45 + Math.abs(vlaDelta) * 0.08, 0.45, 0.85)) },
        rationale: ev,
      });
    }
  }

  // 5. FAT / HEAVY STRIKE (Irons/Wedges: sharp smash drop + supporting steep AoA, speed drop, or extreme turf-grab)
  if (!isDriverOrWood && smashDrop >= 0.08) {
    const driverBase = (calibration && calibration.driverSpeedMph) || 98;
    const expCS = driverBase * clubSpec.speedRatio;
    const speedDrop = clubSpeed ? (expCS - clubSpeed) / expCS : 0;
    const hasSteepAoa = aoa !== null && aoa <= clubSpec.aoa.min - 0.8;
    const hasSpeedDrop = speedDrop > 0.05;
    const hasSevereGrab = smashDrop >= 0.14 && vlaDelta >= -1.0;

    if (hasSteepAoa || hasSpeedDrop || hasSevereGrab) {
      let s = 38 + Math.min(30, smashDrop * 220);
      const ev = [
        `Sharp Smash drop (${round2(smash)} vs ${idealSmash} ideal) indicates mat/ground contact before the ball`,
      ];
      if (hasSteepAoa) {
        s += 18;
        ev.push(`Steep downward AoA (${fmtSigned(aoa)}°) drove club into the turf early`);
      }
      if (hasSpeedDrop) {
        s += 15;
        ev.push(`Club decelerated through impact (${round1(clubSpeed)} mph vs ~${round1(expCS)} mph baseline)`);
      }
      if (vla !== null && vlaDelta >= -1.0 && vlaDelta <= 4.0) {
        s += 10;
        ev.push(`Weak flight at ${round1(vla)}° launch with reduced ball speed`);
      }
      if (s >= 56) {
        candidates.push({
          location: 'fat',
          label: 'Likely Heavy / Fat Strike',
          severity: 'red',
          confidence: clamp(Math.round(s) / 100, 0.55, 0.86),
          coords: { x: 0.0, y: 0.42 },
          rationale: ev,
        });
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  if (candidates.length > 0) {
    return candidates[0];
  }

  // Mild off-center without clear directional gear signature
  if (smashDrop >= 0.04) {
    return {
      location: 'off_center',
      label: 'Slightly Off-Center',
      severity: smashDrop >= 0.08 ? 'red' : 'yellow',
      confidence: 0.65,
      coords: { x: round2(clamp((gearRes || 0) * -0.04, -0.45, 0.45)), y: round2(clamp(vlaDelta * 0.04, -0.35, 0.35)) },
      rationale: [
        `Smash Factor ${round2(smash)} vs ${idealSmash} ideal (${round2(smashDrop)} efficiency deficit)`,
        'No extreme gear-effect tilt — modest off-center strike (note: 1-dot Launch Pro infers strike location from smash + spin/launch signatures)',
      ],
    };
  }

  return {
    location: 'center',
    label: 'Solid Contact',
    severity: 'green',
    confidence: 0.78,
    coords: { x: 0.05, y: 0.0 },
    rationale: [
      smash !== null
        ? `Solid energy transfer (Smash ${round2(smash)} vs ${idealSmash} ideal)`
        : 'Ball speed, launch, and spin look clean (add 1-dot club sticker data for precise smash/strike tracking)',
    ],
  };
}

/**
 * 5. Low-Handicap Priority Metric Grading (Green / Yellow / Red) with target ranges and hover explanations.
 */
function gradeMetrics(metrics, flight, dplane, delivery, clubSpec, tierId = 'low_hcp', calibration = null, handedness = 'RH', potential = null, practiceMode = 'real', isPartialSwing = false) {
  const tier = BENCHMARK_TIERS[tierId] || BENCHMARK_TIERS.low_hcp;
  const isLH = handedness === 'LH';
  const sign = isLH ? -1 : 1;
  const isAlmost = practiceMode === 'almost';

  // When Personal Baseline tier is selected and this club has >=3 confirmed shots, grade against personal posterior windows!
  const post = tierId === 'personal' ? posteriorForClub(clubSpec.code, calibration) : null;
  const personalActive = Boolean(post && post.calibrated);
  const pDist = personalActive ? post.dist : null;

  const cards = [];

  function gradeRange(val, gLo, gHi, yLo, yHi) {
    if (val === null || val === undefined || !Number.isFinite(val)) return 'neutral';
    if (val >= gLo && val <= gHi) return 'green';
    if (val >= yLo && val <= yHi) return 'yellow';
    return 'red';
  }

  function gradeMin(val, gMin, yMin) {
    if (val === null || val === undefined || !Number.isFinite(val)) return 'neutral';
    if (val >= gMin) return 'green';
    if (val >= yMin) return 'yellow';
    return 'red';
  }

  function gradeAbs(val, gMax, yMax) {
    if (val === null || val === undefined || !Number.isFinite(val)) return 'neutral';
    const a = Math.abs(val);
    if (a <= gMax) return 'green';
    if (a <= yMax) return 'yellow';
    return 'red';
  }

  // 1. Smash Factor (Priority #1 for low handicap ball striking!)
  const smashG = round2(clamp(clubSpec.smash.greenMin + tier.smashOffset, 0.95, clubSpec.smash.maxPhys - 0.01));
  const smashY = round2(clamp(clubSpec.smash.yellowMin + tier.smashOffset, 0.88, smashG - 0.02));
  cards.push({
    key: 'smash',
    label: 'Smash Factor',
    priority: 1,
    value: metrics.smash !== null ? metrics.smash.toFixed(2) : '—',
    raw: metrics.smash,
    unit: '',
    grade: gradeMin(metrics.smash, smashG, smashY),
    source: metrics.smash !== null ? 'measured' : 'missing',
    target: `≥ ${smashG.toFixed(2)}`,
    delta: metrics.smash !== null ? fmtSigned(metrics.smash - clubSpec.smash.ideal, 2) : null,
    tooltip: `Ball Speed ÷ Club Speed. For ${clubSpec.label}, ${tier.shortLabel} target is ≥${smashG.toFixed(2)} (tour center strike ~${clubSpec.smash.ideal.toFixed(2)}). Low smash is the #1 indicator of off-center contact or excessive spin loft.`,
  });

  // 2. Carry Distance
  const driverBase = (calibration && calibration.driverSpeedMph) || 98;
  const expBS = pDist && pDist.ballSpeed
    ? pDist.ballSpeed.mean
    : driverBase * clubSpec.speedRatio * (clubSpec.smash.ideal - 0.02);
  const carryVal = metrics.carry !== null && metrics.carry > 5 ? metrics.carry : flight.carryYds;
  const carrySource = metrics.carry !== null && metrics.carry > 5 ? 'measured' : 'physics';
  const effPct = potential ? potential.efficiencyPct : flight.efficiencyPct;
  cards.push({
    key: 'carry',
    label: 'Carry',
    priority: 1,
    value: carryVal > 0 ? `${Math.round(carryVal)}` : '—',
    raw: carryVal,
    unit: 'yds',
    grade: carryVal > 0 && Number.isFinite(effPct) ? (effPct >= 93 ? 'green' : effPct >= 86 ? 'yellow' : 'red') : 'neutral',
    source: carrySource,
    target: `Total ${Math.round(flight.totalYds)} yds`,
    delta: flight.totalYds ? `+${Math.round(flight.rollYds)} roll` : null,
    tooltip: carrySource === 'measured'
      ? `Carry reported by Launch Monitor (${round1(carryVal)} yds). Physics engine projects ${round1(flight.totalYds)} yds total (${round1(flight.rollYds)} yds rollout).`
      : `Computed by ShotLab 3D aerodynamic physics engine (${round1(carryVal)} yds carry, ${round1(flight.totalYds)} yds total) since Launch Monitor omitted CarryDistance.`,
  });

  // 3. Ball Speed
  const bsGreenMin = round1(expBS * (tier.id === 'scratch' ? 0.98 : tier.id === 'mid_hcp' ? 0.92 : 0.95));
  const bsYellowMin = round1(expBS * 0.89);
  cards.push({
    key: 'ballSpeed',
    label: 'Ball Speed',
    priority: 1,
    value: metrics.ballSpeed !== null ? metrics.ballSpeed.toFixed(1) : '—',
    raw: metrics.ballSpeed,
    unit: 'mph',
    grade: gradeMin(metrics.ballSpeed, bsGreenMin, bsYellowMin),
    source: metrics.ballSpeed !== null ? 'measured' : 'missing',
    target: `≥ ${bsGreenMin} mph`,
    delta: metrics.ballSpeed !== null ? fmtSigned(metrics.ballSpeed - expBS) : null,
    tooltip: personalActive
      ? `Directly measured by Launch Pro cameras. Personal ${clubSpec.label} baseline (${post.samples} confirmed shots): ~${round1(expBS)} mph.`
      : `Directly measured by Launch Pro cameras. Baseline expected ${clubSpec.label} ball speed at your ${driverBase} mph Driver profile is ~${round1(expBS)} mph.`,
  });

  // 4. Club Speed
  const expCS = pDist && pDist.clubSpeed
    ? pDist.clubSpeed.mean
    : driverBase * clubSpec.speedRatio;
  cards.push({
    key: 'clubSpeed',
    label: 'Club Speed',
    priority: isAlmost ? 1 : 2,
    value: metrics.clubSpeed !== null ? metrics.clubSpeed.toFixed(1) : '—',
    raw: metrics.clubSpeed,
    unit: 'mph',
    grade: gradeMin(metrics.clubSpeed, expCS * 0.95, expCS * 0.89),
    source: metrics.clubSpeed !== null ? 'measured' : 'missing',
    target: `~${round1(expCS)} mph`,
    delta: metrics.clubSpeed !== null ? fmtSigned(metrics.clubSpeed - expCS) : null,
    tooltip: `Measured via Launch Pro 1-dot club sticker. Your ${clubSpec.label} speed baseline is ~${round1(expCS)} mph. Sharp drops often signal early casting or tentativeness.`,
  });

  // 5. Angle of Attack (AoA)
  const aoaIdeal = pDist && pDist.aoa ? round1(pDist.aoa.mean) : clubSpec.aoa.ideal;
  const aoaGMin = pDist && pDist.aoa ? round1(pDist.aoa.mean - pDist.aoa.std * 1.15) : round1(clubSpec.aoa.min - tier.aoaPad);
  const aoaGMax = pDist && pDist.aoa ? round1(pDist.aoa.mean + pDist.aoa.std * 1.15) : round1(clubSpec.aoa.max + tier.aoaPad);
  cards.push({
    key: 'aoa',
    label: 'Angle of Attack',
    priority: 1,
    value: metrics.aoa !== null ? `${fmtSigned(metrics.aoa)}°` : '—',
    raw: metrics.aoa,
    unit: '',
    grade: gradeRange(metrics.aoa, aoaGMin, aoaGMax, aoaGMin - 2.0, aoaGMax + 2.0),
    source: metrics.aoa !== null ? 'measured' : 'missing',
    target: `${fmtSigned(aoaGMin)}° to ${fmtSigned(aoaGMax)}°`,
    delta: metrics.aoa !== null ? `${fmtSigned(metrics.aoa - aoaIdeal)}°` : null,
    tooltip: clubSpec.category === 'driver'
      ? `Measured by Launch Pro 1-dot. Low-handicap Driver goal: hit UP (+1° to +5°) to maximize launch while cutting spin.`
      : `Measured by Launch Pro 1-dot. Low-handicap ${clubSpec.label} goal: strike DOWN (${clubSpec.aoa.min}° to ${clubSpec.aoa.max}°) for ball-first compression.`,
  });

  // 6. Club Path (handedness-aware In-to-Out / Out-to-In!)
  const rhPath = dplane._rh.path;
  cards.push({
    key: 'path',
    label: 'Club Path',
    priority: 1,
    value: metrics.path !== null ? `${fmtSigned(metrics.path)}°` : '—',
    raw: metrics.path,
    unit: '',
    grade: gradeAbs(metrics.path, tier.pathGreen, tier.pathYellow),
    source: metrics.path !== null ? 'measured' : 'missing',
    target: `±${tier.pathGreen}°`,
    delta: rhPath !== null ? (rhPath > 0.3 ? 'In-to-Out' : rhPath < -0.3 ? 'Out-to-In' : 'Neutral') : null,
    tooltip: isLH
      ? `Measured by Launch Pro 1-dot (LH). Negative (−) = In-to-Out, Positive (+) = Out-to-In. ${tier.shortLabel} golfers keep path within ±${tier.pathGreen}° to avoid two-way misses.`
      : `Measured by Launch Pro 1-dot. Positive (+) = In-to-Out, Negative (−) = Out-to-In. ${tier.shortLabel} golfers keep path within ±${tier.pathGreen}° to avoid two-way misses.`,
  });

  // 7. Est. Face-to-Target (handedness-aware Open / Closed!)
  const rhFace = dplane._rh.face;
  cards.push({
    key: 'face',
    label: 'Face to Target',
    priority: 1,
    value: dplane.faceToTarget !== null ? `${fmtSigned(dplane.faceToTarget)}°` : '—',
    raw: dplane.faceToTarget,
    unit: '',
    grade: gradeAbs(dplane.faceToTarget, tier.faceGreen, tier.faceYellow),
    source: dplane.faceSource,
    target: `±${tier.faceGreen}°`,
    delta: rhFace !== null ? (rhFace > 0.3 ? 'Open' : rhFace < -0.3 ? 'Closed' : 'Square') : null,
    tooltip: `${dplane.faceRationale} Face angle governs 75–85% of your ball's starting direction.`,
  });

  // 8. Est. Face-to-Path (handedness-aware Draw / Fade bias!)
  const rhF2P = dplane._rh.faceToPath;
  cards.push({
    key: 'faceToPath',
    label: 'Face to Path',
    priority: 1,
    value: dplane.faceToPath !== null ? `${fmtSigned(dplane.faceToPath)}°` : '—',
    raw: dplane.faceToPath,
    unit: '',
    grade: gradeAbs(dplane.faceToPath, tier.f2pGreen, tier.f2pYellow),
    source: dplane.faceToPath !== null ? 'estimated' : 'missing',
    target: `±${tier.f2pGreen}°`,
    delta: rhF2P !== null ? (rhF2P < -0.4 ? 'Draw bias' : rhF2P > 0.4 ? 'Fade bias' : 'Straight') : null,
    tooltip: isLH
      ? `Est. Face minus Club Path (LH). Positive = draw/hook spin (curves right), Negative = fade/slice spin (curves left). Keep inside ±${tier.f2pGreen}° for tight dispersion.`
      : `Est. Face minus Club Path. Directly drives curvature: negative = draw/hook spin, positive = fade/slice spin. Keep inside ±${tier.f2pGreen}° for tight dispersion.`,
  });

  // 9. Vertical Launch Angle (VLA)
  const vlaIdeal = pDist && pDist.vla ? round1(pDist.vla.mean) : clubSpec.vla.ideal;
  const vlaGMin = pDist && pDist.vla ? round1(pDist.vla.mean - pDist.vla.std * 1.15) : round1(clubSpec.vla.min - tier.vlaPad);
  const vlaGMax = pDist && pDist.vla ? round1(pDist.vla.mean + pDist.vla.std * 1.15) : round1(clubSpec.vla.max + tier.vlaPad);
  cards.push({
    key: 'vla',
    label: 'Launch (VLA)',
    priority: 2,
    value: metrics.vla !== null ? `${metrics.vla.toFixed(1)}°` : '—',
    raw: metrics.vla,
    unit: '',
    grade: gradeRange(metrics.vla, vlaGMin, vlaGMax, vlaGMin - 2.5, vlaGMax + 2.5),
    source: metrics.vla !== null ? 'measured' : 'missing',
    target: `${vlaGMin}–${vlaGMax}°`,
    delta: metrics.vla !== null ? `${fmtSigned(metrics.vla - vlaIdeal)}°` : null,
    tooltip: `Directly measured vertical launch angle. ${personalActive ? 'Personal' : clubSpec.label} window: ${vlaGMin}°–${vlaGMax}°. Too high with soft smash signals flipping; too low signals thin contact or hooded face.`,
  });

  // 10. Backspin
  const spIdeal = pDist && pDist.backSpin ? Math.round(pDist.backSpin.mean) : clubSpec.spin.ideal;
  const spGMin = pDist && pDist.backSpin ? Math.max(800, Math.round(pDist.backSpin.mean - pDist.backSpin.std * 1.15)) : Math.round(clubSpec.spin.min - tier.spinPad);
  const spGMax = pDist && pDist.backSpin ? Math.round(pDist.backSpin.mean + pDist.backSpin.std * 1.15) : Math.round(clubSpec.spin.max + tier.spinPad);
  cards.push({
    key: 'backSpin',
    label: 'Backspin',
    priority: 2,
    value: metrics.backSpin !== null ? `${Math.round(metrics.backSpin).toLocaleString()}` : '—',
    raw: metrics.backSpin,
    unit: 'rpm',
    grade: gradeRange(metrics.backSpin, spGMin, spGMax, spGMin - 900, spGMax + 1000),
    source: metrics.backSpin !== null ? 'measured' : 'missing',
    target: `${(spGMin / 1000).toFixed(1)}k–${(spGMax / 1000).toFixed(1)}k`,
    delta: metrics.backSpin !== null ? `${metrics.backSpin >= spIdeal ? '+' : ''}${Math.round(metrics.backSpin - spIdeal)}` : null,
    tooltip: `Backspin component of total spin. ${personalActive ? 'Personal' : `Ideal ${clubSpec.label}`} window is ${spGMin.toLocaleString()}–${spGMax.toLocaleString()} rpm. Excess spin balloons carry; too little spin causes iron flyers that won't hold greens.`,
  });

  // 11. Spin Axis (handedness-aware Draw/Hook vs Fade/Slice!)
  const rhAxis = metrics.spinAxis !== null ? metrics.spinAxis * sign : null;
  cards.push({
    key: 'spinAxis',
    label: 'Spin Axis',
    priority: 2,
    value: metrics.spinAxis !== null ? `${fmtSigned(metrics.spinAxis)}°` : '—',
    raw: metrics.spinAxis,
    unit: '',
    grade: gradeAbs(metrics.spinAxis, tier.spinAxisGreen, tier.spinAxisYellow),
    source: metrics.spinAxis !== null ? 'measured' : 'missing',
    target: `±${tier.spinAxisGreen}°`,
    delta: rhAxis !== null ? (rhAxis < -1 ? 'Draw/Hook' : rhAxis > 1 ? 'Fade/Slice' : 'Flat') : null,
    tooltip: `Tilt of the ball's spin axis. Negative (−) curves left, Positive (+) curves right. Beyond ±${tier.spinAxisYellow}° causes big misses and downrange distance loss.`,
  });

  // 12. Start Line (HLA) — primary Start-Line Gate in Kids-Asleep mode (±1.5°)!
  const hlaGreen = isAlmost ? 1.5 : tier.hlaGreen;
  const hlaYellow = isAlmost ? 2.8 : tier.hlaYellow;
  cards.push({
    key: 'hla',
    label: isAlmost ? 'Start Line Gate' : 'Start Line (HLA)',
    priority: isAlmost ? 1 : 2,
    value: metrics.hla !== null ? `${fmtSigned(metrics.hla)}°` : '—',
    raw: metrics.hla,
    unit: '',
    grade: gradeAbs(metrics.hla, hlaGreen, hlaYellow),
    source: metrics.hla !== null ? 'measured' : 'missing',
    target: `±${hlaGreen}°`,
    delta: metrics.hla !== null ? (metrics.hla < -0.4 ? 'Left' : metrics.hla > 0.4 ? 'Right' : 'On Line') : null,
    tooltip: isAlmost
      ? `Kids-Asleep Start Line Gate (±${hlaGreen}°). Foam balls launch straight off the face accurately even when distance/spin are muted.`
      : `Horizontal Launch Angle immediately off the face. Target within ±${hlaGreen}° for ${tier.shortLabel} accuracy.`,
  });

  // 13. Est. Shaft Lean / Dynamic Loft
  const leanGMin = clubSpec.shaftLean.min;
  const leanGMax = clubSpec.shaftLean.max;
  cards.push({
    key: 'shaftLean',
    label: 'Est. Shaft Lean',
    priority: 2,
    value: delivery.estShaftLean !== null ? `${fmtSigned(delivery.estShaftLean)}°` : '—',
    raw: delivery.estShaftLean,
    unit: '',
    grade: gradeRange(delivery.estShaftLean, leanGMin, leanGMax, leanGMin - 3.0, leanGMax + 3.5),
    source: delivery.estShaftLean !== null ? 'estimated' : 'missing',
    target: `${fmtSigned(leanGMin)}° to ${fmtSigned(leanGMax)}°`,
    delta: delivery.estDynamicLoft !== null ? `Dyn ${delivery.estDynamicLoft}°` : null,
    tooltip: `Static Loft (${clubSpec.staticLoft}°) minus Est. Dynamic Loft (${delivery.estDynamicLoft ?? '—'}°). Positive = forward shaft lean (compression). Negative = flipping / adding loft at impact.`,
  });

  // 14. Descent Angle
  cards.push({
    key: 'descent',
    label: 'Descent Angle',
    priority: 3,
    value: flight.descentAngleDeg ? `${flight.descentAngleDeg.toFixed(1)}°` : '—',
    raw: flight.descentAngleDeg,
    unit: '',
    grade: gradeRange(flight.descentAngleDeg, clubSpec.descent.min, clubSpec.descent.max, clubSpec.descent.min - 5, clubSpec.descent.max + 5),
    source: 'physics',
    target: `${clubSpec.descent.min}–${clubSpec.descent.max}°`,
    delta: flight.apexFt ? `Apex ${Math.round(flight.apexFt)} ft` : null,
    tooltip: `Landing angle from ShotLab ball-flight physics. Irons need 45°+ to stop on firm greens; Driver wants 34–40° for optimal carry + roll.`,
  });

  // Kids-Asleep ("Almost Golf Ball") Mode: only grade club-delivery + start-line metrics that stay accurate with foam balls!
  const ALMOST_VALID_KEYS = new Set(['clubSpeed', 'aoa', 'path', 'face', 'faceToPath', 'hla']);
  if (isAlmost) {
    for (const c of cards) {
      if (!ALMOST_VALID_KEYS.has(c.key)) {
        c.grade = 'neutral';
        c.source = 'foam_na';
        c.target = 'Foam N/A';
        c.delta = 'Quiet mode';
        c.tooltip = `Paused in Kids-Asleep (Almost Golf Ball) mode — foam balls distort speed/spin/carry. Grading focuses on Club Speed, Path, AoA, Face, and Start Line (±1.5°).`;
      }
    }
    // Put active delivery cards first so they fill the top row cleanly
    cards.sort((a, b) => (ALMOST_VALID_KEYS.has(b.key) ? 1 : 0) - (ALMOST_VALID_KEYS.has(a.key) ? 1 : 0));
  } else if (isPartialSwing) {
    const PARTIAL_EXEMPT_KEYS = new Set(['ballSpeed', 'clubSpeed', 'carry']);
    for (const c of cards) {
      if (PARTIAL_EXEMPT_KEYS.has(c.key)) {
        c.grade = 'neutral';
        c.target = 'Partial swing';
        c.delta = 'Flighted';
      }
    }
  }

  // Overall shot grade summary (Low-Handicap Score 0-100)
  const graded = cards.filter((c) => c.grade !== 'neutral');
  const weights = { 1: 2.0, 2: 1.2, 3: 0.7 };
  let earned = 0, possible = 0;
  let greens = 0, yellows = 0, reds = 0;
  for (const c of graded) {
    const w = weights[c.priority] || 1;
    possible += w;
    if (c.grade === 'green') { earned += w; greens++; }
    else if (c.grade === 'yellow') { earned += w * 0.55; yellows++; }
    else { reds++; }
  }
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const overallGrade = score >= 78 ? 'green' : score >= 52 ? 'yellow' : 'red';

  return {
    tierId: tier.id,
    practiceMode,
    tierLabel: isAlmost
      ? `Kids-Asleep Quiet Mode (Club + Start-Line Gate)`
      : tierId === 'personal'
        ? (personalActive ? `Personal Baseline (${post.samples} ${clubSpec.code} shots)` : `Personal (Low HCP fallback — need 3 ${clubSpec.code} shots)`)
        : tier.label,
    personalActive,
    personalSamples: post ? post.samples : 0,
    score,
    overallGrade,
    counts: { green: greens, yellow: yellows, red: reds },
    cards,
  };
}

module.exports = {
  analyzeDPlane,
  classifyShotShape,
  diagnoseDelivery,
  inferFaceStrike,
  gradeMetrics,
};
