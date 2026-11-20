'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createEmptyCalibration,
  classifyClub,
  recordConfirmation,
  getCalibrationStats,
} = require('../engine/classifier');
const { DEMO_SHOTS } = require('../engine/demo_shots');

test('Classifier accurately predicts distinct clubs out of the box (prior only)', () => {
  const cal = createEmptyCalibration(98);

  const driver = classifyClub({
    ball: { speed: 146, vla: 12.8, spin: 2450, spin_axis: -4 },
    club_data: { speed: 99, aoa: 2.8, path: 2.0 },
  }, cal);
  assert.equal(driver.predictedClub, 'DR');
  assert.ok(driver.confidence >= 0.85, `expected high driver confidence, got ${driver.confidence}`);
  assert.ok(driver.factorBreakdown.length >= 5);

  const sevenIron = classifyClub({
    ball: { speed: 112, vla: 17.8, spin: 6850, spin_axis: -2 },
    club_data: { speed: 82, aoa: -4.1, path: 1.5 },
  }, cal);
  assert.equal(sevenIron.predictedClub, '7I');
  assert.ok(sevenIron.confidence >= 0.50);

  const pw = classifyClub({
    ball: { speed: 94, vla: 25.0, spin: 9200, spin_axis: 0.5 },
    club_data: { speed: 74, aoa: -5.0, path: -0.5 },
  }, cal);
  assert.equal(pw.predictedClub, 'PW');
});

test('Classifier gracefully handles ball-data-only shots (no club dot)', () => {
  const cal = createEmptyCalibration(98);
  const res = classifyClub({
    ball: { speed: 147, vla: 12.5, spin: 2400, spin_axis: 0 },
    club_data: null,
  }, cal);
  assert.equal(res.predictedClub, 'DR');
  assert.ok(res.confidence >= 0.80);
  assert.ok(!res.featuresUsed.includes('clubSpeed'));
});

test('Online Empirical Bayes calibration adapts to a faster player and reaches >=90% accuracy', () => {
  // Simulate a faster player (110 mph Driver) whose personal bag is shifted faster than the 98 mph prior
  let cal = createEmptyCalibration(98);
  const bag = [
    { club: 'DR', bs: 162, vla: 11.8, spin: 2300, cs: 110, aoa: 3.2 },
    { club: '3W', bs: 149, vla: 11.4, spin: 3500, cs: 103, aoa: -1.4 },
    { club: '5I', bs: 130, vla: 14.5, spin: 5300, cs: 95, aoa: -3.4 },
    { club: '7I', bs: 121, vla: 17.5, spin: 6750, cs: 90, aoa: -4.2 },
    { club: '9I', bs: 110, vla: 22.0, spin: 8400, cs: 84, aoa: -4.8 },
    { club: 'PW', bs: 102, vla: 25.0, spin: 9300, cs: 80, aoa: -5.2 },
    { club: 'SW', bs: 85, vla: 31.0, spin: 10200, cs: 73, aoa: -5.4 },
  ];

  // Deterministic pseudo-noise helper
  const noise = (i, scale) => Math.sin(i * 12.9898) * scale;

  // Phase 1: Calibrate 4 shots per club
  let idx = 0;
  for (let round = 0; round < 4; round++) {
    for (const c of bag) {
      idx++;
      const shot = {
        ball: { speed: c.bs + noise(idx, 1.5), vla: c.vla + noise(idx + 1, 0.6), spin: c.spin + noise(idx + 2, 220), spin_axis: noise(idx + 3, 2) },
        club_data: { speed: c.cs + noise(idx + 4, 0.8), aoa: c.aoa + noise(idx + 5, 0.4) },
      };
      cal = recordConfirmation(cal, shot, c.club);
    }
  }

  // Driver baseline speed should have adapted upward toward 110 mph
  assert.ok(cal.driverSpeedMph >= 106, `expected driverSpeedMph >= 106, got ${cal.driverSpeedMph}`);

  // Phase 2: Evaluate accuracy on 35 fresh test shots (5 per club)
  let exact = 0;
  const total = bag.length * 5;
  for (let round = 0; round < 5; round++) {
    for (const c of bag) {
      idx++;
      const shot = {
        ball: { speed: c.bs + noise(idx, 1.8), vla: c.vla + noise(idx + 1, 0.7), spin: c.spin + noise(idx + 2, 260), spin_axis: noise(idx + 3, 2.5) },
        club_data: { speed: c.cs + noise(idx + 4, 0.9), aoa: c.aoa + noise(idx + 5, 0.5) },
      };
      const pred = classifyClub(shot, cal);
      if (pred.predictedClub === c.club) exact++;
      cal = recordConfirmation(cal, shot, c.club, pred);
    }
  }

  const acc = exact / total;
  assert.ok(acc >= 0.90, `expected >=90% calibrated accuracy, got ${(acc * 100).toFixed(1)}%`);

  const stats = getCalibrationStats(cal);
  assert.ok(stats.recentExactPct >= 90, `expected rolling accuracy >=90%, got ${stats.recentExactPct}%`);
  assert.equal(stats.readyForAutoSwitch, true);
});

test('All 16 demo archetypes classify cleanly within +/-1 club before calibration', () => {
  const cal = createEmptyCalibration(98);
  let withinOne = 0;
  for (const d of DEMO_SHOTS) {
    const pred = classifyClub(d, cal);
    assert.ok(pred.predictedClub, `demo ${d.id} should produce a club prediction`);
    if (pred.top3.some((t) => t.club === d.actualClub)) withinOne++;
  }
  assert.ok(withinOne >= 13, `expected at least 13/16 demo shots in top-3 before calibration, got ${withinOne}/16`);
});

test('Classifier ignores null fields, flags putts/partial swings, and protects calibration from pollution', () => {
  let cal = createEmptyCalibration(98);

  // Null vla/spin should not be coerced to 0
  const missingVla = classifyClub({ ball: { speed: 146, vla: null, spin: null }, club_data: { speed: 99, aoa: null } }, cal);
  assert.ok(!missingVla.featuresUsed.includes('vla'));
  assert.ok(!missingVla.featuresUsed.includes('backSpin'));
  assert.equal(missingVla.predictedClub, 'DR');

  // Putt / short chip should be flagged OOD with capped confidence
  const putt = classifyClub({ ball: { speed: 14, vla: 1.5, spin: 400 }, club_data: { speed: 10, aoa: 1.0 } }, cal);
  assert.equal(putt.isPartialOrShortGame, true);
  assert.equal(putt.shotCategory, 'putt');
  assert.ok(putt.confidence <= 0.45);

  // Confirming a partial wedge should not pollute Driver baseline or Welford stats for full swings
  const partialSw = { ball: { speed: 48, vla: 34, spin: 5400 }, club_data: { speed: 46, aoa: -4.0 } };
  const partialPred = classifyClub(partialSw, cal);
  assert.equal(partialPred.isPartialOrShortGame, true);
  cal = recordConfirmation(cal, partialSw, 'SW', partialPred);
  assert.equal(cal.clubs.SW, undefined, 'Partial swing should not seed full-swing SW Gaussian');
  assert.equal(cal.driverSpeedMph, 98, 'Partial swing should not shift driverSpeedMph');

  // Empty bagClubs falls back safely to full CLUB_ORDER
  const emptyBagCal = { ...createEmptyCalibration(98), bagClubs: [] };
  const res = classifyClub({ ball: { speed: 145, vla: 12.5, spin: 2500 }, club_data: { speed: 98, aoa: 2.5 } }, emptyBagCal);
  assert.equal(res.predictedClub, 'DR');
});

