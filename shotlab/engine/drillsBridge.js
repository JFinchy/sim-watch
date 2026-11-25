/**
 * ShotLab — Drills Hub Bridge (`drills/player_data.js` & `drills/drills_data.js`).
 *
 * Safely loads the user's Active Feels, Practice Modes (Real / Kids Asleep / Gym-Sore),
 * Driver Miss Dial, and 50+ Drills from the repo's `drills/` folder without external deps,
 * and maps ShotLab delivery faults & face strike misses to immediate drill recommendations.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Delivery fault / strike -> curated drill IDs from drills/drills_data.js
const FAULT_TO_DRILL_IDS = {
  flipping_floater: ['hackmotion-shaft-lean-impact', 'impact-bag-motorcycle', 'gate-towel-lowpoint'],
  early_cast: ['pump-and-drop-p5', 'nine-to-three-delivery', 'pocket-pause'],
  over_hold: ['hackmotion-motorcycle-p5-p6', 'hit-hard-stop-quick', 'p6-to-impact'],
  steep_chop: ['noodle-plane-gate', 'pump-and-drop-p5', 'step-through-pressure-shift'],
  steep_dig: ['noodle-plane-gate', 'pump-and-drop-p5', 'step-through-pressure-shift'],
  pop_up: ['driver-headcover-aoa', 'low-tee-driver-bridge', 'driver-startline-fairway-challenge'],
  low_hook_trap: ['driver-startline-fairway-challenge', 'narrow-stick-gate', 'lead-side-brace-reps'],
  hooded_trap: ['driver-startline-fairway-challenge', 'narrow-stick-gate', 'lead-side-brace-reps'],
  strike_toe: ['gate-towel-lowpoint', 'narrow-stick-gate', 'nine-to-three-delivery'],
  strike_heel: ['gate-towel-lowpoint', 'left-hip-clearance-rope', 'wall-glute-turn-p4'],
  strike_thin: ['gate-towel-lowpoint', 'step-through-pressure-shift', 'three-ball-ladder'],
  strike_fat: ['gate-towel-lowpoint', 'tee-behind-the-ball', 'step-through-pressure-shift'],
};

function evalWindowAssignment(code, propName, filename = 'data.js') {
  if (!code || typeof code !== 'string') return null;

  // Fast, zero-VM path: try extracting a pure JSON literal after `window.<PROP> =`
  const escapedProp = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignRe = new RegExp(`window\\.${escapedProp}\\s*=\\s*([\\s\\S]+?);?\\s*$`);
  const match = code.match(assignRe);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // Fall through to hardened VM for JS object literals or files with comments
    }
  }

  // Hardened VM fallback: null-prototype sandbox + codeGeneration disabled to block prototype escapes
  const ctx = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  });
  const source = `var window = Object.create(null);\n${code}\n;window[${JSON.stringify(propName)}];`;
  return vm.runInContext(source, ctx, { timeout: 500, filename }) || null;
}

function safeEvalBrowserDataFile(filePath, propName) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    return evalWindowAssignment(code, propName, path.basename(filePath));
  } catch (err) {
    console.warn(`[ShotLab] Could not parse ${path.basename(filePath)}:`, err.message);
    return null;
  }
}

function loadDrillsHubData(repoRoot) {
  const drillsDir = path.join(repoRoot, 'drills');
  const drillsData = safeEvalBrowserDataFile(path.join(drillsDir, 'drills_data.js'), 'DEFAULT_DRILLS_DATA');

  const personalPath = path.join(drillsDir, 'player_data.js');
  const examplePath = path.join(drillsDir, 'player_data.example.js');
  const hasPersonalProfile = fs.existsSync(personalPath);
  const playerData = safeEvalBrowserDataFile(hasPersonalProfile ? personalPath : examplePath, 'PLAYER_DATA');

  const modes = (drillsData && Array.isArray(drillsData.modes))
    ? drillsData.modes.map((m) => ({
        id: m.id,
        label: m.label,
        shortLabel: m.shortLabel || m.label,
        icon: m.icon || '',
        subtitle: m.subtitle || '',
      }))
    : [
        { id: 'real', label: 'Real Balls', shortLabel: 'Real Balls', icon: '', subtitle: 'Full Launch Monitor metrics' },
        { id: 'almost', label: 'Almost Golf Balls', shortLabel: 'Kids Asleep', icon: '', subtitle: 'Trust HLA & club data only' },
        { id: 'sore', label: 'Gym-Sore / Recovery', shortLabel: 'Gym-Sore', icon: '', subtitle: 'Tempo & light rehearsals' },
      ];

  const reverseFaultMap = new Map();
  for (const [faultKey, ids] of Object.entries(FAULT_TO_DRILL_IDS)) {
    for (const did of ids) {
      if (!reverseFaultMap.has(did)) reverseFaultMap.set(did, []);
      reverseFaultMap.get(did).push(faultKey);
    }
  }

  const drills = (drillsData && Array.isArray(drillsData.drills))
    ? drillsData.drills.map((d) => ({
        id: d.id,
        title: d.title,
        section: d.section || '',
        audience: d.audience || 'adult',
        isKidsZone: Boolean(
          d.audience === 'kids' ||
          String(d.id || '').startsWith('kids-') ||
          String(d.section || '').toLowerCase().includes('kids zone')
        ),
        swingPhase: d.swingPhase || '',
        duration: d.duration || '',
        reps: d.reps || '',
        pacing: d.pacing || 'either',
        days: Array.isArray(d.days) ? d.days : [],
        modePlans: d.modePlans || null,
        focus: d.focus || '',
        keyFeel: d.keyFeel || '',
        faultTags: Array.isArray(d.faultTags) ? d.faultTags : [],
        shotlabFaultIds: reverseFaultMap.get(d.id) || [],
        modes: Array.isArray(d.modes) ? d.modes : ['real'],
        clubs: d.clubs || 'all',
        video: d.video || null,
        why: d.why || '',
        instructions: Array.isArray(d.instructions) ? d.instructions : [],
      }))
    : [];

  const feels = (playerData && Array.isArray(playerData.feels))
    ? playerData.feels
        .filter((f) => f && f.status !== 'retired')
        .map((f) => ({
          id: f.id,
          name: f.name,
          cue: f.cue || '',
          club: f.club || 'all',
          status: f.status || 'candidate',
          intendedFlight: f.intendedFlight || '',
          failureMode: f.failureMode || '',
          drillIds: Array.isArray(f.drillIds) ? f.drillIds : [],
        }))
    : [];

  const driverDial = (playerData && playerData.profile && playerData.profile.driverDial) || null;
  const personalChecklist = (playerData && Array.isArray(playerData.personalChecklist))
    ? playerData.personalChecklist.slice(0, 6)
    : [];

  return {
    loaded: Boolean(drillsData || playerData),
    hasPersonalProfile,
    modes,
    drills,
    faultToDrillIds: FAULT_TO_DRILL_IDS,
    feels,
    driverDial,
    personalChecklist,
  };
}

function clubCategoryForCode(clubRaw) {
  if (!clubRaw) return null;
  const s = String(clubRaw).trim().toUpperCase();
  if (!s || s === 'ALL') return null;
  if (s === 'DR' || s.includes('DRIVER')) return 'driver';
  if (/^\d?W$/.test(s) || s.includes('WOOD')) return 'wood';
  if (/^\d?H$/.test(s) || s.includes('HYBRID')) return 'hybrid';
  if (['PW', 'GW', 'AW', 'SW', 'LW'].includes(s) || s.includes('WEDGE')) return 'wedge';
  if (s === 'PT' || s.includes('PUTT')) return 'putter';
  if (/^\dI$/.test(s) || s.includes('IRON')) return 'iron';
  return s.toLowerCase();
}

function scoreDrillClubMatch(drill, clubRaw) {
  const cat = clubCategoryForCode(clubRaw);
  if (!cat) return 1;
  const rawClubs = drill && drill.clubs;
  if (!rawClubs || rawClubs === 'all' || (Array.isArray(rawClubs) && rawClubs.length === 0)) {
    return 1;
  }
  const text = (Array.isArray(rawClubs) ? rawClubs.join(' ') : String(rawClubs)).toLowerCase();
  if (text.includes('all') || text.includes('no club') || text.includes('bodyweight')) {
    return 1;
  }
  const code = String(clubRaw).trim().toLowerCase();
  const numMatch = code.match(/^(\d)([iwh])$/);
  if (numMatch) {
    const [, digit, kind] = numMatch;
    const word = kind === 'i' ? 'iron' : kind === 'w' ? 'wood' : 'hybrid';
    if (text.includes(`${digit} ${word}`) || text.includes(`${digit}${kind}`)) return 3;
  }
  if (code === 'dr' && text.includes('driver')) return 3;
  if (['pw', 'gw', 'aw', 'sw', 'lw'].includes(code) && text.includes(code)) return 3;

  if (cat === 'driver' && text.includes('driver')) return 2;
  if (cat === 'wood' && (text.includes('wood') || text.includes('driver'))) return 2;
  if (cat === 'hybrid' && (text.includes('hybrid') || text.includes('wood') || text.includes('iron'))) return 2;
  if (cat === 'iron' && (text.includes('iron') || /\b[3-9]\s*i\b/.test(text))) return 2;
  if (cat === 'wedge' && (text.includes('wedge') || /\b(pw|gw|sw|lw)\b/.test(text) || text.includes('iron'))) return 2;
  if (cat === 'putter' && text.includes('putt')) return 2;
  return 0;
}

/**
 * Recommend matching Drills Hub drills when a delivery fault or strike miss repeats.
 */
