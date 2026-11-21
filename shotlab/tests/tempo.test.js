'use strict';
const test = require('node:test');
const assert = require('node:assert');
const audio = require('../renderer/audio.js');

test('non-stop keeps the preset pause and has no ready cue', () => {
  const t = audio.tempoCycleTimings('24/8', 0);
  assert.strictEqual(t.top, 800);
  assert.strictEqual(t.impact, 1067);
  assert.strictEqual(t.next, 1067 + audio.TEMPO_PRESETS['24/8'].pauseMs);
  assert.strictEqual(t.ready, null);
});

test('a rest gap spaces swings and adds a ready tick 1 s before the next takeaway', () => {
  const t = audio.tempoCycleTimings('18/9', 8);
  assert.strictEqual(t.impact, 900);
  assert.strictEqual(t.next, 900 + 8000);
  assert.strictEqual(t.ready, t.next - 1000);
});

test('bad or huge gaps fall back / clamp', () => {
  assert.strictEqual(audio.tempoCycleTimings('24/8', 'abc').ready, null);
  assert.strictEqual(audio.tempoCycleTimings('24/8', 999).restMs, 120000);
  assert.strictEqual(audio.tempoCycleTimings('nope', 0).top, 800);
});

test('every sound set has three beats and options normalise', () => {
  for (const set of Object.values(audio.TEMPO_SOUNDS)) assert.strictEqual(set.beats.length, 3, set.id);
  assert.deepStrictEqual(audio.setTempoOptions({ sound: 'woodblock', gapSec: 5 }), { sound: 'woodblock', gapSec: 5 });
  assert.deepStrictEqual(audio.setTempoOptions({ sound: 'bogus', gapSec: -3 }), { sound: 'woodblock', gapSec: 5 });
});
