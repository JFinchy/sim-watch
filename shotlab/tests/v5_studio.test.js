'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const engine = require('../engine');
const { DEMO_SHOTS } = require('../engine/demo_shots');
const { referenceLaunch } = require('../engine/benchmarks');
const svg = require('../renderer/svg');
const charts = require('../renderer/charts');
const challenges = require('../renderer/challenges');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch {}

test('Tour Pro benchmark tier grades strictly >= Scratch and has 0.0 SG offset', () => {
  assert.ok(engine.BENCHMARK_TIERS.tour_pro, 'BENCHMARK_TIERS.tour_pro should exist');
  const tourLaunch = referenceLaunch('tour_pro', '7I');
  const legacyTour = referenceLaunch('tour', '7I');
  assert.deepEqual(tourLaunch, legacyTour);

  const demo = DEMO_SHOTS.find((d) => d.id === 'flipping_floater_7i') || DEMO_SHOTS[0];
  const tour = engine.analyzeShot(demo, { clubOverride: '7I', tierId: 'tour_pro' });
  const scratch = engine.analyzeShot(demo, { clubOverride: '7I', tierId: 'scratch' });
  const low = engine.analyzeShot(demo, { clubOverride: '7I', tierId: 'low_hcp' });
  const mid = engine.analyzeShot(demo, { clubOverride: '7I', tierId: 'mid_hcp' });

  assert.equal(tour.scorecard.tierId, 'tour_pro');
  assert.ok(mid.scorecard.score >= low.scorecard.score);
  assert.ok(low.scorecard.score >= scratch.scorecard.score);
  assert.ok(scratch.scorecard.score >= tour.scorecard.score);
  assert.equal(tour.strokesGained.sg, tour.strokesGained.sgPga, 'Tour Pro SG should match PGA baseline (0.0 offset)');
});

test('Analyzed shots include Offline card, goalDelta strings, coupledSignals, and faultCoach', () => {
  const drills = engine.loadDrillsHubData(path.resolve(__dirname, '../..')).drills;
  const fat = DEMO_SHOTS.find((d) => d.id === 'fat_pw');
  const analysis = engine.analyzeShot(fat, { clubOverride: 'PW', drills, matType: 'fiberbuilt' });

  const offlineCard = analysis.scorecard.cards.find((c) => c.key === 'offline');
  assert.ok(offlineCard, 'Offline card should exist on scorecard');
  for (const c of analysis.scorecard.cards) {
    assert.ok('goalDelta' in c, `Missing goalDelta on ${c.key}`);
    assert.ok(c.helpKey, `Missing helpKey on ${c.key}`);
  }

  assert.ok(analysis.coupledSignals && Array.isArray(analysis.coupledSignals.cards));
  assert.equal(analysis.coupledSignals.cards.length, 4);
  const turfCard = analysis.coupledSignals.cards.find((c) => c.id === 'turfStrike');
  assert.equal(turfCard.verdict, 'MAT-SAVED FAT RISK');

  const flip = engine.analyzeShot(DEMO_SHOTS.find((d) => d.id === 'flipping_floater_7i'), { clubOverride: '7I', drills });
  const launchCard = flip.coupledSignals.cards.find((c) => c.id === 'launchSpin');
  assert.match(launchCard.verdict, /OVER-LAUNCHED|HIGH LAUNCH/);
  assert.ok(flip.faultCoach && flip.faultCoach.feelsToTry.length > 0);
  assert.ok(flip.faultCoach.recommendedDrills.length > 0);
});