function recommendDrillsForFault(faultKey, drills = [], { practiceMode = 'real', club = null, limit = 3 } = {}) {
  if (!faultKey || !Array.isArray(drills) || !drills.length) return [];
  const maxResults = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : 3;
  if (maxResults === 0) return [];

  const preferredIds = (typeof faultKey === 'string' && Object.hasOwn(FAULT_TO_DRILL_IDS, faultKey))
    ? FAULT_TO_DRILL_IDS[faultKey]
    : [];
  const byId = new Map(drills.filter((d) => d && !d.isKidsZone).map((d) => [d.id, d]));

  let picked = [];
  for (const id of preferredIds) {
    const d = byId.get(id);
    if (d && (!practiceMode || !d.modes || d.modes.includes(practiceMode) || practiceMode === 'real')) {
      picked.push(d);
    }
  }
  // Fallback: if practiceMode filtered everything out, return the base drills anyway
  if (!picked.length) {
    for (const id of preferredIds) {
      const d = byId.get(id);
      if (d) picked.push(d);
    }
  }

  // Rank/filter by club when specified (preserve preference order on ties)
  if (club && picked.length > 1) {
    const scored = picked.map((d, idx) => ({ d, idx, score: scoreDrillClubMatch(d, club) }));
    const hasMatch = scored.some((x) => x.score > 0);
    const pool = hasMatch ? scored.filter((x) => x.score > 0) : scored;
    pool.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
    picked = pool.map((x) => x.d);
  }

  return picked.slice(0, maxResults);
}

