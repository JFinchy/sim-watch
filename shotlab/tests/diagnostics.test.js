'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeShot, planGsproClubSwitch, parseFsxCsv } = require('../engine');
const { DEMO_SHOTS } = require('../engine/demo_shots');

function demoById(id) {
  const d = DEMO_SHOTS.find((s) => s.id === id);
  assert.ok(d, `missing demo ${id}`);
  return d;
}

test('Shot shape classification distinguishes Snap Hook, Pull Hook, Push Slice, Tour Draw, and Power Fade', () => {
  const snap = analyzeShot(demoById('snap_hook_driver'), { clubOverride: 'DR' });
  assert.equal(snap.shotShape.name, 'Snap Hook');
  assert.equal(snap.shotShape.severity, 'red');

  const pullHook = analyzeShot(demoById('pull_hook_5i'), { clubOverride: '5I' });
  assert.equal(pullHook.shotShape.name, 'Pull Hook');
  assert.equal(pullHook.shotShape.severity, 'red');

  const pushSlice = analyzeShot(demoById('push_slice_driver'), { clubOverride: 'DR' });
  assert.match(pushSlice.shotShape.name, /Push Slice/);
  assert.equal(pushSlice.shotShape.severity, 'red');

  const tourDraw = analyzeShot(demoById('tour_draw_driver'), { clubOverride: 'DR' });
  assert.match(tourDraw.shotShape.name, /Push Draw/);
  assert.equal(tourDraw.shotShape.severity, 'green');

  const powerFade = analyzeShot(demoById('power_fade_3w'), { clubOverride: '3W' });
  assert.match(powerFade.shotShape.name, /Pull Fade/);
  assert.equal(powerFade.shotShape.severity, 'green');
});

test('Delivery diagnostics identify Flipping Floater, Early Cast, Over-Hold Block, Pure Compression, and Sky Ball', () => {
  const flip = analyzeShot(demoById('flipping_floater_7i'), { clubOverride: '7I' });
  assert.equal(flip.delivery.id, 'flipping_floater');
  assert.equal(flip.delivery.name, 'Flipping Floater');
  assert.ok(flip.delivery.estShaftLean < 3, `expected low/negative shaft lean on flip, got ${flip.delivery.estShaftLean}`);

  const cast = analyzeShot(demoById('early_cast_6i'), { clubOverride: '6I' });
  assert.equal(cast.delivery.id, 'early_cast');

  const hold = analyzeShot(demoById('over_hold_7i'), { clubOverride: '7I' });
  assert.equal(hold.delivery.id, 'over_hold');

  const pure = analyzeShot(demoById('pure_7i'), { clubOverride: '7I' });
  assert.equal(pure.delivery.id, 'pure_compression');
  assert.equal(pure.delivery.severity, 'green');

  const sky = analyzeShot(demoById('sky_3w'), { clubOverride: '3W' });
  assert.equal(sky.delivery.id, 'pop_up');
  assert.equal(sky.delivery.severity, 'red');
});

test('Face strike inference catches Toe, Heel, Thin, Fat, and Center Flush strikes', () => {
  const toe = analyzeShot(demoById('toe_driver'), { clubOverride: 'DR' });
  assert.equal(toe.strike.location, 'toe');
  assert.ok(toe.strike.coords.x > 0.3, `expected positive toe x coord, got ${toe.strike.coords.x}`);

  const heel = analyzeShot(demoById('heel_driver'), { clubOverride: 'DR' });
  assert.equal(heel.strike.location, 'heel');
  assert.ok(heel.strike.coords.x < -0.3, `expected negative heel x coord, got ${heel.strike.coords.x}`);

  const thin = analyzeShot(demoById('thin_8i'), { clubOverride: '8I' });
  assert.equal(thin.strike.location, 'thin');
  assert.ok(thin.strike.coords.y < -0.3);

  const fat = analyzeShot(demoById('fat_pw'), { clubOverride: 'PW' });
  assert.equal(fat.strike.location, 'fat');

  const flush = analyzeShot(demoById('tour_draw_driver'), { clubOverride: 'DR' });
  assert.equal(flush.strike.location, 'center');
  assert.equal(flush.strike.severity, 'green');
});

test('Benchmark tier switching adjusts Red/Yellow/Green grading strictness', () => {
  const shot = demoById('pure_7i');
  const scratch = analyzeShot(shot, { clubOverride: '7I', tierId: 'scratch' });
  const mid = analyzeShot(shot, { clubOverride: '7I', tierId: 'mid_hcp' });
  assert.equal(scratch.scorecard.tierId, 'scratch');
  assert.equal(mid.scorecard.tierId, 'mid_hcp');
  assert.ok(mid.scorecard.score >= scratch.scorecard.score, 'Mid HCP grading should be at least as forgiving as Scratch');
});

test('GSPro club-switch keystroke planner computes I (up) and K (down) steps', () => {
  const down = planGsproClubSwitch('DR', '7I');
  assert.equal(down.key, 'k');
  assert.ok(down.steps > 5);

  const up = planGsproClubSwitch('PW', '7I');
  assert.equal(up.key, 'i');
  assert.equal(up.steps, 3);

  const same = planGsproClubSwitch('7Iron', '7I');
  assert.equal(same.steps, 0);
  assert.equal(same.key, null);
});