test('SwingDatabase migrates pre-existing v2 table, soft-deletes, restores, trims outliers, and aggregates heatmap/highlights/SG', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotlab-v5-'));
  const dbPath = path.join(tmpDir, 'swings.sqlite');
  try {
    if (DatabaseSync) {
      // Seed legacy v2 schema without `deleted` column
      const legacy = new DatabaseSync(dbPath);
      legacy.exec(`
        CREATE TABLE shots (
          id TEXT PRIMARY KEY, ts TEXT NOT NULL, session_date TEXT NOT NULL, club TEXT NOT NULL,
          predicted_club TEXT, confirmed_club TEXT, confidence REAL, practice_mode TEXT DEFAULT 'real',
          feel_id TEXT, drill_id TEXT, source TEXT DEFAULT 'live',
          ball_speed REAL, club_speed REAL, smash REAL, vla REAL, hla REAL, total_spin REAL, back_spin REAL, spin_axis REAL,
          aoa REAL, path REAL, face_to_target REAL, face_to_path REAL, est_dyn_loft REAL, est_shaft_lean REAL,
          carry_yds REAL, total_yds REAL, apex_ft REAL, descent_deg REAL, curve_yds REAL, offline_yds REAL,
          shot_shape TEXT, delivery_id TEXT, delivery_name TEXT, strike_location TEXT,
          score INTEGER, sg_shot REAL, left_on_table_yds REAL, clip_dtl TEXT, clip_fo TEXT, is_goto INTEGER DEFAULT 0, raw_json TEXT
        );
      `);
      legacy.close();
    }

    const db = new engine.SwingDatabase(dbPath);
    const makeShot = (idx, carry, clubSpeed, strike = 'center', club = '7I') => {
      const a = engine.analyzeShot({
        ts: new Date(Date.now() - idx * 60000).toISOString(),
        shot_num: idx + 1,
        club,
        ball: { speed: carry * 0.72, vla: 17.5, hla: 0.8, spin: 6500, spin_axis: -2 },
        club_data: clubSpeed ? { speed: clubSpeed, aoa: -4.0, path: 1.5 } : undefined,
      }, { clubOverride: club });
      a.flight.carryYds = carry;
      a.metrics.effectiveCarry = carry;
      if (a.strike) a.strike.location = strike;
      return a;
    };

    const s1 = makeShot(1, 165, 86);
    const s2 = makeShot(2, 166, 86);
    const s3 = makeShot(3, 164, 86);
    const s4 = makeShot(4, 165, 86);
    const outlier = makeShot(5, 85, 86, 'fat'); // wild mishit outlier
    const noClub = makeShot(6, 160, null);
    const drShot = makeShot(7, 255, 98, 'center', 'DR');
    for (const s of [s1, s2, s3, s4, outlier, noClub, drShot]) db.upsertShot(s);

    assert.equal(db.getClubShots({ club: '7I', mode: 'real', days: 30 }).length, 6);
    assert.equal(db.getClubShots({ club: '7I', mode: 'real', days: 30, quality: 'full' }).length, 5);

    // Outlier trim on 7I full-read shots excludes 85y shot
    const trimmed = db.getBagGapping({ mode: 'real', days: 30, quality: 'full', category: 'irons', trimOutliers: true });
    const row7 = trimmed.find((c) => c.club === '7I');
    assert.ok(row7 && row7.outliersTrimmed >= 1 && row7.avgCarry > 160);
    assert.equal(trimmed.find((c) => c.club === 'DR'), undefined, 'category=irons should filter out DR');

    // Soft delete & restore
    assert.equal(db.softDeleteShot(outlier.id), true);
    assert.equal(db.getDeletedCount(), 1);
    assert.equal(db.getClubShots({ club: '7I', mode: 'real', days: 30 }).length, 5);
    assert.equal(db.restoreDeletedShots({ club: '7I' }), 1);
    assert.equal(db.getDeletedCount(), 0);
    assert.equal(db.getClubShots({ club: '7I', mode: 'real', days: 30 }).length, 6);

    const hm = db.getPracticeHeatmap({ days: 91 });
    assert.equal(hm.length, 91);
    assert.ok(hm.some((d) => d.count > 0));
    assert.ok(db.getHighlights({ mode: 'real', days: 30 }).length >= 1);
    const sgCats = db.getSgByCategory({ mode: 'real', days: 30 });
    assert.equal(sgCats.length, 3);
    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('computeDispersionStats computes faultLeaks.isFault, twoWayMiss, cruiseSpeedBuckets, and 100%-summed rootCauseAttribution', () => {
  const shots = [
    { id: '1', carry_yds: 252, offline_yds: -12, club_speed: 98, smash: 1.49, aoa: 3.1, path: 2.0, face_to_path: -1.5, sg_shot: 0.25, score: 92, delivery_id: 'tour_sweep', delivery_name: 'Tour Sweep' },
    { id: '2', carry_yds: 254, offline_yds: -8, club_speed: 98, smash: 1.50, aoa: 3.4, path: 1.8, face_to_path: -1.2, sg_shot: 0.29, score: 94, delivery_id: 'tour_sweep', delivery_name: 'Tour Sweep' },
    { id: '3', carry_yds: 225, offline_yds: -28, club_speed: 104, smash: 1.41, aoa: 1.0, path: 3.5, face_to_path: -6.2, sg_shot: -0.55, score: 44, delivery_id: 'low_hook_trap', delivery_name: 'Low Hook Trap' },
    { id: '4', carry_yds: 230, offline_yds: 26, club_speed: 104, smash: 1.40, aoa: -1.2, path: -4.1, face_to_path: 5.5, sg_shot: -0.48, score: 48, delivery_id: 'over_hold', delivery_name: 'Over Hold' },
    { id: '5', carry_yds: 245, offline_yds: 2, club_speed: 96, smash: 1.47, aoa: 2.5, path: 0.5, face_to_path: 0.4, sg_shot: 0.14, score: 85, delivery_id: 'solid_driver', delivery_name: 'Solid Driver' },
  ];
  const stats = engine.computeDispersionStats(shots, { club: 'DR' });
  assert.equal(stats.twoWayMiss.detected, true);
  assert.equal(stats.optimalCruiseMph, 98);
  assert.ok(stats.cruiseSpeedBuckets.length >= 2);
  assert.equal(stats.rootCauseAttribution.reduce((a, x) => a + x.impactPct, 0), 100);
  const sweep = stats.faultLeaks.find((l) => l.deliveryId === 'tour_sweep');
  const hook = stats.faultLeaks.find((l) => l.deliveryId === 'low_hook_trap');
  assert.equal(sweep.isFault, false);
  assert.equal(hook.isFault, true);
});

test('ShotLabSVG 4-type CAD clubface & goal curve render without NaN and preserve LH/low-apex contracts', () => {
  for (const club of ['DR', '4H', '7I', 'SW']) {
    const a = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: club });
    const rh = svg.renderClubfaceMap(a.strike, a.clubSpec, 'RH');
    const lh = svg.renderClubfaceMap(a.strike, a.clubSpec, 'LH');
    assert.ok(rh.includes('<svg') && !rh.includes('NaN'));
    assert.ok(lh.includes('scale(-1, 1)') && lh.indexOf('>TOE<') < lh.indexOf('>HEEL<'));
  }
  const traj = svg.renderSideTrajectory(
    { carryYds: 165, apexFt: 90, points: [{ x: 0, y: 0 }, { x: 80, y: 90 }, { x: 165, y: 0 }] },
    { totalLeftOnTableYds: 4, ghostPoints: [] },
    'green', [], [],
    { goalFlight: { carryYds: 170, points: [{ x: 0, y: 0 }, { x: 85, y: 95 }, { x: 170, y: 0 }] } }
  );
  assert.ok(traj.includes('#10f296') && !traj.includes('NaN'));
});

test('ShotLabCharts and ShotLabChallenges execute cleanly with 0 NaN', () => {
  const leaksHtml = charts.renderDeliveryFaultsByCost([
    { deliveryId: 'pure_compression', deliveryName: 'Pure Compression', isFault: false, count: 7, pct: 88, avgSg: 0.14, totalSg: 0.98, avgLostYds: 0 },
    { deliveryId: 'flipping_floater', deliveryName: 'Flipping Floater', isFault: true, count: 1, pct: 13, avgSg: -0.48, totalSg: -0.48, avgLostYds: 14 },
  ], { faultsOnly: false });
  assert.ok(leaksHtml.includes('Pure Compression') && leaksHtml.includes('Flipping Floater'));

  const onlyFaults = charts.renderDeliveryFaultsByCost([
    { deliveryId: 'pure_compression', deliveryName: 'Pure Compression', isFault: false, count: 7, pct: 88, avgSg: 0.14, totalSg: 0.98 },
    { deliveryId: 'flipping_floater', deliveryName: 'Flipping Floater', isFault: true, count: 1, pct: 13, avgSg: -0.48, totalSg: -0.48 },
  ], { faultsOnly: true });
  assert.ok(!onlyFaults.includes('Pure Compression') && onlyFaults.includes('Flipping Floater'));

  const spline = charts.renderSmoothSplineSvg([
    { date: '2026-11-18', avgScore: 72, n: 10 },
    { date: '2026-11-20', avgScore: 81, n: 14 },
  ], 'avgScore');
  assert.ok(spline.includes('<svg') && !spline.includes('NaN'));

  const store = challenges.createChallengeStore();
  const demo = engine.analyzeShot(DEMO_SHOTS.find((d) => d.id === 'pure_7i'), { clubOverride: '7I' });
  for (const id of ['combine18', 'shape_caller', 'pressure5', 'course3']) {
    store.setActive(id);
    const res = store.recordShot(demo);
    assert.equal(res.recorded, true);
    assert.ok(store.getObsPayload().score);
  }
});

