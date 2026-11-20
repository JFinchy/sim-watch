/**
 * ShotLab — 3D Aerodynamic Golf Ball Flight Physics Engine.
 *
 * Uses RK4 numerical integration of gravity, aerodynamic drag (Cd), and Magnus lift (Cl)
 * with realistic spin decay, based on the published Alan Nathan / Quintavalla dimpled
 * golf-ball aerodynamics model and calibrated against TrackMan Tour & Amateur tables.
 *
 * Coordinate frame (meters internally, yards/feet on output):
 *   x = downrange distance along target line (+)
 *   y = vertical height above ground (+)
 *   z = lateral offset (+ right of target line, - left of target line)
 *
 * Spin axis convention (standard launch monitor RH/GSPro OpenConnect):
 *   SpinAxis < 0  -> tilted left  -> curves LEFT  (draw/hook for RH)
 *   SpinAxis > 0  -> tilted right -> curves RIGHT (fade/slice for RH)
 */
'use strict';

const MPH_TO_MPS = 0.44704;
const M_TO_YD = 1.0936133;
const M_TO_FT = 3.2808399;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// Standard USGA golf ball constants
const BALL_MASS = 0.04593;        // kg
const BALL_RADIUS = 0.021335;     // m
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS; // 0.001430 m^2
const GRAVITY = 9.80665;          // m/s^2
const STD_AIR_DENSITY = 1.225;    // kg/m^3 (sea level, 59°F / 15°C)
const SPIN_DECAY_TAU = 26.0;      // seconds (~3.8%/sec spin decay in flight)

/**
 * Calibrated dimpled golf ball aerodynamic coefficients.
 * Matches TrackMan carry, apex, and descent across Driver (167 mph), 7i (120 mph),
 * and PW (102 mph) as well as slower amateur speeds.
 */
function aeroCoeffs(speed, spinRad) {
  if (speed < 0.5) return { cd: 0.42, cl: 0.0 };
  const spinRatio = Math.min(0.65, (spinRad * BALL_RADIUS) / speed);

  // Dimpled golf ball boundary-layer transition (turbulent down to ~16 m/s, Re ~ 45,000)
  let cd0;
  if (speed <= 14.0) {
    cd0 = 0.40;
  } else if (speed < 26.0) {
    const t = (speed - 14.0) / 12.0;
    const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
    cd0 = 0.40 - smooth * (0.40 - 0.232);
  } else {
    // High-Reynolds drag drop at driver launch speeds (50-80 m/s)
    cd0 = Math.max(0.188, 0.232 - (speed - 26.0) * 0.00095);
  }

  // Empirical spin-drag + Magnus lift saturation (calibrated to TrackMan Driver, 7i, PW)
  const cd = cd0 + 0.245 * spinRatio;
  const cl = 0.312 * (1 - Math.exp(-8.6 * spinRatio));

  return { cd, cl };
}

/**
 * Compute acceleration vector [ax, ay, az] given velocity [vx, vy, vz] and spin vector [wx, wy, wz].
 */
function acceleration(vx, vy, vz, wx, wy, wz, airDensity) {
  const v = Math.hypot(vx, vy, vz);
  if (v < 0.1) return [0, -GRAVITY, 0];

  const w = Math.hypot(wx, wy, wz);
  const { cd, cl } = aeroCoeffs(v, w);
  const q = (0.5 * airDensity * BALL_AREA) / BALL_MASS;

  // Drag opposes velocity
  const dragFactor = -q * cd * v;
  let ax = dragFactor * vx;
  let ay = dragFactor * vy - GRAVITY;
  let az = dragFactor * vz;

  // Magnus lift acts along (omega x v) / (|omega| * |v|)
  // Note: for pure backspin with ball traveling +x, top of ball moves -x,
  // so angular velocity points along +z (right-hand rule: fingers curl +x -> +y -> -x -> -y around +z).
  // Wait: omega x v = (0, 0, +w) x (+vx, 0, 0) = (0, +w*vx, 0) -> UPWARD (+y)! Verified!
  if (w > 1e-4) {
    const cx = wy * vz - wz * vy;
    const cy = wz * vx - wx * vz;
    const cz = wx * vy - wy * vx;
    const cMag = Math.hypot(cx, cy, cz);
    if (cMag > 1e-6) {
      const liftMag = q * cl * v * v;
      ax += (liftMag * cx) / cMag;
      ay += (liftMag * cy) / cMag;
      az += (liftMag * cz) / cMag;
    }
  }

  return [ax, ay, az];
}

