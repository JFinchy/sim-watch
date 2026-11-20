'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const engine = require('../engine');
const {
  SwingDatabase,
  deriveSiblingClips,
} = require('../engine/swingDb');
const {
  computeShotStrokesGained,
  computeDispersionStats,
} = require('../engine/strokesGained');
const {
  loadDrillsHubData,
  recommendDrillsForFault,
  detectFaultStreak,
  FAULT_TO_DRILL_IDS,
} = require('../engine/drillsBridge');
const {
  createEmptyCalibration,
  classifyClub,
} = require('../engine/classifier');
const { getClubSpec } = require('../engine/constants');
const audio = require('../renderer/audio');
const svg = require('../renderer/svg');

function makeTempDir(prefix = 'shotlab-v2-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function isoDaysAgo(daysAgo, secondsOffset = 0) {
  const ms = Date.now() - daysAgo * 86400 * 1000 + secondsOffset * 1000;
  return new Date(ms).toISOString();
}

function makeRawShot({
  ts = new Date().toISOString(),
  shot_num = 1,
  club = '7I',
  speed = 113,
  vla = 17.8,
  hla = 0.6,
  spin = 6800,
  spin_axis = -2.0,
  carry = null,
  total = null,
  clubSpeed = 82.5,
  aoa = -4.0,
  pathDeg = 1.4,
  clip = null,
  feel_id = null,
  drill_id = null,
} = {}) {
  return {
    ts,
    shot_num,
    club,
    clip,
    feel_id,
    drill_id,
    ball: {
      speed,
      vla,
      hla,
      spin,
      spin_axis,
      carry,
      total,
    },
    club_data: {
      speed: clubSpeed,
      aoa,
      path: pathDeg,
    },
  };
}

// ============================================================================
// 1. Local SQLite SwingDatabase
// ============================================================================