/**
 * Check the most recent shots for a 3-in-a-row repeating delivery fault.
 */
function detectFaultStreak(recentShots = [], drills = [], { practiceMode = 'real', club = null, limit = 3 } = {}) {
  const nonGood = new Set([
    'flipping_floater',
    'early_cast',
    'over_hold',
    'steep_chop',
    'steep_dig',
    'pop_up',
    'low_hook_trap',
    'hooded_trap',
  ]);
  if (!Array.isArray(recentShots) || recentShots.length < 2) return null;

  // Ball-flight estimates (club sticker not read) never start or extend a streak: a run of sticker misses
  // shouldn't raise a "repeating fault" alert built on assumed attack angles.
  const measured = (s) => Boolean(s && s.delivery && s.delivery.basis !== 'ball_only');
  const first = recentShots[0];
  const faultId = measured(first) ? first.delivery.id : null;
  if (!faultId || !nonGood.has(faultId)) return null;

  let streak = 0;
  for (const s of recentShots) {
    if (measured(s) && s.delivery.id === faultId) {
      streak += 1;
    } else {
      break;
    }
  }
  if (streak < 2) return null;

  const effectiveClub = club || (first && (first.activeClub || first.club)) || null;
  return {
    faultId,
    faultName: first.delivery.name,
    streak,
    urgent: streak >= 3,
    recommendedDrills: recommendDrillsForFault(faultId, drills, { practiceMode, club: effectiveClub, limit }),
  };
}

module.exports = {
  FAULT_TO_DRILL_IDS,
  evalWindowAssignment,
  loadDrillsHubData,
  recommendDrillsForFault,
  detectFaultStreak,
};