test('OBS overlay.js renders all 11 widgets (including challenge and verdict) without NaN or undefined', () => {
  const obsJs = fs.readFileSync(path.join(__dirname, '..', 'obs', 'overlay.js'), 'utf8');
  const analyzed = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: '7I' });
  const widgets = ['hud', 'shape', 'metrics', 'diagnosis', 'compact', 'club', 'tracer', 'dispersion', 'ticker', 'challenge', 'verdict'];

  for (const w of widgets) {
    let renderedHtml = '';
    const listeners = {};
    const rootEl = {
      classList: { add() {}, remove() {}, contains() { return false; } },
      set innerHTML(v) { renderedHtml = String(v); },
      get innerHTML() { return renderedHtml; },
    };
    const ctx = vm.createContext({
      window: {
        location: { search: `?widget=${w}` },
        ShotLabSVG: svg,
        URLSearchParams,
      },
      document: { getElementById: (id) => (id === 'overlay-root' ? rootEl : null) },
      EventSource: function () {
        return { addEventListener(k, fn) { listeners[k] = fn; } };
      },
      fetch: () => Promise.resolve({
        json: () => Promise.resolve({
          shot: analyzed,
          settings: { handedness: 'RH', practiceMode: 'real', obsAutoHideSec: 0 },
          challengeState: { name: '5/5 Pressure Gate', score: '3 / 5', streak: 3, target: 'HLA ±1.5°' },
          sessionTicker: { count: 4, avgScore: 82, avgCarry: 165, avgSg: 0.12, activeClub: '7I' },
          dispersion: engine.computeDispersionStats([analyzed], { club: '7I' }),
        }),
      }),
      URLSearchParams, setTimeout, clearTimeout,
    });
    ctx.window.document = ctx.document;
    vm.runInContext(obsJs, ctx);
    listeners.shot?.({
      data: JSON.stringify({
        shot: analyzed,
        settings: { handedness: 'RH', practiceMode: 'real' },
        challengeState: { name: '5/5 Pressure Gate', score: '3 / 5', streak: 3, target: 'HLA ±1.5°' },
        sessionTicker: { count: 4, avgScore: 82, avgCarry: 165, avgSg: 0.12, activeClub: '7I' },
        dispersion: engine.computeDispersionStats([analyzed], { club: '7I' }),
      }),
    });
    assert.ok(renderedHtml.length > 20, `${w} widget should render HTML`);
    assert.ok(!renderedHtml.includes('NaN') && !renderedHtml.includes('undefined'), `${w} had NaN/undefined`);
  }
});

// ==================== CYCLE 1 REVIEW REGRESSION TESTS ====================

test('OBS challenge SSE state updates flow after initial shot, handle null/XSS, and overlay.css has zero backdrop-filter', () => {
  const obsJs = fs.readFileSync(path.join(__dirname, '..', 'obs', 'overlay.js'), 'utf8');
  const obsCss = fs.readFileSync(path.join(__dirname, '..', 'obs', 'overlay.css'), 'utf8');
  assert.equal(/backdrop-filter\s*:/i.test(obsCss), false, 'obs/overlay.css must not use backdrop-filter');

  const analyzed = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: '7I' });
  let renderedHtml = '';
  const listeners = {};
  const rootEl = {
    classList: { add() {}, remove() {}, contains() { return false; } },
    set innerHTML(v) { renderedHtml = String(v); },
    get innerHTML() { return renderedHtml; },
  };
  const ctx = vm.createContext({
    window: { location: { search: '?widget=challenge' }, ShotLabSVG: svg, URLSearchParams },
    document: { getElementById: (id) => (id === 'overlay-root' ? rootEl : null) },
    EventSource: function () { return { addEventListener(k, fn) { listeners[k] = fn; } }; },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    URLSearchParams, setTimeout, clearTimeout,
  });
  ctx.window.document = ctx.document;
  vm.runInContext(obsJs, ctx);

  // Initial shot sets lastShotId with 0/5
  listeners.shot({
    data: JSON.stringify({
      shot: analyzed,
      settings: { handedness: 'RH', practiceMode: 'real' },
      challengeState: { name: '5/5 Pressure Gate', score: '0 / 5', streak: 0, target: 'HLA ±1.5°' },
    }),
  });
  assert.ok(renderedHtml.includes('0 / 5'));

  // Subsequent state event (isNewShot = false, same shot.id) must update score & escape XSS
  listeners.state({
    data: JSON.stringify({
      shot: analyzed,
      settings: { handedness: 'RH', practiceMode: 'real' },
      challengeState: { name: '<img src=x onerror=alert(1)>', score: '1 / 5', streak: 1, target: 'HLA ±1.5°' },
    }),
  });
  assert.ok(renderedHtml.includes('1 / 5'), 'OBS challenge widget must apply SSE state updates');
  assert.ok(!renderedHtml.includes('<img src=x'), 'OBS challenge widget must HTML-escape name');

  // Null shot + null challengeState falls back gracefully
  listeners.state({ data: JSON.stringify({ shot: null, challengeState: null, settings: {} }) });
  assert.ok(renderedHtml.includes('5/5 Pressure Gate') && renderedHtml.includes('0 / 5'));
  assert.ok(!renderedHtml.includes('NaN') && !renderedHtml.includes('undefined'));
});

