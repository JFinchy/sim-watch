'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { simulateBallFlight, computeDistancePotential } = require('../engine/physics');
const { getClubSpec } = require('../engine/constants');

test('TrackMan PGA Driver carry, apex, and descent within realistic tolerances', () => {
  const f = simulateBallFlight({ ballSpeedMph: 167, vlaDeg: 10.9, hlaDeg: 0, totalSpinRpm: 2686, spinAxisDeg: 0 });
  assert.ok(f.carryYds >= 265 && f.carryYds <= 286, `expected ~275 yds, got ${f.carryYds}`);
  assert.ok(f.totalYds > f.carryYds, 'driver should roll out');
  assert.ok(f.apexFt >= 85 && f.apexFt <= 122, `expected ~96 ft apex, got ${f.apexFt}`);
  assert.ok(f.descentAngleDeg >= 34 && f.descentAngleDeg <= 45, `expected ~38 deg descent, got ${f.descentAngleDeg}`);
  assert.ok(f.points.length >= 10, 'should produce trajectory points');
});

test('TrackMan Amateur Driver & 7-Iron & PW carry accuracy', () => {
  const amDr = simulateBallFlight({ ballSpeedMph: 145, vlaDeg: 12.5, totalSpinRpm: 2600 });
  assert.ok(amDr.carryYds >= 225 && amDr.carryYds <= 246, `Am DR carry=${amDr.carryYds}`);

  const pga7 = simulateBallFlight({ ballSpeedMph: 120, vlaDeg: 16.3, totalSpinRpm: 7097 });
  assert.ok(pga7.carryYds >= 165 && pga7.carryYds <= 179, `PGA 7i carry=${pga7.carryYds}`);
  assert.ok(pga7.descentAngleDeg >= 44 && pga7.descentAngleDeg <= 53, `PGA 7i descent=${pga7.descentAngleDeg}`);

  const pgaPW = simulateBallFlight({ ballSpeedMph: 102, vlaDeg: 24.2, totalSpinRpm: 9304 });
  assert.ok(pgaPW.carryYds >= 126 && pgaPW.carryYds <= 142, `PGA PW carry=${pgaPW.carryYds}`);
});

test('Spin axis sign convention: negative curves left (-z), positive curves right (+z)', () => {
  const draw = simulateBallFlight({ ballSpeedMph: 145, vlaDeg: 12, hlaDeg: 0, totalSpinRpm: 2600, spinAxisDeg: -14 });
  const fade = simulateBallFlight({ ballSpeedMph: 145, vlaDeg: 12, hlaDeg: 0, totalSpinRpm: 2600, spinAxisDeg: 14 });
  assert.ok(draw.curveYds < -10, `expected left draw curve < -10, got ${draw.curveYds}`);
  assert.ok(fade.curveYds > 10, `expected right fade curve > 10, got ${fade.curveYds}`);
  assert.ok(Math.abs(draw.curveYds + fade.curveYds) < 1.5, 'symmetric curve magnitudes');
});

test('Distance potential quantifies off-center strike loss and +5 mph speed ceiling', () => {
  const spec = getClubSpec('DR');
  // 99 mph club speed with 135 mph ball speed (1.36 smash — toe/heel miss!)
  const actual = simulateBallFlight({ ballSpeedMph: 135, vlaDeg: 12.5, totalSpinRpm: 3500, spinAxisDeg: 14 });
  const pot = computeDistancePotential(
    { ballSpeed: 135, clubSpeed: 99, vla: 12.5, totalSpin: 3500, spinAxis: 14, smash: 1.36 },
    spec,
    actual
  );
  assert.ok(pot.centerStrikeCarryYds > actual.carryYds + 12, `center strike (${pot.centerStrikeCarryYds}) should exceed actual (${actual.carryYds}) by >12 yds`);
  assert.ok(pot.maxCarryAtSpeedYds >= pot.centerStrikeCarryYds, 'max carry >= center strike carry');
  assert.ok(pot.speedUpsideCarryYds > pot.maxCarryAtSpeedYds + 8, '+5 mph upside should add meaningful carry');
  assert.ok(pot.totalLeftOnTableYds >= 15, `expected >=15 yds left on table, got ${pot.totalLeftOnTableYds}`);
  assert.ok(pot.reasons.length >= 1);
});

test('Zero/negative VLA worm-burner and null spinAxis fallback behave cleanly', () => {
  const worm = simulateBallFlight({ ballSpeedMph: 85, vlaDeg: -1.5, hlaDeg: 0, totalSpinRpm: 1200, spinAxisDeg: 0 });
  assert.ok(Number.isFinite(worm.carryYds) && worm.carryYds >= 0);
  assert.ok(Number.isFinite(worm.totalYds) && worm.totalYds >= worm.carryYds);

  const fromSideSpin = simulateBallFlight({
    ballSpeedMph: 145,
    vlaDeg: 12,
    hlaDeg: 0,
    backSpinRpm: 2500,
    sideSpinRpm: 600,
    spinAxisDeg: null,
  });
  assert.ok(fromSideSpin.curveYds > 5, `expected positive right curve from +600 sideSpin when spinAxisDeg is null, got ${fromSideSpin.curveYds}`);
});

test('Altitude increases carry and propagates into computeDistancePotential', () => {
  const sea = simulateBallFlight({ ballSpeedMph: 150, vlaDeg: 12, totalSpinRpm: 2500, altitudeFt: 0 });
  const denver = simulateBallFlight({ ballSpeedMph: 150, vlaDeg: 12, totalSpinRpm: 2500, altitudeFt: 5280 });
  assert.ok(denver.carryYds > sea.carryYds + 8, `Denver (${denver.carryYds}) should carry >8y further than sea level (${sea.carryYds})`);

  const spec = getClubSpec('DR');
  const potDenver = computeDistancePotential(
    { ballSpeed: 146, clubSpeed: 99, vla: 12.2, totalSpin: 2450, spinAxis: 0, smash: 1.47 },
    spec,
    denver,
    { altitudeFt: 5280 }
  );
  assert.ok(potDenver.maxCarryAtSpeedYds >= denver.carryYds - 2, 'Altitude should apply consistently to counterfactual sims');
});

