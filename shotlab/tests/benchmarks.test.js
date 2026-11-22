'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { referenceFlights, REFERENCE_LINES } = require('../engine/benchmarks');
const engine = require('../engine');

test('every club has four reference lines with points', () => {
  for (const club of engine.CLUB_ORDER) {
    const refs = referenceFlights(club, 0);
    assert.deepStrictEqual(refs.map((r) => r.id), REFERENCE_LINES.map((l) => l.id), club);
    for (const r of refs) assert.ok(r.points.length >= 2 && r.points.length <= 32 && r.carryYds > 0 && r.apexFt > 0, `${club} ${r.id}`);
  }
});

test('tiers never out-carry or out-fly a lower handicap order (Tour >= Scratch >= Low >= Mid)', () => {
  for (const club of engine.CLUB_ORDER) {
    const [tour, scr, low, mid] = referenceFlights(club, 0);
    assert.ok(tour.carryYds >= scr.carryYds && scr.carryYds >= low.carryYds && low.carryYds >= mid.carryYds, club);
  }
});

test('tour 7-iron lands near TrackMan PGA Tour averages (~172 yd carry, ~32 yd max height)', () => {
  const tour = referenceFlights('7I', 0).find((r) => r.id === 'tour');
  assert.ok(Math.abs(tour.carryYds - 172) <= 8, `carry ${tour.carryYds}`);
  assert.ok(Math.abs(tour.apexFt - 96) <= 12, `apex ${tour.apexFt}`);
});

test('analyzed shots carry references for their club', () => {
  const { makeDemoShot } = require('../engine/demo_shots');
  const shot = engine.analyzeShot(makeDemoShot(null, 1, true), engine.createEmptyCalibration(98), {});
  assert.ok(Array.isArray(shot.references) && shot.references.length === 4);
});