test('Prototype keys (constructor/toString) and invalid category never crash engine or SwingDatabase', () => {
  const demo = DEMO_SHOTS[0];
  const analyzed = engine.analyzeShot(demo, { clubOverride: '7I', tierId: 'constructor' });
  assert.equal(analyzed.scorecard.tierId, 'low_hcp');
  assert.equal(referenceLaunch('constructor', 'toString'), null);

  const sg = engine.computeShotStrokesGained({
    clubSpec: engine.getClubSpec('7I'),
    carryYds: 165,
    totalYds: 172,
    offlineYds: 3,
    tierId: 'constructor',
  });
  assert.equal(typeof sg.sg, 'number');

  const db = new engine.SwingDatabase(':memory:');
  db.upsertShot(analyzed);
  const bag = db.getBagGapping({ category: 'toString' });
  assert.equal(bag.length, engine.CLUB_ORDER.length);
  db.close();
});

test('SwingDatabase soft-delete stays excluded across all queries and survives JSON-fallback re-upsert', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotlab-del-'));
  try {
    const db = new engine.SwingDatabase(path.join(tmpDir, 'fallback.sqlite'));
    // Force JSON-fallback code path explicitly
    db.close();
    db.db = null;
    db.backend = 'json-fallback';
    db._fallbackFile = path.join(tmpDir, 'fallback.json');

    const a = engine.analyzeShot(DEMO_SHOTS.find((d) => d.id === 'pure_7i'), { clubOverride: '7I' });
    a.clipDtl = '2026-11-21_DTL.mp4';
    db.upsertShot(a, { source: 'live', clip: a.clipDtl });
    assert.equal(db.softDeleteShot(a.id), true);
    assert.equal(db.isDeleted(a.id), true);

    // Re-upserting on bridge reconnect must NOT resurrect deleted shot in JSON fallback
    db.upsertShot(a, { source: 'simwatch_history' });
    assert.equal(db.isDeleted(a.id), true);
    assert.equal(db.getDeletedCount(), 1);
    assert.equal(db.getShotById(a.id), null);
    assert.equal(db.markGoTo(a.id, true), false);
    assert.equal(db.getSummary().totalShots, 0);
    assert.equal(db.getBestShotForClub('7I'), null);
    assert.equal(db.getHighlights({ mode: 'real', days: 30 }).length, 0);
    assert.equal(db.getClubPatterns({ club: '7I', mode: 'real', days: 30 }).n, 0);
    assert.equal(db.getSessionTrends({ club: '7I', mode: 'real', days: 30 }).length, 0);
    assert.equal(db.getFeelComparison({ club: '7I', mode: 'real', days: 30 }).length, 0);
    assert.equal(db.getFatigueCurve({ mode: 'real', days: 30 }).every((b) => b.n === 0), true);
    assert.equal(db.getSgByCategory({ mode: 'real', days: 30 }).every((c) => c.n === 0), true);
    assert.equal(db.getPracticeHeatmap({ days: 7 }).every((d) => d.count === 0), true);
    assert.equal(db.getBagGapping({ mode: 'real', days: 30 }).find((c) => c.club === '7I').n, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getBagGapping trimOutliers handles carry<=0 toppers and MAD=0 identically without discarding real swings', () => {
  const db = new engine.SwingDatabase(':memory:');
  const makeCarry = (idx, carry) => {
    const a = engine.analyzeShot({
      ts: new Date(Date.now() - idx * 60000).toISOString(),
      shot_num: idx + 1,
      club: '7I',
      ball: { speed: 118, vla: 17, hla: 0.5, spin: 6400, spin_axis: -2, carry },
      club_data: { speed: 86, aoa: -4, path: 1.5 },
    }, { clubOverride: '7I' });
    a.metrics.effectiveCarry = carry;
    a.flight.carryYds = carry;
    db.upsertShot(a);
  };
  makeCarry(1, 165);
  makeCarry(2, 165);
  makeCarry(3, 0);
  makeCarry(4, 0);
  makeCarry(5, 0);
  const res = db.getBagGapping({ mode: 'real', days: 30, trimOutliers: true });
  const row7 = res.find((c) => c.club === '7I');
  assert.equal(row7.n, 2);
  assert.equal(row7.avgCarry, 165);
  assert.equal(row7.outliersTrimmed, 3);
  db.close();
});

test('Measured ball.carry propagates to coupledSignals, and no-club / missing-ball / almost / sore modes remain honest', () => {
  const drills = engine.loadDrillsHubData(path.resolve(__dirname, '../..')).drills;
  const measuredShot = engine.analyzeShot({
    ts: '2026-11-21T20:00:00Z',
    shot_num: 1,
    club: '7I',
    ball: { speed: 115, vla: 18, hla: 0.5, spin: 6800, spin_axis: -1, carry: 150 },
    club_data: { speed: 86, aoa: -4.2, path: 1.4 },
  }, { clubOverride: '7I', drills });
  const speedCard = measuredShot.coupledSignals.cards.find((c) => c.id === 'speedEfficiency');
  assert.equal(speedCard.rows.find((r) => r.label === 'Actual Carry').value, '150 yds');

  // Missing club data + missing VLA: shaftLean ungraded, launchSpin partial
  const partialBallOnly = engine.analyzeShot({
    ts: '2026-11-21T20:02:00Z',
    shot_num: 2,
    club: 'DR',
    ball: { speed: 152, hla: 0.2, spin_axis: 22 },
  }, { clubOverride: 'DR', drills });
  const leanCard = partialBallOnly.scorecard.cards.find((c) => c.key === 'shaftLean');
  assert.equal(leanCard.source, 'missing');
  assert.equal(leanCard.grade, 'neutral');
  assert.equal(partialBallOnly.coupledSignals.cards.find((c) => c.id === 'launchSpin').severity, 'neutral');
  assert.equal(partialBallOnly.coupledSignals.cards.find((c) => c.id === 'dplaneShape').severity, 'red');

  // Almost (Kids-Asleep) + no club read + foam_na SVG
  const almostNoClub = engine.analyzeShot({
    ts: '2026-11-21T20:04:00Z',
    shot_num: 3,
    club: '7I',
    ball: { speed: 58, vla: 22, hla: 2.3, spin: 3100 },
  }, { clubOverride: '7I', practiceMode: 'almost', drills });
  assert.equal(almostNoClub.coupledSignals.cards.find((c) => c.id === 'turfStrike').rows[0].value, '—');
  assert.equal(almostNoClub.coupledSignals.cards.find((c) => c.id === 'dplaneShape').severity, 'yellow');
  assert.ok(!almostNoClub.faultCoach.likelyCauses.some((c) => /Face strike inference paused/i.test(c)));
  const foamSvg = svg.renderClubfaceMap(almostNoClub.strike, almostNoClub.clubSpec, 'LH');
  assert.ok(foamSvg.includes('QUIET') && !foamSvg.includes('_spot'));

  // Gym-Sore explanation distinct from foam balls
  const soreShot = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: '7I', practiceMode: 'sore' });
  assert.match(soreShot.strokesGained.explanation, /Gym-Sore/i);
});