test('FSX Pro CSV parser imports shot rows with L/R directional notation', () => {
  const csv = [
    'Club,Ball Speed (mph),Launch Angle (deg),Azimuth (deg),Total Spin (rpm),Spin Axis (deg),Carry (yds),Club Head Speed (mph),Angle of Attack (deg),Club Path (deg)',
    '7 Iron,114.2,17.5,1.2 R,6700,3.1 L,162.4,83.1,-4.2,1.8 In-Out',
    'Driver,146.5,12.8,2.1 L,2500,6.4 R,242.0,99.0,2.5,2.2 Out-In',
  ].join('\n');
  const rows = parseFsxCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].club, '7I');
  assert.equal(rows[0].ball.speed, 114.2);
  assert.equal(rows[0].ball.hla, 1.2);
  assert.equal(rows[0].ball.spin_axis, -3.1);
  assert.equal(rows[0].club_data.path, 1.8);
  assert.equal(rows[1].club, 'DR');
  assert.equal(rows[1].ball.hla, -2.1);
  assert.equal(rows[1].club_data.path, -2.2);
});

test('Left-handed (LH) mirroring flips shot shape, D-Plane labels, delivery, and gear-effect strike polarity', () => {
  // LH Push Draw: starts LEFT (-2.5 HLA), curves RIGHT (+8 spinAxis), path is In-to-Out (-3.5)
  const lhPushDraw = analyzeShot({
    ball: { speed: 146, vla: 12.6, hla: -2.5, spin: 2400, spin_axis: 8.0 },
    club_data: { speed: 99, path: -3.5, aoa: 2.8 },
  }, { clubOverride: 'DR', handedness: 'LH' });
  assert.match(lhPushDraw.shotShape.name, /Push Draw/, `expected LH Push Draw, got ${lhPushDraw.shotShape.name}`);
  assert.equal(lhPushDraw.shotShape.severity, 'green');
  const pathCard = lhPushDraw.scorecard.cards.find((c) => c.key === 'path');
  assert.match(pathCard.delta, /In-to-Out/, `expected LH -3.5 path to label In-to-Out, got ${pathCard.delta}`);

  // LH Toe miss on Driver: low smash + draw gear effect (+spinAxis for LH!)
  const lhToe = analyzeShot({
    ball: { speed: 132, vla: 12.0, hla: 0.0, spin: 2200, spin_axis: 16.0 },
    club_data: { speed: 99, path: 0.0, aoa: 2.0 },
  }, { clubOverride: 'DR', handedness: 'LH' });
  assert.equal(lhToe.strike.location, 'toe', `expected LH toe strike, got ${lhToe.strike.location}`);
});

test('OpenConnect heartbeats, zero carry/spin, custom bag GSPro switching, and tricky FSX CSV rows', () => {
  // Heartbeat & non-ball packets rejected
  assert.equal(analyzeShot({ ShotDataOptions: { IsHeartBeat: true, ContainsBallData: false } }), null);
  assert.equal(analyzeShot({ BallData: { Speed: 0 }, ShotDataOptions: { ContainsBallData: true } }), null);

  // Zero CarryDistance & TotalSpin fall back cleanly to physics carry & BackSpin/SideSpin
  const zeroFields = analyzeShot({
    BallData: { Speed: 145, VLA: 12.2, HLA: 0.5, TotalSpin: 0, BackSpin: 2500, SideSpin: -250, CarryDistance: 0 },
    ClubData: { Speed: 98, Path: 1.5, AngleOfAttack: 2.5 },
    ShotDataOptions: { ContainsBallData: true, ContainsClubData: true },
  }, { clubOverride: 'DR' });
  assert.ok(zeroFields.metrics.carry === null && zeroFields.metrics.effectiveCarry > 220);
  assert.ok(zeroFields.metrics.totalSpin > 2450 && zeroFields.metrics.spinAxis < -4);

  // PT & custom bag order & letter-first OpenConnect codes
  const toPutter = planGsproClubSwitch('LW', 'PT');
  assert.equal(toPutter.key, 'k');
  assert.equal(toPutter.steps, 1);

  const customBag = planGsproClubSwitch('w1', 'i7', ['DR', '5W', '7I', 'PW']);
  assert.equal(customBag.key, 'k');
  assert.equal(customBag.steps, 2);

  // FSX CSV with quoted thousands commas, compact L/R suffix, "Down", "Out to In", and Carry Side ignored
  const trickyCsv = [
    'FSX Pro Export,,,',
    'Club,Ball Speed,Launch Angle,Side Angle,Total Spin,Spin Axis,Carry,Carry Side,AoA,Club Path',
    '7 Iron,114.0,17.2,2.3L,"6,750",4.1L,162.0,8.5L,4.2 Down,2.5 Out to In',
  ].join('\n');
  const parsed = parseFsxCsv(trickyCsv);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].ball.hla, -2.3);
  assert.equal(parsed[0].ball.spin, 6750);
  assert.equal(parsed[0].ball.carry, 162.0);
  assert.equal(parsed[0].club_data.aoa, -4.2);
  assert.equal(parsed[0].club_data.path, -2.5);
});