/**
 * Estimate rollout yards from landing state (descent angle, speed, backspin).
 */
function estimateRolloutYds(landingSpeedMps, descentAngleDeg, backSpinRpm) {
  const speedFactor = Math.max(0, landingSpeedMps - 14) / 22;
  const angleFactor = Math.max(0, (50 - descentAngleDeg) / 22);
  const spinBraking = Math.max(0.08, 1 - Math.max(0, backSpinRpm - 1800) / 8500);
  const rawRoll = 36 * speedFactor * angleFactor * spinBraking;
  if (descentAngleDeg >= 52 && backSpinRpm >= 7500) {
    return Math.round(Math.max(0, Math.min(3, rawRoll)) * 10) / 10;
  }
  return Math.round(Math.max(0.5, Math.min(42, rawRoll)) * 10) / 10;
}

function toFiniteNum(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Simulate 3D golf ball trajectory from launch conditions.
 *
 * @param {object} params
 * @param {number} params.ballSpeedMph
 * @param {number} params.vlaDeg        Vertical launch angle (deg)
 * @param {number} [params.hlaDeg=0]    Horizontal launch angle (deg, + right, - left)
 * @param {number} [params.totalSpinRpm] Total spin (rpm)
 * @param {number} [params.spinAxisDeg=0] Spin axis tilt (deg, + fade/slice right, - draw/hook left)
 * @param {number} [params.backSpinRpm] Optional explicit backspin
 * @param {number} [params.sideSpinRpm] Optional explicit sidespin
 * @param {number} [params.altitudeFt=0] Altitude for air density adjustment
 * @param {boolean} [params.includePoints=true] Include downsampled trajectory points
 */
function simulateBallFlight(params) {
  const ballSpeedMph = toFiniteNum(params.ballSpeedMph) ?? 0;
  const vlaDeg = toFiniteNum(params.vlaDeg) ?? 0;
  const hlaDeg = toFiniteNum(params.hlaDeg) ?? 0;

  if (ballSpeedMph <= 5 || vlaDeg <= 0) {
    return {
      carryYds: 0, totalYds: 0, rollYds: 0, apexFt: 0, apexYds: 0,
      descentAngleDeg: 0, hangTimeSec: 0, offlineYds: 0,
      startOfflineYds: 0, curveYds: 0, points: [],
    };
  }

  let totalSpinRpm = toFiniteNum(params.totalSpinRpm);
  let spinAxisDeg = toFiniteNum(params.spinAxisDeg);
  if (totalSpinRpm === null || totalSpinRpm <= 0) {
    const bs = toFiniteNum(params.backSpinRpm) ?? 0;
    const ss = toFiniteNum(params.sideSpinRpm) ?? 0;
    totalSpinRpm = Math.hypot(bs, ss);
    if (spinAxisDeg === null) {
      spinAxisDeg = totalSpinRpm > 0 ? Math.atan2(ss, bs) * RAD_TO_DEG : 0;
    }
  }
  if (spinAxisDeg === null) spinAxisDeg = 0;

  const altFt = toFiniteNum(params.altitudeFt) ?? 0;
  const airDensity = STD_AIR_DENSITY * Math.exp(-altFt / 29000);

  const v0 = ballSpeedMph * MPH_TO_MPS;
  const vla = Math.max(0.5, Math.min(70, vlaDeg)) * DEG_TO_RAD;
  const hla = hlaDeg * DEG_TO_RAD;

  // Initial velocity
  let vx = v0 * Math.cos(vla) * Math.cos(hla);
  let vy = v0 * Math.sin(vla);
  let vz = v0 * Math.cos(vla) * Math.sin(hla);

  // Spin vector in launch-aligned horizontal frame:
  // Pure backspin is around axis perpendicular to horizontal launch direction (+z rotated by hla)
  // Pure sidespin (spinAxis > 0 = clockwise from above = fade/slice curving +z) points along -y:
  // Check: omega x v = (0, -ws, 0) x (+vx, 0, 0) = (0, 0, +ws*vx) -> accelerates toward +z (RIGHT)! Verified!
  const w0 = (totalSpinRpm * 2 * Math.PI) / 60;
  const axisRad = spinAxisDeg * DEG_TO_RAD;
  const wBack0 = w0 * Math.cos(axisRad);
  const wSide0 = w0 * Math.sin(axisRad);

  const wx0 = -wBack0 * Math.sin(hla);
  const wy0 = -wSide0;
  const wz0 = wBack0 * Math.cos(hla);

  let x = 0, y = 0.02, z = 0; // start 2 cm off mat/tee
  let t = 0;
  const dt = 0.02;
  const maxT = 12.0;

  let maxY = y;
  let apexX = 0;
  const rawPoints = params.includePoints !== false ? [{ x: 0, y: 0, z: 0, t: 0 }] : null;

  let prevX = x, prevY = y, prevZ = z, prevVx = vx, prevVy = vy, prevVz = vz, prevT = t;

  while (t < maxT && y >= 0) {
    prevX = x; prevY = y; prevZ = z;
    prevVx = vx; prevVy = vy; prevVz = vz; prevT = t;

    const decay = Math.exp(-t / SPIN_DECAY_TAU);
    const wx = wx0 * decay;
    const wy = wy0 * decay;
    const wz = wz0 * decay;

    // RK4 step
    const [ax1, ay1, az1] = acceleration(vx, vy, vz, wx, wy, wz, airDensity);
    const vx2 = vx + 0.5 * dt * ax1, vy2 = vy + 0.5 * dt * ay1, vz2 = vz + 0.5 * dt * az1;
    const [ax2, ay2, az2] = acceleration(vx2, vy2, vz2, wx, wy, wz, airDensity);
    const vx3 = vx + 0.5 * dt * ax2, vy3 = vy + 0.5 * dt * ay2, vz3 = vz + 0.5 * dt * az2;
    const [ax3, ay3, az3] = acceleration(vx3, vy3, vz3, wx, wy, wz, airDensity);
    const vx4 = vx + dt * ax3, vy4 = vy + dt * ay3, vz4 = vz + dt * az3;
    const [ax4, ay4, az4] = acceleration(vx4, vy4, vz4, wx, wy, wz, airDensity);

    x += (dt / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
    y += (dt / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
    z += (dt / 6) * (vz + 2 * vz2 + 2 * vz3 + vz4);

    vx += (dt / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
    vy += (dt / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);
    vz += (dt / 6) * (az1 + 2 * az2 + 2 * az3 + az4);
    t += dt;

    if (y > maxY) {
      maxY = y;
      apexX = x;
    }

    if (rawPoints && rawPoints.length < 400 && Math.round(t / dt) % 3 === 0 && y > 0) {
      rawPoints.push({
        x: Math.round(x * M_TO_YD * 10) / 10,
        y: Math.round(y * M_TO_FT * 10) / 10,
        z: Math.round(z * M_TO_YD * 10) / 10,
        t: Math.round(t * 100) / 100,
      });
    }
  }

  // Linear interpolation for exact ground impact (y = 0); guard maxT exit where y >= 0
  const frac = (y < 0 && prevY > y) ? prevY / (prevY - y) : 1;
  const landX = prevX + frac * (x - prevX);
  const landZ = prevZ + frac * (z - prevZ);
  const landT = prevT + frac * (t - prevT);
  const landVx = prevVx + frac * (vx - prevVx);
  const landVy = prevVy + frac * (vy - prevVy);
  const landVz = prevVz + frac * (vz - prevVz);

  const carryM = Math.hypot(landX, landZ);
  const carryYds = Math.round(carryM * M_TO_YD * 10) / 10;
  const offlineYds = Math.round(landZ * M_TO_YD * 10) / 10;
  const startOfflineYds = Math.round(carryYds * Math.sin(hla) * 10) / 10;
  const curveYds = Math.round((offlineYds - startOfflineYds) * 10) / 10;
  const apexFt = Math.round(maxY * M_TO_FT * 10) / 10;
  const apexYds = Math.round(apexX * M_TO_YD * 10) / 10;

  const horizSpeed = Math.hypot(landVx, landVz);
  const descentAngleDeg = Math.round(Math.atan2(Math.abs(landVy), Math.max(0.1, horizSpeed)) * RAD_TO_DEG * 10) / 10;
  const landSpeed = Math.hypot(landVx, landVy, landVz);
  const backSpinAtImpact = totalSpinRpm * Math.cos(axisRad) * Math.exp(-landT / SPIN_DECAY_TAU);
  const rollYds = estimateRolloutYds(landSpeed, descentAngleDeg, backSpinAtImpact);
  const totalYds = Math.round((carryYds + rollYds) * 10) / 10;

  if (rawPoints) {
    rawPoints.push({
      x: Math.round(landX * M_TO_YD * 10) / 10,
      y: 0,
      z: offlineYds,
      t: Math.round(landT * 100) / 100,
    });
  }

  return {
    carryYds,
    totalYds,
    rollYds,
    apexFt,
    apexYds,
    descentAngleDeg,
    hangTimeSec: Math.round(landT * 100) / 100,
    offlineYds,
    startOfflineYds,
    curveYds,
    points: rawPoints || [],
  };
}

/**
 * Counterfactual "Distance Left on the Table" physics analysis.
 * Simulates what would have happened with:
 *   1. Center-face strike (optimal smash for the club at the EXACT same club speed)
 *   2. Optimal launch + spin window (at the actual ball speed, straight spin axis)
 *   3. Both combined ("Max Carry at your current club speed")
 *   4. Speed ceiling (+5 mph club speed with optimal strike)
 */
function computeDistancePotential(shotMetrics, clubSpec, actualFlight) {
  const { ballSpeed, clubSpeed, vla, totalSpin, spinAxis, smash } = shotMetrics;
  const altitudeFt = toFiniteNum(shotMetrics.altitudeFt) ?? 0;
  const displayCarry = actualFlight.carryYds;
  // Compare all physics counterfactuals apples-to-apples against the physics carry of the actual shot
  const physicsCarry = actualFlight.physicsCarryYds ?? actualFlight.carryYds;
  const idealSmash = clubSpec.smash.ideal;

  // 1. Optimal window at current ball speed
  const optWindowFlight = simulateBallFlight({
    ballSpeedMph: ballSpeed,
    vlaDeg: clubSpec.vla.ideal,
    hlaDeg: 0,
    totalSpinRpm: clubSpec.spin.ideal,
    spinAxisDeg: 0,
    altitudeFt,
    includePoints: false,
  });

  // 2. Center-face strike potential (if clubSpeed is known)
  let centerStrikeFlight = null;
  let maxAtSpeedFlight = null;
  let speedUpsideFlight = null;
  let strikeLossYds = 0;

  if (clubSpeed && clubSpeed > 30) {
    const centerBallSpeed = Math.max(ballSpeed, clubSpeed * idealSmash);
    // Only attenuate spinAxis for gear effect proportional to actual smash deficit
    // (a centered slice with ideal smash has 0 strike loss — its loss belongs to curve, not miss-hit!)
    const smashDeficit = Math.max(0, idealSmash - (smash ?? idealSmash));
    const gearAtten = Math.min(0.65, smashDeficit * 6.0);
    const cleanSpinAxis = spinAxis * (1 - gearAtten);

    centerStrikeFlight = simulateBallFlight({
      ballSpeedMph: centerBallSpeed,
      vlaDeg: vla,
      hlaDeg: 0,
      totalSpinRpm: totalSpin,
      spinAxisDeg: cleanSpinAxis,
      altitudeFt,
      includePoints: true,
    });
    maxAtSpeedFlight = simulateBallFlight({
      ballSpeedMph: centerBallSpeed,
      vlaDeg: clubSpec.vla.ideal,
      hlaDeg: 0,
      totalSpinRpm: clubSpec.spin.ideal,
      spinAxisDeg: 0,
      altitudeFt,
      includePoints: true,
    });
    speedUpsideFlight = simulateBallFlight({
      ballSpeedMph: (clubSpeed + 5) * idealSmash,
      vlaDeg: clubSpec.vla.ideal,
      hlaDeg: 0,
      totalSpinRpm: clubSpec.spin.ideal,
      spinAxisDeg: 0,
      altitudeFt,
      includePoints: false,
    });
    strikeLossYds = Math.max(0, Math.round((centerStrikeFlight.carryYds - physicsCarry) * 10) / 10);
  }

  // Straight-line vs curved loss at same ball speed & launch/spin (apples-to-apples vs physicsCarry)
  const straightSameWindow = simulateBallFlight({
    ballSpeedMph: ballSpeed,
    vlaDeg: vla,
    hlaDeg: 0,
    totalSpinRpm: totalSpin,
    spinAxisDeg: 0,
    altitudeFt,
    includePoints: false,
  });

  const curveLossYds = Math.max(0, Math.round((straightSameWindow.carryYds - physicsCarry) * 10) / 10);
  const launchSpinLossYds = Math.max(0, Math.round((optWindowFlight.carryYds - straightSameWindow.carryYds) * 10) / 10);

  const physicsMaxCarry = maxAtSpeedFlight
    ? Math.max(physicsCarry, centerStrikeFlight ? centerStrikeFlight.carryYds : 0, maxAtSpeedFlight.carryYds)
    : Math.max(physicsCarry, optWindowFlight.carryYds);
  const totalLeftOnTableYds = Math.max(0, Math.round((physicsMaxCarry - physicsCarry) * 10) / 10);
  const maxCarryAtSpeed = Math.round((displayCarry + totalLeftOnTableYds) * 10) / 10;

  const carryShift = displayCarry - physicsCarry;
  const maxTotalAtSpeed = maxAtSpeedFlight
    ? Math.round(Math.max(actualFlight.totalYds, maxAtSpeedFlight.totalYds + carryShift) * 10) / 10
    : Math.round(Math.max(actualFlight.totalYds, optWindowFlight.totalYds + carryShift) * 10) / 10;

  // Build plain-English rationale
  const reasons = [];
  if (strikeLossYds >= 2.5 && clubSpeed) {
    reasons.push(
      `Off-center strike (${smash ? smash.toFixed(2) : '?'} vs ${idealSmash.toFixed(2)} ideal smash at ${clubSpeed.toFixed(1)} mph) cost ~${Math.round(strikeLossYds)} yds`
    );
  }
  if (launchSpinLossYds >= 2.5) {
    const spinDiff = totalSpin - clubSpec.spin.ideal;
    const vlaDiff = vla - clubSpec.vla.ideal;
    const parts = [];
    if (Math.abs(spinDiff) > 500) parts.push(spinDiff > 0 ? `+${Math.round(spinDiff)} rpm excess spin` : `${Math.round(spinDiff)} rpm too little spin`);
    if (Math.abs(vlaDiff) > 2.0) parts.push(vlaDiff > 0 ? `+${vlaDiff.toFixed(1)}° high launch` : `${vlaDiff.toFixed(1)}° low launch`);
    reasons.push(
      `Launch/spin window (${parts.length ? parts.join(', ') : `${vla.toFixed(1)}° / ${Math.round(totalSpin)} rpm`}) cost ~${Math.round(launchSpinLossYds)} yds`
    );
  }
  if (curveLossYds >= 2.0) {
    reasons.push(`Heavy curve (${Math.abs(actualFlight.curveYds).toFixed(0)} yds sideways) cost ~${Math.round(curveLossYds)} yds downrange`);
  }
  if (!reasons.length) {
    reasons.push(
      clubSpeed
        ? `Maximized efficiency! You captured ${Math.min(100, Math.round((displayCarry / Math.max(1, maxCarryAtSpeed)) * 100))}% of your max carry at ${clubSpeed.toFixed(1)} mph club speed.`
        : `Efficient launch and spin window for ${clubSpec.label}.`
    );
  }

  return {
    actualCarryYds: displayCarry,
    centerStrikeCarryYds: centerStrikeFlight ? Math.round((centerStrikeFlight.carryYds + carryShift) * 10) / 10 : null,
    optimalWindowCarryYds: Math.round((optWindowFlight.carryYds + carryShift) * 10) / 10,
    maxCarryAtSpeedYds: maxCarryAtSpeed,
    maxTotalAtSpeedYds: maxTotalAtSpeed,
    speedUpsideCarryYds: speedUpsideFlight ? Math.round((speedUpsideFlight.carryYds + carryShift) * 10) / 10 : null,
    speedUpsideMph: clubSpeed ? Math.round((clubSpeed + 5) * 10) / 10 : null,
    strikeLossYds,
    launchSpinLossYds,
    curveLossYds,
    totalLeftOnTableYds,
    efficiencyPct: Math.min(100, Math.round((displayCarry / Math.max(1, maxCarryAtSpeed)) * 100)),
    ghostPoints: maxAtSpeedFlight ? maxAtSpeedFlight.points : [],
    reasons,
  };
}

module.exports = {
  simulateBallFlight,
  computeDistancePotential,
  aeroCoeffs,
};