test('External diagnoseCoupledSignals respects LH handedness on stripped dplane & computeDispersionStats handles empty/mixed SG', () => {
  const lhHook = engine.analyzeShot({
    ts: '2026-11-21T20:10:00Z',
    shot_num: 1,
    club: 'DR',
    ball: { speed: 158, vla: 9.5, hla: 2.5, spin: 1900, spin_axis: 18 },
    club_data: { speed: 105, aoa: 2.0, path: -2.0 },
  }, { clubOverride: 'DR', handedness: 'LH' });
  const extCoupled = engine.diagnoseCoupledSignals(
    lhHook.metrics, lhHook.flight, lhHook.dplane, lhHook.delivery, lhHook.strike,
    engine.getClubSpec('DR'), lhHook.potential, { practiceMode: 'real', handedness: 'LH' }
  );
  assert.equal(extCoupled.cards.find((c) => c.id === 'dplaneShape').verdict, 'SNAP-HOOK / OVER-DRAW TRAP');

  const emptyDisp = engine.computeDispersionStats([], { club: '7I' });
  assert.ok(Array.isArray(emptyDisp.cruiseSpeedBuckets) && Array.isArray(emptyDisp.rootCauseAttribution));
  assert.equal(emptyDisp.twoWayMiss.detected, false);

  const almostStats = engine.computeDispersionStats([
    { id: '1', carry_yds: 90, offline_yds: 1, club_speed: 86, score: 82 },
    { id: '2', carry_yds: 92, offline_yds: 2, club_speed: 86, score: 85 },
  ], { club: '7I' });
  assert.equal(almostStats.cruiseSpeedBuckets[0].bigMissPct, null);
  assert.equal(almostStats.rootCauseAttribution.length, 0, 'Do not fabricate 25% bars with <3 club-read samples');
});

test('ShotLabChallenges, drillsBridge reverse fault mapping, and charts.METRIC_HELP.sg work cleanly', () => {
  assert.ok(charts.METRIC_HELP.sg && charts.METRIC_HELP.sg.title.includes('Strokes Gained'));
  const hub = engine.loadDrillsHubData(path.resolve(__dirname, '../..'));
  assert.ok(hub.faultToDrillIds && Array.isArray(hub.faultToDrillIds.flipping_floater));
  assert.ok(hub.drills.some((d) => Array.isArray(d.shotlabFaultIds) && d.shotlabFaultIds.includes('flipping_floater')));

  const store = challenges.createChallengeStore();
  // Reject non-finite flight metrics
  assert.equal(store.recordShot({ metrics: { effectiveCarry: null }, flight: { carryYds: null, offlineYds: null }, shotShape: {} }).recorded, false);

  const good7 = engine.analyzeShot(DEMO_SHOTS.find((d) => d.id === 'pure_7i'), { clubOverride: '7I' });
  // combine18 stops at 18 shots
  store.setActive('combine18');
  for (let i = 0; i < 18; i += 1) assert.equal(store.recordShot(good7).recorded, true);
  assert.equal(store.recordShot(good7).done, true);

  // wedge21 stops at 21 points and resets clean
  store.setActive('wedge21');
  const pinShot = { metrics: { effectiveCarry: 75, hla: 0, path: 0, smash: 1.3 }, flight: { carryYds: 75, offlineYds: 0 }, shotShape: { name: 'Straight' } };
  for (let i = 0; i < 6; i += 1) {
    const nxtPin = [75, 90, 105, 85, 115, 95][i];
    pinShot.metrics.effectiveCarry = nxtPin;
    pinShot.flight.carryYds = nxtPin;
    const r = store.recordShot(pinShot);
    if (store.state.wedgePoints >= 21) break;
    assert.equal(r.recorded, true);
  }
  assert.equal(store.state.wedgePoints, 21);
  assert.equal(store.recordShot(pinShot).done, true);

  // iron_ladder resets streak on miss and does not bleed streak to combine18
  store.setActive('iron_ladder');
  store.state.ladderStreak = 2;
  store.recordShot(good7); // 168 vs 135 -> miss
  assert.equal(store.state.ladderStreak, 0);
  store.state.ladderStreak = 3;
  store.setActive('combine18');
  assert.equal(store.getObsPayload().streak, 0);

  // course3 completion guard + setBests
  store.setActive('course3');
  for (let i = 0; i < 5; i += 1) store.recordShot(good7);
  assert.equal(store.state.course.stage, 'done');
  assert.equal(store.recordShot(good7).done, true);
  store.setBests({ pressure5: 4 });
  assert.equal(store.state.bests.pressure5, 4);
});

// ==================== CYCLE 2 REVIEW REGRESSION TESTS ====================

test('Cycle 2: prototype keys blocked in normalizeClubCode, recommendDrillsForFault, and buildFaultCoach', () => {
  const drills = engine.loadDrillsHubData(path.resolve(__dirname, '../..')).drills;
  assert.equal(engine.normalizeClubCode('constructor'), null);
  assert.equal(engine.normalizeClubCode('toString'), null);
  assert.deepEqual(engine.recommendDrillsForFault('constructor', drills), []);
  assert.doesNotThrow(() => {
    const fc = engine.buildFaultCoach({ id: 'constructor', cues: [] }, null, null, {}, engine.getClubSpec('7I'), drills, 'real');
    assert.equal(fc.faultKey, null);
  });
});

