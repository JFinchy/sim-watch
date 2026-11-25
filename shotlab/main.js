/**
 * ShotLab — Electron Main Process + Local OBS Overlay HTTP/SSE Server + SimWatch Bridge Client.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');

const engine = require('./engine');
const { DEMO_SHOTS, makeDemoShot } = require('./engine/demo_shots');

const SIMWATCH_HOST = '127.0.0.1';
const ENV_SIMWATCH_PORT = process.env.SIMWATCH_PORT ? Number(process.env.SIMWATCH_PORT) : null;
const ENV_OBS_PORT = process.env.SHOTLAB_OBS_PORT ? Number(process.env.SHOTLAB_OBS_PORT) : null;
const SIMWATCH_PORT = Number.isFinite(ENV_SIMWATCH_PORT) && ENV_SIMWATCH_PORT > 0 ? ENV_SIMWATCH_PORT : 8765;
const OBS_PORT = Number.isFinite(ENV_OBS_PORT) && ENV_OBS_PORT > 0 ? ENV_OBS_PORT : 8766;

const REPO_ROOT = path.resolve(__dirname, '..');
const SWINGS_DIR = path.join(REPO_ROOT, 'Swings');
const SESSIONS_DIR = path.join(SWINGS_DIR, 'Sessions');
const GOTO_DIR = path.join(SWINGS_DIR, 'My-Go-To');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const KIDS_STATE_PATH = path.join(DATA_DIR, 'kids_state.json');
const DB_PATH = path.join(DATA_DIR, 'swings.sqlite');

const VALID_PRACTICE_MODES = new Set(['real', 'almost', 'sore']);
const VALID_TEMPO_PRESETS = new Set(['off', '24/8', '27/9', '21/7', '18/9']);
const VALID_TEMPO_SOUNDS = new Set(['tones', 'woodblock', 'click', 'beep', 'soft', 'swoosh']);
const MAX_TEMPO_GAP_SEC = 120;
const VALID_REF_LINES = new Set(['tour', 'scratch', 'low_hcp', 'mid_hcp']);

function sanitizeRefLines(v) {
  return Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && VALID_REF_LINES.has(x)))] : ['tour'];
}

function sanitizeTempoGap(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_TEMPO_GAP_SEC) : 0;
}
const CONTEXT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const VIDEO_MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

let mainWindow = null;
let obsServer = null;
let swingDb = null;
let shuttingDown = false;
const sseClients = new Set();

const VALID_MAT_TYPES = new Set(['fiberbuilt', 'divot', 'firm']);
const VALID_INTENDED_SHAPES = new Set(['stock', 'draw', 'fade', 'stinger', 'high']);

function defaultWedgeMatrix() {
  return [
    { club: 'PW', label: 'PW (45°)', cells: [{ arm: '7:30', pct: '50%', carry: 68, roll: 5 }, { arm: '9:00', pct: '75%', carry: 96, roll: 4 }, { arm: '10:30', pct: '90%', carry: 116, roll: 3 }, { arm: 'Full', pct: '100%', carry: 126, roll: 3 }] },
    { club: 'GW', label: 'GW (50°)', cells: [{ arm: '7:30', pct: '50%', carry: 58, roll: 4 }, { arm: '9:00', pct: '75%', carry: 84, roll: 3 }, { arm: '10:30', pct: '90%', carry: 102, roll: 2 }, { arm: 'Full', pct: '100%', carry: 112, roll: 1 }] },
    { club: 'SW', label: 'SW (54°)', cells: [{ arm: '7:30', pct: '50%', carry: 48, roll: 3 }, { arm: '9:00', pct: '75%', carry: 72, roll: 2 }, { arm: '10:30', pct: '90%', carry: 89, roll: 1 }, { arm: 'Full', pct: '100%', carry: 99, roll: -1 }] },
    { club: 'LW', label: 'LW (58°)', cells: [{ arm: '7:30', pct: '50%', carry: 38, roll: 2 }, { arm: '9:00', pct: '75%', carry: 60, roll: 1 }, { arm: '10:30', pct: '90%', carry: 75, roll: 0 }, { arm: 'Full', pct: '100%', carry: 84, roll: -2 }] },
  ];
}

function defaultStudioState() {
  return {
    matType: 'fiberbuilt',
    intendedShape: 'stock',
    showGoalLine: true,
    activeCues: [
      { id: 'cue_shaft', text: 'Shaft pointed at left thigh at address (P1)', club: 'All' },
      { id: 'cue_wrist', text: 'Lead wrist flat through P6–P7 impact zone', club: 'Irons' },
    ],
    parkedIdeas: [],
    bodyCheckin: { hamstrings: 1, ankle: 'ok', energy: 4 },
    mindCheckin: {
      state: 'locked',
      noise: 2,
      cue: 'Smooth clubhead sweep to target',
      modeLock: 'flow',
      warmupDoneDate: null,
      checklist: { tension: false, waggle: false, quietEye: false },
    },
    flowConfig: {
      batchSize: 5,
      batchEnabled: false,
      feelVsReal: false,
      breathAudio: false,
      matGlanceFlow: false,
    },
    challengeDifficulty: 'standard',
    flowLogs: [],
    roundCheckin: null,
    wedgeMatrix: defaultWedgeMatrix(),
    challengeBests: {},
  };
}

const VALID_MIND_STATES = new Set(['wired', 'scattered', 'locked', 'flat']);
const VALID_MODE_LOCKS = new Set(['lab', 'flow', 'clutch']);
const VALID_CHALLENGE_DIFFICULTIES = new Set(['standard', 'auto_flow', 'stretch_4', 'tour']);
const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function toFiniteNumOrNull(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const isPlainObj = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function sanitizeStudioState(patch = {}, prev = defaultStudioState()) {
  const defaults = defaultStudioState();
  const base = { ...defaults, ...(isPlainObj(prev) ? prev : {}) };
  base.bodyCheckin = { ...defaults.bodyCheckin, ...(isPlainObj(base.bodyCheckin) ? base.bodyCheckin : {}) };
  base.mindCheckin = {
    ...defaults.mindCheckin,
    ...(isPlainObj(base.mindCheckin) ? base.mindCheckin : {}),
    checklist: {
      ...defaults.mindCheckin.checklist,
      ...(isPlainObj(base.mindCheckin?.checklist) ? base.mindCheckin.checklist : {}),
    },
  };
  base.flowConfig = { ...defaults.flowConfig, ...(isPlainObj(base.flowConfig) ? base.flowConfig : {}) };
  if (!Array.isArray(base.flowLogs)) base.flowLogs = [];
  if (!Array.isArray(base.wedgeMatrix) || !base.wedgeMatrix.length) base.wedgeMatrix = defaults.wedgeMatrix;
  const p = isPlainObj(patch) ? patch : {};
  const next = { ...base };
  if (typeof p.matType === 'string' && VALID_MAT_TYPES.has(p.matType)) next.matType = p.matType;
  if (typeof p.intendedShape === 'string' && VALID_INTENDED_SHAPES.has(p.intendedShape)) next.intendedShape = p.intendedShape;
  if (typeof p.showGoalLine === 'boolean') next.showGoalLine = p.showGoalLine;
  if (Array.isArray(p.activeCues)) {
    next.activeCues = p.activeCues
      .filter((c) => c && typeof c.text === 'string' && c.text.trim())
      .slice(0, 2)
      .map((c, i) => ({
        id: String(c.id || `cue_${i + 1}`).slice(0, 48),
        text: c.text.trim().slice(0, 140),
        club: String(c.club || 'All').slice(0, 24),
      }));
  }
  if (Array.isArray(p.parkedIdeas)) {
    const stamp = Date.now();
    next.parkedIdeas = p.parkedIdeas
      .filter((x) => x && typeof x.text === 'string' && x.text.trim())
      .slice(0, 30)
      .map((x, i) => ({
        id: String(x.id || `park_${stamp}_${i}`).slice(0, 48),
        text: x.text.trim().slice(0, 180),
        ts: String(x.ts || new Date().toISOString().slice(0, 10)).slice(0, 32),
      }));
  }
  if (p.bodyCheckin && typeof p.bodyCheckin === 'object' && !Array.isArray(p.bodyCheckin)) {
    const numHam = toFiniteNumOrNull(p.bodyCheckin.hamstrings);
    const prevHam = toFiniteNumOrNull(base.bodyCheckin.hamstrings);
    const numEnergy = toFiniteNumOrNull(p.bodyCheckin.energy);
    const prevEnergy = toFiniteNumOrNull(base.bodyCheckin.energy);
    next.bodyCheckin = {
      hamstrings: Math.max(0, Math.min(3, Math.round(numHam ?? prevHam ?? 1))),
      ankle: ['ok', 'sore', 'flare'].includes(p.bodyCheckin.ankle) ? p.bodyCheckin.ankle : base.bodyCheckin.ankle,
      energy: Math.max(1, Math.min(5, Math.round(numEnergy ?? prevEnergy ?? 4))),
    };
  }
  if (p.mindCheckin && typeof p.mindCheckin === 'object' && !Array.isArray(p.mindCheckin)) {
    const mc = p.mindCheckin;
    const prevMc = base.mindCheckin;
    const clPatch = mc.checklist && typeof mc.checklist === 'object' && !Array.isArray(mc.checklist) ? mc.checklist : {};
    const numNoise = toFiniteNumOrNull(mc.noise);
    const prevNoise = toFiniteNumOrNull(prevMc.noise);
    next.mindCheckin = {
      state: VALID_MIND_STATES.has(mc.state) ? mc.state : (VALID_MIND_STATES.has(prevMc.state) ? prevMc.state : 'locked'),
      noise: Math.max(1, Math.min(5, Math.round(numNoise ?? prevNoise ?? 2))),
      cue: typeof mc.cue === 'string' ? mc.cue.trim().slice(0, 120) : prevMc.cue,
      modeLock: VALID_MODE_LOCKS.has(mc.modeLock) ? mc.modeLock : (VALID_MODE_LOCKS.has(prevMc.modeLock) ? prevMc.modeLock : 'flow'),
      warmupDoneDate: mc.warmupDoneDate === null
        ? null
        : (typeof mc.warmupDoneDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(mc.warmupDoneDate) ? mc.warmupDoneDate : prevMc.warmupDoneDate),
      checklist: {
        tension: typeof clPatch.tension === 'boolean' ? clPatch.tension : Boolean(prevMc.checklist?.tension),
        waggle: typeof clPatch.waggle === 'boolean' ? clPatch.waggle : Boolean(prevMc.checklist?.waggle),
        quietEye: typeof clPatch.quietEye === 'boolean' ? clPatch.quietEye : Boolean(prevMc.checklist?.quietEye),
      },
    };
  }
  if (p.flowConfig && typeof p.flowConfig === 'object' && !Array.isArray(p.flowConfig)) {
    const fc = p.flowConfig;
    const prevFc = base.flowConfig;
    const bSize = toFiniteNumOrNull(fc.batchSize);
    next.flowConfig = {
      batchSize: Math.max(3, Math.min(10, Math.round(bSize ?? prevFc.batchSize ?? 5))),
      batchEnabled: typeof fc.batchEnabled === 'boolean' ? fc.batchEnabled : Boolean(prevFc.batchEnabled),
      feelVsReal: typeof fc.feelVsReal === 'boolean' ? fc.feelVsReal : Boolean(prevFc.feelVsReal),
      breathAudio: typeof fc.breathAudio === 'boolean' ? fc.breathAudio : Boolean(prevFc.breathAudio),
      matGlanceFlow: typeof fc.matGlanceFlow === 'boolean' ? fc.matGlanceFlow : Boolean(prevFc.matGlanceFlow),
    };
  }
  if (typeof p.challengeDifficulty === 'string' && VALID_CHALLENGE_DIFFICULTIES.has(p.challengeDifficulty)) {
    next.challengeDifficulty = p.challengeDifficulty;
  } else if (!VALID_CHALLENGE_DIFFICULTIES.has(next.challengeDifficulty)) {
    next.challengeDifficulty = 'standard';
  }
  if (Array.isArray(p.flowLogs)) {
    next.flowLogs = p.flowLogs
      .filter((x) => x && typeof x === 'object' && !Array.isArray(x))
      .slice(0, 90)
      .map((x, idx) => {
        const sc = toFiniteNumOrNull(x.avgScore);
        const sg = toFiniteNumOrNull(x.avgSg);
        const nShots = toFiniteNumOrNull(x.shotsCount);
        const fr = toFiniteNumOrNull(x.flowRating);
        const pr = toFiniteNumOrNull(x.processRating);
        const dt = typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : new Date().toISOString().slice(0, 10);
        return {
          id: String(x.id || `fl_${dt}_${idx}`).slice(0, 48),
          date: dt,
          ts: String(x.ts || new Date().toISOString()).slice(0, 32),
          warmupDone: Boolean(x.warmupDone),
          mindState: VALID_MIND_STATES.has(x.mindState) ? x.mindState : 'locked',
          flowRating: Math.max(1, Math.min(5, Math.round(fr ?? 3))),
          processRating: Math.max(1, Math.min(5, Math.round(pr ?? 3))),
          avgScore: sc !== null ? Math.max(0, Math.min(100, Math.round(sc))) : null,
          avgSg: sg !== null ? Math.max(-5, Math.min(5, Math.round(sg * 100) / 100)) : null,
          shotsCount: Math.max(0, Math.min(999, Math.round(nShots ?? 0))),
        };
      });
  }
  if ('roundCheckin' in p) {
    next.roundCheckin = p.roundCheckin && typeof p.roundCheckin === 'object' && !Array.isArray(p.roundCheckin) ? {
      score: Math.max(55, Math.min(140, Math.round(toFiniteNumOrNull(p.roundCheckin.score) ?? 82))),
      struggles: Array.isArray(p.roundCheckin.struggles) ? p.roundCheckin.struggles.slice(0, 4).map((s) => String(s).slice(0, 40)) : [],
      ts: String(p.roundCheckin.ts || new Date().toISOString().slice(0, 10)).slice(0, 32),
    } : null;
  }
  if (Array.isArray(p.wedgeMatrix) && p.wedgeMatrix.length) {
    const validRows = p.wedgeMatrix.filter((row) => isPlainObj(row) && Array.isArray(row.cells) && row.cells.some((c) => isPlainObj(c)));
    if (validRows.length) {
      next.wedgeMatrix = validRows.slice(0, 5).map((row) => ({
        club: String(row.club || '').slice(0, 8),
        label: String(row.label || row.club || '').slice(0, 24),
        cells: row.cells
          .filter((c) => isPlainObj(c))
          .slice(0, 4)
          .map((c) => {
            const vlaNum = toFiniteNumOrNull(c.vla);
            const spinNum = toFiniteNumOrNull(c.spin);
            const sprNum = toFiniteNumOrNull(c.spread);
            const nNum = toFiniteNumOrNull(c.n);
            return {
              arm: String(c.arm || '').slice(0, 12),
              pct: String(c.pct || '').slice(0, 8),
              carry: Math.max(5, Math.min(200, Math.round(toFiniteNumOrNull(c.carry) ?? 60))),
              roll: Math.max(-15, Math.min(30, Math.round(toFiniteNumOrNull(c.roll) ?? 0))),
              vla: vlaNum !== null ? Math.max(5, Math.min(65, Math.round(vlaNum * 10) / 10)) : null,
              spin: spinNum !== null ? Math.max(500, Math.min(14000, Math.round(spinNum))) : null,
              spread: sprNum !== null ? Math.max(0, Math.min(30, Math.round(sprNum * 10) / 10)) : null,
              n: nNum !== null ? Math.max(0, Math.min(999, Math.round(nNum))) : 0,
              calibratedAt: (typeof c.calibratedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.calibratedAt)) ? c.calibratedAt : null,
            };
          }),
      }));
    }
  }
  if (p.challengeBests && typeof p.challengeBests === 'object' && !Array.isArray(p.challengeBests)) {
    const merged = Object.create(null);
    if (base.challengeBests && typeof base.challengeBests === 'object' && !Array.isArray(base.challengeBests)) {
      for (const [k, v] of Object.entries(base.challengeBests)) {
        if (!BLOCKED_OBJECT_KEYS.has(k) && typeof v === 'number' && Number.isFinite(v)) merged[k] = v;
      }
    }
    for (const [k, v] of Object.entries(p.challengeBests).slice(0, 24)) {
      const cleanK = String(k).slice(0, 32);
      if (!BLOCKED_OBJECT_KEYS.has(cleanK) && typeof v === 'number' && Number.isFinite(v)) {
        merged[cleanK] = v;
      }
    }
    const capped = {};
    for (const k of Object.keys(merged).slice(0, 24)) {
      capped[k] = merged[k];
    }
    next.challengeBests = capped;
  }
  return next;
}

const runtime = {
  bridgeConnected: false,
  bridgeSnifferOk: false,
  rigHealth: null, // SimWatch watchdog verdict: { state, all_ok, failing[], ts }
  hotkeys: [], // SimWatch global hotkeys: [{ action, keys, label, state }] (from /api/status)
  gsproClub: null,
  obsServerError: null,
  drillsHub: null,
  challengeState: null,
  kidsMode: false, // Ephemeral: ALWAYS boots false so Dad's mode is default
  kidsState: null, // Persisted separately in shotlab/data/kids_state.json
  settings: {
    tierId: 'low_hcp',
    handedness: 'RH',
    altitudeFt: 0,
    simwatchPort: SIMWATCH_PORT,
    obsPort: OBS_PORT,
    obsAutoHideSec: 0, // 0 = stay visible
    practiceMode: 'real',
    activeFeelId: null,
    activeDrillId: null,
    audioCaddie: false,
    audioChimes: true,
    tempoPreset: 'off',
    tempoSound: 'tones',
    tempoGapSec: 0, // rest between swings; 0 = non-stop loop
    refLines: ['tour'], // benchmark trajectories shown on the flight chart
    studio: defaultStudioState(),
  },
  calibration: engine.createEmptyCalibration(98),
  shots: [],          // newest first, max 200 analyzed shots
  selectedShotId: null,
  demoCounter: 0,
  watchedCsvPath: null,
  csvWatcher: null,
  csvDebounceTimer: null,
  lastCsvLineCount: 0,
  lastCsvSingleFingerprint: null,
};

function sanitizeContextId(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  return CONTEXT_ID_RE.test(s) ? s : null;
}

function sanitizeLocalFeelId(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s ? s.slice(0, 120) : null;
}

const VALID_KIDS_GAMES = new Set(['rocket', 'trex', 'monster', 'bowling']);

function defaultKidsState() {
  return {
    teamName: 'Team Rocket Dinos',
    kids: [
      { id: 'k1', name: 'Player 1', age: 5 },
      { id: 'k2', name: 'Player 2', age: 4 },
    ],
    activeTurnIdx: 0,
    autoRotate: true,
    activeGame: 'rocket',
    stars: 0,
    trophies: 0,
    soundOn: true,
    voiceOn: false,
    safety: { safeZone: false, parkClub: false, softBalls: false },
    routineDone: { warmup: false, gameA: false, gameB: false, boss: false },
    quarantineIds: [],
  };
}

function sanitizeKidsState(patch = {}, prev = defaultKidsState()) {
  const def = defaultKidsState();
  const base = { ...def, ...(isPlainObj(prev) ? prev : {}) };
  const p = isPlainObj(patch) ? patch : {};
  const next = { ...base };

  if (typeof p.teamName === 'string' && p.teamName.trim()) {
    next.teamName = p.teamName.trim().slice(0, 48);
  }
  if (Array.isArray(p.kids) && p.kids.length >= 2) {
    next.kids = p.kids.slice(0, 4).map((k, idx) => {
      const fallback = def.kids[idx] || { id: `k${idx + 1}`, name: `Player ${idx + 1}`, age: 5 };
      const ageNum = toFiniteNumOrNull(k?.age);
      return {
        id: String(k?.id || fallback.id).slice(0, 16),
        name: (typeof k?.name === 'string' && k.name.trim()) ? k.name.trim().slice(0, 28) : fallback.name,
        age: ageNum !== null ? Math.max(2, Math.min(12, Math.round(ageNum))) : fallback.age,
      };
    });
  }
  if (p.activeTurnIdx !== undefined) {
    const idx = toFiniteNumOrNull(p.activeTurnIdx);
    const len = Math.max(1, (next.kids || def.kids).length);
    next.activeTurnIdx = idx !== null ? Math.max(0, Math.min(len - 1, Math.round(idx))) : 0;
  }
  if (typeof p.autoRotate === 'boolean') next.autoRotate = p.autoRotate;
  if (typeof p.activeGame === 'string' && VALID_KIDS_GAMES.has(p.activeGame)) next.activeGame = p.activeGame;
  if (p.stars !== undefined) {
    const st = toFiniteNumOrNull(p.stars);
    if (st !== null) next.stars = Math.max(0, Math.min(100000, Math.round(st)));
  }
  if (p.trophies !== undefined) {
    const tr = toFiniteNumOrNull(p.trophies);
    if (tr !== null) next.trophies = Math.max(0, Math.min(10000, Math.round(tr)));
  }
  if (typeof p.soundOn === 'boolean') next.soundOn = p.soundOn;
  if (typeof p.voiceOn === 'boolean') next.voiceOn = p.voiceOn;
  if (isPlainObj(p.safety)) {
    next.safety = {
      safeZone: typeof p.safety.safeZone === 'boolean' ? p.safety.safeZone : Boolean(base.safety?.safeZone),
      parkClub: typeof p.safety.parkClub === 'boolean' ? p.safety.parkClub : Boolean(base.safety?.parkClub),
      softBalls: typeof p.safety.softBalls === 'boolean' ? p.safety.softBalls : Boolean(base.safety?.softBalls),
    };
  }
  if (isPlainObj(p.routineDone)) {
    next.routineDone = {
      warmup: typeof p.routineDone.warmup === 'boolean' ? p.routineDone.warmup : Boolean(base.routineDone?.warmup),
      gameA: typeof p.routineDone.gameA === 'boolean' ? p.routineDone.gameA : Boolean(base.routineDone?.gameA),
      gameB: typeof p.routineDone.gameB === 'boolean' ? p.routineDone.gameB : Boolean(base.routineDone?.gameB),
      boss: typeof p.routineDone.boss === 'boolean' ? p.routineDone.boss : Boolean(base.routineDone?.boss),
    };
  }
  if (Array.isArray(p.quarantineIds)) {
    next.quarantineIds = [...new Set(p.quarantineIds.filter((x) => typeof x === 'string' && x.length > 0))].slice(-500);
  }
  return next;
}

function loadKidsState() {
  try {
    if (!fs.existsSync(KIDS_STATE_PATH)) {
      runtime.kidsState = defaultKidsState();
      return;
    }
    const raw = JSON.parse(fs.readFileSync(KIDS_STATE_PATH, 'utf8'));
    runtime.kidsState = sanitizeKidsState(raw, defaultKidsState());
  } catch (err) {
    console.warn('[ShotLab] Could not load kids_state.json:', err.message);
    runtime.kidsState = defaultKidsState();
  }
}

function saveKidsState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${KIDS_STATE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(runtime.kidsState || defaultKidsState(), null, 2), 'utf8');
    fs.renameSync(tmp, KIDS_STATE_PATH);
  } catch (err) {
    console.warn('[ShotLab] Could not save kids_state.json:', err.message);
  }
}

function isQuarantinedKidsShot(raw) {
  const qSet = new Set(runtime.kidsState?.quarantineIds || []);
  return engine.isKidsZoneRawShot(raw, qSet);
}

function recordKidsQuarantineTs(ts) {
  if (typeof ts !== 'string' || !ts) return;
  if (!runtime.kidsState) runtime.kidsState = defaultKidsState();
  const prev = Array.isArray(runtime.kidsState.quarantineIds) ? runtime.kidsState.quarantineIds : [];
  if (!prev.includes(ts)) {
    runtime.kidsState.quarantineIds = [...prev, ts].slice(-500);
    saveKidsState();
  }
}

function handleKidsShot(rawDoc) {
  if (rawDoc && typeof rawDoc === 'object' && rawDoc.source !== 'manual' && typeof rawDoc.ts === 'string' && rawDoc.ts) {
    recordKidsQuarantineTs(rawDoc.ts);
  }
  const kidShot = engine.analyzeKidsShot(rawDoc);
  if (kidShot && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shotlab:kids-shot', kidShot);
  }
  return kidShot;
}

function isValidLoopbackHost(hostHeader, expectedPort) {
  if (hostHeader === undefined || hostHeader === null || String(hostHeader).trim() === '') {
    return true;
  }
  const m = /^(127\.0\.0\.1|localhost)(?::(\d+))?$/i.exec(String(hostHeader).trim());
  if (!m) return false;
  if (m[2] !== undefined && Number(m[2]) !== Number(expectedPort)) {
    return false;
  }
  return true;
}

function checkRealpathContainment(baseDir, targetPath) {
  let realBase;
  try {
    realBase = fs.realpathSync(baseDir);
  } catch {
    return { ok: false, notFound: true, realPath: null };
  }
  let realTarget;
  try {
    realTarget = fs.realpathSync(targetPath);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return { ok: false, notFound: true, realPath: null };
    }
    return { ok: false, notFound: false, realPath: null };
  }
  const rel = path.relative(realBase, realTarget);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, notFound: false, realPath: null };
  }
  return { ok: true, notFound: false, realPath: realTarget };
}

function resolveFeelLabel(feelId) {
  if (!feelId) return null;
  const feels = runtime.drillsHub?.feels || [];
  const hit = feels.find((f) => f.id === feelId);
  return hit ? hit.name : feelId;
}

function syncHistoricalSessions() {
  if (!swingDb) return { filesScanned: 0, shotsImported: 0 };
  try {
    return swingDb.syncSimWatchSessions(SESSIONS_DIR, (raw) => {
      if (isQuarantinedKidsShot(raw)) return null;
      return engine.analyzeShot(raw, {
        calibration: runtime.calibration,
        tierId: runtime.settings.tierId,
        handedness: runtime.settings.handedness,
        altitudeFt: runtime.settings.altitudeFt,
        practiceMode: raw.practice_mode || 'real',
        feelId: raw.feel_id || null,
        drillId: raw.drill_id || null,
        drills: runtime.drillsHub?.drills || [],
        matType: runtime.settings.studio?.matType || 'fiberbuilt',
      });
    });
  } catch (err) {
    console.warn('[ShotLab] Historical session sync failed:', err.message);
    return { filesScanned: 0, shotsImported: 0, error: err.message };
  }
}

function resolveClipFileOnDisk(sessionDate, clipName) {
  if (!sessionDate || !SESSION_DATE_RE.test(sessionDate)) return null;
  if (!clipName || typeof clipName !== 'string') return null;
  const base = path.basename(clipName.trim());
  if (!base) return null;
  const ext = path.extname(base).toLowerCase();
  if (!VIDEO_MIME_TYPES[ext]) return null;
  const resolvedBase = path.resolve(SESSIONS_DIR);
  const subs = ['DTL', 'FO', ''];
  for (const sub of subs) {
    const fullPath = sub
      ? path.resolve(resolvedBase, sessionDate, sub, base)
      : path.resolve(resolvedBase, sessionDate, base);
    const rel = path.relative(resolvedBase, fullPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    try {
      const check = checkRealpathContainment(resolvedBase, fullPath);
      if (check.ok && fs.statSync(check.realPath).isFile()) {
        return { fullPath: check.realPath, sub, base, ext };
      }
    } catch {
      // ignore fs access errors
    }
  }
  return null;
}

function resolveClipMediaUrl(sessionDate, clipName) {
  const hit = resolveClipFileOnDisk(sessionDate, clipName);
  if (!hit) return null;
  const encoded = encodeURIComponent(hit.base);
  const urlPath = hit.sub
    ? `/media/${sessionDate}/${hit.sub}/${encoded}`
    : `/media/${sessionDate}/${encoded}`;
  return `http://127.0.0.1:${runtime.settings.obsPort}${urlPath}`;
}

function toDispersionShot(s) {
  return {
    id: s.id,
    ts: s.ts,
    club: s.activeClub,
    carryYds: s.metrics?.effectiveCarry ?? s.flight?.carryYds ?? null,
    offlineYds: s.flight?.offlineYds ?? null,
    score: s.scorecard?.score ?? null,
    sg: s.strokesGained?.sg ?? null,
    deliveryId: s.delivery?.id ?? null,
    deliveryName: s.delivery?.name ?? null,
    leftOnTableYds: s.potential?.totalLeftOnTableYds ?? null,
    strikeLocation: s.strike?.location ?? null,
    shotShape: s.shotShape?.name ?? null,
    feelId: s.feelId ?? null,
  };
}

function computeSessionStats(shots) {
  const real = (shots || []).filter((s) => !s.isPreviewSeed && !s.isPutt && s.activeClub !== 'PT');
  const count = real.length;
  const avgOf = (vals, digits = 1) => {
    const nums = vals.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!nums.length) return null;
    const p = 10 ** digits;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * p) / p;
  };
  const sgVals = real
    .map((s) => s.strokesGained && s.strokesGained.sg)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  const totalSg = sgVals.length
    ? Math.round(sgVals.reduce((a, b) => a + b, 0) * 100) / 100
    : null;
  const avgSg = sgVals.length
    ? Math.round((totalSg / sgVals.length) * 100) / 100
    : null;

  // Shots with no club read are graded on fewer metrics (no smash/path/AoA), so they'd inflate the average:
  // average full reads only, and report how often the club sticker was read.
  const clubReads = real.filter((s) => !s.dataQuality || s.dataQuality.clubRead).length;
  const fullReadShots = real.filter((s) => !s.dataQuality || s.dataQuality.clubRead);
  return {
    count,
    clubReads,
    avgScore: avgOf((fullReadShots.length ? fullReadShots : real).map((s) => s.scorecard && s.scorecard.score), 0),
    avgCarry: avgOf(
      real.map((s) => s.metrics && (s.metrics.effectiveCarry ?? (s.flight && s.flight.carryYds))),
      1
    ),
    avgSmash: avgOf(real.map((s) => s.metrics && s.metrics.smash), 2),
    totalSg,
    avgSg,
  };
}

// --------------------------------------------------------------------------- persistence

function loadPersistedState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (raw.settings && typeof raw.settings === 'object') {
      runtime.settings = { ...runtime.settings, ...raw.settings };
      if (typeof runtime.settings.tierId !== 'string' || !Object.hasOwn(engine.BENCHMARK_TIERS, runtime.settings.tierId)) {
        runtime.settings.tierId = 'low_hcp';
      }
      if (runtime.settings.handedness !== 'RH' && runtime.settings.handedness !== 'LH') {
        runtime.settings.handedness = 'RH';
      }
      runtime.settings.altitudeFt = Number.isFinite(Number(runtime.settings.altitudeFt))
        ? Math.max(0, Math.min(10000, Number(runtime.settings.altitudeFt)))
        : 0;
      runtime.settings.obsAutoHideSec = Number.isFinite(Number(runtime.settings.obsAutoHideSec))
        ? Math.max(0, Math.min(300, Math.round(Number(runtime.settings.obsAutoHideSec))))
        : 0;
      if (!VALID_PRACTICE_MODES.has(runtime.settings.practiceMode)) {
        runtime.settings.practiceMode = 'real';
      }
      runtime.settings.activeFeelId = sanitizeLocalFeelId(runtime.settings.activeFeelId);
      runtime.settings.activeDrillId = engine.sanitizeAdultDrillId(runtime.settings.activeDrillId);
      runtime.settings.audioCaddie = Boolean(runtime.settings.audioCaddie);
      runtime.settings.audioChimes = runtime.settings.audioChimes !== false;
      if (typeof runtime.settings.tempoPreset !== 'string' || !VALID_TEMPO_PRESETS.has(runtime.settings.tempoPreset)) {
        runtime.settings.tempoPreset = 'off';
      }
      if (typeof runtime.settings.tempoSound !== 'string' || !VALID_TEMPO_SOUNDS.has(runtime.settings.tempoSound)) {
        runtime.settings.tempoSound = 'tones';
      }
      runtime.settings.tempoGapSec = sanitizeTempoGap(runtime.settings.tempoGapSec);
      runtime.settings.refLines = sanitizeRefLines(runtime.settings.refLines);
      runtime.settings.studio = sanitizeStudioState(raw.settings.studio, defaultStudioState());
      const swPort = toFiniteNumOrNull(runtime.settings.simwatchPort);
      runtime.settings.simwatchPort = (swPort !== null && swPort >= 1024 && swPort <= 65535)
        ? Math.round(swPort)
        : SIMWATCH_PORT;
      const oPort = toFiniteNumOrNull(runtime.settings.obsPort);
      runtime.settings.obsPort = (oPort !== null && oPort >= 1024 && oPort <= 65535)
        ? Math.round(oPort)
        : OBS_PORT;
      // Explicit environment overrides always take precedence over saved ports
      if (Number.isFinite(ENV_SIMWATCH_PORT) && ENV_SIMWATCH_PORT > 0) {
        runtime.settings.simwatchPort = ENV_SIMWATCH_PORT;
      }
      if (Number.isFinite(ENV_OBS_PORT) && ENV_OBS_PORT > 0) {
        runtime.settings.obsPort = ENV_OBS_PORT;
      }
    }
    if (raw.calibration && typeof raw.calibration === 'object') {
      const defaults = engine.createEmptyCalibration(98);
      const rawLofts = (raw.calibration.customLofts && typeof raw.calibration.customLofts === 'object') ? raw.calibration.customLofts : {};
      const cleanLofts = {};
      for (const [club, val] of Object.entries(rawLofts)) {
        if (!Object.hasOwn(engine.CLUB_SPECS, club)) continue;
        const num = Number(val);
        if (Number.isFinite(num) && num >= 5 && num <= 70) cleanLofts[club] = Number(num.toFixed(1));
      }
      const rawDriverSpd = toFiniteNumOrNull(raw.calibration.driverSpeedMph);
      const validDriverSpd = (rawDriverSpd !== null && rawDriverSpd >= 60 && rawDriverSpd <= 140)
        ? rawDriverSpd
        : 98;
      runtime.calibration = {
        ...defaults,
        ...raw.calibration,
        driverSpeedMph: validDriverSpd,
        autoSwitch: {
          ...defaults.autoSwitch,
          ...(raw.calibration.autoSwitch || {}),
        },
        customLofts: cleanLofts,
      };
    }
  } catch (err) {
    console.warn('[ShotLab] Could not load persisted state:', err.message);
  }
}

function savePersistedState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_PATH}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ settings: runtime.settings, calibration: runtime.calibration }, null, 2),
      'utf8'
    );
    fs.renameSync(tmp, STATE_PATH);
  } catch (err) {
    console.warn('[ShotLab] Could not save state:', err.message);
  }
}

// --------------------------------------------------------------------------- shot ingestion & fan-out

function getSnapshot() {
  const current = runtime.shots.find((s) => s.id === runtime.selectedShotId) || runtime.shots[0] || null;
  const rawDrills = runtime.drillsHub?.drills || [];
  const adultDrills = rawDrills.filter((d) => !d.isKidsZone);
  const sessionShots = runtime.shots.filter((s) => !s.isPreviewSeed && !s.isPutt && s.activeClub !== 'PT');
  const streak = engine.detectFaultStreak(sessionShots, adultDrills, {
    practiceMode: runtime.settings.practiceMode,
    club: current?.activeClub,
    limit: 3,
  });
  const faultAlert = streak
    ? {
        ...streak,
        drills: Array.isArray(streak.recommendedDrills)
          ? streak.recommendedDrills
          : engine.recommendDrillsForFault(streak.faultId, adultDrills, {
              practiceMode: runtime.settings.practiceMode,
              club: current?.activeClub,
              limit: 3,
            }),
      }
    : null;

  let dbSummary = null;
  if (swingDb) {
    try {
      dbSummary = swingDb.getSummary();
    } catch {
      dbSummary = null;
    }
  }

  return {
    bridgeConnected: runtime.bridgeConnected,
    bridgeSnifferOk: runtime.bridgeSnifferOk,
    rigHealth: runtime.bridgeConnected ? runtime.rigHealth : null,
    hotkeys: runtime.bridgeConnected ? runtime.hotkeys : [],
    gsproClub: runtime.gsproClub,
    obsPort: runtime.settings.obsPort,
    obsServerError: runtime.obsServerError,
    simwatchPort: runtime.settings.simwatchPort,
    settings: runtime.settings,
    calibration: runtime.calibration,
    calibrationStats: engine.getCalibrationStats(runtime.calibration),
    currentShot: current,
    shots: runtime.shots.slice(0, 60),
    demoArchetypes: DEMO_SHOTS.map((d) => ({ id: d.id, label: d.label, actualClub: d.actualClub })),
    watchedCsvPath: runtime.watchedCsvPath,
    dbSummary,
    drillsHub: {
      loaded: Boolean(runtime.drillsHub?.loaded),
      modes: runtime.drillsHub?.modes || [],
      feels: runtime.drillsHub?.feels || [],
      drills: rawDrills.map((d) => ({
        id: d.id,
        title: d.title,
        section: d.section || '',
        audience: d.audience || 'adult',
        isKidsZone: Boolean(d.isKidsZone),
        swingPhase: d.swingPhase || '',
        duration: d.duration || '',
        reps: d.reps || '',
        pacing: d.pacing || 'either',
        days: d.days || [],
        modePlans: d.modePlans || null,
        focus: d.focus,
        keyFeel: d.keyFeel,
        faultTags: d.faultTags || [],
        shotlabFaultIds: d.shotlabFaultIds || [],
        modes: d.modes,
        clubs: d.clubs,
        video: d.video,
        why: d.why,
        instructions: d.instructions || [],
      })),
      faultToDrillIds: runtime.drillsHub?.faultToDrillIds || engine.FAULT_TO_DRILL_IDS || {},
      driverDial: runtime.drillsHub?.driverDial || null,
      personalChecklist: runtime.drillsHub?.personalChecklist || [],
    },
    kidsMode: Boolean(runtime.kidsMode),
    kidsState: runtime.kidsState || defaultKidsState(),
    faultAlert,
    sessionStats: computeSessionStats(runtime.shots),
  };
}

function buildObsPayload(snap) {
  const rawActiveClub = snap.currentShot?.activeClub || null;
  const activeClub = (snap.currentShot?.isPutt || rawActiveClub === 'PT') ? null : rawActiveClub;
  let dispersion = null;
  if (activeClub) {
    if (swingDb) {
      try {
        dispersion = swingDb.getClubPatterns({ club: activeClub, mode: 'real', days: 30 });
      } catch {
        dispersion = null;
      }
    }
    if (!dispersion || (dispersion.n || 0) < 2) {
      const matching = runtime.shots
        .filter((s) => !s.isPreviewSeed && !s.isPutt && (s.practiceMode || 'real') !== 'almost' && s.activeClub === activeClub)
        .map(toDispersionShot);
      if (matching.length > 0) {
        dispersion = engine.computeDispersionStats(matching, { club: activeClub });
      } else if (!dispersion) {
        dispersion = engine.computeDispersionStats([], { club: activeClub });
      }
    }
  }

  const activeFeelLabel = resolveFeelLabel(snap.settings.activeFeelId);

  return {
    shot: snap.currentShot,
    calibrationStats: snap.calibrationStats,
    settings: snap.settings,
    bridgeConnected: snap.bridgeConnected,
    dispersion,
    challengeState: runtime.challengeState,
    sessionTicker: {
      count: snap.sessionStats.count,
      sessionShots: snap.sessionStats.count,
      avgScore: snap.sessionStats.avgScore,
      avgCarry: snap.sessionStats.avgCarry,
      avgSg: snap.sessionStats.avgSg,
      practiceMode: snap.settings.practiceMode,
      activeFeelLabel,
      activeFeel: activeFeelLabel,
      activeClub,
      dbTotalShots: snap.dbSummary?.totalShots || 0,
    },
  };
}

function broadcastSse(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of [...sseClients]) {
    try {
      res.write(frame);
    } catch {
      sseClients.delete(res);
    }
  }
}

function notifyAll(eventName = 'state') {
  const snap = getSnapshot();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shotlab:state', { ...snap, eventType: eventName });
  }
  const obsPayload = buildObsPayload(snap);
  if (eventName === 'shot' && snap.currentShot) {
    broadcastSse('shot', obsPayload);
  } else {
    broadcastSse('state', obsPayload);
  }
}

function pushContextToSimWatch(patch = {}) {
  if (!patch || typeof patch !== 'object') {
    return Promise.resolve({ ok: false, reason: 'empty_patch' });
  }
  const payload = {};
  if ('feelId' in patch) {
    const rawFeel = patch.feelId;
    if (rawFeel === null || rawFeel === undefined || String(rawFeel).trim() === '') {
      payload.feel_id = null;
    } else {
      const cleanFeel = sanitizeContextId(rawFeel);
      if (cleanFeel) {
        payload.feel_id = cleanFeel;
      }
    }
  }
  if ('drillId' in patch) {
    const rawDrill = patch.drillId;
    if (rawDrill === null || rawDrill === undefined || String(rawDrill).trim() === '') {
      payload.drill_id = null;
    } else {
      const cleanDrill = sanitizeContextId(rawDrill);
      if (cleanDrill) {
        payload.drill_id = cleanDrill;
      }
    }
  }
  if ('sessionId' in patch) {
    const rawSess = patch.sessionId;
    if (rawSess === null || rawSess === undefined || String(rawSess).trim() === '') {
      payload.session_id = null;
    } else {
      const cleanSess = sanitizeContextId(rawSess);
      if (cleanSess) {
        payload.session_id = cleanSess;
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: SIMWATCH_HOST,
        port: runtime.settings.simwatchPort,
        path: '/api/context',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({ ok: res.statusCode === 200, status: res.statusCode });
        });
      }
    );
    req.on('error', () => resolve({ ok: false, reason: 'bridge_offline' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, reason: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

// GSPro reports its new club asynchronously (OpenConnect Code 201 -> SimWatch SSE `club` event).
// Until it does, runtime.gsproClub is stale, so a second switch planned from it would overshoot.
// Hold a lock from send until the club event lands (or a short timeout if GSPro ignored the keys).
const GSPRO_SWITCH_SETTLE_MS = 3000;
let gsproSwitchLock = null; // { timer, target } while a switch is in flight / settling

function releaseGsproSwitchLock() {
  if (!gsproSwitchLock) return;
  if (gsproSwitchLock.timer) clearTimeout(gsproSwitchLock.timer);
  gsproSwitchLock = null;
}

function triggerGsproClubSwitch(targetClub) {
  if (!runtime.bridgeConnected) {
    return Promise.resolve({ ok: false, reason: 'bridge_offline', plan: null });
  }
  if (gsproSwitchLock) {
    return Promise.resolve({ ok: false, reason: 'switch_in_progress', plan: null });
  }
  const current = runtime.gsproClub;
  const plan = engine.planGsproClubSwitch(current, targetClub, runtime.calibration.bagClubs);
  if (!plan.key || plan.steps <= 0) {
    return Promise.resolve({ ok: false, reason: plan.reason || 'no_steps', plan });
  }

  const lock = { timer: null, target: plan.to };
  gsproSwitchLock = lock;
  let settled = false;
  const settle = (result) => {
    if (settled) return result; // timeout -> destroy() also fires 'error'; settle once
    settled = true;
    if (gsproSwitchLock === lock) {
      if (result.ok) {
        lock.timer = setTimeout(() => { if (gsproSwitchLock === lock) releaseGsproSwitchLock(); }, GSPRO_SWITCH_SETTLE_MS);
      } else {
        releaseGsproSwitchLock();
      }
    }
    return result;
  };

  return new Promise((rawResolve) => {
    const resolve = (r) => rawResolve(settle(r));
    const body = JSON.stringify({
      club: targetClub,
      from_club: current,
      key: plan.key,
      steps: plan.steps,
    });
    const req = http.request(
      {
        hostname: SIMWATCH_HOST,
        port: runtime.settings.simwatchPort,
        path: '/api/gspro/club',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 2500,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, body: JSON.parse(data), plan });
          } catch {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, plan });
          }
        });
      }
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message, plan }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout', plan }); });
    req.write(body);
    req.end();
  });
}

function ingestRawShot(
  rawShot,
  { select = true, allowAutoSwitch = true, silent = false, isDemo = false, isPreviewSeed = false } = {}
) {
  if (!rawShot || typeof rawShot !== 'object') return null;
  if (!isDemo && !isPreviewSeed && (runtime.kidsMode || isQuarantinedKidsShot(rawShot))) return null;
  const stableTs = rawShot.ts || rawShot.timestamp || new Date().toISOString();
  const isDemoFlag = Boolean(isDemo || isPreviewSeed || rawShot.source === 'demo');
  const enrichedRaw = {
    ...rawShot,
    ts: stableTs,
    club: rawShot.club || (!isDemoFlag ? runtime.gsproClub : null) || null,
  };

  // Dedupe by timestamp + ball speed if re-fetched from /api/shots
  const probeSpeed = Number(
    (enrichedRaw.ball && enrichedRaw.ball.speed) ??
    enrichedRaw.ball_speed ??
    enrichedRaw.ballSpeed ??
    (enrichedRaw.BallData && enrichedRaw.BallData.Speed)
  );
  const existingIdx = runtime.shots.findIndex(
    (s) => s.ts === stableTs && Number.isFinite(probeSpeed) && Math.abs((s.metrics.ballSpeed ?? -999) - probeSpeed) < 0.05
  );
  const prev = existingIdx >= 0 ? runtime.shots[existingIdx] : null;
  if (prev && prev.confirmedClub && !enrichedRaw.confirmed_club) {
    enrichedRaw.confirmed_club = prev.confirmedClub;
  }

  const recentClubs = isDemoFlag
    ? []
    : runtime.shots
        .filter((s, i) => i !== existingIdx && !s.isDemo && !s.isPreviewSeed && !s.isPutt && s.activeClub && s.activeClub !== 'PT')
        .slice(0, 6)
        .map((s) => s.activeClub);

  const effectivePracticeMode = rawShot.practice_mode || (prev && prev.practiceMode) || runtime.settings.practiceMode;
  let analyzed = engine.analyzeShot(enrichedRaw, {
    calibration: runtime.calibration,
    tierId: runtime.settings.tierId,
    handedness: runtime.settings.handedness,
    altitudeFt: runtime.settings.altitudeFt,
    clubOverride: prev ? prev.confirmedClub : null,
    recentClubs,
    practiceMode: effectivePracticeMode,
    feelId: rawShot.feel_id ?? (prev ? prev.feelId : undefined) ?? runtime.settings.activeFeelId,
    drillId: rawShot.drill_id ?? (prev ? prev.drillId : undefined) ?? runtime.settings.activeDrillId,
    drills: runtime.drillsHub?.drills || [],
    matType: runtime.settings.studio?.matType || 'fiberbuilt',
  });
  if (!analyzed) return null;
  if (!isDemoFlag && !isPreviewSeed && swingDb) {
    try {
      const dbRow = typeof swingDb.getShotById === 'function'
        ? swingDb.getShotById(analyzed.id, { includeDeleted: true })
        : null;
      if (dbRow?.deleted || (typeof swingDb.isDeleted === 'function' && swingDb.isDeleted(analyzed.id))) {
        return null;
      }
      if (!prev && dbRow) {
        const dbConfirmed = dbRow.confirmed_club || null;
        const dbMode = rawShot.practice_mode || dbRow.practice_mode || effectivePracticeMode;
        const dbFeel = rawShot.feel_id ?? dbRow.feel_id ?? runtime.settings.activeFeelId;
        const dbDrill = rawShot.drill_id ?? dbRow.drill_id ?? runtime.settings.activeDrillId;
        if ((dbConfirmed && dbConfirmed !== analyzed.confirmedClub) || dbMode !== effectivePracticeMode) {
          const reanalyzed = engine.analyzeShot(
            { ...enrichedRaw, confirmed_club: dbConfirmed || enrichedRaw.confirmed_club },
            {
              calibration: runtime.calibration,
              tierId: runtime.settings.tierId,
              handedness: runtime.settings.handedness,
              altitudeFt: runtime.settings.altitudeFt,
              clubOverride: dbConfirmed,
              recentClubs,
              practiceMode: dbMode,
              feelId: dbFeel,
              drillId: dbDrill,
              drills: runtime.drillsHub?.drills || [],
              matType: runtime.settings.studio?.matType || 'fiberbuilt',
            }
          );
          if (reanalyzed) analyzed = reanalyzed;
        }
        if (dbConfirmed && !analyzed.confirmedClub) analyzed.confirmedClub = dbConfirmed;
        if (!analyzed.clipDtl && dbRow.clip_dtl) analyzed.clipDtl = dbRow.clip_dtl;
        if (!analyzed.clipFo && dbRow.clip_fo) analyzed.clipFo = dbRow.clip_fo;
        if (dbRow.is_goto) analyzed.isGoTo = true;
      }
    } catch {
      // ignore DB lookup error during ingestion
    }
  }

  analyzed.isDemo = prev ? Boolean(prev.isDemo) : isDemoFlag;
  analyzed.isPreviewSeed = prev ? Boolean(prev.isPreviewSeed) : Boolean(isPreviewSeed);
  analyzed.calibrationRecorded = prev ? Boolean(prev.calibrationRecorded) : false;
  if (prev) {
    if (!analyzed.clipDtl && prev.clipDtl) analyzed.clipDtl = prev.clipDtl;
    if (!analyzed.clipFo && prev.clipFo) analyzed.clipFo = prev.clipFo;
    if (prev.isGoTo) analyzed.isGoTo = true;
    if (prev.confirmedClub && !analyzed.confirmedClub) analyzed.confirmedClub = prev.confirmedClub;
    if (prev.practiceMode && !rawShot.practice_mode) analyzed.practiceMode = prev.practiceMode;
  }

  // Strip initial startup preview seed as soon as any real shot arrives
  if (!analyzed.isDemo && !analyzed.isPreviewSeed) {
    const hadSeedSelected = runtime.shots.some((s) => s.id === runtime.selectedShotId && s.isPreviewSeed);
    runtime.shots = runtime.shots.filter((s) => !s.isPreviewSeed);
    if (hadSeedSelected) runtime.selectedShotId = null;

    if (swingDb && !analyzed.isPutt && analyzed.activeClub !== 'PT') {
      try {
        swingDb.upsertShot(analyzed, {
          source: rawShot.source || 'live',
          clip: rawShot.clip || analyzed.clipDtl || null,
          clipDtl: analyzed.clipDtl || null,
          clipFo: analyzed.clipFo || null,
          isGoTo: Boolean(analyzed.isGoTo),
          feelId: analyzed.feelId,
          drillId: analyzed.drillId,
        });
      } catch (err) {
        console.warn('[ShotLab] Failed to upsert shot to SwingDatabase:', err.message);
      }
    }
  }

  const refreshIdx = runtime.shots.findIndex(
    (s) => s.ts === analyzed.ts && Math.abs((s.metrics.ballSpeed ?? -999) - analyzed.metrics.ballSpeed) < 0.05
  );
  if (refreshIdx >= 0) {
    runtime.shots[refreshIdx] = analyzed;
  } else {
    runtime.shots.unshift(analyzed);
  }
  runtime.shots.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  if (runtime.shots.length > 200) runtime.shots = runtime.shots.slice(0, 200);
  if (select) {
    runtime.selectedShotId = analyzed.id;
  }

  if (!silent) {
    notifyAll('shot');
  }

  if (allowAutoSwitch && !analyzed.isDemo && analyzed.shouldAutoSwitch) {
    triggerGsproClubSwitch(analyzed.clubDetection.predictedClub).then((res) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shotlab:autoswitch', {
          target: analyzed.clubDetection.predictedClub,
          confidence: analyzed.clubDetection.confidencePct,
          result: res,
        });
      }
    });
  }

  return analyzed;
}

function reanalyzeAllShots() {
  const prevSelectedId = runtime.selectedShotId;
  const chronological = [...runtime.shots].reverse();
  const recentRealClubs = []; // newest first
  const nextChronological = [];

  for (const s of chronological) {
    const isDemo = Boolean(s.isDemo);
    const isPreviewSeed = Boolean(s.isPreviewSeed);
    const recentClubs = (isDemo || isPreviewSeed) ? [] : recentRealClubs.slice(0, 6);
    const next = engine.analyzeShot(s.raw, {
      calibration: runtime.calibration,
      tierId: runtime.settings.tierId,
      handedness: runtime.settings.handedness,
      altitudeFt: runtime.settings.altitudeFt,
      clubOverride: s.confirmedClub,
      recentClubs,
      practiceMode: s.practiceMode || 'real',
      feelId: s.feelId,
      drillId: s.drillId,
      drills: runtime.drillsHub?.drills || [],
      matType: runtime.settings.studio?.matType || 'fiberbuilt',
    });
    if (!next) continue;
    next.isDemo = isDemo;
    next.isPreviewSeed = isPreviewSeed;
    next.calibrationRecorded = Boolean(s.calibrationRecorded);
    next.clipDtl = s.clipDtl || next.clipDtl || null;
    next.clipFo = s.clipFo || next.clipFo || null;
    if (s.isGoTo) next.isGoTo = true;
    nextChronological.push(next);
    if (!isDemo && !isPreviewSeed && next.activeClub) {
      recentRealClubs.unshift(next.activeClub);
      if (recentRealClubs.length > 6) recentRealClubs.pop();
    }
  }

  runtime.shots = nextChronological.reverse();
  if (prevSelectedId && runtime.shots.some((s) => s.id === prevSelectedId)) {
    runtime.selectedShotId = prevSelectedId;
  } else {
    runtime.selectedShotId = runtime.shots[0] ? runtime.shots[0].id : null;
  }
  notifyAll('state');
}

// --------------------------------------------------------------------------- SimWatch Bridge SSE client

let bridgeReq = null;
let bridgeRetryTimer = null;
const BRIDGE_IDLE_TIMEOUT_MS = 45000; // 3x SimWatch's 15s SSE heartbeat
let hasSyncedBridgeContext = false;
let bridgeWasKidsZone = false;

function fetchTodaysShotsFromBridge() {
  if (runtime.kidsMode) return;
  const req = http.get(
    {
      hostname: SIMWATCH_HOST,
      port: runtime.settings.simwatchPort,
      path: '/api/shots',
      timeout: 3000,
    },
    (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return;
      }
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const doc = JSON.parse(buf);
          const list = Array.isArray(doc.shots) ? doc.shots : [];
          for (const s of list.slice(-40)) {
            if (isQuarantinedKidsShot(s)) continue;
            ingestRawShot(s, { select: false, allowAutoSwitch: false, silent: true });
          }
          if (runtime.shots.length && !runtime.selectedShotId) {
            runtime.selectedShotId = runtime.shots[0].id;
          }
          notifyAll('state');
        } catch {
          // ignore malformed payload
        }
      });
    }
  );
  req.on('timeout', () => req.destroy());
  req.on('error', () => {});
}

function sanitizeHotkeys(list) {
  return list
    .filter((h) => h && typeof h === 'object' && typeof h.keys === 'string')
    .slice(0, 40)
    .map((h) => ({
      action: String(h.action || '').slice(0, 40),
      keys: String(h.keys).slice(0, 24),
      label: String(h.label || '').slice(0, 80),
      state: String(h.state || 'unknown').slice(0, 20),
    }));
}

// Re-read SimWatch's hotkeys (registration finishes after the bridge connects, and config can change).
function refreshHotkeysFromBridge() {
  if (!runtime.bridgeConnected) return Promise.resolve(runtime.hotkeys);
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: SIMWATCH_HOST, port: runtime.settings.simwatchPort, path: '/api/status', timeout: 1500 },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { if (buf.length < 262144) buf += c; });
        res.on('end', () => {
          try {
            const doc = JSON.parse(buf);
            if (Array.isArray(doc.hotkeys)) runtime.hotkeys = sanitizeHotkeys(doc.hotkeys);
          } catch {
            // keep the cached list
          }
          resolve(runtime.hotkeys);
        });
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(runtime.hotkeys));
  });
}

function handleBridgeDisconnect() {
  releaseGsproSwitchLock();
  runtime.bridgeConnected = false;
  runtime.bridgeSnifferOk = false;
  runtime.rigHealth = null;
  runtime.gsproClub = null;
  hasSyncedBridgeContext = false;
  bridgeWasKidsZone = false;
  if (!shuttingDown) {
    notifyAll('state');
    scheduleBridgeReconnect();
  }
}

function syncContextFromBridge(ctx, { allowClear = false } = {}) {
  if (!ctx || typeof ctx !== 'object') return false;
  if (ctx.session_id === 'kids_zone') return false;
  let changed = false;
  if ('feel_id' in ctx) {
    const nextFeel = sanitizeLocalFeelId(ctx.feel_id);
    if ((nextFeel || allowClear) && nextFeel !== runtime.settings.activeFeelId) {
      runtime.settings.activeFeelId = nextFeel;
      changed = true;
    }
  }
  if ('drill_id' in ctx) {
    const nextDrill = engine.sanitizeAdultDrillId(ctx.drill_id);
    if ((nextDrill || allowClear) && nextDrill !== runtime.settings.activeDrillId) {
      runtime.settings.activeDrillId = nextDrill;
      changed = true;
    }
  }
  if (changed) savePersistedState();
  return changed;
}

function connectToSimWatchBridge() {
  if (shuttingDown) return;
  if (bridgeRetryTimer) {
    clearTimeout(bridgeRetryTimer);
    bridgeRetryTimer = null;
  }
  if (bridgeReq) {
    try { bridgeReq.destroy(); } catch {}
    bridgeReq = null;
  }
  hasSyncedBridgeContext = false;
  bridgeWasKidsZone = false;

  // SimWatch writes an SSE heartbeat every 15s; if nothing arrives for 3 beats the socket is
  // half-open (bridge hung, sleep/resume, network stack reset) and we must reconnect ourselves.
  let idleTimer = null;
  const armIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.warn('[ShotLab] SimWatch bridge SSE idle for 45s, reconnecting');
      try { req.destroy(); } catch {}
      onDrop();
    }, BRIDGE_IDLE_TIMEOUT_MS);
  };
  // Ignore end/close/error from a request we've already replaced or torn down, so one disconnect
  // never schedules more than one reconnect or flips a newer healthy connection offline.
  const onDrop = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (bridgeReq !== req) return;
    bridgeReq = null;
    handleBridgeDisconnect();
  };

  const req = http.request(
    {
      hostname: SIMWATCH_HOST,
      port: runtime.settings.simwatchPort,
      path: '/api/events',
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    },
    (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        onDrop();
        return;
      }
      armIdleTimer();

      runtime.bridgeConnected = true;
      hasSyncedBridgeContext = false;
      bridgeWasKidsZone = false;
      notifyAll('state');
      fetchTodaysShotsFromBridge();

      let buffer = '';
      let currentEvent = 'message';
      let currentData = [];

      const applyAdultBridgeContext = (ctx, defaultAllowClear) => {
        if (!ctx || typeof ctx !== 'object') return;
        hasSyncedBridgeContext = true;
        if (ctx.session_id === 'kids_zone') {
          bridgeWasKidsZone = true;
          return;
        }
        if (bridgeWasKidsZone) {
          bridgeWasKidsZone = false;
          syncContextFromBridge(ctx, { allowClear: false });
          if (
            (runtime.settings.activeFeelId && !ctx.feel_id) ||
            (runtime.settings.activeDrillId && !ctx.drill_id)
          ) {
            pushContextToSimWatch({
              drillId: runtime.settings.activeDrillId || null,
              feelId: runtime.settings.activeFeelId || null,
            });
          }
          return;
        }
        syncContextFromBridge(ctx, { allowClear: defaultAllowClear });
      };

      const flushEvent = () => {
        const evt = currentEvent;
        currentEvent = 'message';
        if (!currentData.length) return;
        const payloadText = currentData.join('\n');
        currentData = [];
        try {
          const doc = JSON.parse(payloadText);
          if (evt === 'status') {
            runtime.bridgeSnifferOk = Boolean(doc.sniffer_ok);
            runtime.rigHealth = (doc.health && typeof doc.health === 'object') ? doc.health : null;
            if (Array.isArray(doc.hotkeys)) runtime.hotkeys = sanitizeHotkeys(doc.hotkeys);
            if ('current_club' in doc) {
              runtime.gsproClub = doc.current_club
                ? (engine.normalizeGsproClubCode(doc.current_club) || doc.current_club)
                : null;
            }
            if (runtime.kidsMode) {
              if (engine.shouldPushKidsContextOnStatus(true, doc.context)) {
                pushContextToSimWatch({ sessionId: 'kids_zone', drillId: 'kids-zone', feelId: null });
              }
            } else if (doc.context && typeof doc.context === 'object') {
              applyAdultBridgeContext(doc.context, hasSyncedBridgeContext);
            }
            notifyAll('state');
          } else if (evt === 'context') {
            if (!runtime.kidsMode) {
              const ctx = (doc && doc.context && typeof doc.context === 'object') ? doc.context : doc;
              applyAdultBridgeContext(ctx, true);
            }
            notifyAll('state');
          } else if (evt === 'clip') {
            if (runtime.kidsMode || isQuarantinedKidsShot(doc)) return;
            if (doc && doc.ts && doc.clip) {
              if (swingDb) {
                try {
                  swingDb.updateClipByTs(doc.ts, doc.clip);
                } catch {
                  // ignore DB update errors
                }
              }
              const { dtl, fo } = engine.deriveSiblingClips(doc.clip);
              for (const shot of runtime.shots) {
                if (shot.ts === doc.ts) {
                  if (dtl) shot.clipDtl = dtl;
                  if (fo) shot.clipFo = fo;
                  if (shot.raw && typeof shot.raw === 'object') {
                    shot.raw.clip = doc.clip;
                  }
                }
              }
              notifyAll('state');
            }
          } else if (evt === 'health') {
            runtime.rigHealth = (doc && typeof doc === 'object') ? doc : null;
            notifyAll('state');
          } else if (evt === 'club') {
            runtime.gsproClub = doc.club
              ? (engine.normalizeGsproClubCode(doc.club) || doc.club)
              : null;
            // Each I/K press makes GSPro report the club it passed through; only the target club means done.
            if (gsproSwitchLock && runtime.gsproClub === gsproSwitchLock.target) releaseGsproSwitchLock();
            notifyAll('state');
          } else if (evt === 'shot') {
            if (runtime.kidsMode || isQuarantinedKidsShot(doc)) {
              handleKidsShot(doc);
            } else {
              ingestRawShot(doc, { select: true, allowAutoSwitch: true });
            }
          }
        } catch {
          // ignore non-JSON comments/heartbeats
        }
      };

      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        armIdleTimer();
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line === '') {
            flushEvent();
          } else if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData.push(line.slice(5).trim());
          }
        }
      });

      res.on('end', onDrop);
      res.on('close', onDrop);
      res.on('error', onDrop);
    }
  );

  req.on('error', onDrop);
  req.end();
  bridgeReq = req;
}

function scheduleBridgeReconnect() {
  if (shuttingDown || bridgeRetryTimer) return;
  bridgeRetryTimer = setTimeout(() => {
    bridgeRetryTimer = null;
    connectToSimWatchBridge();
  }, 4000);
}

// --------------------------------------------------------------------------- Local OBS HTTP + SSE server

function serveStaticFile(res, baseDir, relPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const resolvedBase = path.resolve(baseDir);
  const fullPath = path.resolve(resolvedBase, decoded);
  const rel = path.relative(resolvedBase, fullPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const check = checkRealpathContainment(resolvedBase, fullPath);
  if (!check.ok) {
    res.writeHead(check.notFound ? 404 : 403);
    res.end(check.notFound ? 'Not Found' : 'Forbidden');
    return;
  }
  fs.readFile(check.realPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(check.realPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
}

function serveMediaFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }
  const rawParts = pathname.slice('/media/'.length).split('/').filter(Boolean);
  if (rawParts.length < 2 || rawParts.length > 3) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  const segments = [];
  for (const part of rawParts) {
    let dec;
    try {
      dec = decodeURIComponent(part);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    if (!dec || dec === '.' || dec === '..' || dec.includes('/') || dec.includes('\\')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    segments.push(dec);
  }

  const sessionDate = segments[0];
  if (!SESSION_DATE_RE.test(sessionDate)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (segments.length === 3 && !/^(DTL|FO)$/i.test(segments[1])) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const fileName = segments[segments.length - 1];
  const ext = path.extname(fileName).toLowerCase();
  const contentType = VIDEO_MIME_TYPES[ext];
  if (!contentType) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const resolvedBase = path.resolve(SESSIONS_DIR);
  const fullPath = path.resolve(resolvedBase, ...segments);
  const rel = path.relative(resolvedBase, fullPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const check = checkRealpathContainment(resolvedBase, fullPath);
  if (!check.ok) {
    res.writeHead(check.notFound ? 404 : 403);
    res.end(check.notFound ? 'Not Found' : 'Forbidden');
    return;
  }

  fs.stat(check.realPath, (err, stat) => {
    if (err || !stat || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const fileSize = stat.size;
    const rangeHeader = req.headers.range;

    // Ignore multi-range requests and fall through to 200 OK (RFC 9110 §14.2)
    if (rangeHeader && !String(rangeHeader).includes(',')) {
      const m = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
      if (!m || (m[1] === '' && m[2] === '') || fileSize === 0) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }
      let start;
      let end;
      if (m[1] === '' && m[2] !== '') {
        const suffix = Number.parseInt(m[2], 10);
        start = Math.max(0, fileSize - suffix);
        end = fileSize - 1;
      } else {
        start = m[1] ? Number.parseInt(m[1], 10) : 0;
        end = m[2] ? Math.min(Number.parseInt(m[2], 10), fileSize - 1) : fileSize - 1;
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= fileSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      const stream = fs.createReadStream(check.realPath, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        } else {
          res.destroy();
        }
      });
      res.on('close', () => {
        if (!stream.destroyed) stream.destroy();
      });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(check.realPath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      } else {
        res.destroy();
      }
    });
    res.on('close', () => {
      if (!stream.destroyed) stream.destroy();
    });
    stream.pipe(res);
  });
}

function startObsHttpServer() {
  const obsDir = path.join(__dirname, 'obs');
  const rendererDir = path.join(__dirname, 'renderer');

  obsServer = http.createServer((req, res) => {
    // DNS rebinding guard: allow only loopback Host headers matching our port (or empty)
    if (!isValidLoopbackHost(req.headers.host, runtime.settings.obsPort)) {
      res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Misdirected Request');
      return;
    }

    let urlObj;
    try {
      urlObj = new URL(req.url || '/', `http://127.0.0.1:${runtime.settings.obsPort}`);
    } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    const pathname = urlObj.pathname;

    // Restrict CORS to local loopback origins only (OBS Browser Source is same-origin on 127.0.0.1)
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/health') {
      // Liveness probe for SimWatch's ShotLab supervisor (and `simwatch.py doctor`).
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        app: 'shotlab',
        version: app.getVersion(),
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        bridgeConnected: runtime.bridgeConnected,
        snifferOk: runtime.bridgeSnifferOk,
        obsClients: sseClients.size,
        shots: runtime.shots.length,
      }));
      return;
    }

    if (pathname === '/api/state') {
      const obsPayload = buildObsPayload(getSnapshot());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(obsPayload));
      return;
    }

    if (pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      sseClients.add(res);
      const obsPayload = buildObsPayload(getSnapshot());
      res.write(`event: state\ndata: ${JSON.stringify(obsPayload)}\n\n`);

      const cleanup = () => {
        clearInterval(hb);
        sseClients.delete(res);
      };

      const hb = setInterval(() => {
        try {
          res.write(': heartbeat\n\n');
        } catch {
          cleanup();
        }
      }, 15000);

      req.on('close', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    if (pathname.startsWith('/media/')) {
      serveMediaFile(req, res, pathname);
      return;
    }

    if (pathname === '/' || pathname === '/obs' || pathname === '/obs/') {
      serveStaticFile(res, obsDir, 'overlay.html');
      return;
    }
    if (pathname.startsWith('/obs/')) {
      serveStaticFile(res, obsDir, pathname.slice(5));
      return;
    }
    if (pathname === '/svg.js') {
      serveStaticFile(res, rendererDir, 'svg.js');
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  obsServer.on('error', (err) => {
    runtime.obsServerError = `OBS server failed on :${runtime.settings.obsPort} (${err.code || err.message})`;
    console.warn(`[ShotLab] ${runtime.obsServerError}`);
    notifyAll('state');
  });

  obsServer.listen(runtime.settings.obsPort, '127.0.0.1', () => {
    runtime.obsServerError = null;
    console.log(`[ShotLab] OBS Browser Source server listening at http://127.0.0.1:${runtime.settings.obsPort}/obs/overlay.html`);
  });
}

// --------------------------------------------------------------------------- FSX CSV import & watch

function stopCsvWatcher() {
  if (runtime.csvDebounceTimer) {
    clearTimeout(runtime.csvDebounceTimer);
    runtime.csvDebounceTimer = null;
  }
  if (runtime.csvWatcher) {
    try { runtime.csvWatcher.close(); } catch {}
    runtime.csvWatcher = null;
  }
  runtime.watchedCsvPath = null;
  runtime.lastCsvSingleFingerprint = null;
}

function importFsxCsvFile(filePath, watch = false) {
  const text = fs.readFileSync(filePath, 'utf8');
  const parsed = engine.parseFsxCsv(text);
  for (const s of parsed) {
    ingestRawShot(s, { select: true, allowAutoSwitch: false, silent: true });
  }
  runtime.lastCsvLineCount = parsed.length;
  runtime.lastCsvSingleFingerprint = parsed.length === 1 ? JSON.stringify(parsed[0]) : null;
  notifyAll('state');

  if (watch) {
    stopCsvWatcher();
    runtime.watchedCsvPath = filePath;
    runtime.lastCsvSingleFingerprint = parsed.length === 1 ? JSON.stringify(parsed[0]) : null;
    const watchDir = path.dirname(filePath);
    const targetName = path.basename(filePath).toLowerCase();

    runtime.csvWatcher = fs.watch(watchDir, (_eventType, filename) => {
      if (filename && String(filename).toLowerCase() !== targetName) return;
      if (runtime.csvDebounceTimer) clearTimeout(runtime.csvDebounceTimer);
      runtime.csvDebounceTimer = setTimeout(() => {
        runtime.csvDebounceTimer = null;
        try {
          if (!fs.existsSync(filePath)) return;
          const fresh = engine.parseFsxCsv(fs.readFileSync(filePath, 'utf8'));
          if (fresh.length === 0) {
            runtime.lastCsvLineCount = 0;
            return;
          }
          if (fresh.length > runtime.lastCsvLineCount) {
            const added = fresh.slice(runtime.lastCsvLineCount);
            for (let i = 0; i < added.length; i += 1) {
              if (runtime.kidsMode) {
                handleKidsShot(added[i]);
              } else {
                ingestRawShot(added[i], {
                  select: true,
                  allowAutoSwitch: false,
                  silent: i < added.length - 1,
                });
              }
            }
          } else if (fresh.length === 1) {
            // FSX 2020 LastShot.csv overwrites with a single row every strike; fingerprint to avoid dupes
            const fp = JSON.stringify(fresh[0]);
            if (fp !== runtime.lastCsvSingleFingerprint) {
              runtime.lastCsvSingleFingerprint = fp;
              if (runtime.kidsMode) handleKidsShot(fresh[0]);
              else ingestRawShot(fresh[0], { select: true, allowAutoSwitch: false });
            }
          } else if (fresh.length < runtime.lastCsvLineCount) {
            // File was truncated / rotated into a new session
            const latest = fresh[fresh.length - 1];
            if (runtime.kidsMode) handleKidsShot(latest);
            else ingestRawShot(latest, { select: true, allowAutoSwitch: false });
          }
          runtime.lastCsvLineCount = fresh.length;
        } catch {
          // file may be mid-write
        }
      }, 300);
    });
    runtime.csvWatcher.on('error', (err) => {
      console.warn('[ShotLab] CSV watcher error:', err.message);
      stopCsvWatcher();
      notifyAll('state');
    });
    notifyAll('state');
  }
  return parsed.length;
}

// --------------------------------------------------------------------------- ShotLab v2 helpers

function findShotById(shotId) {
  if (!shotId || typeof shotId !== 'string') return null;
  const inMem = runtime.shots.find((s) => s.id === shotId);
  if (inMem) return inMem;
  if (!swingDb) return null;
  try {
    if (typeof swingDb.getShotById === 'function') {
      return swingDb.getShotById(shotId) || null;
    }
    if (typeof swingDb._queryShots === 'function') {
      const rows = swingDb._queryShots({ limit: 5000 });
      return rows.find((r) => r && r.id === shotId) || null;
    }
  } catch {
    return null;
  }
  return null;
}

function formatVideoCompareItem(item) {
  if (!item) return null;
  const isAnalyzed = Boolean(item.metrics && item.activeClub);
  const ts = item.ts || null;
  const sessionDate = item.session_date || (ts ? String(ts).slice(0, 10) : null);
  const clipDtl = isAnalyzed ? (item.clipDtl || null) : (item.clip_dtl || null);
  const clipFo = isAnalyzed ? (item.clipFo || null) : (item.clip_fo || null);
  return {
    id: item.id,
    ts,
    sessionDate,
    club: isAnalyzed ? item.activeClub : item.club,
    score: isAnalyzed ? (item.scorecard?.score ?? null) : (item.score ?? null),
    carryYds: isAnalyzed
      ? (item.metrics?.effectiveCarry ?? item.flight?.carryYds ?? null)
      : (item.carry_yds ?? null),
    ballSpeed: isAnalyzed ? (item.metrics?.ballSpeed ?? null) : (item.ball_speed ?? null),
    clubSpeed: isAnalyzed ? (item.metrics?.clubSpeed ?? null) : (item.club_speed ?? null),
    smash: isAnalyzed ? (item.metrics?.smash ?? null) : (item.smash ?? null),
    path: isAnalyzed ? (item.metrics?.path ?? null) : (item.path ?? null),
    aoa: isAnalyzed ? (item.metrics?.aoa ?? null) : (item.aoa ?? null),
    estShaftLean: isAnalyzed
      ? (item.delivery?.estShaftLean ?? item.metrics?.estShaftLean ?? null)
      : (item.est_shaft_lean ?? null),
    shotShape: isAnalyzed ? (item.shotShape?.name ?? null) : (item.shot_shape ?? null),
    deliveryName: isAnalyzed ? (item.delivery?.name ?? null) : (item.delivery_name ?? null),
    sgShot: isAnalyzed ? (item.strokesGained?.sg ?? null) : (item.sg_shot ?? null),
    isGoTo: isAnalyzed ? Boolean(item.isGoTo) : Boolean(item.is_goto),
    clipDtl,
    clipFo,
    dtlUrl: resolveClipMediaUrl(sessionDate, clipDtl),
    foUrl: resolveClipMediaUrl(sessionDate, clipFo),
  };
}

function clubToGoToCategory(clubCode) {
  const code = String(clubCode || '').toUpperCase();
  if (code === 'DR' || code === '3W' || code === '5W') return 'Driver';
  if (code === 'PW' || code === 'GW' || code === 'SW' || code === 'LW') return 'Wedge';
  return 'Iron';
}

function fmtSigned(v, digits = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;
}

function fmtVal(v, suffix = '', digits = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return `${digits === 0 ? Math.round(v) : v.toFixed(digits)}${suffix}`;
}

function buildCoachingDebriefMarkdown({ club = 'ALL', days = 30 } = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const snap = getSnapshot();
  const dbSummary = snap.dbSummary || { totalShots: 0, totalSessions: 0, clubsTracked: 0, firstDate: null, lastDate: null, clipsLinked: 0 };
  const ss = snap.sessionStats || { count: 0, avgScore: null, avgCarry: null, avgSmash: null, totalSg: null, avgSg: null };

  const patterns = swingDb
    ? swingDb.getClubPatterns({ club, mode: 'real', days })
    : engine.computeDispersionStats([], { club });
  const feelComparison = swingDb
    ? swingDb.getFeelComparison({ club, mode: 'real', days }).map((f) => ({
        ...f,
        label: f.feelId ? resolveFeelLabel(f.feelId) : f.label,
      }))
    : [];
  const bagDays = days === null ? null : Math.max(days, 180);
  const bagClubs = swingDb ? swingDb.getBagGapping({ mode: 'real', days: bagDays }) : [];

  const windowLabel = days === null ? '**All Time**' : `Last **${days} days**`;
  const emptyWindow = days === null ? 'all time' : `the last ${days} days`;

  const lines = [];
  lines.push(`# ShotLab Coaching Debrief — ${todayStr}`);
  lines.push('');
  lines.push(`- **Filter:** Club \`${club}\` · ${windowLabel} (Real-Ball shots)`);
  lines.push(`- **Profile:** Tier \`${snap.settings.tierId}\` · Handedness \`${snap.settings.handedness}\` · Mode \`${snap.settings.practiceMode}\` · Active Feel: ${resolveFeelLabel(snap.settings.activeFeelId) || 'None'}`);
  lines.push('');

  lines.push('## 1. Database & Current Session Summary');
  lines.push('');
  lines.push(`- **Swing DB:** ${dbSummary.totalShots} shots across ${dbSummary.totalSessions} session(s), ${dbSummary.clubsTracked} club(s) tracked, ${dbSummary.clipsLinked} video clip(s) linked (${dbSummary.firstDate || '—'} to ${dbSummary.lastDate || '—'})`);
  lines.push(`- **Live Session:** ${ss.count} shot(s) · Avg Score **${fmtVal(ss.avgScore, '', 0)}** · Avg Carry **${fmtVal(ss.avgCarry, ' yds', 1)}** · Avg Smash **${fmtVal(ss.avgSmash, '', 2)}** · Session SG **${fmtSigned(ss.totalSg, 2)}** (${fmtSigned(ss.avgSg, 2)}/shot)`);
  lines.push('');

  lines.push(`## 2. Strokes Gained, 2D Dispersion & DECADE Aim (${club})`);
  lines.push('');
  if (patterns && patterns.n > 0) {
    const e80 = patterns.ellipse80;
    const av = patterns.averages || {};
    lines.push(`- **Sample Size:** ${patterns.n} shots · Avg Score **${fmtVal(patterns.avgScore, '', 0)}** · Total SG **${fmtSigned(patterns.totalSg, 2)}** · Avg SG **${fmtSigned(patterns.avgSg, 2)}/shot**`);
    lines.push(`- **Carry / Offline:** Mean Carry **${fmtVal(patterns.meanCarry, ' yds', 1)}** (σ ${fmtVal(patterns.stdCarry, 'y', 1)}) · Mean Offline **${fmtSigned(patterns.meanOffline, 1)} yds** (σ ${fmtVal(patterns.stdOffline, 'y', 1)})`);
    if (e80) {
      lines.push(`- **80% Dispersion Cone:** **${e80.widthYds}y wide × ${e80.depthYds}y deep**`);
    }
    lines.push(`- **Key Averages:** Ball Speed ${fmtVal(av.ballSpeed, ' mph', 1)} · Club Speed ${fmtVal(av.clubSpeed, ' mph', 1)} · Smash ${fmtVal(av.smash, '', 2)} · VLA ${fmtVal(av.vla, '°', 1)} · Backspin ${fmtVal(av.backSpin, ' rpm', 0)} · Path ${fmtSigned(av.path, 1)}° · AoA ${fmtSigned(av.aoa, 1)}° · Est. Shaft Lean ${fmtVal(av.estShaftLean, '°', 1)}`);
    lines.push(`- **DECADE Aim Advice:** ${patterns.decadeAdvice}`);
  } else {
    lines.push(`_No real-ball shots recorded in ${emptyWindow} for \`${club}\`._`);
  }
  lines.push('');

  lines.push('## 3. Root-Cause Delivery Fault Leaks');
  lines.push('');
  if (patterns && Array.isArray(patterns.faultLeaks) && patterns.faultLeaks.length) {
    lines.push('| Delivery Pattern | Count | Share | Total SG | Avg SG | Avg Lost Carry |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const f of patterns.faultLeaks) {
      lines.push(`| ${f.deliveryName} | ${f.count} | ${f.pct}% | ${fmtSigned(f.totalSg, 2)} | ${fmtSigned(f.avgSg, 2)} | ${fmtVal(f.avgLostYds, ' yds', 1)} |`);
    }
  } else {
    lines.push('_Not enough delivery data yet._');
  }
  lines.push('');

  lines.push('## 4. Active Feel A/B Verdicts');
  lines.push('');
  if (feelComparison.length) {
    lines.push('| Feel | Shots | Avg Score | Avg SG | Avg Smash | Avg Carry | 80% Width | Fault % |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const f of feelComparison) {
      lines.push(`| ${f.label} | ${f.n} | ${fmtVal(f.avgScore, '', 0)} | ${fmtSigned(f.avgSg, 2)} | ${fmtVal(f.avgSmash, '', 2)} | ${fmtVal(f.avgCarry, 'y', 1)} | ${fmtVal(f.width80Yds, 'y', 1)} | ${f.faultPct}% |`);
    }
  } else {
    lines.push('_Tag shots with an Active Feel to unlock head-to-head feel verdicts._');
  }
  lines.push('');

  lines.push('## 5. Bag Gapping & Stopping Power');
  lines.push('');
  const populated = bagClubs.filter((c) => c.n > 0);
  if (populated.length) {
    const alerts = populated.filter((c) => c.gapAlert);
    if (alerts.length) {
      lines.push('**Gapping Alerts:**');
      for (const a of alerts) {
        lines.push(`- **${a.club} (${a.label}):** ${a.gapAlert}`);
      }
      lines.push('');
    }
    lines.push('| Club | Shots | Carry | Total | Gap to Next | Descent | Stopping Power | 80% Width | Avg SG |');
    lines.push('|---|---:|---:|---:|---:|---:|---|---:|---:|');
    for (const c of populated) {
      lines.push(`| ${c.club} | ${c.n} | ${fmtVal(c.avgCarry, 'y', 1)} | ${fmtVal(c.avgTotal, 'y', 1)} | ${c.gapToNextYds !== null ? `${c.gapToNextYds}y` : '—'} | ${fmtVal(c.avgDescent, '°', 1)} | ${c.stoppingPower} | ${fmtVal(c.width80Yds, 'y', 1)} | ${fmtSigned(c.avgSg, 2)} |`);
    }
  } else {
    lines.push('_No club gapping data recorded yet._');
  }
  lines.push('');

  const flowLogs = Array.isArray(snap.settings?.studio?.flowLogs) ? snap.settings.studio.flowLogs : [];
  if (flowLogs.length) {
    const primed = flowLogs.filter((l) => l.warmupDone);
    const cold = flowLogs.filter((l) => !l.warmupDone);
    const avgOf = (arr, k, d = 1, signed = false) => {
      const vals = arr.map((x) => x[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));
      if (!vals.length) return '—';
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const numStr = d === 0 ? String(Math.round(m)) : m.toFixed(d);
      return signed && m > 0 ? `+${numStr}` : numStr;
    };
    const warmRate = Math.round((primed.length / flowLogs.length) * 100);
    lines.push('## 6. Mental Readiness & Flow Summary');
    lines.push('');
    lines.push(`- **Check-Ins Logged:** ${flowLogs.length} · **Mind Warmup Completion:** ${warmRate}% (${primed.length}/${flowLogs.length}) · **Avg Flow:** ${avgOf(flowLogs, 'flowRating', 1)}/5 · **Avg Process:** ${avgOf(flowLogs, 'processRating', 1)}/5`);
    if (primed.length && cold.length) {
      lines.push(`- **Warmed-Up vs. Cold:** Primed Avg Score **${avgOf(primed, 'avgScore', 0)}** (Avg SG ${avgOf(primed, 'avgSg', 2, true)}) vs. Cold Avg Score **${avgOf(cold, 'avgScore', 0)}** (Avg SG ${avgOf(cold, 'avgSg', 2, true)})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --------------------------------------------------------------------------- IPC handlers

function setupIpc() {
  ipcMain.handle('shotlab:get-state', () => getSnapshot());

  ipcMain.handle('shotlab:select-shot', (_e, shotId) => {
    if (typeof shotId !== 'string') return false;
    runtime.selectedShotId = shotId;
    notifyAll('state');
    return true;
  });

  ipcMain.handle('shotlab:clear-session', () => {
    runtime.shots = [];
    runtime.selectedShotId = null;
    notifyAll('state');
    return getSnapshot();
  });

  ipcMain.handle('shotlab:fire-demo', (_e, archetypeId) => {
    runtime.demoCounter += 1;
    const raw = makeDemoShot(archetypeId || null, runtime.demoCounter, true);
    return ingestRawShot(raw, { select: true, allowAutoSwitch: false, isDemo: true });
  });

  ipcMain.handle('shotlab:confirm-club', (_e, payload = {}) => {
    const { shotId, actualClub } = payload || {};
    const idx = runtime.shots.findIndex((s) => s.id === shotId);
    if (idx < 0) return { ok: false, reason: 'shot_not_found' };
    const shot = runtime.shots[idx];
    const normClub = engine.normalizeClubCode(actualClub);
    if (!normClub) return { ok: false, reason: 'invalid_club' };

    // Prevent double-counting if user clicks Confirm repeatedly on the same shot
    if (shot.confirmedClub === normClub) {
      return {
        ok: true,
        alreadyConfirmed: true,
        isDemoPreview: Boolean(shot.isDemo || shot.isPreviewSeed),
        calibrationStats: engine.getCalibrationStats(runtime.calibration),
      };
    }

    const isDemoShot = Boolean(shot.isDemo || shot.isPreviewSeed);
    let recordedNow = false;
    // Never pollute personal calibration with synthetic demo shots, and never double-record a re-edited shot
    if (!isDemoShot && !shot.calibrationRecorded) {
      runtime.calibration = engine.recordConfirmation(
        runtime.calibration,
        shot.raw,
        normClub,
        shot.clubDetection
      );
      savePersistedState();
      recordedNow = true;
    }

    // Re-analyze this shot with the confirmed club so all R/Y/G targets, dynamic loft, and miss-hit math match!
    const recentClubs = isDemoShot
      ? []
      : runtime.shots
          .slice(idx + 1)
          .filter((s) => !s.isDemo && !s.isPreviewSeed && s.activeClub)
          .slice(0, 6)
          .map((s) => s.activeClub);
    const updatedRaw = { ...shot.raw, confirmed_club: normClub };
    const reanalyzed = engine.analyzeShot(updatedRaw, {
      calibration: runtime.calibration,
      tierId: runtime.settings.tierId,
      handedness: runtime.settings.handedness,
      altitudeFt: runtime.settings.altitudeFt,
      clubOverride: normClub,
      recentClubs,
      practiceMode: shot.practiceMode || 'real',
      feelId: shot.feelId,
      drillId: shot.drillId,
      drills: runtime.drillsHub?.drills || [],
      matType: runtime.settings.studio?.matType || 'fiberbuilt',
    });
    if (reanalyzed) {
      reanalyzed.isDemo = Boolean(shot.isDemo);
      reanalyzed.isPreviewSeed = Boolean(shot.isPreviewSeed);
      reanalyzed.calibrationRecorded = Boolean(shot.calibrationRecorded || recordedNow);
      reanalyzed.clipDtl = shot.clipDtl || reanalyzed.clipDtl || null;
      reanalyzed.clipFo = shot.clipFo || reanalyzed.clipFo || null;
      if (shot.isGoTo) reanalyzed.isGoTo = true;
      runtime.shots[idx] = reanalyzed;
      runtime.selectedShotId = reanalyzed.id;

      if (!isDemoShot && swingDb) {
        try {
          swingDb.upsertShot(reanalyzed, {
            clip: reanalyzed.clipDtl,
            clipDtl: reanalyzed.clipDtl,
            clipFo: reanalyzed.clipFo,
            isGoTo: Boolean(reanalyzed.isGoTo),
            feelId: reanalyzed.feelId,
            drillId: reanalyzed.drillId,
          });
        } catch (err) {
          console.warn('[ShotLab] Failed to update confirmed shot in SwingDatabase:', err.message);
        }
      }
    }
    notifyAll('state');
    return {
      ok: true,
      isDemoPreview: isDemoShot,
      updatedOnly: !isDemoShot && Boolean(shot.calibrationRecorded),
      calibrationStats: engine.getCalibrationStats(runtime.calibration),
    };
  });

  ipcMain.handle('shotlab:update-settings', (_e, patch) => {
    if (patch && typeof patch === 'object') {
      let needsReanalyze = false;
      const contextPatch = {};
      if (typeof patch.tierId === 'string' && Object.hasOwn(engine.BENCHMARK_TIERS, patch.tierId) && patch.tierId !== runtime.settings.tierId) {
        runtime.settings.tierId = patch.tierId;
        needsReanalyze = true;
      }
      if ((patch.handedness === 'RH' || patch.handedness === 'LH') && patch.handedness !== runtime.settings.handedness) {
        runtime.settings.handedness = patch.handedness;
        needsReanalyze = true;
      }
      if (typeof patch.altitudeFt === 'number' && Number.isFinite(patch.altitudeFt)) {
        const nextAlt = Math.max(0, Math.min(10000, patch.altitudeFt));
        if (nextAlt !== runtime.settings.altitudeFt) {
          runtime.settings.altitudeFt = nextAlt;
          needsReanalyze = true;
        }
      }
      if (typeof patch.obsAutoHideSec === 'number' && Number.isFinite(patch.obsAutoHideSec)) {
        runtime.settings.obsAutoHideSec = Math.max(0, Math.min(300, Math.round(patch.obsAutoHideSec)));
      }
      if (typeof patch.audioCaddie === 'boolean') {
        runtime.settings.audioCaddie = patch.audioCaddie;
      }
      if (typeof patch.audioChimes === 'boolean') {
        runtime.settings.audioChimes = patch.audioChimes;
      }
      if (typeof patch.tempoPreset === 'string' && VALID_TEMPO_PRESETS.has(patch.tempoPreset.trim())) {
        runtime.settings.tempoPreset = patch.tempoPreset.trim();
      }
      if (typeof patch.tempoSound === 'string' && VALID_TEMPO_SOUNDS.has(patch.tempoSound.trim())) {
        runtime.settings.tempoSound = patch.tempoSound.trim();
      }
      if (patch.tempoGapSec !== undefined && patch.tempoGapSec !== null && Number.isFinite(Number(patch.tempoGapSec))) {
        runtime.settings.tempoGapSec = sanitizeTempoGap(patch.tempoGapSec);
      }
      if (Array.isArray(patch.refLines)) {
        runtime.settings.refLines = sanitizeRefLines(patch.refLines);
      }
      if (typeof patch.practiceMode === 'string' && VALID_PRACTICE_MODES.has(patch.practiceMode)) {
        runtime.settings.practiceMode = patch.practiceMode;
      }
      if ('activeFeelId' in patch) {
        runtime.settings.activeFeelId = sanitizeLocalFeelId(patch.activeFeelId);
        contextPatch.feelId = runtime.settings.activeFeelId;
      }
      if ('activeDrillId' in patch) {
        runtime.settings.activeDrillId = engine.sanitizeAdultDrillId(patch.activeDrillId);
        contextPatch.drillId = runtime.settings.activeDrillId;
      }
      if (typeof patch.driverSpeedMph === 'number' && Number.isFinite(patch.driverSpeedMph) && patch.driverSpeedMph >= 60 && patch.driverSpeedMph <= 140) {
        if (patch.driverSpeedMph !== runtime.calibration.driverSpeedMph) {
          runtime.calibration.driverSpeedMph = patch.driverSpeedMph;
          needsReanalyze = true;
        }
      }
      if (patch.autoSwitch && typeof patch.autoSwitch === 'object') {
        const nextAuto = { ...runtime.calibration.autoSwitch };
        if (typeof patch.autoSwitch.enabled === 'boolean') {
          nextAuto.enabled = patch.autoSwitch.enabled;
        }
        if (typeof patch.autoSwitch.minConfidence === 'number' && Number.isFinite(patch.autoSwitch.minConfidence)) {
          nextAuto.minConfidence = Math.max(0.7, Math.min(0.99, patch.autoSwitch.minConfidence));
        }
        runtime.calibration.autoSwitch = nextAuto;
      }
      if (patch.customLofts && typeof patch.customLofts === 'object') {
        const prevLofts = runtime.calibration.customLofts || {};
        const nextLofts = { ...prevLofts };
        for (const [club, val] of Object.entries(patch.customLofts)) {
          if (!Object.hasOwn(engine.CLUB_SPECS, club)) continue;
          if (val === null || val === '' || val === undefined) {
            delete nextLofts[club];
          } else {
            const num = Number(val);
            if (Number.isFinite(num) && num >= 5 && num <= 70) {
              nextLofts[club] = Number(num.toFixed(1));
            }
          }
        }
        const prevKeys = Object.keys(prevLofts);
        const nextKeys = Object.keys(nextLofts);
        const loftsChanged =
          prevKeys.length !== nextKeys.length ||
          nextKeys.some((k) => prevLofts[k] !== nextLofts[k]);
        if (loftsChanged) {
          runtime.calibration.customLofts = nextLofts;
          needsReanalyze = true;
        }
      }
      savePersistedState();
      if (!runtime.kidsMode && Object.keys(contextPatch).length > 0) {
        void pushContextToSimWatch(contextPatch);
      }
      if (needsReanalyze) {
        reanalyzeAllShots();
      } else {
        notifyAll('state');
      }
    }
    return getSnapshot();
  });

  ipcMain.handle('shotlab:set-practice-context', (_e, payload = {}) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const contextPatch = {};
    if (typeof p.practiceMode === 'string' && VALID_PRACTICE_MODES.has(p.practiceMode)) {
      runtime.settings.practiceMode = p.practiceMode;
    }
    if ('activeFeelId' in p) {
      runtime.settings.activeFeelId = sanitizeLocalFeelId(p.activeFeelId);
      contextPatch.feelId = runtime.settings.activeFeelId;
    }
    if ('activeDrillId' in p) {
      runtime.settings.activeDrillId = engine.sanitizeAdultDrillId(p.activeDrillId);
      contextPatch.drillId = runtime.settings.activeDrillId;
    }
    savePersistedState();
    if (!runtime.kidsMode && Object.keys(contextPatch).length > 0) {
      void pushContextToSimWatch(contextPatch);
    }
    notifyAll('state');
    return getSnapshot();
  });

  const normalizeFilterClub = (rawClub) => {
    if (typeof rawClub !== 'string' || !rawClub.trim()) return 'ALL';
    const trimmed = rawClub.trim();
    if (trimmed.toUpperCase() === 'ALL') return 'ALL';
    return engine.normalizeClubCode(trimmed) || trimmed.toUpperCase();
  };

  ipcMain.handle('shotlab:get-patterns', (_e, opts = {}) => {
    const club = normalizeFilterClub(opts && opts.club);
    const mode = (opts && typeof opts.mode === 'string' && opts.mode.trim()) ? opts.mode.trim() : 'real';
    const rawDays = opts && opts.days !== undefined ? Number(opts.days) : 90;
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : null;

    if (!swingDb) {
      return {
        summary: null,
        patterns: { club, mode, days, ...engine.computeDispersionStats([], { club }), averages: {} },
        feelComparison: [],
        trends: [],
        fatigue: [],
      };
    }

    try {
      const summary = swingDb.getSummary();
      const patterns = swingDb.getClubPatterns({ club, mode, days });
      const feelComparison = swingDb.getFeelComparison({ club, mode, days }).map((f) => ({
        ...f,
        label: f.feelId ? resolveFeelLabel(f.feelId) : f.label,
      }));
      const trends = swingDb.getSessionTrends({ club, mode, days, limit: 30 });
      const fatigue = swingDb.getFatigueCurve({ mode, days });
      return { summary, patterns, feelComparison, trends, fatigue };
    } catch (err) {
      console.warn('[ShotLab] get-patterns failed:', err.message);
      return {
        summary: null,
        patterns: { club, mode, days, ...engine.computeDispersionStats([], { club }), averages: {} },
        feelComparison: [],
        trends: [],
        fatigue: [],
      };
    }
  });

  ipcMain.handle('shotlab:get-bag-gapping', (_e, opts = {}) => {
    const mode = (opts && typeof opts.mode === 'string' && opts.mode.trim()) ? opts.mode.trim() : 'real';
    const rawDays = opts && opts.days !== undefined ? Number(opts.days) : 180;
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : null;
    const quality = (opts && typeof opts.quality === 'string') ? opts.quality : 'all';
    const category = (opts && typeof opts.category === 'string') ? opts.category : 'all';
    const trimOutliers = Boolean(opts && opts.trimOutliers);
    if (!swingDb) {
      return { clubs: [], summary: null, deletedCount: 0 };
    }
    try {
      return {
        clubs: swingDb.getBagGapping({ mode, days, quality, category, trimOutliers }),
        summary: swingDb.getSummary(),
        deletedCount: swingDb.getDeletedCount(),
      };
    } catch (err) {
      console.warn('[ShotLab] get-bag-gapping failed:', err.message);
      return { clubs: [], summary: null, deletedCount: 0 };
    }
  });

  ipcMain.handle('shotlab:get-bag-shots', (_e, opts = {}) => {
    const club = normalizeFilterClub(opts && opts.club);
    const mode = (opts && typeof opts.mode === 'string' && opts.mode.trim()) ? opts.mode.trim() : 'real';
    const rawDays = opts && opts.days !== undefined ? Number(opts.days) : 90;
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : null;
    const quality = (opts && typeof opts.quality === 'string') ? opts.quality : 'all';
    const limit = Math.max(1, Math.min(500, Number(opts && opts.limit) || 120));
    if (!swingDb) return { shots: [], deletedCount: 0, globalDeletedCount: 0 };
    try {
      return {
        shots: swingDb.getClubShots({ club, mode, days, quality, limit }),
        deletedCount: swingDb.getDeletedCount({ club }),
        globalDeletedCount: swingDb.getDeletedCount(),
      };
    } catch (err) {
      console.warn('[ShotLab] get-bag-shots failed:', err.message);
      return { shots: [], deletedCount: 0, globalDeletedCount: 0 };
    }
  });

  ipcMain.handle('shotlab:delete-shot', (_e, shotId) => {
    if (typeof shotId !== 'string' || !shotId.trim()) return { ok: false, deletedCount: 0 };
    const cleanId = shotId.trim();
    let dbDeleted = false;
    let deletedCount = 0;
    if (swingDb) {
      try {
        dbDeleted = swingDb.softDeleteShot(cleanId);
        deletedCount = swingDb.getDeletedCount();
      } catch (err) {
        console.warn('[ShotLab] delete-shot failed:', err.message);
      }
    }
    const prevLen = runtime.shots.length;
    runtime.shots = runtime.shots.filter((s) => s.id !== cleanId);
    const memRemoved = runtime.shots.length < prevLen;
    if (runtime.selectedShotId === cleanId) {
      runtime.selectedShotId = runtime.shots[0] ? runtime.shots[0].id : null;
    }
    notifyAll('state');
    return {
      ok: dbDeleted || memRemoved,
      deletedCount,
    };
  });

  ipcMain.handle('shotlab:restore-shots', (_e, opts = {}) => {
    const rawClub = opts && typeof opts.club === 'string' && opts.club.trim() ? opts.club.trim() : null;
    const club = rawClub ? normalizeFilterClub(rawClub) : null;
    let restored = 0;
    let deletedCount = 0;
    if (swingDb) {
      try {
        const filterClub = club === 'ALL' ? null : club;
        const todayStr = new Date().toISOString().slice(0, 10);
        const toRestoreToday = typeof swingDb.getDeletedShots === 'function'
          ? swingDb.getDeletedShots({ club: filterClub, sessionDate: todayStr })
          : [];
        restored = swingDb.restoreDeletedShots({ club: filterClub });
        deletedCount = swingDb.getDeletedCount();

        if (restored > 0 && toRestoreToday.length > 0) {
          let addedReal = false;
          for (const row of toRestoreToday) {
            if (!row || !row.id || runtime.shots.some((s) => s.id === row.id)) continue;
            let raw = null;
            if (row.raw_json) {
              try { raw = JSON.parse(row.raw_json); } catch { raw = null; }
            }
            if (!raw || typeof raw !== 'object') {
              raw = {
                ts: row.ts,
                club: row.club,
                clip: row.clip_dtl || row.clip_fo || null,
                feel_id: row.feel_id || null,
                drill_id: row.drill_id || null,
                source: row.source || 'live',
                ball: {
                  speed: row.ball_speed,
                  vla: row.vla,
                  hla: row.hla,
                  spin: row.back_spin ?? row.total_spin,
                  spin_axis: row.spin_axis,
                  carry: row.carry_yds,
                  total: row.total_yds,
                },
                club_data: row.club_speed != null ? { speed: row.club_speed, aoa: row.aoa, path: row.path } : undefined,
              };
            }
            const restoredAnalyzed = engine.analyzeShot(raw, {
              calibration: runtime.calibration,
              tierId: runtime.settings.tierId,
              handedness: runtime.settings.handedness,
              altitudeFt: runtime.settings.altitudeFt,
              clubOverride: row.confirmed_club || null,
              practiceMode: row.practice_mode || 'real',
              feelId: row.feel_id || null,
              drillId: row.drill_id || null,
              drills: runtime.drillsHub?.drills || [],
              matType: runtime.settings.studio?.matType || 'fiberbuilt',
            });
            if (!restoredAnalyzed) continue;
            if (row.confirmed_club && !restoredAnalyzed.confirmedClub) restoredAnalyzed.confirmedClub = row.confirmed_club;
            restoredAnalyzed.clipDtl = row.clip_dtl || restoredAnalyzed.clipDtl || null;
            restoredAnalyzed.clipFo = row.clip_fo || restoredAnalyzed.clipFo || null;
            if (row.is_goto) restoredAnalyzed.isGoTo = true;
            runtime.shots.push(restoredAnalyzed);
            addedReal = true;
          }
          if (addedReal) {
            runtime.shots = runtime.shots.filter((s) => !s.isPreviewSeed);
            runtime.shots.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
            if (runtime.shots.length > 200) runtime.shots = runtime.shots.slice(0, 200);
            if (!runtime.selectedShotId || !runtime.shots.some((s) => s.id === runtime.selectedShotId)) {
              runtime.selectedShotId = runtime.shots[0] ? runtime.shots[0].id : null;
            }
          }
        }
      } catch (err) {
        console.warn('[ShotLab] restore-shots failed:', err.message);
        return { ok: false, restored: 0, deletedCount: 0, error: err.message };
      }
    }
    notifyAll('state');
    return {
      ok: true,
      restored,
      deletedCount,
    };
  });

  ipcMain.handle('shotlab:get-review', (_e, opts = {}) => {
    const club = normalizeFilterClub(opts && opts.club);
    const mode = (opts && typeof opts.mode === 'string' && opts.mode.trim()) ? opts.mode.trim() : 'real';
    const rawDays = opts && opts.days !== undefined ? Number(opts.days) : 30;
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : null;
    if (!swingDb) {
      return {
        summary: null,
        patterns: { club, mode, days, ...engine.computeDispersionStats([], { club }), averages: {} },
        feelComparison: [],
        trends: [],
        fatigue: [],
        sgByCategory: [],
        highlights: [],
        heatmap: [],
      };
    }
    try {
      const summary = swingDb.getSummary();
      const patterns = swingDb.getClubPatterns({ club, mode, days });
      const feelComparison = swingDb.getFeelComparison({ club, mode, days }).map((f) => ({
        ...f,
        label: f.feelId ? resolveFeelLabel(f.feelId) : f.label,
      }));
      const trends = swingDb.getSessionTrends({ club, mode, days, limit: 45 });
      const fatigue = swingDb.getFatigueCurve({ mode, days });
      const sgByCategory = swingDb.getSgByCategory({ mode, days });
      const highlights = swingDb.getHighlights({ mode, days, limit: 12 }).map(formatVideoCompareItem).filter(Boolean);
      const heatmap = swingDb.getPracticeHeatmap({ days: 91 });
      return { summary, patterns, feelComparison, trends, fatigue, sgByCategory, highlights, heatmap };
    } catch (err) {
      console.warn('[ShotLab] get-review failed:', err.message);
      return {
        summary: null,
        patterns: { club, mode, days, ...engine.computeDispersionStats([], { club }), averages: {} },
        feelComparison: [],
        trends: [],
        fatigue: [],
        sgByCategory: [],
        highlights: [],
        heatmap: [],
      };
    }
  });

  ipcMain.handle('shotlab:get-plan', () => {
    if (!swingDb) {
      return {
        summary: null,
        heatmap: [],
        topLeaks: [],
        patterns30d: null,
        patternsPrior30d: null,
        studio: runtime.settings.studio,
      };
    }
    try {
      const summary = swingDb.getSummary();
      const heatmap = swingDb.getPracticeHeatmap({ days: 91 });
      const patterns30d = swingDb.getClubPatterns({ club: 'ALL', mode: 'real', days: 30 });
      const patterns90d = swingDb.getClubPatterns({ club: 'ALL', mode: 'real', days: 90 });
      const topLeaks = (patterns30d.faultLeaks || []).filter((l) => l.isFault !== false).slice(0, 4);
      return {
        summary,
        heatmap,
        topLeaks,
        patterns30d,
        patternsPrior30d: patterns90d,
        studio: runtime.settings.studio,
      };
    } catch (err) {
      console.warn('[ShotLab] get-plan failed:', err.message);
      return { summary: null, heatmap: [], topLeaks: [], patterns30d: null, patternsPrior30d: null, studio: runtime.settings.studio };
    }
  });

  ipcMain.handle('shotlab:update-studio-state', (_e, patch = {}) => {
    const prevMat = runtime.settings.studio?.matType || 'fiberbuilt';
    runtime.settings.studio = sanitizeStudioState(patch, runtime.settings.studio);
    savePersistedState();
    if (runtime.settings.studio.matType !== prevMat) {
      reanalyzeAllShots();
    } else {
      notifyAll('state');
    }
    return getSnapshot();
  });

  ipcMain.handle('shotlab:set-challenge-state', (_e, payload = null) => {
    runtime.challengeState = payload && typeof payload === 'object' && !Array.isArray(payload) ? {
      name: String(payload.name || 'Challenge').slice(0, 48),
      score: String(payload.score ?? '—').slice(0, 24),
      streak: Number.isFinite(Number(payload.streak)) ? Number(payload.streak) : 0,
      target: String(payload.target || '').slice(0, 48),
      status: String(payload.status || '').slice(0, 64),
    } : null;
    broadcastSse('state', buildObsPayload(getSnapshot()));
    return true;
  });

  ipcMain.handle('shotlab:get-video-compare', (_e, opts = {}) => {
    const shotId = (opts && typeof opts.shotId === 'string' && opts.shotId.trim()) ? opts.shotId.trim() : null;
    const requestedClub = normalizeFilterClub(opts && opts.club);

    let recentRows = [];
    if (swingDb) {
      try {
        recentRows = swingDb.getRecentShotsWithClips({
          club: requestedClub,
          limit: 30,
        });
      } catch (err) {
        console.warn('[ShotLab] get-video-compare recent query failed:', err.message);
      }
    }
    const recentWithClips = recentRows.map(formatVideoCompareItem).filter(Boolean);

    let current = null;
    if (shotId) {
      current = formatVideoCompareItem(findShotById(shotId));
    } else {
      const sel = runtime.shots.find((s) => s.id === runtime.selectedShotId) || runtime.shots[0] || null;
      if (sel && (requestedClub === 'ALL' || sel.activeClub === requestedClub)) {
        const formattedSel = formatVideoCompareItem(sel);
        if (formattedSel && (formattedSel.dtlUrl || formattedSel.foUrl)) {
          current = formattedSel;
        }
      }
      if (!current) {
        current = recentWithClips.find((c) => c.dtlUrl || c.foUrl) || recentWithClips[0] || null;
      }
    }

    const targetClub = current?.club || (requestedClub !== 'ALL' ? requestedClub : null);
    let bestRow = null;
    if (swingDb && targetClub) {
      try {
        bestRow = swingDb.getBestShotForClub(targetClub, {
          excludeId: current?.id || null,
          preferClip: true,
        });
      } catch (err) {
        console.warn('[ShotLab] get-video-compare best query failed:', err.message);
      }
    }

    return {
      current,
      best: formatVideoCompareItem(bestRow),
      recentWithClips,
    };
  });

  ipcMain.handle('shotlab:promote-goto', (_e, shotId) => {
    const shot = findShotById(shotId);
    if (!shot) {
      return { ok: false, copied: [], destDir: null, error: 'Shot not found.' };
    }

    const isAnalyzed = Boolean(shot.metrics && shot.activeClub);
    const rawClub = isAnalyzed ? shot.activeClub : shot.club;
    const safeClub = String(rawClub || '7I').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || '7I';
    const ts = shot.ts || null;
    const sessionDate = shot.session_date || (ts ? String(ts).slice(0, 10) : null);
    const clipDtl = isAnalyzed ? (shot.clipDtl || null) : (shot.clip_dtl || null);
    const clipFo = isAnalyzed ? (shot.clipFo || null) : (shot.clip_fo || null);

    const category = clubToGoToCategory(safeClub);
    const destDir = path.join(GOTO_DIR, category);

    const candidates = [
      { angle: 'DTL', clipName: clipDtl },
      { angle: 'FO', clipName: clipFo },
    ];
    const copied = [];

    try {
      for (const item of candidates) {
        const hit = resolveClipFileOnDisk(sessionDate, item.clipName);
        if (!hit) continue;
        fs.mkdirSync(destDir, { recursive: true });
        const destVideoName = `GoTo_${safeClub}_${item.angle}${hit.ext}`;
        const destVideoPath = path.join(destDir, destVideoName);
        fs.copyFileSync(hit.fullPath, destVideoPath);
        copied.push(destVideoPath);

        const srcKva = hit.fullPath.replace(/\.[^.]+$/, '.kva');
        if (srcKva !== hit.fullPath) {
          const kvaCheck = checkRealpathContainment(SESSIONS_DIR, srcKva);
          if (kvaCheck.ok && fs.statSync(kvaCheck.realPath).isFile()) {
            const destKvaPath = path.join(destDir, `GoTo_${safeClub}_${item.angle}.kva`);
            fs.copyFileSync(kvaCheck.realPath, destKvaPath);
            copied.push(destKvaPath);
          }
        }
      }
    } catch (err) {
      return { ok: false, copied, destDir, error: err.message };
    }

    if (copied.length === 0) {
      return {
        ok: false,
        copied: [],
        destDir,
        error: 'No Kinovea DTL/FO video clip found on disk for this shot.',
      };
    }

    if (swingDb) {
      try {
        swingDb.markGoTo(shot.id, true);
      } catch {
        // ignore DB mark errors
      }
    }
    const memShot = runtime.shots.find((s) => s.id === shot.id);
    if (memShot) memShot.isGoTo = true;
    notifyAll('state');

    return { ok: true, copied, destDir, error: null };
  });

  ipcMain.handle('shotlab:sync-history', () => {
    const res = syncHistoricalSessions();
    notifyAll('state');
    let dbSummary = null;
    if (swingDb) {
      try {
        dbSummary = swingDb.getSummary();
      } catch (err) {
        console.warn('[ShotLab] sync-history getSummary failed:', err.message);
      }
    }
    return {
      ok: !res.error,
      ...res,
      dbSummary,
    };
  });

  ipcMain.handle('shotlab:export-debrief', async (_e, opts = {}) => {
    const club = normalizeFilterClub(opts && opts.club);
    let days = 30;
    if (opts && opts.days !== undefined) {
      if (opts.days === null || opts.days === '' || Number(opts.days) <= 0) {
        days = null;
      } else {
        const rawDays = Number(opts.days);
        days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(3650, Math.round(rawDays)) : 30;
      }
    }

    const markdown = buildCoachingDebriefMarkdown({ club, days });
    const todayStr = new Date().toISOString().slice(0, 10);
    const parentWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const saveOpts = {
      title: 'Export ShotLab Coaching Debrief',
      defaultPath: `ShotLab_Debrief_${todayStr}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    };
    const res = parentWin
      ? await dialog.showSaveDialog(parentWin, saveOpts)
      : await dialog.showSaveDialog(saveOpts);
    if (res.canceled || !res.filePath) {
      return { ok: false, filePath: null, markdown, canceled: true };
    }
    try {
      fs.writeFileSync(res.filePath, markdown, 'utf8');
      return { ok: true, filePath: res.filePath, markdown, canceled: false };
    } catch (err) {
      return { ok: false, filePath: res.filePath, markdown, canceled: false, error: err.message };
    }
  });

  ipcMain.handle('shotlab:reset-calibration', () => {
    const prevSpeed = runtime.calibration.driverSpeedMph || 98;
    const prevLofts = { ...(runtime.calibration.customLofts || {}) };
    runtime.calibration = engine.createEmptyCalibration(prevSpeed);
    runtime.calibration.customLofts = prevLofts;
    for (const s of runtime.shots) {
      s.calibrationRecorded = false;
    }
    savePersistedState();
    reanalyzeAllShots();
    return getSnapshot();
  });

  ipcMain.handle('shotlab:switch-gspro-club', async (_e, targetClub) => {
    return triggerGsproClubSwitch(targetClub);
  });

  ipcMain.handle('shotlab:import-csv', async (_e, opts = {}) => {
    const watch = Boolean(opts && opts.watch);
    const parentWin = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const openOpts = {
      title: watch ? 'Watch FSX LastShot.csv / shots.csv' : 'Import FSX Pro / FSX 2020 CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    };
    const res = parentWin
      ? await dialog.showOpenDialog(parentWin, openOpts)
      : await dialog.showOpenDialog(openOpts);
    if (res.canceled || !res.filePaths.length) return { ok: false, count: 0 };
    try {
      const count = importFsxCsvFile(res.filePaths[0], watch);
      return { ok: true, count, path: res.filePaths[0] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shotlab:stop-csv-watch', () => {
    stopCsvWatcher();
    notifyAll('state');
    return true;
  });

  ipcMain.handle('shotlab:get-hotkeys', () => refreshHotkeysFromBridge());

  ipcMain.handle('shotlab:copy-text', (_e, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });

  ipcMain.handle('shotlab:set-kids-mode', (_e, enabled) => {
    const next = Boolean(enabled);
    runtime.kidsMode = next;
    if (next) {
      pushContextToSimWatch({ sessionId: 'kids_zone', drillId: 'kids-zone', feelId: null });
    } else {
      pushContextToSimWatch({
        sessionId: null,
        drillId: runtime.settings.activeDrillId || null,
        feelId: runtime.settings.activeFeelId || null,
      });
    }
    notifyAll('state');
    return {
      ok: true,
      kidsMode: runtime.kidsMode,
      kidsState: runtime.kidsState || defaultKidsState(),
    };
  });

  ipcMain.handle('shotlab:get-kids-state', () => runtime.kidsState || defaultKidsState());

  ipcMain.handle('shotlab:update-kids-state', (_e, patch) => {
    runtime.kidsState = sanitizeKidsState(patch, runtime.kidsState || defaultKidsState());
    saveKidsState();
    notifyAll('state');
    return runtime.kidsState;
  });

  ipcMain.handle('shotlab:fire-kids-hit', (_e, opts = {}) => {
    const tier = opts && opts.tier === 'super' ? 'super' : 'hit';
    const raw = {
      source: 'manual',
      tier,
      session_id: 'kids_zone',
      drill_id: 'kids-zone',
      ts: new Date().toISOString(),
    };
    return handleKidsShot(raw);
  });

  ipcMain.handle('shotlab:open-external', (_e, url) => {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname === '127.0.0.1') {
        shell.openExternal(parsed.toString());
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });
}

// --------------------------------------------------------------------------- Electron Window lifecycle

// Launched by the SimWatch watchdog mid-session: open behind GSPro instead of stealing focus.
const LAUNCHED_BY_SIMWATCH = process.env.SHOTLAB_LAUNCHED_BY === 'simwatch';

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, 'assets', iconFile);
  mainWindow = new BrowserWindow({
    show: !LAUNCHED_BY_SIMWATCH,
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 740,
    backgroundColor: '#07080b',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    title: 'ShotLab — Golf Launch Monitor Intelligence & OBS Studio Suite',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (ev) => {
    ev.preventDefault();
  });

  if (LAUNCHED_BY_SIMWATCH) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.showInactive();
    });
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // Seed one Tour Push Draw preview if no shots exist yet (replaced automatically when live shots arrive)
    if (runtime.shots.length === 0) {
      runtime.demoCounter += 1;
      const seed = makeDemoShot('tour_draw_driver', runtime.demoCounter, false);
      ingestRawShot(seed, { select: true, allowAutoSwitch: false, isDemo: true, isPreviewSeed: true });
    } else {
      notifyAll('state');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (runtime.kidsMode) {
      runtime.kidsMode = false;
      pushContextToSimWatch({
        sessionId: null,
        drillId: runtime.settings.activeDrillId || null,
        feelId: runtime.settings.activeFeelId || null,
      });
    }
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  if (typeof app.setAppUserModelId === 'function') {
    app.setAppUserModelId('com.simwatch.shotlab');
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadPersistedState();
    loadKidsState();
    try {
      swingDb = new engine.SwingDatabase(DB_PATH);
      syncHistoricalSessions();
    } catch (err) {
      console.warn('[ShotLab] Could not initialize SwingDatabase:', err.message);
      swingDb = null;
    }
    try {
      runtime.drillsHub = engine.loadDrillsHubData(REPO_ROOT);
    } catch (err) {
      console.warn('[ShotLab] Could not load Drills Hub data:', err.message);
      runtime.drillsHub = null;
    }
    setupIpc();
    startObsHttpServer();
    connectToSimWatchBridge();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  let quitCleanupDone = false;

  app.on('before-quit', (ev) => {
    if (runtime.kidsMode && !quitCleanupDone) {
      quitCleanupDone = true;
      ev.preventDefault();
      runtime.kidsMode = false;
      Promise.race([
        pushContextToSimWatch({
          sessionId: null,
          drillId: runtime.settings.activeDrillId || null,
          feelId: runtime.settings.activeFeelId || null,
        }),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]).finally(() => {
        app.quit();
      });
      return;
    }
    shuttingDown = true;
    stopCsvWatcher();
    if (bridgeRetryTimer) {
      clearTimeout(bridgeRetryTimer);
      bridgeRetryTimer = null;
    }
    if (bridgeReq) {
      try { bridgeReq.destroy(); } catch {}
      bridgeReq = null;
    }
    for (const res of [...sseClients]) {
      try { res.end(); } catch {}
      sseClients.delete(res);
    }
    if (obsServer) {
      try { obsServer.close(); } catch {}
      obsServer = null;
    }
    if (swingDb) {
      try { swingDb.close(); } catch {}
      swingDb = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