test('SwingDatabase creates swings.sqlite on node:sqlite, upserts, deduplicates on conflict, links clips & marks Go-To', () => {
  const tmpDir = makeTempDir('shotlab-db-');
  const dbPath = path.join(tmpDir, 'swings.sqlite');
  let db = null;

  try {
    db = new SwingDatabase(dbPath);
    assert.equal(db.backend, 'sqlite', 'Expected node:sqlite backend on Node 22+');
    assert.ok(fs.existsSync(dbPath), 'swings.sqlite file should exist on disk');

    // Demo / preview seed shots must be ignored
    const demoShot = engine.analyzeShot(makeRawShot({ shot_num: 99 }), { clubOverride: '7I' });
    assert.equal(db.upsertShot({ ...demoShot, isDemo: true }), null);
    assert.equal(db.upsertShot({ ...demoShot, isPreviewSeed: true }), null);
    assert.equal(db.getSummary().totalShots, 0);

    // Upsert a real analyzed shot with DTL clip + feel + drill
    const ts1 = isoDaysAgo(1, 10);
    const raw1 = makeRawShot({
      ts: ts1,
      shot_num: 1,
      club: '7I',
      clip: '2026-04-01_10-00-00_DTL.mp4',
      feel_id: 'feel_handle_forward',
      drill_id: 'nine-to-three-delivery',
    });
    const analyzed1 = engine.analyzeShot(raw1, { clubOverride: '7I' });
    const row1 = db.upsertShot(analyzed1);
    assert.equal(row1.club, '7I');
    assert.equal(row1.clip_dtl, '2026-04-01_10-00-00_DTL.mp4');
    assert.equal(row1.clip_fo, '2026-04-01_10-00-00_FO.mp4');
    assert.equal(db.getSummary().totalShots, 1);
    assert.equal(db.getSummary().clipsLinked, 1);

    // Mark as Go-To
    assert.equal(db.markGoTo(analyzed1.id, true), true);
    assert.equal(db.markGoTo('nonexistent_id', true), false);

    // Re-upsert same shot id after confirming a different club (6I) without passing clip/feel/isGoTo:
    // Must deduplicate (totalShots remains 1), update club & score, and preserve clip, feel_id, drill_id, is_goto!
    const reanalyzed = engine.analyzeShot({ ...raw1, clip: null, feel_id: null, drill_id: null }, { clubOverride: '6I' });
    assert.equal(reanalyzed.id, analyzed1.id);
    db.upsertShot(reanalyzed);

    const summaryAfter = db.getSummary();
    assert.equal(summaryAfter.totalShots, 1, 'ON CONFLICT should update in place without duplicating');
    assert.equal(summaryAfter.clipsLinked, 1, 'Existing linked clip should be preserved on conflict');

    const stored = db.getRecentShotsWithClips({ club: '6I' });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].club, '6I');
    assert.equal(stored[0].confirmed_club, '6I');
    assert.equal(stored[0].clip_dtl, '2026-04-01_10-00-00_DTL.mp4');
    assert.equal(stored[0].clip_fo, '2026-04-01_10-00-00_FO.mp4');
    assert.equal(stored[0].feel_id, 'feel_handle_forward');
    assert.equal(stored[0].drill_id, 'nine-to-three-delivery');
    assert.equal(stored[0].is_goto, 1);
    assert.equal(stored[0].score, reanalyzed.scorecard.score);

    // Upsert a second shot with no clip, then attach FO clip via updateClipByTs -> derives DTL sibling too
    const ts2 = isoDaysAgo(1, 25);
    const analyzed2 = engine.analyzeShot(makeRawShot({ ts: ts2, shot_num: 2, club: 'DR', speed: 146, clubSpeed: 99, vla: 12.5, spin: 2450, aoa: 2.8 }), { clubOverride: 'DR' });
    db.upsertShot(analyzed2);
    assert.equal(db.updateClipByTs('1999-01-01T00:00:00.000Z', 'missing_DTL.mp4'), false);
    assert.equal(db.updateClipByTs(ts2, 'swing_002_FO.mp4'), true);

    const drClips = db.getRecentShotsWithClips({ club: 'DR' });
    assert.equal(drClips.length, 1);
    assert.equal(drClips[0].clip_dtl, 'swing_002_DTL.mp4');
    assert.equal(drClips[0].clip_fo, 'swing_002_FO.mp4');

    // Direct deriveSiblingClips edge cases
    assert.deepEqual(deriveSiblingClips('clip_DTL.mkv'), { dtl: 'clip_DTL.mkv', fo: 'clip_FO.mkv' });
    assert.deepEqual(deriveSiblingClips('clip_FO.mp4'), { dtl: 'clip_DTL.mp4', fo: 'clip_FO.mp4' });
    assert.deepEqual(deriveSiblingClips('single_angle.mp4'), { dtl: 'single_angle.mp4', fo: null });
    assert.deepEqual(deriveSiblingClips(''), { dtl: null, fo: null });
  } finally {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SwingDatabase syncSimWatchSessions ingests YYYY-MM-DD/shots.jsonl and survives malformed lines', () => {
  const tmpDir = makeTempDir('shotlab-sync-');
  const dbPath = path.join(tmpDir, 'swings.sqlite');
  const sessionsDir = path.join(tmpDir, 'Sessions');
  let db = null;

  try {
    fs.mkdirSync(path.join(sessionsDir, '2026-04-10'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, '2026-04-11'), { recursive: true });
    fs.mkdirSync(path.join(sessionsDir, '2026-04-12'), { recursive: true }); // empty date dir (no shots.jsonl)
    fs.mkdirSync(path.join(sessionsDir, 'not-a-date'), { recursive: true }); // ignored non-date dir

    const day1Lines = [
      JSON.stringify(makeRawShot({ ts: '2026-04-10T15:00:01.000Z', shot_num: 1, club: '7I', clip: 'd1_01_DTL.mp4', feel_id: 'feel_a' })),
      '{broken json line that was torn mid-write',
      '',
      JSON.stringify({ ShotDataOptions: { IsHeartBeat: true, ContainsBallData: false } }), // filtered out by analyzeShot
      JSON.stringify(makeRawShot({ ts: '2026-04-10T15:01:02.000Z', shot_num: 2, club: '7I', speed: 115, clubSpeed: 83 })),
    ];
    fs.writeFileSync(path.join(sessionsDir, '2026-04-10', 'shots.jsonl'), day1Lines.join('\n'), 'utf8');

    const day2Lines = [
      JSON.stringify(makeRawShot({ ts: '2026-04-11T16:00:01.000Z', shot_num: 1, club: 'DR', speed: 147, clubSpeed: 99, vla: 12.8, spin: 2400, aoa: 3.0 })),
      'not valid json at all',
    ];
    fs.writeFileSync(path.join(sessionsDir, '2026-04-11', 'shots.jsonl'), day2Lines.join('\n'), 'utf8');

    // Put a file in non-date dir to ensure it is ignored
    fs.writeFileSync(
      path.join(sessionsDir, 'not-a-date', 'shots.jsonl'),
      JSON.stringify(makeRawShot({ ts: '2026-04-09T12:00:00.000Z', shot_num: 1, club: 'PW' })),
      'utf8'
    );

    db = new SwingDatabase(dbPath);
    const res = db.syncSimWatchSessions(sessionsDir, (raw) => engine.analyzeShot(raw, { clubOverride: raw.club }));
    assert.equal(res.filesScanned, 2);
    assert.equal(res.shotsImported, 3);

    const summary = db.getSummary();
    assert.equal(summary.totalShots, 3);
    assert.equal(summary.totalSessions, 2);
    assert.equal(summary.clubsTracked, 2);
    assert.equal(summary.firstDate, '2026-04-10');
    assert.equal(summary.lastDate, '2026-04-11');
    assert.equal(summary.clipsLinked, 1);

    // Re-syncing is idempotent: already-ingested shots are skipped, so nothing new is imported
    const res2 = db.syncSimWatchSessions(sessionsDir, (raw) => engine.analyzeShot(raw, { clubOverride: raw.club }));
    assert.equal(res2.filesScanned, 2);
    assert.equal(res2.shotsImported, 0);
    assert.equal(db.getSummary().totalShots, 3);

    // Nonexistent dir returns zeros safely
    assert.deepEqual(db.syncSimWatchSessions(path.join(tmpDir, 'missing'), () => null), {
      filesScanned: 0,
      shotsImported: 0,
    });
  } finally {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SwingDatabase analytics: patterns, feel A/B, session trends, fatigue curve, bag gapping, and best-shot lookup', () => {
  const tmpDir = makeTempDir('shotlab-analytics-');
  const dbPath = path.join(tmpDir, 'swings.sqlite');
  let db = null;

  try {
    db = new SwingDatabase(dbPath);

    // Seed 7I shots across 3 recent days with two different feels + untagged baseline
    // Feel A ('feel_compress'): crisp center strikes slightly right of target
    for (let i = 0; i < 6; i++) {
      const raw = makeRawShot({
        ts: isoDaysAgo(5, i * 30),
        shot_num: i + 1,
        club: '7I',
        speed: 114 + (i % 3) * 0.6,
        clubSpeed: 83,
        vla: 17.6 + (i % 2) * 0.5,
        hla: 2.2 + (i % 3) * 0.4,
        spin: 6750 + i * 50,
        spin_axis: 1.5,
        aoa: -4.1,
        pathDeg: 1.5,
        feel_id: 'feel_compress',
        clip: i === 0 ? 'best_7i_DTL.mp4' : null,
      });
      const analyzed = engine.analyzeShot(raw, { clubOverride: '7I' });
      db.upsertShot(analyzed);
    }

    // Feel B ('feel_flip_test'): high-launch flipping floaters -> lower score & faultPct > 0
    for (let i = 0; i < 5; i++) {
      const raw = makeRawShot({
        ts: isoDaysAgo(3, i * 30),
        shot_num: 20 + i,
        club: '7I',
        speed: 102,
        clubSpeed: 82,
        vla: 24.5,
        hla: 2.6,
        spin: 8400,
        spin_axis: 6.5,
        aoa: 0.4,
        pathDeg: -1.5,
        feel_id: 'feel_flip_test',
      });
      const analyzed = engine.analyzeShot(raw, { clubOverride: '7I' });
      db.upsertShot(analyzed);
    }

    // Untagged baseline 7I shots on most recent day
    for (let i = 0; i < 3; i++) {
      const raw = makeRawShot({
        ts: isoDaysAgo(1, i * 30),
        shot_num: 40 + i,
        club: '7I',
        speed: 112,
        clubSpeed: 82.5,
        vla: 18.2,
        hla: 1.8,
        spin: 6900,
        spin_axis: 1.0,
        aoa: -3.8,
        pathDeg: 1.0,
      });
      db.upsertShot(engine.analyzeShot(raw, { clubOverride: '7I' }));
    }

    // 1. getClubPatterns (2D dispersion + rotated 80% ellipse + DECADE advice + faultLeaks)
    const patterns7I = db.getClubPatterns({ club: '7I', mode: 'real', days: 30 });
    assert.equal(patterns7I.n, 14);
    assert.ok(patterns7I.ellipse80, 'Should compute 80% dispersion ellipse');
    assert.ok(Number.isFinite(patterns7I.ellipse80.widthYds) && patterns7I.ellipse80.widthYds > 0);
    assert.ok(Number.isFinite(patterns7I.ellipse80.depthYds) && patterns7I.ellipse80.depthYds > 0);
    assert.ok(Number.isFinite(patterns7I.ellipse80.angleDeg));
    assert.match(patterns7I.decadeAdvice, /Aim \d+y left|Well-centered/i);
    assert.ok(patterns7I.faultLeaks.length >= 2);
    assert.ok(patterns7I.averages.clubSpeed > 80);
    assert.ok(patterns7I.averages.carryYds > 120);

    // 2. getFeelComparison (A/B Feel verdicts)
    const feels = db.getFeelComparison({ club: '7I', mode: 'real', days: 30 });
    assert.equal(feels.length, 3);
    assert.equal(feels[0].feelId, 'feel_compress', 'Higher-scoring feel should rank #1');
    assert.equal(feels[1].feelId, 'feel_flip_test', 'Lower-scoring feel should rank #2');
    assert.equal(feels[2].feelId, null, 'Untagged baseline should be ordered last');
    assert.ok(feels[0].avgScore > feels[1].avgScore);
    assert.ok(feels[1].faultPct > feels[0].faultPct);

    // 3. getSessionTrends (chronological multi-session series)
    const trends = db.getSessionTrends({ club: '7I', mode: 'real', limit: 10 });
    assert.equal(trends.length, 3);
    assert.ok(trends[0].date < trends[1].date && trends[1].date < trends[2].date, 'Trends must be sorted chronologically');
    assert.equal(trends[0].n, 6);
    assert.equal(trends[1].n, 5);
    assert.equal(trends[2].n, 3);

    // 4. getBagGapping (overlap alert, big-gap alert, stopping power labels)
    // Add DR (~255y, Runs Out), 5I (~182y, Holds Green), 6I (~178y -> overlap with 5I!),
    // and PW (~118y -> big gap from 7I ~155y, Drop & Stop!)
    const clubSeeds = [
      { club: 'DR', speed: 152, clubSpeed: 102, vla: 11.2, spin: 2300, aoa: 3.0, carry: 258, total: 282 },
      { club: '5I', speed: 127, clubSpeed: 88, vla: 13.8, spin: 5000, aoa: -3.2, carry: 184, total: 194 },
      { club: '6I', speed: 125, clubSpeed: 87, vla: 14.5, spin: 5300, aoa: -3.5, carry: 180, total: 189 },
      { club: 'PW', speed: 94, clubSpeed: 74, vla: 25.5, spin: 9200, aoa: -5.0, carry: 116, total: 119 },
    ];
    for (const s of clubSeeds) {
      for (let k = 0; k < 3; k++) {
        const raw = makeRawShot({
          ts: isoDaysAgo(2, 500 + clubSeeds.indexOf(s) * 100 + k * 10),
          shot_num: 100 + clubSeeds.indexOf(s) * 10 + k,
          club: s.club,
          speed: s.speed,
          clubSpeed: s.clubSpeed,
          vla: s.vla,
          spin: s.spin,
          aoa: s.aoa,
          carry: s.carry,
          total: s.total,
        });
        db.upsertShot(engine.analyzeShot(raw, { clubOverride: s.club }));
      }
    }

    const gapping = db.getBagGapping({ mode: 'real', days: 30 });
    const byClub = Object.fromEntries(gapping.map((c) => [c.club, c]));
    assert.equal(byClub.DR.stoppingPower, 'Runs Out');
    assert.equal(byClub['5I'].stoppingPower, 'Holds Green');
    assert.equal(byClub.PW.stoppingPower, 'Drop & Stop');
    assert.equal(byClub['3W'].stoppingPower, '—');
    assert.match(byClub['5I'].gapAlert, /^Overlap/, `Expected Overlap alert between 5I and 6I, got ${byClub['5I'].gapAlert}`);
    assert.match(byClub['7I'].gapAlert, /^Big gap/, `Expected Big gap alert between 7I and PW, got ${byClub['7I'].gapAlert}`);

    // 5. getBestShotForClub (prefers clip -> Go-To -> highest score)
    const tsBase = isoDaysAgo(0, -1000);
    const makeScored8I = (suffix, scoreOverride, { clip = null, goTo = false } = {}) => {
      const ts = new Date(Date.parse(tsBase) + suffix * 1000).toISOString();
      const analyzed = engine.analyzeShot(
        makeRawShot({ ts, shot_num: 200 + suffix, club: '8I', speed: 108, clubSpeed: 80, vla: 20.0, spin: 7600, clip }),
        { clubOverride: '8I' }
      );
      analyzed.scorecard.score = scoreOverride;
      db.upsertShot(analyzed, { isGoTo: goTo });
      return analyzed.id;
    };

    const idNoClipTopScore = makeScored8I(1, 98, { clip: null, goTo: false });
    const idClipHighScore = makeScored8I(2, 91, { clip: '8i_high_DTL.mp4', goTo: false });
    const idClipGoTo = makeScored8I(3, 84, { clip: '8i_goto_DTL.mp4', goTo: true });

    const bestPreferred = db.getBestShotForClub('8I', { preferClip: true });
    assert.equal(bestPreferred.id, idClipGoTo, 'Should prefer clip + Go-To shot');

    const bestExclGoTo = db.getBestShotForClub('8I', { preferClip: true, excludeId: idClipGoTo });
    assert.equal(bestExclGoTo.id, idClipHighScore, 'Excluding Go-To should pick highest-scoring clipped shot');

    const bestIgnoreClip = db.getBestShotForClub('8I', { preferClip: false, excludeId: idClipGoTo });
    assert.equal(bestIgnoreClip.id, idNoClipTopScore, 'With preferClip=false should pick highest overall score');

    const clips8I = db.getRecentShotsWithClips({ club: '8I' });
    assert.equal(clips8I.length, 2);

    // 6. getFatigueCurve across all 5 within-session buckets (1-10, 11-25, 26-45, 46-70, 71+)
    const fatigueDbPath = path.join(tmpDir, 'fatigue.sqlite');
    const fatigueDb = new SwingDatabase(fatigueDbPath);
    try {
      const sessionDayStart = new Date(Date.now() - 2 * 86400 * 1000);
      sessionDayStart.setUTCHours(10, 0, 0, 0);
      for (let i = 0; i < 75; i++) {
        const ts = new Date(sessionDayStart.getTime() + i * 20000).toISOString();
        const isFatigued = i >= 70;
        const analyzed = engine.analyzeShot(
          makeRawShot({
            ts,
            shot_num: i + 1,
            club: '7I',
            speed: isFatigued ? 100 : 114,
            clubSpeed: 82.5,
            vla: isFatigued ? 24.0 : 17.8,
            spin: isFatigued ? 8300 : 6800,
            aoa: isFatigued ? 0.5 : -4.0,
          }),
          { clubOverride: '7I' }
        );
        fatigueDb.upsertShot(analyzed);
      }

      const curve = fatigueDb.getFatigueCurve({ mode: 'real', days: 30 });
      assert.equal(curve.length, 5);
      assert.deepEqual(curve.map((b) => [b.id, b.n]), [
        ['1-10', 10],
        ['11-25', 15],
        ['26-45', 20],
        ['46-70', 25],
        ['71+', 5],
      ]);
      assert.ok(curve[2].avgScore > curve[4].avgScore, 'Peak window should outscore Fatigue Zone');
    } finally {
      fatigueDb.close();
    }
  } finally {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SwingDatabase close() and JSON fallback persistence round-trip cleanly', () => {
  const tmpDir = makeTempDir('shotlab-fallback-');
  const jsonFile = path.join(tmpDir, 'swings.json');
  const db = new SwingDatabase(':memory:');

  try {
    // Closing SQLite cleanly nulls db handle and is safe to call twice
    db.close();
    assert.equal(db.db, null);
    assert.doesNotThrow(() => db.close());

    // Exercise JSON fallback code paths directly
    db.backend = 'json-fallback';
    db._fallbackFile = jsonFile;

    const ts = isoDaysAgo(1, 5);
    const analyzed = engine.analyzeShot(makeRawShot({ ts, shot_num: 1, club: '7I' }), { clubOverride: '7I' });
    db.upsertShot(analyzed, { feelId: 'feel_fallback' });
    assert.equal(db.updateClipByTs(ts, 'fb_01_DTL.mp4'), true);
    assert.equal(db.markGoTo(analyzed.id, true), true);
    assert.ok(fs.existsSync(jsonFile), 'Fallback JSON file should be persisted atomically');

    const summary = db.getSummary();
    assert.equal(summary.backend, 'json-fallback');
    assert.equal(summary.totalShots, 1);
    assert.equal(summary.clipsLinked, 1);

    // Reload from disk into a fresh fallback instance
    const db2 = new SwingDatabase(':memory:');
    db2.close();
    db2.backend = 'json-fallback';
    db2._fallbackFile = jsonFile;
    db2._loadFallback();

    assert.equal(db2.getSummary().totalShots, 1);
    const best = db2.getBestShotForClub('7I');
    assert.equal(best.id, analyzed.id);
    assert.equal(best.clip_dtl, 'fb_01_DTL.mp4');
    assert.equal(best.clip_fo, 'fb_01_FO.mp4');
    assert.equal(best.is_goto, 1);
    assert.equal(best.feel_id, 'feel_fallback');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ============================================================================
// 2. Strokes Gained & DECADE Dispersion (strokesGained.js)
// ============================================================================

test('Strokes Gained OTT (Driver) & APP (7-Iron) score center/close shots positive and misses negative', () => {
  const drSpec = getClubSpec('DR');
  const iron7Spec = getClubSpec('7I');

  // OTT Driver: pure center fairway drive
  const pureDriveMid = computeShotStrokesGained({
    clubSpec: drSpec,
    carryYds: 268,
    totalYds: 292,
    offlineYds: 3,
    tierId: 'mid_hcp',
  });
  const pureDriveScratch = computeShotStrokesGained({
    clubSpec: drSpec,
    carryYds: 268,
    totalYds: 292,
    offlineYds: 3,
    tierId: 'scratch',
  });
  assert.equal(pureDriveMid.category, 'OTT');
  assert.equal(pureDriveMid.resultLie, 'fairway');
  assert.ok(pureDriveMid.sg > 0, `Expected positive SG vs mid_hcp, got ${pureDriveMid.sg}`);
  assert.ok(pureDriveScratch.sg > 0, `Expected positive SG vs scratch, got ${pureDriveScratch.sg}`);
  assert.ok(pureDriveMid.sg > pureDriveScratch.sg, 'SG vs mid_hcp should exceed SG vs scratch');

  // OTT Driver: big slice / penalty miss
  const sliceDrive = computeShotStrokesGained({
    clubSpec: drSpec,
    carryYds: 195,
    totalYds: 205,
    offlineYds: 52,
    tierId: 'low_hcp',
  });
  assert.equal(sliceDrive.category, 'OTT');
  assert.equal(sliceDrive.resultLie, 'penalty');
  assert.ok(sliceDrive.sg < -0.8, `Expected big negative SG for OB slice, got ${sliceDrive.sg}`);

  // APP 7-Iron: stiff approach close to target
  const stiff7I = computeShotStrokesGained({
    clubSpec: iron7Spec,
    carryYds: 162,
    totalYds: 165,
    offlineYds: 2,
    targetCarryYds: 162,
    tierId: 'scratch',
  });
  assert.equal(stiff7I.category, 'APP');
  assert.equal(stiff7I.resultLie, 'green');
  assert.ok(stiff7I.sg > 0, `Expected positive SG for stiff 7I, got ${stiff7I.sg}`);

  // APP 7-Iron: short & offline miss
  const miss7I = computeShotStrokesGained({
    clubSpec: iron7Spec,
    carryYds: 130,
    totalYds: 136,
    offlineYds: 24,
    targetCarryYds: 162,
    tierId: 'low_hcp',
  });
  assert.equal(miss7I.category, 'APP');
  assert.equal(miss7I.resultLie, 'recovery');
  assert.ok(miss7I.sg < -0.3, `Expected negative SG for short offline 7I, got ${miss7I.sg}`);
});

test('Strokes Gained pauses cleanly in practiceMode === "almost" and "sore"', () => {
  const drSpec = getClubSpec('DR');
  const ironSpec = getClubSpec('7I');

  const almostDr = computeShotStrokesGained({
    clubSpec: drSpec,
    carryYds: 110,
    totalYds: 115,
    offlineYds: 1,
    practiceMode: 'almost',
  });
  assert.equal(almostDr.sg, null);
  assert.equal(almostDr.sgPga, null);
  assert.equal(almostDr.category, 'OTT');
  assert.equal(almostDr.resultLie, 'practice');
  assert.match(almostDr.explanation, /paused/i);

  const soreIron = computeShotStrokesGained({
    clubSpec: ironSpec,
    carryYds: 140,
    offlineYds: 2,
    practiceMode: 'sore',
  });
  assert.equal(soreIron.sg, null);
  assert.equal(soreIron.category, 'APP');
  assert.equal(soreIron.resultLie, 'practice');
});

test('computeDispersionStats produces finite rotated 80% ellipse, DECADE aim advice, and sorted faultLeaks', () => {
  // Empty input
  const empty = computeDispersionStats([], { club: '7I' });
  assert.equal(empty.n, 0);
  assert.equal(empty.ellipse80, null);
  assert.deepEqual(empty.faultLeaks, []);

  // Populated shots with systematic right bias (+10y) and correlated carry/offline
  const shots = [
    { id: '1', carry_yds: 162, offline_yds: 8, score: 88, sg_shot: 0.25, delivery_id: 'pure_compression', delivery_name: 'Pure Compression', left_on_table_yds: 1 },
    { id: '2', carry_yds: 160, offline_yds: 6, score: 86, sg_shot: 0.18, delivery_id: 'pure_compression', delivery_name: 'Pure Compression', left_on_table_yds: 2 },
    { id: '3', carry_yds: 152, offline_yds: 12, score: 62, sg_shot: -0.35, delivery_id: 'over_hold', delivery_name: 'Over-Hold / Stalled Block', left_on_table_yds: 8 },
    { id: '4', carry_yds: 144, offline_yds: 15, score: 45, sg_shot: -0.62, delivery_id: 'flipping_floater', delivery_name: 'Flipping Floater', left_on_table_yds: 16 },
    { id: '5', carry_yds: 142, offline_yds: 14, score: 42, sg_shot: -0.71, delivery_id: 'flipping_floater', delivery_name: 'Flipping Floater', left_on_table_yds: 18 },
    { id: '6', carry_yds: 158, offline_yds: 9, score: 80, sg_shot: 0.08, delivery_id: 'pure_compression', delivery_name: 'Pure Compression', left_on_table_yds: 3 },
  ];

  const stats = computeDispersionStats(shots, { club: '7I' });
  assert.equal(stats.n, 6);
  assert.ok(stats.ellipse80);
  assert.ok(Number.isFinite(stats.ellipse80.widthYds) && stats.ellipse80.widthYds > 0);
  assert.ok(Number.isFinite(stats.ellipse80.depthYds) && stats.ellipse80.depthYds > 0);
  assert.ok(Number.isFinite(stats.ellipse80.angleDeg));
  assert.ok(stats.meanOffline > 9, `Expected right bias > 9y, got ${stats.meanOffline}`);
  assert.match(stats.decadeAdvice, /Aim \d+y left/i);

  // faultLeaks must be sorted ascending by totalSg (worst stroke leak first)
  assert.equal(stats.faultLeaks.length, 3);
  assert.equal(stats.faultLeaks[0].deliveryId, 'flipping_floater');
  assert.equal(stats.faultLeaks[1].deliveryId, 'over_hold');
  assert.equal(stats.faultLeaks[2].deliveryId, 'pure_compression');
  assert.ok(stats.faultLeaks[0].totalSg < stats.faultLeaks[1].totalSg);
  assert.ok(stats.faultLeaks[1].totalSg < stats.faultLeaks[2].totalSg);
});

// ============================================================================
// 3. Context-Aware Club Brain (classifier.js & diagnostics.js)
// ============================================================================

test('Session Markov stickiness boosts active club during block practice without blocking a true club switch', () => {
  const cal = createEmptyCalibration(98);

  // Borderline 6I/7I shot
  const borderlineIron = {
    ball: { speed: 112.5, vla: 17.2, spin: 6500, spin_axis: -1.5 },
    club_data: { speed: 81.8, aoa: -3.8, path: 1.0 },
  };
  const noHistory = classifyClub(borderlineIron, cal, { recentClubs: [] });
  const with7IStreak = classifyClub(borderlineIron, cal, { recentClubs: ['7I', '7I', '7I'] });

  const prob7NoHist = (noHistory.top3.find((x) => x.club === '7I') || { probability: 0 }).probability;
  assert.equal(with7IStreak.predictedClub, '7I');
  assert.equal(with7IStreak.markovBoostClub, '7I');
  assert.ok(
    with7IStreak.confidence > prob7NoHist,
    `Expected Markov streak to boost 7I probability (${with7IStreak.confidence} > ${prob7NoHist})`
  );

  // True club switch: 7I streak -> full Driver still switches cleanly to DR!
  const driverShot = {
    ball: { speed: 147, vla: 12.6, spin: 2420, spin_axis: -3.0 },
    club_data: { speed: 99, aoa: 2.8, path: 1.8 },
  };
  const switched = classifyClub(driverShot, cal, { recentClubs: ['7I', '7I', '7I'] });
  assert.equal(switched.predictedClub, 'DR');
  assert.ok(switched.confidence >= 0.85, `Expected clean DR switch confidence >= 0.85, got ${switched.confidence}`);
  assert.equal(switched.markovBoostClub, null);
});

test('Partial / Knockdown swing guard holds active club, pauses auto-switch, and suppresses false Early Cast', () => {
  const cal = createEmptyCalibration(98);
  cal.autoSwitch = { enabled: true, minConfidence: 0.70 };

  // Intentional ~87% flighted knockdown 7I (clubSpeed ~70.5 vs ~80.9 full 7I, low controlled VLA 15.5°)
  const knockdownRaw = makeRawShot({
    club: 'PW', // GSPro currently on PW to prove auto-switch is suppressed
    speed: 98,
    clubSpeed: 70.5,
    vla: 15.5,
    hla: 0.4,
    spin: 6300,
    spin_axis: -1.5,
    aoa: -4.2,
    pathDeg: -3.6, // out-to-in + slower speed would otherwise risk Early Cast!
  });

  const analyzed = engine.analyzeShot(knockdownRaw, {
    calibration: cal,
    recentClubs: ['7I', '7I', '7I'],
  });

  assert.equal(analyzed.clubDetection.isPartialSwing, true);
  assert.ok(analyzed.clubDetection.partialSpeedPct >= 82 && analyzed.clubDetection.partialSpeedPct <= 91);
  assert.equal(analyzed.clubDetection.predictedClub, '7I');
  assert.equal(analyzed.clubDetection.shotCategory, 'partial');
  assert.equal(analyzed.shouldAutoSwitch, false, 'Auto-switch must pause on partial/knockdown swings');
  assert.equal(analyzed.delivery.id, 'solid_delivery');
  assert.match(analyzed.delivery.name, /Partial \/ Knockdown/);
  assert.notEqual(analyzed.delivery.id, 'early_cast');

  // Contrast: same slow cast with added loft and NO partial-swing context triggers Early Cast
  const realCastRaw = makeRawShot({
    club: '7I',
    speed: 98,
    clubSpeed: 71,
    vla: 22.8,
    hla: -2.0,
    spin: 7400,
    spin_axis: 5.0,
    aoa: -2.5,
    pathDeg: -4.8,
  });
  const castAnalyzed = engine.analyzeShot(realCastRaw, { clubOverride: '7I', calibration: cal });
  assert.equal(castAnalyzed.delivery.id, 'early_cast');
});

// ============================================================================
// 4. Kids-Asleep (practiceMode: 'almost') Mode
// ============================================================================

test('Kids-Asleep mode grades only club delivery + Start Line Gate (±1.5°), marks foam metrics foam_na, and uses Quiet Mode delivery', () => {
  const cal = createEmptyCalibration(98);
  cal.autoSwitch = { enabled: true, minConfidence: 0.70 };

  // Foam ball produces terrible ballSpeed/smash/carry/spin, but club delivery & start line are pure!
  const foamPureRaw = makeRawShot({
    club: '7I',
    speed: 58,
    clubSpeed: 81.5,
    vla: 25.0,
    hla: 0.6,
    spin: 3100,
    spin_axis: 1.0,
    aoa: -3.8,
    pathDeg: 1.1,
  });

  const res = engine.analyzeShot(foamPureRaw, {
    clubOverride: '7I',
    calibration: cal,
    practiceMode: 'almost',
  });

  assert.equal(res.practiceMode, 'almost');
  assert.equal(res.scorecard.practiceMode, 'almost');
  assert.match(res.scorecard.tierLabel, /Kids-Asleep/i);
  assert.equal(res.shouldAutoSwitch, false);
  assert.equal(res.strokesGained.sg, null);
  assert.equal(res.strokesGained.resultLie, 'practice');

  const activeKeys = new Set(['clubSpeed', 'aoa', 'path', 'face', 'faceToPath', 'hla']);
  const foamNaKeys = ['smash', 'carry', 'ballSpeed', 'vla', 'backSpin', 'spinAxis', 'shaftLean', 'descent'];

  // First 6 cards must be the 6 active quiet-mode delivery + start-line cards
  const top6Keys = res.scorecard.cards.slice(0, 6).map((c) => c.key);
  assert.deepEqual(new Set(top6Keys), activeKeys);
  for (const key of activeKeys) {
    const card = res.scorecard.cards.find((c) => c.key === key);
    assert.ok(card && card.grade !== 'neutral', `Expected active card ${key} to be graded in almost mode`);
  }

  const hlaCard = res.scorecard.cards.find((c) => c.key === 'hla');
  assert.equal(hlaCard.label, 'Start Line Gate');
  assert.equal(hlaCard.target, '±1.5°');
  assert.equal(hlaCard.grade, 'green');

  for (const key of foamNaKeys) {
    const card = res.scorecard.cards.find((c) => c.key === key);
    assert.ok(card, `Expected card ${key} to exist`);
    assert.equal(card.grade, 'neutral', `${key} should be neutral in almost mode`);
    assert.equal(card.source, 'foam_na', `${key} should be marked foam_na`);
    assert.equal(card.target, 'Foam N/A', `${key} target should be 'Foam N/A'`);
  }

  // Quiet mode delivery must NOT false-flag flipping_floater or low smash
  assert.equal(res.delivery.id, 'pure_compression');
  assert.equal(res.delivery.name, 'Quiet Mode: Pure Gate Delivery');
  assert.equal(res.delivery.severity, 'green');
  assert.equal(res.delivery.estShaftLean, null);
  assert.equal(res.delivery.estDynamicLoft, null);

  // Quiet mode still catches genuine club/start-line faults
  const openGate = engine.analyzeShot(
    makeRawShot({ club: '7I', speed: 56, clubSpeed: 81, hla: 2.8, pathDeg: 0.2, aoa: -3.8 }),
    { clubOverride: '7I', practiceMode: 'almost' }
  );
  assert.equal(openGate.delivery.id, 'over_hold');

  const outToIn = engine.analyzeShot(
    makeRawShot({ club: '7I', speed: 56, clubSpeed: 81, hla: -0.8, pathDeg: -4.6, aoa: -3.8 }),
    { clubOverride: '7I', practiceMode: 'almost' }
  );
  assert.equal(outToIn.delivery.id, 'steep_chop');

  const scoopedAoa = engine.analyzeShot(
    makeRawShot({ club: '7I', speed: 56, clubSpeed: 81, hla: 0.4, pathDeg: 0.5, aoa: 0.8 }),
    { clubOverride: '7I', practiceMode: 'almost' }
  );
  assert.equal(scoopedAoa.delivery.id, 'flipping_floater');
});

// ============================================================================
// 5. Drills Hub Bridge (drillsBridge.js)
// ============================================================================

test('Drills Hub Bridge loads repo drills (53) + profile safely via vm and handles missing dirs', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const hub = loadDrillsHubData(repoRoot);

  assert.equal(hub.loaded, true);
  assert.equal(hub.drills.length, 53, 'Expected all 53 drills from drills/drills_data.js');
  assert.deepEqual(Array.from(hub.modes, (m) => m.id), ['real', 'almost', 'sore']);
  assert.ok(Array.isArray(hub.feels) && hub.feels.length >= 1, 'Should load feels from player_data or player_data.example');
  for (const d of hub.drills) {
    assert.ok(d.id && d.title && Array.isArray(d.modes));
  }

  // Fallback when drills folder does not exist
  const emptyDir = makeTempDir('shotlab-nodrills-');
  try {
    const emptyHub = loadDrillsHubData(emptyDir);
    assert.equal(emptyHub.loaded, false);
    assert.equal(emptyHub.drills.length, 0);
    assert.equal(emptyHub.modes.length, 3);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('detectFaultStreak catches >=2 repeating faults, ignores good deliveries, and recommendDrillsForFault respects almost mode', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const { drills } = loadDrillsHubData(repoRoot);

  const shotWithDelivery = (id, name = id) => ({ delivery: { id, name } });

  // Ignores pure_compression, solid_delivery, <2 shots, or non-repeating fault
  assert.equal(detectFaultStreak([], drills), null);
  assert.equal(detectFaultStreak([shotWithDelivery('flipping_floater')], drills), null);
  assert.equal(detectFaultStreak([shotWithDelivery('pure_compression'), shotWithDelivery('pure_compression')], drills), null);
  assert.equal(detectFaultStreak([shotWithDelivery('solid_delivery'), shotWithDelivery('solid_delivery')], drills), null);
  assert.equal(detectFaultStreak([shotWithDelivery('flipping_floater'), shotWithDelivery('pure_compression')], drills), null);

  // Catches 2-shot streak (not yet urgent)
  const streak2 = detectFaultStreak([
    shotWithDelivery('flipping_floater', 'Flipping Floater'),
    shotWithDelivery('flipping_floater', 'Flipping Floater'),
    shotWithDelivery('pure_compression', 'Pure Compression'),
  ], drills, { practiceMode: 'real' });
  assert.ok(streak2);
  assert.equal(streak2.faultId, 'flipping_floater');
  assert.equal(streak2.streak, 2);
  assert.equal(streak2.urgent, false);
  assert.ok(streak2.recommendedDrills.length >= 1);

  // Catches 3-shot streak (urgent: true)
  const streak3 = detectFaultStreak([
    shotWithDelivery('early_cast', 'Early Cast'),
    shotWithDelivery('early_cast', 'Early Cast'),
    shotWithDelivery('early_cast', 'Early Cast'),
    shotWithDelivery('over_hold', 'Over-Hold'),
  ], drills, { practiceMode: 'almost' });
  assert.ok(streak3);
  assert.equal(streak3.faultId, 'early_cast');
  assert.equal(streak3.streak, 3);
  assert.equal(streak3.urgent, true);
  assert.ok(streak3.recommendedDrills.length >= 1);

  // Verify recommendations for every fault mapping in FAULT_TO_DRILL_IDS
  for (const faultKey of Object.keys(FAULT_TO_DRILL_IDS)) {
    const recsReal = recommendDrillsForFault(faultKey, drills, { practiceMode: 'real' });
    assert.ok(recsReal.length >= 1 && recsReal.length <= 3, `Expected 1-3 real-mode drills for ${faultKey}`);

    const recsAlmost = recommendDrillsForFault(faultKey, drills, { practiceMode: 'almost' });
    assert.ok(recsAlmost.length >= 1 && recsAlmost.length <= 3, `Expected 1-3 almost-mode drills for ${faultKey}`);

    // If any curated drill for this fault supports 'almost', every returned drill must support 'almost'
    const mappedDrills = FAULT_TO_DRILL_IDS[faultKey].map((id) => drills.find((d) => d.id === id)).filter(Boolean);
    const hasAlmostDrill = mappedDrills.some((d) => d.modes.includes('almost'));
    if (hasAlmostDrill) {
      for (const rec of recsAlmost) {
        assert.ok(rec.modes.includes('almost'), `Drill ${rec.id} for ${faultKey} should support almost mode`);
      }
    }
  }

  assert.deepEqual(recommendDrillsForFault('unknown_fault', drills), []);
  assert.deepEqual(recommendDrillsForFault('flipping_floater', []), []);
});

// ============================================================================
// 6. Audio Caddie (audio.js), New SVG Plots (svg.js), and 9 OBS Widgets (overlay.js)
// ============================================================================

test('Audio Caddie exposes TEMPO_PRESETS and builds clean spoken summaries for real & almost modes', () => {
  for (const presetId of ['24/8', '27/9', '21/7', '18/9']) {
    const preset = audio.TEMPO_PRESETS[presetId];
    assert.ok(preset, `Missing TEMPO_PRESETS['${presetId}']`);
    assert.ok(preset.backswingMs > 0 && preset.downswingMs > 0 && preset.pauseMs > 0);
  }

  const realShot = engine.analyzeShot(makeRawShot({ club: '7I', speed: 114, clubSpeed: 83, vla: 17.8, hla: 0.4, spin: 6800, aoa: -4.0, pathDeg: 1.5 }), { clubOverride: '7I' });
  const realSpeech = audio.buildShotSpeechText(realShot, { practiceMode: 'real' });
  assert.match(realSpeech, /7 iron/i);
  assert.match(realSpeech, /\d+ yards/i);
  assert.match(realSpeech, /Smash \d+\.\d{2}/i);
  assert.ok(!realSpeech.includes('NaN') && !realSpeech.includes('undefined'));

  const almostShot = engine.analyzeShot(
    makeRawShot({ club: '7I', speed: 58, clubSpeed: 82, hla: 1.2, pathDeg: 2.0, aoa: -3.8 }),
    { clubOverride: '7I', practiceMode: 'almost' }
  );
  const almostRh = audio.buildShotSpeechText(almostShot, { practiceMode: 'almost', handedness: 'RH' });
  assert.match(almostRh, /7 iron/i);
  assert.match(almostRh, /Start line 1\.2 right/i);
  assert.match(almostRh, /Path 2\.0 in to out/i);
  assert.ok(!/yards/i.test(almostRh), 'Almost-mode speech should omit foam-ball carry yards');
  assert.ok(!/Smash/i.test(almostRh), 'Almost-mode speech should omit foam-ball smash');
  assert.ok(!almostRh.includes('NaN') && !almostRh.includes('undefined'));

  // LH reverses in-to-out / out-to-in polarity for +2.0 path
  const almostLh = audio.buildShotSpeechText(almostShot, { practiceMode: 'almost', handedness: 'LH' });
  assert.match(almostLh, /Path 2\.0 out to in/i);

  assert.equal(audio.buildShotSpeechText(null), '');

  // Start & immediately stop tempo metronome (ensure timers cleaned up!)
  try {
    const beats = [];
    const cfg = audio.startTempo('27/9', (beat) => beats.push(beat));
    assert.equal(cfg.id, '27/9');
    assert.equal(audio.isTempoRunning(), true);
    assert.equal(audio.getTempoPreset(), '27/9');
    assert.equal(beats[0], 'takeaway');
  } finally {
    audio.stopTempo();
    assert.equal(audio.isTempoRunning(), false);
  }
});

test('renderDispersionPlot and renderTrendSparkline output valid SVG without NaN or undefined', () => {
  // Empty dispersion plot
  for (const emptyInput of [null, { n: 0, points: [] }]) {
    const emptySvg = svg.renderDispersionPlot(emptyInput);
    assert.ok(emptySvg.includes('<svg') && emptySvg.includes('</svg>'));
    assert.ok(!emptySvg.includes('NaN') && !emptySvg.includes('undefined'));
  }

  // Populated dispersion plot with rotated 80% ellipse & DECADE aim marker
  const dispStats = computeDispersionStats([
    { id: '1', carry_yds: 162, offline_yds: 8, score: 88, sg_shot: 0.2, shot_shape: 'Push Fade' },
    { id: '2', carry_yds: 158, offline_yds: 11, score: 74, sg_shot: -0.1, shot_shape: 'Push Fade' },
    { id: '3', carry_yds: 154, offline_yds: 14, score: 55, sg_shot: -0.4, shot_shape: 'Slice' },
    { id: '4', carry_yds: 165, offline_yds: 6, score: 92, sg_shot: 0.35, shot_shape: 'Baby Fade' },
    { id: '5', carry_yds: 160, offline_yds: 10, score: 80, sg_shot: 0.05, shot_shape: 'Push Fade' },
  ], { club: '7I' });

  const fullDispSvg = svg.renderDispersionPlot(dispStats, { width: 380, height: 260 });
  assert.ok(fullDispSvg.includes('<svg') && fullDispSvg.includes('</svg>'));
  assert.ok(fullDispSvg.includes('<ellipse'), 'Should render 80% confidence ellipse');
  assert.ok(fullDispSvg.includes('disp-mean'), 'Should render mean crosshair');
  assert.ok(fullDispSvg.includes('disp-decade') && fullDispSvg.includes('Aim'), 'Should render DECADE aim marker');
  assert.ok(!fullDispSvg.includes('NaN') && !fullDispSvg.includes('undefined'));

  const compactDispSvg = svg.renderDispersionPlot(dispStats, { width: 320, height: 220, compact: true });
  assert.ok(compactDispSvg.includes('<svg') && compactDispSvg.includes('</svg>'));
  assert.ok(!compactDispSvg.includes('NaN') && !compactDispSvg.includes('undefined'));

  // Empty & single-point trend sparkline
  for (const few of [[], [{ date: '2026-04-01', n: 10, avgScore: 80 }]]) {
    const emptyTrend = svg.renderTrendSparkline(few, 'avgScore');
    assert.ok(emptyTrend.includes('<svg') && emptyTrend.includes('</svg>'));
    assert.ok(emptyTrend.includes('Log 2+ sessions'));
    assert.ok(!emptyTrend.includes('NaN') && !emptyTrend.includes('undefined'));
  }

  // Populated trend sparkline across all metric keys + constant flat-line series
  const trends = [
    { date: '2026-04-01', n: 12, avgScore: 72, avgSmash: 1.33, avgCarry: 156, avgSg: -0.18, faultPct: 42 },
    { date: '2026-04-05', n: 18, avgScore: 79, avgSmash: 1.35, avgCarry: 160, avgSg: 0.04, faultPct: 28 },
    { date: '2026-04-09', n: 15, avgScore: 86, avgSmash: 1.37, avgCarry: 164, avgSg: 0.22, faultPct: 13 },
  ];
  for (const key of ['avgScore', 'avgSmash', 'avgCarry', 'avgSg', 'faultPct']) {
    const spark = svg.renderTrendSparkline(trends, key);
    assert.ok(spark.includes('<svg') && spark.includes('</svg>'));
    assert.ok(spark.includes('<path') && spark.includes('<circle'));
    assert.ok(!spark.includes('NaN') && !spark.includes('undefined'), `Sparkline for ${key} contained NaN/undefined`);
  }

  const flatSpark = svg.renderTrendSparkline([
    { date: '2026-04-01', n: 5, avgScore: 80 },
    { date: '2026-04-02', n: 5, avgScore: 80 },
  ], 'avgScore');
  assert.ok(flatSpark.includes('<svg') && !flatSpark.includes('NaN') && !flatSpark.includes('undefined'));
});

test('OBS overlay.js handles and renders all 9 widgets cleanly without NaN or undefined', () => {
  const overlayPath = path.join(__dirname, '..', 'obs', 'overlay.js');
  const overlayCode = fs.readFileSync(overlayPath, 'utf8');
  const allWidgets = ['hud', 'shape', 'metrics', 'diagnosis', 'compact', 'club', 'tracer', 'dispersion', 'ticker'];

  const sampleShot = engine.analyzeShot(
    makeRawShot({ club: '7I', speed: 114, clubSpeed: 83, vla: 17.8, hla: 0.8, spin: 6800, spin_axis: -2.5, aoa: -4.0, pathDeg: 1.6 }),
    { clubOverride: '7I' }
  );
  const sampleDispersion = computeDispersionStats([
    { id: '1', carry_yds: 162, offline_yds: 5, score: 88, sg_shot: 0.2 },
    { id: '2', carry_yds: 159, offline_yds: -3, score: 84, sg_shot: 0.1 },
    { id: '3', carry_yds: 164, offline_yds: 2, score: 91, sg_shot: 0.3 },
  ], { club: '7I' });
  const samplePayload = {
    shot: sampleShot,
    dispersion: sampleDispersion,
    sessionTicker: {
      sessionShots: 14,
      avgScore: 84,
      avgCarry: 162,
      avgSg: 0.18,
      activeClub: '7I',
      activeFeel: 'Handle Forward',
      practiceMode: 'real',
      totalDbSwings: 412,
    },
    settings: {
      handedness: 'RH',
      obsAutoHideSec: 0,
      practiceMode: 'real',
    },
  };

  for (const widget of allWidgets) {
    const classSet = new Set();
    const rootEl = {
      innerHTML: '',
      classList: {
        add: (c) => classSet.add(c),
        remove: (c) => classSet.delete(c),
        has: (c) => classSet.has(c),
      },
    };
    const sseHandlers = {};

    class MockEventSource {
      constructor(url) { this.url = url; }
      addEventListener(type, fn) { sseHandlers[type] = fn; }
    }

    const sandbox = {
      URLSearchParams,
      EventSource: MockEventSource,
      setTimeout,
      clearTimeout,
      fetch: () => Promise.resolve({ json: () => Promise.resolve(samplePayload) }),
      document: {
        getElementById: (id) => (id === 'overlay-root' ? rootEl : null),
      },
      window: {
        location: { search: `?widget=${widget}&autohide=0` },
        ShotLabSVG: svg,
      },
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(overlayCode, sandbox, { filename: 'overlay.js', timeout: 1000 });
    assert.ok(typeof sseHandlers.shot === 'function', `overlay.js should register SSE 'shot' listener for widget '${widget}'`);

    // Dispatch live shot state event
    sseHandlers.shot({ data: JSON.stringify(samplePayload) });
    assert.ok(rootEl.innerHTML.length > 40, `Widget '${widget}' should render substantial markup`);
    assert.ok(!rootEl.innerHTML.includes('NaN'), `Widget '${widget}' rendered NaN`);
    assert.ok(!rootEl.innerHTML.includes('undefined'), `Widget '${widget}' rendered undefined`);

    if (widget === 'tracer') {
      assert.ok(rootEl.innerHTML.includes('3D SHOT TRACER') && rootEl.innerHTML.includes('<svg'));
    } else if (widget === 'dispersion') {
      assert.ok(rootEl.innerHTML.includes('Dispersion Radar') && rootEl.innerHTML.includes('<svg'));
    } else if (widget === 'ticker') {
      assert.ok(rootEl.innerHTML.includes('SHOTLAB') && rootEl.innerHTML.includes('412 swings'));
      assert.ok(classSet.has('root-ticker'));
    }
  }
});