test('Cycle 2: SwingDatabase preserves confirmed club & derived metrics across SQLite and JSON-fallback unconfirmed re-upserts', () => {
  const rawBase = {
    ts: '2026-11-22T01:00:00Z',
    shot_num: 1,
    ball: { speed: 118, vla: 17.5, hla: 0.4, spin: 6400, spin_axis: -2 },
    club_data: { speed: 86, aoa: -4.2, path: 1.5 },
  };
  const confirmed = engine.analyzeShot({ ...rawBase, confirmed_club: '7I' }, { clubOverride: '7I' });
  const unconfirmed6I = engine.analyzeShot({ ...rawBase, club: '6I' }, {});
  unconfirmed6I.confirmedClub = null;
  unconfirmed6I.activeClub = '6I';

  // 1. SQLite path
  const db = new engine.SwingDatabase(':memory:');
  db.upsertShot(confirmed);
  const before = db.getShotById(confirmed.id);
  db.upsertShot(unconfirmed6I, { source: 'simwatch_history' });
  const after = db.getShotById(confirmed.id);
  assert.equal(after.club, '7I');
  assert.equal(after.confirmed_club, '7I');
  assert.equal(after.est_shaft_lean, before.est_shaft_lean);
  assert.equal(after.score, before.score);
  assert.equal(after.sg_shot, before.sg_shot);
  assert.equal(after.delivery_id, before.delivery_id);
  assert.equal(after.raw_json, before.raw_json);
  db.close();

  // 2. JSON-fallback path
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shotlab-c2-fb-'));
  try {
    const fb = new engine.SwingDatabase(path.join(tmpDir, 'fb.sqlite'));
    fb.close();
    fb.db = null;
    fb.backend = 'json-fallback';
    fb._fallbackFile = path.join(tmpDir, 'fb.json');
    fb.upsertShot(confirmed);
    const fbBefore = fb.getShotById(confirmed.id);
    fb.upsertShot(unconfirmed6I, { source: 'simwatch_history' });
    const fbAfter = fb.getShotById(confirmed.id);
    assert.equal(fbAfter.club, '7I');
    assert.equal(fbAfter.confirmed_club, '7I');
    assert.equal(fbAfter.est_shaft_lean, fbBefore.est_shaft_lean);
    assert.equal(fbAfter.score, fbBefore.score);
    assert.equal(fbAfter.sg_shot, fbBefore.sg_shot);
    assert.equal(fbAfter.delivery_id, fbBefore.delivery_id);
    assert.equal(fbAfter.raw_json, fbBefore.raw_json);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Cycle 2: diagnoseCoupledSignals & scorecard handle flyer, worm-burner, slow chip, missing ball data, curve-only, and possible=0', () => {
  // 1. Low spin flyer (normal VLA, spin far below 7I window)
  const flyer = engine.analyzeShot({
    ts: '2026-11-22T02:00:00Z',
    club: '7I',
    ball: { speed: 120, vla: 16.5, hla: 0.2, spin: 3800, spin_axis: -1 },
    club_data: { speed: 87, aoa: -4.0, path: 1.0 },
  }, { clubOverride: '7I' });
  const flyerLaunch = flyer.coupledSignals.cards.find((c) => c.id === 'launchSpin');
  assert.equal(flyerLaunch.verdict, 'LOW SPIN FLYER');
  assert.equal(flyerLaunch.severity, 'yellow');

  // 2. Topped worm-burner (vla=0, carry=0)
  const worm = engine.analyzeShot({
    ts: '2026-11-22T02:02:00Z',
    club: '7I',
    ball: { speed: 70, vla: 0, hla: 0, spin: 1200, spin_axis: 0, carry: 0 },
    club_data: { speed: 84, aoa: -6.5, path: 0 },
  }, { clubOverride: '7I' });
  const wormLaunch = worm.coupledSignals.cards.find((c) => c.id === 'launchSpin');
  assert.equal(wormLaunch.verdict, 'TOPPED / WORM-BURNER');
  assert.equal(wormLaunch.severity, 'red');
  assert.equal(worm.coupledSignals.turfCarryRange, null, '0-carry topper must not produce turfCarryRange > carry');
  const wormOff = worm.scorecard.cards.find((c) => c.key === 'offline');
  const wormDesc = worm.scorecard.cards.find((c) => c.key === 'descent');
  assert.equal(wormOff.grade, 'neutral');
  assert.equal(wormOff.value, '—');
  assert.equal(wormDesc.grade, 'neutral');
  assert.equal(wormDesc.value, '—');

  // 3. Slow chip (clubRead=true, smash=null)
  const chipCoupled = engine.diagnoseCoupledSignals(
    { clubRead: true, vla: 30, backSpin: 6500, totalSpin: 6500, smash: null, clubSpeed: null, aoa: -3.0, path: 0.5, hla: 0.4, spinAxis: 0.2, effectiveCarry: 25 },
    { carryYds: 25, apexFt: 18, descentAngleDeg: 45, curveYds: 0, offlineYds: 0.2 },
    { faceToPath: -0.2, _rh: { faceToPath: -0.2 } },
    null,
    { location: 'center', label: 'Center', severity: 'green' },
    engine.getClubSpec('SW'),
    { actualCarryYds: 25, maxCarryAtSpeedYds: 25, totalLeftOnTableYds: 0 },
    { practiceMode: 'real' }
  );
  assert.equal(chipCoupled.cards.find((c) => c.id === 'turfStrike').verdict, 'SHORT GAME / CHIP');
  assert.equal(chipCoupled.cards.find((c) => c.id === 'turfStrike').severity, 'neutral');
  assert.doesNotMatch(chipCoupled.cards.find((c) => c.id === 'speedEfficiency').takeaway, /add 1-dot sticker/i);

  // 4. Missing ball & club data -> PARTIAL FLIGHT DATA
  const partialCoupled = engine.diagnoseCoupledSignals(
    { clubRead: false, vla: null, backSpin: null, totalSpin: null, smash: null, clubSpeed: null, aoa: null, path: null, hla: null, spinAxis: null, effectiveCarry: 0 },
    { carryYds: 0, apexFt: 0, descentAngleDeg: 0, curveYds: 0, offlineYds: 0 },
    null,
    null,
    null,
    engine.getClubSpec('7I'),
    null,
    { practiceMode: 'real' }
  );
  const effPartial = partialCoupled.cards.find((c) => c.id === 'speedEfficiency');
  assert.equal(effPartial.verdict, 'PARTIAL FLIGHT DATA');
  assert.equal(effPartial.severity, 'neutral');

  // 5. Ball-only curve with hla=0, spinAxis=+12 cites spin axis, not +0.0° HLA
  const curveOnly = engine.analyzeShot({
    ts: '2026-11-22T02:04:00Z',
    club: '7I',
    ball: { speed: 118, vla: 17, hla: 0, spin: 6400, spin_axis: 12 },
  }, { clubOverride: '7I' });
  const curveTakeaway = curveOnly.coupledSignals.cards.find((c) => c.id === 'dplaneShape').takeaway;
  assert.match(curveTakeaway, /12\.0° spin axis/i);
  assert.doesNotMatch(curveTakeaway, /\+0\.0° HLA/);

  // 6. Scorecard possible === 0 -> score: null, overallGrade: 'neutral'
  const zeroGraded = engine.analyzeShot({
    ts: '2026-11-22T02:06:00Z',
    club: '7I',
    ball: { speed: 55, vla: 20, spin: 2800 },
  }, { clubOverride: '7I', practiceMode: 'almost' });
  assert.equal(zeroGraded.scorecard.score, null);
  assert.equal(zeroGraded.scorecard.overallGrade, 'neutral');
});

test('Cycle 2: Bag trimOutliers MAD=0 & single airborne with toppers, Tour Pro strict boundary, and attribution descending sum', () => {
  const db = new engine.SwingDatabase(':memory:');
  const seedCarry = (idx, club, carry) => {
    const a = engine.analyzeShot({
      ts: new Date(Date.now() - idx * 60000).toISOString(),
      shot_num: idx + 1,
      club,
      ball: { speed: carry > 0 ? 118 : 40, vla: carry > 0 ? 17 : 1, hla: 0, spin: 6400, spin_axis: 0, carry },
      club_data: { speed: 86, aoa: -4, path: 1.0 },
    }, { clubOverride: club });
    a.metrics.effectiveCarry = carry;
    a.flight.carryYds = carry;
    db.upsertShot(a);
  };

  // 4 identical 165y carries + 1 outlier (MAD=0)
  for (let i = 1; i <= 4; i += 1) seedCarry(i, '7I', 165);
  seedCarry(5, '7I', 90);

  // 1 airborne (140y) + 3 toppers (0y)
  seedCarry(10, '9I', 140);
  seedCarry(11, '9I', 0);
  seedCarry(12, '9I', 0);
  seedCarry(13, '9I', 0);

  const bag = db.getBagGapping({ mode: 'real', days: 30, trimOutliers: true });
  const row7 = bag.find((c) => c.club === '7I');
  const row9 = bag.find((c) => c.club === '9I');
  assert.equal(row7.n, 4);
  assert.equal(row7.avgCarry, 165);
  assert.equal(row7.outliersTrimmed, 1);
  assert.equal(row9.n, 1);
  assert.equal(row9.avgCarry, 140);
  assert.equal(row9.outliersTrimmed, 3);
  db.close();

  // Tour Pro strictly < Scratch on boundary smash (1.344: green for Scratch, yellow for Tour Pro)
  const boundaryRaw = {
    ts: '2026-11-22T03:00:00Z',
    club: '7I',
    ball: { speed: 115.6, vla: 17.5, hla: 0.4, spin: 6500, spin_axis: -1.5 },
    club_data: { speed: 86.0, aoa: -4.2, path: 1.0 },
  };
  const tour = engine.analyzeShot(boundaryRaw, { clubOverride: '7I', tierId: 'tour_pro' });
  const scratch = engine.analyzeShot(boundaryRaw, { clubOverride: '7I', tierId: 'scratch' });
  assert.ok(scratch.scorecard.score > tour.scorecard.score, `Expected scratch (${scratch.scorecard.score}) > tour_pro (${tour.scorecard.score})`);

  // Attribution descending sort & exact 100 sum on equal weights
  const tiedDisp = engine.computeDispersionStats([
    { id: '1', carry_yds: 165, offline_yds: 0, smash: 1.36, path: 1, face_to_path: 1, aoa: -4, sg_shot: 0.1, score: 85 },
    { id: '2', carry_yds: 165, offline_yds: 0, smash: 1.36, path: 1, face_to_path: 1, aoa: -4, sg_shot: 0.1, score: 85 },
    { id: '3', carry_yds: 165, offline_yds: 0, smash: 1.36, path: 1, face_to_path: 1, aoa: -4, sg_shot: 0.1, score: 85 },
    { id: '4', carry_yds: 165, offline_yds: 0, smash: 1.36, path: 1, face_to_path: 1, aoa: -4, sg_shot: 0.1, score: 85 },
  ], { club: '7I' });
  const attr = tiedDisp.rootCauseAttribution;
  assert.equal(attr.reduce((a, x) => a + x.impactPct, 0), 100);
  for (let i = 0; i < attr.length - 1; i += 1) {
    assert.ok(attr[i].impactPct >= attr[i + 1].impactPct, `Attribution not descending at ${i}: ${attr[i].impactPct} < ${attr[i + 1].impactPct}`);
  }
});

test('Cycle 2: OBS overlay.js auto-hide off un-fades, re-analysis carry updates, and challenge ignores unrelated settings', () => {
  const obsJs = fs.readFileSync(path.join(__dirname, '..', 'obs', 'overlay.js'), 'utf8');
  const analyzed = engine.analyzeShot(DEMO_SHOTS[0], { clubOverride: '7I' });

  // 1. HUD widget: autoHide >0 -> 0 un-fades + carry re-analysis re-renders
  const classSet = new Set();
  let renderedHtml = '';
  const listeners = {};
  const rootEl = {
    classList: {
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      contains: (c) => classSet.has(c),
    },
    set innerHTML(v) { renderedHtml = String(v); },
    get innerHTML() { return renderedHtml; },
  };
  let fakeTimerId = 0;
  const timers = new Map();
  const hudCtx = vm.createContext({
    window: { location: { search: '?widget=hud' }, ShotLabSVG: svg, URLSearchParams },
    document: { getElementById: (id) => (id === 'overlay-root' ? rootEl : null) },
    EventSource: function () { return { addEventListener(k, fn) { listeners[k] = fn; } }; },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    URLSearchParams,
    setTimeout: (fn) => { const id = ++fakeTimerId; timers.set(id, fn); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  });
  hudCtx.window.document = hudCtx.document;
  vm.runInContext(obsJs, hudCtx);

  listeners.shot({ data: JSON.stringify({ shot: analyzed, settings: { handedness: 'RH', practiceMode: 'real', obsAutoHideSec: 5 } }) });
  assert.equal(timers.size, 1);
  // Trigger fade-out timer
  for (const fn of timers.values()) fn();
  assert.equal(classSet.has('fade-out'), true);

  // Setting obsAutoHideSec -> 0 on same shot un-fades immediately
  listeners.state({ data: JSON.stringify({ shot: analyzed, settings: { handedness: 'RH', practiceMode: 'real', obsAutoHideSec: 0 } }) });
  assert.equal(classSet.has('fade-out'), false);

  // Re-analysis changing effectiveCarry with same shot.id & score re-renders updated carry
  const higherAlt = JSON.parse(JSON.stringify(analyzed));
  higherAlt.metrics.effectiveCarry = analyzed.metrics.effectiveCarry + 14;
  const carryCard = higherAlt.scorecard.cards.find((c) => c.key === 'carry');
  if (carryCard) carryCard.value = String(Math.round(higherAlt.metrics.effectiveCarry));
  listeners.state({ data: JSON.stringify({ shot: higherAlt, settings: { handedness: 'RH', practiceMode: 'real', obsAutoHideSec: 0 } }) });
  assert.ok(renderedHtml.includes(String(Math.round(higherAlt.metrics.effectiveCarry))));

  // 2. Challenge widget does NOT pulse-in when unrelated setting changes
  let chHtml = '';
  const chListeners = {};
  const chRoot = {
    classList: { add() {}, remove() {}, contains() { return false; } },
    set innerHTML(v) { chHtml = String(v); },
    get innerHTML() { return chHtml; },
  };
  const chCtx = vm.createContext({
    window: { location: { search: '?widget=challenge' }, ShotLabSVG: svg, URLSearchParams },
    document: { getElementById: (id) => (id === 'overlay-root' ? chRoot : null) },
    EventSource: function () { return { addEventListener(k, fn) { chListeners[k] = fn; } }; },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    URLSearchParams, setTimeout, clearTimeout,
  });
  chCtx.window.document = chCtx.document;
  vm.runInContext(obsJs, chCtx);
  const chalState = { name: '5/5 Pressure Gate', score: '2 / 5', streak: 2, target: 'Start Line ±1.5°' };
  chListeners.shot({ data: JSON.stringify({ shot: analyzed, settings: { tierId: 'low_hcp' }, challengeState: chalState }) });
  assert.ok(chHtml.includes('pulse-in'));
  chListeners.state({ data: JSON.stringify({ shot: analyzed, settings: { tierId: 'scratch' }, challengeState: chalState }) });
  assert.equal(chHtml.includes('pulse-in'), false, 'Changing unrelated setting must not pulse challenge widget');
});

test('Cycle 2: SVG LH shot-shape goal mirrors RH and Challenges preserve pressure5 bests & null-gate streaks', () => {
  const rh = svg.renderShotShapeIcon({ hlaDeg: 0, curveYds: -4, offlineYds: -3, carryYds: 165, severity: 'green' }, { intendedShape: 'draw', handedness: 'RH' });
  const lh = svg.renderShotShapeIcon({ hlaDeg: 0, curveYds: 4, offlineYds: 3, carryYds: 165, severity: 'green' }, { intendedShape: 'draw', handedness: 'LH' });
  assert.ok(rh.includes('#10f296') && lh.includes('#10f296'));
  const goalPathRe = /<path d="([^"]+)" fill="none" stroke="#10f296"/;
  const rhD = rh.match(goalPathRe)?.[1];
  const lhD = lh.match(goalPathRe)?.[1];
  assert.ok(rhD && lhD && rhD !== lhD, `Expected RH (${rhD}) and LH (${lhD}) dotted goal curves to mirror`);

  const store = challenges.createChallengeStore();
  store.setBests({ pressure5: 3 });
  store.setActive('pressure5');
  const nullGateShot = { metrics: { hla: null, path: 0, smash: 1.38 }, flight: { carryYds: 165, offlineYds: 1 }, shotShape: { name: 'Straight' } };
  const passGateShot = { metrics: { hla: 0.4, path: 0.5, smash: 1.38 }, flight: { carryYds: 165, offlineYds: 1 }, shotShape: { name: 'Straight' } };

  for (let i = 0; i < 4; i += 1) assert.equal(store.recordShot(passGateShot).recorded, true);
  assert.equal(store.state.pressure.streak, 4);
  const missStickerRes = store.recordShot(nullGateShot);
  assert.equal(missStickerRes.recorded, false);
  assert.equal(missStickerRes.bestsChanged, false);
  assert.equal(store.state.pressure.streak, 4, 'Missing HLA must preserve 4/5 streak');

  const clearRes = store.recordShot(passGateShot);
  assert.equal(clearRes.recorded, true);
  assert.equal(store.state.bests.pressure5, 3, 'Must preserve higher persisted pressure5 best');
  assert.equal(clearRes.bestsChanged, false);

  store.setActive('shape_caller');
  assert.equal(store.getObsPayload().score, '0/0 hit');
  // Advance Draw (idx 0) and Fade (idx 1) to reach Straight (idx 2)
  store.recordShot(passGateShot);
  store.recordShot(passGateShot);
  const wildStraight = { metrics: { hla: -4, path: 2, smash: 1.35 }, flight: { carryYds: 165, offlineYds: 2, curveYds: 18 }, shotShape: { name: 'Double Cross' } };
  assert.equal(store.recordShot(wildStraight).pass, false, 'Straight challenge must fail high-curve shot');
});
