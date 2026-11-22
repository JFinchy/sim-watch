'use strict';
// Missing club data (BLP club sticker not read): what ShotLab shows, estimates, and refuses to claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const { renderClubfaceMap } = require('../renderer/svg.js');

const BALL_7I = { speed: 113, vla: 17.8, hla: 1.2, spin: 6800, spin_axis: -4 };
const shot = (ball, club_data, extra = {}) => engine.analyzeShot({ ts: 't', shot_num: 1, club: '7I', ball, club_data, ...extra.raw }, extra.opts || {});

test('Full club read: data quality is full and nothing is downgraded', () => {
  const a = shot(BALL_7I, { speed: 82.5, aoa: -4, path: 2.4 });
  assert.equal(a.dataQuality.clubRead, true);
  assert.equal(a.dataQuality.basis, 'full');
  assert.deepEqual(a.dataQuality.missing, []);
  assert.equal(a.scorecard.coverage.graded, a.scorecard.coverage.total);
  assert.ok(!/estimate/.test(a.delivery.name));
});

test('No club data: club metrics are null, never invented, and flagged on the tiles', () => {
  const a = shot(BALL_7I, undefined);
  assert.equal(a.dataQuality.clubRead, false);
  assert.match(a.dataQuality.note, /No club read/);
  for (const k of ['clubSpeed', 'smash', 'aoa', 'path']) assert.equal(a.metrics[k], null, k);
  for (const c of a.scorecard.cards.filter((c) => ['clubSpeed', 'smash', 'aoa', 'path', 'faceToPath'].includes(c.key))) {
    assert.equal(c.grade, 'neutral', c.key);
    assert.equal(c.source, 'missing', c.key);
    assert.equal(c.target, 'no club read', c.key);
  }
  assert.ok(a.scorecard.coverage.graded < a.scorecard.coverage.total);
  // face-to-target still estimated from start line (labelled EST)
  assert.equal(typeof a.metrics.faceToTarget, 'number');
  assert.equal(a.dataQuality.basis, 'ball_only');
});

test('Zero placeholder club data (sticker missed, connector sent 0s) is treated as no read', () => {
  const a = shot(BALL_7I, { speed: 0, aoa: 0, path: 0 });
  assert.equal(a.dataQuality.clubRead, false);
  assert.equal(a.metrics.path, null);
  assert.equal(a.metrics.aoa, null);
  const pathCard = a.scorecard.cards.find((c) => c.key === 'path');
  assert.equal(pathCard.grade, 'neutral', 'a fake 0.0° path must not grade green');
});

test('No club data: "all good" verdicts are not claimed; clean-looking shot says launch & spin on window', () => {
  const a = shot(BALL_7I, undefined);
  assert.equal(a.delivery.id, 'ball_flight_ok');
  assert.ok(a.delivery.confidence <= 0.5);
  assert.match(a.delivery.tagline, /can't be confirmed/);
  assert.equal(a.strike.location, 'unknown');
  assert.equal(a.strike.label, 'Strike not measured');
  assert.equal(a.strike.confidence, 0);
  const svg = renderClubfaceMap(a.strike, a.clubSpec);
  assert.ok(svg.includes('no club read') && !svg.includes('_spot)"/>'), 'no fake hotspot drawn');
});

test('No club data: ball-flight faults still surface, labelled as estimates at reduced confidence', () => {
  const floaty = shot({ speed: 110, vla: 26, hla: 0, spin: 8600, spin_axis: 0 }, undefined);
  assert.equal(floaty.activeClub, '7I', 'graded against the GSPro club, not a ball-only guess');
  assert.match(floaty.delivery.name, /estimate/);
  assert.notEqual(floaty.delivery.severity, 'green');
  assert.ok(floaty.delivery.confidence <= 0.6);

  const low = shot({ speed: 118, vla: 12, hla: 0, spin: 4200, spin_axis: 0 }, undefined);
  assert.match(low.delivery.name, /Low Launch & Spin \(ball-flight estimate\)/);
  assert.ok(low.strike.confidence <= 0.5);
  assert.match(low.strike.label, /\(estimate\)/);
});

test('No club data: trusts GSPro club over ball-only detection, and never auto-switches GSPro', () => {
  const cal = engine.createEmptyCalibration(98);
  cal.autoSwitch = { enabled: true, minConfidence: 0.01 };
  const a = shot({ speed: 104, vla: 21, hla: 0, spin: 7900, spin_axis: 0 }, undefined, { opts: { calibration: cal } });
  assert.equal(a.activeClub, '7I');
  assert.equal(a.shouldAutoSwitch, false);
});

test('Quiet Mode with no club read reports no data instead of a delivery verdict', () => {
  const a = shot({ speed: 60, vla: 20, hla: 0, spin: 3000, spin_axis: 0 }, undefined, { opts: { practiceMode: 'almost' } });
  assert.equal(a.delivery.id, 'no_data');
  assert.equal(a.delivery.severity, 'neutral');
});

test("Swing DB: 'no club read' verdicts are not counted as delivery faults", () => {
  const { NON_FAULT_DELIVERY_IDS } = require('../engine/swingDb');
  assert.ok(NON_FAULT_DELIVERY_IDS.has('ball_flight_ok') && NON_FAULT_DELIVERY_IDS.has('no_data'));
});

test('A read sticker on a slow chip (< 20 mph club speed) keeps path & AoA and is not "no club read"', () => {
  const a = shot({ speed: 30, vla: 28, hla: 0, spin: 3200, spin_axis: 0 }, { speed: 18, aoa: -6, path: -3 },
    { opts: { practiceMode: 'almost' } });
  assert.equal(a.dataQuality.clubRead, true);
  assert.equal(a.metrics.path, -3);
  assert.equal(a.metrics.aoa, -6);
  assert.notEqual(a.delivery.id, 'no_data');
});

test('Fault streak alerts ignore ball-flight estimates (sticker misses never raise a streak)', () => {
  const floaty = { speed: 110, vla: 26, hla: 0, spin: 8600, spin_axis: 0 };
  const est1 = shot(floaty, undefined);
  const est2 = shot(floaty, undefined);
  assert.equal(est1.delivery.basis, 'ball_only');
  assert.equal(engine.detectFaultStreak([est1, est2], []), null);

  const measured = (n) => {
    const s = shot(floaty, { speed: 84, aoa: 1.5, path: 0 });
    s.id = `m${n}`;
    return s;
  };
  const m1 = measured(1);
  const m2 = measured(2);
  assert.equal(m1.delivery.id, 'flipping_floater');
  assert.ok(engine.detectFaultStreak([m1, m2], []), 'measured floaters still streak');
  assert.equal(engine.detectFaultStreak([est1, m1, m2], []), null, 'latest shot is an estimate: no alert');
});
