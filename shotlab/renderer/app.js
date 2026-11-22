/**
 * ShotLab — Broadcast Coaching OS & Launch Monitor Studio Renderer Controller.
 * Connects 01 Plan, 02 Practice (Live Telemetry + 7 Challenges), 03 Review (Swing DNA,
 * Delivery Faults by Cost, DECADE Dispersion, Real Kinovea Video Compare, Trends/SG),
 * and 04 My Bag (14-Club Sortable Gapping + Filter/Trim/Soft-Delete Shot Manager)
 * to Electron IPC + local SQLite (with clean standalone browser fallback).
 */
(function () {
  'use strict';

  const CLUB_ORDER = ['DR', '3W', '5W', '4H', '4I', '5I', '6I', '7I', '8I', '9I', 'PW', 'GW', 'SW', 'LW'];
  const DEFAULT_LOFTS = {
    DR: 10.5, '3W': 15, '5W': 18, '4H': 21,
    '4I': 22, '5I': 25, '6I': 28, '7I': 31.5, '8I': 35.5, '9I': 40,
    PW: 45, GW: 50, SW: 54, LW: 58,
  };
  const CLUB_LABELS = {
    DR: 'Driver', '3W': '3 Wood', '5W': '5 Wood', '4H': '4 Hybrid',
    '4I': '4 Iron', '5I': '5 Iron', '6I': '6 Iron', '7I': '7 Iron',
    '8I': '8 Iron', '9I': '9 Iron', PW: 'Pitching Wedge', GW: 'Gap Wedge (50°)',
    SW: 'Sand Wedge (54°)', LW: 'Lob Wedge (58°)',
  };

  const HAS_IPC = Boolean(typeof window !== 'undefined' && window.shotlabAPI);
  const $ = (id) => document.getElementById(id);

  let state = null;
  let activeMode = 'practice';
  let activePracticeSub = 'range'; // 'range' | 'challenge'
  let activeLabMode = 'coupled'; // 'coupled' | 'raw'
  let activeReviewSub = 'dna'; // 'dna' | 'decade' | 'video' | 'trends' | 'highlights'
  let activeTrendMetric = 'avgScore';
  let activeBagView = 'table'; // 'table' | 'warp'
  let matGlanceOpen = false;
  let missionState = null;

  let initialLoadComplete = false;
  let lastKnownNewestShotId = null;
  let dismissedFaultKey = null;
  let lastHotkeys = [];
  let lastTrajShot = null;
  let toastTimer = null;
  let tabRefreshTimer = null;

  const reviewFilters = { club: 'ALL', mode: 'real', days: 30, faultsOnly: false };
  let lastReviewData = null;
  let lastPlanData = null;
  let planDurationMin = 20;
  let activePopoverKey = null;

  const bagFilters = {
    mode: 'real',
    days: 90,
    quality: 'all',
    category: 'all',
    trimOutliers: false,
    sortKey: 'club',
    sortDir: 'asc',
    mgrClub: '7I',
    warp: { wind: 0, temp: 70, alt: 0, lie: 'fairway' },
  };
  let lastBagClubs = [];
  let lastBagDeletedCount = 0;

  const videoState = { club: 'ALL', selectedShotId: null, playbackRate: 0.5, data: null };
  const drawerState = { open: false, fault: 'all', mode: 'all', selectedId: null };

  const challengeStore = window.ShotLabChallenges ? window.ShotLabChallenges.createChallengeStore() : null;
  let lastChallengeScoredId = null;

  // ==================== SAFE IPC / FALLBACK ADAPTER ====================
  const standaloneDb = (() => {
    const demoShots = [
      {
        id: 'demo_1',
        ts: '2026-11-21T20:10:00Z',
        club: '7I',
        carry: 151, total: 158, offline: 6, ballSpeed: 111.2, clubSpeed: 86.1, smash: 1.29,
        vla: 18.2, hla: -2.6, backSpin: 7420, spinAxis: 9.4, aoa: -6.8, path: -3.8,
        face: -2.3, f2p: 1.5, dynLoft: 28.9, lean: 4.1, spinLoft: 25.0, apex: 86, descent: 50, curve: 11,
        shape: 'Pull Fade', sev: 'red', score: 54, sg: -0.28, deliveryId: 'steep_dig', deliveryName: 'Steep Chop / Heavy Dig',
        strikeLoc: 'fat', strikeLabel: 'Heavy / Low Heel', strikeCoords: { x: -0.42, y: -0.22 }, leftYds: 14,
        cues: ['Keep sternum stacked 1" ahead of ball', 'Shallow P5 path'],
      },
      {
        id: 'demo_2',
        ts: '2026-11-21T20:14:00Z',
        club: 'DR',
        carry: 252, total: 274, offline: -6, ballSpeed: 148.4, clubSpeed: 98.4, smash: 1.50,
        vla: 12.6, hla: 1.4, backSpin: 2380, spinAxis: -4.2, aoa: 3.1, path: 2.2,
        face: 1.1, f2p: -1.1, dynLoft: 13.8, lean: -3.3, spinLoft: 10.7, apex: 94, descent: 37, curve: -6,
        shape: 'Tour Push Draw', sev: 'green', score: 93, sg: 0.24, deliveryId: 'tour_sweep', deliveryName: 'Tour Upward Sweep',
        strikeLoc: 'center', strikeLabel: 'Center Flush', strikeCoords: { x: 0.04, y: 0.05 }, leftYds: 1,
        cues: ['Repeat 98 mph smooth cruise transition'],
      },
      {
        id: 'demo_3',
        ts: '2026-11-21T20:18:00Z',
        club: '7I',
        carry: 168, total: 175, offline: -2, ballSpeed: 120.4, clubSpeed: 87.2, smash: 1.38,
        vla: 16.4, hla: 1.6, backSpin: 6420, spinAxis: -4.0, aoa: -4.3, path: 2.4,
        face: 1.5, f2p: -0.9, dynLoft: 26.8, lean: 6.1, spinLoft: 22.5, apex: 94, descent: 48, curve: -5,
        shape: 'Tour Push Draw', sev: 'green', score: 94, sg: 0.29, deliveryId: 'pure_compression', deliveryName: 'Pure Compression',
        strikeLoc: 'center', strikeLabel: 'Center Flush', strikeCoords: { x: 0.02, y: 0.04 }, leftYds: 2,
        cues: ['Lead wrist flat through P6-P7'],
      },
      {
        id: 'demo_4',
        ts: '2026-11-21T20:22:00Z',
        club: 'DR',
        carry: 228, total: 244, offline: -34, ballSpeed: 146.5, clubSpeed: 103.2, smash: 1.42,
        vla: 9.8, hla: -2.8, backSpin: 1920, spinAxis: -19.5, aoa: 1.5, path: 2.1,
        face: -3.9, f2p: -6.0, dynLoft: 8.2, lean: -2.3, spinLoft: 6.7, apex: 62, descent: 31, curve: -26,
        shape: 'Snap Hook', sev: 'red', score: 42, sg: -0.46, deliveryId: 'low_hook_trap', deliveryName: 'Low Hook Trap',
        strikeLoc: 'toe', strikeLabel: 'High Toe Gear Hook', strikeCoords: { x: 0.45, y: 0.16 }, leftYds: 24,
        cues: ['Cap Driver at 98 mph cruise window'],
      },
      {
        id: 'demo_5',
        ts: '2026-11-21T20:26:00Z',
        club: '4H',
        carry: 198, total: 207, offline: 2, ballSpeed: 130.4, clubSpeed: 92.5, smash: 1.41,
        vla: 14.2, hla: 1.5, backSpin: 4380, spinAxis: -3.6, aoa: -2.2, path: 1.9,
        face: 0.8, f2p: -1.1, dynLoft: 18.1, lean: 2.9, spinLoft: 15.9, apex: 91, descent: 45, curve: -5,
        shape: 'Controlled Draw', sev: 'green', score: 89, sg: 0.21, deliveryId: 'pure_compression', deliveryName: 'Pure Compression',
        strikeLoc: 'center', strikeLabel: 'Center Flush', strikeCoords: { x: 0.05, y: 0.02 }, leftYds: 2,
        cues: ['Shallow fairway sweep'],
      },
      {
        id: 'demo_6',
        ts: '2026-11-21T20:30:00Z',
        club: 'SW',
        carry: 99, total: 98, ballSpeed: 82.0, clubSpeed: 67.8, smash: 1.21, offline: 1,
        vla: 29.4, hla: -0.3, backSpin: 10350, spinAxis: 1.1, aoa: -5.6, path: -0.8,
        face: -0.2, f2p: 0.6, dynLoft: 46.5, lean: 7.5, spinLoft: 52.1, apex: 86, descent: 53, curve: 1,
        shape: 'Straight Hop-Stop', sev: 'green', score: 92, sg: 0.24, deliveryId: 'pure_compression', deliveryName: 'Pure Compression',
        strikeLoc: 'center', strikeLabel: '2nd-Groove Center', strikeCoords: { x: 0.0, y: -0.1 }, leftYds: 0,
        cues: ['Rotate chest through on 18/9 tempo'],
      },
      {
        id: 'demo_7',
        ts: '2026-11-21T20:34:00Z',
        club: '7I',
        carry: 149, total: 156, offline: 15, ballSpeed: 113.0, clubSpeed: 86.2, smash: 1.31,
        vla: 23.8, hla: 2.1, backSpin: 8240, spinAxis: 11.2, aoa: 0.8, path: -2.0,
        face: 2.6, f2p: 4.6, dynLoft: 34.0, lean: -2.5, spinLoft: 33.2, apex: 114, descent: 54, curve: 14,
        shape: 'Weak Slice', sev: 'red', score: 48, sg: -0.41, deliveryId: 'flipping_floater', deliveryName: 'Flipping Floater',
        strikeLoc: 'heel', strikeLabel: 'Heel Flip', strikeCoords: { x: -0.35, y: -0.15 }, leftYds: 18,
        cues: ['Lead wrist bowed / motorcycle throttle through P6'],
      },
    ];
    let deletedIds = new Set();
    let settings = {
      tierId: 'low_hcp',
      handedness: 'RH',
      altitudeFt: 0,
      practiceMode: 'real',
      activeFeelId: null,
      activeDrillId: null,
      audioCaddie: false,
      audioChimes: true,
      tempoPreset: 'off',
      tempoSound: 'tones',
      tempoGapSec: 0,
      refLines: ['tour'],
      obsAutoHideSec: 0,
      studio: {
        matType: 'fiberbuilt',
        intendedShape: 'stock',
        showGoalLine: true,
        activeCues: [
          { id: 'c1', text: 'Shaft pointed at left thigh at address (P1)', club: 'All' },
          { id: 'c2', text: 'Lead wrist flat through P6–P7 impact zone', club: 'Irons' },
        ],
        parkedIdeas: [{ id: 'p1', text: 'Pause at P4 top transition before firing Driver', ts: 'Today' }],
        bodyCheckin: { hamstrings: 1, ankle: 'ok', energy: 4 },
        roundCheckin: null,
        wedgeMatrix: [
          { club: 'PW', label: 'PW (45°)', cells: [{ arm: '7:30', pct: '50%', carry: 68, roll: 5 }, { arm: '9:00', pct: '75%', carry: 96, roll: 4 }, { arm: '10:30', pct: '90%', carry: 116, roll: 3 }, { arm: 'Full', pct: '100%', carry: 126, roll: 3 }] },
          { club: 'GW', label: 'GW (50°)', cells: [{ arm: '7:30', pct: '50%', carry: 58, roll: 4 }, { arm: '9:00', pct: '75%', carry: 84, roll: 3 }, { arm: '10:30', pct: '90%', carry: 102, roll: 2 }, { arm: 'Full', pct: '100%', carry: 112, roll: 1 }] },
          { club: 'SW', label: 'SW (54°)', cells: [{ arm: '7:30', pct: '50%', carry: 48, roll: 3 }, { arm: '9:00', pct: '75%', carry: 72, roll: 2 }, { arm: '10:30', pct: '90%', carry: 89, roll: 1 }, { arm: 'Full', pct: '100%', carry: 99, roll: -1 }] },
          { club: 'LW', label: 'LW (58°)', cells: [{ arm: '7:30', pct: '50%', carry: 38, roll: 2 }, { arm: '9:00', pct: '75%', carry: 60, roll: 1 }, { arm: '10:30', pct: '90%', carry: 75, roll: 0 }, { arm: 'Full', pct: '100%', carry: 84, roll: -2 }] },
        ],
      },
    };
    const faultToDrillIds = {
      flipping_floater: ['hackmotion-shaft-lean-impact'],
      early_cast: ['hackmotion-shaft-lean-impact'],
      over_hold: ['hackmotion-shaft-lean-impact'],
      steep_dig: ['gate-towel-lowpoint'],
      steep_chop: ['gate-towel-lowpoint'],
      pop_up: ['driver-startline-fairway-challenge'],
      low_hook_trap: ['driver-startline-fairway-challenge'],
      hooded_trap: ['driver-startline-fairway-challenge'],
      strike_toe: ['gate-towel-lowpoint'],
      strike_heel: ['gate-towel-lowpoint'],
      strike_fat: ['gate-towel-lowpoint'],
      strike_thin: ['gate-towel-lowpoint'],
    };
    const drills = [
      { id: 'hackmotion-shaft-lean-impact', title: 'Impact Bag Motorcycle Deloft', focus: 'Lead Wrist Bowing', keyFeel: 'Twist motorcycle throttle down into P6', faultTags: ['early-release-scoop', 'early-release'], shotlabFaultIds: ['flipping_floater', 'early_cast', 'over_hold'], modes: ['real', 'almost'], clubs: 'irons', why: 'Eliminates flipping floater by matching lead wrist flexion.', instructions: ['Preset impact alignment with 7I', 'Slow 50% swings finishing waist-high'] },
      { id: 'gate-towel-lowpoint', title: 'Towel-Behind-Ball Low-Point Gate', focus: 'Ball-First Turf Strike', keyFeel: 'Sternum ahead of ball; miss towel 3 inches back', faultTags: ['low-point-control', 'over-the-top'], shotlabFaultIds: ['steep_dig', 'steep_chop', 'strike_fat', 'strike_thin', 'strike_toe', 'strike_heel'], modes: ['real', 'almost'], clubs: 'irons', why: 'Mat bounces mask heavy fat strikes; towel gives honest contact feedback.', instructions: ['Place flat towel 3.5" behind ball', 'Brush front side of ball cleanly'] },
      { id: 'driver-startline-fairway-challenge', title: '98 mph Cruise Gear Fairway Gate', focus: 'Driver Start Line & Tempo', keyFeel: 'Smooth pause at top, keep path < +3°', faultTags: ['driver-hook', 'steep-driver-aoa'], shotlabFaultIds: ['low_hook_trap', 'hooded_trap', 'pop_up'], modes: ['real'], clubs: 'driver', why: 'Prevents over-swing speed cliffs and snap hooks.', instructions: ['Target 96-99 mph cruise window', 'Hit 5 straight drives inside ±15y gate'] },
    ];
    const feels = [
      { id: 'the-throw', name: 'The Throw (Trail Hand Release)', club: 'Irons' },
      { id: 'cruise-98', name: '98 mph Cruise Rhythm', club: 'DR' },
      { id: 'sternum-lead', name: 'Sternum 1" Ahead at Impact', club: 'Irons' },
    ];

    function toAnalyzed(d) {
      const cat = d.club === 'DR' ? 'driver' : d.club === '4H' ? 'hybrid' : ['PW', 'GW', 'SW', 'LW'].includes(d.club) ? 'wedge' : 'mid_iron';
      const goalCarry = d.club === 'DR' ? 250 : d.club === '4H' ? 196 : d.club === 'SW' ? 99 : 166;
      const curvePts = Array.from({ length: 16 }, (_, i) => {
        const t = i / 15;
        return { x: Math.round(d.carry * t * 10) / 10, y: Math.round(4 * d.apex * t * (1 - t) * 10) / 10 };
      });
      return {
        id: d.id,
        ts: d.ts,
        practiceMode: settings.practiceMode,
        feelId: settings.activeFeelId,
        activeClub: d.club,
        activeClubLabel: CLUB_LABELS[d.club] || d.club,
        activeClubSource: 'detected',
        confirmedClub: null,
        isDemo: true,
        metrics: {
          ballSpeed: d.ballSpeed, clubSpeed: d.clubSpeed, smash: d.smash, vla: d.vla, hla: d.hla,
          totalSpin: d.backSpin, backSpin: d.backSpin, spinAxis: d.spinAxis, aoa: d.aoa, path: d.path,
          effectiveCarry: d.carry, totalYds: d.total, faceToTarget: d.face, faceToPath: d.f2p,
          estDynamicLoft: d.dynLoft, estShaftLean: d.lean, spinLoft: d.spinLoft, clubRead: true,
        },
        clubSpec: { code: d.club, label: CLUB_LABELS[d.club] || d.club, category: cat, staticLoft: DEFAULT_LOFTS[d.club] || 31.5, idealSmash: d.club === 'DR' ? 1.48 : 1.36 },
        flight: { carryYds: d.carry, totalYds: d.total, rollYds: Math.max(0, d.total - d.carry), apexFt: d.apex, descentAngleDeg: d.descent, curveYds: d.curve, offlineYds: d.offline, points: curvePts },
        potential: { actualCarryYds: d.carry, centerStrikeCarryYds: d.carry + d.leftYds, maxCarryAtSpeedYds: d.carry + d.leftYds + 2, speedUpsideCarryYds: d.carry + d.leftYds + 10, speedUpsideMph: Math.round((d.clubSpeed || 90) + 5), totalLeftOnTableYds: d.leftYds, reasons: [d.cues[0]] },
        references: [],
        dplane: { faceToTarget: d.face, faceToPath: d.f2p, faceSource: 'estimated', faceRationale: 'D-Plane estimate from HLA & Path.', gearEffectResidual: 0 },
        shotShape: { name: d.shape, shortTag: d.shape, heightTag: d.apex > 105 ? 'High Ball' : 'Optimal Height', severity: d.sev, description: `${d.shape} finishing ${Math.abs(d.offline)}y ${d.offline < 0 ? 'L' : 'R'}.`, svgParams: { hlaDeg: d.hla, curveYds: d.curve, offlineYds: d.offline, carryYds: d.carry, severity: d.sev }, rationale: d.cues },
        delivery: { id: d.deliveryId, name: d.deliveryName, severity: d.sev, confidence: 0.86, estDynamicLoft: d.dynLoft, estShaftLean: d.lean, spinLoft: d.spinLoft, tagline: d.cues[0], cues: d.cues, evidence: [d.cues[0]] },
        strike: { location: d.strikeLoc, label: d.strikeLabel, severity: d.sev, confidence: 0.85, coords: d.strikeCoords, rationale: [d.cues[0]] },
        scorecard: {
          tierId: settings.tierId,
          tierLabel: settings.tierId === 'tour_pro' ? 'Tour Pro' : settings.tierId,
          score: d.score,
          overallGrade: d.sev,
          counts: { green: d.sev === 'green' ? 11 : 4, yellow: 3, red: d.sev === 'red' ? 5 : 1 },
          cards: [
            { key: 'carry', label: 'Carry', value: `${d.carry}`, raw: d.carry, unit: 'yds', grade: d.sev, source: 'measured', target: `${goalCarry}y`, goalDelta: `${d.carry - goalCarry >= 0 ? '+' : ''}${d.carry - goalCarry}y vs ${goalCarry}y`, tooltip: 'Carry distance' },
            { key: 'offline', label: 'Offline', value: `${Math.abs(d.offline)}y ${d.offline < 0 ? 'L' : 'R'}`, raw: d.offline, unit: '', grade: Math.abs(d.offline) <= 10 ? 'green' : Math.abs(d.offline) <= 18 ? 'yellow' : 'red', source: 'measured', target: '±10y', goalDelta: `${Math.abs(d.offline)}y / ±10y`, tooltip: 'Lateral miss' },
            { key: 'smash', label: 'Smash Factor', value: d.smash.toFixed(2), raw: d.smash, unit: '', grade: d.sev, source: 'measured', target: '≥1.35', goalDelta: `${(d.smash - 1.35 >= 0 ? '+' : '')}${(d.smash - 1.35).toFixed(2)} vs 1.35`, tooltip: 'Ball / Club Speed' },
            { key: 'ballSpeed', label: 'Ball Speed', value: d.ballSpeed.toFixed(1), raw: d.ballSpeed, unit: 'mph', grade: d.sev, source: 'measured', target: 'Target', goalDelta: 'In window', tooltip: 'Ball Speed' },
            { key: 'clubSpeed', label: 'Club Speed', value: d.clubSpeed.toFixed(1), raw: d.clubSpeed, unit: 'mph', grade: 'green', source: 'measured', target: 'Cruise', goalDelta: 'Cruise', tooltip: 'Club Speed' },
            { key: 'aoa', label: 'Angle of Attack', value: `${d.aoa}°`, raw: d.aoa, unit: '', grade: 'green', source: 'measured', target: '-4°', goalDelta: `${d.aoa}°`, tooltip: 'AoA' },
            { key: 'path', label: 'Club Path', value: `${d.path}°`, raw: d.path, unit: '', grade: Math.abs(d.path) <= 3 ? 'green' : 'yellow', source: 'measured', target: '±3.0°', goalDelta: `${d.path}°`, tooltip: 'Path' },
            { key: 'face', label: 'Face to Target', value: `${d.face}°`, raw: d.face, unit: '', grade: Math.abs(d.face) <= 2 ? 'green' : 'red', source: 'estimated', target: '±2.0°', goalDelta: `${d.face}°`, tooltip: 'Face' },
            { key: 'faceToPath', label: 'Face to Path', value: `${d.f2p}°`, raw: d.f2p, unit: '', grade: Math.abs(d.f2p) <= 2.5 ? 'green' : 'red', source: 'estimated', target: '±2.5°', goalDelta: `${d.f2p}°`, tooltip: 'F2P' },
            { key: 'vla', label: 'Launch (VLA)', value: `${d.vla}°`, raw: d.vla, unit: '', grade: d.sev, source: 'measured', target: 'Window', goalDelta: `${d.vla}°`, tooltip: 'VLA' },
            { key: 'backSpin', label: 'Backspin', value: String(d.backSpin), raw: d.backSpin, unit: 'rpm', grade: d.sev, source: 'measured', target: 'Window', goalDelta: `${d.backSpin} rpm`, tooltip: 'Backspin' },
            { key: 'spinAxis', label: 'Spin Axis', value: `${d.spinAxis}°`, raw: d.spinAxis, unit: '', grade: Math.abs(d.spinAxis) <= 8 ? 'green' : 'red', source: 'measured', target: '±8°', goalDelta: `${d.spinAxis}°`, tooltip: 'Spin Axis' },
            { key: 'hla', label: 'Start Line (HLA)', value: `${d.hla}°`, raw: d.hla, unit: '', grade: Math.abs(d.hla) <= 2.5 ? 'green' : 'yellow', source: 'measured', target: '±2.5°', goalDelta: `${d.hla}°`, tooltip: 'HLA' },
            { key: 'shaftLean', label: 'Est. Shaft Lean', value: `${d.lean}°`, raw: d.lean, unit: '', grade: d.lean >= 4 ? 'green' : 'red', source: 'estimated', target: '+5°', goalDelta: `${d.lean}°`, tooltip: 'Shaft Lean' },
            { key: 'descent', label: 'Descent Angle', value: `${d.descent}°`, raw: d.descent, unit: '', grade: 'green', source: 'physics', target: '45°+', goalDelta: `${d.descent}°`, tooltip: 'Descent' },
          ],
        },
        coupledSignals: {
          cards: [
            { id: 'launchSpin', title: 'Launch × Spin Window', helpKey: 'vla', severity: d.sev, verdict: d.deliveryId === 'flipping_floater' ? 'OVER-LAUNCHED · HIGH SPIN' : 'TOUR LAUNCH WINDOW', delta: `${d.vla}° / ${d.backSpin}`, rows: [{ label: 'VLA', value: `${d.vla}°` }, { label: 'Spin', value: `${d.backSpin} rpm` }], takeaway: d.cues[0] },
            { id: 'turfStrike', title: 'Turf × AoA × Smash', helpKey: 'smash', severity: d.strikeLoc === 'fat' ? 'red' : d.sev, verdict: d.strikeLoc === 'fat' ? 'MAT-SAVED FAT RISK' : 'CLEAN TURF STRIKE', delta: `Smash ${d.smash.toFixed(2)}`, rows: [{ label: 'Smash', value: d.smash.toFixed(2) }, { label: 'AoA', value: `${d.aoa}°` }], takeaway: d.strikeLabel },
            { id: 'dplaneShape', title: 'Start Line × F2P', helpKey: 'faceToPath', severity: Math.abs(d.f2p) > 3 ? 'red' : 'green', verdict: Math.abs(d.f2p) > 3 ? 'EXCESS CURVE' : 'ON-TARGET D-PLANE', delta: `F2P ${d.f2p}°`, rows: [{ label: 'HLA', value: `${d.hla}°` }, { label: 'Path', value: `${d.path}°` }], takeaway: d.shape },
            { id: 'speedEfficiency', title: 'Speed × Potential', helpKey: 'carry', severity: d.leftYds > 10 ? 'red' : 'green', verdict: d.leftYds > 10 ? `LEFT ${d.leftYds}Y ON TABLE` : 'CRUISE EFFICIENCY', delta: `${d.carry}y`, rows: [{ label: 'Carry', value: `${d.carry}y` }, { label: 'Lost', value: `${d.leftYds}y` }], takeaway: `Avg SG ${d.sg >= 0 ? '+' : ''}${d.sg.toFixed(2)}` },
          ],
        },
        faultCoach: {
          headline: d.deliveryName,
          severity: d.sev,
          likelyCauses: d.cues,
          feelsToTry: d.cues.map((c, i) => ({ id: `fc_${i}`, label: c, cue: c })),
          recommendedDrills: drills.slice(0, 2),
        },
        dataQuality: { clubRead: true, basis: 'full', missing: [] },
        strokesGained: { sg: d.sg, sgPga: d.sg, category: d.club === 'DR' ? 'OTT' : 'APP', explanation: 'Fallback demo shot.' },
        clubDetection: { predictedClub: d.club, predictedLabel: CLUB_LABELS[d.club], confidencePct: 92, top3: [{ club: d.club, confidencePct: 92 }, { club: '6I', confidencePct: 6 }, { club: '8I', confidencePct: 2 }], summary: 'Prior Bayesian club detector' },
      };
    }

    let shotsList = demoShots.map(toAnalyzed);
    let selectedId = shotsList[0].id;
    let demoSeq = 0;
    let cal = { driverSpeedMph: 98, clubs: { DR: { n: 12 }, '7I': { n: 18 }, PW: { n: 9 } }, autoSwitch: { enabled: false, minConfidence: 0.9 }, customLofts: {} };

    function activeRaw({ club = 'ALL', quality = 'all' } = {}) {
      return demoShots.filter((d) => {
        if (deletedIds.has(d.id)) return false;
        if (club !== 'ALL' && d.club !== club) return false;
        if (quality === 'center' && d.strikeLoc !== 'center') return false;
        return true;
      });
    }

    function computeReview() {
      const list = activeRaw();
      const byDel = new Map();
      for (const r of list) {
        if (!byDel.has(r.deliveryId)) byDel.set(r.deliveryId, { deliveryId: r.deliveryId, deliveryName: r.deliveryName, isFault: r.deliveryId !== 'pure_compression' && r.deliveryId !== 'tour_sweep', count: 0, sgSum: 0, lostSum: 0 });
        const g = byDel.get(r.deliveryId);
        g.count += 1; g.sgSum += r.sg; g.lostSum += r.leftYds;
      }
      const faultLeaks = [...byDel.values()].map((g) => ({
        deliveryId: g.deliveryId,
        deliveryName: g.deliveryName,
        isFault: g.isFault,
        count: g.count,
        pct: Math.round((g.count / Math.max(1, list.length)) * 100),
        avgSg: Math.round((g.sgSum / g.count) * 100) / 100,
        totalSg: Math.round(g.sgSum * 100) / 100,
        avgLostYds: Math.round((g.lostSum / g.count) * 10) / 10,
      })).sort((a, b) => a.totalSg - b.totalSg);

      return {
        summary: { totalShots: list.length, totalSessions: 4, clubsTracked: 4, clipsLinked: 0, backend: 'browser-demo' },
        patterns: {
          n: list.length,
          meanCarry: 179,
          meanOffline: -3.2,
          ellipse80: { cx: -3.2, cy: 179, rx: 14, ry: 12, angleDeg: -8, widthYds: 28, depthYds: 24 },
          twoWayMiss: { detected: true, left80Yds: -24, right80Yds: 14, label: 'Two-Way Miss (−24y to +14y)' },
          cruiseSpeedBuckets: [
            { speedMph: 86, n: 2, avgSg: -0.34, avgScore: 51, bigMissPct: 50 },
            { speedMph: 98, n: 2, avgSg: 0.24, avgScore: 93, bigMissPct: 0 },
            { speedMph: 103, n: 1, avgSg: -0.46, avgScore: 42, bigMissPct: 100 },
          ],
          optimalCruiseMph: 98,
          rootCauseAttribution: [
            { key: 'faceToPath', label: '|Face-to-Path| Control', impactPct: 52, detail: 'Curvature variance vs target' },
            { key: 'smash', label: 'Center Contact (Smash)', impactPct: 26, detail: 'Sweet-spot transfer' },
            { key: 'path', label: 'Club Path Corridor', impactPct: 13, detail: 'In-to-Out vs Out-to-In' },
            { key: 'aoa', label: 'Angle of Attack Window', impactPct: 9, detail: 'Low point depth' },
          ],
          avgSg: 0.01,
          avgScore: 73,
          decadeAdvice: '80% corridor is 28y wide, slightly left biased — favor center-right fairway/green targets.',
          faultLeaks,
          averages: { ballSpeed: 121.6, clubSpeed: 88.8, smash: 1.37, vla: 18.0, backSpin: 6250, aoa: -2.9, path: 0.4, estShaftLean: 2.6, carryYds: 179, apexFt: 90, descentDeg: 45 },
          strikeCounts: { center: 4, fat: 1, toe: 1, heel: 1 },
          points: list.map((r) => ({ id: r.id, carryYds: r.carry, offlineYds: r.offline, score: r.score, sg: r.sg, shotShape: r.shape })),
        },
        feelComparison: [
          { feelId: 'cruise-98', label: '98 mph Cruise Rhythm', n: 3, avgScore: 93, avgSg: 0.25, avgSmash: 1.43, avgCarry: 206, width80Yds: 14, faultPct: 0 },
          { feelId: null, label: 'Baseline (No Feel Tagged)', n: 4, avgScore: 60, avgSg: -0.23, avgSmash: 1.32, avgCarry: 162, width80Yds: 32, faultPct: 75 },
        ],
        trends: [
          { date: '2026-11-15', n: 18, avgScore: 66, avgSmash: 1.31, avgCarry: 158, avgSg: -0.14, faultPct: 48 },
          { date: '2026-11-17', n: 22, avgScore: 71, avgSmash: 1.33, avgCarry: 161, avgSg: -0.05, faultPct: 36 },
          { date: '2026-11-19', n: 24, avgScore: 76, avgSmash: 1.35, avgCarry: 164, avgSg: 0.06, faultPct: 28 },
          { date: '2026-11-21', n: 16, avgScore: 81, avgSmash: 1.37, avgCarry: 166, avgSg: 0.14, faultPct: 19 },
        ],
        fatigue: [
          { id: '1-10', label: 'Warmup (1–10)', n: 10, avgScore: 74, avgSmash: 1.34 },
          { id: '11-25', label: 'Dialed In (11–25)', n: 15, avgScore: 84, avgSmash: 1.37 },
          { id: '26-45', label: 'Peak Window (26–45)', n: 18, avgScore: 82, avgSmash: 1.36 },
          { id: '46-70', label: 'Late Session (46–70)', n: 12, avgScore: 68, avgSmash: 1.30 },
        ],
        sgByCategory: [
          { id: 'OTT', label: 'Off the Tee (Woods)', n: 2, avgSg: -0.11 },
          { id: 'APP', label: 'Approach (Hyb & Irons)', n: 4, avgSg: -0.05 },
          { id: 'WEDGE', label: 'Scoring Wedges', n: 1, avgSg: 0.24 },
        ],
        highlights: list.filter((x) => x.sg >= 0.2).map((d) => ({ id: d.id, ts: d.ts, club: d.club, carryYds: d.carry, score: d.score, sgShot: d.sg, deliveryName: d.deliveryName, shotShape: d.shape })),
        heatmap: Array.from({ length: 91 }, (_, i) => ({ date: `Day ${i + 1}`, count: (i * 7) % 5 === 0 ? 28 : (i % 3 === 0 ? 12 : 0), avgScore: 78 })),
      };
    }

    function snapshot() {
      const cur = shotsList.find((s) => s.id === selectedId) || shotsList[0] || null;
      return {
        bridgeConnected: false,
        bridgeSnifferOk: false,
        rigHealth: null,
        hotkeys: [],
        gsproClub: '7I',
        obsPort: 8766,
        simwatchPort: 8765,
        settings,
        calibration: cal,
        calibrationStats: { recentExactPct: 91, recentWithinOnePct: 97, highConfExactPct: 95, totalConfirmed: 39, calibratedClubs: ['DR', '7I', 'PW'] },
        currentShot: cur,
        shots: shotsList,
        demoArchetypes: demoShots.map((d) => ({ id: d.id, label: `${d.club} — ${d.shape}`, actualClub: d.club })),
        dbSummary: computeReview().summary,
        drillsHub: { loaded: true, drills, feels, faultToDrillIds },
        faultAlert: null,
        sessionStats: { count: shotsList.length, clubReads: shotsList.length, avgScore: 73, avgCarry: 179, avgSg: 0.01 },
      };
    }

    return {
      getState: async () => snapshot(),
      getHotkeys: async () => [],
      selectShot: async (id) => { selectedId = id; render(snapshot()); return true; },
      fireDemo: async (archetypeId) => {
        const base = (archetypeId && demoShots.find((d) => d.id === archetypeId))
          || demoShots[(demoSeq) % demoShots.length];
        demoSeq += 1;
        const shot = toAnalyzed({
          ...base,
          id: `${base.id}#${demoSeq}`,
          ts: new Date().toISOString(),
        });
        shotsList.unshift(shot);
        if (shotsList.length > 60) shotsList = shotsList.slice(0, 60);
        selectedId = shot.id;
        render({ ...snapshot(), eventType: 'shot' });
      },
      clearSession: async () => { shotsList = []; selectedId = null; return snapshot(); },
      updateSettings: async (patch = {}) => {
        const p = patch || {};
        if (typeof p.driverSpeedMph === 'number') cal.driverSpeedMph = p.driverSpeedMph;
        if (p.autoSwitch) cal.autoSwitch = { ...cal.autoSwitch, ...p.autoSwitch };
        if (p.customLofts) cal.customLofts = { ...cal.customLofts, ...p.customLofts };
        const sPatch = { ...p };
        delete sPatch.driverSpeedMph; delete sPatch.autoSwitch; delete sPatch.customLofts;
        settings = { ...settings, ...sPatch };
        shotsList = shotsList.map((s) => {
          const baseId = String(s.id || '').split('#')[0];
          const raw = demoShots.find((d) => d.id === baseId);
          return raw ? { ...toAnalyzed({ ...raw, id: s.id, ts: s.ts }) } : s;
        });
        render(snapshot());
        return snapshot();
      },
      setPracticeContext: async (patch) => { settings = { ...settings, ...patch }; render(snapshot()); return snapshot(); },
      updateStudioState: async (patch) => { settings.studio = { ...settings.studio, ...patch }; render(snapshot()); return snapshot(); },
      getPlanData: async () => { const rev = computeReview(); return { summary: rev.summary, heatmap: rev.heatmap, topLeaks: rev.patterns.faultLeaks.filter((l) => l.isFault !== false), studio: settings.studio }; },
      getReviewData: async () => computeReview(),
      getBagGapping: async ({ category = 'all', mode = 'real', quality = 'all', trimOutliers = false } = {}) => {
        const prevCompute = mode === 'almost' ? [] : activeRaw({ quality });
        const byClub = new Map();
        for (const r of prevCompute) {
          if (!byClub.has(r.club)) byClub.set(r.club, []);
          byClub.get(r.club).push(r);
        }
        const rawAll = CLUB_ORDER.map((c) => {
          let list = byClub.get(c) || [];
          let outliersTrimmed = 0;
          if (trimOutliers && list.length >= 2) {
            const clean = list.filter((x) => !x.deliveryId || x.deliveryId === 'pure_compression' || x.deliveryId === 'tour_sweep');
            if (clean.length > 0 && clean.length < list.length) { outliersTrimmed = list.length - clean.length; list = clean; }
          }
          if (!list.length) return { club: c, label: CLUB_LABELS[c], n: 0, outliersTrimmed: 0, avgCarry: null, avgTotal: null, avgBallSpeed: null, avgSmash: null, avgSpin: null, avgDescent: null, stoppingPower: '—', width80Yds: null, avgSg: null, avgScore: null, gapToNextYds: null, gapAlert: null };
          const mean = (fn) => Math.round((list.reduce((a, x) => a + fn(x), 0) / list.length) * 100) / 100;
          const desc = mean((x) => x.descent);
          return {
            club: c, label: CLUB_LABELS[c], n: list.length, outliersTrimmed,
            avgCarry: Math.round(mean((x) => x.carry) * 10) / 10,
            avgTotal: Math.round(mean((x) => x.total) * 10) / 10,
            avgBallSpeed: Math.round(mean((x) => x.ballSpeed) * 10) / 10,
            avgSmash: mean((x) => x.smash),
            avgSpin: Math.round(mean((x) => x.backSpin)),
            avgDescent: desc,
            stoppingPower: desc >= 47 ? 'Drop & Stop' : desc >= 41 ? 'Holds Green' : 'Runs Out',
            width80Yds: 18,
            avgSg: mean((x) => x.sg),
            avgScore: Math.round(mean((x) => x.score)),
            gapToNextYds: null,
            gapAlert: null,
          };
        });
        const pop = rawAll.filter((c) => c.n >= 2);
        for (let i = 0; i < pop.length - 1; i += 1) pop[i].gapToNextYds = Math.round(pop[i].avgCarry - pop[i + 1].avgCarry);
        const groups = { woods: new Set(['DR', '3W', '5W']), hybrids: new Set(['4H']), irons: new Set(['4I', '5I', '6I', '7I', '8I', '9I']), wedges: new Set(['PW', 'GW', 'SW', 'LW']) };
        const clubs = (category !== 'all' && groups[category]) ? rawAll.filter((c) => groups[category].has(c.club)) : rawAll;
        return { clubs, summary: computeReview().summary, deletedCount: deletedIds.size };
      },
      getBagShots: async ({ club = 'ALL', mode = 'real', quality = 'all' } = {}) => ({
        shots: mode === 'almost' ? [] : activeRaw({ club, quality }).map((r) => ({ id: r.id, ts: r.ts, club: r.club, carry_yds: r.carry, offline_yds: r.offline, smash: r.smash, back_spin: r.backSpin, shot_shape: r.shape, delivery_name: r.deliveryName, sg_shot: r.sg })),
        deletedCount: deletedIds.size,
        globalDeletedCount: deletedIds.size,
      }),
      deleteShot: async (id) => { deletedIds.add(id); return { ok: true, deletedCount: deletedIds.size }; },
      restoreDeletedShots: async () => { const n = deletedIds.size; deletedIds.clear(); return { ok: true, restored: n, deletedCount: 0 }; },
      getVideoCompare: async () => ({ current: null, best: null, recentWithClips: [] }),
      syncHistory: async () => ({ ok: true, shotsImported: 0, filesScanned: 0 }),
      exportDebrief: async () => ({ ok: false, canceled: true }),
      setChallengeState: async () => true,
      copyText: async () => true,
      openExternal: async () => false,
    };
  })();

  const api = HAS_IPC ? window.shotlabAPI : standaloneDb;

  // ==================== HELPERS & POPOVERS ====================
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (typeof el.showPopover === 'function') {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
        el.showPopover();
      } catch {}
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
      if (typeof el.hidePopover === 'function') {
        try { if (el.matches(':popover-open')) el.hidePopover(); } catch {}
      }
    }, 3000);
  }

  function fmtSg(val, { prefix = 'SG ' } = {}) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
    return `${prefix}${val > 0 ? '+' : val < 0 ? '−' : ''}${Math.abs(val).toFixed(2)}`;
  }

  function sgCol(val) {
    if (typeof val !== 'number' || !Number.isFinite(val)) return 'var(--text-dim)';
    return val >= 0.04 ? 'var(--green)' : val <= -0.1 ? 'var(--red-hi)' : 'var(--text)';
  }

  function feelLabelById(feelId, snap = state) {
    if (!feelId) return 'Baseline';
    const list = snap?.drillsHub?.feels || [];
    const hit = list.find((f) => f && f.id === feelId);
    return hit ? (hit.name || hit.label || hit.id) : feelId;
  }

  let keysReqSeq = 0;

  function openDialog(id) {
    const dlg = $(id);
    if (!dlg) return;
    if (id === 'dlg-obs' && state) renderObsModal(state);
    if (id === 'dlg-settings' && state) renderSettingsModal(state);
    if (id === 'dlg-cal' && state) renderCalModal(state);
    if (id === 'dlg-wedge') renderWedgePrintModal();
    if (id === 'dlg-keys') {
      renderKeysModal();
      if (HAS_IPC && typeof api.getHotkeys === 'function') {
        const seq = ++keysReqSeq;
        Promise.resolve(api.getHotkeys()).then((liveKeys) => {
          if (seq === keysReqSeq && dlg.open && Array.isArray(liveKeys)) {
            lastHotkeys = liveKeys;
            renderKeysModal();
          }
        }).catch(() => {});
      }
    }
    if (id === 'dlg-tempo') syncTempoModal();
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function closeDialog(id) {
    const dlg = $(id);
    if (!dlg) return;
    if (typeof dlg.close === 'function') {
      if (dlg.open) dlg.close();
    } else {
      dlg.removeAttribute('open');
    }
  }

  // Click-to-explain metric popovers (? buttons)
  function hideMetricPopover() {
    const pop = $('metric-popover');
    activePopoverKey = null;
    if (pop) {
      pop.classList.remove('open');
      pop.setAttribute('aria-hidden', 'true');
    }
  }

  function showMetricPopover(key, triggerEl) {
    const pop = $('metric-popover');
    if (activePopoverKey === key && pop?.classList.contains('open')) {
      hideMetricPopover();
      return;
    }
    const map = (window.ShotLabCharts && window.ShotLabCharts.METRIC_HELP) || {};
    const m = map[key];
    if (!m || !pop) return;
    activePopoverKey = key;
    pop.innerHTML = `
      <div class="flex-row" style="justify-content:space-between;margin-bottom:6px;">
        <strong style="color:#fff;font-size:13px;">${esc(m.title)}</strong>
        <span class="badge badge-cyan">${esc(m.badge)}</span>
      </div>
      <p style="margin:0 0 8px;font-size:11.5px;">${esc(m.def)}</p>
      <div class="sub-well" style="font-size:11px;">
        <div><strong style="color:var(--green);">Goal Window:</strong> ${esc(m.goal)}</div>
        <div style="margin-top:3px;"><strong style="color:var(--yellow);">Why It Matters:</strong> ${esc(m.impact)}</div>
        <div style="margin-top:3px;"><strong style="color:var(--cyan);">Fix Cue:</strong> ${esc(m.cue)}</div>
      </div>
    `;
    pop.classList.add('open');
    pop.setAttribute('aria-hidden', 'false');
    const r = triggerEl.getBoundingClientRect();
    const pw = pop.offsetWidth || 330;
    const ph = pop.offsetHeight || 180;
    const left = Math.max(12, Math.min(window.innerWidth - pw - 12, r.left + r.width / 2 - pw / 2));
    const top = r.bottom + ph + 12 < window.innerHeight ? r.bottom + 8 : Math.max(12, r.top - ph - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  const hoverPop = $('hover-popover');
  function hideHoverPopover() { if (hoverPop) hoverPop.classList.add('hidden'); }
  function bindHover(el, getHtml) {
    if (!el || !hoverPop) return;
    const showAt = (x, y) => {
      const html = getHtml();
      if (!html) return;
      hoverPop.innerHTML = html;
      hoverPop.classList.remove('hidden');
      hoverPop.style.left = `${Math.max(12, Math.min(window.innerWidth - 340, x))}px`;
      hoverPop.style.top = `${Math.max(12, Math.min(window.innerHeight - 200, y))}px`;
    };
    el.onmouseenter = (ev) => showAt(ev.clientX + 14, ev.clientY + 12);
    el.onmousemove = (ev) => {
      if (!hoverPop.classList.contains('hidden')) {
        hoverPop.style.left = `${Math.max(12, Math.min(window.innerWidth - 340, ev.clientX + 14))}px`;
        hoverPop.style.top = `${Math.max(12, Math.min(window.innerHeight - 200, ev.clientY + 12))}px`;
      }
    };
    el.onmouseleave = hideHoverPopover;
    el.onclick = (ev) => {
      ev.stopPropagation();
      if (!hoverPop.classList.contains('hidden')) { hideHoverPopover(); return; }
      const r = el.getBoundingClientRect();
      showAt(r.left - 240, r.bottom + 8);
    };
  }

  document.addEventListener('click', (ev) => {
    const qBtn = ev.target.closest ? ev.target.closest('[data-metric-help]') : null;
    if (qBtn) {
      ev.stopPropagation();
      showMetricPopover(qBtn.dataset.metricHelp, qBtn);
      return;
    }
    if ($('metric-popover')?.classList.contains('open') && !(ev.target.closest && ev.target.closest('#metric-popover'))) {
      hideMetricPopover();
    }
    if (hoverPop && !hoverPop.classList.contains('hidden') && !(ev.target.closest && ev.target.closest('.q-btn'))) {
      hideHoverPopover();
    }
  });

  // Floating tooltip on SVG data dots
  document.addEventListener('mousemove', (ev) => {
    const tipEl = $('chart-tooltip');
    if (!tipEl) return;
    const dot = ev.target && ev.target.closest ? ev.target.closest('[data-tip]') : null;
    if (dot && dot.dataset.tip) {
      tipEl.textContent = dot.dataset.tip;
      tipEl.classList.add('show');
      tipEl.style.left = `${Math.min(window.innerWidth - 280, ev.clientX + 14)}px`;
      tipEl.style.top = `${Math.max(10, ev.clientY - 34)}px`;
    } else {
      tipEl.classList.remove('show');
    }
  });

  // ==================== NAVIGATION & CHROME ====================
  function switchMode(mode) {
    activeMode = mode;
    hideMetricPopover();
    hideHoverPopover();
    if (mode !== 'practice') {
      $('tension-vignette')?.classList.remove('active');
    } else if (state) {
      renderChallengePanel(state);
    }
    document.querySelectorAll('#lifecycle-nav .mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    document.querySelectorAll('.mode-panel').forEach((p) => p.classList.toggle('active', p.id === `mode-${mode}`));
    if (mode === 'plan') loadPlanTab();
    else if (mode === 'review') loadReviewTab();
    else if (mode === 'bag') loadBagTab();
  }

  function populateClubFilterSelect(sel, includeAll = true) {
    if (!sel || sel.options.length > 0) return;
    if (includeAll) {
      const allOpt = document.createElement('option');
      allOpt.value = 'ALL';
      allOpt.textContent = 'All Clubs';
      sel.appendChild(allOpt);
    }
    for (const c of CLUB_ORDER) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = `${c} — ${CLUB_LABELS[c] || c}`;
      sel.appendChild(opt);
    }
  }

  function renderTopbar(snap) {
    const port = snap.simwatchPort || 8765;
    const pillBridge = $('pill-bridge');
    if (snap.bridgeConnected) {
      pillBridge.className = 'pill pill-live';
      pillBridge.innerHTML = `<span class="dot"></span> Bridge :${esc(port)}`;
    } else {
      pillBridge.className = 'pill pill-warn';
      pillBridge.innerHTML = `<span class="dot"></span> Bridge Offline`;
    }
    const pillSniffer = $('pill-sniffer');
    pillSniffer.className = `pill ${snap.bridgeConnected && snap.bridgeSnifferOk ? 'pill-live' : 'pill-muted'}`;
    pillSniffer.textContent = snap.bridgeConnected && snap.bridgeSnifferOk ? ':921 OK' : ':921 Idle';

    const pillRig = $('pill-rig');
    const rh = snap.rigHealth;
    pillRig.textContent = rh?.state ? `Rig: ${rh.state}` : 'Rig: —';
    pillRig.className = `pill ${rh?.state === 'healthy' ? 'pill-live' : rh?.state ? 'pill-warn' : 'pill-muted'}`;

    $('pill-gspro-club').textContent = `GSPro: ${snap.gsproClub || '—'}`;
    lastHotkeys = Array.isArray(snap.hotkeys) ? snap.hotkeys : [];

    const sel = $('demo-select');
    if (sel.options.length === 0 && Array.isArray(snap.demoArchetypes)) {
      const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Random Demo Shot'; sel.appendChild(o0);
      for (const d of snap.demoArchetypes) {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label;
        sel.appendChild(opt);
      }
    }

    const settings = snap.settings || {};
    const pm = settings.practiceMode || 'real';
    document.querySelectorAll('#glob-mode-seg button').forEach((b) => b.classList.toggle('active', b.dataset.pm === pm));
    document.querySelectorAll('#glob-tier-seg button').forEach((b) => b.classList.toggle('active', b.dataset.tier === (settings.tierId || 'low_hcp')));

    const banner = $('glob-mode-banner');
    if (pm === 'almost') {
      banner.className = 'mode-banner show';
      $('glob-mode-banner-text').textContent = 'Kids-Asleep Firewall Active: Grading Start Line Gate (±1.5°) + Path + AoA only. Distance/spin paused.';
      $('glob-mode-banner-tag').textContent = 'QUIET MODE';
    } else if (pm === 'sore') {
      banner.className = 'mode-banner show is-sore';
      $('glob-mode-banner-text').textContent = 'Gym-Sore Recovery Firewall Active: Strokes Gained paused — focus on 75% tempo rehearsal.';
      $('glob-mode-banner-tag').textContent = 'RECOVERY';
    } else {
      banner.className = 'mode-banner';
    }

    // Active feel dropdown
    const feelSel = $('select-active-feel');
    const feels = snap.drillsHub?.feels || [];
    const sig = feels.map((f) => `${f.id}:${f.name || f.label || ''}`).join('|');
    if (feelSel.dataset.sig !== sig) {
      feelSel.dataset.sig = sig;
      feelSel.innerHTML = '<option value="">No Feel Tagged</option>' + feels.map((f) => `<option value="${esc(f.id)}">${esc(f.name || f.label || f.id)}</option>`).join('');
    }
    feelSel.value = settings.activeFeelId || '';

    const btnVoice = $('btn-audio-caddie');
    const voiceOn = Boolean(settings.audioCaddie);
    btnVoice.classList.toggle('btn-voice-on', voiceOn);
    btnVoice.textContent = voiceOn ? '🔊 Voice ON' : '🔇 Voice';

    const db = snap.dbSummary;
    $('pill-db').textContent = db ? `DB: ${db.totalShots} swings` : 'DB: Sync';

    const csvInd = $('csv-watch-indicator');
    if (snap.watchedCsvPath) {
      csvInd.classList.remove('hidden');
      csvInd.textContent = `Watching: ${snap.watchedCsvPath.split(/[/\\]/).pop()}`;
      $('btn-csv-stop').classList.remove('hidden');
    } else {
      csvInd.classList.add('hidden');
      $('btn-csv-stop').classList.add('hidden');
    }
  }

  function matchDrillForFault(drill, faultKey) {
    if (!faultKey || faultKey === 'all') return true;
    const fMap = state?.drillsHub?.faultToDrillIds || {};
    const mappedIds = Array.isArray(fMap[faultKey]) ? fMap[faultKey] : [];
    return (
      mappedIds.includes(drill.id) ||
      (Array.isArray(drill.shotlabFaultIds) && drill.shotlabFaultIds.includes(faultKey)) ||
      (Array.isArray(drill.faultTags) && drill.faultTags.includes(faultKey))
    );
  }

  function findDrillsForFault(faultKey, limit = 3) {
    const all = state?.drillsHub?.drills || [];
    const byId = new Map(all.map((d) => [d.id, d]));
    const fMap = state?.drillsHub?.faultToDrillIds || {};
    const curatedIds = Array.isArray(fMap[faultKey]) ? fMap[faultKey] : [];
    const out = [];
    const seen = new Set();
    for (const id of curatedIds) {
      const hit = byId.get(id);
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
      }
    }
    for (const d of all) {
      if (!seen.has(d.id) && matchDrillForFault(d, faultKey)) {
        seen.add(d.id);
        out.push(d);
      }
    }
    return (out.length ? out : all).slice(0, limit);
  }

  // ==================== 01 PLAN ====================
  async function loadPlanTab() {
    try {
      const data = await api.getPlanData();
      lastPlanData = data;
      renderPlan(data);
    } catch (err) {
      showToast(`Plan load failed: ${err.message || err}`);
    }
  }

  function renderPlan(data = lastPlanData) {
    const studio = state?.settings?.studio || data?.studio || {};
    const body = studio.bodyCheckin || { hamstrings: 1, ankle: 'ok', energy: 4 };
    $('plan-body-ham').value = String(body.hamstrings ?? 1);
    $('plan-body-ankle').value = body.ankle || 'ok';
    $('plan-body-energy').value = String(body.energy ?? 4);
    const highFatigue = body.hamstrings >= 3 || body.ankle === 'flare' || body.energy <= 2;
    $('plan-body-warn').innerHTML = highFatigue
      ? '<strong style="color:var(--yellow);">Recovery Flag:</strong> High soreness or low energy — recommend switching to <strong>Gym-Sore</strong> or tempo wedge work.'
      : '<strong style="color:var(--green);">Green Light:</strong> Body cleared for full-speed Cruise Gear calibration.';

    const cues = Array.isArray(studio.activeCues) ? studio.activeCues : [];
    $('plan-cues-list').innerHTML = cues.length
      ? cues.map((c, idx) => `<div class="cue-item"><span><strong style="color:var(--cyan);">Cue ${idx + 1}:</strong> ${esc(c.text)}</span><button type="button" class="btn btn-xs" data-del-cue="${esc(c.id)}">✕</button></div>`).join('')
      : '<div class="sub-well muted">No active cues pinned yet (max 2 cues).</div>';
    $('plan-cues-list').querySelectorAll('[data-del-cue]').forEach((b) => {
      b.onclick = async () => {
        const next = cues.filter((c) => c.id !== b.dataset.delCue);
        await api.updateStudioState({ activeCues: next });
        renderPlan();
      };
    });

    const leaks = (data?.topLeaks || []).filter((l) => l && l.isFault !== false);
    const summary = data?.summary || state?.dbSummary;
    const rc = studio.roundCheckin;
    const roundBadge = rc ? ` · Last Round: ${rc.score} (${(rc.struggles || []).join(', ')})` : '';
    $('plan-summary-pill').textContent = summary ? `${summary.totalShots} stored swings` : 'Ready';
    $('plan-focus-summary').innerHTML = leaks.length
      ? `<strong>#1 Stroke Leak (30d):</strong> ${esc(leaks[0].deliveryName)} (${leaks[0].count} shots · Total SG ${leaks[0].totalSg ?? '—'})${esc(roundBadge)}`
      : `Hit or sync sessions to rank your biggest SQLite stroke leaks.${esc(roundBadge)}`;

    document.querySelectorAll('#plan-dur-seg button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.min) === planDurationMin);
    });
    const maxBlocks = planDurationMin <= 15 ? 2 : 3;
    const minsPerBlock = Math.max(4, Math.round(planDurationMin / Math.max(1, Math.min(maxBlocks, leaks.length || 1))));
    const repsPerBlock = Math.max(6, Math.round(minsPerBlock * 1.5));

    const blocks = leaks.slice(0, maxBlocks).map((leak, idx) => {
      const matched = findDrillsForFault(leak.deliveryId, 1)[0];
      const drill = matched || { id: 'gate-towel-lowpoint', title: 'Towel-Behind-Ball Low-Point Gate', keyFeel: 'Brush turf forward of ball' };
      return `
        <div class="rx-block">
          <div class="flex-row" style="justify-content:space-between;">
            <strong>Block ${idx + 1} (${minsPerBlock}m · ${repsPerBlock} balls): Fix ${esc(leak.deliveryName)}</strong>
            <div class="flex-row">
              <span class="badge badge-cyan">${esc(drill.title)}</span>
              <button type="button" class="btn btn-xs btn-cyan" data-launch-title="${esc(drill.title)}" data-launch-drill="${esc(drill.id)}" data-launch-feel="${esc(drill.keyFeel || 'Target corridor')}">Launch →</button>
            </div>
          </div>
          <div class="muted" style="font-size:11px;margin-top:4px;">Target: ${esc(drill.keyFeel || 'Keep inside green target corridor')} (${leak.pct || 0}% of recent misses)</div>
        </div>`;
    });
    $('plan-rx-blocks').innerHTML = blocks.length
      ? blocks.join('')
      : `<div class="rx-block"><div class="flex-row" style="justify-content:space-between;"><strong>Cruise Gear &amp; Start-Line Warmup (${planDurationMin}m)</strong><button type="button" class="btn btn-xs btn-cyan" data-launch-title="Cruise Gear Warmup" data-launch-drill="driver-startline-fairway-challenge" data-launch-feel="Keep inside ±2° HLA start line gate">Launch →</button></div><div class="muted" style="font-size:11px;margin-top:4px;">${Math.round(planDurationMin * 0.75)} calibration swings with 7I &amp; Driver inside ±2° HLA start line gate.</div></div>`;

    $('plan-rx-blocks').querySelectorAll('[data-launch-title]').forEach((b) => {
      b.onclick = () => {
        missionState = { title: b.dataset.launchTitle, drillId: b.dataset.launchDrill, badge: 'COACHED MISSION', target: b.dataset.launchFeel || 'Stay in green corridor' };
        if (api.setPracticeContext && b.dataset.launchDrill) api.setPracticeContext({ activeDrillId: b.dataset.launchDrill });
        switchMode('practice');
        renderPractice(state);
        showToast(`Launched session: ${missionState.title}`);
      };
    });

    const hm = data?.heatmap || [];
    const activeDays = hm.filter((d) => d.count > 0).length;
    $('plan-heatmap-badge').textContent = `${activeDays} active days / 91d`;
    $('plan-heatmap-91').innerHTML = window.ShotLabCharts ? window.ShotLabCharts.renderHeatmap91(hm) : '';

    const parked = studio.parkedIdeas || [];
    $('plan-parking-list').innerHTML = parked.length
      ? parked.slice(0, 6).map((p) => `<div class="cue-item"><span>${esc(p.text)} <span class="dim mono">(${esc(p.ts || '')})</span></span><button type="button" class="btn btn-xs" data-del-park="${esc(p.id)}">✕</button></div>`).join('')
      : '<div class="sub-well muted">No parked ideas yet. Capture off-plan swing thoughts with [P] without breaking your current block!</div>';
    $('plan-parking-list').querySelectorAll('[data-del-park]').forEach((b) => {
      b.onclick = async () => {
        await api.updateStudioState({ parkedIdeas: parked.filter((x) => x.id !== b.dataset.delPark) });
        renderPlan();
      };
    });
  }

  // ==================== 02 PRACTICE ====================
  function renderFaultBanner(snap) {
    const banner = $('fault-streak-banner');
    const alert = snap.faultAlert;
    const latestId = snap.shots?.[0]?.id || snap.currentShot?.id || '';
    if (!alert || !alert.faultId || dismissedFaultKey === `${alert.faultId}:${latestId}`) {
      banner.classList.add('hidden');
      return;
    }
    const count = alert.count ?? alert.streak ?? 2;
    const topDrill = (alert.drills || alert.recommendedDrills || [])[0] || null;
    banner.classList.remove('hidden');
    banner.classList.toggle('urgent', count >= 3 || Boolean(alert.urgent));
    banner.innerHTML = `
      <div>
        <div><span class="streak-pill">${esc(count)}× STREAK</span><strong>${esc(alert.faultName || alert.faultId)}</strong> detected</div>
        <div class="muted" style="font-size:11px;">${topDrill ? `Recommended Drill: <strong>${esc(topDrill.title)}</strong> — ${esc(topDrill.keyFeel || '')}` : 'Check Fault Coach cues below.'}</div>
      </div>
      <div class="flex-row">
        ${topDrill ? `<button type="button" class="btn btn-xs btn-cyan" id="btn-tag-fault-drill">Open Drill</button>` : ''}
        <button type="button" class="btn btn-xs" id="btn-dismiss-fault">✕</button>
      </div>`;
    if ($('btn-tag-fault-drill') && topDrill) {
      $('btn-tag-fault-drill').onclick = () => openDrawerWithDrill(topDrill.id, alert.faultId);
    }
    if ($('btn-dismiss-fault')) {
      $('btn-dismiss-fault').onclick = () => { dismissedFaultKey = `${alert.faultId}:${latestId}`; banner.classList.add('hidden'); };
    }
  }

  function computeGoalFlightPoints(shot, intentShape) {
    const refs = Array.isArray(shot.references) ? shot.references : [];
    const tier = state?.settings?.tierId || 'low_hcp';
    const refId = tier === 'tour_pro' ? 'tour' : tier === 'personal' ? 'low_hcp' : tier;
    const refMatch = refs.find((r) => r.id === refId) || refs.find((r) => r.id === 'low_hcp') || refs[0];
    const carry = refMatch ? refMatch.carryYds : (shot.potential?.maxCarryAtSpeedYds || shot.metrics?.effectiveCarry || 165);
    const baseApex = refMatch ? refMatch.apexFt : (shot.flight?.apexFt || 88);
    const apexMult = intentShape === 'stinger' ? 0.65 : intentShape === 'high' ? 1.18 : 1.0;
    const apex = Math.max(24, Math.round(baseApex * apexMult));
    const pts = (refMatch && Array.isArray(refMatch.points) && refMatch.points.length >= 2)
      ? refMatch.points.map((pt) => ({ x: pt.x, y: Math.round(pt.y * apexMult * 10) / 10 }))
      : Array.from({ length: 17 }, (_, i) => {
          const t = i / 16;
          return { x: Math.round(carry * t * 10) / 10, y: Math.round(4 * apex * t * (1 - t) * 10) / 10 };
        });
    return { carryYds: carry, apexFt: apex, points: pts };
  }

  function renderTrajectoryWithRefs() {
    const shot = lastTrajShot;
    const wrap = $('side-traj-wrap');
    if (!wrap) return;
    if (!shot || !shot.flight) {
      wrap.innerHTML = window.ShotLabSVG.renderSideTrajectory(null, null);
      return;
    }
    const studio = state?.settings?.studio || {};
    const showGoal = studio.showGoalLine !== false;
    const isAlmost = (shot.practiceMode || state?.settings?.practiceMode) === 'almost';
    const goalFlight = (showGoal && !isAlmost) ? computeGoalFlightPoints(shot, studio.intendedShape || 'stock') : null;
    const refs = Array.isArray(shot.references) ? shot.references : [];
    const shown = Array.isArray(state?.settings?.refLines) ? state.settings.refLines : ['tour'];
    const svg = window.ShotLabSVG.renderSideTrajectory(
      shot.flight, shot.potential, shot.shotShape?.severity, refs, shown, { goalFlight }
    );
    const chips = refs.map((r) => {
      const on = shown.includes(r.id);
      return `<button type="button" class="ref-chip${on ? ' on' : ''}" data-ref="${esc(r.id)}" style="--ref:${esc(r.color)}"><span class="ref-swatch"></span>${esc(r.label)}${on ? ` <span class="ref-num">${r.carryYds}y</span>` : ''}</button>`;
    }).join('');
    wrap.innerHTML = svg + (chips ? `<div class="ref-chips">${chips}</div>` : '');
    wrap.querySelectorAll('.ref-chip').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.ref;
        const cur = new Set(Array.isArray(state?.settings?.refLines) ? state.settings.refLines : ['tour']);
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        const next = [...cur];
        if (state?.settings) state.settings.refLines = next;
        api.updateSettings({ refLines: next });
        renderTrajectoryWithRefs();
      };
    });
  }

  function renderPracticeKpis(shot) {
    const el = $('prac-kpi-strip');
    if (!el) return;
    const cards = shot?.scorecard?.cards || [];
    const find = (k) => cards.find((c) => c.key === k) || { label: k, value: '—', unit: '', grade: 'neutral', target: '—', goalDelta: '—' };
    const sg = shot?.strokesGained?.sg;
    const kpis = [
      { key: 'carry', ...find('carry') },
      { key: 'offline', ...find('offline') },
      { key: 'smash', ...find('smash') },
      { key: 'ballSpeed', ...find('ballSpeed') },
      {
        key: 'sg',
        label: 'Strokes Gained',
        value: typeof sg === 'number' ? fmtSg(sg, { prefix: '' }) : '—',
        unit: 'SG',
        grade: typeof sg === 'number' ? (sg >= 0.04 ? 'green' : sg > -0.15 ? 'yellow' : 'red') : 'neutral',
        target: shot?.strokesGained?.resultLie || 'Broadie',
        goalDelta: typeof sg === 'number' ? (sg >= 0 ? 'Gain vs Tier' : 'Cost vs Tier') : 'Paused',
      },
    ];
    el.innerHTML = kpis.map((k) => `
      <div class="kpi-card grade-${esc(k.grade)}">
        <div class="flex-row" style="justify-content:space-between;gap:4px;flex-wrap:nowrap;">
          <div class="flex-row" style="gap:4px;min-width:0;flex-wrap:nowrap;">
            <span class="kicker" style="margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(k.label)}</span>
            <button type="button" class="q-btn" data-metric-help="${esc(k.key)}" aria-label="Explain ${esc(k.label)}">?</button>
          </div>
          ${(k.goalDelta || k.target) ? `<span class="goal-delta sev-pill-${esc(k.grade)}">${esc(k.goalDelta || k.target)}</span>` : ''}
        </div>
        <div class="kpi-val">${esc(k.value)} <span class="muted" style="font-size:12px;">${esc(k.unit || '')}</span></div>
        <div class="kpi-sub">Goal: ${esc(k.target)}</div>
      </div>
    `).join('');
  }

  function renderChallengePanel(snap) {
    const panel = $('prac-challenge-panel');
    if (!panel || !challengeStore) return;
    panel.style.display = activePracticeSub === 'challenge' ? 'block' : 'none';
    if (activePracticeSub !== 'challenge') {
      $('tension-vignette')?.classList.remove('active');
      return;
    }

    const st = challengeStore.state;
    const isTension = activeMode === 'practice' && activePracticeSub === 'challenge' && st.activeId === 'pressure5' && st.pressure.streak === 4 && !st.pressure.mutedVignette;
    $('tension-vignette')?.classList.toggle('active', isTension);

    const pills = window.ShotLabChallenges.CHALLENGE_DEFS.map((d) => `
      <button type="button" class="${d.id === st.activeId ? 'active' : ''}" data-chal-id="${esc(d.id)}">${esc(d.short)}</button>
    `).join('');

    let detail = '';
    if (st.activeId === 'pressure5') {
      const lights = [0, 1, 2, 3, 4].map((i) => `<span class="badge ${i < st.pressure.streak ? 'badge-green' : ''}">Ball ${i + 1}</span>`).join('');
      detail = `
        <div class="flex-row mt-8" style="justify-content:space-between;">
          <div class="flex-row">
            <select id="chal-gate-sel" aria-label="Pressure gate criterion">
              <option value="hla" ${st.pressure.gate === 'hla' ? 'selected' : ''}>Start Line Gate (±1.5° HLA)</option>
              <option value="path" ${st.pressure.gate === 'path' ? 'selected' : ''}>Path Corridor (±2.5°)</option>
              <option value="smash" ${st.pressure.gate === 'smash' ? 'selected' : ''}>Smash Threshold (≥1.34)</option>
            </select>
            ${lights}
          </div>
          <span class="badge badge-cyan">Clears: ${st.pressure.clears}</span>
        </div>`;
    } else if (st.activeId === 'course3') {
      detail = `<div class="grid-3 mt-8">${st.course.holes.map((h, i) => `
        <div class="sub-well" style="${i === st.course.holeIdx ? 'border-color:var(--cyan);' : ''}">
          <div class="flex-row" style="justify-content:space-between;"><strong>Hole ${h.num} · Par ${h.par}</strong><span class="mono muted">${esc(h.wind)}</span></div>
          <div class="mono" style="margin-top:4px;">${h.appYds ? `${h.appYds}y left` : `${h.yds}y`}${h.score !== null ? ` → Final ${h.score}` : ''}</div>
        </div>`).join('')}</div>`;
    } else {
      const obs = challengeStore.getObsPayload();
      detail = `<div class="sub-well mt-8 flex-row" style="justify-content:space-between;"><strong>${esc(challengeStore.getCurrentTargetText())}</strong><span class="badge badge-green">Score: ${esc(obs.score)}</span></div>`;
    }

    panel.innerHTML = `
      <div class="head-row">
        <div>
          <span class="kicker">AUTO-SCORED BY LIVE LAUNCH MONITOR &amp; DEMO SHOTS · BROADCASTS TO OBS ?widget=challenge</span>
          <h3>Challenge Arena</h3>
        </div>
        <div class="flex-row">
          <button type="button" class="btn btn-xs btn-primary" id="chal-test-cur">Score Current Shot</button>
          <button type="button" class="btn btn-xs" id="chal-reset-btn">Reset Challenge</button>
        </div>
      </div>
      <div class="seg">${pills}</div>
      ${detail}
    `;

    panel.querySelectorAll('[data-chal-id]').forEach((b) => {
      b.onclick = () => {
        challengeStore.setActive(b.dataset.chalId);
        api.setChallengeState(challengeStore.getObsPayload());
        renderChallengePanel(snap);
      };
    });
    if ($('chal-gate-sel')) {
      $('chal-gate-sel').onchange = (e) => {
        challengeStore.setPressureGate(e.target.value);
        api.setChallengeState(challengeStore.getObsPayload());
        renderChallengePanel(snap);
      };
    }
    if ($('chal-test-cur')) {
      $('chal-test-cur').onclick = () => {
        if (snap.currentShot) {
          const r = challengeStore.recordShot(snap.currentShot);
          api.setChallengeState(challengeStore.getObsPayload());
          if (r?.bestsChanged) api.updateStudioState({ challengeBests: r.bests });
          renderChallengePanel(snap);
          showToast(r.message || 'Shot scored');
        }
      };
    }
    if ($('chal-reset-btn')) {
      $('chal-reset-btn').onclick = () => {
        challengeStore.resetActive();
        api.setChallengeState(challengeStore.getObsPayload());
        renderChallengePanel(snap);
      };
    }
  }

  function renderPractice(snap = state) {
    if (!snap) return;
    const shot = snap.currentShot;
    const studio = snap.settings?.studio || {};
    const handedness = snap.settings?.handedness || 'RH';

    const strip = $('prac-mission-strip');
    if (strip) {
      strip.classList.toggle('show', Boolean(missionState));
      if (missionState) {
        $('prac-mission-badge').textContent = missionState.badge || 'ACTIVE BLOCK';
        $('prac-mission-title').textContent = missionState.title;
        $('prac-mission-target').textContent = (activePracticeSub === 'challenge' && challengeStore)
          ? challengeStore.getCurrentTargetText()
          : (missionState.target || 'Stay in green target corridor');
      }
    }

    $('prac-intent-shape').value = studio.intendedShape || 'stock';
    const goalOn = studio.showGoalLine !== false;
    $('prac-goal-toggle').textContent = goalOn ? '◉ Dotted Goal: ON' : '○ Dotted Goal: OFF';
    $('prac-goal-toggle').classList.toggle('btn-emerald', goalOn);

    const matNames = { fiberbuilt: 'Fiberbuilt Strip', divot: 'Divot Action', firm: 'Firm Turf' };
    $('prac-mat-badge').textContent = `Mat: ${matNames[studio.matType || 'fiberbuilt'] || 'Fiberbuilt'}`;

    renderFaultBanner(snap);
    renderPracticeKpis(shot);
    renderChallengePanel(snap);

    if (!shot) {
      lastTrajShot = null;
      hideHoverPopover();
      ['shape-why-trigger', 'club-why-trigger', 'delivery-why-trigger', 'strike-why-trigger'].forEach((tid) => {
        const trigger = $(tid);
        if (trigger) {
          trigger.onmouseenter = null;
          trigger.onmousemove = null;
          trigger.onmouseleave = null;
          trigger.onclick = null;
        }
      });
      $('box-shape').className = 'card';
      $('shape-name').textContent = 'Waiting for Shot';
      $('shape-height-tag').textContent = '—';
      $('shape-sg-pill').classList.add('hidden');
      $('shape-quiet-badge').classList.add('hidden');
      $('shape-icon-wrap').innerHTML = '';
      renderTrajectoryWithRefs();
      $('stat-carry').textContent = '—';
      $('stat-total').textContent = 'Total — yds';
      $('stat-curve').textContent = '—';
      $('stat-offline').textContent = '—';
      $('stat-apex').textContent = '—';
      $('shape-desc').textContent = 'Hit a ball or press Test Shot.';
      $('box-club').className = 'card';
      $('club-pred-name').textContent = '—';
      $('club-conf-badge').textContent = '—%';
      $('club-source-tag').textContent = 'AUTO';
      $('club-top3').innerHTML = '';
      $('club-picker-grid').innerHTML = '';
      $('btn-confirm-pred').disabled = true;
      $('btn-confirm-pred').onclick = null;
      $('btn-sync-gspro').disabled = true;
      $('btn-sync-gspro').onclick = null;
      $('box-delivery').className = 'card';
      $('delivery-name').textContent = '—';
      $('delivery-conf').textContent = '—';
      $('delivery-conf').className = 'tag';
      $('dplane-wrap').innerHTML = '';
      $('delivery-tagline').textContent = '—';
      $('val-dynloft').textContent = '—';
      $('val-shaftlean').textContent = '—';
      $('val-spinloft').textContent = '—';
      $('delivery-cues').innerHTML = '';
      $('box-strike').className = 'card';
      $('strike-label').textContent = '—';
      $('strike-conf').textContent = '—';
      $('strike-conf').className = 'tag';
      $('clubface-wrap').innerHTML = '';
      $('pot-actual').textContent = '—';
      $('pot-center').textContent = '—';
      $('pot-max').textContent = '—';
      $('pot-speed').textContent = '—';
      $('pot-reasons').innerHTML = '';
      $('scorecard-tier-label').textContent = '—';
      $('sum-green').textContent = '0 Green';
      $('sum-yellow').textContent = '0 Yellow';
      $('sum-red').textContent = '0 Red';
      $('overall-score-num').textContent = '—';
      $('data-quality-note').classList.add('hidden');
      $('metrics-grid').innerHTML = '';
      $('prac-coupled-wrap').innerHTML = '';
      $('prac-fault-coach').innerHTML = '';
      renderHistory(snap);
      return;
    }

    // Box 1: Shot Shape & Trajectory
    const sh = shot.shotShape;
    const fl = shot.flight;
    $('box-shape').className = `card sev-${sh.severity}`;
    $('shape-name').textContent = sh.name;
    $('shape-height-tag').textContent = sh.heightTag;
    const sg = shot.strokesGained;
    const sgPill = $('shape-sg-pill');
    if (sg && typeof sg.sg === 'number') {
      sgPill.classList.remove('hidden');
      sgPill.className = `tag tag-${sg.sg >= 0.04 ? 'green' : sg.sg <= -0.1 ? 'red' : 'yellow'}`;
      sgPill.textContent = fmtSg(sg.sg);
    } else {
      sgPill.classList.add('hidden');
    }
    $('shape-quiet-badge').classList.toggle('hidden', (shot.practiceMode || snap.settings?.practiceMode) !== 'almost');
    $('shape-icon-wrap').innerHTML = window.ShotLabSVG.renderShotShapeIcon(sh.svgParams, {
      width: 108,
      height: 108,
      intendedShape: studio.showGoalLine !== false ? (studio.intendedShape || 'stock') : null,
      handedness,
    });
    lastTrajShot = shot;
    renderTrajectoryWithRefs();
    $('stat-carry').textContent = `${Math.round(shot.metrics.effectiveCarry)} yds`;
    $('stat-total').textContent = `Total ${Math.round(shot.metrics.totalYds)} yds (+${Math.round(fl.rollYds)} roll)`;
    $('stat-curve').textContent = `${Math.abs(fl.curveYds).toFixed(0)}y ${fl.curveYds < -0.5 ? 'L' : fl.curveYds > 0.5 ? 'R' : ''}`;
    $('stat-offline').textContent = `${Math.abs(fl.offlineYds).toFixed(0)}y ${fl.offlineYds < -0.5 ? 'L' : fl.offlineYds > 0.5 ? 'R' : ''}`;
    $('stat-apex').textContent = `${Math.round(fl.apexFt)} ft`;
    $('shape-desc').textContent = sh.description;
    bindHover($('shape-why-trigger'), () => `<strong>${esc(sh.name)}</strong><ul style="margin:6px 0 0 14px;padding:0;">${(sh.rationale || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);

    // Box 2: Club Auto-Detector
    const det = shot.clubDetection;
    const calSt = snap.calibrationStats || {};
    const confPct = det.confidencePct || 0;
    $('box-club').className = `card sev-${shot.confirmedClub ? 'green' : confPct >= 85 ? 'green' : confPct >= 60 ? 'yellow' : 'red'}`;
    $('club-pred-name').textContent = shot.activeClubLabel;
    $('club-conf-badge').textContent = shot.confirmedClub ? 'CONFIRMED' : `${Math.round(confPct)}%`;
    $('club-source-tag').textContent = shot.confirmedClub ? 'VERIFIED' : (det.calibrated ? 'CALIBRATED' : 'PRIOR');
    $('club-top3').innerHTML = (det.top3 || []).map((t, i) => `
      <div class="top3-row ${i === 0 ? 'first' : ''}">
        <strong class="mono">${esc(t.club)}</strong>
        <div class="top3-bar"><div class="top3-fill" style="width:${Math.min(100, Number(t.confidencePct) || 0)}%"></div></div>
        <span class="mono muted" style="text-align:right;">${Math.round(Number(t.confidencePct) || 0)}%</span>
      </div>`).join('');
    const btnConfirm = $('btn-confirm-pred');
    const guess = det.predictedClub || shot.activeClub;
    btnConfirm.textContent = shot.confirmedClub ? `✓ Confirmed ${shot.confirmedClub}` : `✓ Confirm ${guess}`;
    btnConfirm.disabled = Boolean(shot.confirmedClub);
    btnConfirm.onclick = () => confirmClub(shot.id, guess);
    $('btn-sync-gspro').disabled = false;
    $('btn-sync-gspro').onclick = () => syncGsproClub(shot.confirmedClub || guess);
    const chkAuto = $('chk-autoswitch');
    chkAuto.checked = Boolean(snap.calibration?.autoSwitch?.enabled);
    chkAuto.onchange = () => api.updateSettings({ autoSwitch: { enabled: chkAuto.checked } });
    const calClubs = new Set(calSt.calibratedClubs || []);
    $('club-picker-grid').innerHTML = CLUB_ORDER.map((c) => `<button type="button" class="club-chip ${shot.activeClub === c ? 'active' : ''} ${calClubs.has(c) ? 'calibrated' : ''}" data-pick-club="${esc(c)}">${esc(c)}</button>`).join('');
    $('club-picker-grid').querySelectorAll('[data-pick-club]').forEach((b) => { b.onclick = () => confirmClub(shot.id, b.dataset.pickClub); });
    $('cal-exact').textContent = calSt.recentExactPct !== null && calSt.recentExactPct !== undefined ? `${calSt.recentExactPct}%` : '—';
    $('cal-within1').textContent = calSt.recentWithinOnePct !== null && calSt.recentWithinOnePct !== undefined ? `${calSt.recentWithinOnePct}%` : '—';
    $('cal-highconf').textContent = calSt.highConfExactPct !== null && calSt.highConfExactPct !== undefined ? `${calSt.highConfExactPct}%` : '—';
    $('cal-count').textContent = String(calSt.totalConfirmed || 0);
    $('cal-progress-fill').style.width = `${Math.min(100, calSt.recentExactPct || 0)}%`;
    bindHover($('club-why-trigger'), () => `<strong>${esc(det.predictedLabel)}</strong><p style="margin:4px 0 0;">${esc(det.summary || '')}</p>`);

    // Box 3: Delivery & Release
    const del = shot.delivery;
    const delConf = del.confidence;
    $('box-delivery').className = `card sev-${del.severity}`;
    $('delivery-name').textContent = del.name;
    $('delivery-conf').textContent = (typeof delConf === 'number' && Number.isFinite(delConf) && delConf > 0) ? `${Math.round(delConf * 100)}%` : '—';
    $('delivery-conf').className = `tag tag-${del.severity}`;
    $('dplane-wrap').innerHTML = window.ShotLabSVG.renderDPlaneDiagram(shot.metrics, shot.dplane);
    $('delivery-tagline').textContent = del.tagline;
    $('val-dynloft').textContent = del.estDynamicLoft !== null && del.estDynamicLoft !== undefined ? `${del.estDynamicLoft.toFixed(1)}°` : '—';
    $('val-shaftlean').textContent = del.estShaftLean !== null && del.estShaftLean !== undefined ? `${del.estShaftLean >= 0 ? '+' : ''}${del.estShaftLean.toFixed(1)}°` : '—';
    $('val-spinloft').textContent = del.spinLoft !== null && del.spinLoft !== undefined ? `${del.spinLoft.toFixed(1)}°` : '—';
    $('delivery-cues').innerHTML = `<strong>Focus Cues:</strong> ${(del.cues || []).map((c) => esc(c)).join(' · ')}`;
    bindHover($('delivery-why-trigger'), () => `<strong>${esc(del.name)}</strong><ul style="margin:6px 0 0 14px;padding:0;">${(del.evidence || []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);

    // Box 4: Photorealistic Clubface Strike
    const st = shot.strike;
    const stConf = st.confidence;
    const pot = shot.potential;
    $('box-strike').className = `card sev-${st.severity}`;
    $('strike-label').textContent = st.label;
    $('strike-conf').textContent = (typeof stConf === 'number' && Number.isFinite(stConf) && stConf > 0) ? `${Math.round(stConf * 100)}%` : '—';
    $('strike-conf').className = `tag tag-${st.severity}`;
    $('clubface-wrap').innerHTML = window.ShotLabSVG.renderClubfaceMap(st, shot.clubSpec, handedness);
    $('pot-actual').textContent = `${Math.round(pot.actualCarryYds)} yds`;
    $('pot-center').textContent = pot.centerStrikeCarryYds ? `${Math.round(pot.centerStrikeCarryYds)} yds` : 'Need Club Speed';
    $('pot-max').textContent = `${Math.round(pot.maxCarryAtSpeedYds)} yds`;
    $('pot-speed').textContent = pot.speedUpsideCarryYds ? `${Math.round(pot.speedUpsideCarryYds)} yds (@${pot.speedUpsideMph})` : '—';
    $('pot-reasons').innerHTML = (pot.reasons || []).map((r) => esc(r)).join(' · ');
    bindHover($('strike-why-trigger'), () => `<strong>${esc(st.label)}</strong><ul style="margin:6px 0 0 14px;padding:0;">${(st.rationale || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);

    // Coupled Lab Matrix
    $('prac-coupled-rail').style.display = activeLabMode === 'coupled' ? 'block' : 'none';
    if (activeLabMode === 'coupled' && window.ShotLabCharts) {
      $('prac-coupled-wrap').innerHTML = window.ShotLabCharts.renderCoupledSignalsGrid(shot.coupledSignals);
    }

    // 15-Metric R/Y/G Scorecard with upper-right +/- Goal deltas & ? buttons
    const sc = shot.scorecard;
    $('scorecard-tier-label').textContent = `${sc.tierLabel} · ${shot.activeClubLabel}`;
    $('sum-green').textContent = `${sc.counts.green} Green`;
    $('sum-yellow').textContent = `${sc.counts.yellow} Yellow`;
    $('sum-red').textContent = `${sc.counts.red} Red`;
    $('overall-score-num').textContent = sc.score != null ? String(sc.score) : '—';
    $('overall-score-num').style.color = window.ShotLabSVG.gradeColor(sc.overallGrade);

    const dq = shot.dataQuality;
    const dqEl = $('data-quality-note');
    if (dq && !dq.clubRead) {
      const dqClean = String(dq.note || '').replace(/^No club read\s*(?:\([^)]*\))?:\s*/i, '');
      dqEl.classList.remove('hidden');
      dqEl.innerHTML = `<strong>No club read (sticker missed):</strong> ${esc(dqClean)}`;
    } else {
      dqEl.classList.add('hidden');
    }

    $('metrics-grid').innerHTML = sc.cards.map((c) => {
      const gd = c.goalDelta || c.delta || '';
      return `
      <div class="metric-tile grade-${esc(c.grade)}">
        <div class="mt-top">
          <div class="flex-row" style="gap:4px;min-width:0;flex-wrap:nowrap;">
            <span class="mt-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.label)}</span>
            <button type="button" class="q-btn" data-metric-help="${esc(c.helpKey || c.key)}" aria-label="Explain ${esc(c.label)}">?</button>
          </div>
          ${gd ? `<span class="goal-delta sev-pill-${esc(c.grade)}">${esc(gd)}</span>` : ''}
        </div>
        <div class="mt-value">${esc(c.value)}<span class="mt-unit">${esc(c.unit)}</span></div>
        <div class="mt-foot"><span>${esc(c.target)}</span><span>${esc(c.source)}</span></div>
      </div>`;
    }).join('');

    // Fault Coach (Best Guesses -> Feels to Try -> Drills Hub Fixes)
    const fc = shot.faultCoach || {};
    const fcDrills = Array.isArray(fc.recommendedDrills) ? fc.recommendedDrills : [];
    $('prac-fault-coach').innerHTML = `
      <div class="head-row">
        <div>
          <span class="kicker">Root-Cause Fault Coach &middot; Anti-Feel-Cycling Safe</span>
          <h3>Likely Fault Reasons &rarr; Feels to Try &rarr; Drills Hub</h3>
        </div>
        <span class="badge badge-${esc(fc.severity === 'green' ? 'green' : fc.severity === 'red' ? 'red' : 'yellow')}">${esc(fc.headline || 'Diagnostics')}</span>
      </div>
      <div class="grid-3">
        <div class="sub-well">
          <span class="kicker" style="color:var(--red-hi);">1. Best Guesses (Why It Happened)</span>
          ${(fc.likelyCauses || []).map((c) => `<div style="margin-top:6px;font-size:11.5px;">&bull; ${esc(c)}</div>`).join('')}
        </div>
        <div class="sub-well">
          <span class="kicker" style="color:var(--yellow);">2. Feels to Try / Park</span>
          ${(fc.feelsToTry || []).map((f) => `
            <div class="flex-row" style="justify-content:space-between;margin-top:6px;flex-wrap:nowrap;">
              <span style="font-size:11.5px;">&ldquo;${esc(f.cue)}&rdquo;</span>
              <button type="button" class="btn btn-xs btn-amber" data-park-feel="${esc(f.cue)}">🅿 Park</button>
            </div>`).join('')}
        </div>
        <div class="sub-well">
          <span class="kicker" style="color:var(--cyan);">3. Matched Drills Hub Fixes</span>
          ${fcDrills.length ? fcDrills.map((d) => `
            <div class="flex-row" style="justify-content:space-between;margin-top:6px;">
              <div><strong>${esc(d.title)}</strong><div class="dim" style="font-size:10px;">${esc(d.keyFeel || d.focus || '')}</div></div>
              <button type="button" class="btn btn-xs btn-cyan" data-open-drill="${esc(d.id)}">Open →</button>
            </div>`).join('') : '<div class="muted" style="margin-top:6px;font-size:11px;">Keep locking in this tempo — open Drills [D] anytime.</div>'}
        </div>
      </div>`;

    $('prac-fault-coach').querySelectorAll('[data-park-feel]').forEach((b) => {
      b.onclick = async () => {
        const cur = Array.isArray(studio.parkedIdeas) ? studio.parkedIdeas : [];
        await api.updateStudioState({ parkedIdeas: [{ id: `pk_${Date.now()}`, text: b.dataset.parkFeel, ts: new Date().toISOString().slice(0, 10) }, ...cur] });
        showToast('Parked feel into Plan Parking Lot!');
      };
    });
    $('prac-fault-coach').querySelectorAll('[data-open-drill]').forEach((b) => {
      b.onclick = () => openDrawerWithDrill(b.dataset.openDrill, fc.faultKey || 'all');
    });

    renderHistory(snap);
  }

  function renderHistory(snap) {
    const tape = $('history-tape');
    if (!tape) return;
    const shots = snap.shots || [];
    if (!shots.length) {
      tape.innerHTML = '<div class="muted">No shots in tape yet — hit a ball or click ⚡ Test Shot.</div>';
      return;
    }
    const curId = snap.currentShot?.id;
    tape.innerHTML = shots.slice(0, 30).map((s) => `
      <div class="hist-item ${s.id === curId ? 'selected' : ''}" data-shot-id="${esc(s.id)}">
        ${window.ShotLabSVG.renderShotShapeIcon(s.shotShape.svgParams, { width: 38, height: 38, compact: true })}
        <div>
          <div class="hist-top"><span>${esc(s.activeClub)}${s.confirmedClub ? ' ✓' : ''}</span><span class="mono">${Math.round(s.metrics.effectiveCarry)}y</span></div>
          <div class="hist-sub">${esc(s.shotShape.shortTag)} · ${esc(s.scorecard.score)}</div>
        </div>
      </div>`).join('');
    tape.querySelectorAll('[data-shot-id]').forEach((el) => {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      const pick = () => api.selectShot(el.dataset.shotId);
      el.onclick = pick;
      el.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };
    });
  }

  // ==================== 03 REVIEW ====================
  async function loadReviewTab() {
    try {
      const daysVal = Number(reviewFilters.days);
      const data = await api.getReviewData({
        club: reviewFilters.club,
        mode: reviewFilters.mode,
        days: daysVal > 0 ? daysVal : null,
      });
      lastReviewData = data;
      renderReview(data);
    } catch (err) {
      showToast(`Review error: ${err.message || err}`);
    }
  }

  function renderReview(data = lastReviewData) {
    if (!data) return;
    document.querySelectorAll('#rev-days-seg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === Number(reviewFilters.days)));
    document.querySelectorAll('#rev-sub-seg button').forEach((b) => {
      const isActive = b.dataset.sub === activeReviewSub;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    ['dna', 'decade', 'video', 'trends', 'highlights'].forEach((s) => {
      const el = $(`rev-view-${s}`);
      if (el) el.style.display = s === activeReviewSub ? 'block' : 'none';
    });

    const p = data.patterns || {};
    const trends = data.trends || [];
    const spark = (k, col) => window.ShotLabCharts ? window.ShotLabCharts.renderSparklineSvg(trends.map((t) => t[k]), col) : '';

    $('rev-exec-kpis').innerHTML = [
      { k: 'Sample & Avg Score', v: `${p.avgScore ?? '—'}`, d: `${p.n || 0} swings`, s: spark('avgScore', '#10f296') },
      { k: 'Avg SG / Shot', v: fmtSg(p.avgSg, { prefix: '' }), d: 'vs Active Tier', s: spark('avgSg', '#00e5ff') },
      { k: 'Avg Smash / Carry', v: `${p.averages?.smash?.toFixed(2) ?? '—'}`, d: p.meanCarry != null ? `${Math.round(p.meanCarry)}y mean` : '—', s: spark('avgSmash', '#00e5ff') },
      { k: 'Optimal Cruise Speed', v: p.optimalCruiseMph ? `${p.optimalCruiseMph} mph` : 'Need 5+', d: p.twoWayMiss?.label || '', s: '' },
    ].map((c) => `
      <div class="sub-well" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div><span class="kicker">${esc(c.k)}</span><div class="mono" style="font-size:19px;font-weight:900;color:#fff;">${esc(c.v)}</div><div class="muted" style="font-size:10.5px;">${esc(c.d)}</div></div>
        ${c.s}
      </div>`).join('');

    if (activeReviewSub === 'dna') {
      $('rev-cruise-pill').textContent = p.optimalCruiseMph ? `Cruise: ${p.optimalCruiseMph} mph` : 'Need 5+ Swings';
      $('rev-cruise-svg').innerHTML = window.ShotLabCharts ? window.ShotLabCharts.renderCruiseSpeedSvg(p.cruiseSpeedBuckets || [], p.optimalCruiseMph) : '';
      const tMiss = p.twoWayMiss || {};
      $('rev-miss-pill').textContent = tMiss.label || 'Dispersion Cone';
      $('rev-miss-pill').className = `badge ${tMiss.detected ? 'badge-red' : 'badge-green'}`;

      const attrs = p.rootCauseAttribution || [];
      $('rev-attr-bars').innerHTML = attrs.length
        ? attrs.map((a, idx) => `
          <div class="leak-cost-row">
            <div class="leak-cost-top"><strong>${esc(a.label)}</strong><span class="mono" style="color:${idx === 0 ? 'var(--red-hi)' : 'var(--cyan)'};">${a.impactPct}% Variance Share</span></div>
            <div class="leak-cost-track"><div class="leak-cost-fill" style="width:${a.impactPct}%;background:${idx === 0 ? 'var(--red)' : 'var(--cyan)'};"></div></div>
            <div class="muted" style="font-size:10.5px;margin-top:3px;">${esc(a.detail)}</div>
          </div>`).join('')
        : '<div class="sub-well muted">Hit 3+ shots with club data to rank root-cause contributors.</div>';

      // DELIVERY FAULTS BY COST
      document.querySelectorAll('#rev-leaks-filter-seg button').forEach((b) => b.classList.toggle('active', (b.dataset.lf === 'faults') === reviewFilters.faultsOnly));
      $('rev-fault-leaks').innerHTML = window.ShotLabCharts
        ? window.ShotLabCharts.renderDeliveryFaultsByCost(p.faultLeaks || [], { faultsOnly: reviewFilters.faultsOnly })
        : '';
      $('rev-fault-leaks').querySelectorAll('[data-fault-id]').forEach((row) => {
        const open = () => openDrawerWithDrill(null, row.dataset.faultId || 'all');
        row.onclick = open;
        row.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } };
      });

      // A/B Feels Table
      const feels = data.feelComparison || [];
      $('rev-feels-tbody').innerHTML = feels.length
        ? feels.map((f) => `
          <tr>
            <td><strong>${esc(f.feelId ? feelLabelById(f.feelId) : (f.label || 'Baseline'))}</strong></td>
            <td class="num">${esc(f.n)}</td>
            <td class="num">${esc(f.avgScore ?? '—')}</td>
            <td class="num" style="color:${sgCol(f.avgSg)};">${esc(fmtSg(f.avgSg, { prefix: '' }))}</td>
            <td class="num">${f.avgSmash != null ? f.avgSmash.toFixed(2) : '—'}</td>
            <td class="num">${f.avgCarry != null ? `${Math.round(f.avgCarry)}y` : '—'}</td>
            <td class="num">${f.width80Yds != null ? `${Math.round(f.width80Yds)}y` : '—'}</td>
            <td class="num">${f.faultPct != null ? `${f.faultPct}%` : '—'}</td>
          </tr>`).join('')
        : '<tr><td colspan="8" class="muted">Tag shots with an Active Feel in the top bar to compare feels.</td></tr>';
    } else if (activeReviewSub === 'decade') {
      $('pat-disp-title').textContent = `${reviewFilters.club === 'ALL' ? 'All Clubs' : reviewFilters.club} — 80% DECADE Dispersion Cone`;
      $('pat-disp-n').textContent = `${p.n || 0} shots`;
      $('pat-dispersion-svg').innerHTML = window.ShotLabSVG.renderDispersionPlot(p, { width: 460, height: 320 });
      const off = p.meanOffline;
      const cone = p.ellipse80 ? `${Math.round(p.ellipse80.widthYds)}y × ${Math.round(p.ellipse80.depthYds)}y` : '—';
      $('pat-summary-stats').innerHTML = `
        <div class="sub-well"><span class="kicker">Mean Carry</span><strong class="mono" style="font-size:17px;">${p.meanCarry != null ? `${Math.round(p.meanCarry)}y` : '—'}</strong></div>
        <div class="sub-well"><span class="kicker">Mean Offline</span><strong class="mono" style="font-size:17px;">${typeof off === 'number' ? `${Math.abs(off).toFixed(1)}y ${off < 0 ? 'L' : 'R'}` : '—'}</strong></div>
        <div class="sub-well"><span class="kicker">80% Corridor</span><strong class="mono" style="font-size:17px;">${cone}</strong></div>
        <div class="sub-well"><span class="kicker">Avg SG / Score</span><strong class="mono" style="font-size:17px;color:${sgCol(p.avgSg)};">${fmtSg(p.avgSg, { prefix: '' })} / ${p.avgScore ?? '—'}</strong></div>`;
      $('pat-decade-advice').textContent = p.decadeAdvice || 'Record 5+ shots for DECADE aim guidance.';
      const sc = p.strikeCounts || {};
      $('pat-strike-dist').innerHTML = `<span class="kicker">Inferred Face Strike Distribution</span><div class="flex-row mt-8">${Object.entries(sc).map(([k, v]) => `<span class="badge">${esc(k)}: ${v}</span>`).join('') || '<span class="muted">No strikes logged</span>'}</div>`;
    } else if (activeReviewSub === 'video') {
      loadVideoTab();
    } else if (activeReviewSub === 'trends') {
      $('rev-trend-svg').innerHTML = window.ShotLabCharts ? window.ShotLabCharts.renderSmoothSplineSvg(trends, activeTrendMetric, { width: 680, height: 220 }) : '';
      $('rev-sg-cat-svg').innerHTML = window.ShotLabCharts ? window.ShotLabCharts.renderDivergingSgSvg(data.sgByCategory || []) : '';
      const fat = data.fatigue || [];
      const peakBucket = fat.filter((b) => b.n > 0 && b.avgScore != null && b.id !== '71+').sort((a, b) => b.avgScore - a.avgScore)[0];
      const lateBucket = fat.find((b) => (b.id === '71+' || b.id === '46-70') && b.n > 0 && b.avgScore != null);
      const fatBadge = $('rev-fat-badge');
      if (fatBadge) {
        if (peakBucket && lateBucket && peakBucket !== lateBucket) {
          const drop = Math.round(lateBucket.avgScore - peakBucket.avgScore);
          fatBadge.textContent = `${drop >= 0 ? '+' : ''}${drop} pts late`;
          fatBadge.className = `badge ${drop <= -8 ? 'badge-red' : drop < 0 ? 'badge-yellow' : 'badge-green'}`;
        } else {
          fatBadge.textContent = fat.some((b) => b.n > 0) ? 'Tracking Stamina' : 'No Stamina Data';
          fatBadge.className = 'badge';
        }
      }
      $('pat-fatigue-bars').innerHTML = fat.map((b) => `
        <div class="fatigue-row">
          <span class="muted">${esc(b.label)}</span>
          <div class="fatigue-track"><div class="fatigue-fill ${b.n > 0 && b.avgScore != null && b.avgScore < 65 ? 'fat-warn' : ''}" style="width:${b.n > 0 ? Math.min(100, Math.max(8, b.avgScore ?? 50)) : 0}%"></div></div>
          <span class="mono muted">${b.n > 0 ? `Sc ${b.avgScore ?? '—'} (${b.n})` : '0 shots'}</span>
        </div>`).join('');
    } else if (activeReviewSub === 'highlights') {
      const hls = data.highlights || [];
      $('rev-hl-count').textContent = `${hls.length} highlights`;
      $('rev-highlights-grid').innerHTML = hls.length
        ? hls.map((h) => `
          <div class="sub-well">
            <div class="flex-row" style="justify-content:space-between;">
              <strong>${esc(h.club)} · ${h.carryYds != null ? `${Math.round(h.carryYds)}y` : '—'}</strong>
              <span class="badge badge-${h.score >= 85 ? 'green' : 'cyan'}">Sc ${h.score ?? '—'}</span>
            </div>
            <div class="muted" style="font-size:11px;margin-top:4px;">${esc(h.shotShape || '')} · ${esc(h.deliveryName || '')}</div>
            <div class="flex-row mt-8" style="justify-content:space-between;">
              <span class="mono" style="color:${sgCol(h.sgShot)};">${fmtSg(h.sgShot)}</span>
              ${h.isGoTo ? '<span class="badge badge-green">★ My-Go-To</span>' : ''}
            </div>
          </div>`).join('')
        : '<div class="sub-well muted">Record standout shots to populate highlights.</div>';
    }
  }

  // ==================== REAL KINOVEA VIDEO COMPARE ====================
  function buildMediaUrl(row, angle, mediaBaseUrl) {
    if (!row) return null;
    const hasPreResolved = angle === 'dtl'
      ? ('dtlUrl' in row || 'dtl_url' in row)
      : ('foUrl' in row || 'fo_url' in row);
    const direct = angle === 'dtl' ? (row.dtlUrl ?? row.dtl_url) : (row.foUrl ?? row.fo_url);
    if (typeof direct === 'string' && /^http:\/\/127\.0\.0\.1:\d+\//.test(direct)) return direct;
    if (hasPreResolved) return null;
    const clip = angle === 'dtl' ? (row.clipDtl || row.clip_dtl) : (row.clipFo || row.clip_fo);
    if (!clip) return null;
    const base = mediaBaseUrl || `http://127.0.0.1:${state?.obsPort || 8766}/media`;
    const segs = clip.replace(/\\/g, '/').split('/').filter(Boolean);
    const sDate = row.sessionDate || row.session_date || (row.ts ? String(row.ts).slice(0, 10) : null);
    if (sDate && segs[0] !== sDate) segs.unshift(sDate);
    return `${base}/${segs.map(encodeURIComponent).join('/')}`;
  }

  function setVideoSource(vid, missEl, url) {
    if (!vid) return;
    if (url) {
      if (vid.dataset.srcUrl !== url) {
        vid.pause();
        vid.src = url;
        vid.dataset.srcUrl = url;
        vid.load();
      }
      vid.dataset.loaded = '1';
      vid.playbackRate = videoState.playbackRate;
      vid.classList.remove('hidden');
      missEl?.classList.add('hidden');
    } else {
      vid.pause();
      vid.dataset.srcUrl = '';
      vid.dataset.loaded = '0';
      vid.removeAttribute('src');
      vid.classList.add('hidden');
      missEl?.classList.remove('hidden');
    }
  }

  function getActiveVideos() {
    const out = [];
    const dtl = $('vid-player-dtl');
    const fo = $('vid-player-fo');
    const best = $('vid-player-best');
    if (dtl?.dataset.loaded === '1') out.push(dtl);
    if (fo?.dataset.loaded === '1') out.push(fo);
    if ($('chk-sync-best')?.checked && best?.dataset.loaded === '1') out.push(best);
    return out;
  }

  async function loadVideoTab() {
    try {
      const res = await api.getVideoCompare({ shotId: videoState.selectedShotId, club: videoState.club });
      videoState.data = res;
      const clips = res?.recentWithClips || [];
      const cur = res?.current || clips[0] || null;
      const best = res?.best || null;
      const emptyEl = $('vid-empty-state');
      const wsEl = $('vid-workspace');
      const hasAny = clips.length > 0 || (cur && (cur.dtlUrl || cur.foUrl || cur.clipDtl || cur.clipFo));
      emptyEl.classList.toggle('hidden', Boolean(hasAny));
      wsEl.classList.toggle('hidden', !hasAny);
      if (!hasAny) {
        setVideoSource($('vid-player-dtl'), $('vid-dtl-missing'), null);
        setVideoSource($('vid-player-fo'), $('vid-fo-missing'), null);
        setVideoSource($('vid-player-best'), $('vid-best-missing'), null);
        if ($('vid-time-readout')) $('vid-time-readout').textContent = '0.00s';
        if ($('btn-vid-play')) $('btn-vid-play').textContent = '▶ Play Synced';
        $('btn-promote-goto').disabled = true;
        return;
      }
      if (cur) videoState.selectedShotId = cur.id;
      $('vid-list-count').textContent = String(clips.length);
      $('vid-clips-list').innerHTML = clips.map((c) => `
        <button type="button" class="vid-clip-item ${cur && c.id === cur.id ? 'selected' : ''}" data-vc-id="${esc(c.id)}">
          <div class="flex-row" style="justify-content:space-between;"><strong>${esc(c.club)} · ${c.carryYds != null ? `${Math.round(c.carryYds)}y` : '—'}</strong><span class="mono">Sc ${c.score ?? '—'}</span></div>
          <div class="dim mono" style="font-size:10px;">${esc(c.sessionDate || '')} · ${esc(c.deliveryName || '')}</div>
        </button>`).join('');
      $('vid-clips-list').querySelectorAll('[data-vc-id]').forEach((b) => {
        b.onclick = () => { videoState.selectedShotId = b.dataset.vcId; loadVideoTab(); };
      });
      $('vid-dtl-title').textContent = cur ? `${cur.club} · ${Math.round(cur.carryYds || 0)}y · ${cur.deliveryName || ''}` : '—';
      $('vid-fo-title').textContent = $('vid-dtl-title').textContent;
      setVideoSource($('vid-player-dtl'), $('vid-dtl-missing'), buildMediaUrl(cur, 'dtl'));
      setVideoSource($('vid-player-fo'), $('vid-fo-missing'), buildMediaUrl(cur, 'fo'));
      setVideoSource($('vid-player-best'), $('vid-best-missing'), buildMediaUrl(best, 'dtl') || buildMediaUrl(best, 'fo'));
      if ($('vid-time-readout')) $('vid-time-readout').textContent = '0.00s';
      if ($('btn-vid-play')) $('btn-vid-play').textContent = '▶ Play Synced';
      $('vid-best-headline').textContent = best ? `vs Personal Best (${best.sessionDate || ''}${best.isGoTo ? ' ★ Go-To' : ''})` : 'Personal Best Comparison';
      $('vid-best-meta').textContent = best ? `Best: ${Math.round(best.carryYds || 0)}y · Sc ${best.score ?? '—'}` : 'No Personal Best clip linked yet.';
      $('btn-promote-goto').disabled = !cur;

      const fmtDeltaCell = (val, dec, signed) => {
        if (typeof val !== 'number' || !Number.isFinite(val)) return '—';
        return `${signed && val > 0 ? '+' : ''}${val.toFixed(dec)}`;
      };
      const deltaRows = [
        ['Carry', cur?.carryYds, best?.carryYds, 'y', 1, false],
        ['Ball Speed', cur?.ballSpeed, best?.ballSpeed, ' mph', 1, false],
        ['Smash', cur?.smash, best?.smash, '', 2, false],
        ['Path', cur?.path, best?.path, '°', 1, true],
        ['AoA', cur?.aoa, best?.aoa, '°', 1, true],
        ['SG', cur?.sgShot, best?.sgShot, '', 2, true],
      ];
      $('vid-delta-tbody').innerHTML = deltaRows.map(([lbl, cv, bv, u, dec, signed]) => {
        const hasBoth = typeof cv === 'number' && Number.isFinite(cv) && typeof bv === 'number' && Number.isFinite(bv);
        const diff = hasBoth ? (cv - bv).toFixed(dec) : '—';
        const cStr = typeof cv === 'number' && Number.isFinite(cv) ? `${fmtDeltaCell(cv, dec, signed)}${u}` : '—';
        const bStr = typeof bv === 'number' && Number.isFinite(bv) ? `${fmtDeltaCell(bv, dec, signed)}${u}` : '—';
        return `<tr><td><strong>${esc(lbl)}</strong></td><td class="num">${esc(cStr)}</td><td class="num">${esc(bStr)}</td><td class="num">${diff !== '—' ? `${Number(diff) > 0 ? '+' : ''}${diff}${u}` : '—'}</td></tr>`;
      }).join('');
    } catch (err) {
      showToast(`Video error: ${err.message || err}`);
    }
  }

  // ==================== 04 MY BAG (FILTER / SORT / TRIM / DELETE) ====================
  async function loadBagTab() {
    try {
      const daysVal = Number(bagFilters.days);
      const res = await api.getBagGapping({
        mode: bagFilters.mode,
        days: daysVal > 0 ? daysVal : null,
        quality: bagFilters.quality,
        category: bagFilters.category,
        trimOutliers: bagFilters.trimOutliers,
      });
      lastBagClubs = res?.clubs || [];
      lastBagDeletedCount = Number(res?.deletedCount || 0);
      renderBag();
      await loadBagShotsManager();
    } catch (err) {
      showToast(`My Bag error: ${err.message || err}`);
    }
  }

  async function loadBagShotsManager() {
    try {
      const daysVal = Number(bagFilters.days);
      const res = await api.getBagShots({
        club: bagFilters.mgrClub || 'ALL',
        mode: bagFilters.mode,
        days: daysVal > 0 ? daysVal : null,
        quality: bagFilters.quality,
        limit: 150,
      });
      const list = res?.shots || [];
      lastBagDeletedCount = Number(res?.globalDeletedCount ?? lastBagDeletedCount);
      $('bag-del-count').textContent = String(lastBagDeletedCount);
      $('bag-mgr-title').textContent = `${bagFilters.mgrClub === 'ALL' ? 'All Clubs' : bagFilters.mgrClub} Recorded Shots (${list.length} matching)`;
      $('bag-shots-tbody').innerHTML = list.length
        ? list.map((s) => `
          <tr>
            <td class="mono muted">${esc(String(s.ts || '').replace('T', ' ').slice(0, 16))}</td>
            <td><span class="badge badge-cyan">${esc(s.club)}</span></td>
            <td class="num"><strong>${s.carry_yds != null ? `${Math.round(s.carry_yds)}y` : '—'}</strong></td>
            <td class="num">${s.offline_yds != null ? `${Math.abs(s.offline_yds).toFixed(1)}y ${s.offline_yds < 0 ? 'L' : 'R'}` : '—'}</td>
            <td class="num">${s.smash != null ? Number(s.smash).toFixed(2) : '—'}</td>
            <td class="num">${s.back_spin != null ? Math.round(s.back_spin) : '—'}</td>
            <td>${esc(s.shot_shape || '—')} <span class="muted">(${esc(s.delivery_name || '')})</span></td>
            <td class="num" style="color:${sgCol(s.sg_shot)};">${esc(fmtSg(s.sg_shot, { prefix: '' }))}</td>
            <td class="num"><button type="button" class="btn btn-xs btn-danger" data-del-shot="${esc(s.id)}">✕ Delete</button></td>
          </tr>`).join('')
        : '<tr><td colspan="9" class="muted">No shots match current club/day/quality filters.</td></tr>';

      $('bag-shots-tbody').querySelectorAll('[data-del-shot]').forEach((b) => {
        b.onclick = async (ev) => {
          ev.stopPropagation();
          await api.deleteShot(b.dataset.delShot);
          showToast('Deleted shot from SQLite analytics (use Restore Deleted to undo).');
          await loadBagTab();
        };
      });
    } catch (err) {
      showToast(`Shot manager error: ${err.message || err}`);
    }
  }

  function applyWarpCarry(carry) {
    if (typeof carry !== 'number' || !Number.isFinite(carry)) return null;
    const w = bagFilters.warp;
    const windPct = 1 + (w.wind * 0.0085);
    const tempPct = 1 + ((w.temp - 70) * 0.0011);
    const altPct = 1 + (w.alt / 1000) * 0.015;
    const liePct = w.lie === 'rough' ? 0.94 : w.lie === 'flyer' ? 1.06 : 1.0;
    return Math.round(carry * windPct * tempPct * altPct * liePct * 10) / 10;
  }

  function renderBag() {
    document.querySelectorAll('#bag-view-seg button').forEach((b) => b.classList.toggle('active', b.dataset.bview === activeBagView));
    $('bag-warp-view').style.display = activeBagView === 'warp' ? 'block' : 'none';
    $('bag-trim-btn').textContent = `✂ Trim Outliers (±2σ): ${bagFilters.trimOutliers ? 'ON' : 'OFF'}`;
    $('bag-trim-btn').classList.toggle('is-on', bagFilters.trimOutliers);
    $('bag-del-count').textContent = String(lastBagDeletedCount);

    const tracked = lastBagClubs.filter((c) => c.n > 0).length;
    $('bag-summary-pill').textContent = `${tracked} / ${lastBagClubs.length || 14} clubs`;

    const isWarp = activeBagView === 'warp';
    const cols = [
      { key: 'club', label: 'Club', num: false },
      { key: 'n', label: 'N', num: true },
      { key: 'avgCarry', label: isWarp ? 'Warped Carry' : 'Avg Carry', num: true },
      { key: 'ladder', label: 'Carry Ladder', num: false, nosort: true },
      { key: 'gapToNextYds', label: 'Gap Next', num: true },
      { key: 'avgTotal', label: isWarp ? 'Warped Total' : 'Total', num: true },
      { key: 'avgBallSpeed', label: 'Ball Spd', num: true },
      { key: 'avgSmash', label: 'Smash', num: true },
      { key: 'avgSpin', label: 'Spin', num: true },
      { key: 'avgDescent', label: 'Descent', num: true },
      { key: 'stoppingPower', label: 'Stopping', num: false },
      { key: 'width80Yds', label: '80% W', num: true },
      { key: 'avgSg', label: 'Avg SG', num: true },
    ];
    $('bag-thead').innerHTML = `<tr>${cols.map((col) => {
      const isSort = !col.nosort && bagFilters.sortKey === col.key;
      const arrow = isSort ? (bagFilters.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th class="${col.num ? 'num' : ''} ${isSort ? 'sort-active' : ''}" ${col.nosort ? '' : `data-sort="${col.key}" role="button" tabindex="0"`}>${esc(col.label)}${arrow}</th>`;
    }).join('')}</tr>`;
    $('bag-thead').querySelectorAll('[data-sort]').forEach((th) => {
      const doSort = () => {
        const k = th.dataset.sort;
        if (bagFilters.sortKey === k) bagFilters.sortDir = bagFilters.sortDir === 'asc' ? 'desc' : 'asc';
        else { bagFilters.sortKey = k; bagFilters.sortDir = k === 'club' ? 'asc' : 'desc'; }
        renderBag();
      };
      th.onclick = doSort;
      th.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doSort(); } };
    });

    const enriched = lastBagClubs.map((c) => {
      const carryShown = isWarp ? applyWarpCarry(c.avgCarry) : c.avgCarry;
      const totalShown = isWarp
        ? ((typeof c.avgTotal === 'number' && Number.isFinite(c.avgTotal) && typeof c.avgCarry === 'number' && typeof carryShown === 'number')
            ? Math.round((carryShown + (c.avgTotal - c.avgCarry)) * 10) / 10
            : null)
        : c.avgTotal;
      return {
        ...c,
        _carryShown: carryShown,
        _totalShown: totalShown,
        _gapShown: isWarp ? null : c.gapToNextYds,
        _gapAlertShown: isWarp ? null : c.gapAlert,
      };
    });

    if (isWarp) {
      const pop = enriched.filter((c) => c.n >= 2 && typeof c._carryShown === 'number');
      for (let i = 0; i < pop.length - 1; i += 1) {
        const g = Math.round((pop[i]._carryShown - pop[i + 1]._carryShown) * 10) / 10;
        pop[i]._gapShown = g;
        pop[i]._gapAlertShown = g < 7 ? `Overlap (${g}y gap to ${pop[i + 1].club})` : (g > 22 && pop[i].club !== 'DR' ? `Big gap (${g}y to ${pop[i + 1].club})` : null);
      }
    }

    const sortVal = (row, k) => {
      if (k === 'avgCarry') return row._carryShown;
      if (k === 'avgTotal') return row._totalShown;
      if (k === 'gapToNextYds') return row._gapShown;
      if (k === 'stoppingPower') return (!row.stoppingPower || row.stoppingPower === '—') ? null : row.stoppingPower;
      return row[k];
    };
    const sorted = [...enriched].sort((a, b) => {
      if (bagFilters.sortKey === 'club') {
        const diff = CLUB_ORDER.indexOf(a.club) - CLUB_ORDER.indexOf(b.club);
        return bagFilters.sortDir === 'asc' ? diff : -diff;
      }
      const va = sortVal(a, bagFilters.sortKey);
      const vb = sortVal(b, bagFilters.sortKey);
      const aMissing = va === null || va === undefined;
      const bMissing = vb === null || vb === undefined;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (typeof va === 'string') return bagFilters.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return bagFilters.sortDir === 'asc' ? (va - vb) : (vb - va);
    });

    const maxCarry = Math.max(240, ...sorted.map((c) => c._carryShown || 0));
    $('bag-tbody').innerHTML = sorted.map((c) => {
      const carryShown = c._carryShown;
      const totalShown = c._totalShown;
      const barPct = carryShown ? Math.max(4, Math.min(100, Math.round((carryShown / maxCarry) * 100))) : 0;
      const barCat = ['DR', '3W', '5W', '4H'].includes(c.club) ? 'cat-wood' : ['PW', 'GW', 'SW', 'LW'].includes(c.club) ? 'cat-wedge' : '';
      const gapShown = c._gapShown;
      const gapAlert = c._gapAlertShown;
      const gapBadge = gapAlert
        ? `<span class="badge badge-${/overlap/i.test(gapAlert) ? 'red' : 'yellow'}">${esc(gapAlert)}</span>`
        : (gapShown != null ? `<span class="badge badge-green">${gapShown}y</span>` : '—');
      return `
        <tr class="${!c.n ? 'row-empty' : ''} ${c.club === bagFilters.mgrClub ? 'selected-club' : ''}" data-bag-club="${esc(c.club)}" role="button" tabindex="0">
          <td><strong>${esc(c.club)}</strong> <span class="muted">${esc(c.label || '')}</span></td>
          <td class="num">${c.n}${c.outliersTrimmed ? ` <span class="dim">(-${c.outliersTrimmed})</span>` : ''}</td>
          <td class="num"><strong>${carryShown != null ? `${Math.round(carryShown)}y` : '—'}</strong></td>
          <td><div class="gap-bar-wrap"><div class="gap-bar-fill ${barCat}" style="width:${barPct}%"></div></div></td>
          <td class="num">${gapBadge}</td>
          <td class="num">${totalShown != null ? `${Math.round(totalShown)}y` : '—'}</td>
          <td class="num">${c.avgBallSpeed != null ? c.avgBallSpeed.toFixed(1) : '—'}</td>
          <td class="num">${c.avgSmash != null ? c.avgSmash.toFixed(2) : '—'}</td>
          <td class="num">${c.avgSpin != null ? Math.round(c.avgSpin) : '—'}</td>
          <td class="num">${c.avgDescent != null ? `${c.avgDescent.toFixed(1)}°` : '—'}</td>
          <td>${esc(c.stoppingPower || '—')}</td>
          <td class="num">${c.width80Yds != null ? `${Math.round(c.width80Yds)}y` : '—'}</td>
          <td class="num" style="color:${sgCol(c.avgSg)};">${esc(fmtSg(c.avgSg, { prefix: '' }))}</td>
        </tr>`;
    }).join('');
    $('bag-tbody').querySelectorAll('[data-bag-club]').forEach((tr) => {
      const pick = () => {
        bagFilters.mgrClub = tr.dataset.bagClub;
        $('bag-mgr-club').value = bagFilters.mgrClub;
        renderBag();
        loadBagShotsManager();
      };
      tr.onclick = pick;
      tr.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };
    });

    // Wedge Clock Matrix
    const matrix = state?.settings?.studio?.wedgeMatrix || [];
    $('bag-wedge-matrix').innerHTML = matrix.length ? `
      <table class="data-table">
        <thead><tr><th>Wedge</th>${matrix[0].cells.map((c) => `<th class="num">${esc(c.arm)} (${esc(c.pct)})</th>`).join('')}</tr></thead>
        <tbody>${matrix.map((row) => `
          <tr><td><strong>${esc(row.label)}</strong></td>${row.cells.map((c) => `<td class="num"><strong>${c.carry}y</strong> <span class="dim">(${c.roll >= 0 ? '+' : ''}${c.roll}y)</span></td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>` : '';
  }

  // ==================== DRILLS DRAWER, MAT GLANCE & MODALS ====================
  function openDrawerWithDrill(drillId = null, faultTag = null) {
    drawerState.open = true;
    const faultSel = $('drawer-fault-filter');
    const modeSel = $('drawer-mode-filter');
    const validOpts = new Set(Array.from(faultSel?.options || []).map((o) => o.value));
    if (faultTag) {
      const nonFaults = new Set(['pure_compression', 'tour_sweep', 'solid_delivery', 'solid_driver', 'neutral_delivery', 'ball_flight_ok', 'no_data', 'unknown']);
      const normalized = nonFaults.has(faultTag) ? 'all' : faultTag;
      drawerState.fault = validOpts.has(normalized) ? normalized : 'all';
      if (faultSel) faultSel.value = drawerState.fault;
      if (!drillId) drawerState.selectedId = null;
    }
    if (drillId) {
      drawerState.selectedId = drillId;
      const target = (state?.drillsHub?.drills || []).find((d) => d.id === drillId);
      if (target) {
        if (!matchDrillForFault(target, drawerState.fault)) {
          drawerState.fault = 'all';
          if (faultSel) faultSel.value = 'all';
        }
        if (drawerState.mode !== 'all' && !(target.modes || []).includes(drawerState.mode)) {
          drawerState.mode = 'all';
          if (modeSel) modeSel.value = 'all';
        }
      }
    }
    $('drawer-backdrop').classList.add('open');
    $('drawer-drills').classList.add('open');
    renderDrawer();
  }

  function closeDrawer() {
    drawerState.open = false;
    $('drawer-backdrop').classList.remove('open');
    $('drawer-drills').classList.remove('open');
  }

  function renderDrawer() {
    const all = state?.drillsHub?.drills || [];
    const list = all.filter((d) =>
      matchDrillForFault(d, drawerState.fault) &&
      (drawerState.mode === 'all' || (d.modes || []).includes(drawerState.mode))
    );
    const active = list.find((d) => d.id === drawerState.selectedId) || list[0] || all[0];
    drawerState.selectedId = active ? active.id : null;
    $('drawer-list').innerHTML = list.length
      ? list.map((d) => `<button type="button" class="vid-clip-item ${active && d.id === active.id ? 'selected' : ''}" data-did="${esc(d.id)}" style="width:100%;margin-bottom:6px;"><strong style="color:#fff;">${esc(d.title)}</strong><div class="muted" style="font-size:11px;">${esc(d.keyFeel || d.focus || '')}</div></button>`).join('')
      : '<div class="muted">No drills match the selected fault/mode filter.</div>';
    $('drawer-list').querySelectorAll('[data-did]').forEach((b) => {
      b.onclick = () => { drawerState.selectedId = b.dataset.did; renderDrawer(); };
    });
    if (active) {
      $('drawer-detail').innerHTML = `
        <span class="kicker">${esc(active.focus || 'Drill Briefing')}</span>
        <h3 style="margin:2px 0 6px;color:#fff;">${esc(active.title)}</h3>
        <p style="margin:0 0 6px;"><strong>Feel:</strong> ${esc(active.keyFeel || '—')}</p>
        <p class="muted" style="margin:0 0 8px;font-size:11.5px;">${esc(active.why || '')}</p>
        <div class="flex-row" style="justify-content:flex-end;">
          <button type="button" class="btn btn-xs btn-cyan" id="drawer-tag-btn">Tag Active Drill → Practice</button>
        </div>`;
      $('drawer-tag-btn').onclick = async () => {
        missionState = { title: active.title, drillId: active.id, badge: 'DRILL ACTIVE' };
        if (api.setPracticeContext) await api.setPracticeContext({ activeDrillId: active.id });
        closeDrawer();
        switchMode('practice');
        renderPractice(state);
        showToast(`Active drill tagged: ${active.title}`);
      };
    } else {
      $('drawer-detail').innerHTML = '<div class="muted">No Drills Hub entries loaded.</div>';
    }
  }

  function renderMatGlance(snap) {
    if (!matGlanceOpen || !snap) return;
    const shot = snap.currentShot;
    const pm = (shot && shot.practiceMode) || snap.settings?.practiceMode || 'real';
    $('mg-mode').textContent = pm === 'almost' ? 'Kids Asleep' : pm === 'sore' ? 'Gym-Sore' : 'Real Balls';
    const feelEl = $('mg-feel');
    const fid = (shot && shot.feelId) || snap.settings?.activeFeelId;
    feelEl.classList.toggle('hidden', !fid);
    if (fid) feelEl.textContent = `Feel: ${feelLabelById(fid, snap)}`;
    if (!shot) {
      $('mg-club').textContent = '—';
      $('mg-shape-svg').innerHTML = '';
      $('mg-shape-name').textContent = 'Waiting for Shot';
      $('mg-shape-sub').textContent = 'Hit a ball on Launch Pro or click Test Shot';
      $('mg-score-ring').innerHTML = '';
      $('mg-stats-grid').innerHTML = '';
      $('mg-del-name').textContent = '—';
      $('mg-del-cue').textContent = '—';
      return;
    }
    const m = shot.metrics;
    const sc = shot.scorecard;
    const handedness = snap.settings?.handedness || 'RH';
    $('mg-club').textContent = shot.activeClubLabel || shot.activeClub;
    $('mg-shape-svg').innerHTML = window.ShotLabSVG.renderShotShapeIcon(shot.shotShape.svgParams, { width: 136, height: 136, handedness });
    $('mg-shape-name').textContent = shot.shotShape.name;
    $('mg-shape-sub').textContent = `${Math.abs(shot.flight.offlineYds || 0).toFixed(0)}y ${shot.flight.offlineYds < 0 ? 'L' : 'R'} · Apex ${Math.round(shot.flight.apexFt || 0)} ft`;
    $('mg-score-ring').innerHTML = `<div class="mono" style="font-size:48px;font-weight:900;color:${window.ShotLabSVG.gradeColor(sc.overallGrade)};">${sc.score != null ? sc.score : '—'}</div>`;
    const cards = [
      { lbl: 'CARRY', val: `${Math.round(m.effectiveCarry)}y`, sub: `Total ${Math.round(m.totalYds)}y` },
      { lbl: 'SMASH', val: m.smash != null ? m.smash.toFixed(2) : '—', sub: m.clubSpeed != null ? `CS ${m.clubSpeed.toFixed(1)}` : 'Ball-only' },
      { lbl: 'START LINE', val: m.hla != null ? `${m.hla.toFixed(1)}°` : '—', sub: `Path ${m.path != null ? `${m.path.toFixed(1)}°` : '—'}` },
      { lbl: 'STROKES GAINED', val: fmtSg(shot.strokesGained?.sg, { prefix: '' }), sub: shot.delivery?.name || '' },
    ];
    $('mg-stats-grid').innerHTML = cards.map((c) => `<div class="mg-stat-card"><span class="mg-stat-lbl">${esc(c.lbl)}</span><span class="mg-stat-val">${esc(c.val)}</span><span class="mg-stat-sub">${esc(c.sub)}</span></div>`).join('');
    $('mg-del-name').textContent = shot.delivery.name;
    $('mg-del-cue').textContent = shot.delivery.cues?.[0] || shot.delivery.tagline || '';
  }

  function renderObsModal(snap) {
    const warn = $('obs-server-warning');
    if (snap.obsServerError) {
      warn.classList.remove('hidden');
      warn.textContent = snap.obsServerError;
    } else {
      warn.classList.add('hidden');
    }
    const base = `http://127.0.0.1:${snap.obsPort || 8766}/obs/overlay.html`;
    const widgets = ['hud', 'shape', 'metrics', 'diagnosis', 'compact', 'club', 'tracer', 'dispersion', 'ticker', 'challenge', 'verdict'];
    $('obs-url-list').innerHTML = widgets.map((w) => `
      <div class="cue-item">
        <code class="mono" style="font-size:11px;color:var(--cyan);">${esc(`${base}?widget=${w}`)}</code>
        <button type="button" class="btn btn-xs btn-cyan" data-copy-obs="${esc(`${base}?widget=${w}`)}">Copy</button>
      </div>`).join('');
    $('obs-url-list').querySelectorAll('[data-copy-obs]').forEach((b) => {
      b.onclick = () => {
        if (api.copyText) api.copyText(b.dataset.copyObs);
        else if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copyObs).catch(() => {});
        showToast('Copied OBS URL!');
      };
    });
  }

  function renderSettingsModal(snap) {
    $('set-driver-speed').value = snap.calibration?.driverSpeedMph || 98;
    $('set-handedness').value = snap.settings?.handedness || 'RH';
    $('set-altitude').value = snap.settings?.altitudeFt || 0;
    $('set-mat-type').value = snap.settings?.studio?.matType || 'fiberbuilt';
    $('set-autoswitch-conf').value = Math.round(((snap.calibration?.autoSwitch?.minConfidence) || 0.9) * 100);
    $('set-obs-autohide').value = snap.settings?.obsAutoHideSec || 0;
    $('set-audio-chimes').checked = Boolean(snap.settings?.audioChimes);
    $('set-audio-caddie').checked = Boolean(snap.settings?.audioCaddie);
    const customLofts = snap.calibration?.customLofts || {};
    $('custom-lofts-grid').innerHTML = CLUB_ORDER.map((c) => `
      <label class="sub-well" style="padding:5px 7px;font-size:10.5px;">
        <span class="kicker">${esc(c)}</span>
        <input type="number" data-loft-club="${esc(c)}" step="0.5" placeholder="${DEFAULT_LOFTS[c]}" value="${customLofts[c] ?? ''}" style="width:100%;" />
      </label>`).join('');
  }

  function renderCalModal(snap) {
    const clubs = snap.calibration?.clubs || {};
    $('cal-clubs-badges').innerHTML = CLUB_ORDER.map((c) => {
      const n = clubs[c] ? clubs[c].n : 0;
      return `<span class="badge ${n >= 3 ? 'badge-green' : n > 0 ? 'badge-yellow' : ''}">${esc(c)}: ${n}</span>`;
    }).join('');
  }

  function renderWedgePrintModal() {
    const matrix = state?.settings?.studio?.wedgeMatrix || [];
    $('wedge-print-body').innerHTML = matrix.length ? `
      <table class="data-table">
        <thead><tr><th>Wedge</th>${matrix[0].cells.map((c) => `<th class="num">${esc(c.arm)} (${esc(c.pct)})</th>`).join('')}</tr></thead>
        <tbody>${matrix.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td>${r.cells.map((c) => `<td class="num"><strong>${c.carry}y</strong> (${c.roll >= 0 ? '+' : ''}${c.roll}y)</td>`).join('')}</tr>`).join('')}</tbody>
      </table>` : '';
  }

  function renderKeysModal() {
    const baseKeys = [
      ['M', 'Toggle 10-Ft Mat Glance'],
      ['D', 'Toggle Drills Hub Drawer'],
      ['P', 'Capture Thought in Park It Vault'],
      ['1–4', 'Switch Plan / Practice / Review / My Bag'],
      ['Esc', 'Close Popover / Drawer / Mat Glance'],
    ];
    const simRows = lastHotkeys.map((h) => [h.keys, h.label]);
    $('keys-dlg-body').innerHTML = `<table class="data-table"><tbody>${[...baseKeys, ...simRows].map(([k, l]) => `<tr><td><strong class="mono" style="color:var(--cyan);">${esc(k)}</strong></td><td>${esc(l)}</td></tr>`).join('')}</tbody></table>`;
  }

  function syncTempoModal() {
    const settings = state?.settings || {};
    const audio = window.ShotLabAudio;
    const running = Boolean(audio?.isTempoRunning?.());
    $('select-tempo').value = running ? (audio.getTempoPreset?.() || '24/8') : 'off';
    $('select-tempo-sound').value = settings.tempoSound || 'tones';
    $('select-tempo-gap').value = String(settings.tempoGapSec || 0);
    $('tmp-status-txt').textContent = running ? `Running: ${$('select-tempo').value}` : 'Stopped';
  }

  // ==================== ACTIONS ====================
  async function confirmClub(shotId, actualClub) {
    if (!api.confirmClub) {
      showToast(`Confirmed ${actualClub} (demo mode)`);
      return;
    }
    const res = await api.confirmClub(shotId, actualClub);
    if (res?.ok && !res.alreadyConfirmed) {
      showToast(res.isDemoPreview ? `Confirmed demo club → ${actualClub}` : `Calibrated ${actualClub}!`);
    }
  }

  async function syncGsproClub(target) {
    if (!api.switchGsproClub) { showToast(`GSPro Sync skipped (no bridge)`); return; }
    const res = await api.switchGsproClub(target);
    showToast(res?.ok ? `GSPro switched → ${target}` : `GSPro switch: ${res?.reason || 'skipped'}`);
  }

  function maybePlayShotAudio(snap) {
    const newest = snap.shots?.[0] || snap.currentShot;
    const id = newest ? newest.id : null;
    if (!initialLoadComplete) {
      initialLoadComplete = true;
      lastKnownNewestShotId = id;
      return;
    }
    if (!newest || !id || id === lastKnownNewestShotId) return;
    lastKnownNewestShotId = id;
    if (snap.eventType !== 'shot' || newest.isPreviewSeed) return;
    const audio = window.ShotLabAudio;
    if (!audio) return;
    if (snap.settings?.audioChimes && audio.playGradeChime) audio.playGradeChime(newest.scorecard?.overallGrade);
    if (snap.settings?.audioCaddie && audio.speakShot) audio.speakShot(newest, { practiceMode: newest.practiceMode || snap.settings.practiceMode, handedness: snap.settings.handedness });
  }

  function render(snap) {
    if (!snap) return;
    const prevTopId = state?.shots?.[0]?.id || null;
    const nextTopId = snap.shots?.[0]?.id || null;
    if (!state && challengeStore && snap.settings?.studio?.challengeBests) {
      challengeStore.setBests(snap.settings.studio.challengeBests);
    }
    state = snap;

    maybePlayShotAudio(snap);
    renderTopbar(snap);

    // Feed real live/demo shots into Challenge Arena when active
    let pendingBests = null;
    if (snap.eventType === 'shot' && snap.currentShot && snap.currentShot.id !== lastChallengeScoredId && challengeStore) {
      lastChallengeScoredId = snap.currentShot.id;
      if (activePracticeSub === 'challenge') {
        const res = challengeStore.recordShot(snap.currentShot);
        api.setChallengeState(challengeStore.getObsPayload());
        if (res?.bestsChanged && res.bests) pendingBests = res.bests;
      }
    }

    renderPractice(snap);
    if (activeMode === 'plan') renderPlan();
    if (matGlanceOpen) renderMatGlance(snap);
    if (pendingBests) {
      queueMicrotask(() => { api.updateStudioState({ challengeBests: pendingBests }); });
    }

    if (nextTopId && nextTopId !== prevTopId && activeMode !== 'practice') {
      clearTimeout(tabRefreshTimer);
      tabRefreshTimer = setTimeout(() => {
        if (activeMode === 'plan') loadPlanTab();
        else if (activeMode === 'review') loadReviewTab();
        else if (activeMode === 'bag') loadBagTab();
      }, 300);
    }
  }

  // ==================== EVENT WIRING ====================
  populateClubFilterSelect($('rev-club-filter'), true);
  populateClubFilterSelect($('vid-club'), true);
  populateClubFilterSelect($('bag-mgr-club'), true);
  $('bag-mgr-club').value = bagFilters.mgrClub;

  document.querySelectorAll('#lifecycle-nav .mode-btn').forEach((b) => { b.onclick = () => switchMode(b.dataset.mode); });
  document.querySelectorAll('#glob-mode-seg button').forEach((b) => {
    b.onclick = () => {
      const fn = api.setPracticeContext || api.updateSettings;
      fn({ practiceMode: b.dataset.pm });
      showToast(`Mode: ${b.textContent}`);
    };
  });
  document.querySelectorAll('#glob-tier-seg button').forEach((b) => {
    b.onclick = () => api.updateSettings({ tierId: b.dataset.tier });
  });
  $('select-active-feel').onchange = (e) => {
    const fn = api.setPracticeContext || api.updateSettings;
    fn({ activeFeelId: e.target.value || null });
  };
  $('btn-fire-demo').onclick = () => api.fireDemo($('demo-select').value || null);
  $('btn-clear-session').onclick = async () => render(await api.clearSession());
  $('btn-audio-caddie').onclick = () => api.updateSettings({ audioCaddie: !state?.settings?.audioCaddie });
  $('btn-mat-glance').onclick = () => {
    matGlanceOpen = !matGlanceOpen;
    $('mat-glance-overlay').classList.toggle('hidden', !matGlanceOpen);
    if (matGlanceOpen) renderMatGlance(state);
  };
  $('btn-mg-close').onclick = () => { matGlanceOpen = false; $('mat-glance-overlay').classList.add('hidden'); };
  $('pill-db').onclick = async () => {
    await api.syncHistory();
    showToast('Synced SimWatch sessions');
    if (activeMode === 'plan') loadPlanTab();
    else if (activeMode === 'review') loadReviewTab();
    else if (activeMode === 'bag') loadBagTab();
  };

  $('btn-obs').onclick = () => openDialog('dlg-obs');
  $('btn-tempo-dlg').onclick = () => openDialog('dlg-tempo');
  $('bag-cal-btn').onclick = () => openDialog('dlg-cal');
  $('btn-csv').onclick = () => openDialog('dlg-csv');
  $('btn-settings').onclick = () => openDialog('dlg-settings');
  $('plan-btn-checkin').onclick = () => openDialog('dlg-checkin');
  $('glob-park-btn').onclick = () => openDialog('dlg-park');
  $('plan-add-park').onclick = () => openDialog('dlg-park');
  $('bag-open-wedge-print').onclick = () => openDialog('dlg-wedge');
  $('pill-keys').onclick = () => openDialog('dlg-keys');
  $('btn-drills').onclick = () => (drawerState.open ? closeDrawer() : openDrawerWithDrill());
  $('drawer-close').onclick = closeDrawer;
  $('drawer-backdrop').onclick = closeDrawer;
  $('drawer-fault-filter').onchange = (e) => { drawerState.fault = e.target.value; drawerState.selectedId = null; renderDrawer(); };
  $('drawer-mode-filter').onchange = (e) => { drawerState.mode = e.target.value; drawerState.selectedId = null; renderDrawer(); };

  document.querySelectorAll('[data-close-dlg]').forEach((b) => { b.onclick = () => closeDialog(b.dataset.closeDlg); });

  // Practice controls
  document.querySelectorAll('#prac-sub-seg button').forEach((b) => {
    b.onclick = () => {
      activePracticeSub = b.dataset.psub;
      document.querySelectorAll('#prac-sub-seg button').forEach((x) => x.classList.toggle('active', x.dataset.psub === activePracticeSub));
      if (activePracticeSub === 'challenge' && challengeStore) {
        api.setChallengeState(challengeStore.getObsPayload());
      } else {
        api.setChallengeState(null);
      }
      renderChallengePanel(state);
    };
  });
  document.querySelectorAll('#prac-lab-seg button').forEach((b) => {
    b.onclick = () => {
      activeLabMode = b.dataset.lmode;
      document.querySelectorAll('#prac-lab-seg button').forEach((x) => x.classList.toggle('active', x.dataset.lmode === activeLabMode));
      renderPractice(state);
    };
  });
  $('prac-intent-shape').onchange = (e) => api.updateStudioState({ intendedShape: e.target.value });
  $('prac-goal-toggle').onclick = () => api.updateStudioState({ showGoalLine: state?.settings?.studio?.showGoalLine === false });
  $('prac-mission-drill').onclick = () => openDrawerWithDrill(missionState?.drillId || null);
  $('prac-mission-clear').onclick = () => { missionState = null; renderPractice(state); };

  // Plan controls
  ['plan-body-ham', 'plan-body-ankle', 'plan-body-energy'].forEach((id) => {
    $(id).onchange = () => api.updateStudioState({
      bodyCheckin: {
        hamstrings: Number($('plan-body-ham').value),
        ankle: $('plan-body-ankle').value,
        energy: Number($('plan-body-energy').value),
      },
    });
  });
  $('plan-swap-cue').onclick = async () => {
    const pool = [
      { id: 'cue_shaft', text: 'Shaft pointed at left thigh at address (P1)', club: 'All' },
      { id: 'cue_wrist', text: 'Lead wrist flat through P6–P7 impact zone', club: 'Irons' },
      { id: 'cue_cruise', text: '98 mph cruise rhythm (no max-effort Driver)', club: 'DR' },
    ];
    const cur = state?.settings?.studio?.activeCues || [];
    const next = cur[0]?.id === 'cue_cruise' ? pool.slice(0, 2) : [pool[2], pool[1]];
    await api.updateStudioState({ activeCues: next });
    renderPlan();
  };
  $('plan-btn-start').onclick = () => {
    missionState = { title: 'Coached Plan Block', drillId: null, badge: 'ACTIVE BLOCK' };
    switchMode('practice');
    renderPractice(state);
  };
  document.querySelectorAll('#plan-dur-seg button').forEach((b) => {
    b.onclick = () => {
      planDurationMin = Number(b.dataset.min) || 20;
      document.querySelectorAll('#plan-dur-seg button').forEach((x) => x.classList.toggle('active', x === b));
      renderPlan();
    };
  });

  // Review controls
  $('rev-club-filter').onchange = (e) => { reviewFilters.club = e.target.value; loadReviewTab(); };
  $('rev-mode-filter').onchange = (e) => { reviewFilters.mode = e.target.value; loadReviewTab(); };
  document.querySelectorAll('#rev-days-seg button').forEach((b) => { b.onclick = () => { reviewFilters.days = Number(b.dataset.days); loadReviewTab(); }; });
  document.querySelectorAll('#rev-sub-seg button').forEach((b) => { b.onclick = () => { activeReviewSub = b.dataset.sub; renderReview(); }; });
  document.querySelectorAll('#rev-leaks-filter-seg button').forEach((b) => { b.onclick = () => { reviewFilters.faultsOnly = b.dataset.lf === 'faults'; renderReview(); }; });
  document.querySelectorAll('#rev-trend-seg button').forEach((b) => {
    b.onclick = () => {
      activeTrendMetric = b.dataset.metric;
      document.querySelectorAll('#rev-trend-seg button').forEach((x) => x.classList.toggle('active', x === b));
      renderReview();
    };
  });
  $('rev-btn-sync').onclick = async () => { await api.syncHistory(); loadReviewTab(); showToast('Synced SimWatch history'); };
  $('rev-export-md').onclick = async () => {
    const r = await api.exportDebrief({ club: reviewFilters.club, days: reviewFilters.days || null });
    if (r?.ok) showToast(`Saved coaching debrief: ${String(r.filePath || '').split(/[/\\]/).pop()}`);
    else if (r && !r.canceled && r.error) showToast(`Export failed: ${r.error}`);
  };

  // Video compare controls
  (function wireVideoSyncHandlers() {
    const dtl = $('vid-player-dtl');
    const fo = $('vid-player-fo');
    const best = $('vid-player-best');
    const playBtn = $('btn-vid-play');
    const readout = $('vid-time-readout');
    const players = [dtl, fo, best].filter(Boolean);
    const progUntil = new WeakMap();
    const markProgrammatic = (el, ms = 300) => { progUntil.set(el, Date.now() + ms); };
    const isProgrammatic = (el) => (progUntil.get(el) || 0) > Date.now();
    const updatePlayLabel = () => {
      const vids = getActiveVideos();
      const anyPlaying = vids.some((v) => !v.paused && !v.ended);
      if (playBtn) playBtn.textContent = anyPlaying ? '❚❚ Pause' : '▶ Play Synced';
    };
    players.forEach((v) => {
      v.addEventListener('timeupdate', () => {
        const active = getActiveVideos();
        if (!active.includes(v)) return;
        if (v === active[0] && readout && Number.isFinite(v.currentTime)) {
          readout.textContent = `${v.currentTime.toFixed(2)}s`;
        }
      });
      v.addEventListener('play', () => {
        const active = getActiveVideos();
        if (!active.includes(v)) return;
        if (!isProgrammatic(v)) {
          active.forEach((other) => {
            if (other !== v && other.paused) {
              markProgrammatic(other, 250);
              other.playbackRate = videoState.playbackRate;
              other.play?.().catch(() => {});
            }
          });
        }
        updatePlayLabel();
      });
      v.addEventListener('pause', () => {
        const active = getActiveVideos();
        if (!active.includes(v)) return;
        if (!isProgrammatic(v) && !v.ended) {
          active.forEach((other) => {
            if (other !== v && !other.paused) {
              markProgrammatic(other, 250);
              other.pause?.();
            }
          });
        }
        updatePlayLabel();
      });
      v.addEventListener('ended', updatePlayLabel);
      v.addEventListener('seeked', () => {
        const active = getActiveVideos();
        if (!active.includes(v)) return;
        if (isProgrammatic(v)) return;
        const t = Number.isFinite(v.currentTime) ? v.currentTime : 0;
        if (readout) readout.textContent = `${t.toFixed(2)}s`;
        active.forEach((other) => {
          if (other === v) return;
          const targetT = (Number.isFinite(other.duration) && other.duration > 0) ? Math.min(t, other.duration) : t;
          if (Math.abs((other.currentTime || 0) - targetT) > 0.04) {
            markProgrammatic(other, 350);
            other.currentTime = targetT;
          }
        });
      });
    });
    if (playBtn) {
      playBtn.onclick = () => {
        const vids = getActiveVideos();
        const playing = vids.some((v) => !v.paused && !v.ended);
        vids.forEach((v) => {
          markProgrammatic(v, 250);
          if (playing) v.pause?.();
          else { v.playbackRate = videoState.playbackRate; v.play?.().catch(() => {}); }
        });
        updatePlayLabel();
      };
    }
    const prevBtn = $('btn-vid-prev-frame');
    const nextBtn = $('btn-vid-next-frame');
    if (prevBtn) {
      prevBtn.onclick = () => {
        const vids = getActiveVideos();
        vids.forEach((v) => {
          markProgrammatic(v, 350);
          v.pause?.();
          v.currentTime = Math.max(0, (v.currentTime || 0) - 1 / 60);
        });
        if (vids[0] && readout && Number.isFinite(vids[0].currentTime)) {
          readout.textContent = `${vids[0].currentTime.toFixed(2)}s`;
        }
        updatePlayLabel();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        const vids = getActiveVideos();
        vids.forEach((v) => {
          markProgrammatic(v, 350);
          v.pause?.();
          const nextT = (v.currentTime || 0) + 1 / 60;
          v.currentTime = (Number.isFinite(v.duration) && v.duration > 0) ? Math.min(v.duration, nextT) : nextT;
        });
        if (vids[0] && readout && Number.isFinite(vids[0].currentTime)) {
          readout.textContent = `${vids[0].currentTime.toFixed(2)}s`;
        }
        updatePlayLabel();
      };
    }
  })();
  $('vid-club').onchange = (e) => { videoState.club = e.target.value; videoState.selectedShotId = null; loadVideoTab(); };
  $('btn-vid-refresh').onclick = loadVideoTab;
  $('btn-vid-sync-empty').onclick = async () => { await api.syncHistory(); loadVideoTab(); };
  document.querySelectorAll('#vid-speed-seg button').forEach((b) => {
    b.onclick = () => {
      videoState.playbackRate = Number(b.dataset.speed) || 0.5;
      document.querySelectorAll('#vid-speed-seg button').forEach((x) => x.classList.toggle('active', x === b));
      getActiveVideos().forEach((v) => { v.playbackRate = videoState.playbackRate; });
    };
  });
  $('btn-promote-goto').onclick = async () => {
    if (videoState.selectedShotId && api.promoteGoTo) {
      const res = await api.promoteGoTo(videoState.selectedShotId);
      showToast(res?.ok ? 'Promoted ★ to My-Go-To!' : (res?.error || 'Could not promote'));
      loadVideoTab();
    }
  };

  // My Bag controls
  document.querySelectorAll('#bag-view-seg button').forEach((b) => { b.onclick = () => { activeBagView = b.dataset.bview; renderBag(); }; });
  $('bag-days').onchange = (e) => { bagFilters.days = Number(e.target.value); loadBagTab(); };
  $('bag-mode-filter').onchange = (e) => { bagFilters.mode = e.target.value; loadBagTab(); };
  $('bag-qual-filter').onchange = (e) => { bagFilters.quality = e.target.value; loadBagTab(); };
  $('bag-cat-filter').onchange = (e) => { bagFilters.category = e.target.value; loadBagTab(); };
  $('bag-mgr-club').onchange = (e) => { bagFilters.mgrClub = e.target.value; renderBag(); loadBagShotsManager(); };
  $('bag-trim-btn').onclick = () => { bagFilters.trimOutliers = !bagFilters.trimOutliers; loadBagTab(); };
  $('bag-restore-btn').onclick = async () => {
    const r = await api.restoreDeletedShots({});
    showToast(`Restored ${r?.restored || 0} deleted shot(s).`);
    loadBagTab();
  };
  $('bag-refresh-btn').onclick = loadBagTab;
  ['bag-wind', 'bag-temp', 'bag-alt', 'bag-lie'].forEach((id) => {
    $(id).oninput = () => {
      bagFilters.warp.wind = Number($('bag-wind').value);
      bagFilters.warp.temp = Number($('bag-temp').value);
      bagFilters.warp.alt = Number($('bag-alt').value);
      bagFilters.warp.lie = $('bag-lie').value;
      $('bag-wind-lbl').textContent = `${bagFilters.warp.wind} mph`;
      $('bag-temp-lbl').textContent = `${bagFilters.warp.temp}°F`;
      $('bag-alt-lbl').textContent = `${bagFilters.warp.alt} ft`;
      renderBag();
    };
  });
  $('bag-warp-reset').onclick = () => {
    bagFilters.warp = { wind: 0, temp: 70, alt: 0, lie: 'fairway' };
    $('bag-wind').value = '0'; $('bag-temp').value = '70'; $('bag-alt').value = '0'; $('bag-lie').value = 'fairway';
    $('bag-wind-lbl').textContent = '0 mph'; $('bag-temp-lbl').textContent = '70°F'; $('bag-alt-lbl').textContent = '0 ft';
    renderBag();
  };

  // Tempo, CSV, Settings, Checkin, Park, Print modal actions
  $('select-tempo').onchange = (e) => {
    const preset = e.target.value;
    const audio = window.ShotLabAudio;
    if (preset === 'off') audio?.stopTempo?.();
    else audio?.startTempo?.(preset, null, { sound: $('select-tempo-sound').value, gapSec: Number($('select-tempo-gap').value) });
    api.updateSettings({ tempoPreset: preset });
    syncTempoModal();
  };
  $('select-tempo-sound').onchange = (e) => {
    window.ShotLabAudio?.setTempoOptions?.({ sound: e.target.value });
    api.updateSettings({ tempoSound: e.target.value });
  };
  $('select-tempo-gap').onchange = (e) => {
    const gapSec = Number(e.target.value) || 0;
    window.ShotLabAudio?.setTempoOptions?.({ gapSec });
    api.updateSettings({ tempoGapSec: gapSec });
  };
  $('btn-tempo-toggle').onclick = () => {
    const next = $('select-tempo').value === 'off' ? '24/8' : 'off';
    $('select-tempo').value = next;
    $('select-tempo').onchange({ target: { value: next } });
  };
  $('btn-csv-import-once').onclick = async () => { if (api.importCsv) { const r = await api.importCsv({ watch: false }); $('csv-status-msg').textContent = r.ok ? `Imported ${r.count} shots.` : (r.error || ''); } };
  $('btn-csv-watch').onclick = async () => { if (api.importCsv) { const r = await api.importCsv({ watch: true }); $('csv-status-msg').textContent = r.ok ? `Watching ${r.path}` : (r.error || ''); } };
  $('btn-csv-stop').onclick = async () => { if (api.stopCsvWatch) await api.stopCsvWatch(); };
  $('btn-reset-cal').onclick = async () => { if (api.resetCalibration) await api.resetCalibration(); showToast('Calibration reset'); closeDialog('dlg-cal'); };
  $('btn-save-settings').onclick = async () => {
    const customLofts = {};
    document.querySelectorAll('[data-loft-club]').forEach((inp) => { customLofts[inp.dataset.loftClub] = inp.value.trim() === '' ? null : Number(inp.value); });
    await api.updateSettings({
      driverSpeedMph: Number($('set-driver-speed').value) || 98,
      handedness: $('set-handedness').value,
      altitudeFt: Number($('set-altitude').value) || 0,
      obsAutoHideSec: Number($('set-obs-autohide').value) || 0,
      audioChimes: $('set-audio-chimes').checked,
      audioCaddie: $('set-audio-caddie').checked,
      autoSwitch: { minConfidence: Math.max(0.7, Math.min(0.99, (Number($('set-autoswitch-conf').value) || 90) / 100)) },
      customLofts,
    });
    await api.updateStudioState({ matType: $('set-mat-type').value });
    closeDialog('dlg-settings');
    showToast('Settings saved!');
  };
  $('btn-save-checkin').onclick = async () => {
    await api.updateStudioState({
      roundCheckin: { score: Number($('chk-round-score').value) || 79, struggles: [$('chk-round-struggle').value], ts: new Date().toISOString().slice(0, 10) },
    });
    closeDialog('dlg-checkin');
    showToast('Round Check-In saved!');
  };
  $('btn-save-park').onclick = async () => {
    const txt = ($('park-input').value || '').trim();
    if (!txt) return;
    const cur = state?.settings?.studio?.parkedIdeas || [];
    await api.updateStudioState({ parkedIdeas: [{ id: `pk_${Date.now()}`, text: txt, ts: new Date().toISOString().slice(0, 10) }, ...cur] });
    $('park-input').value = '';
    closeDialog('dlg-park');
    renderPlan();
    showToast('Captured into Parking Lot!');
  };
  $('btn-print-wedge').onclick = () => window.print();

  window.addEventListener('keydown', (ev) => {
    if (document.querySelector('dialog[open]')) return;
    const tag = (ev.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (ev.key === 'Escape') {
      if (matGlanceOpen) { matGlanceOpen = false; $('mat-glance-overlay').classList.add('hidden'); }
      hideMetricPopover();
      hideHoverPopover();
      closeDrawer();
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (matGlanceOpen) {
      if (k === 'm') { $('btn-mat-glance').click(); }
      return;
    }
    if (k === 'm') { $('btn-mat-glance').click(); }
    else if (k === 'd') { $('btn-drills').click(); }
    else if (k === 'p') {
      ev.preventDefault();
      openDialog('dlg-park');
      $('park-input')?.focus();
    }
    else if (k === '1') switchMode('plan');
    else if (k === '2') switchMode('practice');
    else if (k === '3') switchMode('review');
    else if (k === '4') switchMode('bag');
  });

  if (HAS_IPC && typeof api.onState === 'function') {
    api.onState(render);
    api.onAutoSwitch?.((info) => {
      if (info?.result?.ok) showToast(`Auto-Switched GSPro → ${info.target} (${Math.round(info.confidence)}%)`);
    });
  }
  api.getState().then(render);
})();
